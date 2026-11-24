"""Partitura de la canción (Maestro v2, release 0.15): el «cuaderno de composición» en MusicXML estándar.

Cada canción es un bloque `.tidal` + `.musicxml`. La partitura guarda la parte melódica (melodía, armonía, bajo);
el ritmo de batería, el groove y los efectos siguen en Tidal puro. Este módulo, solo con la biblioteca estándar:

- modelo: {"version", "key", "meter", "parts": [{"id", "name", "role", "track", "sound", "fx", "bars": [[{"p": [midi…], "d": tiempos}]]}]}
  (p vacío = silencio; d en negras; un compás suma los tiempos del compás).
- texto compacto que escribe Maestro: «c5:1 e5:1/2 ~:1/2 [c4,e4,g4]:2 | …» (nota:duración en tiempos, | separa compases).
- partitura → Tidal: un compás por ciclo con «<[…] […]>» (la forma de mini-notación de `cat`/`slowcat`), duraciones con @.
- Tidal → partitura: lee el `note "…"` / `n "…"` que escribe este módulo (y la mini-notación habitual) para llevar a la
  partitura un cambio hecho a mano; si el código tiene trucos que no caben en una partitura, devuelve None («código libre»).
- MusicXML (score-partwise 4.0) de ida y vuelta, legible por MuseScore.

Notas: c5 = MIDI 60 (como en Tidal).
"""
import json
import re
import xml.etree.ElementTree as ET
from fractions import Fraction
from math import gcd

VERSION = 1
NAMES = ["c", "cs", "d", "ef", "e", "f", "fs", "g", "af", "a", "bf", "b"]
STEP_PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
ROLES = ("melodia", "armonia", "bajo")
# Acordes con nombre de Tidal (c'maj7…): intervalos desde la raíz
CHORDS = {
    "major": (0, 4, 7), "maj": (0, 4, 7), "M": (0, 4, 7), "aug": (0, 4, 8), "plus": (0, 4, 8), "six": (0, 4, 7, 9), "6": (0, 4, 7, 9),
    "sixNine": (0, 4, 7, 9, 14), "major7": (0, 4, 7, 11), "maj7": (0, 4, 7, 11), "major9": (0, 4, 7, 11, 14), "maj9": (0, 4, 7, 11, 14),
    "add9": (0, 4, 7, 14), "major11": (0, 4, 7, 11, 14, 17), "dom7": (0, 4, 7, 10), "dom9": (0, 4, 7, 14), "dom11": (0, 4, 7, 17),
    "dom13": (0, 4, 7, 21), "sevenFlat5": (0, 4, 6, 10), "sevenSharp5": (0, 4, 8, 10), "nine": (0, 4, 7, 10, 14), "eleven": (0, 4, 7, 10, 14, 17),
    "thirteen": (0, 4, 7, 10, 14, 17, 21), "minor": (0, 3, 7), "min": (0, 3, 7), "m": (0, 3, 7), "diminished": (0, 3, 6), "dim": (0, 3, 6),
    "minorSharp5": (0, 3, 8), "minor6": (0, 3, 7, 9), "m6": (0, 3, 7, 9), "minor7flat5": (0, 3, 6, 10), "m7flat5": (0, 3, 6, 10),
    "diminished7": (0, 3, 6, 9), "dim7": (0, 3, 6, 9), "minor7": (0, 3, 7, 10), "min7": (0, 3, 7, 10), "m7": (0, 3, 7, 10),
    "minor9": (0, 3, 7, 10, 14), "m9": (0, 3, 7, 10, 14), "minor11": (0, 3, 7, 10, 14, 17), "minorMajor7": (0, 3, 7, 11),
    "one": (0,), "five": (0, 7), "sus2": (0, 2, 7), "sus4": (0, 5, 7), "sevenSus2": (0, 2, 7, 10), "sevenSus4": (0, 5, 7, 10),
}
KEYS_MAJOR = {"C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7, "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7}
KEYS_MINOR = {"A": 0, "E": 1, "B": 2, "F#": 3, "C#": 4, "G#": 5, "D#": 6, "A#": 7, "D": -1, "G": -2, "C": -3, "F": -4, "Bb": -5, "Eb": -6, "Ab": -7}


# ---------------------------------------------------------------- notas

def note_name(m):
    return f"{NAMES[m % 12]}{m // 12}"


NOTE_RE = re.compile(r"^([a-gA-G])((?:s|f|#|b|n)*)(-?\d+)?$")


def parse_note(tok, default_oct=5):
    """«cs5» → 61. Números sueltos son semitonos desde c5 (como `note "0 4 7"`)."""
    t = tok.strip()
    if re.fullmatch(r"-?\d+(?:\.\d+)?", t):
        return 60 + round(float(t))
    m = NOTE_RE.match(t)
    if not m:
        return None
    pc = STEP_PC[m.group(1).lower()]
    for ch in m.group(2):
        pc += {"s": 1, "#": 1, "f": -1, "b": -1, "n": 0}[ch]
    octv = int(m.group(3)) if m.group(3) is not None else default_oct
    return 12 * octv + pc


def parse_chord_name(tok):
    """«c'maj7», «e4'min» → lista de MIDI. None si no es un acorde con nombre."""
    if "'" not in tok:
        return None
    root, _, rest = tok.partition("'")
    base = parse_note(root)
    if base is None:
        return None
    name = rest.split("'")[0]
    iv = CHORDS.get(name)
    if iv is None:
        return None
    return [base + i for i in iv]


def _frac(x):
    if isinstance(x, Fraction):
        return x
    if isinstance(x, str):
        return Fraction(x.strip())
    return Fraction(x).limit_denominator(48)


def bar_beats(meter):
    try:
        a, b = (int(x) for x in str(meter or "4/4").split("/"))
        return Fraction(a * 4, b)
    except (ValueError, ZeroDivisionError):
        return Fraction(4)


# ---------------------------------------------------------------- texto compacto (lo que escribe Maestro)

def parse_compact(text, meter="4/4"):
    """«c5:1 e5:1/2 ~:1/2 [c4,e4,g4]:2 | g4:4» → compases. Rellena con silencio y recorta lo que sobra."""
    full = bar_beats(meter)
    bars = []
    for chunk in str(text or "").split("|"):
        chunk = chunk.strip()
        if not chunk:
            continue
        ev, total = [], Fraction(0)
        for tok in re.findall(r"\[[^\]]*\](?::[\d./]+)?|\S+", chunk):
            pitch, _, dur = tok.rpartition(":") if ":" in tok else (tok, "", "1")
            try:
                d = _frac(dur or "1")
            except (ValueError, ZeroDivisionError):
                raise ValueError(f"Duración no válida: {tok}")
            if d <= 0:
                continue
            if pitch in ("~", "-", "r", "rest"):
                ps = []
            elif pitch.startswith("["):
                ps = [parse_note(x) for x in pitch.strip("[]").split(",") if x.strip()]
                if any(p is None for p in ps):
                    raise ValueError(f"Nota no válida: {tok}")
            else:
                ps = parse_chord_name(pitch) or ([parse_note(pitch)] if parse_note(pitch) is not None else None)
                if ps is None:
                    raise ValueError(f"Nota no válida: {tok}")
            if total + d > full:
                d = full - total
            if d <= 0:
                break
            ev.append({"p": sorted(ps), "d": d})
            total += d
        if total < full:
            ev.append({"p": [], "d": full - total})
        bars.append(ev)
    return bars


def _fmt_d(d):
    d = _frac(d)
    return str(d.numerator) if d.denominator == 1 else f"{d.numerator}/{d.denominator}"


def format_compact(bars):
    out = []
    for bar in bars:
        toks = []
        for e in bar:
            ps = e.get("p") or []
            p = "~" if not ps else note_name(ps[0]) if len(ps) == 1 else "[" + ",".join(note_name(x) for x in ps) + "]"
            toks.append(f"{p}:{_fmt_d(e['d'])}")
        out.append(" ".join(toks))
    return " | ".join(out)


# ---------------------------------------------------------------- partitura → Tidal

def _lcm(a, b):
    return a * b // gcd(a, b)


def bar_to_mini(bar):
    """Un compás → mini-notación con pesos «c5@2 e5 ~ g5@4»."""
    ds = [_frac(e["d"]) for e in bar]
    if not ds:
        return "~"
    den = 1
    for d in ds:
        den = _lcm(den, d.denominator)
    w = [int(d * den) for d in ds]
    g = 0
    for x in w:
        g = gcd(g, x)
    toks = []
    for e, x in zip(bar, w):
        ps = e.get("p") or []
        t = "~" if not ps else note_name(ps[0]) if len(ps) == 1 else "[" + ",".join(note_name(p) for p in ps) + "]"
        k = x // g
        toks.append(t if k == 1 else f"{t}@{k}")
    # funde silencios seguidos
    return " ".join(toks)


def _one_group(b):
    if not (b.startswith("[") and b.endswith("]")):
        return False
    depth = 0
    for i, ch in enumerate(b):
        depth += ch == "["
        depth -= ch == "]"
        if depth == 0 and i < len(b) - 1:
            return False
    return True


def join_bars(bars):
    if all(b == bars[0] for b in bars):
        return bars[0]
    return "<" + " ".join(b if " " not in b or _one_group(b) else f"[{b}]" for b in bars) + ">"


def part_to_tidal(part):
    """Código Tidal de una parte: `note "<…>" # s "sonido"` + sus efectos. Un compás = un ciclo."""
    minis = [bar_to_mini(b) for b in part.get("bars") or []] or ["~"]
    fx = (part.get("fx") or "").strip()
    if "legato" not in fx:
        fx = (fx + " # legato 1").strip()
    sound = part.get("sound") or "superpiano"
    return f'note "{join_bars(minis)}" # s "{sound}"' + (f" {fx}" if fx else "")


# ---------------------------------------------------------------- Tidal → partitura

HEAD_RE = re.compile(r'^\s*(?:note|n)\s+"([^"]*)"\s*(.*)$', re.S)


class _P:
    def __init__(self, s):
        self.s, self.i = s, 0

    def peek(self):
        while self.i < len(self.s) and self.s[self.i] in " \t\n":
            self.i += 1
        return self.s[self.i] if self.i < len(self.s) else ""

    def num(self):
        m = re.match(r"\d+(?:\.\d+)?", self.s[self.i:])
        if not m:
            raise ValueError("número")
        self.i += len(m.group(0))
        return Fraction(m.group(0))

    def seq(self, end):
        """Secuencia hasta `end`: lista de (nodo, peso). Admite «,» (capas: acorde) dentro de […]."""
        layers, items = [], []
        while True:
            c = self.peek()
            if c == "":
                if end:
                    raise ValueError("falta cierre")
                break
            if c == end:
                self.i += 1
                break
            if c == ",":
                self.i += 1
                layers.append(items)
                items = []
                continue
            if c == "_":
                self.i += 1
                if not items:
                    raise ValueError("_ al principio")
                n, w = items[-1]
                items[-1] = (n, w + 1)
                continue
            if c == "!":
                self.i += 1
                if self.peek().isdigit():
                    k = int(self.num())
                    items += [items[-1]] * (k - 1)
                else:
                    items.append(items[-1])
                continue
            node = self.atom()
            w = Fraction(1)
            while self.peek() in ("@", "*", "!"):
                op = self.s[self.i]
                if op == "!":
                    break
                self.i += 1
                k = self.num()
                if op == "@":
                    w = k
                else:
                    if k.denominator != 1 or k < 1:
                        raise ValueError("* no entero")
                    node = ("seq", [(node, Fraction(1))] * int(k))
            items.append((node, w))
        if layers:
            layers.append(items)
            # capas de una sola nota cada una → acorde
            if all(len(lay) == 1 and lay[0][0][0] == "note" for lay in layers):
                return [(("note", sorted(p for lay in layers for p in lay[0][0][1])), Fraction(1))]
            raise ValueError("capas complejas")
        return items

    def atom(self):
        c = self.peek()
        if c == "[":
            self.i += 1
            return ("seq", self.seq("]"))
        if c == "<":
            self.i += 1
            return ("alt", self.seq(">"))
        m = re.match(r"[~A-Za-z0-9'#.\-]+", self.s[self.i:])
        if not m:
            raise ValueError(f"símbolo «{self.s[self.i:self.i + 8]}»")
        tok = m.group(0)
        self.i += len(tok)
        if tok == "~":
            return ("rest",)
        ps = parse_chord_name(tok)
        if ps is None:
            p = parse_note(tok)
            if p is None:
                raise ValueError(f"nota «{tok}»")
            ps = [p]
        return ("note", ps)


def _flatten(items, length, out):
    total = sum(w for _, w in items) or 1
    for node, w in items:
        d = length * w / total
        if node[0] == "seq":
            _flatten(node[1], d, out)
        elif node[0] == "alt":
            raise ValueError("<> anidado")
        elif node[0] == "rest":
            out.append({"p": [], "d": d})
        else:
            out.append({"p": list(node[1]), "d": d})


def _merge_rests(bar):
    out = []
    for e in bar:
        if out and not e["p"] and not out[-1]["p"]:
            out[-1] = {"p": [], "d": out[-1]["d"] + e["d"]}
        else:
            out.append(dict(e))
    return out


def tidal_to_bars(code, meter="4/4"):
    """Lee el patrón de notas de una pista. None si la pista no es «una partitura» (transformaciones, varias capas…)."""
    src = re.sub(r"--[^\n]*", "", str(code or "")).strip()
    m = HEAD_RE.match(src)
    if not m:
        return None
    rest = m.group(2)
    # Lo que va detrás solo puede ser «# param valor»: sonido y efectos. Operadores de notas (|+ n 12) cambian la música.
    if re.search(r"\|[+\-*/<>]|\+\s*n\b|#\s*(?:n|note|up)\b", rest):
        return None
    full = bar_beats(meter)
    try:
        p = _P(m.group(1))
        items = p.seq("")
        if len(items) == 1 and items[0][0][0] == "alt":
            bars_items = [[(it[0], Fraction(1))] for it in items[0][0][1]]
        else:
            bars_items = [items]
        bars = []
        for bi in bars_items:
            ev = []
            _flatten(bi if not (len(bi) == 1 and bi[0][0][0] == "seq") else bi[0][0][1], full, ev)
            bars.append(_merge_rests(ev))
        return bars
    except (ValueError, IndexError, ZeroDivisionError):
        return None


def fx_of(code):
    """Sonido y efectos de una pista con `note "…"` al principio: («sound», «# fx…»)."""
    m = HEAD_RE.match(re.sub(r"--[^\n]*", "", str(code or "")).strip())
    if not m:
        return None, ""
    rest = m.group(2)
    sm = re.search(r'#\s*s(?:ound)?\s+"([^"]*)"', rest)
    sound = sm.group(1) if sm else None
    fx = re.sub(r'#\s*s(?:ound)?\s+"[^"]*"', "", rest).strip()
    return sound, fx


# ---------------------------------------------------------------- partes de la partitura

def new_part(pid, name, role, track, sound, bars, fx=""):
    return {"id": pid, "name": name, "role": role if role in ROLES else "melodia", "track": track, "sound": sound or "superpiano",
            "fx": fx or "", "bars": bars}


def empty_score(key="C", meter="4/4"):
    return {"version": VERSION, "key": key or "C", "meter": meter or "4/4", "parts": []}


def normalize(score):
    """Partitura que llega del navegador o de un JSON: duraciones como Fraction y campos por defecto."""
    if not isinstance(score, dict):
        return None
    out = {"version": VERSION, "key": str(score.get("key") or "C"), "meter": str(score.get("meter") or "4/4"), "parts": []}
    for i, p in enumerate(score.get("parts") or []):
        if not isinstance(p, dict):
            continue
        bars = []
        for b in p.get("bars") or []:
            bars.append([{"p": [int(x) for x in (e.get("p") or [])], "d": _frac(e.get("d") or 1)} for e in b if isinstance(e, dict)])
        out["parts"].append(new_part(str(p.get("id") or f"P{i + 1}"), str(p.get("name") or f"Parte {i + 1}"), p.get("role"),
                                     p.get("track"), p.get("sound"), bars, p.get("fx") or ""))
    return out


def to_json(score):
    """Para el navegador: duraciones como texto «1/2» (exactas) y números enteros cuando se puede."""
    def d(x):
        x = _frac(x)
        return int(x) if x.denominator == 1 else f"{x.numerator}/{x.denominator}"
    return {**{k: v for k, v in score.items() if k != "parts"},
            "parts": [{**{k: v for k, v in p.items() if k != "bars"}, "bars": [[{"p": e["p"], "d": d(e["d"])} for e in b] for b in p["bars"]]}
                      for p in score.get("parts") or []]}


def apply_partitura(score, partitura, tracks=None):
    """Mezcla lo que escribe Maestro («partitura»: {clave, compas, partes: [{id, pista, nombre, sonido, rol, compases}]}).

    Devuelve (partitura nueva, pistas para «cambios.pistas»). Una parte que ya existe se sustituye (misma id o misma pista).
    `desde_compas` (1…) reescribe solo a partir de ese compás: así cada paso de un plan añade su sección.
    """
    score = normalize(score) or empty_score()
    pt = partitura or {}
    if pt.get("clave"):
        score["key"] = str(pt["clave"])
    if pt.get("compas"):
        score["meter"] = str(pt["compas"])
    tracks = tracks or []
    pistas = []
    for p in pt.get("partes") or []:
        if not isinstance(p, dict):
            continue
        bars = parse_compact(p.get("compases") or "", score["meter"])
        if not bars:
            continue
        track = str(p.get("pista") or "").strip() or None
        pid = str(p.get("id") or track or f"P{len(score['parts']) + 1}")
        old = next((x for x in score["parts"] if x["id"] == pid or (track and x.get("track") == track)), None)
        role = p.get("rol") or (old or {}).get("role") or "melodia"
        tk = next((t for t in tracks if t.get("id") == (track or (old or {}).get("track"))), None)
        sound = p.get("sonido") or (old or {}).get("sound") or (fx_of(tk.get("code"))[0] if tk else None) or "superpiano"
        fx = p.get("efectos") if p.get("efectos") is not None else (old or {}).get("fx") or (fx_of(tk.get("code"))[1] if tk else "")
        start = int(p.get("desde_compas") or 0)
        if old and start > 1:
            keep = old["bars"][:start - 1]
            keep += [[{"p": [], "d": bar_beats(score["meter"])}]] * max(0, start - 1 - len(keep))
            bars = keep + bars
        part = new_part(pid, p.get("nombre") or (old or {}).get("name") or pid, role, track or (old or {}).get("track"), sound, bars, fx)
        if old:
            score["parts"][score["parts"].index(old)] = part
        else:
            score["parts"].append(part)
        if part["track"]:
            kind = {"melodia": "melodia", "armonia": "armonia", "bajo": "bajo"}[part["role"]]
            pistas.append({"id": part["track"], "nombre": part["name"], "tipo": kind, "codigo": part_to_tidal(part), "parte": part_json(part)})
    return score, pistas


def summary(score, max_bars=8):
    """Resumen corto para Maestro: cada parte en texto compacto (los primeros compases)."""
    score = normalize(score)
    if not score or not score["parts"]:
        return ""
    lines = [f"PARTITURA (cuaderno de composición, {score['key']}, {score['meter']}):"]
    for p in score["parts"]:
        txt = format_compact(p["bars"][:max_bars])
        more = f" … (+{len(p['bars']) - max_bars} compases)" if len(p["bars"]) > max_bars else ""
        lines.append(f"- {p['id']} «{p['name']}» rol {p['role']} → pista {p.get('track') or '(sin pista)'} · {len(p['bars'])} compases: {txt}{more}")
    return "\n".join(lines)


# ---------------------------------------------------------------- MusicXML

def _key_fifths(key):
    k = str(key or "C").strip()
    minor = k.endswith("m") and not k.endswith("maj")
    root = k[:-1] if minor else k
    root = root[:1].upper() + root[1:].replace("♭", "b").replace("♯", "#")
    return (KEYS_MINOR if minor else KEYS_MAJOR).get(root, 0), "minor" if minor else "major"


def _key_from_fifths(fifths, mode):
    table = KEYS_MINOR if mode == "minor" else KEYS_MAJOR
    for k, v in table.items():
        if v == fifths:
            return k + ("m" if mode == "minor" else "")
    return "C"


def _pitch_xml(m, fifths):
    pc = m % 12
    sharp = fifths >= 0
    names = (["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]) if sharp else \
            (["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0])
    step, alter = names[pc]
    octave = m // 12 - 1
    return step, alter, octave


TYPES = [(Fraction(4), "whole"), (Fraction(2), "half"), (Fraction(1), "quarter"), (Fraction(1, 2), "eighth"),
         (Fraction(1, 4), "16th"), (Fraction(1, 8), "32nd")]


def _type_of(d):
    for base, name in TYPES:
        if d == base:
            return name, 0
        if d == base * Fraction(3, 2):
            return name, 1
    return None, 0


def _split_printable(d):
    """Una duración en trozos que se pueden escribir (2.5 → 2 + 1/2): las notas se unen con ligadura."""
    out = []
    while d > 0:
        for base, _ in TYPES:
            for k in (Fraction(3, 2), Fraction(1)):
                if base * k <= d:
                    out.append(base * k)
                    d -= base * k
                    break
            else:
                continue
            break
        else:
            out.append(d)
            break
    return out


def to_musicxml(score, title=""):
    score = normalize(score) or empty_score()
    fifths, mode = _key_fifths(score["key"])
    beats, beat_type = (str(score["meter"]).split("/") + ["4"])[:2]
    den = 1
    for p in score["parts"]:
        for b in p["bars"]:
            for e in b:
                den = _lcm(den, _frac(e["d"]).denominator)
    divisions = max(1, den)
    root = ET.Element("score-partwise", version="4.0")
    if title:
        work = ET.SubElement(root, "work")
        ET.SubElement(work, "work-title").text = title
    ident = ET.SubElement(root, "identification")
    enc = ET.SubElement(ident, "encoding")
    ET.SubElement(enc, "software").text = "Tidal Studio"
    misc = ET.SubElement(ident, "miscellaneous")
    meta = {p["id"]: {"track": p.get("track"), "sound": p.get("sound"), "role": p.get("role"), "fx": p.get("fx")} for p in score["parts"]}
    ET.SubElement(misc, "miscellaneous-field", name="tidal-studio").text = json.dumps({"version": VERSION, "parts": meta}, ensure_ascii=False)
    plist = ET.SubElement(root, "part-list")
    for i, p in enumerate(score["parts"]):
        sp = ET.SubElement(plist, "score-part", id=f"P{i + 1}")
        ET.SubElement(sp, "part-name").text = p["name"]
        ET.SubElement(sp, "part-abbreviation").text = p["id"]
    for i, p in enumerate(score["parts"]):
        part = ET.SubElement(root, "part", id=f"P{i + 1}")
        bars = p["bars"] or [[{"p": [], "d": bar_beats(score["meter"])}]]
        for n, bar in enumerate(bars):
            meas = ET.SubElement(part, "measure", number=str(n + 1))
            if n == 0:
                at = ET.SubElement(meas, "attributes")
                ET.SubElement(at, "divisions").text = str(divisions)
                k = ET.SubElement(at, "key")
                ET.SubElement(k, "fifths").text = str(fifths)
                ET.SubElement(k, "mode").text = mode
                t = ET.SubElement(at, "time")
                ET.SubElement(t, "beats").text = beats
                ET.SubElement(t, "beat-type").text = beat_type
                cl = ET.SubElement(at, "clef")
                bass = p["role"] == "bajo" or (any(e["p"] for b in bars for e in b) and
                                               sum(x for b in bars for e in b for x in e["p"]) / max(1, sum(len(e["p"]) for b in bars for e in b)) < 55)
                ET.SubElement(cl, "sign").text = "F" if bass else "G"
                ET.SubElement(cl, "line").text = "4" if bass else "2"
            for e in bar:
                pieces = _split_printable(_frac(e["d"]))
                for j, d in enumerate(pieces):
                    pitches = e["p"] or [None]
                    for c, m in enumerate(pitches):
                        note = ET.SubElement(meas, "note")
                        if c > 0:
                            ET.SubElement(note, "chord")
                        if m is None:
                            ET.SubElement(note, "rest")
                        else:
                            step, alter, octave = _pitch_xml(m, fifths)
                            pe = ET.SubElement(note, "pitch")
                            ET.SubElement(pe, "step").text = step
                            if alter:
                                ET.SubElement(pe, "alter").text = str(alter)
                            ET.SubElement(pe, "octave").text = str(octave)
                        ET.SubElement(note, "duration").text = str(int(d * divisions))
                        if m is not None and len(pieces) > 1:
                            if j > 0:
                                ET.SubElement(note, "tie", type="stop")
                            if j < len(pieces) - 1:
                                ET.SubElement(note, "tie", type="start")
                        ET.SubElement(note, "voice").text = "1"
                        typ, dots = _type_of(d)
                        if typ:
                            ET.SubElement(note, "type").text = typ
                            for _ in range(dots):
                                ET.SubElement(note, "dot")
    ET.indent(root, space="  ")
    head = ('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
            '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n')
    return head + ET.tostring(root, encoding="unicode") + "\n"


def _strip_ns(root):
    for el in root.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def from_musicxml(text):
    """MusicXML (score-partwise, p. ej. exportado por MuseScore) → partitura. Solo la voz 1 de cada parte."""
    text = re.sub(r"<!DOCTYPE[^>]*>", "", text if isinstance(text, str) else text.decode("utf-8", "replace"))
    root = _strip_ns(ET.fromstring(text))
    if root.tag != "score-partwise":
        raise ValueError("Solo se admite MusicXML «score-partwise» (expórtalo así desde MuseScore)")
    meta = {}
    for f in root.iter("miscellaneous-field"):
        if f.get("name") == "tidal-studio":
            try:
                meta = json.loads(f.text or "{}").get("parts", {})
            except ValueError:
                meta = {}
    names = {}
    for sp in root.iter("score-part"):
        names[sp.get("id")] = ((sp.findtext("part-name") or "").strip(), (sp.findtext("part-abbreviation") or "").strip())
    key, meter = "C", "4/4"
    parts = []
    for i, part in enumerate(root.findall("part")):
        divisions = Fraction(1)
        bars = []
        voice1 = None
        for meas in part.findall("measure"):
            ev = []
            for el in meas:
                if el.tag == "attributes":
                    if el.findtext("divisions"):
                        divisions = Fraction(el.findtext("divisions"))
                    k = el.find("key")
                    if k is not None and k.findtext("fifths") is not None and i == 0 and not bars:
                        key = _key_from_fifths(int(k.findtext("fifths")), (k.findtext("mode") or "major").strip())
                    t = el.find("time")
                    if t is not None and t.findtext("beats") and i == 0 and not bars:
                        meter = f"{t.findtext('beats').strip()}/{(t.findtext('beat-type') or '4').strip()}"
                elif el.tag == "note":
                    if el.find("grace") is not None or el.find("cue") is not None:
                        continue
                    v = (el.findtext("voice") or "1").strip()
                    voice1 = voice1 or v
                    if v != voice1:
                        continue
                    d = Fraction(int(el.findtext("duration") or 0)) / divisions
                    pe = el.find("pitch")
                    m = None
                    if pe is not None:
                        step = (pe.findtext("step") or "C").strip().upper()
                        m = 12 * (int(pe.findtext("octave") or 4) + 1) + STEP_PC[step.lower()] + round(float(pe.findtext("alter") or 0))
                    unp = el.find("unpitched")
                    if unp is not None:
                        step = (unp.findtext("display-step") or "C").strip()
                        m = 12 * (int(unp.findtext("display-octave") or 4) + 1) + STEP_PC[step.lower()]
                    ties = {t.get("type") for t in el.findall("tie")}
                    if el.find("chord") is not None and ev:
                        if m is not None and m not in ev[-1]["p"]:
                            ev[-1]["p"] = sorted(ev[-1]["p"] + [m])
                        continue
                    if "stop" in ties and ev and m is not None and m in ev[-1]["p"]:
                        ev[-1]["d"] += d  # ligadura dentro del compás: una nota más larga
                        continue
                    ev.append({"p": [m] if m is not None else [], "d": d})
                elif el.tag == "forward":
                    if (el.findtext("voice") or voice1 or "1").strip() == (voice1 or "1"):
                        ev.append({"p": [], "d": Fraction(int(el.findtext("duration") or 0)) / divisions})
            full = bar_beats(meter)
            tot = sum((e["d"] for e in ev), Fraction(0))
            if tot < full:
                ev.append({"p": [], "d": full - tot})
            bars.append(_merge_rests([e for e in ev if e["d"] > 0]))
        name, abbr = names.get(part.get("id"), ("", ""))
        pid = abbr if abbr in meta else (abbr or f"P{i + 1}")
        mt = meta.get(pid, {})
        role = mt.get("role")
        if not role:
            low = name.lower()
            role = "bajo" if ("bass" in low or "bajo" in low) else "armonia" if any(w in low for w in ("piano", "chord", "acorde", "guitar", "pad")) else "melodia"
        parts.append(new_part(pid, name or pid, role, mt.get("track"), mt.get("sound"), bars, mt.get("fx") or ""))
    return {"version": VERSION, "key": key, "meter": meter, "parts": parts}


def part_json(part):
    return to_json({"parts": [part]})["parts"][0]


def attach_parts(pistas, meter="4/4", score=None):
    """Cada pista de melodía, acordes o bajo que sea «una partitura» lleva su parte (`parte`) para el cuaderno.

    Así la partitura sigue a la canción aunque Maestro escriba Tidal directamente. Las pistas con trucos de Tidal
    (every, jux, superimpose…) no llevan parte: son código libre.
    """
    score = normalize(score) or empty_score()
    for p in pistas or []:
        if not isinstance(p, dict) or p.get("parte") or p.get("tipo") not in ROLES:
            continue
        bars = tidal_to_bars(p.get("codigo") or "", meter)
        if not bars or not any(e["p"] for b in bars for e in b):
            continue
        old = next((x for x in score["parts"] if x.get("track") == p.get("id")), None)
        sound, fx = fx_of(p.get("codigo"))
        part = new_part((old or {}).get("id") or p.get("id") or f"P{len(score['parts']) + 1}", p.get("nombre") or (old or {}).get("name") or "",
                        p["tipo"], p.get("id"), sound, bars, fx)
        p["parte"] = part_json(part)
    return pistas
