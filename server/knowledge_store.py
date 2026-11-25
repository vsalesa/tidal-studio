"""Índice persistente de las skills (0.21): SQLite + FTS5, reconstruible a partir de los Markdown.

  maestro-data/maestro-knowledge.sqlite   (aparte de memory.db: tu memoria personal no se mezcla con esto)

Los .md de cada skill siguen siendo la fuente de verdad. Aquí solo se guardan: de qué skill viene cada archivo, su
SHA-256, las secciones (árbol padre → hijo, líneas exactas, tipo) y un índice FTS5 «sin contenido» (contentless):
las palabras para buscar, pero no una segunda copia legible del texto. El texto se lee del propio Markdown cuando
hace falta y se comprueba con el hash de la sección.

Al arrancar (sin red) y cada pocos segundos mientras se usa, `reconcile` compara lo instalado con lo indexado y solo
vuelve a trocear los archivos que han cambiado (tamaño + fecha como filtro rápido, SHA-256 para decidir). Los
archivos y skills que ya no están se borran del índice. Todo en una transacción: una búsqueda nunca ve la mitad de
una actualización. Si este Python no trae FTS5, o la base se rompe, `available()` es False y Maestro usa la
búsqueda de la 0.20; la app arranca igual. Solo biblioteca estándar.
"""
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata

import knowledge_parse as kparse

SCHEMA_VERSION = 1
_LOCK = threading.RLock()
_STATE = {"path": None, "db": None, "fts": None, "error": "", "checked": 0.0, "last": {}}
RECONCILE_EVERY = 3.0     # segundos entre comprobaciones de los archivos (stat de cada .md: unos milisegundos)

SCHEMA = """
CREATE TABLE IF NOT EXISTS knowledge_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_sources (
  source_id TEXT PRIMARY KEY, origin TEXT NOT NULL, display_name TEXT NOT NULL, root TEXT NOT NULL,
  repo_url TEXT, commit_sha TEXT, license_spdx TEXT, bundle_version TEXT, manifest_sha256 TEXT,
  trust_level TEXT NOT NULL DEFAULT 'third_party', enabled INTEGER NOT NULL DEFAULT 1, quarantine TEXT,
  updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_files (
  file_id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES knowledge_sources(source_id),
  rel_path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL, mtime_ns INTEGER NOT NULL,
  line_count INTEGER NOT NULL, generation INTEGER NOT NULL, UNIQUE(source_id, rel_path));
CREATE TABLE IF NOT EXISTS knowledge_sections (
  section_id INTEGER PRIMARY KEY, file_id TEXT NOT NULL REFERENCES knowledge_files(file_id),
  parent_id INTEGER, heading_path TEXT NOT NULL, heading TEXT NOT NULL, level INTEGER NOT NULL,
  start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, content_sha256 TEXT NOT NULL, fingerprint TEXT NOT NULL,
  ordinal INTEGER NOT NULL, part INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL, oversize INTEGER NOT NULL DEFAULT 0,
  estimated_tokens INTEGER NOT NULL, generation INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(file_id, ordinal, generation), CHECK(start_line > 0 AND end_line >= start_line));
CREATE INDEX IF NOT EXISTS ks_file ON knowledge_sections(file_id);
CREATE INDEX IF NOT EXISTS ks_parent ON knowledge_sections(parent_id);
CREATE TABLE IF NOT EXISTS knowledge_tags (
  section_id INTEGER NOT NULL REFERENCES knowledge_sections(section_id), tag_kind TEXT NOT NULL, tag_value TEXT NOT NULL,
  PRIMARY KEY(section_id, tag_kind, tag_value));
"""


def norm(text):
    """Minúsculas y sin tildes (como el tokenizador unicode61 remove_diacritics 2)."""
    t = (text or "").lower()
    if t.isascii():
        return t
    t = unicodedata.normalize("NFKD", t)
    return "".join(c for c in t if not unicodedata.combining(c))


def estimate_tokens(text):
    """Estimación prudente de tokens (no es el tokenizador del proveedor): ~3.6 caracteres por token en inglés y
    español con Markdown. Se marca siempre como estimación."""
    return max(1, int(len(text or "") / 3.6) + 1)


def fts_support():
    """(fts5, contentless_delete, versión de SQLite) de ESTE Python."""
    v = sqlite3.sqlite_version
    try:
        c = sqlite3.connect(":memory:")
        c.execute("CREATE VIRTUAL TABLE t USING fts5(a)")
    except sqlite3.Error:
        return False, False, v
    try:
        c.execute("CREATE VIRTUAL TABLE u USING fts5(a, content='', contentless_delete=1)")
        c.execute("INSERT INTO u(rowid, a) VALUES (1, 'x')")
        c.execute("DELETE FROM u WHERE rowid = 1")
        cd = True
    except sqlite3.Error:
        cd = False
    c.close()
    return True, cd, v


def configure(path):
    """Dónde vive la base (la llama app.py con maestro-data/). Cierra la anterior si cambia."""
    with _LOCK:
        if _STATE["path"] == path and _STATE["db"] is not None:
            return
        close()
        _STATE.update(path=path, db=None, error="", checked=0.0)


def close():
    with _LOCK:
        if _STATE["db"] is not None:
            try:
                _STATE["db"].close()
            except sqlite3.Error:
                pass
        _STATE["db"] = None


def _default_path():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    d = os.environ.get("TIDAL_STUDIO_DATA") or os.path.join(root, "maestro-data")
    return os.path.join(d, "maestro-knowledge.sqlite")


def _open():
    """La conexión (abriéndola o creándola). None si no se puede: Maestro seguirá con la búsqueda de la 0.20."""
    if _STATE["db"] is not None:
        return _STATE["db"]
    fts, cd, ver = fts_support()
    _STATE["fts"] = {"fts5": fts, "contentless_delete": cd, "sqlite": ver}
    if not fts:
        _STATE["error"] = f"SQLite {ver} sin FTS5"
        return None
    path = _STATE["path"] or _default_path()
    _STATE["path"] = path
    for attempt in (1, 2):
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            db = sqlite3.connect(path, check_same_thread=False, timeout=5)
            db.row_factory = sqlite3.Row
            try:
                db.execute("PRAGMA journal_mode=WAL")
            except sqlite3.Error:
                pass
            db.executescript(SCHEMA)
            ver_row = db.execute("SELECT value FROM knowledge_meta WHERE key='schema'").fetchone()
            fts_mode = "contentless_delete" if cd else "contentless"
            mode_row = db.execute("SELECT value FROM knowledge_meta WHERE key='fts_mode'").fetchone()
            if ver_row and int(ver_row[0]) != SCHEMA_VERSION or (mode_row and mode_row[0] != fts_mode):
                _wipe(db)
            extra = ", contentless_delete=1" if cd else ""
            db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(heading, aliases, body, content=''"
                       + extra + ", tokenize='unicode61 remove_diacritics 2')")
            db.execute("INSERT OR REPLACE INTO knowledge_meta VALUES ('schema', ?)", (str(SCHEMA_VERSION),))
            db.execute("INSERT OR REPLACE INTO knowledge_meta VALUES ('fts_mode', ?)", (fts_mode,))
            db.execute("INSERT OR IGNORE INTO knowledge_meta VALUES ('generation', '0')")
            db.execute("PRAGMA integrity_check").fetchone()
            db.commit()
            _STATE["db"] = db
            _STATE["error"] = ""
            return db
        except (sqlite3.DatabaseError, OSError, ValueError) as e:
            _STATE["error"] = f"{type(e).__name__}: {e}"
            try:
                db.close()  # noqa: F821
            except Exception:  # noqa: BLE001
                pass
            if attempt == 1 and os.path.exists(path):
                # Base rota: se aparta (no se borra) y se crea otra; el índice se rehace desde los Markdown
                try:
                    os.replace(path, path + f".broken-{int(time.time())}")
                except OSError:
                    return None
    return None


def _wipe(db):
    for t in ("knowledge_tags", "knowledge_sections", "knowledge_files", "knowledge_sources"):
        db.execute(f"DELETE FROM {t}")
    db.execute("DROP TABLE IF EXISTS knowledge_fts")
    db.execute("DELETE FROM knowledge_meta WHERE key != 'generation'")


def available():
    with _LOCK:
        return _open() is not None


def generation():
    with _LOCK:
        db = _open()
        if db is None:
            return 0
        return int(db.execute("SELECT value FROM knowledge_meta WHERE key='generation'").fetchone()[0])


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(root, rel):
    """Ruta real de un archivo de la skill, o None si se sale de su carpeta (../, enlaces simbólicos)."""
    if not rel or rel.startswith(("/", "\\")) or ".." in rel.replace("\\", "/").split("/"):
        return None
    p = os.path.join(root, rel)
    try:
        real, base = os.path.realpath(p), os.path.realpath(root)
    except OSError:
        return None
    if os.path.islink(p) or not (real == base or real.startswith(base + os.sep)):
        return None
    return p


def read_file(root, rel):
    p = safe_path(root, rel)
    if not p:
        return None
    try:
        with open(p, "rb") as f:
            return f.read()
    except OSError:
        return None


# ------------------------------------------------------------------ reconciliar lo instalado con lo indexado

def _source_tags(src):
    return {"genre": set(src.get("genres") or [])}


def reconcile(sources, aliases=None, force=False):
    """Pone el índice al día. sources: [{source_id, origin, name, root, files[rel], license, url, commit,
    skip_headings, trust, quarantine, description}]. Devuelve {"changed", "files", "sections", "removed", "seconds"}."""
    with _LOCK:
        now = time.time()
        sig = hashlib.sha256(json.dumps([[s["source_id"], s["root"], s.get("manifest_sha"), s.get("quarantine"), len(s["files"])]
                                         for s in sources]).encode()).hexdigest()
        if not force and now - _STATE["checked"] < RECONCILE_EVERY and _STATE["last"].get("ids") == sig:
            return dict(_STATE["last"], skipped=True)
        db = _open()
        if db is None:
            return {"error": _STATE["error"]}
        t0 = time.time()
        stats = {"changed": 0, "files": 0, "sections": 0, "removed": 0}
        gen = int(db.execute("SELECT value FROM knowledge_meta WHERE key='generation'").fetchone()[0])
        new_gen = gen + 1
        try:
            db.execute("BEGIN IMMEDIATE")
            known = {(r["source_id"], r["rel_path"]): r for r in db.execute("SELECT * FROM knowledge_files")}
            seen_files, seen_src = set(), set()
            for src in sources:
                sid = src["source_id"]
                seen_src.add(sid)
                old = db.execute("SELECT root, manifest_sha256 FROM knowledge_sources WHERE source_id=?", (sid,)).fetchone()
                # Si cambia lo que decide cómo se indexa (secciones que no se envían, descripción, alias) o la carpeta,
                # se rehacen todos sus archivos aunque los .md sean los mismos
                redo = bool(old and (old["root"] != src["root"] or (old["manifest_sha256"] or "") != (src.get("manifest_sha") or "")))
                db.execute("""INSERT INTO knowledge_sources(source_id, origin, display_name, root, repo_url, commit_sha,
                              license_spdx, bundle_version, manifest_sha256, trust_level, enabled, quarantine, updated_at)
                              VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)
                              ON CONFLICT(source_id) DO UPDATE SET origin=excluded.origin, display_name=excluded.display_name,
                              root=excluded.root, repo_url=excluded.repo_url, commit_sha=excluded.commit_sha,
                              license_spdx=excluded.license_spdx, bundle_version=excluded.bundle_version,
                              manifest_sha256=excluded.manifest_sha256, trust_level=excluded.trust_level,
                              quarantine=excluded.quarantine, updated_at=excluded.updated_at""",
                           (sid, src["origin"], src["name"], src["root"], src.get("url") or "", src.get("commit") or "",
                            src.get("license") or "", src.get("bundle_version") or "", src.get("manifest_sha") or "",
                            src.get("trust") or "third_party", src.get("quarantine") or None,
                            time.strftime("%Y-%m-%dT%H:%M:%S")))
                skip = {norm(h) for h in (src.get("skip_headings") or [])}
                for rel in src["files"]:
                    p = safe_path(src["root"], rel)
                    if not p:
                        continue
                    try:
                        st = os.stat(p)
                    except OSError:
                        continue          # ya no está: se borra del índice abajo
                    seen_files.add((sid, rel))
                    stats["files"] += 1
                    row = known.get((sid, rel))
                    if row and not (force or redo) and row["size_bytes"] == st.st_size and row["mtime_ns"] == st.st_mtime_ns:
                        continue
                    data = read_file(src["root"], rel)
                    if data is None:
                        continue
                    sha = _sha(data)
                    if row and not (force or redo) and row["sha256"] == sha:
                        db.execute("UPDATE knowledge_files SET mtime_ns=? WHERE file_id=?", (st.st_mtime_ns, row["file_id"]))
                        continue
                    if row:
                        _drop_file(db, row["file_id"])
                    fid = _sha(f"{sid}\0{rel}".encode())[:24]
                    text = data.decode("utf-8", errors="replace")
                    db.execute("""INSERT OR REPLACE INTO knowledge_files(file_id, source_id, rel_path, sha256, size_bytes,
                                  mtime_ns, line_count, generation) VALUES (?,?,?,?,?,?,?,?)""",
                               (fid, sid, rel, sha, st.st_size, st.st_mtime_ns, text.count("\n") + 1, new_gen))
                    stats["sections"] += _index_file(db, fid, sid, rel, text, new_gen, skip, src, aliases or {})
                    stats["changed"] += 1
            for (sid, rel), row in known.items():
                if (sid, rel) not in seen_files:
                    _drop_file(db, row["file_id"])
                    db.execute("DELETE FROM knowledge_files WHERE file_id=?", (row["file_id"],))
                    stats["removed"] += 1
            for r in db.execute("SELECT source_id FROM knowledge_sources").fetchall():
                if r[0] not in seen_src:
                    db.execute("DELETE FROM knowledge_sources WHERE source_id=?", (r[0],))
            if stats["changed"] or stats["removed"]:
                db.execute("UPDATE knowledge_meta SET value=? WHERE key='generation'", (str(new_gen),))
            db.execute("COMMIT")
        except sqlite3.Error as e:
            try:
                db.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            _STATE["error"] = f"{type(e).__name__}: {e}"
            close()
            return {"error": _STATE["error"]}
        stats["seconds"] = round(time.time() - t0, 3)
        stats["generation"] = new_gen if (stats["changed"] or stats["removed"]) else gen
        stats["ids"] = sig
        _STATE["checked"] = time.time()
        _STATE["last"] = stats
        return dict(stats)


def _drop_file(db, fid):
    ids = [r[0] for r in db.execute("SELECT section_id FROM knowledge_sections WHERE file_id=?", (fid,))]
    mode = db.execute("SELECT value FROM knowledge_meta WHERE key='fts_mode'").fetchone()[0]
    if ids and mode != "contentless_delete":
        # SQLite antiguo: un índice sin contenido no deja borrar filas sueltas. Se rehace entero en la siguiente
        # reconciliación (es pequeño) y mientras tanto esas secciones dejan de existir en las tablas de metadatos.
        db.execute("INSERT OR REPLACE INTO knowledge_meta VALUES ('fts_dirty', '1')")
    for i in ids:
        if mode == "contentless_delete":
            db.execute("DELETE FROM knowledge_fts WHERE rowid=?", (i,))
        db.execute("DELETE FROM knowledge_tags WHERE section_id=?", (i,))
    db.execute("DELETE FROM knowledge_sections WHERE file_id=?", (fid,))


_TAG_IDX = {"id": None, "words": {}, "phrases": []}


def _tag_index(vocab):
    """{palabra: [(tipo, valor)]} y frases de varias palabras, preparado una vez por vocabulario."""
    if _TAG_IDX["id"] is not vocab:
        words, phrases = {}, []
        for kind, table in vocab.items():
            for value, ws in table.items():
                for w in ws:
                    w = norm(w)
                    if re.fullmatch(r"[a-z0-9]+", w):
                        words.setdefault(w, []).append((kind, value))
                    else:
                        phrases.append((w, kind, value))
        _TAG_IDX.update(id=vocab, words=words, phrases=phrases)
    return _TAG_IDX


def _tags_for(sec, rel, text, vocab):
    """Etiquetas de género / papel / tarea. En el título o la ruta basta una vez; en el texto tiene que ser un tema
    (3+ veces), no una mención de paso."""
    idx = _tag_index(vocab)
    hay = norm(" ".join(sec["path"]) + " " + rel.replace("/", " ").replace("-", " ").replace("_", " "))
    body = norm(text)
    out = set()
    hay_words = set(re.findall(r"[a-z0-9]+", hay))
    counts = {}
    for w in re.findall(r"[a-z0-9]+", body):
        if w in idx["words"]:
            counts[w] = counts.get(w, 0) + 1
    for w, tags in idx["words"].items():
        if w in hay_words or counts.get(w, 0) >= 3:
            out.update(tags)
    for ph, kind, value in idx["phrases"]:
        if ph in hay or body.count(ph) >= 3:
            out.add((kind, value))
    return out


def _index_file(db, fid, sid, rel, text, gen, skip, src, aliases):
    secs = kparse.parse(text)
    vocab = aliases.get("tags") or {}
    expand = aliases.get("expand") or {}
    ids = {}
    n = 0
    for s in secs:
        base = re.sub(r" \(\d+\)$", "", s["heading"])
        path = " › ".join(s["path"]) or "(intro)"
        own = kparse.own_text(s)
        enabled = 0 if (norm(base) in skip or any(norm(p) in skip for p in s["path"])) else 1
        fp = _sha(f"{sid}\0{rel}\0{path}\0{s['sha']}".encode())[:32]
        cur = db.execute("""INSERT INTO knowledge_sections(file_id, parent_id, heading_path, heading, level, start_line,
                            end_line, content_sha256, fingerprint, ordinal, part, kind, oversize, estimated_tokens,
                            generation, enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                         (fid, ids.get(s["parent"]), path, s["heading"], s["level"], s["start"], s["end"], s["sha"], fp,
                          s["ordinal"], s["part"], s["kind"], int(s["oversize"]), estimate_tokens(s["text"]), gen, enabled))
        sec_id = cur.lastrowid
        if s["part"] <= 1:
            ids[s["ordinal"]] = sec_id
        tags = _tags_for(s, rel, own, vocab)
        for k, v in tags:
            db.execute("INSERT OR IGNORE INTO knowledge_tags VALUES (?,?,?)", (sec_id, k, v))
        # alias: palabras en el otro idioma para lo que aparece en el título y la ruta, etiquetas y, en la
        # introducción del SKILL.md, la descripción de la skill (así la búsqueda la encuentra por lo que dice hacer)
        al = [v for _, v in tags]
        head_words = norm(path + " " + rel).replace("-", " ").replace("_", " ")
        for w in re.findall(r"[a-z0-9]{3,}", head_words):
            if w in expand:
                al.append(expand[w])
        if rel == "SKILL.md" and s["level"] <= 1 and s["ordinal"] == 0:
            al.append(src.get("description") or "")
            al.append(src.get("name") or "")
        db.execute("INSERT INTO knowledge_fts(rowid, heading, aliases, body) VALUES (?,?,?,?)",
                   (sec_id, path + " " + rel.replace("/", " ").replace(".md", ""), " ".join(al), own))
        n += 1
    return n


def rebuild_fts_if_dirty(sources, aliases):
    """Con SQLite < 3.43 (sin contentless_delete) un archivo cambiado deja palabras viejas en el índice: se rehace
    todo de cero a partir de los Markdown (unos cientos de archivos: menos de un segundo)."""
    with _LOCK:
        db = _open()
        if db is None:
            return False
        if not db.execute("SELECT 1 FROM knowledge_meta WHERE key='fts_dirty'").fetchone():
            return False
        _wipe(db)
        db.commit()
        close()
    reconcile(sources, aliases, force=True)
    return True


def rebuild(sources, aliases):
    """Botón «Reconstruir índice»: borra todo y lo rehace desde los Markdown instalados."""
    with _LOCK:
        db = _open()
        if db is None:
            return {"error": _STATE["error"]}
        _wipe(db)
        db.commit()
        close()
    return reconcile(sources, aliases, force=True)


# ------------------------------------------------------------------ consultas

def match_expr(terms):
    """Expresión MATCH segura: cada término entre comillas (sin sintaxis FTS5 del usuario), con prefijo para que
    «modulation» y «modulate» cuenten igual. terms: lista de palabras ya normalizadas."""
    out = []
    for t in terms:
        t = re.sub(r"[^a-z0-9]", "", norm(t))
        if len(t) < 3:
            continue
        stem = t[:6] if len(t) > 6 else t
        out.append(f'"{stem}"*' if len(t) >= 5 else f'"{t}"')
    return " OR ".join(dict.fromkeys(out))


def search(terms, source_ids, limit=200):
    """{section_id: rank} (más negativo = mejor, como bm25() de FTS5) de las secciones activas de esas fuentes."""
    expr = match_expr(terms)
    if not expr or not source_ids:
        return {}
    with _LOCK:
        db = _open()
        if db is None:
            return {}
        q = ("SELECT s.section_id, bm25(knowledge_fts, 3.0, 2.0, 1.0) AS r FROM knowledge_fts "
             "JOIN knowledge_sections s ON s.section_id = knowledge_fts.rowid "
             "JOIN knowledge_files f ON f.file_id = s.file_id "
             "JOIN knowledge_sources src ON src.source_id = f.source_id "
             "WHERE knowledge_fts MATCH ? AND s.enabled = 1 AND src.enabled = 1 AND src.quarantine IS NULL "
             "AND s.generation = f.generation AND f.source_id IN (" + ",".join("?" * len(source_ids)) + ") "
             "ORDER BY r ASC, s.section_id ASC LIMIT ?")
        try:
            return {r[0]: r[1] for r in db.execute(q, [expr] + list(source_ids) + [int(limit)])}
        except sqlite3.Error as e:
            _STATE["error"] = f"{type(e).__name__}: {e}"
            return {}


_COLS = ("s.section_id, s.parent_id, s.heading_path, s.heading, s.level, s.start_line, s.end_line, s.content_sha256, "
         "s.ordinal, s.part, s.kind, s.oversize, s.estimated_tokens, s.enabled, s.file_id, f.rel_path, f.source_id, "
         "f.generation, src.display_name, src.root, src.license_spdx, src.commit_sha, src.repo_url, src.quarantine")
_JOIN = (" FROM knowledge_sections s JOIN knowledge_files f ON f.file_id = s.file_id "
         "JOIN knowledge_sources src ON src.source_id = f.source_id ")


def sections(ids):
    ids = [int(i) for i in ids if str(i).lstrip("-").isdigit()]
    if not ids:
        return {}
    with _LOCK:
        db = _open()
        if db is None:
            return {}
        rows = db.execute("SELECT " + _COLS + _JOIN + "WHERE s.section_id IN (" + ",".join("?" * len(ids)) + ")", ids)
        return {r["section_id"]: dict(r) for r in rows}


def file_sections(file_id):
    with _LOCK:
        db = _open()
        if db is None:
            return []
        return [dict(r) for r in db.execute("SELECT " + _COLS + _JOIN + "WHERE s.file_id = ? ORDER BY s.ordinal", (file_id,))]


def source_sections(source_id):
    with _LOCK:
        db = _open()
        if db is None:
            return []
        return [dict(r) for r in db.execute("SELECT " + _COLS + _JOIN + "WHERE f.source_id = ? ORDER BY f.rel_path != 'SKILL.md', "
                                            "f.rel_path, s.ordinal", (source_id,))]


def find(source_id, rel=None, heading=None):
    """Secciones por skill/archivo/título (para «mas_skills» con el formato de la 0.20)."""
    out = []
    h = norm(heading or "")
    for s in source_sections(source_id):
        if rel and s["rel_path"] != rel:
            continue
        if h and norm(s["heading"]) != h and norm(re.sub(r" \(\d+\)$", "", s["heading"])) != h:
            continue
        out.append(s)
    if not out and h:
        out = [s for s in source_sections(source_id) if (not rel or s["rel_path"] == rel) and h in norm(s["heading"])]
    return out


def tags_of(ids):
    ids = [int(i) for i in ids]
    if not ids:
        return {}
    with _LOCK:
        db = _open()
        if db is None:
            return {}
        out = {}
        for r in db.execute("SELECT section_id, tag_kind, tag_value FROM knowledge_tags WHERE section_id IN ("
                            + ",".join("?" * len(ids)) + ")", ids):
            out.setdefault(r[0], set()).add((r[1], r[2]))
        return out


def read_section(sec):
    """Texto de la sección leído del Markdown, comprobado con su hash. None si el archivo ha cambiado desde que se
    indexó (la próxima reconciliación lo pone al día; mientras, no se manda nada viejo ni a medias)."""
    data = read_file(sec["root"], sec["rel_path"])
    if data is None:
        return None
    text = kparse.slice_lines(data.decode("utf-8", errors="replace"), sec["start_line"], sec["end_line"])
    if hashlib.sha256(text.encode("utf-8")).hexdigest() != sec["content_sha256"]:
        _STATE["checked"] = 0.0
        return None
    return text


def status():
    """Para el panel de Skills y el monitor."""
    with _LOCK:
        db = _open()
        info = {"available": db is not None, "path": _STATE["path"], "error": _STATE["error"], "fts": _STATE["fts"],
                "last": {k: v for k, v in (_STATE["last"] or {}).items() if k != "ids"}}
        if db is None:
            return info
        info["generation"] = int(db.execute("SELECT value FROM knowledge_meta WHERE key='generation'").fetchone()[0])
        info["sources"] = []
        for r in db.execute("""SELECT src.source_id, src.origin, src.display_name, src.license_spdx, src.commit_sha,
                               src.repo_url, src.quarantine, src.trust_level,
                               (SELECT COUNT(*) FROM knowledge_files f WHERE f.source_id = src.source_id) AS files,
                               (SELECT COUNT(*) FROM knowledge_sections s JOIN knowledge_files f ON f.file_id = s.file_id
                                 WHERE f.source_id = src.source_id) AS sections,
                               (SELECT COUNT(*) FROM knowledge_sections s JOIN knowledge_files f ON f.file_id = s.file_id
                                 WHERE f.source_id = src.source_id AND s.enabled = 0) AS skipped
                               FROM knowledge_sources src ORDER BY src.origin, src.display_name"""):
            info["sources"].append(dict(r))
        info["files"] = sum(s["files"] for s in info["sources"])
        info["sections"] = sum(s["sections"] for s in info["sources"])
        try:
            info["db_bytes"] = os.path.getsize(_STATE["path"])
        except OSError:
            info["db_bytes"] = 0
        return info


def load_aliases(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}
