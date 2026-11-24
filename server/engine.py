"""
Motor de sonido: arranca SuperCollider (con SuperDirt) y GHCi (con TidalCycles)
y envía el código de Tidal a GHCi.

Si no encuentra los programas, funciona en "modo simulación": acepta el código,
lo muestra en el registro, pero no suena nada. Así puedes probar la interfaz
antes de instalar todo.
"""
import collections
import glob
import os
import platform
import re
import shutil
import socket
import struct
import subprocess
import threading
import time

SYSTEM = platform.system()  # "Darwin", "Windows", "Linux"
HOME = os.path.expanduser("~")


def _first_existing(paths):
    for p in paths:
        for match in sorted(glob.glob(p), reverse=True):
            if os.path.isfile(match):
                return match
    return None


def find_ghci():
    env = os.environ.get("TIDAL_GHCI")
    if env and os.path.isfile(env):
        return env
    found = shutil.which("ghci")
    if found:
        return found
    if SYSTEM == "Windows":
        return _first_existing([
            r"C:\ghcup\bin\ghci.exe",
            os.path.join(HOME, "AppData", "Roaming", "ghcup", "bin", "ghci.exe"),
            r"C:\tools\ghc-*\bin\ghci.exe",          # instalaciones con Chocolatey
            r"C:\ProgramData\chocolatey\bin\ghci.exe",
        ])
    return _first_existing([
        os.path.join(HOME, ".ghcup", "bin", "ghci"),
        "/opt/homebrew/bin/ghci",
        "/usr/local/bin/ghci",
    ])


# SuperDirt: "no synth or module named 'superpiano' found" (con o sin comillas)
MISSING_RE = re.compile(r"no synth or module named ['\"]?([\w.-]+)")


def _osc_str(x):
    b = str(x).encode("utf-8") + b"\0"
    return b + b"\0" * (-len(b) % 4)


def osc_message(address, *args):
    """Mensaje OSC mínimo con argumentos de texto (no hace falta ninguna librería)."""
    return _osc_str(address) + _osc_str("," + "s" * len(args)) + b"".join(_osc_str(a) for a in args)

def _osc_read_str(data, i):
    end = data.index(b"\0", i)
    return data[i:end].decode("utf-8", "replace"), (end + 4) & ~3


def osc_parse(data):
    """Lee un mensaje OSC sencillo (i, f, d, s). Devuelve (dirección, [args]) o None."""
    try:
        if data.startswith(b"#bundle"):
            return None
        addr, i = _osc_read_str(data, 0)
        tags, i = _osc_read_str(data, i)
        args = []
        for t in tags[1:]:
            if t == "i":
                args.append(struct.unpack(">i", data[i:i + 4])[0]); i += 4
            elif t == "f":
                args.append(struct.unpack(">f", data[i:i + 4])[0]); i += 4
            elif t == "d":
                args.append(struct.unpack(">d", data[i:i + 8])[0]); i += 8
            elif t == "h":
                args.append(struct.unpack(">q", data[i:i + 8])[0]); i += 8
            elif t == "s":
                v, i = _osc_read_str(data, i); args.append(v)
            else:
                return None
        return addr, args
    except (ValueError, struct.error, IndexError):
        return None


EVENTS_PORT = 57140


def find_sclang():
    env = os.environ.get("TIDAL_SCLANG")
    if env and os.path.isfile(env):
        return env
    if SYSTEM == "Darwin":
        mac = _first_existing([
            "/Applications/SuperCollider.app/Contents/MacOS/sclang",
            "/Applications/SuperCollider/SuperCollider.app/Contents/MacOS/sclang",
            os.path.join(HOME, "Applications", "SuperCollider.app", "Contents", "MacOS", "sclang"),
        ])
        if mac:
            return mac
    found = shutil.which("sclang")
    if found:
        return found
    if SYSTEM == "Windows":
        return _first_existing([
            r"C:\Program Files\SuperCollider*\sclang.exe",
            r"C:\Program Files (x86)\SuperCollider*\sclang.exe",
        ])
    return _first_existing(["/usr/bin/sclang", "/usr/local/bin/sclang"])


# Líneas que continúan la instrucción anterior aunque empiecen sin sangría
_CONTINUATION = ("#", "$", "|", "+", "-", "*", ".", ")", "]", ",", "}", "<~", "~>", "{-")


def split_blocks(code):
    """Parte el código en instrucciones independientes para GHCi."""
    blocks, current = [], []
    for line in code.replace("\r\n", "\n").split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            if current and not stripped:
                blocks.append("\n".join(current))
                current = []
            continue
        starts_new = not line[:1].isspace() and not stripped.startswith(_CONTINUATION)
        if starts_new and current:
            blocks.append("\n".join(current))
            current = []
        current.append(line)
    if current:
        blocks.append("\n".join(current))
    return blocks


def utf8_env(env=None):
    """GHCi lee sus scripts con la codificación del sistema. Abierto desde Finder (app de Mac) o un
    servicio no hay LANG y es ASCII: un acento en BootTidal.hs cortaba el arranque y d1..d12 no existían."""
    env = dict(os.environ if env is None else env)
    if SYSTEM != "Windows":
        cur = env.get("LC_ALL") or env.get("LC_CTYPE") or env.get("LANG") or ""
        if "utf-8" not in cur.lower() and "utf8" not in cur.lower():
            env.pop("LC_ALL", None)
            env["LANG"] = env["LC_CTYPE"] = "en_US.UTF-8" if SYSTEM == "Darwin" else "C.UTF-8"
    return env


class Engine:
    def __init__(self, root):
        self.root = root
        self.log = collections.deque(maxlen=2000)
        self.counter = 0
        self.lock = threading.Lock()
        self.ghci = None
        self.sclang = None
        self.superdirt_ready = False
        self.sounds, self.missing, self.sounds_rev = set(), set(), 0
        # Sonidos descargados mientras SuperDirt arrancaba: se cargan en cuanto esté listo
        self.pending_reloads = {}
        self.osc_ready = False
        self.simulation = False
        self.starting = False
        # Notas que están sonando (las manda SuperDirt, ver start_superdirt.scd): para iluminar el código
        self.events = collections.deque(maxlen=600)
        self.event_seq = 0
        self._events_thread = None
        # Teclado MIDI: quién recibe los OSC /ts/midi… y qué hacer cuando SuperDirt está listo (midilive.MidiHub)
        self.midi_handler = None
        self.on_ready = []
        # Audio: qué salida usa SuperCollider, a qué frecuencia, qué salidas hay y si algo ha cambiado
        # (enchufar un piano USB o unos auriculares puede cambiar el audio del sistema). Ver audio_state().
        self.audio_out = ""            # salida elegida en Ajustes ("" = la del sistema)
        self.audio = self._audio_blank()
        self._stopping = False

    # ---------- notas que suenan ----------
    def start_event_listener(self):
        if self._events_thread:
            return
        def run():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.bind(("127.0.0.1", EVENTS_PORT))
            except OSError as e:
                self._add("studio", f"No puedo escuchar las notas de SuperDirt en el puerto {EVENTS_PORT}: {e}")
                return
            while True:
                try:
                    data, _ = sock.recvfrom(4096)
                except OSError:
                    continue
                msg = osc_parse(data)
                if msg and msg[0].startswith("/ts/midi") and self.midi_handler:
                    # Teclado MIDI (studio-midi.scd): ver midilive.py
                    try:
                        self.midi_handler(msg[0], msg[1])
                    except Exception as e:  # noqa: BLE001
                        self._add("studio", f"MIDI: {e}")
                    continue
                if not msg or msg[0] != "/ts/ev" or len(msg[1]) < 7:
                    continue
                orbit, cycle, delta, latency, snd, n, cps = msg[1][:7]
                if float(cycle) < 0:
                    continue  # notas del teclado MIDI tocadas en directo: no son de ninguna pista
                with self.lock:
                    self.event_seq += 1
                    self.events.append({"seq": self.event_seq, "at": time.time() + float(latency), "orbit": int(orbit),
                                        "cycle": float(cycle), "delta": float(delta), "s": str(snd), "n": float(n), "cps": float(cps)})
        self._events_thread = threading.Thread(target=run, daemon=True)
        self._events_thread.start()

    def song_clock(self, max_age=2.5):
        """(cps, momento, ciclo) de la última nota de la canción que ha sonado, si suena algo ahora.
        Sirve para que una toma del teclado MIDI empiece justo al principio de un ciclo de tu canción."""
        now = time.time()
        with self.lock:
            for e in reversed(self.events):
                if e["cps"] > 0 and e["cycle"] >= 0 and now - max_age <= e["at"] <= now + 1.0:
                    return e["cps"], e["at"], e["cycle"]
        return None

    def events_since(self, seq):
        with self.lock:
            evs = [e for e in self.events if e["seq"] > seq]
            return {"now": time.time(), "seq": self.event_seq, "events": evs[-200:]}

    # ---------- registro ----------
    def _add(self, source, line):
        with self.lock:
            self.counter += 1
            self.log.append((self.counter, source, line.rstrip()))

    def log_tail(self, n=200):
        with self.lock:
            return [f"[{s}] {l}" for _, s, l in list(self.log)[-n:]]

    def _since(self, idx):
        with self.lock:
            return [(s, l) for c, s, l in self.log if c > idx]

    def _pump(self, proc, source):
        for raw in iter(proc.stdout.readline, b""):
            line = raw.decode("utf-8", errors="replace")
            if source == "sc" and ("SuperDirt: listening" in line or "SuperDirt listo" in line):
                self.superdirt_ready = True
                if "SuperDirt listo" in line:
                    # Las órdenes por OSC (/tidalstudio) solo funcionan desde aquí: antes se perdían
                    self.osc_ready = True
                    self._flush_reloads()
                    for fn in list(self.on_ready):
                        try:
                            fn()
                        except Exception as e:  # noqa: BLE001
                            self._add("studio", f"{e}")
            if source == "sc" and self._audio_line(line):
                continue
            if source == "sc" and line.startswith("TIDAL_STUDIO_SOUNDS:"):
                with self.lock:
                    self.sounds = set(line.split(":", 1)[1].split())
                    self.missing -= self.sounds
                    self.sounds_rev += 1
                self._add(source, f"Tidal Studio: {len(self.sounds)} sonidos y sintes disponibles")
                continue
            m = MISSING_RE.search(line) if source == "sc" else None
            if m:
                with self.lock:
                    if m.group(1) not in self.missing:
                        self.missing.add(m.group(1)); self.sounds_rev += 1
            self._add(source, line)
        self._add("studio", f"{source} se ha cerrado (código {proc.poll()})")
        if source == "sc" and not self._stopping and proc is self.sclang:
            # SuperCollider se ha cerrado sin que lo paremos: el audio se ha perdido
            with self.lock:
                self.audio["problem"] = "sc-exit"
                self.audio["rev"] += 1
            self.superdirt_ready = False
            self.osc_ready = False

    # ---------- arranque ----------
    def status(self):
        return {
            "simulation": self.simulation,
            "starting": self.starting,
            "ghci_path": find_ghci(),
            "sclang_path": find_sclang(),
            "tidal_running": bool(self.ghci and self.ghci.poll() is None),
            "sc_running": bool(self.sclang and self.sclang.poll() is None),
            "superdirt_ready": self.superdirt_ready,
            "sounds_rev": self.sounds_rev,
        }

    def sound_list(self):
        """Sonidos que SuperDirt tiene cargados y los que ha dicho que no encuentra."""
        with self.lock:
            return {"sounds": sorted(self.sounds), "missing": sorted(self.missing), "rev": self.sounds_rev}

    def _popen(self, cmd, cwd, extra_env=None):
        kwargs = dict(stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                      stderr=subprocess.STDOUT, cwd=cwd, bufsize=0)
        if SYSTEM == "Windows":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        env = utf8_env()
        if SYSTEM == "Linux" and not env.get("DISPLAY") and not env.get("WAYLAND_DISPLAY"):
            env["QT_QPA_PLATFORM"] = "offscreen"
        env.update(extra_env or {})
        kwargs["env"] = env
        return subprocess.Popen(cmd, **kwargs)

    def start(self):
        if self.starting:
            return self.status()
        self.starting = True
        try:
            ghci, sclang = find_ghci(), find_sclang()
            if not sclang:
                self._add("studio", "No encuentro SuperCollider (sclang). Ejecuta el instalador.")
            elif not (self.sclang and self.sclang.poll() is None):
                script = os.path.join(self.root, "supercollider", "start_superdirt.scd")
                cmd = [sclang, script]
                # Instalador offline: SuperDirt viene en una carpeta propia, indicada con un sclang_conf.yaml
                conf = os.environ.get("TIDAL_SCLANG_CONF")
                if conf and os.path.isfile(conf):
                    cmd = [sclang, "-l", conf, script]
                # En Linux con PipeWire, SuperCollider necesita el puente JACK
                if SYSTEM == "Linux" and shutil.which("pw-jack") and not shutil.which("jackd"):
                    cmd = ["pw-jack"] + cmd
                self._add("studio", "Arrancando SuperCollider + SuperDirt…")
                self.superdirt_ready = False
                self.osc_ready = False
                with self.lock:
                    self.sounds, self.missing = set(), set()
                    self.sounds_rev += 1
                    rev = self.audio["rev"] + 1
                    self.audio = self._audio_blank()
                    self.audio["rev"] = rev
                self._stopping = False
                self.sclang = self._popen(cmd, os.path.dirname(sclang), {"TIDAL_SC_OUTDEVICE": self.audio_out or ""})
                threading.Thread(target=self._pump, args=(self.sclang, "sc"), daemon=True).start()

            if not ghci:
                self._add("studio", "No encuentro GHCi (Haskell/Tidal). Ejecuta el instalador.")
            elif not (self.ghci and self.ghci.poll() is None):
                boot = os.path.join(self.root, "tidal", "BootTidal.hs")
                self._add("studio", "Arrancando TidalCycles (GHCi)…")
                self.ghci = self._popen([ghci, "-ghci-script", boot], self.root)
                threading.Thread(target=self._pump, args=(self.ghci, "tidal"), daemon=True).start()

            self.simulation = not (ghci and sclang)
            if self.simulation:
                self._add("studio", "Modo simulación: el código se muestra pero no suena.")
            return self.status()
        finally:
            self.starting = False

    def sc_cmd(self, *args):
        """Manda una orden a sclang por OSC (/tidalstudio, ver start_superdirt.scd).
        sclang no lee órdenes por stdin cuando lo lanzamos así, por eso usamos OSC."""
        if not (self.sclang and self.sclang.poll() is None and self.osc_ready):
            return False
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.sendto(osc_message("/tidalstudio", *args), ("127.0.0.1", 57120))
            return True
        except Exception as e:
            self._add("studio", f"No pude hablar con SuperCollider: {e}")
            return False

    def reload_sample(self, folder, name):
        """Vuelve a cargar un sonido de la biblioteca sin reiniciar SuperDirt.
        Si SuperDirt está arrancando todavía, se apunta y se carga en cuanto esté listo
        (si no, un sonido descargado justo durante el arranque no se oía hasta reiniciar)."""
        ok = self.sc_cmd("reload", name, folder.replace("\\", "/"))
        if ok:
            self._add("studio", f"Cargando «{name}» en SuperDirt…")
            with self.lock:
                self.missing.discard(name)
                self.sounds_rev += 1
        elif self.sclang and self.sclang.poll() is None:
            with self.lock:
                self.pending_reloads[name] = folder
            self._add("studio", f"«{name}» se cargará en cuanto SuperDirt termine de arrancar")
        return ok

    def _flush_reloads(self):
        with self.lock:
            todo, self.pending_reloads = dict(self.pending_reloads), {}
        for name, folder in todo.items():
            self.reload_sample(folder, name)

    def free_sample(self, name):
        return self.sc_cmd("free", name)

    def record_start(self, path):
        p = path.replace("\\", "/").replace('"', "")
        return self.sc_cmd("record", p)

    def record_stop(self):
        return self.sc_cmd("stoprecord")

    def stop(self, only=("ghci", "sclang")):
        if "sclang" in only:
            self._stopping = True
        for name in only:
            proc = getattr(self, name)
            if proc and proc.poll() is None:
                try:
                    if name == "ghci":
                        proc.stdin.write(b"hush\n:quit\n")
                        proc.stdin.flush()
                    else:
                        proc.stdin.write(b"0.exit;\n\x0c")
                        proc.stdin.flush()
                    proc.wait(timeout=3)
                except Exception:
                    proc.kill()
            setattr(self, name, None)
        self.superdirt_ready = False
        self.osc_ready = False

    # ---------- audio: dispositivo de salida y recuperación ----------
    @staticmethod
    def _audio_blank():
        return {"out": "", "rate": 0, "inputs": None, "devices": [], "boot_devices": None,
                "problem": "", "added": [], "removed": [], "rev": 0}

    def _audio_line(self, line):
        """Lee las líneas TIDAL_STUDIO_AUDIO… de start_superdirt.scd y los avisos de audio de scsynth.
        Devuelve True si la línea era solo para nosotros (no va al registro)."""
        line = line.rstrip("\r\n")
        if line.startswith("TIDAL_STUDIO_AUDIO:"):
            parts = line.split(":", 1)[1].split("\t")
            with self.lock:
                self.audio["out"] = parts[0] if parts else ""
                try:
                    self.audio["rate"] = int(float(parts[1])) if len(parts) > 1 else 0
                    self.audio["inputs"] = int(float(parts[2])) if len(parts) > 2 else None
                except ValueError:
                    pass
                self.audio["rev"] += 1
            return True
        if line.startswith("TIDAL_STUDIO_AUDIO_DEVICES:"):
            devs = [d for d in line.split(":", 1)[1].split("\t") if d.strip()]
            with self.lock:
                a = self.audio
                if a["boot_devices"] is None:
                    a["boot_devices"] = devs
                else:
                    # Comparado con lo que había al arrancar el motor: si cambia, la web ofrece reconectar
                    a["added"] = [d for d in devs if d not in a["boot_devices"]]
                    a["removed"] = [d for d in a["boot_devices"] if d not in devs]
                    if (a["added"] or a["removed"]) and not a["problem"]:
                        a["problem"] = "devices-changed"
                    elif not (a["added"] or a["removed"]) and a["problem"] == "devices-changed":
                        a["problem"] = ""
                a["devices"] = devs
                a["rev"] += 1
            return True
        if line.startswith("TIDAL_STUDIO_AUDIO_LOST"):
            with self.lock:
                self.audio["problem"] = "server-lost"
                self.audio["rev"] += 1
            self._add("studio", "El motor de audio (scsynth) se ha parado. Pulsa «Reconectar audio».")
            return True
        low = line.lower()
        if "mismatched sample rates" in low or "could not initialize audio" in low or "could not boot server" in low:
            with self.lock:
                self.audio["problem"] = "rate-mismatch" if "mismatched" in low else "boot-failed"
                self.audio["rev"] += 1
        return False

    def audio_state(self):
        with self.lock:
            a = dict(self.audio)
        a["chosen"] = self.audio_out
        a["running"] = bool(self.sclang and self.sclang.poll() is None)
        a["ready"] = bool(self.osc_ready)
        return a

    def restart_audio(self, out=None):
        """«Reconectar audio»: reinicia solo SuperCollider + SuperDirt (con la salida elegida).
        Tidal sigue vivo y sigue mandando la canción, así que vuelve a sonar sola en cuanto SuperDirt escucha."""
        if out is not None:
            self.audio_out = str(out or "")[:200]
        self._add("studio", "Reconectando el audio…" + (f" (salida: {self.audio_out})" if self.audio_out else ""))
        self.stop(only=("sclang",))
        self._kill_orphan_scsynth()
        return self.start()

    def _kill_orphan_scsynth(self):
        """Si sclang se cerró a la fuerza, scsynth puede quedar vivo ocupando el puerto 57110 y el nuevo
        arranque fallaría. El audio de Tidal Studio es nuestro, así que lo cerramos."""
        try:
            if SYSTEM == "Windows":
                subprocess.run(["taskkill", "/F", "/IM", "scsynth.exe"], capture_output=True, timeout=5,
                               creationflags=0x08000000)
            elif shutil.which("pkill"):
                subprocess.run(["pkill", "-x", "scsynth"], capture_output=True, timeout=5)
            time.sleep(0.5)
        except Exception:  # noqa: BLE001
            pass

    # ---------- evaluar código ----------
    def eval(self, code):
        code = (code or "").strip()
        if not code:
            return {"ok": True, "errors": [], "simulation": self.simulation}
        blocks = split_blocks(code)
        if not (self.ghci and self.ghci.poll() is None):
            for b in blocks:
                self._add("sim", b.replace("\n", " ⏎ "))
            return {"ok": True, "errors": [], "simulation": True, "blocks": len(blocks)}

        with self.lock:
            mark = self.counter
        payload = "".join(":{\n" + b + "\n:}\n" for b in blocks)
        try:
            self.ghci.stdin.write(payload.encode("utf-8"))
            self.ghci.stdin.flush()
        except Exception as e:
            return {"ok": False, "errors": [f"No se pudo enviar a Tidal: {e}"]}
        time.sleep(0.6)  # dar tiempo a GHCi para responder con errores
        out = self._since(mark)
        errors, capture = [], False
        for src, line in out:
            if src != "tidal":
                continue
            if "error" in line.lower():
                capture = True
            if capture:
                errors.append(line)
        return {"ok": not errors, "errors": errors[:30], "simulation": False, "blocks": len(blocks)}
