"""Perfiles de estilo medidos en canciones reales (no reglas escritas a mano).

server/data/style_profiles.json sale de analizar canciones en MIDI de cada género (merengue, salsa, cumbia,
bossa nova) del Lakh MIDI Dataset y de PDMX, y de un baterista real de reggaeton (Groove MIDI Dataset).
Solo guarda estadística: en qué semicorchea suele tocar el bajo, el piano, la guitara o los metales, qué
nota del acorde toca el bajo en cada sitio, qué hace cada percusión y las progresiones más repetidas.
Ninguna canción se copia ni se incluye. Maestro lo recibe como «así lo hacen las canciones de verdad».
"""
import json
import os

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "style_profiles.json")
ALIASES = {"merengue": "merengue", "salsa": "salsa", "cumbia": "cumbia", "bossa": "bossa", "reggaeton": "reggaeton",
           "reguetón": "reggaeton", "regueton": "reggaeton", "reggaetón": "reggaeton"}
ROLES = {"bass": "Bajo", "keys": "Piano/teclados", "guitar": "Guitarra", "brass": "Metales", "sax": "Saxo"}
_cache = None


def load():
    global _cache
    if _cache is None:
        try:
            with open(PATH, encoding="utf-8") as f:
                _cache = json.load(f)
        except (OSError, ValueError):
            _cache = {}
    return _cache


def genre_in(*texts):
    t = " ".join(str(x or "") for x in texts).lower()
    for word, g in ALIASES.items():
        if word in t:
            return g
    return None


def _row(vals):
    return " ".join(f"{v:>3}" for v in vals)


def text_for(genre):
    p = load().get(genre)
    if not p:
        return ""
    lines = [f"PERFIL MEDIDO DE {genre.upper()} (estadística de {p['songs']} canción(es) reales en MIDI; no son reglas "
             "inventadas: úsalo para que tus patrones suenen como las canciones de verdad, sin copiar ninguna). "
             "Rejilla: 16 semicorcheas por compás (1 = tiempo 1, 5 = tiempo 2, 9 = tiempo 3, 13 = tiempo 4); "
             "los números son el % de compases con un golpe en ese paso."]
    if p.get("tempo"):
        lines.append(f"Tempos (BPM del MIDI): {', '.join(map(str, p['tempo']))}.")
    for role, d in (p.get("roles") or {}).items():
        rh = "; ".join(f"{r['grid']} ({r['pct']}%)" for r in d["rhythms"])
        lines.append(f"{ROLES.get(role, role)} ({d['bars']} compases): pasos {_row(d['onsets'])}. Ritmos más comunes: {rh}."
                     + (f" Notas por golpe: {d['notes_per_hit']}." if d.get("notes_per_hit") else ""))
        if d.get("degrees"):
            lines.append("  Nota del acorde que toca el bajo (R raíz, 5 quinta, 3 tercera…): "
                         + "; ".join(f"paso {k}: {', '.join(v)}" for k, v in d["degrees"].items()) + ".")
    for name, v in list((p.get("percussion") or {}).items())[:10]:
        lines.append(f"Percusión {name}: {_row(v)}")
    if p.get("velocity"):
        for name, v in p["velocity"].items():
            lines.append(f"Fuerza media (velocity) {name}: {_row(v)}")
    if p.get("progressions"):
        lines.append("Progresiones más repetidas: " + " | ".join(p["progressions"]) + ".")
    return "\n".join(lines)
