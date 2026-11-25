"""
Caché de Maestro: lo que ya ha buscado o cargado no se vuelve a pedir.

Dos niveles:
  - memoria (rápida, se pierde al cerrar el estudio)
  - disco, en la carpeta cache/ junto a config.json (sobrevive a reinicios), con caducidad

Se usa para las búsquedas de samples en internet (índices de packs, Freesound, tamaños de archivo),
para no repetir trabajo entre los pasos de un plan y entre sesiones.
"""
import hashlib
import json
import os
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import paths  # noqa: E402
DIR = paths.CACHE
DAY = 24 * 3600

_mem = {}
_lock = threading.Lock()
STATS = {"hits": 0, "misses": 0}


def _path(ns, key):
    h = hashlib.sha1(f"{ns}\n{key}".encode("utf-8")).hexdigest()[:24]
    return os.path.join(DIR, ns, h + ".json")


def get(ns, key, ttl=DAY):
    """El valor guardado, o None si no hay o ha caducado."""
    now = time.time()
    with _lock:
        hit = _mem.get((ns, key))
    if hit and now - hit[0] < ttl:
        STATS["hits"] += 1
        return hit[1]
    try:
        with open(_path(ns, key), "r", encoding="utf-8") as f:
            d = json.load(f)
        if now - float(d.get("t", 0)) < ttl and d.get("key") == key:
            with _lock:
                _mem[(ns, key)] = (float(d["t"]), d["value"])
            STATS["hits"] += 1
            return d["value"]
    except (OSError, ValueError, KeyError, TypeError):
        pass
    STATS["misses"] += 1
    return None


def put(ns, key, value, disk=True):
    t = time.time()
    with _lock:
        _mem[(ns, key)] = (t, value)
        if len(_mem) > 2000:  # que no crezca sin fin
            for k in sorted(_mem, key=lambda k: _mem[k][0])[:500]:
                _mem.pop(k, None)
    if not disk:
        return value
    p = _path(ns, key)
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"t": t, "key": key, "value": value}, f, ensure_ascii=False)
        os.replace(tmp, p)
    except (OSError, TypeError, ValueError):
        pass
    return value


def cached(ns, key, fn, ttl=DAY, disk=True, keep=lambda v: True):
    """get() o, si no está, fn() y lo guarda (solo si keep(valor): p. ej. no guardar resultados vacíos por un fallo de red)."""
    v = get(ns, key, ttl)
    if v is not None:
        return v
    v = fn()
    if v is not None and keep(v):
        put(ns, key, v, disk)
    return v


def clear(ns=None):
    with _lock:
        for k in [k for k in _mem if ns is None or k[0] == ns]:
            _mem.pop(k, None)
    import shutil
    shutil.rmtree(os.path.join(DIR, ns) if ns else DIR, ignore_errors=True)
