"""Importar una canción (MIDI) y convertirla en pistas de Tidal para usarla como punto de partida.

No intenta copiar la canción nota a nota: coge un trozo (por defecto 4 compases), lo cuadra a una
rejilla sencilla y lo escribe como patrones de Tidal fáciles de leer. Además analiza la canción entera
(tempo, compás, tonalidad, acordes, groove y estructura) para que Maestro pueda crear una canción
NUEVA inspirada en ella.

Todo con la biblioteca estándar de Python (sin pip). El audio (mp3/wav) pasa primero por
audioimport.py, que lo convierte en un MIDI y luego usa esto mismo.
"""
import re
import struct
from collections import Counter, defaultdict

MAX_BYTES = 4 * 1024 * 1024
MAX_TRACKS = 12  # por defecto; el estudio pasa su número de pistas (Ajustes → Pistas)


class ImportError_(Exception):
    pass


# ---------------------------------------------------------------- lectura del MIDI

def _varlen(data, i):
    v = 0
    while True:
        if i >= len(data):
            raise ImportError_("MIDI cortado|Truncated MIDI")
        b = data[i]
        i += 1
        v = (v << 7) | (b & 0x7F)
        if not b & 0x80:
            return v, i


def parse_midi(data):
    """Devuelve {ppq, tempos[(tick, us)], sigs[(tick, num, den)], keysig, tracks[{name, notes[], programs{}}]}.
    Cada nota: (inicio, fin, tono, velocidad, canal) en ticks."""
    if len(data) > MAX_BYTES:
        raise ImportError_("El MIDI es demasiado grande (máx. 4 MB)|The MIDI file is too big (max 4 MB)")
    if data[:4] == b"RIFF" and data[8:12] == b"RMID":  # .rmi: un MIDI dentro de un RIFF
        j = data.find(b"MThd")
        data = data[j:] if j >= 0 else data
    if data[:4] != b"MThd":
        raise ImportError_("No es un archivo MIDI (.mid)|This is not a MIDI file (.mid)")
    hlen, fmt, ntrk, div = struct.unpack(">IHHH", data[4:14])
    if div & 0x8000:
        raise ImportError_("MIDI con tiempo SMPTE: no lo sé leer|SMPTE-timed MIDI isn't supported")
    ppq = div or 480
    i = 8 + hlen
    tempos, sigs, keysig, tracks, texts = [], [], None, [], []
    for _ in range(ntrk):
        if data[i:i + 4] != b"MTrk":
            break
        (tlen,) = struct.unpack(">I", data[i + 4:i + 8])
        j, end = i + 8, min(len(data), i + 8 + tlen)
        i = end
        tick, status = 0, 0
        name, notes, programs = "", [], {}
        on = defaultdict(list)  # (canal, tono) -> [(inicio, vel)]
        while j < end:
            dt, j = _varlen(data, j)
            tick += dt
            b = data[j]
            if b == 0xFF:
                typ = data[j + 1]
                ln, j = _varlen(data, j + 2)
                body = data[j:j + ln]
                j += ln
                if typ == 0x51 and ln == 3:
                    tempos.append((tick, (body[0] << 16) | (body[1] << 8) | body[2]))
                elif typ == 0x58 and ln >= 2:
                    sigs.append((tick, body[0], 2 ** body[1]))
                elif typ == 0x59 and ln == 2 and keysig is None:
                    keysig = (struct.unpack("b", body[:1])[0], body[1])
                elif typ == 0x01:
                    texts.append(body.decode("latin-1", "replace"))
                elif typ in (0x03, 0x04) and not name:
                    name = body.decode("latin-1", "replace").replace("\x00", "").strip()
                elif typ == 0x2F:
                    break
                continue
            if b in (0xF0, 0xF7):
                ln, j = _varlen(data, j + 1)
                j += ln
                continue
            if b & 0x80:
                status = b
                j += 1
            ev, ch = status & 0xF0, status & 0x0F
            if ev in (0xC0, 0xD0):
                if ev == 0xC0:
                    programs.setdefault(ch, data[j])
                j += 1
                continue
            if j + 1 >= len(data):
                break
            a, v = data[j], data[j + 1]
            j += 2
            if ev == 0x90 and v > 0:
                on[(ch, a)].append((tick, v))
            elif ev == 0x80 or (ev == 0x90 and v == 0):
                if on[(ch, a)]:
                    st, vel = on[(ch, a)].pop(0)
                    notes.append((st, max(tick, st + 1), a, vel, ch))
        for (ch, a), lst in on.items():  # notas sin «note off»: duran un pulso
            for st, vel in lst:
                notes.append((st, st + ppq, a, vel, ch))
        tracks.append({"name": name, "notes": sorted(notes), "programs": programs})
    return {"ppq": ppq, "tempos": sorted(tempos), "sigs": sorted(sigs), "keysig": keysig, "tracks": tracks, "format": fmt, "texts": texts}


# ---------------------------------------------------------------- de General MIDI a sonidos de Tidal

# Batería GM (canal 10) → sample de Dirt-Samples, y a qué grupo (pista) va
DRUMS = {
    35: ("bd", "kick"), 36: ("bd", "kick"),
    37: ("rm", "snare"), 38: ("sn", "snare"), 40: ("sn", "snare"), 39: ("cp", "snare"),
    42: ("hh", "hats"), 44: ("hh", "hats"), 46: ("oh", "hats"),
    49: ("cr", "hats"), 57: ("cr", "hats"), 51: ("ho", "hats"), 59: ("ho", "hats"), 53: ("ho", "hats"),
    41: ("lt", "perc"), 43: ("lt", "perc"), 45: ("mt", "perc"), 47: ("mt", "perc"), 48: ("ht", "perc"), 50: ("ht", "perc"),
    54: ("tabla", "perc"), 56: ("cb", "perc"), 60: ("drum:1", "perc"), 61: ("drum:2", "perc"),
    62: ("drum:3", "perc"), 63: ("drum:4", "perc"), 64: ("drum:5", "perc"), 69: ("perc", "perc"), 70: ("perc:1", "perc"),
}
DRUM_GROUPS = {
    "kick": ("Bombo", "Kick"), "snare": ("Caja y palmas", "Snare & claps"),
    "hats": ("Platillos", "Hats & cymbals"), "perc": ("Toms y percusión", "Toms & percussion"),
}


def gm_instrument(program, track_name=""):
    """(sonido de Tidal, tipo de pista, nombre ES, nombre EN) para un programa General MIDI."""
    n = (track_name or "").lower()
    p = program if program is not None else 0
    if re.search(r"bass|bajo", n) or 32 <= p <= 39:
        return "supersaw", "bajo", "Bajo", "Bass"
    if re.search(r"organ|órgano|organo", n) or 16 <= p <= 23:
        return "superhammond", "armonia", "Órgano", "Organ"
    if re.search(r"string|cuerda|violin|viol", n) or 40 <= p <= 51:
        return "superpwm", "armonia", "Cuerdas", "Strings"
    if re.search(r"pad", n) or 88 <= p <= 95:
        return "superpwm", "textura", "Pad", "Pad"
    if re.search(r"vox|voice|vocal|voz|melod|lead|sax|flute|flauta|trump|trompeta", n) or 52 <= p <= 87:
        return "supersquare", "melodia", "Melodía", "Melody"
    if re.search(r"guitar|guitarra", n) or 24 <= p <= 31:
        return "superpiano", "armonia", "Guitarra", "Guitar"
    if 8 <= p <= 15:
        return "superchip", "melodia", "Campanitas", "Bells"
    return "superpiano", "armonia", "Piano", "Piano"


NOTE_NAMES = ["c", "cs", "d", "ef", "e", "f", "fs", "g", "af", "a", "bf", "b"]
KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def note_name(pitch):
    """Tono MIDI → nombre de nota de Tidal. En Tidal «c5» es la nota 0 = MIDI 60 (el do central)."""
    return f"{NOTE_NAMES[pitch % 12]}{pitch // 12}"


# ---------------------------------------------------------------- análisis musical

# Perfiles de Krumhansl-Kessler para adivinar la tonalidad
MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def _corr(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return num / (da * db) if da and db else 0


def detect_key(hist):
    best = (-2, 0, "major")
    for r in range(12):
        rot = hist[r:] + hist[:r]
        for mode, prof in (("major", MAJOR), ("minor", MINOR)):
            c = _corr(rot, prof)
            if c > best[0]:
                best = (c, r, mode)
    return {"root": best[1], "mode": best[2], "name": KEY_NAMES[best[1]] + ("m" if best[2] == "minor" else ""),
            "confidence": round(best[0], 2)}


CHORDS = [  # (sufijo, intervalos, nombre del acorde en Tidal)
    ("", (0, 4, 7), "major"), ("m", (0, 3, 7), "minor"), ("7", (0, 4, 7, 10), "dom7"),
    ("m7", (0, 3, 7, 10), "min7"), ("maj7", (0, 4, 7, 11), "major7"), ("dim", (0, 3, 6), "dim"),
    ("sus4", (0, 5, 7), "sus4"), ("sus2", (0, 2, 7), "sus2"),
]
ROMAN = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"]


def detect_chord(hist, bass_pc=None):
    total = sum(hist)
    if total <= 0:
        return None
    best = None
    for root in range(12):
        for suf, iv, tidal in CHORDS:
            pcs = {(root + x) % 12 for x in iv}
            inside = sum(hist[p] for p in pcs)
            score = inside / total - 0.12 * (len(iv) - 3) + (0.08 if bass_pc == root else 0)
            if hist[root] <= 0:
                score -= 0.3
            if not best or score > best[0]:
                best = (score, root, suf, tidal)
    if best[0] < 0.45:
        return None
    return {"root": best[1], "name": KEY_NAMES[best[1]] + best[2], "tidal": best[3]}


def roman(chord, key):
    if not chord or not key:
        return ""
    deg = (chord["root"] - key["root"]) % 12
    r = ROMAN[deg]
    if chord["name"][len(KEY_NAMES[chord["root"]]):].startswith("m") and not chord["name"].endswith("maj7"):
        r = r.lower()
    return r + ("°" if chord["name"].endswith("dim") else "")


# ---------------------------------------------------------------- de notas a patrones de Tidal

def _grid_for(onsets_in_bar, bar_ticks, loose=False):
    """La rejilla más sencilla (pasos por compás) que encaja con los ataques sin moverlos mucho.
    loose (viene de un audio): solo rejillas rectas y más tolerancia, porque los tiempos son aproximados."""
    if not onsets_in_bar:
        return 16
    for steps in ((1, 2, 4, 8, 16) if loose else (1, 2, 4, 8, 3, 6, 12, 16, 24, 32)):
        size = bar_ticks / steps
        err = max(abs(o - round(o / size) * size) for o in onsets_in_bar)
        if err <= bar_ticks / (32 if loose else 64) + 1:
            return steps
    return 16


def _compress(tokens):
    """['bd','~','bd','~'] → 'bd ~ bd ~', con «~» seguidos juntados en tramos con @."""
    out, i = [], 0
    while i < len(tokens):
        t = tokens[i]
        j = i + 1
        while j < len(tokens) and tokens[j] == "_":
            j += 1
        w = j - i
        out.append(t if w == 1 else f"{t}@{w}")
        i = j
    s = " ".join(out)
    # «bd ~ bd ~ bd ~ bd ~» → «[bd ~]*4»; «bd bd bd bd» → «bd*4»
    parts = s.split(" ")
    n = len(parts)
    for size in range(1, n // 2 + 1):
        if n % size == 0 and parts[:size] * (n // size) == parts and n // size > 1:
            unit = parts[:size]
            if unit == ["~"] * size:
                return "~"
            u = unit[0] if size == 1 else "[" + " ".join(unit) + "]"
            return f"{u}*{n // size}"
    return s


def bar_tokens(events, bar_start, bar_ticks, sustain, loose=False):
    """events: lista de (inicio, fin, valor). Devuelve la cadena de un compás."""
    onsets = sorted({e[0] - bar_start for e in events})
    steps = _grid_for(onsets, bar_ticks, loose)
    size = bar_ticks / steps
    slots = [[] for _ in range(steps)]
    ends = [0] * steps
    for st, en, val in events:
        k = int(round((st - bar_start) / size))
        if 0 <= k < steps:
            if val not in slots[k]:
                slots[k].append(val)
            ends[k] = max(ends[k], int(round((min(en, bar_start + bar_ticks) - bar_start) / size)))
    tokens = ["~"] * steps
    k = 0
    while k < steps:
        vals = slots[k]
        if vals:
            tokens[k] = vals[0] if len(vals) == 1 else "[" + ",".join(vals) + "]"
            if sustain:  # la nota dura hasta que suena la siguiente o se suelta
                stop = max(k + 1, min(ends[k], steps))
                m = k + 1
                while m < stop and not slots[m]:
                    tokens[m] = "_"
                    m += 1
        k += 1
    return _compress(tokens)


def multi_bar(bars):
    """Varios compases → un patrón. Si todos son iguales, uno solo; si no, «<[…] […]>» (uno por ciclo)."""
    if all(b == bars[0] for b in bars):
        return bars[0]
    # si la segunda mitad repite la primera, nos quedamos con la mitad
    while len(bars) % 2 == 0 and bars[:len(bars) // 2] == bars[len(bars) // 2:]:
        bars = bars[:len(bars) // 2]
    return "<" + " ".join(b if " " not in b else f"[{b}]" for b in bars) + ">"


def _tempo_bpm(midi):
    if not midi["tempos"]:
        return 120.0
    us = midi["tempos"][0][1]
    # si hay varios, el que más dura
    if len(midi["tempos"]) > 1:
        dur = Counter()
        ts = midi["tempos"] + [(max((n[1] for t in midi["tracks"] for n in t["notes"]), default=0), None)]
        for (t0, u), (t1, _) in zip(ts, ts[1:]):
            dur[u] += max(0, t1 - t0)
        us = dur.most_common(1)[0][0] if dur else us
    return 60_000_000 / us


def analyse(data, lang="es", start_bar=None, bars=4, name="", max_tracks=MAX_TRACKS):
    """Analiza el MIDI y genera las pistas de Tidal del trozo [start_bar, start_bar + bars)."""
    midi = parse_midi(data)
    es = lang != "en"
    ppq = midi["ppq"]
    num, den = (midi["sigs"][0][1], midi["sigs"][0][2]) if midi["sigs"] else (4, 4)
    if num <= 0 or den <= 0:
        num, den = 4, 4
    bar_ticks = int(ppq * 4 * num / den)
    bpm = _tempo_bpm(midi)
    # Partes: una por pista y canal (la batería se separa por grupos)
    parts = []
    for ti, t in enumerate(midi["tracks"]):
        by_ch = defaultdict(list)
        for n in t["notes"]:
            by_ch[n[4]].append(n)
        for ch, notes in by_ch.items():
            parts.append({"track": ti, "name": t["name"], "ch": ch, "drums": ch == 9,
                          "program": t["programs"].get(ch), "notes": notes})
    loose = any("tidal-studio:audio" in t for t in midi.get("texts", []))
    if loose:
        _realign(parts, ppq * 4 // den, num)
    all_notes = [n for p in parts for n in p["notes"]]
    if not all_notes:
        raise ImportError_("El MIDI no tiene notas|The MIDI file has no notes")
    first = min(n[0] for n in all_notes)
    last = max(n[1] for n in all_notes)
    first_bar = first // bar_ticks
    total_bars = max(1, -(-last // bar_ticks) - first_bar)

    # ---- análisis de la canción entera
    hist = [0.0] * 12
    per_bar = defaultdict(lambda: [0.0] * 12)
    bass_bar = {}
    for p in parts:
        if p["drums"]:
            continue
        for st, en, pitch, vel, ch in p["notes"]:
            d = en - st
            hist[pitch % 12] += d
            b = st // bar_ticks
            per_bar[b][pitch % 12] += d
            if b not in bass_bar or pitch < bass_bar[b]:
                bass_bar[b] = pitch
    key = detect_key(hist) if sum(hist) else None
    if midi["keysig"] and key:  # si el archivo dice su tonalidad, la usamos
        sf, mi = midi["keysig"]
        root = (sf * 7) % 12
        if mi:
            root = (root + 9) % 12
        key = {**key, "root": root, "mode": "minor" if mi else "major",
               "name": KEY_NAMES[root] + ("m" if mi else ""), "from_file": True}
    chords = []
    for b in range(first_bar, first_bar + total_bars):
        c = detect_chord(per_bar[b], bass_bar.get(b, 0) % 12 if b in bass_bar else None) if b in per_bar else None
        chords.append(c)

    # Estructura: cada compás se resume (acorde + ataques de batería) y se buscan bloques de 4 que se repiten
    drum_on = defaultdict(set)
    for p in parts:
        if p["drums"]:
            for n in p["notes"]:
                drum_on[n[0] // bar_ticks].add((DRUMS.get(n[2], ("perc", "perc"))[1], round((n[0] % bar_ticks) / bar_ticks * 16)))
    finger = []
    for k, b in enumerate(range(first_bar, first_bar + total_bars)):
        c = chords[k]["name"] if chords[k] else "-"
        finger.append((c, frozenset(drum_on.get(b, ()))))
    blocks, labels, letters = [], [], "ABCDEFGH"
    for s in range(0, total_bars, 4):
        blk = tuple(finger[s:s + 4])
        found = None
        for li, ref in enumerate(blocks):
            same = sum(1 for a, b2 in zip(ref, blk) if a == b2)
            if same >= max(1, len(blk) - 1):
                found = li
                break
        if found is None:
            blocks.append(blk)
            found = len(blocks) - 1
        labels.append(letters[min(found, len(letters) - 1)])
    sections = []
    for i, lab in enumerate(labels):
        if sections and sections[-1]["label"] == lab:
            sections[-1]["bars"] += min(4, total_bars - i * 4)
        else:
            sections.append({"label": lab, "start": i * 4 + 1, "bars": min(4, total_bars - i * 4)})

    # ---- trozo elegido: por defecto, el primer bloque que más se repite (el estribillo o el riff)
    bars = max(1, min(16, int(bars or 4)))
    if start_bar is None:
        common = Counter(labels).most_common(1)[0][0] if labels else "A"
        start_bar = labels.index(common) * 4 + 1
    start_bar = max(1, min(total_bars, int(start_bar)))
    w0 = (first_bar + start_bar - 1) * bar_ticks
    w1 = w0 + bars * bar_ticks

    tracks, dropped = [], []
    drum_groups = defaultdict(list)
    tonal = []
    for p in parts:
        notes = [n for n in p["notes"] if w0 <= n[0] < w1]
        if p["drums"]:
            for n in p["notes"]:
                if w0 <= n[0] < w1:
                    drum_groups[DRUMS.get(n[2], ("perc", "perc"))[1]].append(n)
        elif notes:
            tonal.append((p, notes))
    for g in ("kick", "snare", "hats", "perc"):
        notes = drum_groups.get(g)
        if not notes:
            continue
        snd = {}
        for n in notes:
            snd.setdefault(n[2], DRUMS.get(n[2], ("perc", g))[0])
        strs = []
        for b in range(bars):
            bs = w0 + b * bar_ticks
            ev = [(n[0], n[1], snd[n[2]]) for n in notes if bs <= n[0] < bs + bar_ticks]
            strs.append(bar_tokens(ev, bs, bar_ticks, False, loose))
        vel = sum(n[3] for n in notes) / len(notes)
        code = f's "{multi_bar(strs)}"' + (f" # gain {round(0.7 + vel / 127 * 0.4, 2)}" if g in ("hats", "perc") else "")
        tracks.append({"nombre": DRUM_GROUPS[g][0 if es else 1], "tipo": "percusion", "codigo": code,
                       "notas": len(notes), "origen": "GM drums"})
    tonal.sort(key=lambda x: (min(n[2] for n in x[1]), ))  # de grave a agudo
    used_names = Counter()
    for p, notes in tonal:
        snd, kind, n_es, n_en = gm_instrument(p["program"], p["name"])
        low = min(n[2] for n in notes)
        avg = sum(n[2] for n in notes) / len(notes)
        if avg < 52 and kind != "bajo":
            snd, kind, n_es, n_en = "supersaw", "bajo", "Bajo", "Bass"
        strs = []
        for b in range(bars):
            bs = w0 + b * bar_ticks
            ev = [(n[0], n[1], note_name(n[2])) for n in notes if bs <= n[0] < bs + bar_ticks]
            strs.append(bar_tokens(ev, bs, bar_ticks, True, loose))
        extra = " # legato 1"
        if kind == "bajo":
            extra += " # lpf 900"
        elif kind == "melodia":
            extra += " # room 0.2"
        label = p["name"] if p["name"] and not re.fullmatch(r"(track|pista)?\s*\d*", p["name"].lower()) else (n_es if es else n_en)
        used_names[label] += 1
        if used_names[label] > 1:
            label = f"{label} {used_names[label]}"
        if loose and kind in ("armonia", "textura"):
            # Del audio salen muchas notas sueltas: mejor un acorde por compás, escrito con nombres de acorde
            strs = [chord_symbol(chords[start_bar - 1 + b]) if start_bar - 1 + b < len(chords) else "~" for b in range(bars)]
            strs = [x.replace("'", "4'") if x != "~" else x for x in strs]
        tracks.append({"nombre": label[:40], "tipo": kind, "codigo": f'note "{multi_bar(strs)}" # s "{snd}"{extra}',
                       "notas": len(notes), "origen": p["name"] or f"ch {p['ch'] + 1}", "low": low,
                       "avg": round(sum(n[2] for n in notes) / len(notes), 1)})
    if len(tracks) > max_tracks:
        keep = sorted(tracks, key=lambda t: -t["notas"])[:max_tracks]
        dropped = [t["nombre"] for t in tracks if t not in keep]
        tracks = [t for t in tracks if t in keep]
    for t in tracks:
        t.pop("low", None)

    # Groove: swing (corcheas a contratiempo retrasadas) y densidad de la batería
    offs = [((n[0] % ppq) / ppq) for p in parts for n in p["notes"] if abs((n[0] % ppq) - ppq / 2) < ppq * 0.2]
    swing = None
    if len(offs) > 8:
        mean = sum(offs) / len(offs)
        swing = round(mean, 2) if mean > 0.56 else None
    kicks = [n for n in drum_groups.get("kick", [])]
    groove = {
        "swing": swing,
        "kicks_per_bar": round(len(kicks) / bars, 1) if kicks else 0,
        "four_on_floor": bool(kicks) and all(round(((n[0] - w0) % bar_ticks) / (bar_ticks / num), 3) % 1 == 0 for n in kicks) and len(kicks) >= num * bars * 0.9,
        "has_drums": any(p["drums"] for p in parts),
    }

    # BPM del estudio: un ciclo = un compás. En el estudio un ciclo son 4 negras (setcps bpm/60/4),
    # así que en 3/4 o 6/8 ajustamos el BPM para que cada compás dure lo que debe.
    beats_per_bar = num * 4 / den
    studio_bpm = round(bpm * 4 / beats_per_bar)
    win_chords = [c["name"] if c else "-" for c in chords[start_bar - 1:start_bar - 1 + bars]]
    prog = []
    for c in chords:
        nm = c["name"] if c else None
        if nm and (not prog or prog[-1] != nm):
            prog.append(nm)
    summary = {
        "name": name, "bpm": round(bpm, 1), "studio_bpm": max(40, min(220, studio_bpm)),
        "meter": f"{num}/{den}", "key": key, "bars": total_bars,
        "progression": prog[:16], "roman": _roman_prog(chords, key),
        "window": {"start": start_bar, "bars": bars, "chords": win_chords,
                   "chord_data": [chords[i] if 0 <= i < len(chords) else None for i in range(start_bar - 1, start_bar - 1 + bars)]},
        "sections": sections, "groove": groove,
        "instruments": sorted({(DRUM_GROUPS[g][0 if es else 1]) for g in drum_groups} | {t["nombre"] for t in tracks if t["tipo"] != "percusion"}),
        "dropped": dropped, "from_audio": loose,
    }
    return {"summary": summary, "tracks": tracks, "reference": reference_text(summary, tracks, lang)}


def _realign(parts, beat, num):
    """En un audio no sabemos dónde empieza el compás: probamos cada pulso como «uno» y nos quedamos
    con el que hace caer más bombos y cambios del bajo al principio del compás."""
    best = (-1, 0)
    for k in range(num):
        score = 0
        for p in parts:
            prev = None
            for st, en, pitch, vel, ch in p["notes"]:
                pos = round((st - k * beat) / beat)
                on_one = pos % num == 0 and abs(st - k * beat - pos * beat) < beat / 4
                if p["drums"] and pitch in (35, 36) and on_one:
                    score += 2
                elif p["drums"] and pitch in (38, 40) and pos % num in (1, 3) and num == 4:
                    score += 1
                elif not p["drums"] and pitch < 55 and pitch != prev and on_one:
                    score += 1
                if not p["drums"] and pitch < 55:
                    prev = pitch
        if score > best[0]:
            best = (score, k)
    shift = best[1] * beat
    q = beat / 4  # y cuadramos cada ataque a la semicorchea más cercana (si no, una nota que llega un pelín
    #               antes del compás se quedaría en el compás anterior)
    for p in parts:
        p["notes"] = sorted((int(round((st - shift) / q) * q), max(int(round((en - shift) / q) * q), int(round((st - shift) / q) * q) + int(q)), *rest)
                            for st, en, *rest in p["notes"] if st - shift > -q / 2)
        p["notes"] = [(max(0, st), en, *rest) for st, en, *rest in p["notes"]]


def chord_symbol(c):
    """Acorde → sintaxis de acordes de Tidal: «a'minor», «f'major», «g'dom7»."""
    return f"{NOTE_NAMES[c['root']]}'{c['tidal']}" if c else "~"


def _roman_prog(chords, key):
    out = []
    for c in chords:
        r = roman(c, key)
        if r and (not out or out[-1] != r):
            out.append(r)
    return out[:16]


def reference_text(s, tracks, lang="es"):
    """Resumen para Maestro (va en la sesión como «canción de referencia»)."""
    k = s["key"]["name"] if s.get("key") else "?"
    g = s["groove"]
    secs = " ".join(f'{x["label"]}({x["bars"]})' for x in s["sections"])
    lines = [
        f'Canción de referencia importada: «{s.get("name") or "sin nombre"}». {s["bpm"]} BPM, compás {s["meter"]}, tonalidad {k}, {s["bars"]} compases.',
        f'Progresión: {" ".join(s["progression"]) or "?"} ({" ".join(s["roman"]) or "?"}).',
        f'Estructura (bloques de 4 compases que se repiten): {secs}.',
        f'Groove: {"con swing" if g["swing"] else "recto"}; bombo {g["kicks_per_bar"]} por compás{" (four on the floor)" if g["four_on_floor"] else ""}.',
        f'Instrumentos: {", ".join(s["instruments"])}.',
        f'Trozo cargado como pistas: compases {s["window"]["start"]}-{s["window"]["start"] + s["window"]["bars"] - 1} ({" ".join(s["window"]["chords"])}).',
        "USO: es solo una referencia para estudiar y para INSPIRAR una canción nueva. No la copies: cuando el alumno pida crear algo a partir de ella, "
        "conserva lo que la hace funcionar (tempo, groove, tipo de progresión, estructura, energía) pero escribe melodías nuevas, cambia instrumentos, "
        "acordes o tonalidad y explica qué has tomado prestado y qué has cambiado.",
    ]
    return "\n".join(lines)
