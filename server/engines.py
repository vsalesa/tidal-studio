"""
Motores de synth opcionales: se instalan desde Tidal Studio, sin abrir la terminal.

  - sc3-plugins:  cientos de UGens extra (los synths "super…" completos de SuperDirt).
  - Mi-UGens:     los módulos de Mutable Instruments (Plaits, Braids, Rings…).
  - VSTPlugin:    permite cargar synths VST3 dentro de SuperCollider.
  - Surge XT:     synth VST gratuito con cientos de sonidos de fábrica (se baja su instalador y se abre).
  - Vital:        synth de tablas de ondas gratuito (hay que bajarlo de su web con una cuenta gratis).

Las extensiones de SuperCollider se descomprimen en la carpeta de extensiones del usuario y
se activan al reiniciar el motor de audio. Solo biblioteca estándar.
"""
import io
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.request
import webbrowser
import zipfile

import net

SYSTEM = platform.system()   # Darwin / Windows / Linux
ALLOWED = ("api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com",
           "git.iem.at", "codeload.github.com")


class EngineError(Exception):
    pass


def ext_dir():
    home = os.path.expanduser("~")
    if SYSTEM == "Darwin":
        return os.path.join(home, "Library", "Application Support", "SuperCollider", "Extensions")
    if SYSTEM == "Windows":
        return os.path.join(os.environ.get("LOCALAPPDATA", home), "SuperCollider", "Extensions")
    return os.path.join(os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share"), "SuperCollider", "Extensions")


def _system_ext_dirs():
    if SYSTEM == "Darwin":
        return ["/Library/Application Support/SuperCollider/Extensions"]
    if SYSTEM == "Windows":
        return [os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "SuperCollider", "Extensions")]
    return ["/usr/share/SuperCollider/Extensions", "/usr/local/share/SuperCollider/Extensions"]


def vst3_dirs():
    home = os.path.expanduser("~")
    if SYSTEM == "Darwin":
        return ["/Library/Audio/Plug-Ins/VST3", os.path.join(home, "Library", "Audio", "Plug-Ins", "VST3")]
    if SYSTEM == "Windows":
        return [os.path.join(os.environ.get("CommonProgramFiles", r"C:\Program Files\Common Files"), "VST3")]
    return ["/usr/lib/vst3", "/usr/local/lib/vst3", os.path.join(home, ".vst3")]


def surge_patch_dirs():
    if SYSTEM == "Darwin":
        return ["/Library/Application Support/Surge XT/patches_factory", "/Library/Application Support/Surge XT/patches_3rdparty"]
    if SYSTEM == "Windows":
        pd = os.environ.get("ProgramData", r"C:\ProgramData")
        return [os.path.join(pd, "Surge XT", "patches_factory"), os.path.join(pd, "Surge XT", "patches_3rdparty")]
    return ["/usr/share/surge-xt/patches_factory", "/usr/share/surge-xt/patches_3rdparty"]


def _find(roots, rx, depth=4):
    """Busca un archivo o carpeta cuyo nombre encaje con rx (sin bajar demasiado)."""
    for root in roots:
        if not os.path.isdir(root):
            continue
        base = root.rstrip(os.sep).count(os.sep)
        for d, dirs, files in os.walk(root):
            if d.count(os.sep) - base >= depth:
                dirs[:] = []
            for n in dirs + files:
                if re.search(rx, n, re.I):
                    return os.path.join(d, n)
    return None


ENGINES = {
    "sc3plugins": {"es": "sc3-plugins", "en": "sc3-plugins", "kind": "extension", "repo": "supercollider/sc3-plugins",
                   "find": r"^SC3plugins$|^sc3-plugins", "home": "https://github.com/supercollider/sc3-plugins",
                   "tip": ["Cientos de generadores y efectos extra. Con ellos suenan todos los synths «super…» de SuperDirt tal y como los diseñaron.",
                           "Hundreds of extra generators and effects. With them every SuperDirt «super…» synth sounds as designed."]},
    "mi": {"es": "Mi-UGens (Mutable Instruments)", "en": "Mi-UGens (Mutable Instruments)", "kind": "extension", "repo": "v7b1/mi-UGens",
           "find": r"^MiPlaits|^mi-UGens|^MiPlaits\.(sc|scx|so)$", "home": "https://github.com/v7b1/mi-UGens",
           "tip": ["Los módulos de sintetizador modular más famosos (Plaits, Braids, Rings), muy usados en Tidal. Añade 38 instrumentos.",
                   "The most famous modular synth modules (Plaits, Braids, Rings), loved by Tidal users. Adds 38 instruments."]},
    "vstplugin": {"es": "VSTPlugin", "en": "VSTPlugin", "kind": "extension", "iem": "pd/vstplugin", "find": r"^VSTPlugin$",
                  "home": "https://git.iem.at/pd/vstplugin",
                  "tip": ["Deja usar synths VST3 (como Surge XT o Vital) dentro de SuperCollider, tocados desde Tidal.",
                          "Lets SuperCollider host VST3 synths (like Surge XT or Vital), played from Tidal."]},
    "surge": {"es": "Surge XT", "en": "Surge XT", "kind": "vst", "repo": "surge-synthesizer/releases-xt", "vst": r"^Surge XT\.vst3$",
              "home": "https://surge-synthesizer.github.io/", "needs": "vstplugin",
              "tip": ["Synth profesional y gratuito con cientos de sonidos de fábrica: cada uno aparece en la biblioteca como un instrumento.",
                      "A free professional synth with hundreds of factory sounds: each one shows up in the library as an instrument."]},
    "vital": {"es": "Vital", "en": "Vital", "kind": "vst", "vst": r"^Vital\.vst3$", "home": "https://vital.audio/", "needs": "vstplugin",
              "tip": ["Synth de tablas de ondas gratuito. Se descarga de su web (con una cuenta gratis) y Tidal Studio lo encuentra solo.",
                      "A free wavetable synth. Download it from its website (free account) and Tidal Studio finds it by itself."]},
}


def status(sounds=None):
    sounds = set(sounds or [])
    out = {}
    for k, e in ENGINES.items():
        if e["kind"] == "extension":
            path = _find([ext_dir()] + _system_ext_dirs(), e["find"])
        else:
            path = _find(vst3_dirs(), e["vst"], depth=2)
        loaded = (k == "mi" and "plaits" in sounds) or (k == "vstplugin" and "ts_vsti" in sounds) \
            or (k == "sc3plugins" and "superstatic" in sounds and "supersaw" in sounds)
        ready = bool(path)
        if e.get("needs"):
            ready = ready and bool(out.get(e["needs"], {}).get("installed"))
        out[k] = {"id": k, "es": e["es"], "en": e["en"], "kind": e["kind"], "installed": bool(path), "path": path,
                  "loaded": loaded, "ready": ready, "home": e["home"], "tip": e["tip"], "needs": e.get("needs")}
    out["surge"]["patches"] = len(surge_patches()) if out["surge"]["installed"] else 0
    out["_ext_dir"] = ext_dir()
    return out


def surge_patches(limit=600):
    out = []
    for d in surge_patch_dirs():
        if not os.path.isdir(d):
            continue
        for root, _dirs, files in os.walk(d):
            for f in sorted(files):
                if f.lower().endswith(".fxp"):
                    rel = os.path.relpath(os.path.join(root, f), d)
                    parts = rel.replace("\\", "/").split("/")
                    out.append({"path": os.path.join(root, f), "category": parts[0] if len(parts) > 1 else "", "name": os.path.splitext(f)[0]})
                    if len(out) >= limit:
                        return out
    return out


SURGE_CAT = {"bass": "synth_bass", "basses": "synth_bass", "leads": "synth_lead", "lead": "synth_lead", "pads": "synth_pad",
             "pad": "synth_pad", "keys": "synth_keys", "plucks": "synth_keys", "polysynths": "synth_keys", "fx": "synth_fx",
             "sequences": "synth_fx", "rhythms": "percussion", "percussion": "percussion", "drums": "percussion",
             "winds": "woodwinds", "brass": "brass", "strings": "strings", "organs": "organs", "vox": "voices", "chords": "synth_keys"}


def surge_items():
    """Cada sonido de fábrica de Surge XT es un instrumento de la biblioteca (s "surge_<nombre>")."""
    items, seen = [], set()
    for p in surge_patches():
        slug = re.sub(r"[^a-z0-9]+", "_", p["name"].lower()).strip("_")[:30] or "patch"
        iid = "surge_" + slug
        n = 2
        while iid in seen:
            iid = f"surge_{slug}_{n}"
            n += 1
        seen.add(iid)
        c = SURGE_CAT.get(p["category"].lower().split()[0] if p["category"] else "", "engines")
        items.append({"id": iid, "sound": iid, "extra": "", "cat": c, "es": f"Surge XT: {p['name']}", "en": f"Surge XT: {p['name']}",
                      "kind": "engine", "engine": "surge", "src": "surge", "group": "surge", "photo": "analog_synth",
                      "tags": f"surge xt vst {p['category']}", "voice": "sawtooth", "program": p["path"]})
    return items


# ---------------------------------------------------------------- instrumentos VST activados
def vst_file(samples_dir):
    return os.path.join(samples_dir, "vst-instruments.json")


def vst_list(samples_dir):
    try:
        with open(vst_file(samples_dir), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def vst_activate(samples_dir, engine_obj, name, engine_id, program=""):
    st = status()
    if not st["vstplugin"]["installed"]:
        raise EngineError("Primero instala VSTPlugin (Motores de synth)")
    plug = st.get(engine_id, {}).get("path")
    if not plug:
        raise EngineError(f"No encuentro {ENGINES[engine_id]['en']} en este ordenador")
    lst = [v for v in vst_list(samples_dir) if v.get("name") != name]
    lst.append({"name": name, "plugin": plug, "program": program or ""})
    os.makedirs(samples_dir, exist_ok=True)
    with open(vst_file(samples_dir), "w", encoding="utf-8") as f:
        json.dump(lst, f, indent=1)
    sent = engine_obj.sc_cmd("vstadd", name, plug.replace("\\", "/"), (program or "").replace("\\", "/")) if engine_obj else False
    return {"name": name, "loaded": sent}


def vst_deactivate(samples_dir, name):
    lst = [v for v in vst_list(samples_dir) if v.get("name") != name]
    with open(vst_file(samples_dir), "w", encoding="utf-8") as f:
        json.dump(lst, f, indent=1)
    return {"name": name, "removed": True}


# ---------------------------------------------------------------- descargas
def _get(url, limit=200 * 1024 * 1024, accept=None):
    host = (re.match(r"https://([^/]+)/", url) or [None, ""])[1]
    if not any(host == h or host.endswith("." + h) for h in ALLOWED):
        raise EngineError("Solo descargo de GitHub y git.iem.at")
    headers = {"User-Agent": "tidal-studio"}
    if accept:
        headers["Accept"] = accept
    try:
        with net.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
            data = r.read(limit + 1)
    except Exception as e:  # noqa: BLE001
        raise EngineError(f"No se pudo descargar {url}: {e}")
    if len(data) > limit:
        raise EngineError("Descarga demasiado grande")
    return data


def _platform_words():
    if SYSTEM == "Darwin":
        return ["mac", "osx", "darwin"], ["x86_64-only"]
    if SYSTEM == "Windows":
        return ["win64", "windows", "win"], ["win32", "i386"]
    return ["linux"], ["arm", "i386"] if platform.machine() in ("x86_64", "AMD64") else []


def pick_asset(assets, exts):
    good, bad = _platform_words()
    cands = []
    for a in assets:
        n = a["name"].lower()
        if not n.endswith(exts) or not any(w in n for w in good) or any(b in n for b in bad):
            continue
        score = 0
        if "arm64" in n or "universal" in n or "apple" in n:
            score += 1 if SYSTEM == "Darwin" else -5
        cands.append((score, a))
    cands.sort(key=lambda x: -x[0])
    return cands[0][1] if cands else None


def _github_latest(repo):
    data = _get(f"https://api.github.com/repos/{repo}/releases/latest", 4 * 1024 * 1024, "application/vnd.github+json")
    return json.loads(data.decode("utf-8"))


def _iem_latest(project):
    data = _get(f"https://git.iem.at/api/v4/projects/{project.replace('/', '%2F')}/releases", 4 * 1024 * 1024)
    rel = json.loads(data.decode("utf-8"))[0]
    pid = json.loads(_get(f"https://git.iem.at/api/v4/projects/{project.replace('/', '%2F')}", 1024 * 1024).decode("utf-8"))["id"]
    links = re.findall(r"\[([^\]]+\.zip)\]\((/uploads/[^)]+)\)", rel.get("description", ""))
    assets = [{"name": n, "browser_download_url": f"https://git.iem.at/-/project/{pid}{u}"} for n, u in links]
    return {"tag_name": rel.get("tag_name"), "assets": assets}


def _extract_extension(data, dest_name, inner_rx=None):
    """Descomprime en la carpeta de extensiones. inner_rx elige una subcarpeta del zip (p. ej. sc/VSTPlugin)."""
    z = zipfile.ZipFile(io.BytesIO(data))
    names = [n for n in z.namelist() if "__MACOSX" not in n]
    prefix = ""
    if inner_rx:
        for n in names:
            m = re.match(inner_rx, n)
            if m:
                prefix = m.group(0)
                break
    dest = os.path.join(ext_dir(), dest_name)
    shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest, exist_ok=True)
    count = 0
    for n in names:
        if prefix and not n.startswith(prefix):
            continue
        rel = n[len(prefix):].lstrip("/")
        if not rel or rel.endswith("/"):
            continue
        target = os.path.normpath(os.path.join(dest, rel))
        if not target.startswith(os.path.normpath(dest)):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with z.open(n) as src, open(target, "wb") as out:
            shutil.copyfileobj(src, out)
        info = z.getinfo(n)
        mode = (info.external_attr >> 16) & 0o777
        if mode:
            os.chmod(target, mode)
        count += 1
    if SYSTEM == "Darwin":   # por si acaso: quitar la cuarentena de Gatekeeper a los binarios descargados
        subprocess.run(["xattr", "-dr", "com.apple.quarantine", dest], capture_output=True)
    return dest, count


def install(engine_id):
    e = ENGINES.get(engine_id)
    if not e:
        raise EngineError("Motor desconocido")
    if engine_id == "vital":
        webbrowser.open(e["home"])
        return {"id": engine_id, "opened": e["home"], "message": "open"}
    if engine_id == "sc3plugins" and SYSTEM == "Linux":
        raise EngineError("En Linux instala sc3-plugins con tu gestor de paquetes (por ejemplo: sudo apt install sc3-plugins)")
    if "iem" in e:
        rel = _iem_latest(e["iem"])
    else:
        rel = _github_latest(e["repo"])
    if e["kind"] == "vst":
        exts = {"Darwin": (".dmg", ".pkg"), "Windows": (".exe", ".msi"), "Linux": (".deb", ".rpm")}[SYSTEM]
        a = pick_asset(rel.get("assets", []), exts)
        if not a:
            webbrowser.open(e["home"])
            return {"id": engine_id, "opened": e["home"], "message": "open"}
        data = _get(a["browser_download_url"], 600 * 1024 * 1024)
        dl = os.path.join(os.path.expanduser("~"), "Downloads")
        os.makedirs(dl, exist_ok=True)
        path = os.path.join(dl, a["name"])
        with open(path, "wb") as f:
            f.write(data)
        # El instalador lo terminas tú (pide tu contraseña de administrador)
        if SYSTEM == "Darwin":
            subprocess.Popen(["open", path])
        elif SYSTEM == "Windows":
            os.startfile(path)  # noqa: S606  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["xdg-open", path])
        return {"id": engine_id, "installer": path, "message": "installer", "version": rel.get("tag_name")}
    a = pick_asset(rel.get("assets", []), (".zip",))
    if not a:
        raise EngineError(f"No hay una versión de {e['en']} para este sistema. Mira {e['home']}")
    data = _get(a["browser_download_url"])
    if engine_id == "vstplugin":
        dest, n = _extract_extension(data, "VSTPlugin", r"^(?:[^/]+/)?sc/VSTPlugin/")
    elif engine_id == "sc3plugins":
        dest, n = _extract_extension(data, "SC3plugins", r"^(?:[^/]+/)?SC3plugins/")
    else:
        dest, n = _extract_extension(data, "mi-UGens", r"^(?:[^/]+/)?mi-UGens/")
        if n == 0:
            dest, n = _extract_extension(data, "mi-UGens")
    if n == 0:
        raise EngineError("El paquete descargado estaba vacío")
    return {"id": engine_id, "path": dest, "files": n, "message": "restart", "version": rel.get("tag_name")}
