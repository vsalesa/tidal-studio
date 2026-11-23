"""Ejemplos reales para los cursos: un baterista de verdad tocando el estilo, en MIDI.

Los patrones de los cursos están escritos a mano y suenan «cuadrados». Para que el alumno oiga cómo lo toca
una persona, cada curso puede señalar una interpretación del Groove MIDI Dataset de Google Magenta
(bateristas profesionales grabados en una batería electrónica; licencia CC BY 4.0). El estudio descarga
el paquete de MIDI una vez (3 MB), saca el archivo del curso y lo convierte en pistas de Tidal que
conservan lo que hace humano al baterista:

  - la fuerza de cada golpe (velocity → # gain), que es donde están los acentos del estilo;
  - lo que se adelanta o se atrasa cada golpe respecto a la rejilla (→ # nudge, en segundos);
  - la rejilla que usa de verdad: semicorcheas, o tresillos si el estilo es swing.

Cada sonido (bombo, caja, aro, charles, toms, platos) puede cambiarse por los instrumentos del curso
(congas, tambora, güiro…), así el ejemplo suena con la misma paleta que la canción.
Solo biblioteca estándar.
"""
import io
import os
import re
import threading
import urllib.request
import zipfile
from collections import defaultdict

from songimport import parse_midi

GMD_URL = "https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0-midionly.zip"
GMD_PAGE = "https://magenta.tensorflow.org/datasets/groove"
GMD_LICENSE = "CC BY 4.0"
GMD_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
GMD_CREDIT = ("Groove MIDI Dataset · Jon Gillick, Adam Roberts, Jesse Engel, Mark Wilson, Peter Bilski "
              "(Google Magenta, 2019) · CC BY 4.0")
ZIP_NAME = "groove-v1.0.0-midionly.zip"
MAX_ZIP = 20 * 1024 * 1024
MAX_BARS = 8

# Mapa de notas de la batería Roland TD-11 que usa el dataset → papel del golpe
ROLE = {36: "kick", 38: "snare", 40: "snare", 37: "stick", 42: "hh", 22: "hh", 44: "hhp", 46: "oh", 26: "oh",
        48: "tomh", 50: "tomh", 45: "tomm", 47: "tomm", 43: "toml", 58: "toml",
        49: "crash", 55: "crash", 57: "crash", 52: "crash", 51: "ride", 59: "ride", 53: "bell"}
# Sonidos por defecto (Dirt-Samples, siempre instalados)
SOUND = {"kick": "bd", "snare": "sn", "stick": "rm", "hh": "hh", "hhp": "hh:4", "oh": "oh",
         "tomh": "ht", "tomm": "mt", "toml": "lt", "crash": "cr", "ride": "ho", "bell": "cb"}
# Qué papeles van juntos en una pista
GROUPS = [
    ("kick", ["kick"], "Bombo", "Kick"),
    ("snare", ["snare", "stick"], "Caja y aro", "Snare and rim"),
    ("hats", ["hh", "hhp", "oh"], "Charles", "Hi-hats"),
    ("toms", ["tomh", "tomm", "toml", "ride", "bell", "crash"], "Toms y platos", "Toms and cymbals"),
]  # cuatro pistas como mucho: caben en d9..d12 sin pisar las del curso (d1..d8)
_lock = threading.Lock()


class RefError(Exception):
    pass


def _safe_member(path):
    """Solo archivos .mid del dataset, sin rutas raras."""
    p = (path or "").strip().lstrip("/")
    if not re.fullmatch(r"(groove/)?drummer\d+/[a-z_]+\d*/[A-Za-z0-9_.\-]+\.mid", p):
        raise RefError("Ese ejemplo no es del Groove MIDI Dataset|That example isn't from the Groove MIDI Dataset")
    return p if p.startswith("groove/") else "groove/" + p


def zip_path(root):
    return os.path.join(root, "references", ZIP_NAME)


def ensure_zip(root, url=GMD_URL, opener=None):
    """Descarga el paquete de MIDI la primera vez. Devuelve la ruta local."""
    path = zip_path(root)
    with _lock:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "TidalStudio"})
        try:
            with (opener or urllib.request.urlopen)(req, timeout=60) as r:
                data = r.read(MAX_ZIP + 1)
        except Exception as e:  # noqa: BLE001
            raise RefError(f"No he podido descargar los ejemplos ({e})|Couldn't download the examples ({e})")
        if len(data) > MAX_ZIP or data[:2] != b"PK":
            raise RefError("La descarga de ejemplos no es un zip válido|The examples download isn't a valid zip")
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        return path


def read_midi(root, member, opener=None):
    member = _safe_member(member)
    try:
        with zipfile.ZipFile(ensure_zip(root, opener=opener)) as z:
            return z.read(member)
    except KeyError:
        raise RefError("Ese ejemplo no está en el paquete|That example isn't in the pack")
    except zipfile.BadZipFile:
        os.remove(zip_path(root))  # se volverá a bajar
        raise RefError("El paquete de ejemplos estaba dañado: vuelve a probar|The examples pack was damaged: try again")


def file_bpm(member, midi):
    m = re.search(r"_(\d{2,3})_(beat|fill)_", member or "")
    if m:
        return float(m.group(1))
    if midi["tempos"]:
        return round(60_000_000 / midi["tempos"][0][1], 1)
    return 120.0


# ---------------------------------------------------------------- de golpes a rejilla
def hits(midi, start_bar, bars, steps, beats=4):
    """{papel: {paso_absoluto: (velocity, desvío_en_pulsos)}} para los compases pedidos."""
    ppq = midi["ppq"]
    bar = ppq * beats
    step = bar / steps
    lo, hi = start_bar * bar, (start_bar + bars) * bar
    out = defaultdict(dict)
    for t in midi["tracks"]:
        for s, _e, pitch, vel, _ch in t["notes"]:
            role = ROLE.get(pitch)
            if not role or s < lo - step / 2 or s >= hi - step / 2:
                continue
            k = round((s - lo) / step)
            if not 0 <= k < steps * bars:
                continue
            dev = ((s - lo) / step - k) * step / ppq  # en pulsos (negras)
            old = out[role].get(k)
            if not old or vel > old[0]:
                out[role][k] = (vel, dev)
    return out


def grid_error(midi, start_bar, bars, steps, beats=4):
    ppq = midi["ppq"]
    step = ppq * beats / steps
    lo, hi = start_bar * ppq * beats, (start_bar + bars) * ppq * beats
    errs = [abs((s - lo) / step - round((s - lo) / step)) * step / ppq
            for t in midi["tracks"] for s, *_ in t["notes"] if lo <= s < hi]
    return sum(errs) / len(errs) if errs else 1.0


def best_grid(midi, start_bar, bars):
    """Semicorcheas (16) o tresillos de corchea (12, el swing): la que mejor encaja con lo que tocó."""
    e16, e12 = grid_error(midi, start_bar, bars, 16), grid_error(midi, start_bar, bars, 12)
    return 12 if e12 < e16 * 0.7 else 16


def _gain(vel):
    return round(0.45 + 0.65 * vel / 127, 2)


def _bars_pattern(per_bar):
    """Un compás si todos son iguales; si no, «<[..] [..]>» (uno por ciclo)."""
    if all(b == per_bar[0] for b in per_bar):
        return per_bar[0]
    return "<" + " ".join(per_bar) + ">"


def to_tracks(midi, member, start_bar=0, bars=4, sounds=None, drop=(), steps=None, first_id=9, lang="es", bpm=None, slow=1):
    """Convierte unos compases del baterista en pistas de Tidal (una por grupo de la batería)."""
    bars = max(1, min(MAX_BARS, int(bars)))
    start_bar = max(0, int(start_bar))
    steps = steps or best_grid(midi, start_bar, bars)
    snd = {**SOUND, **(sounds or {})}
    by_role = hits(midi, start_bar, bars, steps)
    if not by_role:
        raise RefError("No hay golpes en esos compases|There are no hits in those bars")
    src_bpm = file_bpm(member, midi)
    sec_per_beat = 60.0 / float(bpm or src_bpm) * (slow or 1)
    # Lo que se adelanta o atrasa TODO (la grabación no empieza justo en la rejilla) no es estilo: se quita
    devs = sorted(d for r in by_role.values() for (_v, d) in r.values())
    shift = devs[len(devs) // 2] if devs else 0.0
    by_role = {r: {k: (v, d - shift) for k, (v, d) in h.items()} for r, h in by_role.items()}
    tracks, nid = [], first_id
    for key, roles, es, en in GROUPS:
        roles = [r for r in roles if r in by_role and r not in drop and snd.get(r)]
        if not roles:
            continue
        s_bars, g_bars, n_bars, any_nudge = [], [], [], False
        for b in range(bars):
            s_tok, g_tok, n_tok = [], [], []
            for k in range(b * steps, (b + 1) * steps):
                here = [(r, by_role[r][k]) for r in roles if k in by_role[r]]
                if not here:
                    s_tok.append("~"); g_tok.append("0"); n_tok.append("0")
                    continue
                names = [snd[r] for r, _ in here]
                s_tok.append(names[0] if len(names) == 1 else "[" + ", ".join(names) + "]")
                vel = max(v for _, (v, _d) in here)
                dev = sum(d for _, (_v, d) in here) / len(here) * sec_per_beat
                dev = max(-0.04, min(0.04, round(dev, 3)))
                any_nudge = any_nudge or abs(dev) >= 0.004
                g_tok.append(f"{_gain(vel):g}")
                n_tok.append(f"{dev:g}")
            s_bars.append("[" + " ".join(s_tok) + "]")
            g_bars.append("[" + " ".join(g_tok) + "]")
            n_bars.append("[" + " ".join(n_tok) + "]")
        code = f's "{_bars_pattern(s_bars)}" # gain "{_bars_pattern(g_bars)}"'
        if any_nudge:
            code += f' # nudge "{_bars_pattern(n_bars)}"'
        if slow and slow != 1:  # p. ej. un compás de songo a 112 ocupa dos compases de salsa a 180
            code = f"slow {slow:g} $ {code}"
        tracks.append({"id": f"d{nid}", "nombre": f"{es} (baterista real)" if lang == "es" else f"{en} (real drummer)",
                       "tipo": "percusion", "codigo": code, "group": key})
        nid += 1
    return {"tracks": tracks, "steps": steps, "bars": bars, "start": start_bar, "file_bpm": src_bpm}


def profile(midi, steps=16, beats=4):
    """Cuánto y con qué fuerza toca cada papel en cada paso del compás, sobre toda la interpretación.
    Sirve para ajustar los acentos de los patrones del curso."""
    ppq = midi["ppq"]
    notes = [n for t in midi["tracks"] for n in t["notes"]]
    if not notes:
        return {}
    nb = max(1, max(n[0] for n in notes) // (ppq * beats))
    step = ppq * beats / steps
    cnt, vel = defaultdict(lambda: [0] * steps), defaultdict(lambda: [0] * steps)
    for s, _e, p, v, _c in notes:
        r = ROLE.get(p)
        if not r:
            continue
        k = round(s / step) % steps
        cnt[r][k] += 1
        vel[r][k] += v
    return {r: {"often": [round(c / nb, 2) for c in cnt[r]],
                "vel": [round(vel[r][k] / cnt[r][k]) if cnt[r][k] else 0 for k in range(steps)]}
            for r in cnt if sum(cnt[r]) >= nb * 0.3}


def example(root, ref, lang="es", bpm=None, opener=None):
    """Lo que pide el curso: {file, start, bars, sounds, drop, steps} → pistas + créditos."""
    member = ref.get("file") or ""
    data = read_midi(root, member, opener=opener)
    midi = parse_midi(data)
    out = to_tracks(midi, member, ref.get("start", 0), ref.get("bars", 4), ref.get("sounds"), ref.get("drop") or (),
                    ref.get("steps"), int(ref.get("first_id") or 9), lang, bpm,
                    float(ref.get("slow") or 1))
    out["credit"] = {"text": GMD_CREDIT, "url": GMD_PAGE, "license": GMD_LICENSE, "license_url": GMD_LICENSE_URL,
                     "file": member, "drummer": member.split("/")[0] if "/" in member else ""}
    return out
