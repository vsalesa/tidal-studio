"""Tus canciones también en archivo (0.25): <datos>/songs/<nombre>/ con el mismo formato que en GitHub
(song.tidal, song.json, song.musicxml, README.md).

El navegador sigue siendo donde editas. Cada vez que guardas, la copia de solo lectura que ya se mandaba al
servidor (índice de canciones) escribe además estos archivos. Si el navegador pierde «Mis proyectos» (otro puerto,
perfil nuevo, reinstalación), la app las recupera desde aquí.
"""
import json
import os
import re
import shutil
import unicodedata
import xml.etree.ElementTree as ET

import github
import paths
import score as scoremod

MAX_SONGS = 2000


def slug(name):
    s = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()[:60]
    return s or "cancion"


def _read_json(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _index():
    """{projectId: carpeta} de lo que hay en disco."""
    out = {}
    if os.path.isdir(paths.SONGS):
        for d in os.listdir(paths.SONGS):
            meta = _read_json(os.path.join(paths.SONGS, d, "song.json"))
            if isinstance(meta, dict) and meta.get("projectId"):
                out[str(meta["projectId"])] = d
    return out


def _folder_for(pid, name):
    idx = _index()
    if pid in idx:
        return idx[pid]
    base = slug(name)
    d, n = base, 1
    while os.path.exists(os.path.join(paths.SONGS, d)):
        n += 1
        d = f"{base}-{n}"
    return d


def write(song):
    """Escribe (o actualiza) los archivos de una canción a partir de lo que manda el navegador al guardar.
    Si cambia el nombre, la carpeta se renombra. Devuelve la carpeta."""
    pid = str(song.get("id") or song.get("projectId") or "").strip()[:80]
    if not pid or not (song.get("tracks") or []):
        return None
    project = {"name": song.get("name") or "", "bpm": song.get("bpm"), "style": song.get("style") or "",
               "tracks": song.get("tracks") or [], "projectId": pid, "extra": song.get("extra") or "",
               "score": song.get("score")}
    files = github.song_files(project)
    old = _index().get(pid)
    want = slug(project["name"] or "cancion")
    folder = old or _folder_for(pid, want)
    if old and not (old == want or old.startswith(want + "-")) and project["name"]:
        new = _folder_for("", want)
        try:
            os.rename(os.path.join(paths.SONGS, old), os.path.join(paths.SONGS, new))
            folder = new
        except OSError:
            pass
    d = os.path.join(paths.SONGS, folder)
    os.makedirs(d, exist_ok=True)
    for fname, text in files.items():
        tmp = os.path.join(d, fname + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, os.path.join(d, fname))
    if "song.musicxml" not in files:
        try:
            os.remove(os.path.join(d, "song.musicxml"))
        except OSError:
            pass
    return folder


def forget(pid):
    """Borras un proyecto en «Mis proyectos»: se borran sus archivos (las copias de seguridad lo conservan)."""
    folder = _index().get(str(pid or ""))
    if folder:
        shutil.rmtree(os.path.join(paths.SONGS, folder), ignore_errors=True)
    return folder


def list_local():
    out = []
    for pid, folder in list(_index().items())[:MAX_SONGS]:
        d = os.path.join(paths.SONGS, folder)
        meta = _read_json(os.path.join(d, "song.json")) or {}
        try:
            mtime = os.path.getmtime(os.path.join(d, "song.json"))
        except OSError:
            mtime = 0
        out.append({"slug": folder, "projectId": pid, "name": meta.get("name") or folder, "bpm": meta.get("bpm"),
                    "tracks": len(meta.get("tracks") or []), "updated": int(mtime * 1000),
                    "score": os.path.isfile(os.path.join(d, "song.musicxml"))})
    out.sort(key=lambda x: -x["updated"])
    return out


def load(folder):
    """Lo mismo que devuelve github.load_song, pero desde tu disco."""
    if not re.match(r"^[a-z0-9][a-z0-9-]{0,70}$", str(folder or "")):
        raise ValueError("canción desconocida")
    d = os.path.join(paths.SONGS, folder)
    data = _read_json(os.path.join(d, "song.json"))
    if not isinstance(data, dict):
        raise ValueError("canción desconocida")
    xp = os.path.join(d, "song.musicxml")
    if os.path.isfile(xp):
        try:
            with open(xp, encoding="utf-8", errors="replace") as f:
                data["score"] = scoremod.to_json(scoremod.from_musicxml(f.read()))
        except (ValueError, ET.ParseError):
            data["score_error"] = "song.musicxml"
    data["local"] = {"slug": folder}
    return data
