"""Lo que el alumno tiene de verdad en su ordenador, leído del disco en CADA mensaje a Maestro.

Antes la web mandaba su propia lista de samples (guardada en memoria y no siempre renovada) y el
servidor cortaba las listas por orden alfabético (40 samples, 40 instrumentos, 30 loops). Al
descargar algo nuevo, Maestro a menudo no lo veía y decía que «no está en tu biblioteca».

Aquí se lee la carpeta samples/ cada vez, se ordena de lo más nuevo a lo más viejo (lo recién
descargado nunca se queda fuera) y se marcan los sonidos de los últimos minutos como «nuevo».
"""
import os
import time

import instcatalog as cat

AUDIO_EXT = (".wav", ".aif", ".aiff", ".flac", ".ogg", ".oga", ".mp3")
NEW_SECONDS = 2 * 3600   # «recién descargado»: las dos últimas horas
MAX_SAMPLES = 150
MAX_INSTRUMENTS = 120


def folder_time(path):
    """Cuándo llegó el último archivo de audio a una carpeta (0 si no hay ninguno)."""
    best = 0.0
    try:
        for f in os.listdir(path):
            if f.lower().endswith(AUDIO_EXT):
                try:
                    best = max(best, os.path.getmtime(os.path.join(path, f)))
                except OSError:
                    pass
    except OSError:
        pass
    return best


def is_instrument(lib_dir, name):
    """Carpetas de la biblioteca de instrumentos (una grabación por nota): van en su propia lista."""
    return name in cat.BY_ID or os.path.isfile(os.path.join(lib_dir, name, "instrument.json"))


def samples(lib, now=None):
    """Samples del alumno (sin los instrumentos), del más nuevo al más viejo."""
    now = now or time.time()
    out = []
    for s in lib.list()["sounds"]:
        if not s["files"] or is_instrument(lib.dir, s["name"]):
            continue
        t = folder_time(os.path.join(lib.dir, s["name"]))
        out.append({"name": s["name"], "type": s["type"], "n": len(s["files"]), "t": t, "nuevo": now - t < NEW_SECONDS})
    out.sort(key=lambda x: (-x["t"], x["name"]))
    return out


def instruments(il, now=None):
    """Instrumentos de la biblioteca ya descargados, del más nuevo al más viejo."""
    now = now or time.time()
    out = []
    for it in il.all_items():
        if it["kind"] not in ("multi", "kit") or not il.installed(it["id"]):
            continue
        t = folder_time(il.folder(it["id"]))
        out.append({"id": it["id"], "es": it["es"], "en": it["en"], "t": t, "nuevo": now - t < NEW_SECONDS})
    out.sort(key=lambda x: (-x["t"], x["id"]))
    return out


def engine_lines(lib_dir, engine_sounds, status_fn, vst_list_fn):
    """Motores de synth y VST listos para sonar (Mi-UGens, Surge XT, Vital activados)."""
    lines = []
    try:
        st = status_fn(engine_sounds)
    except Exception:  # noqa: BLE001
        st = {}
    if (st.get("mi") or {}).get("installed"):
        lines.append('Mi-UGens instalados: s "plaits" # engine 0-15, s "rings" # engine 0-5, s "braids" # engine 0-47 (se tocan con n/note como un synth).')
    try:
        vsts = [v.get("name") for v in vst_list_fn(lib_dir) if v.get("name")]
    except Exception:  # noqa: BLE001
        vsts = []
    if vsts:
        lines.append("Instrumentos VST activados (Surge XT / Vital; se tocan con n/note): " + ", ".join(f's "{v}"' for v in vsts[:40]))
    return lines


def summary(lib, il, engine_obj=None, status_fn=None, vst_list_fn=None):
    """Todo lo que hay en el ordenador ahora mismo, para la sesión de Maestro."""
    now = time.time()
    snd = engine_obj.sound_list() if engine_obj else {"sounds": [], "missing": []}
    out = {"samples": samples(lib, now), "instrumentos": instruments(il, now), "motores": [], "no_cargados": []}
    if status_fn and vst_list_fn:
        out["motores"] = engine_lines(lib.dir, snd.get("sounds") or [], status_fn, vst_list_fn)
    loaded = set(snd.get("sounds") or [])
    if loaded:
        # Lo que está en disco pero SuperDirt aún no ha cargado (se está cargando o hay que reiniciar el sonido)
        out["no_cargados"] = [x["name"] for x in out["samples"] if x["name"] not in loaded][:20] \
            + [x["id"] for x in out["instrumentos"] if x["id"] not in loaded][:20]
    out["missing"] = [m for m in (snd.get("missing") or []) if m not in loaded][:20]
    return out


def maestro_text(inv):
    """Las líneas del mensaje de sistema que cuentan a Maestro lo que tiene el alumno."""
    lines = []
    sm = inv.get("samples") or []
    if sm:
        lines.append("BIBLIOTECA DEL ALUMNO (leída del disco ahora mismo; es la verdad aunque antes dijeras otra cosa). "
                     "Samples propios (úsalos con s \"nombre\" o s \"nombre:n\"; propónselos cuando encajen; del más nuevo al más viejo, "
                     "«NUEVO» = descargado hace poco):")
        lines.append(", ".join(f'{x["name"]} ({x["type"]}, {x["n"]} variantes{", NUEVO" if x.get("nuevo") else ""})'
                               for x in sm[:MAX_SAMPLES]))
        if len(sm) > MAX_SAMPLES:
            lines.append(f"(y {len(sm) - MAX_SAMPLES} samples más, los más antiguos)")
    ins = inv.get("instrumentos") or []
    if ins:
        lines.append("Instrumentos de la biblioteca YA DESCARGADOS (se tocan con n \"c5 e5\" # s \"<id>\"; del más nuevo al más viejo):")
        lines.append(", ".join(f'{x["id"]} ({x["es"]}{", NUEVO" if x.get("nuevo") else ""})' for x in ins[:MAX_INSTRUMENTS]))
        if len(ins) > MAX_INSTRUMENTS:
            lines.append(f"(y {len(ins) - MAX_INSTRUMENTS} instrumentos más)")
    lines += inv.get("motores") or []
    if inv.get("no_cargados"):
        lines.append("Están en disco pero SuperDirt aún no los ha cargado (se están cargando; si no suenan, el alumno puede pulsar "
                     "Reiniciar sonido): " + ", ".join(inv["no_cargados"]))
    if sm or ins or inv.get("motores"):
        lines.append("Si el alumno dice que ha descargado o añadido un sonido, búscalo en estas listas (también por parecido: "
                     "otro idioma, guiones, mayúsculas) y úsalo con su nombre EXACTO. No digas que no lo tiene si aparece aquí, "
                     "ni lo vuelvas a pedir con \"descargar\".")
    if inv.get("missing"):
        lines.append("SuperDirt dice que NO encuentra estos sonidos que se han usado en el código: " + ", ".join(inv["missing"])
                     + ". No los uses salvo que aparezcan en las listas de arriba.")
    return "\n".join(lines)
