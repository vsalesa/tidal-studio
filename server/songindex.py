"""Índice de canciones y datos de aprendizaje en SQLite (Maestro v2, release 0.14).

La canción es del navegador (y de su .tidal / GitHub): aquí solo llega una COPIA DE SOLO LECTURA cada vez que se
guarda, para que Maestro y las búsquedas puedan consultarla sin mandarla entera en cada mensaje. El servidor nunca
escribe la canción de vuelta. Si este archivo se borra, se reconstruye solo con el siguiente guardado.

También guarda los votos y elecciones del alumno (A/B a ciegas, opciones elegidas, notas de la línea base) para
exportarlos como un dataset limpio en JSONL y, algún día, entrenar un modelo propio con ellos.

Solo usa la biblioteca estándar de Python (sqlite3 con FTS5 si está disponible; si no, búsqueda con LIKE).
"""
import hashlib
import json
import score as scoremod
import os
import re
import sqlite3
import threading
import time

SCHEMA_VERSION = 2  # 2: tabla scores (partitura .musicxml de cada canción, release 0.15)
DATASET_VERSION = 1

# Lo que no es un nombre de sonido dentro de un patrón de Tidal
_SND_STR = re.compile(r'(?:\bs|\bsound)\s+"([^"]*)"')
_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def sounds_of(code):
    """Nombres de sonido que usa un trozo de código de Tidal: s "bd*2 sn:3" → {"bd", "sn"}."""
    out = set()
    for pat in _SND_STR.findall(str(code or "")):
        for w in _WORD.findall(re.sub(r":\d+", "", pat)):
            out.add(w.lower())
    return out


def song_hash(song):
    """Huella estable de lo que importa musicalmente (BPM, nombre y pistas con su código, mezcla y candados)."""
    tracks = [{k: t.get(k) for k in ("id", "name", "kind", "code", "muted", "mix", "lock")}
              for t in (song.get("tracks") or []) if isinstance(t, dict)]
    key = json.dumps({"bpm": song.get("bpm"), "name": song.get("name"), "tracks": tracks,
                      "locks": song.get("locks"), "score": song.get("score")}, sort_keys=True, ensure_ascii=False, default=str)
    return "sha256:" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


def _fts_query(q):
    """Convierte lo que escribe el alumno en una consulta FTS5 segura (palabras sueltas con prefijo)."""
    words = [w for w in re.findall(r"\w+", str(q or "").lower()) if len(w) > 1][:8]
    return " OR ".join(f'"{w}"*' for w in words)


class SongIndex:
    def __init__(self, path):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.fts = True
        self._schema()

    # ------------------------------------------------------------ esquema
    def _schema(self):
        with self.lock, self.db:
            self.db.execute("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")
            self.db.execute("""CREATE TABLE IF NOT EXISTS songs (
                id TEXT PRIMARY KEY, name TEXT, bpm REAL, hash TEXT, updated REAL, n_tracks INTEGER,
                sounds TEXT, style TEXT, data TEXT)""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS tracks (
                song_id TEXT, track_id TEXT, name TEXT, kind TEXT, code TEXT, sounds TEXT, locks TEXT,
                PRIMARY KEY (song_id, track_id))""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS scores (
                song_id TEXT PRIMARY KEY, key TEXT, meter TEXT, n_parts INTEGER, n_bars INTEGER, data TEXT, musicxml TEXT)""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, kind TEXT, song_id TEXT, data TEXT)""")
            try:
                self.db.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
                    song_id UNINDEXED, track_id UNINDEXED, song_name, name, kind, code, sounds)""")
            except sqlite3.OperationalError:  # Python sin FTS5: se busca con LIKE
                self.fts = False
            self.db.execute("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', ?)", (str(SCHEMA_VERSION),))

    # ------------------------------------------------------------ sync de solo lectura
    def sync(self, song):
        """Guarda la copia de una canción. Devuelve {"ok", "changed", "hash"}. No cambia nada en el navegador."""
        sid = str(song.get("id") or "").strip()[:80]
        if not sid:
            raise ValueError("song.id")
        tracks = [t for t in (song.get("tracks") or []) if isinstance(t, dict) and t.get("id")][:64]
        h = song_hash(song)
        with self.lock, self.db:
            row = self.db.execute("SELECT hash FROM songs WHERE id = ?", (sid,)).fetchone()
            if row and row["hash"] == h:
                return {"ok": True, "changed": False, "hash": h}
            all_sounds = set()
            self.db.execute("DELETE FROM tracks WHERE song_id = ?", (sid,))
            if self.fts:
                self.db.execute("DELETE FROM tracks_fts WHERE song_id = ?", (sid,))
            name = str(song.get("name") or "")[:120]
            for t in tracks:
                code = str(t.get("code") or "")[:20000]
                snd = sorted(sounds_of(code))
                all_sounds.update(snd)
                locks = json.dumps(t.get("lock") or {}, sort_keys=True)
                self.db.execute("INSERT OR REPLACE INTO tracks VALUES (?,?,?,?,?,?,?)",
                                (sid, str(t["id"])[:8], str(t.get("name") or "")[:80], str(t.get("kind") or "")[:20],
                                 code, " ".join(snd), locks))
                if self.fts:
                    self.db.execute("INSERT INTO tracks_fts VALUES (?,?,?,?,?,?,?)",
                                    (sid, str(t["id"])[:8], name, str(t.get("name") or ""), str(t.get("kind") or ""),
                                     code, " ".join(snd)))
            self.db.execute("DELETE FROM scores WHERE song_id = ?", (sid,))
            sc = scoremod.normalize(song.get("score")) if song.get("score") else None
            if sc and sc["parts"]:
                # Las dos formas de la canción: el código Tidal (arriba, por pista) y la partitura MusicXML
                self.db.execute("INSERT INTO scores VALUES (?,?,?,?,?,?,?)",
                                (sid, sc["key"], sc["meter"], len(sc["parts"]), max(len(p["bars"]) for p in sc["parts"]),
                                 json.dumps(scoremod.to_json(sc), ensure_ascii=False), scoremod.to_musicxml(sc, name)))
            data = {k: song.get(k) for k in ("id", "name", "bpm", "style", "locks", "course")}
            data["tracks"] = [{k: t.get(k) for k in ("id", "name", "kind", "code", "muted", "mix", "lock")} for t in tracks]
            self.db.execute("INSERT OR REPLACE INTO songs VALUES (?,?,?,?,?,?,?,?,?)",
                            (sid, name, float(song.get("bpm") or 0), h, time.time(), len(tracks),
                             " ".join(sorted(all_sounds)), str(song.get("style") or "")[:30],
                             json.dumps(data, ensure_ascii=False)))
        return {"ok": True, "changed": True, "hash": h}

    def forget(self, song_id):
        """Quita una canción del índice (no la borra del navegador ni de GitHub)."""
        with self.lock, self.db:
            self.db.execute("DELETE FROM songs WHERE id = ?", (song_id,))
            self.db.execute("DELETE FROM tracks WHERE song_id = ?", (song_id,))
            self.db.execute("DELETE FROM scores WHERE song_id = ?", (song_id,))
            if self.fts:
                self.db.execute("DELETE FROM tracks_fts WHERE song_id = ?", (song_id,))

    def song(self, song_id):
        with self.lock:
            row = self.db.execute("SELECT data FROM songs WHERE id = ?", (song_id,)).fetchone()
        return json.loads(row["data"]) if row else None

    def score(self, song_id):
        """La partitura guardada de una canción: {"key", "meter", "score", "musicxml"} o None."""
        with self.lock:
            row = self.db.execute("SELECT key, meter, data, musicxml FROM scores WHERE song_id = ?", (song_id,)).fetchone()
        return {"key": row["key"], "meter": row["meter"], "score": json.loads(row["data"]), "musicxml": row["musicxml"]} if row else None

    def songs(self, limit=200):
        with self.lock:
            rows = self.db.execute("SELECT id, name, bpm, n_tracks, sounds, style, updated FROM songs "
                                   "ORDER BY updated DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------ búsquedas (capa 2, sin LLM)
    def with_sound(self, sound, limit=20):
        """Canciones que usan un sonido (por nombre exacto o que empieza igual)."""
        s = re.sub(r"[^a-z0-9_]", "", str(sound or "").lower())
        if not s:
            return []
        with self.lock:
            rows = self.db.execute(
                "SELECT t.song_id, s.name AS song, t.track_id, t.name, t.sounds FROM tracks t JOIN songs s ON s.id = t.song_id "
                "WHERE ' ' || t.sounds || ' ' LIKE ? OR ' ' || t.sounds || ' ' LIKE ? ORDER BY s.updated DESC LIMIT ?",
                (f"% {s} %", f"% {s}%", limit)).fetchall()
        return [dict(r) for r in rows]

    def search(self, q, limit=8):
        """Pistas de tus canciones que tienen que ver con el texto (FTS5; si no hay, LIKE)."""
        with self.lock:
            if self.fts:
                fq = _fts_query(q)
                if not fq:
                    return []
                try:
                    rows = self.db.execute(
                        "SELECT song_id, song_name AS song, track_id, name, kind, code, sounds FROM tracks_fts "
                        "WHERE tracks_fts MATCH ? ORDER BY rank LIMIT ?", (fq, limit)).fetchall()
                except sqlite3.OperationalError:
                    rows = []
            else:
                words = [w for w in re.findall(r"\w+", str(q or "").lower()) if len(w) > 1][:4]
                if not words:
                    return []
                cond = " OR ".join("(lower(t.name) LIKE ? OR lower(t.code) LIKE ? OR t.sounds LIKE ?)" for _ in words)
                args = [a for w in words for a in (f"%{w}%",) * 3]
                rows = self.db.execute(
                    f"SELECT t.song_id, s.name AS song, t.track_id, t.name, t.kind, t.code, t.sounds FROM tracks t "
                    f"JOIN songs s ON s.id = t.song_id WHERE {cond} LIMIT ?", (*args, limit)).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------ votos y elecciones (dataset)
    def vote(self, rec):
        """Guarda un voto / elección. Devuelve su id. Nunca se guarda audio, solo código y contexto."""
        kind = str(rec.get("kind") or "")
        if kind not in ("ab", "pick", "undo", "rating"):
            raise ValueError("kind")
        clean = json.loads(json.dumps(rec, ensure_ascii=False))
        clean["dataset_version"] = DATASET_VERSION
        clean.setdefault("license", "own")  # lo compone el alumno en la app: es suyo
        with self.lock, self.db:
            cur = self.db.execute("INSERT INTO votes (ts, kind, song_id, data) VALUES (?,?,?,?)",
                                  (time.time(), kind, str(rec.get("song_id") or "")[:80],
                                   json.dumps(clean, ensure_ascii=False)[:200000]))
            return cur.lastrowid

    def votes_stats(self):
        with self.lock:
            rows = self.db.execute("SELECT kind, COUNT(*) AS n FROM votes GROUP BY kind").fetchall()
            ratings = self.db.execute("SELECT data FROM votes WHERE kind = 'rating' ORDER BY id DESC LIMIT 200").fetchall()
        by = {r["kind"]: r["n"] for r in rows}
        genres = {}
        for r in ratings:
            d = json.loads(r["data"])
            g = str(d.get("genre") or "?")
            if g not in genres:  # la nota más reciente de cada género
                genres[g] = {"score": d.get("score"), "missing": d.get("missing", "")}
        return {"counts": by, "total": sum(by.values()), "baseline": genres}

    def export_jsonl(self):
        """Todo el dataset, una línea JSON por voto, del más antiguo al más nuevo."""
        with self.lock:
            rows = self.db.execute("SELECT id, ts, kind, data FROM votes ORDER BY id").fetchall()
        lines = []
        for r in rows:
            d = json.loads(r["data"])
            d.update({"id": r["id"], "ts": round(r["ts"], 3), "kind": r["kind"]})
            lines.append(json.dumps(d, ensure_ascii=False, sort_keys=True))
        return "\n".join(lines) + ("\n" if lines else "")

    # ------------------------------------------------------------ estado
    def stats(self):
        with self.lock:
            n_songs = self.db.execute("SELECT COUNT(*) FROM songs").fetchone()[0]
            n_tracks = self.db.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
            n_votes = self.db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
            n_scores = self.db.execute("SELECT COUNT(*) FROM scores").fetchone()[0]
        try:
            size = os.path.getsize(self.path)
        except OSError:
            size = 0
        return {"songs": n_songs, "tracks": n_tracks, "votes": n_votes, "scores": n_scores, "bytes": size, "fts": self.fts,
                "path": self.path, "schema": SCHEMA_VERSION}
