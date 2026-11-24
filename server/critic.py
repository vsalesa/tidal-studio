"""Crítico automático OPCIONAL (Maestro v2, release 0.16). Apagado por defecto.

Puntúa cada candidata (una opción de Maestro, «Otra versión» de un curso…) en tres cosas, de 0 a 10, y lo enseña
como una pista al lado de la opción. Es una ayuda: tu oído sigue siendo el juez. Sin LLM, al momento.

- Groove: cuánto se reparten los golpes en la rejilla de semicorcheas, si hay algo a contratiempo y si las pistas
  no se pisan todas en los mismos sitios.
- Armonía: qué parte de las notas cae en la tonalidad (de la partitura o deducida) y si los tiempos fuertes llevan
  notas del acorde.
- Forma: si los compases se repiten con variación (ni todo igual ni todo distinto).
"""
import re

import score as scoremod

STEPS = 16
SCALES = {"major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10]}
_PAT = re.compile(r'\b(?:s|sound|n|note)\s+"([^"]*)"')


def _tokens(s):
    return re.findall(r"\[|\]|<|>|,|~|[^\s\[\]<>,]+", s)


def _parse(toks, i, end):
    """Árbol simple de la mini-notación: lista de nodos; nodo = ("hit"|"rest"|"seq"|"alt"|"stack", ...)."""
    items, layers = [], []
    while i < len(toks):
        t = toks[i]
        if t == end:
            i += 1
            break
        if t == ",":
            layers.append(items)
            items = []
            i += 1
            continue
        if t == "[":
            node, i = _parse(toks, i + 1, "]")
            node = ("seq", node)
        elif t == "<":
            node, i = _parse(toks, i + 1, ">")
            node = ("alt", node)
        else:
            i += 1
            m = re.match(r"^([^*!@]*)(?:\*(\d+))?(?:!(\d+))?", t)
            base, mul, rep = m.group(1), m.group(2), m.group(3)
            node = ("rest",) if base in ("~", "") else ("hit", base)
            if mul:
                node = ("seq", [node] * int(mul))
            if rep:
                items += [node] * (int(rep) - 1)
        # sufijo *n después de un grupo: «[bd sn]*2»
        if i < len(toks) and toks[i].startswith("*") and toks[i][1:].isdigit():
            node = ("seq", [node] * int(toks[i][1:]))
            i += 1
        items.append(node)
    if layers:
        layers.append(items)
        return [("stack", [("seq", lay) for lay in layers])], i
    return items, i


def _onsets(node, start, length, cycle, out):
    kind = node[0]
    if kind == "hit":
        out.append((start, node[1]))
    elif kind == "seq":
        n = len(node[1]) or 1
        for k, ch in enumerate(node[1]):
            _onsets(ch, start + length * k / n, length / n, cycle, out)
    elif kind == "alt":
        if node[1]:
            _onsets(node[1][cycle % len(node[1])], start, length, cycle, out)
    elif kind == "stack":
        for ch in node[1]:
            _onsets(ch, start, length, cycle, out)


def onsets(code, cycle=0):
    """Golpes del primer patrón de la pista en un ciclo: [(posición 0..1, símbolo)]."""
    m = _PAT.search(str(code or ""))
    if not m:
        return []
    try:
        tree, _ = _parse(_tokens(m.group(1)), 0, None)
    except (IndexError, ValueError, AttributeError):
        return []
    out = []
    _onsets(("seq", tree), 0.0, 1.0, cycle, out)
    return out


def _grid(ons):
    return {round(p * STEPS) % STEPS for p, _ in ons}


def _groove(tracks):
    notes = []
    grids = []
    for t in tracks:
        g = _grid(onsets(t.get("code") or t.get("codigo")))
        if g:
            grids.append(g)
    if not grids:
        return None, []
    union = set().union(*grids)
    cover = len(union) / STEPS
    off = sum(1 for s in union if s % 4 != 0) / max(1, len(union))
    overlap = 0.0
    if len(grids) > 1:
        pairs = [(a, b) for i, a in enumerate(grids) for b in grids[i + 1:]]
        overlap = sum(len(a & b) / max(1, min(len(a), len(b))) for a, b in pairs) / len(pairs)
    sc = 4 + 4 * min(1, cover / 0.6) + 2 * min(1, off / 0.35) - 3 * max(0, overlap - 0.6)
    if off < 0.1:
        notes.append(("casi todo cae en el tiempo: prueba algún golpe a contratiempo", "almost everything is on the beat: try a hit off the beat"))
    if overlap > 0.75:
        notes.append(("las pistas golpean casi siempre a la vez", "the tracks hit at the same time almost always"))
    if cover < 0.3:
        notes.append(("mucho hueco en la rejilla", "lots of empty space in the grid"))
    return max(0, min(10, round(sc, 1))), notes


def _key_of(score, pitches):
    if score and score.get("key"):
        k = score["key"]
        root = scoremod.parse_note(k.rstrip("m").lower() + "5")
        if root is not None:
            return root % 12, "minor" if k.endswith("m") else "major"
    best = (0, "major", -1)
    for r in range(12):
        for mode, sc in SCALES.items():
            fit = sum(1 for p in pitches if (p - r) % 12 in sc)
            if fit > best[2]:
                best = (r, mode, fit)
    return best[0], best[1]


def _harmony(tracks, score):
    pitches, strong = [], []
    for t in tracks:
        if (t.get("kind") or t.get("tipo")) not in ("melodia", "armonia", "bajo"):
            continue
        bars = scoremod.tidal_to_bars(t.get("code") or t.get("codigo") or "")
        if not bars:
            continue
        for bar in bars:
            pos = 0
            for e in bar:
                pitches += e["p"]
                if pos == 0 and e["p"]:
                    strong.append(e["p"])
                pos += e["d"]
    if not pitches:
        return None, []
    root, mode = _key_of(score, pitches)
    scale = SCALES[mode]
    inkey = sum(1 for p in pitches if (p - root) % 12 in scale) / len(pitches)
    sc = 2 + 8 * inkey
    notes = []
    if inkey < 0.8:
        notes.append((f"{round((1 - inkey) * 100)} % de notas fuera de la tonalidad", f"{round((1 - inkey) * 100)} % of the notes are outside the key"))
    return max(0, min(10, round(sc, 1))), notes


def _form(tracks):
    distinct, total = [], []
    for t in tracks:
        code = t.get("code") or t.get("codigo") or ""
        if not _PAT.search(code):
            continue
        seen = set()
        for c in range(8):
            seen.add(tuple(sorted((round(p, 3), s) for p, s in onsets(code, c))))
        distinct.append(len(seen))
        total.append(8)
    if not distinct:
        return None, []
    var = sum(distinct) / sum(total)            # 1/8 = todo igual · 1 = todo distinto
    sc = 10 - abs(var - 0.4) * 14
    notes = []
    if var <= 0.13:
        notes.append(("todos los compases son iguales: prueba < > o every para variar", "every bar is the same: try < > or every to vary it"))
    elif var > 0.8:
        notes.append(("cada compás es distinto: cuesta reconocer un motivo", "every bar is different: hard to hear a motif"))
    return max(0, min(10, round(sc, 1))), notes


def judge(candidate, song_tracks=None, score=None, lang="es"):
    """Puntúa la canción tal y como quedaría con la candidata aplicada. {groove, harmony, form, total, notes}."""
    tracks = {t.get("id"): dict(t) for t in (song_tracks or []) if isinstance(t, dict)}
    for p in (candidate or {}).get("pistas") or []:
        if not isinstance(p, dict):
            continue
        if p.get("eliminar"):
            tracks.pop(p.get("id"), None)
            continue
        tracks[p.get("id")] = {"id": p.get("id"), "code": p.get("codigo"), "kind": p.get("tipo")}
    live = [t for t in tracks.values() if not t.get("muted")]
    g, gn = _groove(live)
    h, hn = _harmony(live, score)
    f, fn = _form(live)
    parts = [x for x in (g, h, f) if x is not None]
    en = lang == "en"
    return {"groove": g, "harmony": h, "form": f, "total": round(sum(parts) / len(parts), 1) if parts else None,
            "notes": [n[1] if en else n[0] for n in gn + hn + fn][:3]}
