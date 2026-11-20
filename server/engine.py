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
_CONTINUATION = ("#", "$", "|", "+", "-", "*", ".", ")", "]", ",", "}", "<~", "~>")


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
        self.simulation = False
        self.starting = False

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

    def _popen(self, cmd, cwd):
        kwargs = dict(stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                      stderr=subprocess.STDOUT, cwd=cwd, bufsize=0)
        if SYSTEM == "Windows":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        env = os.environ.copy()
        if SYSTEM == "Linux" and not env.get("DISPLAY") and not env.get("WAYLAND_DISPLAY"):
            env["QT_QPA_PLATFORM"] = "offscreen"
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
                with self.lock:
                    self.sounds, self.missing = set(), set()
                    self.sounds_rev += 1
                self.sclang = self._popen(cmd, os.path.dirname(sclang))
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

    def sc_eval(self, code):
        """Envía código a SuperCollider (sclang lee la entrada hasta el carácter \\x0c)."""
        if not (self.sclang and self.sclang.poll() is None and self.superdirt_ready):
            return False
        try:
            self.sclang.stdin.write(code.replace("\x0c", "").encode("utf-8") + b"\n\x0c")
            self.sclang.stdin.flush()
            return True
        except Exception:
            return False

    def reload_sample(self, folder, name):
        """Vuelve a cargar un sonido de la biblioteca sin reiniciar SuperDirt."""
        path = folder.replace("\\", "/").replace('"', "")
        ok = self.sc_eval(f'~dirt.freeSoundFiles([\\{name}]); ~dirt.loadSoundFiles("{path}"); "Sample recargado: {name}".postln; ~studioListSounds.value;')
        if ok:
            self._add("studio", f"Sample «{name}» cargado en SuperDirt")
        return ok

    def record_start(self, path):
        p = path.replace("\\", "/").replace('"', "")
        return self.sc_eval(f's.record("{p}"); "Grabando en {p}".postln;')

    def record_stop(self):
        return self.sc_eval('s.stopRecording; "Grabación terminada".postln;')

    def stop(self):
        for name in ("ghci", "sclang"):
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
