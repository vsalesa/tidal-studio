"""Enrutador por capas de Maestro y monitor RAG (Maestro v2, release 0.14).

Cada petición al chat baja por capas, de la más barata a la más cara, y solo llega al LLM si las de arriba no
bastan:

  1 rules    reglas y respuestas locales (sin LLM): «¿qué canciones mías usan güira?», «mis canciones»…
  2 index    índice de canciones en SQLite (FTS5): canciones tuyas relacionadas con lo que pides
  3 library  tu biblioteca real (samples, instrumentos, loops) leída del disco
  4 skills   conocimiento experto (skills y plugins)
  5 llm      el modelo de IA, solo para lo creativo o ambiguo
  6 validate candados y versión de la canción antes de devolver nada

Todo se puede ajustar en config.json → "router" (y en la ventana Monitor RAG de la app). El monitor guarda las
últimas peticiones con lo que hizo cada capa: si respondió, cuánto tardó, cuántos aciertos, tokens y caché.
"""
import re
import threading
import time
import uuid

LAYERS = [
    {"id": "rules", "es": "Reglas locales", "en": "Local rules"},
    {"id": "index", "es": "Índice de canciones (SQLite)", "en": "Song index (SQLite)"},
    {"id": "library", "es": "Tu biblioteca", "en": "Your library"},
    {"id": "skills", "es": "Skills", "en": "Skills"},
    {"id": "llm", "es": "LLM", "en": "LLM"},
    {"id": "validate", "es": "Validación (candados)", "en": "Validation (locks)"},
]
LAYER_IDS = [x["id"] for x in LAYERS]

DEFAULT = {
    "local_answers": True,   # capa 1: responder sin LLM lo que se puede responder con datos locales
    "layers": {"index": True, "library": True, "skills": True, "loops": True},
    "max_tokens": 0,         # 0 = automático (1800, o 3500 con opciones/plan)
    "max_candidates": 4,     # opciones como mucho por respuesta (1-4)
    "index_hits": 3,         # pistas de tus canciones que se pasan a Maestro como contexto (0 = ninguna)
    "confidence": 0.8,       # una respuesta local con menos confianza que esto sigue hacia el LLM
}


def config(cfg):
    """Ajustes del enrutador con valores por defecto y límites sanos."""
    r = dict(DEFAULT)
    src = cfg.get("router") if isinstance(cfg.get("router"), dict) else {}
    r["local_answers"] = bool(src.get("local_answers", DEFAULT["local_answers"]))
    layers = dict(DEFAULT["layers"])
    for k, v in (src.get("layers") or {}).items():
        if k in layers:
            layers[k] = bool(v)
    r["layers"] = layers
    r["max_tokens"] = _clamp(src.get("max_tokens", 0), 0, 16000, int)
    if r["max_tokens"] and r["max_tokens"] < 300:
        r["max_tokens"] = 300
    r["max_candidates"] = _clamp(src.get("max_candidates", 4), 1, 4, int)
    r["index_hits"] = _clamp(src.get("index_hits", 3), 0, 10, int)
    r["confidence"] = _clamp(src.get("confidence", 0.8), 0.0, 1.0, float)
    return r


def update(cfg, data):
    """Mezcla en cfg["router"] lo que manda la web (solo claves conocidas)."""
    cur = cfg.get("router") if isinstance(cfg.get("router"), dict) else {}
    cur = dict(cur)
    for k in ("local_answers", "max_tokens", "max_candidates", "index_hits", "confidence"):
        if k in data:
            cur[k] = data[k]
    if isinstance(data.get("layers"), dict):
        cur["layers"] = {**(cur.get("layers") or {}), **{k: bool(v) for k, v in data["layers"].items() if k in DEFAULT["layers"]}}
    cfg["router"] = cur
    cfg["router"] = config(cfg)
    return cfg["router"]


def _clamp(v, lo, hi, typ):
    try:
        return max(lo, min(hi, typ(v)))
    except (TypeError, ValueError):
        return lo


# ---------------------------------------------------------------- capa 1: respuestas locales sin LLM

_SONGS_WITH = [
    re.compile(r"(?:qu[eé]|cu[aá]les)\s+(?:de\s+)?(?:mis\s+)?canciones(?:\s+m[ií]as)?\s+(?:usan|llevan|tienen|suenan con|con)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?:sonido\s+)?[«\"']?([a-z0-9_]+)", re.I),
    re.compile(r"(?:en\s+)?qu[eé]\s+canciones\s+(?:he\s+usado|uso|us[eé])\s+(?:el\s+|la\s+)?(?:sonido\s+)?[«\"']?([a-z0-9_]+)", re.I),
    re.compile(r"(?:which|what)\s+(?:of\s+)?(?:my\s+)?songs\s+(?:use|have|contain|with)\s+(?:the\s+|a\s+)?(?:sound\s+)?[\"']?([a-z0-9_]+)", re.I),
    re.compile(r"(?:where|in which songs)\s+(?:did\s+i\s+use|do\s+i\s+use)\s+(?:the\s+)?(?:sound\s+)?[\"']?([a-z0-9_]+)", re.I),
]
_MY_SONGS = re.compile(r"^\s*(?:¿\s*)?(?:qu[eé]\s+canciones\s+tengo|mis\s+canciones|lista(?:r)?\s+(?:de\s+)?mis\s+canciones|"
                       r"what\s+songs\s+do\s+i\s+have|my\s+songs|list\s+my\s+songs)\s*\??\s*$", re.I)
_SEARCH = re.compile(r"^\s*(?:busca(?:r)?\s+en\s+mis\s+canciones|search\s+my\s+songs\s+for)\s+(.{2,60})$", re.I)


def local_answer(text, index, lang="es"):
    """Respuesta sin LLM si la pregunta es sobre tus propias canciones. Devuelve (respuesta, confianza, aciertos) o None."""
    es = not str(lang or "es").startswith("en")
    L = (lambda a, b: a if es else b)
    t = str(text or "").strip()
    if not t or index is None:
        return None
    if _MY_SONGS.match(t):
        songs = index.songs(50)
        if not songs:
            return ({"mensaje": L("Todavía no tengo ninguna canción tuya en el índice: se añaden solas cada vez que guardas.",
                                  "I don't have any of your songs in the index yet: they're added each time you save.")}, 1.0, 0)
        lines = [f"- {s['name'] or L('(sin título)', '(untitled)')} · {int(s['bpm'] or 0)} BPM · "
                 f"{s['n_tracks']} {L('pistas', 'tracks')}" for s in songs[:20]]
        return ({"mensaje": L(f"Tienes {len(songs)} canciones en el índice:\n", f"You have {len(songs)} songs in the index:\n")
                 + "\n".join(lines)}, 1.0, len(songs))
    for rx in _SONGS_WITH:
        m = rx.search(t)
        if m:
            snd = m.group(1).lower()
            hits = index.with_sound(snd, 30)
            if not hits:
                return ({"mensaje": L(f"Ninguna de tus canciones guardadas usa «{snd}».", f"None of your saved songs use «{snd}».")}, 1.0, 0)
            by = {}
            for h in hits:
                by.setdefault(h["song"] or L("(sin título)", "(untitled)"), []).append(f"{h['track_id']} {h['name']}")
            lines = [f"- {song}: {', '.join(tr)}" for song, tr in by.items()]
            return ({"mensaje": L(f"«{snd}» suena en {len(by)} de tus canciones:\n", f"«{snd}» plays in {len(by)} of your songs:\n")
                     + "\n".join(lines)}, 1.0, len(hits))
    m = _SEARCH.match(t)
    if m:
        hits = index.search(m.group(1), 10)
        if not hits:
            return ({"mensaje": L("No encuentro nada parecido en tus canciones.", "I can't find anything like that in your songs.")}, 1.0, 0)
        lines = [f"- {h['song'] or '?'} · {h['track_id']} {h['name']}: {str(h['code'])[:90]}" for h in hits]
        return ({"mensaje": L("Esto es lo que he encontrado en tus canciones:\n", "This is what I found in your songs:\n")
                 + "\n".join(lines)}, 0.9, len(hits))
    return None


def index_context(index, text, song_id, n):
    """Capa 2 como contexto: pistas de OTRAS canciones tuyas relacionadas con la petición (para inspirarse, no copiar)."""
    if not index or n <= 0:
        return [], 0
    hits = [h for h in index.search(text, n * 3) if h.get("song_id") != song_id][:n]
    lines = [f"«{h.get('song') or '?'}» {h['track_id']} {h.get('name') or ''} ({h.get('kind') or ''}): {str(h.get('code') or '')[:300]}"
             for h in hits]
    return lines, len(hits)


# ---------------------------------------------------------------- monitor

class Monitor:
    """Últimas peticiones con lo que hizo cada capa (para el diagrama en vivo de la app)."""

    def __init__(self, keep=60):
        self.keep = keep
        self.items = []
        self.lock = threading.Lock()

    def start(self, text, trace_id=""):
        req = Request(self, text, trace_id)
        with self.lock:
            self.items.append(req)
            del self.items[:-self.keep]
        return req

    def public(self, since=0):
        with self.lock:
            return [r.public() for r in self.items if r.t0 > since][-self.keep:]

    def summary(self):
        with self.lock:
            done = [r for r in self.items if r.done]
        n = len(done)
        local = sum(1 for r in done if r.answered_by in ("rules", "index"))
        toks = sum((x.get("tokens_in") or 0) + (x.get("tokens_out") or 0) for r in done for x in r.layers.values())
        return {"requests": n, "without_llm": local, "share_without_llm": round(local / n, 3) if n else 0, "tokens": toks}


class Request:
    def __init__(self, mon, text, trace_id):
        self.mon = mon
        self.id = uuid.uuid4().hex[:12]
        self.trace = trace_id
        self.text = str(text or "")[:160]
        self.t0 = time.time()
        self.layers = {k: {"status": "idle"} for k in LAYER_IDS}
        self.answered_by = ""
        self.done = False
        self.total_ms = 0
        self._open = {}

    def begin(self, layer):
        self._open[layer] = time.time()
        with self.mon.lock:
            self.layers[layer] = {**self.layers[layer], "status": "running"}

    def end(self, layer, status="pass", **info):
        """status: hit (respondió) · pass (aportó y siguió) · skip (no hacía falta) · off (desactivada) · error · blocked."""
        t = self._open.pop(layer, None)
        ms = int((time.time() - t) * 1000) if t else 0
        with self.mon.lock:
            cur = self.layers[layer]
            cur.update({k: v for k, v in info.items() if v is not None})
            cur["status"] = status
            cur["ms"] = cur.get("ms", 0) + ms
        if status == "hit" and not self.answered_by:
            self.answered_by = layer

    def add_tokens(self, layer, tin=0, tout=0, cached=0):
        with self.mon.lock:
            cur = self.layers[layer]
            cur["tokens_in"] = cur.get("tokens_in", 0) + int(tin or 0)
            cur["tokens_out"] = cur.get("tokens_out", 0) + int(tout or 0)
            if cached:
                cur["cached"] = cur.get("cached", 0) + int(cached)

    def finish(self):
        for layer in list(self._open):
            self.end(layer, "error")
        with self.mon.lock:
            for v in self.layers.values():
                if v["status"] == "idle":
                    v["status"] = "skip"
            self.total_ms = int((time.time() - self.t0) * 1000)
            self.done = True

    def public(self):
        return {"id": self.id, "trace": self.trace, "text": self.text, "t": round(self.t0, 3), "done": self.done,
                "answered_by": self.answered_by, "total_ms": self.total_ms if self.done else int((time.time() - self.t0) * 1000),
                "layers": {k: dict(v) for k, v in self.layers.items()}}


# ---------------------------------------------------------------- capa 6: validación en el servidor

def _strip_locked(cambios, locked, bpm_lock, blocked):
    if not isinstance(cambios, dict):
        return cambios
    out = dict(cambios)
    if bpm_lock and out.get("bpm"):
        out.pop("bpm", None)
        blocked.append("bpm")
    if out.get("pistas"):
        keep = []
        for p in out["pistas"]:
            if isinstance(p, dict) and p.get("id") in locked:
                blocked.append(p["id"])
            else:
                keep.append(p)
        out["pistas"] = keep
    if out.get("eliminar"):
        keep = []
        for i in out["eliminar"]:
            if i in locked:
                blocked.append(i)
            else:
                keep.append(i)
        out["eliminar"] = keep
    return out


def validate(reply, session, max_candidates=4):
    """Quita de la respuesta lo que toca pistas BLOQUEADAS enteras o el BPM bloqueado (los candados por partes los
    comprueba la app, que tiene la canción). Devuelve la lista de lo bloqueado. La app vuelve a comprobarlo todo."""
    tracks = [t for t in (session or {}).get("tracks") or [] if isinstance(t, dict)]
    locked = {t.get("id") for t in tracks if isinstance(t.get("lock"), dict) and t["lock"].get("all")}
    bpm_lock = bool((session or {}).get("bpm_lock"))
    blocked = []
    if reply.get("cambios"):
        reply["cambios"] = _strip_locked(reply["cambios"], locked, bpm_lock, blocked)
    if reply.get("variantes"):
        keep = []
        for v in reply["variantes"][:max(1, int(max_candidates or 4))]:
            before = len(blocked)
            v["cambios"] = _strip_locked(v.get("cambios") or {}, locked, bpm_lock, blocked)
            c = v["cambios"]
            # Una opción que solo tocaba cosas bloqueadas se queda vacía: no tiene sentido ofrecerla
            if len(blocked) > before and not (c.get("pistas") or c.get("eliminar") or c.get("bpm")):
                continue
            keep.append(v)
        reply["variantes"] = keep
    return sorted(set(blocked))
