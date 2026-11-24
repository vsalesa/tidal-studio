"""Tu teclado MIDI en Tidal Studio: lo que tocas suena al momento y se traduce a pistas de Tidal.

Las notas llegan de tres sitios y todas pasan por aquí (MidiHub):
  - SuperCollider (studio-midi.scd): escucha el piano USB con CoreMIDI/Windows MIDI/ALSA y manda cada nota
    por OSC (/ts/midi) al puerto de eventos del estudio. Es la vía principal (la app de Mac no tiene Web MIDI).
  - La web: Web MIDI del navegador (Chrome/Edge, si SuperCollider no está), el teclado en pantalla y las
    teclas del ordenador. Llegan por POST /api/midi/note y aquí se mandan a SuperCollider para que suenen.
  - tools/virtual_midi.py: un teclado virtual para probar todo sin piano.

La traducción (translate) junta las notas de una toma, las cuadra a una rejilla y escribe un patrón de
Tidal por mano (izquierda/derecha), usando las mismas piezas que «Importar canción» (songimport) y su
análisis de tonalidad y acordes. También devuelve un MIDI de la toma para «Generar en un estilo».
Solo biblioteca estándar.
"""
import base64
import collections
import math
import struct
import threading
import time

import songimport

PPQ = 480
GRIDS = (4, 8, 12, 16, 24)      # pasos por compás: negras, corcheas, tresillos, semicorcheas, tresillos de semi
BAR_CHOICES = (1, 2, 4, 8, 16)
DEFAULTS = {"sound": "superpiano", "device": "", "chan": -1, "play": True, "length": 1.2, "transpose": 0, "volume": 1.0,
            # Salida: de Tidal Studio al teclado (notas de las pistas con s "midi", reloj y sonido del teclado)
            "out": "", "outch": 0, "prog": -1, "clock": False}
# Ajustes que solo usa la salida (no son «midiset» de la entrada)
OUT_KEYS = ("out", "outch", "prog", "clock")


def T(lang, es, en):
    return en if lang == "en" else es


# ---------------------------------------------------------------- notas de una toma

def pair_notes(events, end=None):
    """events: [{t, type: on/off/pedal, note, vel, ch}] (t en segundos) → [(inicio, fin, nota, vel, canal)].
    Con el pedal de sustain pisado, las notas soltadas siguen sonando hasta que lo levantas (como en un piano)."""
    out, open_, held = [], {}, set()
    pedal = False
    last = 0.0
    for e in sorted(events, key=lambda e: e["t"]):
        t, kind, note = float(e["t"]), e.get("type"), int(e.get("note", 0))
        last = max(last, t)
        if kind == "pedal":
            down = int(e.get("vel", 0)) >= 64
            if pedal and not down:
                for n in list(held):
                    if n in open_:
                        st, vel, ch = open_.pop(n)
                        out.append((st, t, n, vel, ch))
                held.clear()
            pedal = down
        elif kind == "on" and int(e.get("vel", 0)) > 0:
            if note in open_:  # la misma tecla otra vez: la anterior termina aquí
                st, vel, ch = open_.pop(note)
                out.append((st, t, note, vel, ch))
            held.discard(note)
            open_[note] = (t, int(e.get("vel", 90)), int(e.get("ch", 0)))
        elif kind in ("off", "on"):
            if note in open_:
                if pedal:
                    held.add(note)
                else:
                    st, vel, ch = open_.pop(note)
                    out.append((st, t, note, vel, ch))
    stop = end if end is not None else last
    for n, (st, vel, ch) in open_.items():
        out.append((st, max(stop, st + 0.05), n, vel, ch))
    return sorted(out)


def pick_grid(starts, t0, bar):
    """La rejilla más sencilla que encaja con lo que has tocado (con margen: tocamos con las manos).
    Primero las rectas (negras, corcheas, semicorcheas); los tresillos solo si encajan claramente mejor."""
    if not starts:
        return 16
    tol = bar / 16 * 0.3

    def err(g):
        step = bar / g
        e = [abs((s - t0) - round((s - t0) / step) * step) for s in starts]
        return sum(e) / len(e), max(e)

    for g in (4, 8, 16):
        mean, worst = err(g)
        if mean <= tol and worst <= bar / 16 * 0.55:
            if g == 16:
                break
            return g
    m16 = err(16)[0]
    for g in (12, 24):
        mean, worst = err(g)
        if mean <= tol and mean < m16 * 0.5:
            return g
    return 16


def pick_split(notes, split):
    """Punto de corte entre mano izquierda y derecha (None = una sola pista)."""
    if split in (None, "none", "", 0):
        return None
    tonal = [n for n in notes if n[4] != 9]
    if isinstance(split, (int, float)) or str(split).isdigit():
        return int(split)
    lows = [n for n in tonal if n[2] < 60]
    highs = [n for n in tonal if n[2] >= 60]
    if len(lows) >= 2 and len(highs) >= 2:
        return 60
    return None


def _round_bars(n):
    for b in BAR_CHOICES:
        if n <= b:
            return b
    return BAR_CHOICES[-1]


def quantize(notes, bpm, t0=None, grid="auto", cycle0=None):
    """Cuadra las notas a la rejilla. Devuelve dict con pasos por compás, compases y notas en pasos
    [(paso_inicio, paso_fin, nota, vel, canal)], ya sin compases vacíos al principio."""
    bar = 240.0 / max(30.0, min(300.0, float(bpm)))
    if not notes:
        return {"grid": 16, "bars": 0, "steps": [], "t0": t0, "cycle0": cycle0, "bar": bar}
    if t0 is None:
        t0 = notes[0][0]
    g = pick_grid([n[0] for n in notes], t0, bar) if grid in ("auto", None, "") else int(grid)
    step = bar / g
    ks = [int(round((n[0] - t0) / step)) for n in notes]
    shift = 0
    if min(ks) < 0:  # empezaste antes del «uno» (una anacrusa): la toma empieza un compás antes
        back = -(min(ks) // g)
        shift -= back
        t0 -= back * bar
    steps = []
    for (st, en, note, vel, ch) in notes:
        k = int(round((st - t0) / step))
        ke = max(k + 1, int(round((en - t0) / step)))
        steps.append([k, ke, note, vel, ch])
    first_bar = min(s[0] for s in steps) // g
    if first_bar:  # compases vacíos al principio: fuera
        for s in steps:
            s[0] -= first_bar * g
            s[1] -= first_bar * g
        shift += first_bar
    used = max(s[0] for s in steps) // g + 1
    bars = _round_bars(used)
    steps = [s for s in steps if s[0] < bars * g]
    for s in steps:
        s[1] = min(s[1], bars * g)
    return {"grid": g, "bars": bars, "steps": [tuple(s) for s in steps], "t0": t0 + first_bar * bar,
            "cycle0": (cycle0 + shift) if cycle0 is not None else None, "bar": bar}


# ---------------------------------------------------------------- de pasos a Tidal y a MIDI

def _bars_code(steps, g, bars, rot, drums=False):
    """Una cadena de mininotación por compás (usando songimport.bar_tokens) y luego multi_bar.
    rot: el compás j de la toma sonó en el ciclo cycle0 + j, y en «<a b c d>» Tidal toca el elemento
    ciclo mod n: lo colocamos en su sitio para que encaje con la canción que estaba sonando."""
    tick = PPQ * 4 // g  # en ticks, como un MIDI: bar_tokens busca la rejilla más sencilla con margen de 1/64
    per = [[] for _ in range(bars)]
    for k, ke, note, vel, ch in steps:
        b = k // g
        val = songimport.DRUMS.get(note, ("perc", "perc"))[0] if drums else songimport.note_name(note)
        per[b].append((k * tick, ke * tick, val, note))
    for p in per:
        p.sort(key=lambda e: (e[0], e[3]))  # los acordes de grave a agudo
        p[:] = [e[:3] for e in p]
    strs = [None] * bars
    for j in range(bars):
        s = songimport.bar_tokens(per[j], j * PPQ * 4, PPQ * 4, not drums)
        strs[(j + rot) % bars] = s
    return songimport.multi_bar(strs)


def _vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(out)


def _mtrk(events):
    events.sort(key=lambda e: (e[0], 0 if (e[1][0] & 0xF0) == 0x80 else 1))
    data, last = b"", 0
    for t, b in events:
        data += _vlq(t - last) + b
        last = t
    data += b"\x00\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def to_midi(q, bpm, parts):
    """MIDI (formato 1) de la toma ya cuadrada: una pista por mano. parts: [(nombre, [pasos])]."""
    tick = PPQ * 4 // q["grid"]
    us = int(60_000_000 / max(30.0, min(300.0, float(bpm))))
    meta = _mtrk([(0, b"\xff\x51\x03" + us.to_bytes(3, "big")), (0, b"\xff\x58\x04\x04\x02\x18\x08")])
    chunks = [meta]
    for name, steps in parts:
        nm = name.encode("utf-8")[:60]
        ev = [(0, b"\xff\x03" + _vlq(len(nm)) + nm)]
        chs = {s[4] for s in steps}
        for ch in chs:
            if ch != 9:
                ev.append((0, bytes([0xC0 | ch, 0])))
        for k, ke, note, vel, ch in steps:
            ev.append((k * tick, bytes([0x90 | ch, note & 0x7F, max(1, min(127, vel))])))
            ev.append((ke * tick - 1, bytes([0x80 | ch, note & 0x7F, 0])))
        chunks.append(_mtrk(ev))
    return b"MThd" + struct.pack(">IHHH", 6, 1, len(chunks), PPQ) + b"".join(chunks)


def _chordy(steps):
    """¿Hay varias notas a la vez casi siempre? (acordes) frente a una línea de notas sueltas."""
    by = collections.Counter(s[0] for s in steps)
    return sum(1 for c in by.values() if c > 1) / max(1, len(by)) > 0.4


def translate(events, bpm=120, t0=None, cycle0=None, grid="auto", split="auto", sound="superpiano",
              lang="es", name="", end=None):
    """Una toma → pistas de Tidal + resumen (tonalidad, acordes) + MIDI. Siempre en local, al momento."""
    notes = pair_notes(events, end)
    q = quantize(notes, bpm, t0, grid, cycle0)
    if not q["steps"]:
        return {"tracks": [], "empty": True, "grid": q["grid"], "bars": 0, "bpm": round(float(bpm), 1), "notes": 0}
    g, bars = q["grid"], q["bars"]
    rot = (q["cycle0"] % bars) if q["cycle0"] is not None else 0
    drums = [s for s in q["steps"] if s[4] == 9]
    tonal = [s for s in q["steps"] if s[4] != 9]
    cut = pick_split(tonal, split)
    if cut is None:
        hands = [(T(lang, "Mi frase", "My phrase"), tonal)]
    else:
        hands = [(T(lang, "Mano izquierda", "Left hand"), [s for s in tonal if s[2] < cut]),
                 (T(lang, "Mano derecha", "Right hand"), [s for s in tonal if s[2] >= cut])]
    snd = (sound or "superpiano").replace('"', "")
    tracks, parts = [], []
    for label, steps in hands:
        if not steps:
            continue
        avg = sum(s[2] for s in steps) / len(steps)
        chordy = _chordy(steps)
        kind = "armonia" if chordy else ("bajo" if avg < 55 else "melodia")
        vel = sum(s[3] for s in steps) / len(steps)
        code = f'note "{_bars_code(steps, g, bars, rot)}" # s "{snd}" # legato 1'
        if vel < 70 or vel > 110:  # tocaste muy suave o muy fuerte: lo respetamos
            code += f" # gain {round(0.8 + vel / 127 * 0.3, 2)}"
        tracks.append({"nombre": label, "tipo": kind, "codigo": code, "notas": len(steps), "origen": "midi",
                       "avg": round(avg, 1)})
        parts.append((label, steps))
    if drums:
        label = T(lang, "Mi batería", "My drums")
        tracks.insert(0, {"nombre": label, "tipo": "percusion", "codigo": f's "{_bars_code(drums, g, bars, rot, True)}"',
                          "notas": len(drums), "origen": "midi"})
        parts.append((label, drums))
    midi = to_midi(q, bpm, parts)
    summary, reference = None, ""
    try:
        a = songimport.analyse(midi, lang, 1, bars, name or T(lang, "Lo que he tocado", "What I played"))
        summary, reference = a["summary"], a["reference"]
    except Exception:  # noqa: BLE001  el resumen es un extra: las pistas ya están
        pass
    return {"tracks": tracks, "empty": False, "grid": g, "bars": bars, "bpm": round(float(bpm), 1),
            "notes": len(q["steps"]), "split": cut, "rotation": rot, "summary": summary, "reference": reference,
            "midi_b64": base64.b64encode(midi).decode("ascii")}


# ---------------------------------------------------------------- estado en vivo

class MidiHub:
    """Notas que llegan (del piano, de la web o del teclado virtual), teclados conectados, ajustes y tomas."""

    def __init__(self, engine):
        self.engine = engine
        self.lock = threading.Lock()
        self.events = collections.deque(maxlen=6000)
        self.seq = 0
        self.devices, self.devices_at, self.error = [], 0.0, ""
        self.outputs, self.out_active = [], ""   # salidas MIDI que hay y la que está conectada ahora
        self.settings = dict(DEFAULTS)
        self.rec = None      # {start_seq, t0, bpm, cycle0, synced, stop}
        self.last_note_at = 0.0
        # Teclas y pedal pisados por cada teclado: si lo desenchufas a medias, se sueltan solos
        self.held = collections.defaultdict(set)
        self.pedal = {}
        # Avisos de enchufar / desenchufar para la web (los últimos)
        self.plugs = collections.deque(maxlen=20)
        self.plug_seq = 0

    # --- de SuperCollider (engine.py reparte los OSC /ts/midi…)
    def on_osc(self, addr, args):
        if addr == "/ts/midi" and len(args) >= 3:
            kind, note, vel = str(args[0]), int(float(args[1])), int(float(args[2]))
            ch = int(float(args[3])) if len(args) > 3 else 0
            src = str(args[4]) if len(args) > 4 else ""
            self.add(kind, note, vel, ch, src or "midi")
        elif addr == "/ts/mididevs":
            with self.lock:
                self.devices = [str(a) for a in args]
                self.devices_at, self.error = time.time(), ""
        elif addr == "/ts/midiouts":
            with self.lock:
                self.outputs = [str(a) for a in args]
                want = self.settings.get("out") or ""
                retry = want and want in self.outputs and self.out_active != want
            if retry:
                # La salida elegida ha vuelto (la habías desenchufado): la reconectamos sola
                self._apply_out()
        elif addr == "/ts/midiout":
            with self.lock:
                self.out_active = str(args[0]) if args else ""
        elif addr in ("/ts/midiplug", "/ts/midiunplug") and args:
            self.plugged(str(args[0]), addr == "/ts/midiplug")
        elif addr == "/ts/midierr":
            with self.lock:
                self.error = str(args[0]) if args else "?"
                self.devices_at = time.time()

    def add(self, kind, note, vel, ch=0, src="web", t=None):
        if kind not in ("on", "off", "pedal"):
            return None
        with self.lock:
            self.seq += 1
            ev = {"seq": self.seq, "t": t if t is not None else time.time(), "type": kind,
                  "note": max(0, min(127, int(note))), "vel": max(0, min(127, int(vel))), "ch": max(0, min(15, int(ch))), "src": src}
            self.events.append(ev)
            if kind == "on":
                self.last_note_at = ev["t"]
                self.held[src].add(ev["note"])
            elif kind == "off":
                self.held[src].discard(ev["note"])
            else:
                self.pedal[src] = ev["vel"]
            return ev

    def plugged(self, name, added):
        """Un teclado aparece o desaparece. Si desaparece con teclas o el pedal pisados, los soltamos:
        si no, la web los dejaría encendidos y la grabación alargaría esas notas hasta el final."""
        if not added:
            with self.lock:
                notes = sorted(self.held.pop(name, set()))
                ped = self.pedal.pop(name, 0)
            for n in notes:
                self.add("off", n, 0, 0, name)
            if ped >= 64:
                self.add("pedal", 64, 0, 0, name)
                self.pedal.pop(name, None)
        with self.lock:
            self.plug_seq += 1
            self.plugs.append({"seq": self.plug_seq, "t": time.time(), "name": name, "added": bool(added)})

    def release_all(self):
        """Suelta todo lo pisado (al parar el motor o desactivar el teclado)."""
        with self.lock:
            held = {src: sorted(n) for src, n in self.held.items() if n}
            peds = [src for src, v in self.pedal.items() if v >= 64]
            self.held.clear()
            self.pedal.clear()
        for src, notes in held.items():
            for n in notes:
                self.add("off", n, 0, 0, src)
        for src in peds:
            self.add("pedal", 64, 0, 0, src)
        with self.lock:
            self.held.clear()
            self.pedal.clear()

    def web_note(self, kind, note, vel=90, ch=0, src="web"):
        """Nota del navegador (Web MIDI, teclado en pantalla, teclas): la apuntamos y suena en SuperDirt."""
        ev = self.add(kind, note, vel, ch, src)
        played = False
        if ev and kind == "on" and self.settings.get("play"):
            played = self.engine.sc_cmd("midinote", str(int(note)), str(int(vel)))
        return {"ok": bool(ev), "played": played, "seq": ev["seq"] if ev else self.seq}

    # --- ajustes (se mandan a SuperCollider y se vuelven a mandar cada vez que arranca)
    def set_settings(self, data):
        changed, moved = {}, set()
        for k, v in (data or {}).items():
            if k not in DEFAULTS:
                continue
            if k in ("play", "clock"):
                v = bool(v)
            elif k in ("chan", "transpose", "outch", "prog"):
                v = int(v)
            elif k in ("length", "volume"):
                v = float(v)
            else:
                v = str(v)[:120]
            if self.settings.get(k) != v:
                moved.add(k)
            self.settings[k] = v
            changed[k] = v
        if "outch" in self.settings:
            self.settings["outch"] = max(0, min(15, int(self.settings["outch"])))
        for k, v in changed.items():
            if k in OUT_KEYS:
                continue
            self.engine.sc_cmd("midiset", k, ("1" if v else "0") if isinstance(v, bool) else str(v))
        if "out" in moved:
            self._apply_out()
        elif moved & {"prog", "outch"}:
            self._apply_prog()
        # Desactivar el sonido o cambiar de teclado/canal: lo que estaba pisado deja de estarlo
        if moved & {"device", "chan"} or ("play" in moved and not self.settings["play"]):
            self.release_all()
        return self.settings

    def on_engine_ready(self):
        # El motor acaba de (re)arrancar: nada sigue sonando, así que nada sigue pisado
        self.release_all()
        with self.lock:
            self.out_active = ""
        for k, v in self.settings.items():
            if k not in OUT_KEYS:
                self.engine.sc_cmd("midiset", k, ("1" if v else "0") if isinstance(v, bool) else str(v))
        self.engine.sc_cmd("midiscan")
        if self.settings.get("out"):
            self._apply_out()

    # --- salida al teclado
    def _apply_out(self):
        self.engine.sc_cmd("midiout", self.settings.get("out") or "")
        self._apply_prog()

    def _apply_prog(self):
        prog = int(self.settings.get("prog", -1))
        if self.settings.get("out") and prog >= 0:
            self.engine.sc_cmd("midiprog", str(int(self.settings.get("outch", 0))), str(prog))

    def panic(self):
        """All Notes Off en el teclado (Silencio): nada se queda sonando en tu piano."""
        return self.engine.sc_cmd("midipanic")

    def clock_code(self, start=False):
        """Líneas de Tidal para el reloj MIDI (si está activado y hay salida): 24 pulsos por negra.
        En Tidal Studio un ciclo son 4 negras, así que 96 pulsos por ciclo."""
        if not (self.settings.get("clock") and self.settings.get("out")):
            return []
        lines = ['p "ts-midiclock" $ midicmd "midiClock*96" # s "midi"']
        if start:
            lines.append('once $ midicmd "start" # s "midi"')
        return lines

    def scan(self):
        return self.engine.sc_cmd("midiscan")

    # --- grabar una toma
    def record_start(self, bpm=120, countin=0, sync=True, start_now=False):
        """Empieza una toma. Si suena tu canción, la toma empieza en el siguiente ciclo (compás) y usa su
        tempo: así lo que tocas encaja con lo que ya hay. Si no, cuenta countin pulsos y empieza."""
        now = time.time()
        bpm = max(30.0, min(300.0, float(bpm or 120)))
        t0, cycle0, synced = None, None, False
        song = self.engine.song_clock() if sync else None
        if song:
            cps, at, cycle = song
            bpm = round(cps * 240, 2)
            lead = now + 0.25
            c_next = math.ceil(cycle + (lead - at) * cps)
            t0 = at + (c_next - cycle) / cps
            cycle0, synced = int(c_next), True
        elif countin or start_now:  # con cuenta atrás o con metrónomo: el «uno» lo marca el clic
            t0 = now + int(countin or 0) * 60.0 / bpm
        with self.lock:
            self.rec = {"start_seq": self.seq, "t0": t0, "bpm": bpm, "cycle0": cycle0, "synced": synced,
                        "started": now, "stop": None, "countin": int(countin or 0)}
            return dict(self.rec, now=now)

    def capture(self, bpm=120, gap=4.0, sync=True):
        """«Convertir lo que acabo de tocar»: sin haber pulsado Grabar. Coge la última frase (desde el último
        silencio de más de `gap` segundos) como si la hubieras grabado."""
        now = time.time()
        with self.lock:
            ons = [e for e in self.events if e["type"] == "on" and e["t"] >= now - 120]
            if not ons:
                return {"ok": False}
            k = len(ons) - 1
            while k > 0 and ons[k]["t"] - ons[k - 1]["t"] <= gap:
                k -= 1
            first = ons[k]
            start_seq = first["seq"] - 1
            bpm = max(30.0, min(300.0, float(bpm or 120)))
            t0, cycle0, synced = None, None, False
        song = self.engine.song_clock(max_age=max(2.5, now - first["t"] + 2.5)) if sync else None
        if song:
            cps, at, cycle = song
            c = cycle + (first["t"] - at) * cps
            cycle0 = int(math.floor(c + 0.125))  # una nota un poco antes del «uno» cuenta para ese compás
            t0 = at + (cycle0 - cycle) / cps
            bpm, synced = round(cps * 240, 2), True
        with self.lock:
            self.rec = {"start_seq": start_seq, "t0": t0, "bpm": bpm, "cycle0": cycle0, "synced": synced,
                        "started": first["t"], "stop": now, "countin": 0, "captured": True}
            return dict(self.rec, ok=True, now=now)

    def record_stop(self):
        with self.lock:
            if self.rec and self.rec["stop"] is None:
                self.rec["stop"] = time.time()
            return dict(self.rec or {}, now=time.time())

    def take(self):
        with self.lock:
            r = self.rec
            if not r:
                return None, []
            stop = r["stop"] or float("inf")
            evs = [e for e in self.events if e["seq"] > r["start_seq"] and e["t"] <= stop + 0.05]
            return dict(r), evs

    def translate_take(self, opts):
        r, evs = self.take()
        if not r:
            return {"tracks": [], "empty": True, "error": "no-take"}
        bpm = float(opts.get("bpm") or r["bpm"])
        # Si cambias el tempo a mano, la toma deja de ir pegada a la canción: empieza en tu primera nota
        same_tempo = abs(bpm - r["bpm"]) < 0.01
        t0 = r["t0"] if same_tempo else None
        cycle0 = r["cycle0"] if same_tempo else None
        end = r["stop"] or time.time()
        res = translate(evs, bpm, t0, cycle0, opts.get("grid", "auto"), opts.get("split", "auto"),
                        opts.get("sound") or self.settings.get("sound"), opts.get("lang", "es"), opts.get("name", ""), end)
        res["synced"] = bool(r["synced"] and same_tempo)
        res["recording"] = r["stop"] is None
        return res

    def state(self, since=0):
        with self.lock:
            evs = [e for e in self.events if e["seq"] > since][-300:]
            rec = dict(self.rec) if self.rec else None
            return {"now": time.time(), "seq": self.seq, "events": evs, "devices": list(self.devices),
                    "devices_at": self.devices_at, "error": self.error, "settings": dict(self.settings),
                    "sc": bool(self.engine.osc_ready), "rec": rec, "last_note_at": self.last_note_at,
                    "plugs": list(self.plugs), "outputs": list(self.outputs), "out_active": self.out_active}
