"""Troceo de un Markdown de skill en un ÁRBOL de secciones (0.21).

A diferencia de la 0.20 (lista plana de títulos), cada sección sabe quién es su padre (# → ## → ### …), en qué
líneas exactas del archivo está y qué tipo de contenido lleva. Así la búsqueda puede mandar un trozo pequeño («hijo»)
con el contexto que le da sentido («padre»: género, cuándo sí y cuándo no, excepciones).

Reglas que importan para la música:
  - los títulos dentro de bloques de código (``` o ~~~, de cualquier longitud) no son títulos;
  - una sección muy larga se parte por párrafos, pero NUNCA se corta una lista, una tabla, un bloque de código o un
    párrafo por la mitad: si una pieza indivisible no cabe, la sección queda marcada «oversize» y se manda entera o no
    se manda (nunca recortada);
  - las líneas guardadas son las del archivo real (con el bloque YAML incluido), para leer el texto del propio
    Markdown cuando se necesita: la base de datos no guarda una segunda copia del texto.
Solo biblioteca estándar.
"""
import hashlib
import re

VERSION = 2          # súbelo si cambia cómo se trocea o se clasifica: el índice se rehace solo
SEC_MAX = 2600      # caracteres a partir de los que una sección se parte por bloques
_HEAD = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
_FENCE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")
CONSTRAINT = re.compile(
    r"\b(unless|except|avoid|only (?:when|if)|do not|don't|never|must not|not for|instead of|contraindicat\w*|"
    r"salvo|excepto|evita\w*|nunca|solo (?:cuando|si)|no (?:uses|pongas|hagas))\b", re.I)


def _frontmatter_end(lines):
    """Índice (0-based) de la primera línea después del bloque YAML, o 0 si no hay."""
    if lines and lines[0].lstrip("﻿").strip() == "---":
        for i in range(1, min(len(lines), 200)):
            if lines[i].strip() == "---":
                return i + 1
    return 0


def _blocks(lines, start, end):
    """Bloques indivisibles entre start y end (0-based, end exclusivo): párrafos, listas, tablas, código.
    Devuelve [(primera, última)] en índices 0-based inclusivos."""
    out, i = [], start
    while i < end:
        if not lines[i].strip():
            i += 1
            continue
        j = i
        m = _FENCE.match(lines[i])
        if m:  # bloque de código: hasta la valla de cierre del mismo tipo y al menos igual de larga
            mark = m.group(1)
            j = i + 1
            while j < end and not re.match(r"^[ \t]{0,3}" + re.escape(mark[0]) + "{" + str(len(mark)) + r",}[ \t]*$", lines[j]):
                j += 1
            out.append((i, min(j, end - 1)))
            i = j + 1
            continue
        listy = re.match(r"^\s*([-*+]|\d+[.)]|\|)", lines[i])
        while j + 1 < end and lines[j + 1].strip() and not _FENCE.match(lines[j + 1]):
            j += 1
        # una lista o tabla sigue aunque haya líneas en blanco entre elementos
        while listy and j + 2 < end and not lines[j + 1].strip() and re.match(r"^\s*([-*+]|\d+[.)]|\||\s{2,}\S)", lines[j + 2]):
            j += 2
            while j + 1 < end and lines[j + 1].strip() and not _FENCE.match(lines[j + 1]):
                j += 1
        out.append((i, j))
        i = j + 1
    return out


def kind_of(title, text):
    t = (title or "").lower()
    if re.search(r"\b(example|examples|ejemplo|ejemplos)\b", t):
        return "example"
    if re.search(r"\b(do not|don't|avoid|mistakes?|pitfalls?|exceptions?|caveats?|warnings?|errores|evita\w*|cuidado)\b", t):
        return "caveat"
    stripped = text.strip()
    if stripped.startswith(("```", "~~~")) and stripped.rstrip().endswith(("```", "~~~")):
        return "code"
    if CONSTRAINT.search(text):
        return "rule-with-exceptions"
    return "explanation"


def parse(text):
    """Secciones de un Markdown: lista de dicts
      {ordinal, heading, level, path (lista de títulos hasta aquí), parent (ordinal o None), start, end (líneas
       1-based inclusivas), part (1.. si una sección larga se partió), oversize, kind, sha (del texto), text}.
    La sección 0 es la introducción (lo que hay antes del primer título, sin el YAML), si tiene texto."""
    lines = (text or "").split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    fm = _frontmatter_end(lines)
    heads, fence = [], None
    for i in range(fm, len(lines)):
        m = _FENCE.match(lines[i])
        if m:
            if fence is None:
                fence = m.group(1)
            elif lines[i].strip().startswith(fence[0] * len(fence)) and not lines[i].strip().strip(fence[0]):
                fence = None
            continue
        if fence is None:
            h = _HEAD.match(lines[i])
            if h:
                heads.append((i, len(h.group(1)), h.group(2).strip()))
    # Nodos: introducción + un nodo por título; el cuerpo PROPIO va hasta el siguiente título (de cualquier nivel)
    nodes = []
    first = heads[0][0] if heads else len(lines)
    if any(lines[k].strip() for k in range(fm, first)):
        nodes.append({"heading": "", "level": 0, "head_line": None, "body": (fm, first)})
    for n, (i, lvl, title) in enumerate(heads):
        nxt = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        nodes.append({"heading": title, "level": lvl, "head_line": i, "body": (i + 1, nxt)})
    out, stack = [], []   # stack: [(level, ordinal, title)]
    for node in nodes:
        lvl = node["level"]
        if lvl == 0:
            parent, path = None, []
        else:
            while stack and stack[-1][0] >= lvl:
                stack.pop()
            parent = stack[-1][1] if stack else None
            path = [t for _, _, t in stack] + [node["heading"]]
        b0, b1 = node["body"]
        start = node["head_line"] if node["head_line"] is not None else b0
        pieces = [(start, b1 - 1)]
        own = "\n".join(lines[start:b1]).strip()
        oversize = False
        if len(own) > SEC_MAX:
            pieces, cur, size = [], None, 0
            for a, z in _blocks(lines, b0, b1):
                blen = sum(len(lines[k]) + 1 for k in range(a, z + 1))
                if cur is not None and size + blen > SEC_MAX:
                    pieces.append(cur)
                    cur, size = None, 0
                if cur is None:
                    cur = [start if not pieces and node["head_line"] is not None else a, z]
                else:
                    cur[1] = z
                size += blen
            if cur:
                pieces.append(cur)
            pieces = [tuple(p) for p in pieces] or [(start, b1 - 1)]
        ordinal = len(out)
        for k, (a, z) in enumerate(pieces):
            while z > a and not lines[z].strip():
                z -= 1
            body = "\n".join(lines[a:z + 1])
            if not body.strip() and node["heading"] == "":
                continue
            big = len(body.strip()) > SEC_MAX
            oversize = oversize or big
            out.append({
                "ordinal": len(out), "heading": node["heading"] + (f" ({k + 1})" if len(pieces) > 1 else ""),
                "level": lvl, "path": path, "parent": parent, "start": a + 1, "end": z + 1,
                "part": k + 1 if len(pieces) > 1 else 0, "oversize": big,
                "kind": kind_of(node["heading"], body), "sha": hashlib.sha256(body.encode("utf-8")).hexdigest(),
                "text": body,
            })
        if lvl:
            stack.append((lvl, ordinal, node["heading"]))
    return out


def slice_lines(text, start, end):
    """Texto de las líneas start..end (1-based, inclusivas) de un archivo ya leído."""
    lines = (text or "").split("\n")
    return "\n".join(lines[start - 1:end])


def own_text(section):
    """El texto sin la línea del título (para no repetirlo debajo de la ruta de títulos)."""
    t = section["text"]
    if section["heading"] and section.get("part", 0) <= 1 and _HEAD.match(t.split("\n", 1)[0]):
        return t.split("\n", 1)[1].strip() if "\n" in t else ""
    return t.strip()
