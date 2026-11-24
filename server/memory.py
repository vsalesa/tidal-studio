"""Memoria de Maestro, «Mis estilos» y casos musicales (Maestro v2, release 0.18).

Todo vive en maestro-data/memory.db (SQLite), en tu ordenador:

- memories: lo que Maestro recuerda de ti, con su ámbito (canción, curso, género o global). Cada memoria pasa
  por una capa de validación: las muy claras (lo pediste tú con «recuerda…», o elegiste el mismo sonido de oído
  3+ veces sin dudar) se aprueban solas si el ajuste lo permite; las dudosas (una preferencia dicha de pasada, algo
  que contradice otra memoria o el tempo del género) esperan en la bandeja hasta que tú las apruebes.
- mlog: registro de TODO lo que se añade, cambia o borra (memorias, estilos y casos). Cada entrada guarda el antes
  y el después, así que se puede deshacer una a una.
- styles: «Mis estilos»: el groove, los papeles, los instrumentos y el tempo de una canción (no sus notas). Se
  pueden usar de tres maneras: inspiración, transformación o copia literal (solo si la eliges, y queda registrada).
- cases: casos musicales: un problema, el antes y el después, y por qué lo aceptaste.

Nada de esto se manda a ningún sitio salvo que tú lo compartas, o actives la copia en GitHub (solo lo aprobado).
"""
import json
import os
import re
import sqlite3
import threading
import time

SCOPES = ("song", "course", "genre", "global")
SCOPE_NAME = {"song": ("esta canción", "this song"), "course": ("este curso", "this course"),
              "genre": ("el género", "the genre"), "global": ("siempre", "always")}
STATUS = ("pending", "approved", "rejected")
STYLE_VERSION = 1
MAX_TEXT = 300


def _now():
    return time.time()


def _clean(s, n=MAX_TEXT):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


def _norm(s):
    return re.sub(r"[^\w ]+", "", _clean(s).lower())


_STOP = set("""this that these those with from into over your mine song songs track tracks always never every some more less
    very much just like want would should must goes go get gets make makes have has the and for but not dont don't
    esta este estos estas esto canción cancion canciones pista pistas siempre nunca jamás jamas quiero prefiero gusta gustan
    como para pero porque cuando todo toda todos todas más mas menos muy poco algo tiene tienen hace hacer van vaya
    prefer love hate like""".split())
_NEG = re.compile(r"\b(nunca|jam[aá]s|no|odio|never|don'?t|do not|hate|without|sin)\b", re.I)


def _content(text):
    return {w for w in re.findall(r"\w{4,}", _norm(text)) if w not in _STOP}


def slugify(name):
    s = re.sub(r"[^\w\s-]", "", str(name or "").lower(), flags=re.U)
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    s = s.encode("ascii", "ignore").decode() or "estilo"
    return s[:48]


# ---------------------------------------------------------------- géneros

def genre_of(course_id="", style="", texts=()):
    """El género de lo que se está haciendo: el del curso, o el estilo de la canción si es uno conocido."""
    import midigen
    if course_id in midigen.STYLES:
        return course_id
    t = " ".join([str(style or "")] + [str(x or "") for x in texts]).lower()
    for k, v in midigen.STYLES.items():
        if re.search(rf"\b{re.escape(k)}\b", t) or v["name"].lower() in t:
            return k
    alias = {"drum and bass": "dnb", "drum & bass": "dnb", "lo-fi": "lofi", "boom bap": "boombap", "hip hop": "boombap",
             "dub": "reggae", "bossa nova": "bossa"}
    for a, g in alias.items():
        if a in t:
            return g
    return ""


def _genre_bpm(genre):
    import midigen
    st = midigen.STYLES.get(genre)
    return st["bpm"] if st else None


# ---------------------------------------------------------------- detectar memorias en lo que escribes

_EXPLICIT = re.compile(r"^\s*(?:por favor,?\s*)?(?:recuerda|acu[eé]rdate(?:\s+de)?|apunta|memoriza|ten en cuenta|"
                       r"remember|note|keep in mind|don'?t forget)(?:\s+(?:que|that))?\s*[:,]?\s+(.{4,280})$", re.I | re.S)
_PREF = re.compile(r"\b(siempre|nunca|jam[aá]s|no me gusta(?:n)?|odio|me encanta(?:n)?|prefiero|always|never|"
                   r"i (?:don'?t|do not) like|i hate|i love|i prefer)\b", re.I)
_SONG = re.compile(r"\b(?:en )?(?:esta|this) (?:canci[oó]n|song|tema|track)\b", re.I)
_COURSE = re.compile(r"\b(?:en )?(?:este|this) (?:curso|course)\b", re.I)
_GLOBAL = re.compile(r"\b(?:en todas|en cualquier|todas mis canciones|in (?:all|every|any)(?: of)? (?:my )?songs?|everywhere|siempre que)\b", re.I)


def observe(text, ctx):
    """Busca en un mensaje tuyo algo que valga la pena recordar. Devuelve [] o [{text, scope, scope_key, clear}]."""
    t = str(text or "").strip()
    if not t or len(t) > 600 or t.startswith("/"):
        return []
    m = _EXPLICIT.match(t)
    clear = bool(m)
    if m:
        body = m.group(1)
    else:
        if t.rstrip().endswith("?") or not _PREF.search(t):
            return []
        # la frase que contiene la preferencia
        parts = re.split(r"(?<=[.!;])\s+", t)
        body = next((p for p in parts if _PREF.search(p)), t)
    body = _clean(body).rstrip(".")
    if len(body) < 4:
        return []
    genre = ctx.get("genre") or ""
    if _SONG.search(t) and ctx.get("song_id"):
        scope, key = "song", ctx["song_id"]
    elif _COURSE.search(t) and ctx.get("course"):
        scope, key = "course", ctx["course"]
    elif _GLOBAL.search(t) or not genre:
        scope, key = "global", ""
    else:
        scope, key = "genre", genre
    return [{"text": body[0].upper() + body[1:], "scope": scope, "scope_key": key, "clear": clear}]


def only_memory(text):
    """True si el mensaje es SOLO algo para recordar («recuerda que…»): se contesta sin IA."""
    t = str(text or "").strip()
    return bool(_EXPLICIT.match(t)) and "?" not in t and len(t) < 300


def noted_reply(noted, en=False):
    sc = {"song": ("para esta canción", "for this song"), "course": ("para este curso", "for this course"),
          "genre": ("para este género", "for this genre"), "global": ("para siempre", "for everything")}
    lines = []
    for m in noted:
        where = sc[m["scope"]][1 if en else 0]
        if m["status"] == "approved":
            lines.append((f"Noted {where}: «{m['text']}»." if en else f"Apuntado {where}: «{m['text']}»."))
        else:
            why = (m.get("note") or "").split("|")[1 if en else 0] if m.get("note") else ""
            lines.append((f"I've left «{m['text']}» in the Memory inbox for you to approve" if en
                           else f"He dejado «{m['text']}» en la bandeja de Memoria para que la apruebes")
                          + (f" ({why})." if why else "."))
    lines.append("You can see it, change it or undo it in Memory (brain button)." if en
                 else "Puedes verlo, cambiarlo o deshacerlo en Memoria (botón del cerebro).")
    return {"mensaje": " ".join(lines), "opciones": [("Open Memory" if en else "Abrir Memoria")]}


# ---------------------------------------------------------------- almacén

class Store:
    def __init__(self, path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.lock, self.db:
            self.db.execute("""CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, scope_key TEXT, text TEXT, text_en TEXT,
                subject TEXT, source TEXT, evidence INTEGER DEFAULT 1, status TEXT, auto INTEGER DEFAULT 0,
                note TEXT, created REAL, updated REAL)""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS mlog (
                id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, obj TEXT, obj_id TEXT, action TEXT, by TEXT,
                before TEXT, after TEXT, reverted INTEGER DEFAULT 0)""")
            self.db.execute("CREATE TABLE IF NOT EXISTS styles (id TEXT PRIMARY KEY, name TEXT, data TEXT, created REAL, updated REAL)")
            self.db.execute("""CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, genre TEXT, song_id TEXT, created REAL)""")
        self.on_change = None  # lo usa la copia automática en GitHub

    # ------------------------------------------------------------ registro (y deshacer)
    def _log(self, obj, obj_id, action, by, before, after):
        self.db.execute("INSERT INTO mlog (ts, obj, obj_id, action, by, before, after) VALUES (?,?,?,?,?,?,?)",
                        (_now(), obj, str(obj_id), action, by,
                         json.dumps(before, ensure_ascii=False) if before is not None else None,
                         json.dumps(after, ensure_ascii=False) if after is not None else None))

    def _changed(self):
        if self.on_change:
            try:
                self.on_change()
            except Exception:  # noqa: BLE001  la copia en GitHub nunca rompe nada
                pass

    def log(self, limit=200):
        with self.lock:
            rows = self.db.execute("SELECT * FROM mlog ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["before"] = json.loads(d["before"]) if d["before"] else None
            d["after"] = json.loads(d["after"]) if d["after"] else None
            d["reverted"] = bool(d["reverted"])
            out.append(d)
        return out

    def revert(self, log_id):
        """Deshace una entrada del registro: vuelve a dejar el objeto como estaba antes de ese cambio."""
        with self.lock, self.db:
            r = self.db.execute("SELECT * FROM mlog WHERE id = ?", (int(log_id),)).fetchone()
            if not r:
                raise KeyError("log")
            if r["reverted"]:
                raise ValueError("Ya estaba deshecho|Already undone")
            if r["action"] == "literal":
                raise ValueError("Una copia literal ya usada no se puede deshacer aquí: usa Deshacer en la canción|"
                                 "A literal copy that was used can't be undone here: use Undo in the song")
            before = json.loads(r["before"]) if r["before"] else None
            table = {"memory": "memories", "style": "styles", "case": "cases"}[r["obj"]]
            cur = self.db.execute(f"SELECT * FROM {table} WHERE id = ?", (self._key(r["obj"], r["obj_id"]),)).fetchone()
            now = dict(cur) if cur else None
            if before is None:
                self.db.execute(f"DELETE FROM {table} WHERE id = ?", (self._key(r["obj"], r["obj_id"]),))
            else:
                cols = list(before.keys())
                self.db.execute(f"INSERT OR REPLACE INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                                [before[c] for c in cols])
            self.db.execute("UPDATE mlog SET reverted = 1 WHERE id = ?", (r["id"],))
            self._log(r["obj"], r["obj_id"], "revert", "user", now, before)
        self._changed()
        return {"ok": True, "obj": r["obj"], "obj_id": r["obj_id"]}

    @staticmethod
    def _key(obj, obj_id):
        return obj_id if obj == "style" else int(obj_id)

    # ------------------------------------------------------------ memorias
    def _row(self, mid):
        r = self.db.execute("SELECT * FROM memories WHERE id = ?", (int(mid),)).fetchone()
        return dict(r) if r else None

    def memories(self, status=None):
        q, args = "SELECT * FROM memories", ()
        if status:
            q, args = q + " WHERE status = ?", (status,)
        with self.lock:
            rows = self.db.execute(q + " ORDER BY updated DESC", args).fetchall()
        return [dict(r) for r in rows]

    def _conflicts(self, scope, key, text, subject, exclude=None):
        """Memorias aprobadas que valen a la vez que esta y dicen lo contrario: mismo tema con otro valor (p. ej. otro
        sonido favorito para lo mismo), o las mismas palabras con «siempre» frente a «nunca». Las globales valen en
        todas partes, así que se comparan con todo; las demás, con las de su ámbito y con las globales."""
        if scope == "global":
            rows = self.db.execute("SELECT * FROM memories WHERE status = 'approved'").fetchall()
        else:
            rows = self.db.execute("SELECT * FROM memories WHERE status = 'approved' AND ((scope = ? AND scope_key = ?) OR scope = 'global')",
                                   (scope, key)).fetchall()
        out = []
        words = _content(text)
        neg = bool(_NEG.search(text))
        for r in rows:
            if exclude and r["id"] == exclude:
                continue
            if subject and r["subject"] == subject:
                if _norm(r["text"]) != _norm(text):
                    out.append(r)
                continue
            other = _content(r["text"])
            common = words & other
            small = min(len(words), len(other))
            if (neg != bool(_NEG.search(r["text"])) and common and len(common) >= small * 0.5
                    and (len(common) >= 2 or small <= 2)):
                out.append(r)
        return out

    def _genre_check(self, scope, key, text):
        """Una memoria de género que pide un tempo muy lejos del de ese género va a la bandeja."""
        if scope != "genre":
            return ""
        m = re.search(r"\b(\d{2,3})\s*(?:bpm|BPM)\b", text)
        base = _genre_bpm(key)
        if m and base and abs(int(m.group(1)) - base) > base * 0.2:
            return f"tempo {m.group(1)} lejos del habitual del género (~{base})|tempo {m.group(1)} far from the genre's usual (~{base})"
        return ""

    def add(self, text, scope="global", scope_key="", source="user", subject="", evidence=1, clear=False,
            auto_approve=True, by="user", text_en=""):
        """Añade (o refuerza) una memoria. La capa de validación decide si se aprueba sola o va a la bandeja."""
        text = _clean(text)
        if not text:
            raise ValueError("Memoria vacía|Empty memory")
        scope = scope if scope in SCOPES else "global"
        scope_key = "" if scope == "global" else _clean(scope_key, 120)
        if scope != "global" and not scope_key:
            scope, scope_key = "global", ""
        with self.lock, self.db:
            same = None
            for r in self.db.execute("SELECT * FROM memories WHERE scope = ? AND scope_key = ? AND status != 'rejected'",
                                     (scope, scope_key)).fetchall():
                if _norm(r["text"]) == _norm(text):
                    same = dict(r)
                    break
            if same:
                # ya la tenía: cuenta como una prueba más (y si ahora está clara, se aprueba)
                after = dict(same, evidence=max(same["evidence"] + 1, evidence), updated=_now())
                if same["status"] == "pending" and clear and auto_approve and not self._conflicts(scope, scope_key, text, subject, same["id"]):
                    after.update(status="approved", auto=1, note="")
                self.db.execute("UPDATE memories SET evidence = ?, status = ?, auto = ?, note = ?, updated = ? WHERE id = ?",
                                (after["evidence"], after["status"], after["auto"], after["note"], after["updated"], same["id"]))
                self._log("memory", same["id"], "reinforce", by, same, after)
                changed = after["status"] != same["status"]
                res = after
            else:
                conf = self._conflicts(scope, scope_key, text, subject)
                gnote = self._genre_check(scope, scope_key, text)
                notes = []
                if conf:
                    notes.append("contradice: " + "; ".join(f"#{r['id']} {r['text'][:60]}" for r in conf[:3]) + "|contradicts: "
                                 + "; ".join(f"#{r['id']} {r['text'][:60]}" for r in conf[:3]))
                if gnote:
                    notes.append(gnote)
                ok = (by == "user" and source == "manual") or (clear and auto_approve)
                status = "approved" if ok and not notes else "pending"
                now = _now()
                cur = self.db.execute(
                    "INSERT INTO memories (scope, scope_key, text, text_en, subject, source, evidence, status, auto, note, created, updated) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (scope, scope_key, text, _clean(text_en), subject, source, int(evidence), status,
                     1 if status == "approved" and not (by == "user" and source == "manual") else 0, " · ".join(notes), now, now))
                res = self._row(cur.lastrowid)
                self._log("memory", res["id"], "add", by, None, res)
                changed = res["status"] == "approved"
        if changed:
            self._changed()
        return res

    def set_status(self, mid, status, by="user"):
        if status not in STATUS:
            raise ValueError("status")
        with self.lock, self.db:
            before = self._row(mid)
            if not before:
                raise KeyError("memory")
            self.db.execute("UPDATE memories SET status = ?, auto = 0, updated = ? WHERE id = ?", (status, _now(), int(mid)))
            after = self._row(mid)
            self._log("memory", mid, {"approved": "approve", "rejected": "reject"}.get(status, "pending"), by, before, after)
        self._changed()
        return after

    def edit(self, mid, text=None, scope=None, scope_key=None, by="user"):
        with self.lock, self.db:
            before = self._row(mid)
            if not before:
                raise KeyError("memory")
            t = _clean(text) if text is not None else before["text"]
            s = scope if scope in SCOPES else before["scope"]
            k = "" if s == "global" else (_clean(scope_key, 120) if scope_key is not None else before["scope_key"])
            self.db.execute("UPDATE memories SET text = ?, scope = ?, scope_key = ?, updated = ? WHERE id = ?", (t, s, k, _now(), int(mid)))
            after = self._row(mid)
            self._log("memory", mid, "edit", by, before, after)
        self._changed()
        return after

    def delete(self, mid, by="user"):
        with self.lock, self.db:
            before = self._row(mid)
            if not before:
                raise KeyError("memory")
            self.db.execute("DELETE FROM memories WHERE id = ?", (int(mid),))
            self._log("memory", mid, "delete", by, before, None)
        self._changed()

    def relevant(self, song_id="", course="", genre="", limit=12):
        """Las memorias aprobadas que valen para lo que se está haciendo: las más concretas primero."""
        with self.lock:
            rows = self.db.execute(
                "SELECT * FROM memories WHERE status = 'approved' AND (scope = 'global' OR (scope = 'song' AND scope_key = ?) "
                "OR (scope = 'course' AND scope_key = ?) OR (scope = 'genre' AND scope_key = ?)) ORDER BY updated DESC",
                (song_id or "\0", course or "\0", genre or "\0")).fetchall()
        order = {"song": 0, "course": 1, "genre": 2, "global": 3}
        return sorted((dict(r) for r in rows), key=lambda r: order[r["scope"]])[:limit]

    def learn_from_choices(self, rows, auto_approve=True, min_picks=3):
        """Convierte lo que elegiste de oído (laboratorio de sonido) en memorias de género.

        rows: [{ctx: "papel|género", sound, picks, passes}]. Muy clara = 3+ elecciones y ningún otro sonido elegido
        2+ veces para lo mismo. Si hay otro favorito, va a la bandeja para que decidas tú."""
        import midigen
        role_name = {"percusion": ("percusión", "drums"), "bajo": ("bajo", "bass"), "armonia": ("acordes", "chords"),
                     "melodia": ("melodía", "melody"), "textura": ("textura", "texture")}
        by_ctx = {}
        for r in rows:
            role, _, style = str(r["ctx"]).partition("|")
            if style in ("", "*") or role in ("", "*"):
                continue
            by_ctx.setdefault((role, style), []).append(r)
        made = []
        for (role, style), rs in by_ctx.items():
            rs = sorted(rs, key=lambda x: -x["picks"])
            top = rs[0]
            if top["picks"] < min_picks:
                continue
            rival = next((x for x in rs[1:] if x["picks"] >= 2), None)
            gname = midigen.STYLES[style]["name"] if style in midigen.STYLES else style
            rn = role_name.get(role, (role, role))
            es = f"En {gname}, para {rn[0]}, prefiero «{top['sound']}» (lo elegí de oído {top['picks']} veces)"
            en = f"In {gname}, for {rn[1]}, I prefer «{top['sound']}» (picked by ear {top['picks']} times)"
            subject = f"sound|{role}|{style}"
            with self.lock:
                have = self.db.execute("SELECT * FROM memories WHERE subject = ? AND scope = 'genre' AND scope_key = ? "
                                       "AND status != 'rejected' ORDER BY id DESC LIMIT 1", (subject, style)).fetchone()
            if have and f"«{top['sound']}»" in have["text"]:
                if have["evidence"] != top["picks"]:
                    with self.lock, self.db:
                        self.db.execute("UPDATE memories SET evidence = ?, text = ?, text_en = ? WHERE id = ?",
                                        (top["picks"], es, en, have["id"]))
                continue
            if have and have["status"] == "approved" and not rival:
                # cambiaste de favorito con claridad: la nueva sustituye a la vieja (queda en el registro)
                self.set_status(have["id"], "rejected", by="auto")
            m = self.add(es, "genre", style, source="picks", subject=subject, evidence=top["picks"],
                         clear=not rival, auto_approve=auto_approve, by="auto", text_en=en)
            if rival and m["status"] == "pending" and not m.get("note"):
                with self.lock, self.db:
                    self.db.execute("UPDATE memories SET note = ? WHERE id = ?",
                                    (f"también elegiste «{rival['sound']}» {rival['picks']} veces|you also picked «{rival['sound']}» {rival['picks']} times", m["id"]))
            made.append(m)
        return made

    # ------------------------------------------------------------ estilos
    def _style_row(self, sid):
        r = self.db.execute("SELECT * FROM styles WHERE id = ?", (sid,)).fetchone()
        return dict(r) if r else None

    def styles(self):
        with self.lock:
            rows = self.db.execute("SELECT data FROM styles ORDER BY updated DESC").fetchall()
        return [json.loads(r["data"]) for r in rows]

    def style(self, sid):
        with self.lock:
            r = self._style_row(sid)
        return json.loads(r["data"]) if r else None

    def save_style(self, st, by="user"):
        st = validate_style(st)
        with self.lock, self.db:
            sid = st.get("id") or slugify(st["name"])
            base, n = sid, 2
            while not st.get("id") and self._style_row(sid):
                sid, n = f"{base}-{n}", n + 1
            st["id"] = sid
            before = self._style_row(sid)
            now = _now()
            st.setdefault("created", now)
            self.db.execute("INSERT OR REPLACE INTO styles (id, name, data, created, updated) VALUES (?,?,?,?,?)",
                            (sid, st["name"], json.dumps(st, ensure_ascii=False), before["created"] if before else now, now))
            self._log("style", sid, "edit" if before else "add", by, before, self._style_row(sid))
        self._changed()
        return st

    def delete_style(self, sid, by="user"):
        with self.lock, self.db:
            before = self._style_row(sid)
            if not before:
                raise KeyError("style")
            self.db.execute("DELETE FROM styles WHERE id = ?", (sid,))
            self._log("style", sid, "delete", by, before, None)
        self._changed()

    def log_literal(self, sid, song_name=""):
        with self.lock, self.db:
            self._log("style", sid, "literal", "user", None, {"song": _clean(song_name, 80)})

    # ------------------------------------------------------------ casos musicales
    def cases(self, limit=200):
        with self.lock:
            rows = self.db.execute("SELECT id, data FROM cases ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(json.loads(r["data"]), id=r["id"]) for r in rows]

    def add_case(self, c, by="user"):
        c = {"problem": _clean(c.get("problem"), 400), "before": str(c.get("before") or "")[:4000],
             "after": str(c.get("after") or "")[:4000], "why": _clean(c.get("why"), 400),
             "genre": _clean(c.get("genre"), 40), "song": _clean(c.get("song"), 80), "song_id": _clean(c.get("song_id"), 80),
             "title": _clean(c.get("title"), 120), "created": _now()}
        if not c["problem"] or not (c["before"] or c["after"]):
            raise ValueError("Falta el problema o el código|The problem or the code is missing")
        with self.lock, self.db:
            cur = self.db.execute("INSERT INTO cases (data, genre, song_id, created) VALUES (?,?,?,?)",
                                  (json.dumps(c, ensure_ascii=False), c["genre"], c["song_id"], c["created"]))
            row = dict(self.db.execute("SELECT * FROM cases WHERE id = ?", (cur.lastrowid,)).fetchone())
            self._log("case", cur.lastrowid, "add", by, None, row)
        self._changed()
        return dict(c, id=cur.lastrowid)

    def delete_case(self, cid, by="user"):
        with self.lock, self.db:
            r = self.db.execute("SELECT * FROM cases WHERE id = ?", (int(cid),)).fetchone()
            if not r:
                raise KeyError("case")
            self.db.execute("DELETE FROM cases WHERE id = ?", (int(cid),))
            self._log("case", cid, "delete", by, dict(r), None)
        self._changed()

    def cases_for(self, text, genre="", n=2):
        """Los casos que más se parecen a lo que pides (palabras en común; los del mismo género cuentan más)."""
        words = set(re.findall(r"\w{4,}", _norm(text)))
        scored = []
        for c in self.cases(400):
            cw = set(re.findall(r"\w{4,}", _norm(c["problem"] + " " + c.get("why", "") + " " + c.get("title", ""))))
            s = len(words & cw) + (1.5 if genre and c.get("genre") == genre else 0)
            if s >= 1.5:
                scored.append((s, c))
        scored.sort(key=lambda x: -x[0])
        return [c for _, c in scored[:n]]

    # ------------------------------------------------------------ estado y copia
    def stats(self):
        with self.lock:
            by = {r["status"]: r["n"] for r in self.db.execute("SELECT status, COUNT(*) n FROM memories GROUP BY status")}
            ns = self.db.execute("SELECT COUNT(*) FROM styles").fetchone()[0]
            nc = self.db.execute("SELECT COUNT(*) FROM cases").fetchone()[0]
            nl = self.db.execute("SELECT COUNT(*) FROM mlog").fetchone()[0]
        return {"approved": by.get("approved", 0), "pending": by.get("pending", 0), "rejected": by.get("rejected", 0),
                "styles": ns, "cases": nc, "log": nl}

    def backup_files(self, folder="tidal-studio"):
        """Lo que se copia en GitHub: solo memorias APROBADAS, tus estilos y tus casos (nunca la bandeja ni votos)."""
        mem = [{k: m[k] for k in ("id", "scope", "scope_key", "text", "text_en", "subject", "source", "evidence", "updated")}
               for m in self.memories("approved")]
        files = {f"{folder}/memories.json": json.dumps({"version": 1, "memories": mem}, ensure_ascii=False, indent=2),
                 f"{folder}/cases.json": json.dumps({"version": 1, "cases": self.cases(1000)}, ensure_ascii=False, indent=2)}
        for st in self.styles():
            files[f"{folder}/styles/{st['id']}.json"] = json.dumps(st, ensure_ascii=False, indent=2)
        return files


# ---------------------------------------------------------------- texto para Maestro

def maestro_text(mems, cases=(), style=None, mode="", en=False):
    lines = []
    if mems:
        sc = {"song": "esta canción", "course": "este curso", "genre": "este género", "global": "siempre"}
        lines.append("MEMORIA DEL ALUMNO (aprobada por él; respétala salvo que ahora pida otra cosa, y si choca con lo que pide, "
                     "pregunta antes):\n" + "\n".join(f"  · [{sc[m['scope']]}] {m['text']}" for m in mems))
    for c in cases or []:
        lines.append(f"CASO MUSICAL DEL ALUMNO «{c.get('title') or c['problem'][:60]}»: problema: {c['problem']}. Antes: "
                     f"{c['before'][:500]} → Después: {c['after'][:500]}. Por qué lo aceptó: {c.get('why') or '—'}. "
                     "Úsalo como ejemplo de cómo le gusta resolver algo parecido (no lo copies si no encaja).")
    if style:
        lines.append(style_text(style, mode))
    return "\n".join(lines)


MODES = {
    "inspiration": "INSPIRACIÓN: crea material NUEVO (otras notas, otros patrones) que tenga sus mismas relaciones: el mismo "
                   "tipo de groove, los mismos papeles e instrumentos y el tempo parecido. No copies ninguna pista.",
    "transformation": "TRANSFORMACIÓN: lleva su estructura, su groove y sus papeles a otra tonalidad, tempo o conjunto de "
                      "instrumentos, como te pida el alumno.",
}


def style_text(st, mode=""):
    roles = "; ".join(f"{r['name']} ({r['role']}): sonido {', '.join(r['sounds']) or '—'}"
                      + (f", efectos {r['fx']}" if r.get("fx") else "") + (f", groove `{r['groove'][:160]}`" if r.get("groove") else "")
                      for r in st.get("roles", [])[:10])
    out = (f"ESTILO DEL ALUMNO «{st['name']}»" + (f" ({st['genre']})" if st.get("genre") else "") + f": {st.get('bpm') or '?'} BPM"
           + (f", tonalidad de origen {st['key']}" if st.get("key") else "") + (f". {st['description']}" if st.get("description") else "")
           + f". Papeles: {roles}.")
    if st.get("forma"):
        out += " Forma: " + " · ".join(f"{f['name']} ({f['bars']})" for f in st["forma"][:8]) + "."
    if mode in MODES:
        out += " MODO " + MODES[mode]
    return out


# ---------------------------------------------------------------- estilos: de una canción a un estilo

DRUM_KINDS = {"percusion", "drums", "bateria", "ritmo"}


def _fx_chain(code):
    """Los efectos (# …) de una pista, sin s/n/note/sound."""
    code = re.sub(r"--[^\n]*", "", str(code or ""))
    parts = re.split(r"(?=#\s*[a-zA-Z])", code)
    keep = [p.strip() for p in parts[1:] if not re.match(r"#\s*(?:s|sound|n|note)\b", p.strip())]
    return " ".join(keep)[:300]


def _has_notes(code):
    return bool(re.search(r'\b(?:n|note|up)\s+"', str(code or "")))


def style_from_song(song, name="", genre="", description="", keep_literal=True):
    """El estilo de una canción: groove (las pistas de ritmo tal cual), papeles, instrumentos, efectos y tempo.

    Las notas NO forman parte del estilo. Si keep_literal, se guarda aparte una copia literal de las pistas, que solo
    se usa si la eliges (y nunca se comparte salvo que lo marques)."""
    import songindex
    tracks = [t for t in (song.get("tracks") or []) if isinstance(t, dict) and t.get("code")]
    if not tracks:
        raise ValueError("La canción no tiene pistas|The song has no tracks")
    roles = []
    for t in tracks[:12]:
        code = str(t.get("code") or "")
        role = str(t.get("kind") or "").lower() or ("percusion" if not _has_notes(code) else "melodia")
        drum = role in DRUM_KINDS or not _has_notes(code)
        roles.append({"role": "percusion" if drum and role not in ("bajo", "armonia", "melodia") else role,
                      "name": _clean(t.get("name") or t.get("id"), 60), "sounds": sorted(songindex.sounds_of(code))[:6],
                      "fx": _fx_chain(code), "groove": code[:1500] if drum else ""})
    sc = song.get("score") if isinstance(song.get("score"), dict) else {}
    key = sc.get("key") if isinstance(sc.get("key"), str) else ""
    form = [{"name": _clean(s.get("name"), 40), "bars": 0} for s in (sc.get("sections") or []) if isinstance(s, dict)]
    st = {"version": STYLE_VERSION, "name": _clean(name or song.get("name") or "Mi estilo", 80),
          "genre": genre or genre_of("", song.get("style"), [song.get("name")]),
          "bpm": int(song.get("bpm") or 120), "key": key, "description": _clean(description, 400), "roles": roles,
          "forma": form, "from_song": _clean(song.get("name"), 80)}
    if keep_literal:
        st["literal"] = [{"id": t.get("id"), "name": t.get("name"), "kind": t.get("kind"), "code": str(t.get("code"))[:4000]}
                         for t in tracks[:12]]
    return st


def validate_style(st):
    """Un estilo (tuyo o importado de un enlace) solo con los campos que conozco y con límites de tamaño."""
    if not isinstance(st, dict):
        raise ValueError("No es un estilo de Tidal Studio|Not a Tidal Studio style")
    roles = []
    for r in (st.get("roles") or [])[:16]:
        if not isinstance(r, dict):
            continue
        roles.append({"role": _clean(r.get("role"), 20) or "melodia", "name": _clean(r.get("name"), 60),
                      "sounds": [_clean(s, 60) for s in (r.get("sounds") or [])[:8] if s],
                      "fx": _clean(r.get("fx"), 300), "groove": str(r.get("groove") or "")[:1500]})
    if not roles:
        raise ValueError("El estilo no tiene papeles|The style has no roles")
    try:
        bpm = max(40, min(220, int(float(st.get("bpm") or 120))))
    except (TypeError, ValueError):
        bpm = 120
    out = {"version": STYLE_VERSION, "name": _clean(st.get("name"), 80) or "Estilo", "genre": _clean(st.get("genre"), 40),
           "bpm": bpm, "key": _clean(st.get("key"), 8), "description": _clean(st.get("description"), 400), "roles": roles,
           "forma": [{"name": _clean(f.get("name"), 40), "bars": int(f.get("bars") or 0)} for f in (st.get("forma") or [])[:12] if isinstance(f, dict)],
           "from_song": _clean(st.get("from_song"), 80)}
    for k in ("id", "source", "author", "url"):
        if st.get(k):
            out[k] = _clean(st[k], 200)
    if out.get("id"):
        out["id"] = slugify(out["id"])
    if isinstance(st.get("literal"), list):
        out["literal"] = [{"id": _clean(t.get("id"), 8), "name": _clean(t.get("name"), 60), "kind": _clean(t.get("kind"), 20),
                           "code": str(t.get("code") or "")[:4000]} for t in st["literal"][:12] if isinstance(t, dict) and t.get("code")]
    if isinstance(st.get("created"), (int, float)):
        out["created"] = st["created"]
    return out


def shareable(st, include_literal=False):
    out = {k: v for k, v in st.items() if k not in ("created",) and (include_literal or k != "literal")}
    out["format"] = "tidal-studio-style"
    return out


# ---------------------------------------------------------------- transformación (sin IA)

KEYS = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"]


def transform(st, genre="", bpm=None, key="", ensemble=None, seed=1, lang="es"):
    """Lleva un estilo a otra tonalidad, tempo o conjunto: el groove se queda; bajo, acordes y melodía se escriben de
    nuevo (generador del estudio, sin IA) en la tonalidad elegida y con los instrumentos del conjunto."""
    import midigen
    g = genre if genre in midigen.STYLES else (st.get("genre") if st.get("genre") in midigen.STYLES else "")
    if not g:
        raise ValueError("Elige un género para escribir las partes|Pick a genre to write the parts")
    root, mode = midigen.COURSE_KEYS.get(g, (0, midigen.STYLES[g]["mode"]))
    km = re.match(r"^([a-g])(s|#|b)?(m)?$", str(key or "").strip().lower())
    if km:
        pc = KEYS.index(km.group(1)) + (1 if km.group(2) in ("s", "#") else -1 if km.group(2) == "b" else 0)
        root, mode = pc % 12, ("minor" if km.group(3) else "major")
    ensemble = ensemble or {}
    tracks, n = [], 0
    for r in st.get("roles", []):
        n += 1
        tid = f"d{n}"
        if r["role"] in ("bajo", "armonia", "melodia"):
            snd = ensemble.get(r["name"]) or ensemble.get(r["role"]) or (r["sounds"][0] if r["sounds"] else "")
            code0 = f'note "c5" # s "{snd}" {r.get("fx") or ""}'.strip() if snd else ""
            res = midigen.course_variants(g, r["role"], code=code0, n=1, seed=seed, lang=lang, key=(root, mode))
            v = res["variants"][0]
            tracks.append({"id": tid, "name": r["name"], "kind": r["role"], "code": v["codigo"]})
        elif r.get("groove"):
            code = r["groove"]
            snd = ensemble.get(r["name"])
            if snd and len(r["sounds"]) == 1:
                code = re.sub(rf'\b{re.escape(r["sounds"][0])}\b', snd, code)
            tracks.append({"id": tid, "name": r["name"], "kind": r["role"], "code": code})
    kname = midigen.KEY_NAMES[root] + ("m" if mode == "minor" else "")
    return {"bpm": max(40, min(220, int(bpm or st.get("bpm") or 120))), "key": kname, "genre": g, "tracks": tracks[:12]}
