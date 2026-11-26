"""Registro persistente de ejecuciones (0.26 «Medir»).

Cada petición al chat de Maestro deja una fila en <datos>/executions/executions.db al terminar: qué capa respondió,
cuánto tardó, cuántas llamadas a la IA hizo y los tokens reales (entrada, salida, caché). Sirve de línea base para
comparar cada versión con la anterior («tokens por respuesta», «% sin IA»). null = no medido, nunca 0 inventado.

Guarda solo el texto recortado de lo que pediste (160 caracteres, el mismo del monitor), no los prompts completos.
Se borra lo que pasa de LIMITS «ledger_days» días (ajustable en Ajustes → Límites).
"""
import json
import os
import sqlite3
import threading
import time

DAYS = 365
SCHEMA = """
CREATE TABLE IF NOT EXISTS executions(
  id TEXT PRIMARY KEY, ts REAL NOT NULL, version TEXT, text TEXT, answered_by TEXT, total_ms INTEGER,
  llm_calls INTEGER, tokens_in INTEGER, tokens_out INTEGER, tokens_cached INTEGER, provider TEXT, layers TEXT);
CREATE INDEX IF NOT EXISTS ex_ts ON executions(ts);
CREATE INDEX IF NOT EXISTS ex_version ON executions(version);
"""


def _pct(sorted_vals, p):
    if not sorted_vals:
        return None
    return sorted_vals[min(len(sorted_vals) - 1, int(round(p * (len(sorted_vals) - 1))))]


class Ledger:
    def __init__(self, path, version=""):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.version = version
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(SCHEMA)

    def record(self, req):
        """Guarda una petición terminada (router.Request). Nunca rompe el chat."""
        try:
            pub = req.public()
            lay = pub["layers"]
            llm = lay.get("llm") or {}
            used = llm.get("status") in ("hit", "error") or llm.get("tokens_in") is not None
            tin = sum(x.get("tokens_in") or 0 for x in lay.values()) if used else None
            tout = sum(x.get("tokens_out") or 0 for x in lay.values()) if used else None
            cached = sum(x.get("cached") or 0 for x in lay.values()) if used else None
            with self.lock, self.db:
                self.db.execute("INSERT OR REPLACE INTO executions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                                (pub["id"], pub["t"], self.version, pub["text"], pub["answered_by"] or ("llm" if used else ""),
                                 pub["total_ms"], int(llm.get("calls") or 0), tin, tout, cached,
                                 llm.get("note") or None, json.dumps(lay, ensure_ascii=False)))
        except Exception as e:  # noqa: BLE001
            print(f"[ledger] {e}")

    def prune(self, days=None):
        days = days or DAYS
        with self.lock, self.db:
            return self.db.execute("DELETE FROM executions WHERE ts<?", (time.time() - days * 86400,)).rowcount

    def recent(self, limit=100, version=None):
        q, a = "SELECT id,ts,version,text,answered_by,total_ms,llm_calls,tokens_in,tokens_out,tokens_cached,provider FROM executions", []
        if version:
            q += " WHERE version=?"
            a.append(version)
        q += " ORDER BY ts DESC LIMIT ?"
        a.append(max(1, min(int(limit or 100), 1000)))
        cols = ["id", "t", "version", "text", "answered_by", "total_ms", "llm_calls", "tokens_in", "tokens_out", "cached", "provider"]
        with self.lock:
            return [dict(zip(cols, r)) for r in self.db.execute(q, a).fetchall()]

    def baseline(self):
        """Línea base por versión: respuestas, % sin IA, llamadas y tokens por respuesta, latencia p50/p95."""
        with self.lock:
            rows = self.db.execute("SELECT version,answered_by,total_ms,llm_calls,tokens_in,tokens_out,tokens_cached "
                                   "FROM executions ORDER BY ts").fetchall()
        by = {}
        for v, ans, ms, calls, tin, tout, cached in rows:
            by.setdefault(v or "?", []).append((ans, ms or 0, calls or 0, tin, tout, cached))
        out = []
        for v, rs in by.items():
            n = len(rs)
            no_llm = sum(1 for r in rs if r[2] == 0)
            with_llm = [r for r in rs if r[2] > 0]
            toks = [(r[3] or 0) + (r[4] or 0) for r in with_llm]
            ms = sorted(r[1] for r in rs)
            out.append({"version": v, "requests": n, "without_llm": no_llm, "share_without_llm": round(no_llm / n, 3),
                        "llm_calls": sum(r[2] for r in rs), "calls_per_request": round(sum(r[2] for r in rs) / n, 3),
                        "tokens_total": sum(toks), "tokens_per_llm_request": round(sum(toks) / len(toks)) if toks else None,
                        "tokens_cached": sum(r[5] or 0 for r in with_llm),
                        "ms_p50": _pct(ms, 0.5), "ms_p95": _pct(ms, 0.95)})
        return out
