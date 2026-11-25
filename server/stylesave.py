"""Guardar opciones de Maestro (o la canción) en «Mis estilos» de verdad (0.20.1).

Antes Maestro no tenía ninguna acción para guardar estilos: si se lo pedías, contestaba «guardados» sin guardar nada.
Ahora:
  1. Si el mensaje pide guardar como estilo y se entiende cuáles («la A y la C», «las otras tres», «todas», «esta
     canción»), se guarda aquí mismo, sin IA.
  2. Si no se entiende, Maestro lo indica con "guardar_estilos" en su respuesta y el servidor los guarda.
  3. La confirmación la escribe siempre el servidor con lo que se guardó de verdad. Si Maestro dice «guardado» y no
     se guardó nada, se le corrige delante del alumno.
"""
import re

import memory as memorymod

LETTERS = "ABCD"

_WANTS = re.compile(r"\b(gu[aá]rd\w*|s[aá]lv\w*|a[ñn]ad\w*|mete\w*|save|store|add)\b.{0,80}\b(estilos?|styles?)\b"
                    r"|\b(estilos?|styles?)\b.{0,40}\b(gu[aá]rd\w*|save)\b", re.I | re.S)
_OTHERS = re.compile(r"\b(las?\s+(otr[ao]s|dem[aá]s|restantes)|el resto|las?\s+que\s+no\s+(he\s+)?eleg\w*|no\s+elegid[ao]s|"
                     r"menos\s+la\s+(que\s+)?elegid[ao]|the\s+(others?|rest|other\s+\w+)|(the\s+)?ones?\s+i\s+did(n'?t| not)\s+pick|"
                     r"not\s+picked|except\s+the\s+(one\s+i\s+)?pick\w*)\b", re.I)
_ALL = re.compile(r"\b(todas|las\s+cuatro|las\s+\d\s+opciones|all(\s+of\s+them|\s+four|\s+the\s+options)?|every\s+option)\b", re.I)
_PICKED = re.compile(r"\b(la\s+(que\s+(he\s+)?)?elegid[ao]|la\s+que\s+eleg[ií]|the\s+(one\s+i\s+)?picked(\s+one)?)\b", re.I)
_SONG = re.compile(r"\b(esta\s+canci[oó]n|la\s+canci[oó]n|mi\s+canci[oó]n|lo\s+que\s+suena|this\s+song|my\s+song|the\s+song)\b", re.I)
# «la A», «las A, B y C», «opción B», «options A and D», «A, B y C» (mayúsculas: «a» en minúscula es una preposición)
_LETTER_CTX = re.compile(r"(?:\b(?:la|las|opci[oó]n|opciones|options?|and|y|e|or|o)\s+|,\s*)([A-D])\b")
_NUMS = re.compile(r"\b(?:opci[oó]n(?:es)?|options?|n[uú]meros?)\s+((?:[1-4](?:\s*(?:,|y|e|and|&)\s*)?)+)", re.I)


def wants_save(text):
    t = str(text or "")
    return bool(t) and len(t) < 600 and not t.lstrip().startswith("/") and bool(_WANTS.search(t))


def recent_options(sess):
    """Las opciones que ofreció Maestro la última vez (la web las manda en session.opciones_recientes)."""
    out = []
    for i, o in enumerate((sess or {}).get("opciones_recientes") or []):
        if not isinstance(o, dict) or i >= 4:
            continue
        c = o.get("cambios") if isinstance(o.get("cambios"), dict) else {}
        out.append({"letra": LETTERS[i], "titulo": memorymod._clean(o.get("titulo"), 80) or f"Opción {LETTERS[i]}",
                    "descripcion": memorymod._clean(o.get("descripcion"), 400), "elegida": bool(o.get("elegida")),
                    "cambios": c})
    return out


def parse_targets(text, opts):
    """Qué guardar según el mensaje: lista de "A".."D" y/o "cancion". None si no está claro (entonces decide Maestro)."""
    t = str(text or "")
    if not opts:
        return ["cancion"] if _SONG.search(t) else None
    have = [o["letra"] for o in opts]
    if _OTHERS.search(t):
        picked = [o["letra"] for o in opts if o["elegida"]]
        return [x for x in have if x not in picked] if picked else None
    if _ALL.search(t):
        return have
    got = [m.group(1) for m in _LETTER_CTX.finditer(t)]
    for m in _NUMS.finditer(t):
        got += [LETTERS[int(d) - 1] for d in re.findall(r"[1-4]", m.group(1))]
    if _PICKED.search(t):
        got += [o["letra"] for o in opts if o["elegida"]]
    got = [x for i, x in enumerate(got) if x in have and x not in got[:i]]
    if got:
        return got
    if _SONG.search(t):
        return ["cancion"]
    return None


def song_with(sess, cambios=None, name=""):
    """La canción de la sesión con los cambios de una opción puestos (sin tocar la sesión)."""
    tracks = [dict(id=t.get("id"), name=re.sub(r"\s*\((editada a mano|edited by hand)[^)]*\)$", "", str(t.get("name") or "")),
                   kind=t.get("kind"), code=t.get("code"))
              for t in (sess.get("tracks") or []) if isinstance(t, dict) and t.get("id")]
    c = cambios or {}
    gone = set(x for x in c.get("eliminar") or [] if isinstance(x, str))
    tracks = [t for t in tracks if t["id"] not in gone]
    for p in c.get("pistas") or []:
        if not isinstance(p, dict) or not p.get("id"):
            continue
        cur = next((t for t in tracks if t["id"] == p["id"]), None)
        if cur:
            cur.update(code=p.get("codigo") or cur["code"], name=p.get("nombre") or cur["name"], kind=p.get("tipo") or cur["kind"])
        else:
            tracks.append({"id": p["id"], "name": p.get("nombre") or p["id"], "kind": p.get("tipo") or "", "code": p.get("codigo") or ""})
    tracks.sort(key=lambda t: int(re.sub(r"\D", "", str(t["id"])) or 0))
    try:
        bpm = int(round(float(c.get("bpm") or sess.get("bpm") or 120)))
    except (TypeError, ValueError):
        bpm = 120
    return {"name": name or sess.get("name") or "", "bpm": bpm, "style": sess.get("style") or "",
            "tracks": [t for t in tracks if t.get("code")], "score": sess.get("score") if isinstance(sess.get("score"), dict) else None}


def save(store, sess, items, opts, genre=""):
    """Guarda de verdad. items: [{"opcion": "A".."D"|"cancion", "nombre": "", "descripcion": ""}].
    Devuelve (guardados [{id, name, from}], errores [texto])."""
    saved, errors, seen = [], [], set()
    by_letter = {o["letra"]: o for o in opts}
    for it in items[:5]:
        which = str(it.get("opcion") or "").strip()
        which = "cancion" if which.lower() in ("cancion", "canción", "song", "actual", "current") else which.upper()[:1]
        if which in seen:
            continue
        seen.add(which)
        if which == "cancion":
            song = song_with(sess, None, it.get("nombre") or sess.get("name") or "")
            label = "canción|song"
        elif which in by_letter:
            o = by_letter[which]
            song = song_with(sess, o["cambios"], it.get("nombre") or o["titulo"])
            label = f"opción {which}|option {which}"
        else:
            errors.append(f"No encuentro la opción «{which or '?'}»|I can't find option «{which or '?'}»")
            continue
        try:
            desc = it.get("descripcion") or (by_letter[which]["descripcion"] if which in by_letter else "")
            st = memorymod.style_from_song(song, name=it.get("nombre") or song["name"], genre=genre, description=desc)
            st = store.save_style(st, by="maestro")
            saved.append({"id": st["id"], "name": st["name"], "from": label, "opcion": which})
        except Exception as e:  # noqa: BLE001
            errors.append(f"«{it.get('nombre') or which}»: {e}")
    return saved, errors


def parse_items(raw):
    """El campo "guardar_estilos" de la respuesta de Maestro, limpio."""
    out = []
    for it in (raw or [])[:5] if isinstance(raw, list) else []:
        if isinstance(it, str):
            it = {"opcion": it}
        if isinstance(it, dict) and it.get("opcion"):
            out.append({"opcion": str(it["opcion"])[:12], "nombre": memorymod._clean(it.get("nombre"), 80),
                        "descripcion": memorymod._clean(it.get("descripcion"), 400)})
    return out


_CLAIM = re.compile(r"\b(guardad[oa]s?|he\s+guardado|te\s+(las?|los?)\s+he\s+guardado|ya\s+est[aá]n?\s+(en|guardad)|"
                    r"saved|i'?ve\s+(stored|added)|are\s+now\s+in)\b", re.I)


def claims_saved(text):
    t = str(text or "")
    return bool(_CLAIM.search(t)) and bool(re.search(r"\b(mis\s+estilos|my\s+styles|como\s+estilos?|as\s+(a\s+)?styles?|"
                                                    r"(nuevos?|tus)\s+estilos|estilos?\s+(nuevos?|guardad)|new\s+styles?)\b", t, re.I))


def _split(s, en):
    es_, _, en_ = s.partition("|")
    return en_ if en and en_ else es_


def result_text(saved, errors, en=False):
    """La confirmación de verdad (la escribe la app, no la IA)."""
    lines = []
    if saved:
        names = ", ".join(f"«{s['name']}» ({_split(s['from'], en)})" for s in saved)
        lines.append((f"Saved in My styles: {names}. Find them in Memory (brain button) → My styles."
                      if en else f"Guardado en Mis estilos: {names}. Los tienes en Memoria (botón del cerebro) → Mis estilos."))
    for e in errors:
        lines.append(("Not saved: " if en else "No se ha guardado: ") + _split(e, en))
    if not saved and not errors:
        lines.append("No style was saved." if en else "No se ha guardado ningún estilo.")
    return " ".join(lines)


def not_saved_text(en=False):
    return ("Careful: nothing has been saved to My styles yet. Tell me which options (A, B, C, D) or «this song», "
            "e.g. «save A and C as styles»." if en else
            "Ojo: todavía no se ha guardado nada en Mis estilos. Dime qué opciones (A, B, C, D) o «esta canción», "
            "por ejemplo «guarda la A y la C como estilos».")


def local_reply(saved, errors, en=False):
    return {"mensaje": result_text(saved, errors, en), "estilos_guardados": saved,
            "opciones": [("Open My styles" if en else "Abrir Mis estilos")] if saved else []}
