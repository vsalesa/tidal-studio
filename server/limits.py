"""Todos los topes del estudio, configurables (0.25.1). Ajustes → Límites.

Cada tope sigue viviendo como constante en su módulo (MAX_SAMPLES en inventory.py…): apply() la cambia con el valor
de config.json → limits, así el código que la usa no cambia. Los valores de serie son los de siempre; cada uno tiene
un mínimo y un máximo para que un número raro no rompa nada. «Restablecer» = borrar la clave de limits.

El número de pistas es aparte (server/tracklimit.py: cambia el arranque del motor).
"""
import importlib
import os

MB = 1024 * 1024

# key, módulo, constante, valor de serie, mínimo, máximo, unidad, escala (lo guardado × escala = la constante), grupo,
# texto es, texto en
DEFS = [
    # Maestro (lo que entra en cada mensaje: más = respuestas más informadas pero más tokens y más lentas)
    ("ai_hard_cap", "llm", "HARD_CAP", 3, 1, 10, "×", 1, "maestro",
     "Tiempo total máximo de una respuesta (veces el tiempo sin respuesta)", "Max total time of an answer (times the no-output timeout)"),
    ("inv_samples", "inventory", "MAX_SAMPLES", 150, 10, 2000, "", 1, "maestro",
     "Samples tuyos que Maestro ve en cada mensaje", "Your samples Maestro sees in each message"),
    ("inv_instruments", "inventory", "MAX_INSTRUMENTS", 120, 10, 2000, "", 1, "maestro",
     "Instrumentos que Maestro ve en cada mensaje", "Instruments Maestro sees in each message"),
    ("skills_loaded", "skills", "MAX_LOADED", 2, 1, 8, "", 1, "maestro",
     "Skills que se cargan enteras por respuesta", "Skills loaded in full per answer"),
    ("skills_budget", "skills", "BUDGET", 24000, 4000, 120000, "caracteres|characters", 1, "maestro",
     "Tope de texto de skills en el prompt", "Max skills text in the prompt"),
    ("skills_file", "skills", "MAX_FILE", 9000, 1000, 60000, "caracteres|characters", 1, "maestro",
     "Tope por archivo de skill", "Max per skill file"),
    ("skills_smart", "skills", "SMART_BUDGET", 8000, 2000, 60000, "caracteres|characters", 1, "maestro",
     "Skills a la carta: texto por mensaje", "Skills à la carte: text per message"),
    ("skills_extra", "skills", "EXTRA_MAX", 8000, 1000, 60000, "caracteres|characters", 1, "maestro",
     "Lo que Maestro puede pedir de más («más skills»)", "What Maestro can ask for on top («more skills»)"),
    ("skills_catalog", "skills", "CAT_MAX", 8, 2, 50, "", 1, "maestro",
     "Skills que se listan en el catálogo", "Skills listed in the catalogue"),
    ("rag_simple", "knowledge_retrieve", "BUDGET_SIMPLE", 2000, 500, 20000, "tokens", 1, "maestro",
     "Conocimiento para una petición sencilla", "Knowledge for a simple request"),
    ("rag_multi", "knowledge_retrieve", "BUDGET_MULTI", 3500, 500, 30000, "tokens", 1, "maestro",
     "Conocimiento para componer varias pistas", "Knowledge to compose several tracks"),
    ("memory_text", "memory", "MAX_TEXT", 300, 100, 4000, "caracteres|characters", 1, "maestro",
     "Largo de cada memoria", "Length of each memory"),
    # Archivos que puedes subir o abrir
    ("file_tidal_mb", "files", "MAX_BYTES", 2, 1, 50, "MB", MB, "files",
     "Archivo .tidal más grande", "Largest .tidal file"),
    ("file_midi_mb", "songimport", "MAX_BYTES", 4, 1, 100, "MB", MB, "files",
     "MIDI más grande para importar", "Largest MIDI to import"),
    ("file_audio_mb", "audioimport", "MAX_AUDIO", 80, 10, 2000, "MB", MB, "files",
     "Audio más grande para pasar a MIDI", "Largest audio to turn into MIDI"),
    ("loop_upload_mb", "loops", "MAX_UPLOAD", 400, 20, 8000, "MB", MB, "files",
     "Pack de loops más grande (zip)", "Largest loop pack (zip)"),
    ("loop_file_mb", "loops", "MAX_FILE", 120, 10, 2000, "MB", MB, "files",
     "Archivo de loop más grande", "Largest loop file"),
    ("loop_seconds", "loops", "MAX_SECONDS", 120, 10, 1200, "s", 1, "files",
     "Segundos de cada loop que se analizan", "Seconds of each loop that are analysed"),
    ("plugin_file", "plugins", "MAX_FILE", 400000, 50000, 10000000, "bytes", 1, "files",
     "Plugins: tope por archivo", "Plugins: max per file"),
    ("plugin_files", "plugins", "MAX_FILES", 2000, 100, 50000, "", 1, "files",
     "Plugins: archivos como mucho", "Plugins: max files"),
    ("plugin_total_mb", "plugins", "MAX_TOTAL", 40, 5, 2000, "MB", 1000 * 1000, "files",
     "Plugins: tamaño total", "Plugins: total size"),
    # Sonido
    ("inst_note_sec", "instlib", "MAX_SEC", 8, 1, 60, "s", 1.0, "sound",
     "Largo de cada nota de un instrumento importado", "Length of each note of an imported instrument"),
    ("soundlab_sec", "soundlab", "MAX_SEC", 3, 1, 30, "s", 1.0, "sound",
     "Segundos de cada sonido que mide Sound Lab", "Seconds of each sound Sound Lab measures"),
    ("ref_bars", "references", "MAX_BARS", 8, 1, 64, "", 1, "sound",
     "Compases de un ejemplo de batería real", "Bars of a real drummer example"),
    ("ref_zip_mb", "references", "MAX_ZIP", 20, 5, 500, "MB", MB, "sound",
     "Descarga del paquete de baterías reales", "Real drummer pack download"),
    ("timeline_cycles", "timeline", "MAX_CYCLES", 64, 8, 1024, "ciclos|cycles", 1, "sound",
     "Ciclos que enseña la línea de tiempo", "Cycles shown by the timeline"),
    # Canciones, GitHub y la web
    ("songs_local", "songfiles", "MAX_SONGS", 2000, 100, 100000, "", 1, "songs",
     "Canciones que se recuperan de tu carpeta de datos", "Songs recovered from your data folder"),
    ("gh_sync_files", "github", "MAX_SYNC_FILES", 400, 50, 10000, "", 1, "songs",
     "Archivos de memoria que se sincronizan con GitHub", "Memory files synced with GitHub"),
    ("gh_shared_kb", "github", "MAX_SHARED", 300, 50, 10000, "KB", 1000, "songs",
     "Tamaño de cada archivo compartido en GitHub", "Size of each file shared on GitHub"),
    ("undo_steps", "", "", 80, 10, 1000, "", 1, "songs",
     "Pasos de deshacer por canción (en el navegador)", "Undo steps per song (in the browser)"),
]

GROUPS = {"maestro": ("Maestro: lo que entra en cada mensaje", "Maestro: what goes into each message"),
          "files": ("Archivos que puedes abrir o subir", "Files you can open or upload"),
          "sound": ("Sonido", "Sound"),
          "songs": ("Canciones, GitHub e historial", "Songs, GitHub and history")}

BY_KEY = {d[0]: d for d in DEFS}


def _num(d, v):
    key, _m, _a, default, lo, hi = d[:6]
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    v = max(lo, min(hi, v))
    return int(v) if isinstance(default, int) else v


def values(cfg):
    """{key: valor} con lo guardado en config.json → limits (o el de serie), dentro de su rango."""
    saved = (cfg or {}).get("limits") or {}
    return {d[0]: _num(d, saved[d[0]]) if d[0] in saved else d[3] for d in DEFS}


def clean(data):
    """Lo que llega de Ajustes → lo que se guarda: solo claves conocidas, en rango; None o «» = de serie (se borra)."""
    out = {}
    for k, v in (data or {}).items():
        d = BY_KEY.get(k)
        if d is None or v is None or v == "":
            continue
        n = _num(d, v)
        if n != d[3]:
            out[k] = n
    return out


def apply(cfg):
    """Pone cada constante de su módulo al valor configurado."""
    vals = values(cfg)
    for d in DEFS:
        mod, attr, scale = d[1], d[2], d[7]
        if not mod:
            continue
        try:
            m = importlib.import_module(mod)
        except Exception:  # noqa: BLE001  un módulo opcional que no carga no impide aplicar los demás
            continue
        v = vals[d[0]] * scale
        setattr(m, attr, int(v) if isinstance(getattr(m, attr, 0), int) and float(v).is_integer() else v)
    # sound_worker va en otro proceso: lo lee de la variable de entorno
    os.environ["TIDAL_STUDIO_SOUND_SEC"] = str(vals["soundlab_sec"])
    return vals


def live(key):
    """El valor que el código está usando AHORA (la constante del módulo), en las unidades del ajuste."""
    d = BY_KEY[key]
    if not d[1]:
        return None
    try:
        v = getattr(importlib.import_module(d[1]), d[2]) / d[7]
    except Exception:  # noqa: BLE001
        return None
    return int(v) if float(v).is_integer() else v


def public(cfg, lang="es"):
    vals = values(cfg)
    i = 0 if lang == "es" else 1
    return {"groups": [{"id": g, "name": n[i]} for g, n in GROUPS.items()],
            "limits": [{"key": d[0], "group": d[8], "value": vals[d[0]], "default": d[3], "min": d[4], "max": d[5],
                        "unit": d[6].split("|")[i] if "|" in d[6] else d[6], "label": (d[9], d[10])[i], "live": live(d[0])} for d in DEFS]}
