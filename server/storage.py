"""Panel de almacenamiento (Maestro v2, release 0.18): qué ocupa sitio y qué pasa si lo borras.

Nada se borra solo (no hay caducidad). Cada grupo dice cuánto ocupa, qué pasa si lo borras y si SuperDirt lo carga
al arrancar (borrarlo hace que el estudio arranque antes y use menos memoria). Tú eliges qué borrar.

Impacto de borrar, de menos a más:
- safe      se rehace solo (caché, índice de canciones)
- slower    se vuelve a descargar o a analizar cuando haga falta (tarda un poco la próxima vez)
- feature   esa función deja de estar hasta que la vuelvas a instalar
- yours     es tuyo y no se puede recuperar (solo uno a uno, con confirmación)
- keep      no se borra desde aquí (tu aprendizaje: votos, elecciones, memoria; tiene su propio panel)
"""
import os
import shutil
import time

IMPACT_ORDER = {"safe": 0, "slower": 1, "feature": 2, "yours": 3, "keep": 4}
AUDIO_EXT = (".wav", ".aif", ".aiff", ".flac", ".ogg", ".mp3")


def du(path, limit_s=4.0):
    """(bytes, ficheros) de una carpeta o fichero. Para en limit_s segundos (marcado con «más de»)."""
    if not path or not os.path.exists(path):
        return 0, 0, False
    if os.path.isfile(path):
        return os.path.getsize(path), 1, False
    total, n, t0 = 0, 0, time.time()
    for root, dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
                n += 1
            except OSError:
                pass
        if time.time() - t0 > limit_s:
            return total, n, True
    return total, n, False


def _items(dirs):
    out = []
    for name, d in dirs:
        size, n, _ = du(d, 1.0)
        out.append({"id": name, "name": name, "size": size, "files": n})
    return sorted(out, key=lambda x: -x["size"])


def library_groups(lib_dir):
    """Reparte la carpeta de sonidos en: instrumentos descargados, sonidos descargados y lo tuyo."""
    import json
    meta = {}
    try:
        with open(os.path.join(lib_dir, "library.json"), "r", encoding="utf-8") as f:
            meta = json.load(f).get("sounds", {})
    except (OSError, ValueError):
        pass
    inst, dl, mine = [], [], []
    if os.path.isdir(lib_dir):
        for name in sorted(os.listdir(lib_dir)):
            d = os.path.join(lib_dir, name)
            if not os.path.isdir(d) or name.startswith(".") or name == "packs":
                continue
            ij = os.path.join(d, "instrument.json")
            if os.path.isfile(ij):
                try:
                    with open(ij, "r", encoding="utf-8") as f:
                        src = json.load(f).get("src")
                except (OSError, ValueError):
                    src = ""
                (mine if src == "user" else inst).append((name, d))
            elif (meta.get(name) or {}).get("source", "local") in ("local", "", None):
                mine.append((name, d))
            else:
                dl.append((name, d))
        pdir = os.path.join(lib_dir, "packs")
        if os.path.isdir(pdir):
            mine += [("packs/" + p, os.path.join(pdir, p)) for p in sorted(os.listdir(pdir)) if os.path.isdir(os.path.join(pdir, p))]
    return inst, dl, mine


def scan(paths, counts=None):
    """paths: root, lib_dir, data_dir, tools, stems. counts: números de las bases de datos para explicar qué hay."""
    counts = counts or {}
    root, lib, data, tools, stems = (paths.get(k, "") for k in ("root", "lib_dir", "data_dir", "tools", "stems"))
    inst, dl, mine = library_groups(lib)
    G = []

    def add(gid, es, en, impact, ies, ien, size_from=None, items=None, start=False, deletable=True, extra=None):
        if items is not None:
            size = sum(i["size"] for i in items)
            files = sum(i["files"] for i in items)
            partial = False
        else:
            size, files, partial = du(size_from) if isinstance(size_from, str) else (0, 0, False)
            if isinstance(size_from, list):
                for p in size_from:
                    s, n, pa = du(p)
                    size, files, partial = size + s, files + n, partial or pa
        g = {"id": gid, "es": es, "en": en, "impact": impact, "impact_es": ies, "impact_en": ien, "size": size,
             "files": files, "partial": partial, "start": start, "deletable": deletable and size > 0}
        if items is not None:
            g["items"] = items[:60]
            g["n_items"] = len(items)
        if extra:
            g.update(extra)
        G.append(g)

    add("cache", "Caché de Maestro (respuestas, búsquedas de sonidos)", "Maestro's cache (replies, sound searches)",
        "safe", "Se rehace sola. Maestro tarda un poco más la próxima vez que busque lo mismo.",
        "Rebuilds itself. Maestro takes a little longer the next time it looks up the same thing.",
        os.path.join(root, "cache"))
    add("index", "Índice de canciones (copia de solo lectura)", "Song index (read-only copy)", "safe",
        f"Se rehace al guardar tus canciones. Tus votos no se borran. Ahora: {counts.get('songs', 0)} canciones.",
        f"Rebuilds when you save your songs. Your votes aren't deleted. Now: {counts.get('songs', 0)} songs.",
        None, extra={"size": counts.get("index_bytes", 0), "deletable": counts.get("songs", 0) > 0})
    add("features", "Medidas de sonido (laboratorio)", "Sound measurements (Sound lab)", "slower",
        f"Vuelve a analizar los sonidos cuando lo pidas. Lo que elegiste de oído se conserva. Ahora: {counts.get('features', 0)} sonidos medidos.",
        f"Analyze the sounds again when you want. What you picked by ear is kept. Now: {counts.get('features', 0)} measured sounds.",
        None, extra={"size": counts.get("features_bytes", 0), "deletable": counts.get("features", 0) > 0})
    add("instruments", "Instrumentos descargados de la librería", "Instruments downloaded from the library", "slower",
        "Se vuelven a descargar solos cuando una canción o un curso los use. SuperDirt los carga al arrancar: borrar los que no usas hace que arranque antes y gaste menos memoria.",
        "They download again by themselves when a song or a course uses them. SuperDirt loads them at start: deleting the ones you don't use makes it start faster and use less memory.",
        items=_items(inst), start=True)
    add("downloads", "Sonidos descargados (Freesound, packs libres, Maestro)", "Downloaded sounds (Freesound, free packs, Maestro)", "slower",
        "Maestro puede volver a buscarlos, pero quizá no encuentre exactamente el mismo. SuperDirt los carga al arrancar.",
        "Maestro can look for them again, but it may not find exactly the same one. SuperDirt loads them at start.",
        items=_items(dl), start=True)
    add("mine", "Tus sonidos, instrumentos y packs", "Your sounds, instruments and packs", "yours",
        "Son tuyos: si los borras no se pueden recuperar. Solo se borran uno a uno. SuperDirt los carga al arrancar.",
        "They're yours: deleted ones can't be recovered. Only one by one. SuperDirt loads them at start.",
        items=_items(mine), start=True, deletable=False)
    add("references", "Bateristas reales (Groove MIDI Dataset)", "Real drummers (Groove MIDI Dataset)", "slower",
        "Se vuelve a descargar (3 MB) la próxima vez que un curso lo use.", "Downloads again (3 MB) the next time a course uses it.",
        os.path.join(root, "references"))
    stem_items = _items([(n, os.path.join(stems, n)) for n in sorted(os.listdir(stems))]) if stems and os.path.isdir(stems) else []
    add("stems", "Pistas separadas de canciones importadas", "Stems of imported songs", "slower",
        "El laboratorio de sonido ya no podrá analizarlas. Si vuelves a importar la canción, se separan otra vez.",
        "The Sound lab can't analyze them anymore. Import the song again to split it again.", items=stem_items)
    add("models", "Modelos de separación de audio (MSST, Demucs)", "Audio separation models (MSST, Demucs)", "slower",
        "Se vuelven a descargar la próxima vez que importes un audio.", "They download again the next time you import audio.",
        os.path.join(tools, "models") if tools else None)
    add("clamp", "CLaMP 3 (complemento experimental)", "CLaMP 3 (experimental add-on)", "feature",
        "Se desactiva hasta que lo vuelvas a instalar desde el laboratorio de sonido. Todo lo demás funciona sin él.",
        "It turns off until you install it again from the Sound lab. Everything else works without it.",
        os.path.join(tools, "clamp3") if tools else None)
    add("audiotools", "Herramientas de audio (Python, PyTorch, librosa)", "Audio tools (Python, PyTorch, librosa)", "feature",
        "Importar audio, analizar mp3/ogg/flac y CLaMP 3 dejan de funcionar hasta que las vuelvas a instalar (1-2 GB).",
        "Importing audio, analysing mp3/ogg/flac and CLaMP 3 stop working until you install them again (1-2 GB).",
        os.path.join(tools, "venv") if tools else None)
    add("learning", "Tu aprendizaje: votos, elecciones de oído, memoria, estilos y casos", "Your learning: votes, picks by ear, memory, styles and cases", "keep",
        "No se borra desde aquí: es lo que el estudio ha aprendido de ti. Exporta o borra desde Escucha y Memoria.",
        "Not deleted from here: it's what the studio learned from you. Export or delete from Listening and Memory.",
        [os.path.join(data, "memory.db"), os.path.join(data, "sounds.db"), os.path.join(data, "maestro.db")] if data else None, deletable=False)
    total = sum(g["size"] for g in G if g["id"] not in ("index", "features"))
    return {"groups": G, "total": total, "folders": {"studio": root, "library": lib, "data": data, "tools": tools}}


def _rm(path):
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
    elif os.path.exists(path):
        os.remove(path)


def delete(paths, gid, item=None, hooks=None):
    """Borra un grupo entero o un elemento. hooks: funciones del estudio para lo que no es una carpeta suelta
    (vaciar el índice, olvidar medidas, quitar un instrumento de SuperDirt…)."""
    hooks = hooks or {}
    root, lib, tools, stems = (paths.get(k, "") for k in ("root", "lib_dir", "tools", "stems"))
    if gid == "cache":
        _rm(os.path.join(root, "cache"))
    elif gid == "index":
        hooks["clear_index"]()
    elif gid == "features":
        hooks["clear_features"]()
    elif gid in ("instruments", "downloads", "mine"):
        inst, dl, mine = library_groups(lib)
        pool = dict({"instruments": inst, "downloads": dl, "mine": mine}[gid])
        if gid == "mine" and not item:
            raise ValueError("Lo tuyo solo se borra uno a uno|Your own things are only deleted one by one")
        names = [item] if item else list(pool)
        for n in names:
            if n not in pool:
                raise KeyError(n)
            if n.startswith("packs/"):
                _rm(pool[n])
            elif gid == "instruments" or os.path.isfile(os.path.join(pool[n], "instrument.json")):
                hooks["remove_instrument"](n)
            else:
                hooks["remove_sound"](n)
    elif gid == "references":
        _rm(os.path.join(root, "references"))
    elif gid == "stems":
        if item:
            p = os.path.join(stems, os.path.basename(item))
            if not os.path.isdir(p):
                raise KeyError(item)
            _rm(p)
        else:
            _rm(stems)
    elif gid == "models":
        _rm(os.path.join(tools, "models"))
    elif gid == "clamp":
        _rm(os.path.join(tools, "clamp3"))
    elif gid == "audiotools":
        _rm(os.path.join(tools, "venv"))
        for m in ("ready-v1", "ready-v2"):
            _rm(os.path.join(tools, m))
    else:
        raise KeyError(gid)
    return {"ok": True, "id": gid, "item": item}
