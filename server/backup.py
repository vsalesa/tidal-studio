"""Copias de seguridad de tus datos (0.25).

Se hace una copia sola:
  - antes de instalar una actualización (appupdate.install), y
  - al arrancar una versión distinta de la última que usaste, ANTES de abrir ninguna base de datos (así una
    migración que salga mal siempre tiene vuelta atrás). Cubre también los instaladores puestos a mano.
Y cuando tú la pides (Ajustes → Almacenamiento → Copias).

Qué entra: config.json, las bases (memoria, canciones, sonidos; con la API de copia de SQLite, coherentes aunque
estén abiertas), tus canciones en archivo, my-skills y my-plugins. Qué no: samples, grabaciones, caché, índices que
se rehacen y el modelo local (pesan mucho y se recuperan solos o ya son archivos tuyos que no cambian).

Restaurar no pisa nada en caliente: deja la copia marcada y se aplica al volver a abrir la app, antes de abrir las
bases. Antes de restaurar se hace otra copia del estado actual, así que restaurar también se puede deshacer.
"""
import hashlib
import json
import os
import re
import shutil
import sqlite3
import time

import paths

KEEP = 5
PENDING = os.path.join(paths.BACKUPS, "restore-pending.json")
ID_RX = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[a-z0-9.-]{1,40}$")
DBS = [("memory", paths.MEMORY_DB), ("songs", paths.SONGS_DB), ("sounds", paths.SOUNDS_DB)]
TREES = [("my-skills", paths.MY_SKILLS), ("my-plugins", paths.MY_PLUGINS)]


def _sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _slug(s):
    return re.sub(r"[^a-z0-9.-]+", "-", str(s or "").lower()).strip("-")[:40] or "manual"


def _copy_db(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    a = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    try:
        b = sqlite3.connect(dst)
        try:
            a.backup(b)
        finally:
            b.close()
    finally:
        a.close()


def create(reason="manual", version=""):
    """Hace una copia y devuelve su ficha. Nunca lanza por un archivo suelto: lo apunta en «errors»."""
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    bid = f"{stamp}-{_slug(reason)}"
    base = os.path.join(paths.BACKUPS, bid)
    n = 1
    while os.path.exists(base):
        n += 1
        bid = f"{stamp}-{_slug(reason)}-{n}"
        base = os.path.join(paths.BACKUPS, bid)
    os.makedirs(base)
    files, errors = {}, []

    def note(rel):
        p = os.path.join(base, rel)
        files[rel] = {"size": os.path.getsize(p), "sha256": _sha(p)}

    if os.path.isfile(paths.CONFIG):
        shutil.copy2(paths.CONFIG, os.path.join(base, "config.json"))
        note("config.json")
    for folder, db in DBS:
        if os.path.isfile(db):
            rel = f"{folder}/{os.path.basename(db)}"
            try:
                _copy_db(db, os.path.join(base, rel))
                note(rel)
            except sqlite3.Error as e:
                errors.append(f"{rel}: {e}")
    # Las canciones en archivo (sin el índice, que ya va arriba)
    if os.path.isdir(paths.SONGS):
        for name in sorted(os.listdir(paths.SONGS)):
            src = os.path.join(paths.SONGS, name)
            if os.path.isdir(src):
                shutil.copytree(src, os.path.join(base, "songs", name))
                for f in sorted(os.listdir(src)):
                    if os.path.isfile(os.path.join(src, f)):
                        note(f"songs/{name}/{f}")
    for folder, src in TREES:
        if os.path.isdir(src):
            try:
                shutil.copytree(src, os.path.join(base, folder), ignore=shutil.ignore_patterns(".git", "__pycache__"))
                for d, _, fs in os.walk(os.path.join(base, folder)):
                    for f in fs:
                        note(os.path.relpath(os.path.join(d, f), base).replace(os.sep, "/"))
            except OSError as e:
                errors.append(f"{folder}: {e}")
    info = {"id": bid, "reason": reason, "version": version, "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "files": files, "errors": errors}
    with open(os.path.join(base, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    prune()
    return summary(info)


def summary(info):
    return {k: info.get(k) for k in ("id", "reason", "version", "created", "errors")} | {
        "n_files": len(info.get("files") or {}), "size": sum(v["size"] for v in (info.get("files") or {}).values()),
        "songs": len({k.split("/")[1] for k in (info.get("files") or {}) if k.startswith("songs/") and k.count("/") >= 2}),
        "memory": "memory/memory.db" in (info.get("files") or {})}


def _manifest(bid):
    if not ID_RX.match(str(bid or "")):
        raise ValueError("copia desconocida")
    with open(os.path.join(paths.BACKUPS, bid, "manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def list_all():
    out = []
    if os.path.isdir(paths.BACKUPS):
        for bid in sorted(os.listdir(paths.BACKUPS), reverse=True):
            if ID_RX.match(bid):
                try:
                    out.append(summary(_manifest(bid)))
                except (OSError, ValueError):
                    continue
    return out


def prune(keep=KEEP):
    """Deja las «keep» copias más nuevas (por fecha en el nombre). Una copia pendiente de restaurar no se borra."""
    pending = (read_pending() or {}).get("id")
    ids = [b for b in sorted(os.listdir(paths.BACKUPS), reverse=True) if ID_RX.match(b)] if os.path.isdir(paths.BACKUPS) else []
    for bid in ids[keep:]:
        if bid != pending:
            shutil.rmtree(os.path.join(paths.BACKUPS, bid), ignore_errors=True)


def read_pending():
    try:
        with open(PENDING, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def schedule_restore(bid):
    m = _manifest(bid)
    with open(PENDING, "w", encoding="utf-8") as f:
        json.dump({"id": m["id"], "asked": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f)
    return summary(m)


def cancel_restore():
    try:
        os.remove(PENDING)
    except OSError:
        pass


def verify(bid):
    """Comprueba que la copia está entera (tamaños y SHA-256 del manifiesto). Devuelve la lista de fallos."""
    m = _manifest(bid)
    bad = []
    for rel, f in (m.get("files") or {}).items():
        p = os.path.join(paths.BACKUPS, bid, rel)
        if not os.path.isfile(p) or os.path.getsize(p) != f["size"] or _sha(p) != f["sha256"]:
            bad.append(rel)
    return bad


def apply_pending(version=""):
    """Al arrancar, ANTES de abrir las bases: si pediste restaurar una copia, la aplica. Guarda antes el estado
    actual en otra copia. Devuelve la ficha de lo restaurado o None."""
    p = read_pending()
    if not p:
        return None
    cancel_restore()
    bid = p.get("id")
    try:
        bad = verify(bid)
    except (OSError, ValueError) as e:
        return {"id": bid, "ok": False, "error": str(e)}
    if bad:
        return {"id": bid, "ok": False, "error": "copia dañada: " + ", ".join(bad[:5])}
    before = create("before-restore", version)
    src = os.path.join(paths.BACKUPS, bid)
    m = _manifest(bid)
    rels = list((m.get("files") or {}).keys())
    if "config.json" in rels:
        shutil.copy2(os.path.join(src, "config.json"), paths.CONFIG)
    for folder, db in DBS:
        rel = f"{folder}/{os.path.basename(db)}"
        if rel in rels:
            for side in paths.SQLITE_SIDE[1:]:
                try:
                    os.remove(db + side)
                except OSError:
                    pass
            os.makedirs(os.path.dirname(db), exist_ok=True)
            shutil.copy2(os.path.join(src, rel), db)
    # Canciones: las de la copia vuelven; las que hiciste después se quedan (nunca se borra una canción)
    if os.path.isdir(os.path.join(src, "songs")):
        for name in os.listdir(os.path.join(src, "songs")):
            if not os.path.isdir(os.path.join(src, "songs", name)):
                continue  # songs/maestro.db ya se restauró arriba, con las demás bases
            d = os.path.join(paths.SONGS, name)
            shutil.rmtree(d, ignore_errors=True)
            shutil.copytree(os.path.join(src, "songs", name), d)
    for folder, dst in TREES:
        if os.path.isdir(os.path.join(src, folder)):
            shutil.copytree(os.path.join(src, folder), dst, dirs_exist_ok=True)
    return {"id": bid, "ok": True, "before": before["id"]}


def on_start(version):
    """Al arrancar: si la versión cambió desde la última vez, copia de seguridad antes de que nada migre."""
    last = paths.read_layout().get("last_version") or ""
    made = None
    if version and last != version:
        has_data = any(os.path.isfile(db) for _, db in DBS) or os.path.isfile(paths.CONFIG)
        if has_data:
            made = create(f"before-{version}" + (f"-from-{last}" if last else ""), last or "")
        paths.write_layout(last_version=version)
    return made
