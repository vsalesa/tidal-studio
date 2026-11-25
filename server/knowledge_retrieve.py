"""Búsqueda en las skills con el índice FTS5 y contexto padre–hijo (0.21).

Para cada mensaje:
  1. Se analiza la petición: palabras (con su traducción ES↔EN del vocabulario musical), género de la canción,
     papeles que se tocan (bajo, piano, clave…) y tipo de tarea (componer, arreglar, evaluar, letra).
  2. FTS5 BM25 propone secciones «hijo» (trozos pequeños) de las skills elegidas; se reordenan sin IA: el mensaje
     pesa el doble que el contexto de la canción, una sección de otro género o de letra cuando no hay letra baja.
  3. Expansión determinista ANTES de llamar a la IA: a un hijo se le añade su padre (ruta, para qué sirve, cuándo
     no) cuando tiene excepciones («unless», «avoid», «nunca»…), cuando la tarea mezcla varios instrumentos que
     dependen unos de otros, cuando es un trozo de una sección partida o cuando no trae ejemplo y el padre sí. Las
     secciones hermanas de «errores / evita / excepciones» van con él si caben.
  4. Se empaqueta por presupuesto en tokens ESTIMADOS: lo que no cabe no se recorta, se queda en el índice y
     Maestro puede pedirlo con «mas_skills» (una vez).
Devuelve el texto para el prompt y una traza por sección (de dónde sale, líneas, por qué).
"""
import os
import re

import knowledge_parse as kparse
import knowledge_store as ks

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALIASES_PATH = os.path.join(ROOT, "server", "data", "music_aliases.json")
_ALIASES = {"mtime": None, "data": {}}

BUDGET_SIMPLE = 2000      # tokens estimados de skills para una petición sencilla
BUDGET_MULTI = 3500       # … para componer/arreglar varias pistas a la vez
PARENT_MAX = 1400         # caracteres del texto propio del padre que van enteros; si es más largo, sus reglas
HEAD_MAX = 1200           # introducción de cada skill
MIN_PER_SKILL = 700       # tokens mínimos por skill cargada
STOP = set("""a al algo como con cual cuando de del donde el ella en era es esa ese esta este eso esto ha hay la las le
lo los mas me mi mis muy no nos o para pero por que quiero se si sin su sus te tu un una uno unos y ya yo the and for
with that this you your are can from have into make more what when which will would want like just some them they
then than also use used using about only over very should could their there these those other while haz hazlo pon
quita dame hacer haga sea tipo mas mejor algo cancion song track parte""".split())


def aliases():
    try:
        m = os.path.getmtime(ALIASES_PATH)
    except OSError:
        return {}
    if _ALIASES["mtime"] != m:
        _ALIASES["data"] = ks.load_aliases(ALIASES_PATH)
        _ALIASES["mtime"] = m
    return _ALIASES["data"]


def aliases_version():
    a = aliases()
    return f"{a.get('version', 0)}:{_ALIASES['mtime']}"


def _words(text):
    return [w for w in re.findall(r"[a-z0-9]{3,}", ks.norm(text)) if w not in STOP]


def _vocab_hits(text, table):
    t = " " + ks.norm(text) + " "
    out = set()
    for value, words in (table or {}).items():
        for w in words:
            if re.search(r"(?<![a-z0-9])" + re.escape(ks.norm(w)) + r"(?![a-z0-9])", t):
                out.add(value)
                break
    return out


def analyze(query, extra="", genre=""):
    """Qué pide el mensaje: términos de búsqueda (mensaje y contexto por separado), género, papeles y tarea."""
    al = aliases()
    tags = al.get("tags") or {}
    genres = _vocab_hits(query + " " + genre + " " + extra, tags.get("genre"))
    roles = _vocab_hits(query, tags.get("role"))
    tasks = _vocab_hits(query, tags.get("task"))

    expand = al.get("expand") or {}

    def groups(text):
        """Conceptos del texto: cada palabra con sus traducciones forma UN grupo (así «acordes» → chords, chord,
        voicing, harmony no pesa cuatro veces más que «modulación»)."""
        n = " " + ks.norm(text) + " "
        out = []
        for idiom, add in (al.get("idioms") or {}).items():
            if " " + ks.norm(idiom) + " " in n:
                n = n.replace(" " + ks.norm(idiom) + " ", " ")
                if add:
                    out.append(_words(add))
        for ph, add in (al.get("phrases") or {}).items():
            if ks.norm(ph) in n:
                out.append(_words(add))
        for w in _words(n):
            g = [w]
            key = w if w in expand else next((x for x in (w[:-2], w[:-1]) if x in expand and len(x) >= 3 and w.endswith(("s", "es"))), None)
            if key:
                g += _words(expand[key])
            ctx = (al.get("context") or {}).get(w)
            if ctx and (not ctx.get("if_genre") or genres & set(ctx["if_genre"])):
                g += _words(ctx["add"])
            out.append(list(dict.fromkeys(g)))
        seen, res = set(), []
        for g in out:
            g = [x for x in g if x not in seen]
            seen.update(g)
            if g:
                res.append(g)
        return res[:14]
    gq = groups(query)
    gc = [g for g in groups(extra + " " + genre)][:10]
    q = [t for g in gq for t in g][:40]
    c = [t for g in gc for t in g if t not in q][:30]
    lyrics = bool({"lyrics"} & tasks) or "vocal" in roles
    multi = len(roles & set(al.get("roles_multi") or [])) >= 2 or bool({"compose", "arrange"} & tasks)
    return {"q": q, "c": c, "gq": gq, "gc": gc, "genres": genres, "roles": roles, "tasks": tasks, "lyrics": lyrics, "multi": multi}


def _grouped(groups, sid):
    """Suma por concepto de la puntuación BM25 de FTS5 (cada grupo es una búsqueda OR de sus palabras)."""
    out = {}
    for g in groups:
        for i, r in ks.search(g, [sid]).items():
            out[i] = out.get(i, 0.0) + -r
    return out


def _score_sections(sid, a, tagmap_cache):
    rq = _grouped(a.get("gq") or [a["q"]], sid)
    rc = _grouped(a.get("gc") or ([a["c"]] if a["c"] else []), sid)
    ids = set(rq) | set(rc)
    if not ids:
        return {}
    tags = ks.tags_of(ids)
    tagmap_cache.update(tags)
    out = {}
    for i in ids:
        sc = rq.get(i, 0.0) + 0.5 * rc.get(i, 0.0)
        t = tags.get(i, set())
        g = {v for k, v in t if k == "genre"}
        r = {v for k, v in t if k == "role"}
        tk = {v for k, v in t if k == "task"}
        if a["genres"] and g:
            sc *= 1.25 if g & a["genres"] else 0.6       # otro género: puede trasladar reglas que no aplican
        if a["roles"] and r & a["roles"]:
            sc *= 1.15
        if ("lyrics" in tk or "vocal" in r) and not a["lyrics"] and not (r - {"vocal"}):
            sc *= 0.5                                     # letra/voz cuando se pide algo instrumental
        out[i] = sc
    return out


def _needs_parent(sec, text, a, parent, tags=()):
    """Motivos (lista) para mandar el padre y sus advertencias junto al hijo."""
    why = []
    if parent is None:
        return why
    if sec["kind"] in ("rule-with-exceptions", "caveat") or kparse.CONSTRAINT.search(text or ""):
        why.append("exceptions")
    if any(k == "genre" for k, _ in tags) or a["genres"]:
        why.append("genre-scope")
    if a["multi"]:
        why.append("multi-track")
    if sec["part"]:
        why.append("split-section")
    if not re.search(r"```|~~~|\d|\|", text or "") and parent["kind"] in ("example", "code"):
        why.append("example-in-parent")
    return why


def _parent_envelope(parent_text, parent):
    """Texto del padre: entero si es corto; si es largo, su primer bloque y TODAS sus líneas con condiciones
    (copiadas tal cual, nunca resumidas)."""
    own = kparse.own_text({"heading": parent["heading"], "part": parent["part"], "text": parent_text})
    if len(own) <= PARENT_MAX:
        return own, False
    blocks = re.split(r"\n\s*\n", own)
    keep = [blocks[0]] + [ln for b in blocks[1:] for ln in b.split("\n") if kparse.CONSTRAINT.search(ln)]
    return "\n".join(keep)[:PARENT_MAX * 2], True


def _label(sec):
    return f"{sec['rel_path']}#{re.sub(r' \(\d+\)$', '', sec['heading']) if sec['part'] <= 1 else sec['heading']}" if sec["heading"] else f"{sec['rel_path']}#—"


CHILD_SHARE = 0.6     # primera pasada: los mejores hijos hasta el 60 % del presupuesto; luego sus excepciones; luego más hijos
ENV_SHARE = 0.3       # el sobre de un hijo no pasa del 30 % del presupuesto de la skill (lo demás: punteros §)
GLOBAL_REL = 0.2      # una sección entra si llega al 20 % de la mejor del mensaje (de cualquier skill)


def _own(x, text):
    return kparse.own_text({"heading": x["heading"], "part": x["part"], "text": text})


def _envelope(sec, i, a, by_id, allsecs, tags, taken, room):
    """Sobre de un hijo: (texto, ids, motivos, punteros). Advertencias/errores/excepciones de su sección o de las que
    la contienen y su padre, enteros y en ese orden, hasta `room` tokens. Lo que no cabe se nombra, no se recorta."""
    parent = by_id.get(sec["parent_id"])
    own = sec["_own"]
    reasons = _needs_parent(sec, own, a, parent, tags) if parent is not None else []
    if not reasons:
        return "", [], [], []
    anc, p = [], parent
    while p is not None:
        anc.append(p["section_id"])
        p = by_id.get(p["parent_id"])
    cands = [("caveat", x) for x in allsecs if x["kind"] == "caveat" and x["enabled"] and x["section_id"] != i
             and x["parent_id"] in anc]
    if parent["enabled"] and not (parent["rel_path"] == "SKILL.md" and parent["level"] <= 1):
        cands.insert(1 if cands else 0, ("parent", parent))
    env, ids, pointer = "", [], []
    for what, x in cands:
        if x["section_id"] in taken or x["section_id"] in ids:
            continue
        xt = ks.read_section(x)
        if xt is None:
            continue
        if what == "parent":
            txt, partial = _parent_envelope(xt, x)
            label = f"Contexto (padre{' · solo sus condiciones' if partial else ''})"
        else:
            txt = _own(x, xt)
            label = "Excepciones y errores a evitar (misma sección)"
        if not txt.strip():
            continue
        chunk = f"\n##### {label}: {x['rel_path']} · {x['heading_path']} [§{x['section_id']}]\n{txt}\n"
        ct = ks.estimate_tokens(chunk)
        if ct <= room:
            env += chunk
            ids.append(x["section_id"])
            room -= ct
        elif what == "caveat":
            pointer.append(x["section_id"])
    if pointer:
        note = ("\n(Hay más excepciones de esta sección en " + ", ".join(f"§{x}" for x in pointer[:4]) +
                ": pídelas con «mas_skills» si vas a aplicar esta regla a fondo.)\n")
        if ks.estimate_tokens(note) <= room:
            env += note
    return env, ids, reasons, pointer


def build(skill_entries, a, child_only=False, budget=None):
    """skill_entries: [(skill dict de skills.scan, source_id, score, pinned)]. Devuelve (parts, loaded, meta)."""
    budget = budget or (BUDGET_MULTI if a["multi"] else BUDGET_SIMPLE)
    per = max(MIN_PER_SKILL, budget // max(1, len(skill_entries)))
    parts, loaded, used_tok = [], [], 0
    tagcache = {}
    scored = [(e, _score_sections(e[1], a, tagcache)) for e in skill_entries]
    gtop = max((max(sc.values()) for _, sc in scored if sc), default=0)
    for (s, sid, sc, pinned), scores in scored:
        allsecs = ks.source_sections(sid)
        if not allsecs:
            continue
        by_id = {x["section_id"]: x for x in allsecs}
        intro = next((x for x in allsecs if x["rel_path"] == "SKILL.md" and x["ordinal"] == 0 and x["enabled"]), None)
        head = f"### Skill «{s['name']}»" + (f" ({s['license']})" if s.get("license") else "") + "\n"
        if s.get("language") == "strudel":
            import skills as _sk
            head += _sk.STRUDEL_NOTE + "\n"
        tok = ks.estimate_tokens(head)
        head_text = head
        taken = set()
        if intro:
            itext = ks.read_section(intro)
            if itext is not None:
                own = _own(intro, itext)
                if own and len(own) <= HEAD_MAX:
                    head_text += own + "\n"
                    tok += ks.estimate_tokens(own)
                taken.add(intro["section_id"])
        top = max(scores.values()) if scores else 0
        floor = max(0.5, 0.25 * top, GLOBAL_REL * gtop)
        ranked = sorted(((v, i) for i, v in scores.items() if v >= floor and i in by_id), key=lambda x: (-x[0], x[1]))
        picked = []      # [(v, sec, piece, ptok)]
        def child(v, i):
            sec = by_id[i]
            if i in taken or not sec["enabled"]:
                return None
            text = ks.read_section(sec)
            if text is None:
                return None
            sec = dict(sec, _own=_own(sec, text))
            piece = f"\n#### {sec['rel_path']} · {sec['heading_path']} [§{i}]\n{sec['_own']}\n"
            return v, sec, piece, ks.estimate_tokens(piece)
        # 1) los mejores hijos, hasta CHILD_SHARE del presupuesto de esta skill
        rest = []
        for v, i in ranked:
            c = child(v, i)
            if not c:
                continue
            if tok + c[3] <= per * (1.0 if child_only else CHILD_SHARE) or not picked and tok + c[3] <= per:
                picked.append(c)
                taken.add(i)
                tok += c[3]
            else:
                rest.append((v, i))
        # 2) el sobre (padre y excepciones) de cada hijo elegido, en orden
        envs = {}
        if not child_only:
            for v, sec, piece, ptok in picked:
                env, ids, reasons, pointer = _envelope(sec, sec["section_id"], a, by_id, allsecs,
                                                       tagcache.get(sec["section_id"], set()), taken,
                                                       min(per - tok, int(ENV_SHARE * per)))
                tok += ks.estimate_tokens(env) if env else 0
                taken.update(ids)
                envs[sec["section_id"]] = (env, ids, reasons, pointer)
        # 3) más hijos con lo que quede (solos: su sobre no se calcula para no pasar del presupuesto)
        for v, i in rest:
            if i in taken:
                continue
            c = child(v, i)
            if c and tok + c[3] <= per:
                picked.append(c)
                taken.add(i)
                tok += c[3]
        intro_hit = bool(intro and scores.get(intro["section_id"], 0) >= floor)
        if not picked and not pinned and not intro_hit:
            continue    # encajaba por la descripción, pero ninguna sección: no gasta contexto
        body, trace = head_text, []
        if intro_hit and not picked:   # una skill sin títulos: todo su contenido es la introducción y es lo que encaja
            trace.append({"id": intro["section_id"], "file": "SKILL.md", "heading": intro["heading_path"],
                          "lines": [intro["start_line"], intro["end_line"]], "parents": [], "pointers": [],
                          "tokens": ks.estimate_tokens(head_text), "kind": intro["kind"],
                          "score": round(scores[intro["section_id"]], 2), "reason": "match"})
        for v, sec, piece, ptok in picked:
            env, ids, reasons, pointer = envs.get(sec["section_id"], ("", [], [], []))
            body += piece + env
            trace.append({"id": sec["section_id"], "file": sec["rel_path"], "heading": sec["heading_path"],
                          "lines": [sec["start_line"], sec["end_line"]], "parents": ids, "pointers": pointer[:4],
                          "tokens": ptok + (ks.estimate_tokens(env) if env else 0), "kind": sec["kind"],
                          "score": round(v, 2), "reason": ", ".join(reasons) or "match"})
        index = [_label(x) for x in allsecs if x["section_id"] not in taken and x["enabled"] and x["heading"]
                 and not (x["rel_path"] == "SKILL.md" and x["level"] <= 1 and x["ordinal"] == 0)]
        index = list(dict.fromkeys(index))
        if index:
            body += ("\nOtras secciones de esta skill (pídelas con «mas_skills» si de verdad te hacen falta): "
                     + "; ".join(index[:20]) + (f"; y {len(index) - 20} más" if len(index) > 20 else "") + "\n")
        parts.append(body)
        used_tok += ks.estimate_tokens(body)
        loaded.append({"name": s["name"], "source_id": sid, "refs": sorted({t["file"] for t in trace if t["file"] != "SKILL.md"}),
                       "sections": len(trace) + (1 if intro else 0), "parents": sum(len(t["parents"]) for t in trace),
                       "pinned": pinned, "score": sc, "tokens": ks.estimate_tokens(body), "trace": trace})
    meta = {"engine": "fts5", "child_only": child_only, "budget_tokens": budget, "tokens_est": used_tok,
            "generation": ks.generation(), "genres": sorted(a["genres"]), "roles": sorted(a["roles"]),
            "tasks": sorted(a["tasks"]), "multi": a["multi"]}
    return parts, loaded, meta


def best_by_source(a, source_ids):
    """Mejor puntuación FTS de cada fuente para el mensaje (para que una skill que no se anuncia bien en su
    descripción pero tiene la sección justa también pueda entrar)."""
    r = ks.search(a["q"], source_ids, limit=400)
    if not r:
        return {}
    secs = ks.sections(list(r))
    out = {}
    for i, rank in r.items():
        s = secs.get(i)
        if s:
            out[s["source_id"]] = max(out.get(s["source_id"], 0), -rank)
    return out


def on_demand(sid_by_name, wanted, active_ids, max_chars):
    """«mas_skills»: secciones pedidas por id (§845 / id:845) o por «skill:archivo#Título». Solo de skills activas e
    indexadas; nunca rutas que vengan de la IA. Devuelve (got[str], text)."""
    parts, got, used = [], [], 0
    for w in [str(x).strip() for x in (wanted or [])][:4]:
        hits = []
        m = re.match(r"^(?:§|id:)\s*(\d+)$", w)
        if m:
            sec = ks.sections([int(m.group(1))]).get(int(m.group(1)))
            if sec and sec["source_id"] in active_ids and sec["enabled"]:
                hits = [sec]
        else:
            head, _, title = w.partition("#")
            name, _, rel = head.partition(":")
            sid = sid_by_name.get(name.strip())
            if sid and sid in active_ids:
                hits = [x for x in ks.find(sid, rel.strip() or None, title.strip() or None) if x["enabled"]]
                if not title.strip():
                    hits = [x for x in hits if x["rel_path"] == "SKILL.md"][:2]
        for sec in hits[:3]:
            text = ks.read_section(sec)
            if text is None:
                continue
            name = next((n for n, s in sid_by_name.items() if s == sec["source_id"]), sec["display_name"])
            chunk = f"### Skill «{name}» · {sec['rel_path']} · {sec['heading_path']} [§{sec['section_id']}]\n{text}\n"
            if used + len(chunk) > max_chars:
                break
            used += len(chunk)
            parts.append(chunk)
            got.append(f"{name}:{_label(sec)}")
    return got, ("\n\nSECCIONES QUE HAS PEDIDO:\n" + "\n".join(parts)) if parts else ""
