#!/usr/bin/env python3
"""Aprende el estilo de un género a partir de canciones en MIDI (para que Maestro y los cursos «sepan» cómo suena).

Mide, compás a compás y en una rejilla de 16 semicorcheas: cuándo tocan el bajo, el piano, la guitarra y los
metales, qué nota del acorde toca el bajo en cada sitio, qué hace cada percusión (mapa General MIDI) y qué
progresiones de acordes se repiten. El resultado es estadística, no las canciones: sirve para aprender un estilo
sin copiar ninguna. Así se hicieron los perfiles de merengue, salsa, cumbia y bossa nova de server/data/.
"""

import sys, json, os, glob
from collections import Counter, defaultdict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
from songimport import parse_midi, detect_chord, detect_key, roman, KEY_NAMES

def role(prog, name, pitches, ch):
    n = (name or "").lower()
    if ch == 9: return "drums"
    med = sorted(pitches)[len(pitches)//2] if pitches else 60
    if "bass" in n or "bajo" in n or (prog is not None and 32 <= prog <= 39): return "bass" if med < 60 else "keys"
    if prog is None: prog = 0
    if prog <= 7 or 16 <= prog <= 23: return "keys"
    if 24 <= prog <= 31: return "guitar"
    if 56 <= prog <= 63: return "brass"
    if 64 <= prog <= 71: return "sax"
    if 72 <= prog <= 79: return "flute"
    if 40 <= prog <= 55: return "strings"
    if 80 <= prog <= 95: return "synth"
    return "other"

def analyse(path):
    m = parse_midi(open(path, "rb").read())
    ppq = m["ppq"]; bar = ppq * 4; step = bar / 16
    bpm = round(60_000_000 / m["tempos"][0][1]) if m["tempos"] else 120
    parts = defaultdict(list)
    for t in m["tracks"]:
        by = defaultdict(list)
        for n in t["notes"]: by[n[4]].append(n)
        for ch, notes in by.items():
            r = role(t["programs"].get(ch), t["name"], [n[2] for n in notes], ch)
            parts[r] += notes
    allp = [n for r, ns in parts.items() if r != "drums" for n in ns]
    if not allp: return None
    nb = max(n[0] for n in allp) // bar + 1
    hist = [0]*12
    for n in allp: hist[n[2] % 12] += (n[1]-n[0])
    key = detect_key(hist)
    # acorde por compás (todas las notas, con el bajo)
    chords = []
    for b in range(nb):
        h = [0]*12; bass = None
        for n in allp:
            if n[0] < (b+1)*bar and n[1] > b*bar:
                h[n[2] % 12] += min(n[1], (b+1)*bar) - max(n[0], b*bar)
        bl = [n for n in parts.get("bass", []) if b*bar <= n[0] < (b+1)*bar]
        if bl: bass = min(bl, key=lambda n: n[0])[2] % 12
        chords.append(detect_chord(h, bass))
    out = {"bpm": bpm, "bars": nb, "key": key["name"], "mode": key["mode"], "roles": {}, "chords": chords, "keyobj": key}
    for r, ns in parts.items():
        bars = defaultdict(lambda: [0]*16); iv = defaultdict(Counter); polys = []
        for n in ns:
            b = int(n[0] // bar); k = round((n[0] - b*bar) / step)
            if k >= 16: b, k = b+1, 0
            if b >= nb: continue
            bars[b][k] = 1
            if r == "drums":
                bars[(b, n[2])]  # noqa
            c = chords[b] if b < len(chords) else None
            if c and r != "drums":
                iv[k][(n[2] - c["root"]) % 12] += 1
        dr = defaultdict(lambda: [0]*16)
        if r == "drums":
            for n in ns:
                b = int(n[0] // bar); k = round((n[0] - b*bar) / step) % 16
                dr[n[2]][k] += 1
        # notas a la vez (acordes) para teclados/guitarra
        if r in ("keys", "guitar", "brass"):
            on = Counter(n[0] for n in ns); polys = list(on.values())
        out["roles"][r] = {"bars": {b: "".join(map(str, v)) for b, v in bars.items() if isinstance(b, int)},
                           "iv": {k: dict(c) for k, c in iv.items()}, "drums": {p: v for p, v in dr.items()},
                           "poly": round(sum(polys)/len(polys), 1) if polys else None,
                           "range": (min(n[2] for n in ns), max(n[2] for n in ns))}
    return out

IVN = {0: "R", 7: "5", 4: "3", 3: "b3", 10: "b7", 11: "7", 2: "9", 5: "4", 9: "6", 1: "b9", 6: "#4", 8: "b6"}
GM = {35:"kick",36:"kick",37:"rim",38:"snare",40:"snare",39:"clap",42:"hh",44:"hhp",46:"ohh",49:"crash",51:"ride",53:"bell",56:"cowbell",
      60:"bongo hi",61:"bongo lo",62:"conga mute",63:"conga open",64:"conga low",65:"timbal hi",66:"timbal lo",67:"agogo hi",68:"agogo lo",
      69:"cabasa",70:"maracas",73:"guiro short",74:"guiro long",75:"claves",76:"woodblock hi",77:"woodblock lo",54:"tambourine",41:"tom",43:"tom",45:"tom",47:"tom",48:"tom",50:"tom",57:"crash"}


import references  # noqa: E402
from songimport import roman as _roman  # noqa: E402

def pat(s):  # "1000001010000010" -> "x . . . . . x . x . . . . . x ."
    return " ".join("x" if c == "1" else "." for c in s)

def profile(genre, files, ref=None):
    res = [r for r in (analyse(f) for f in files) if r]
    out = {"songs": len(res), "tempo": sorted(r["bpm"] for r in res), "minor": sum(r["mode"] == "minor" for r in res), "roles": {}}
    for role in ("bass", "keys", "guitar", "brass", "sax"):
        pats = Counter(); onp = [0]*16; nb = 0; iv = defaultdict(Counter); poly = []; songs = 0
        for r in res:
            d = r["roles"].get(role)
            if not d: continue
            songs += 1
            for s in d["bars"].values():
                if "1" not in s: continue
                pats[s] += 1; nb += 1
                for k, ch in enumerate(s): onp[k] += ch == "1"
            for k, c in d["iv"].items():
                for a, n in c.items(): iv[int(k)][int(a)] += n
            if d["poly"]: poly.append(d["poly"])
        if nb < 40 or songs < 2: continue
        e = {"songs": songs, "bars": nb, "onsets": [round(100*x/nb) for x in onp],
             "rhythms": [{"grid": pat(s), "pct": round(100*n/nb)} for s, n in pats.most_common(3)],
             "notes_per_hit": round(sum(poly)/len(poly), 1) if poly else None}
        if role == "bass":
            e["degrees"] = {k+1: [f"{IVN[a]} {round(100*n/sum(iv[k].values()))}%" for a, n in iv[k].most_common(3)]
                            for k in range(16) if sum(iv[k].values()) > nb * 0.25}
        out["roles"][role] = e
    perc = defaultdict(lambda: [0]*16); pb = 0
    for r in res:
        d = r["roles"].get("drums")
        if not d: continue
        pb += r["bars"]
        for p, v in d["drums"].items():
            nm = GM.get(int(p))
            if nm:
                for k in range(16): perc[nm][k] += v[k]
    if pb:
        out["percussion"] = {nm: [min(100, round(100*x/pb)) for x in v] for nm, v in sorted(perc.items(), key=lambda x: -sum(x[1])) if sum(v) >= pb*0.5}
    grams = Counter()
    for r in res:
        seq = []
        for c in r["chords"]:
            rn = _roman(c, r["keyobj"]) if c else ""
            if rn and (not seq or seq[-1] != rn): seq.append(rn)
        for i in range(len(seq)-3): grams[" ".join(seq[i:i+4])] += 1
    out["progressions"] = [g for g, n in grams.most_common(5)]
    return out

def drums_profile(member, root):
    m = parse_midi(references.read_midi(root, member))
    p = references.profile(m)
    return {"songs": 1, "drummer": member, "percussion": {r: [round(100*x) for x in v["often"]] for r, v in p.items()},
            "velocity": {r: v["vel"] for r, v in p.items()}}



def main():
    """Uso: python3 tools/learn_style.py GÉNERO archivo.mid [más.mid | carpeta …]
    Añade (o reemplaza) el perfil de ese género en server/data/style_profiles.json con la estadística de tus MIDI.
    Solo se guardan porcentajes y patrones de ritmo: ninguna nota de ninguna canción."""
    if len(sys.argv) < 3:
        print(main.__doc__); sys.exit(1)
    genre, files = sys.argv[1].lower(), []
    for a in sys.argv[2:]:
        files += sorted(glob.glob(os.path.join(a, "**", "*.mid*"), recursive=True)) if os.path.isdir(a) else [a]
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server", "data", "style_profiles.json")
    data = json.load(open(out, encoding="utf-8")) if os.path.exists(out) else {}
    data[genre] = profile(genre, files)
    json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{genre}: {data[genre]['songs']} canciones → {out}")


if __name__ == "__main__":
    main()
