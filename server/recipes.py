"""Recetas de sonido (Maestro v2, release 0.16).

Una receta es un sonido con su tratamiento: un sample con efectos, o un sintetizador de SuperCollider con sus
parámetros. Se pueden escuchar sobre tu canción, usar en una pista y COMBINAR para crear sonidos nuevos:

- capa (layer): las dos suenan a la vez con el mismo patrón (stack), la segunda un poco más baja.
- mezcla (blend): el sonido de la primera con el tratamiento de la segunda.
- intermedia (morph): el sonido de la primera con los parámetros a medio camino entre las dos.

Receta: {id, name_es, name_en, kind: sample|synth, sound, n?, fx: {efecto: valor}, role, tags, from?: [ids], mode?}
"""
import re

# Efectos que conocemos (orden en el que se escriben) y si son números
FX_ORDER = ["legato", "attack", "release", "sustain", "speed", "accelerate", "voice", "detune", "lpf", "lpq", "hpf",
            "bandf", "shape", "crush", "coarse", "squiz", "vowel", "room", "size", "delay", "delaytime", "delayfeedback",
            "pan", "gain"]


def R(rid, es, en, kind, sound, fx, role, tags, n=None):
    return {"id": rid, "name_es": es, "name_en": en, "kind": kind, "sound": sound, "n": n, "fx": fx, "role": role, "tags": tags}


BUILTIN = [
    R("lofi-keys", "Teclado lo-fi", "Lo-fi keys", "synth", "superpiano", {"lpf": 2200, "crush": 10, "room": 0.3, "gain": 0.9}, "armonia", "lofi warm vinilo"),
    R("dub-stab", "Stab de dub", "Dub stab", "sample", "stab", {"delay": 0.6, "delaytime": 0.375, "delayfeedback": 0.6, "room": 0.5, "size": 0.8, "hpf": 300}, "armonia", "dub reggae eco"),
    R("sub-808", "Sub 808", "808 sub", "sample", "bass1", {"lpf": 220, "shape": 0.3, "legato": 1}, "bajo", "808 trap sub grave"),
    R("acid-saw", "Sierra ácida", "Acid saw", "synth", "supersaw", {"lpf": 900, "lpq": 0.3, "shape": 0.2, "voice": 0.1}, "bajo", "acid house techno"),
    R("fm-bell", "Campana FM", "FM bell", "synth", "superfm", {"release": 1.5, "room": 0.4, "size": 0.7}, "melodia", "campana bell brillante"),
    R("soft-pad", "Pad suave", "Soft pad", "synth", "supersaw", {"attack": 0.4, "release": 2, "lpf": 1800, "room": 0.6, "size": 0.9, "gain": 0.8}, "armonia", "pad ambient cálido"),
    R("square-lead", "Lead cuadrado", "Square lead", "synth", "supersquare", {"lpf": 3000, "delay": 0.25, "delaytime": 0.1875, "delayfeedback": 0.3}, "melodia", "chiptune lead"),
    R("pluck-echo", "Pluck con eco", "Echo pluck", "sample", "pluck", {"delay": 0.4, "delaytime": 0.25, "delayfeedback": 0.45, "room": 0.25}, "melodia", "pluck guitarra eco"),
    R("vinyl-kick", "Bombo de vinilo", "Vinyl kick", "sample", "bd", {"crush": 8, "hpf": 40, "lpf": 5000, "gain": 1.1}, "percusion", "boom bap lofi bombo", n=3),
    R("tight-snare", "Caja seca", "Tight snare", "sample", "sn", {"hpf": 200, "shape": 0.3, "room": 0.1}, "percusion", "caja snare seca", n=2),
    R("air-hat", "Hi-hat con aire", "Airy hat", "sample", "hh", {"hpf": 6000, "room": 0.2, "pan": 0.6, "gain": 0.85}, "percusion", "hihat aire brillante"),
    R("tape-arp", "Arpa de cinta", "Tape arp", "sample", "arpy", {"speed": 0.98, "lpf": 3500, "crush": 12, "room": 0.3}, "melodia", "cinta tape lofi"),
    R("fat-clap", "Palmas gordas", "Fat clap", "sample", "cp", {"room": 0.3, "size": 0.5, "shape": 0.2}, "percusion", "palmas clap house"),
    R("dark-drone", "Drone oscuro", "Dark drone", "synth", "superfm", {"attack": 1, "release": 4, "lpf": 600, "room": 0.8, "size": 0.95}, "textura", "drone ambient oscuro"),
]
BY_ID = {r["id"]: r for r in BUILTIN}


def name(rec, en=False):
    return rec.get("name_en" if en else "name_es") or rec.get("name_es") or rec.get("id")


def _num(v):
    return f"{v:g}" if isinstance(v, (int, float)) else f'"{v}"'


def fx_code(fx):
    keys = [k for k in FX_ORDER if k in (fx or {})] + sorted(k for k in (fx or {}) if k not in FX_ORDER)
    return " ".join(f"# {k} {_num(fx[k])}" for k in keys if re.match(r"^[a-z]+$", k))


def _one(rec, pat, notes_ok):
    sound = rec["sound"] + (f":{rec['n']}" if rec.get("n") is not None and not notes_ok else "")
    head = f'n "{pat}" # s "{sound}"' if notes_ok else f's "{_sounds(pat, sound)}"'
    return (head + " " + fx_code(rec.get("fx"))).strip()


def _sounds(pat, sound):
    """Un patrón rítmico («x ~ x x», «bd*4») con nuestro sonido en cada golpe."""
    return re.sub(r"(?<![\w:~])(?!~)[A-Za-z][\w.]*(:\d+)?", sound, pat) if re.search(r"[A-Za-z]", pat) else pat


def code(rec, pat=None):
    """Código de Tidal de una receta sobre un patrón (por defecto uno que le va a su papel)."""
    pitched = rec.get("kind") == "synth" or rec.get("role") in ("melodia", "armonia", "bajo", "textura")
    if pat is None:
        pat = {"bajo": "c2 ~ c2 g1", "melodia": "c5 e5 g5 e5", "armonia": "<c'maj7 a'min7>", "textura": "c3",
               "percusion": "x*4"}.get(rec.get("role"), "x*4" if not pitched else "c4")
    if rec.get("mode") == "layer" and rec.get("layers"):
        parts = [_one(sub, pat, pitched) for sub in rec["layers"]]
        parts[1:] = [p + " # gain 0.8" for p in parts[1:]]
        return "stack [" + ", ".join(parts) + "]"
    return _one(rec, pat, pitched)


def _mid(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return round((a + b) / 2, 3)
    return a


def combine(a, b, mode="layer", en=False):
    """Una receta nueva a partir de dos. Mode: layer · blend · morph."""
    if mode not in ("layer", "blend", "morph"):
        mode = "layer"
    na, nb = name(a), name(b)
    na_en, nb_en = name(a, True), name(b, True)
    base = {"kind": a.get("kind"), "sound": a["sound"], "n": a.get("n"), "role": a.get("role"),
            "tags": f"{a.get('tags', '')} {b.get('tags', '')}".strip(), "from": [a.get("id"), b.get("id")], "mode": mode}
    if mode == "layer":
        return dict(base, name_es=f"{na} + {nb}", name_en=f"{na_en} + {nb_en}", fx={},
                    layers=[{k: a.get(k) for k in ("kind", "sound", "n", "fx", "role")},
                            {k: b.get(k) for k in ("kind", "sound", "n", "fx", "role")}])
    if mode == "blend":
        return dict(base, name_es=f"{na} con el tratamiento de {nb}", name_en=f"{na_en} with {nb_en}'s processing", fx=dict(b.get("fx") or {}))
    fx = {}
    for k in set(a.get("fx") or {}) | set(b.get("fx") or {}):
        va, vb = (a.get("fx") or {}).get(k), (b.get("fx") or {}).get(k)
        fx[k] = _mid(va, vb) if va is not None and vb is not None else (va if va is not None else vb)
        if va is None or vb is None:   # un efecto que solo tiene una: a la mitad de fuerte si es de cantidad
            if k in ("room", "delay", "crush", "shape", "gain") and isinstance(fx[k], (int, float)):
                fx[k] = round(fx[k] * (0.5 if k != "crush" else 1.5), 3) if k != "gain" else fx[k]
    return dict(base, name_es=f"Entre {na} y {nb}", name_en=f"Between {na_en} and {nb_en}", fx=fx)


def maestro_text(mine, en=False, limit=20):
    """Las recetas para el prompt de Maestro: id, nombre y código de ejemplo."""
    lines = []
    for r in (BUILTIN + list(mine or []))[: limit + len(mine or [])][-(limit + 6):]:
        lines.append(f"- {r['id']} «{name(r, en)}» ({r.get('role') or ''}): {code(r)}")
    return "\n".join(lines)
