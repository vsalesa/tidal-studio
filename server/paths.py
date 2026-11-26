"""Dónde vive cada cosa (0.25 «Tus datos a salvo»).

El programa y tus datos van en carpetas distintas, para que una actualización nunca toque lo tuyo:

  <programa>/                 server/, web/, skills/… (lo que trae cada versión; se puede reemplazar entera)
  <datos>/                    TUS DATOS. Una carpeta por lo que guarda, con los mismos nombres que en GitHub:
    config.json               tus ajustes (tokens incluidos: nunca se sube a ningún sitio)
    songs/<nombre>/           cada canción en archivo: song.tidal, song.json, song.musicxml (como en GitHub)
    songs/maestro.db          índice de canciones y votos A/B (se rehace desde los archivos)
    memory/memory.db          memorias, estilos y casos
    executions/executions.db  registro de ejecuciones: tokens y tiempos reales por respuesta (0.26)
    sounds/sounds.db          medidas de sonido, recetas y lo que eliges de oído
    knowledge/                índice de skills (se rehace solo)
    samples/  recordings/  my-skills/  my-plugins/  references/  cache/
    models/                   modelo local (cuando llegue; no entra en las copias)
    backups/                  copias automáticas antes de cada actualización (las 5 últimas)

<datos> es la variable TIDAL_STUDIO_USERDATA (los lanzadores de la app instalada la ponen junto a la copia
del programa: …/Tidal Studio/data) o, si ejecutas desde el código fuente, <programa>/data.

Hasta la 0.24 todo vivía DENTRO de la copia del programa: migrate() lo mueve una vez a <datos>.
"""
import json
import os
import shutil
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _user_dir():
    env = (os.environ.get("TIDAL_STUDIO_USERDATA") or "").strip()
    return os.path.abspath(os.path.expanduser(env)) if env else os.path.join(ROOT, "data")


USER = _user_dir()
# Las bases de datos. TIDAL_STUDIO_DATA (pruebas y capturas con una carpeta vacía) solo cambia dónde van estas.
DB_ROOT = os.path.abspath(os.path.expanduser(os.environ.get("TIDAL_STUDIO_DATA") or USER))

CONFIG = os.path.join(USER, "config.json")
SAMPLES = os.path.join(USER, "samples")
RECORDINGS = os.path.join(USER, "recordings")
REFERENCES = os.path.join(USER, "references")
CACHE = os.path.join(USER, "cache")
MY_PLUGINS = os.path.join(USER, "my-plugins")
MY_SKILLS = os.path.join(USER, "my-skills")
MODELS = os.path.join(USER, "models")
BACKUPS = os.path.join(USER, "backups")

SONGS = os.path.join(DB_ROOT, "songs")
SONGS_DB = os.path.join(SONGS, "maestro.db")
MEMORY_DB = os.path.join(DB_ROOT, "memory", "memory.db")
SOUNDS_DB = os.path.join(DB_ROOT, "sounds", "sounds.db")
EXECUTIONS_DB = os.path.join(DB_ROOT, "executions", "executions.db")
KNOWLEDGE = os.path.join(DB_ROOT, "knowledge")
KNOWLEDGE_DB = os.path.join(KNOWLEDGE, "maestro-knowledge.sqlite")
MANAGED_SKILLS = os.path.join(KNOWLEDGE, "managed-skills.json")

LAYOUT = os.path.join(USER, "layout.json")
LAYOUT_VERSION = 1

# Lo que hasta la 0.24 vivía en <programa>/ → dónde va ahora
LEGACY_DIRS = ["samples", "recordings", "references", "cache", "my-plugins", "my-skills"]
LEGACY_DB = {  # maestro-data/<archivo> → <datos>/<carpeta>/<archivo>
    "memory.db": "memory", "maestro.db": "songs", "sounds.db": "sounds",
    "maestro-knowledge.sqlite": "knowledge", "managed-skills.json": "knowledge",
}
SQLITE_SIDE = ("", "-wal", "-shm", "-journal")
KEEP_IN_PLACE = {".gitkeep"}  # archivos del repositorio que no son tuyos

# SuperCollider (start_superdirt.scd) lee aquí tus samples
os.environ["TIDAL_STUDIO_SAMPLES"] = SAMPLES


def _move(src, dst, log):
    """Mueve un archivo o carpeta sin pisar nada: si el destino ya existe, mezcla carpeta a carpeta y deja
    en su sitio lo que chocaría (nunca borra algo que no haya copiado)."""
    if os.path.isdir(src) and not os.path.islink(src):
        os.makedirs(dst, exist_ok=True)
        for name in sorted(os.listdir(src)):
            if name in KEEP_IN_PLACE:
                continue
            _move(os.path.join(src, name), os.path.join(dst, name), log)
        try:
            left = [n for n in os.listdir(src) if n not in KEEP_IN_PLACE]
            if not left and not any(os.path.exists(os.path.join(src, k)) for k in KEEP_IN_PLACE):
                os.rmdir(src)
        except OSError:
            pass
        return
    if os.path.lexists(dst):
        log.append(f"skip {src} (ya existe {dst})")
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(src, dst)
    log.append(f"{src} → {dst}")


def read_layout():
    try:
        with open(LAYOUT, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def write_layout(**kw):
    data = {**read_layout(), **kw, "layout": LAYOUT_VERSION}
    os.makedirs(USER, exist_ok=True)
    tmp = LAYOUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, LAYOUT)
    return data


def migrate(legacy_root=None):
    """Una sola vez: mueve tus datos de dentro de la copia del programa a <datos>. Idempotente: si ya se hizo,
    solo recoge lo que una versión vieja haya vuelto a dejar allí. Devuelve la lista de lo movido."""
    legacy = os.path.abspath(legacy_root or ROOT)
    log = []
    if os.path.abspath(USER) == legacy:
        return log
    os.makedirs(USER, exist_ok=True)
    cfg = os.path.join(legacy, "config.json")
    if os.path.isfile(cfg):
        _move(cfg, CONFIG, log)
    for d in LEGACY_DIRS:
        src = os.path.join(legacy, d)
        if os.path.isdir(src):
            _move(src, os.path.join(USER, d), log)
    old_db = os.path.join(legacy, "maestro-data")
    if os.path.isdir(old_db) and not os.environ.get("TIDAL_STUDIO_DATA"):
        for name, folder in LEGACY_DB.items():
            for side in SQLITE_SIDE if not name.endswith(".json") else ("",):
                src = os.path.join(old_db, name + side)
                if os.path.exists(src):
                    _move(src, os.path.join(USER, folder, name + side), log)
        # Lo que no conocemos se queda junto a lo demás, en una carpeta aparte (no se pierde nada)
        for name in sorted(os.listdir(old_db)):
            _move(os.path.join(old_db, name), os.path.join(USER, "maestro-data-old", name), log)
        try:
            os.rmdir(old_db)
        except OSError:
            pass
    for d in ("songs", "memory", "sounds", "knowledge", "backups"):
        os.makedirs(os.path.join(USER, d), exist_ok=True)
    os.makedirs(SAMPLES, exist_ok=True)
    if log or not read_layout():
        write_layout(migrated_at=read_layout().get("migrated_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                     migrated_from=legacy)
    return log
