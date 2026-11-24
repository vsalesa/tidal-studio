"""CLaMP 3, complemento OPCIONAL y experimental (Maestro v2, release 0.16).

CLaMP 3 (Wu et al., 2025; github.com/sanderwood/clamp3, MIT) convierte música (MusicXML, MIDI o audio) en vectores
para encontrar piezas parecidas aunque no compartan palabras. Aquí solo se usa para buscar, entre TUS canciones de
un género, las que más se parecen a la que estás haciendo, y dárselas a Maestro como ejemplos.

Reglas acordadas:
- Va en el entorno de herramientas de audio (el de MSST/Demucs, con PyTorch y GPU/MPS): no pesa en el estudio.
- Se activa SOLA por género cuando ese género tiene al menos `min_examples` canciones (10 por defecto). Con menos,
  Maestro usa la búsqueda de texto (FTS5) y las medidas de sonido, como hasta ahora.
- Los packs comprados no entran nunca (solo trabajamos con tus partituras .musicxml del índice).

Si CLaMP 3 no está instalado o falla, todo sigue funcionando sin él: cada función devuelve un estado claro.
"""
import json
import math
import os
import shutil
import subprocess
import tempfile
import threading
import urllib.request
import zipfile

REPO_ZIP = "https://codeload.github.com/sanderwood/clamp3/zip/refs/heads/main"
PIP = ["transformers<5", "accelerate", "unidecode", "music21", "safetensors"]
_state = {"state": "idle", "msg": "", "log": []}
_lock = threading.Lock()


def home(tools_dir):
    return os.path.join(tools_dir, "clamp3")


def installed(tools_dir):
    return os.path.isfile(os.path.join(home(tools_dir), "ready"))


def status(tools_dir, counts, min_examples=10, auto=True):
    """Estado del complemento y de cada género: ejemplos y si está activo."""
    ok = installed(tools_dir)
    genres = [{"style": s, "examples": n, "active": bool(ok and auto and n >= min_examples)}
              for s, n in sorted(counts.items(), key=lambda x: -x[1]) if s]
    return {"installed": ok, "auto": auto, "min_examples": min_examples, "genres": genres,
            "install": dict(_state, log=_state["log"][-6:])}


def install(tools_python, tools_dir):
    """Descarga el código de CLaMP 3 y sus dependencias en el entorno de audio (en segundo plano)."""
    if _state["state"] == "running":
        return dict(_state)
    py = tools_python()
    if not py or not os.path.isfile(py):
        raise ValueError("Instala primero las herramientas de audio (Importar canción → audio)|"
                         "Install the audio tools first (Import a song → audio)")

    def run():
        _state.update(state="running", msg="Descargando CLaMP 3…|Downloading CLaMP 3…", log=[])
        try:
            dst = home(tools_dir)
            tmp = tempfile.mkdtemp(prefix="clamp3-")
            zpath = os.path.join(tmp, "clamp3.zip")
            urllib.request.urlretrieve(REPO_ZIP, zpath)
            with zipfile.ZipFile(zpath) as z:
                z.extractall(tmp)
            src = next(os.path.join(tmp, d) for d in os.listdir(tmp) if d.startswith("clamp3"))
            shutil.rmtree(dst, ignore_errors=True)
            shutil.move(src, dst)
            _state["msg"] = "Instalando dependencias…|Installing dependencies…"
            p = subprocess.run([py, "-m", "pip", "install", *PIP], capture_output=True, text=True)
            _state["log"] += (p.stdout + p.stderr).splitlines()[-20:]
            if p.returncode:
                raise RuntimeError("pip")
            with open(os.path.join(dst, "ready"), "w") as f:
                f.write("1")
            _state.update(state="done", msg="Listo|Ready")
            shutil.rmtree(tmp, ignore_errors=True)
        except Exception as e:  # noqa: BLE001
            _state.update(state="error", msg=f"No se pudo instalar CLaMP 3: {e}|Couldn't install CLaMP 3: {e}")

    threading.Thread(target=run, daemon=True).start()
    return dict(_state)


def _cos(a, b):
    na = math.sqrt(sum(x * x for x in a)) or 1
    nb = math.sqrt(sum(x * x for x in b)) or 1
    return sum(x * y for x, y in zip(a, b)) / (na * nb)


def embed(tools_python, tools_dir, docs, timeout=600):
    """docs: {song_id: musicxml}. Devuelve {song_id: [vector]} o None si CLaMP 3 no está o falla.
    Usa el script de extracción del propio repositorio (clamp3_embd.py) sobre una carpeta temporal."""
    if not installed(tools_dir) or not docs:
        return None
    py = tools_python()
    root = home(tools_dir)
    script = os.path.join(root, "code", "clamp3_embd.py")
    if not os.path.isfile(script):
        script = os.path.join(root, "clamp3_embd.py")
    if not os.path.isfile(script):
        return None
    tmp = tempfile.mkdtemp(prefix="clamp3-in-")
    out = tempfile.mkdtemp(prefix="clamp3-out-")
    try:
        for sid, xml in docs.items():
            with open(os.path.join(tmp, f"{sid}.musicxml"), "w", encoding="utf-8") as f:
                f.write(xml)
        p = subprocess.run([py, script, tmp, out, "--get_global"], cwd=os.path.dirname(script), capture_output=True,
                           text=True, timeout=timeout)
        if p.returncode:
            return None
        vecs = {}
        for f in os.listdir(out):
            sid = os.path.splitext(f)[0]
            path = os.path.join(out, f)
            try:
                if f.endswith(".npy"):
                    vec = subprocess.run([py, "-c", f"import numpy,json;print(json.dumps(numpy.load({path!r}).reshape(-1).tolist()))"],
                                         capture_output=True, text=True, timeout=60).stdout
                    vecs[sid] = json.loads(vec)
            except (ValueError, OSError, subprocess.SubprocessError):
                continue
        return vecs or None
    except (OSError, subprocess.SubprocessError):
        return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.rmtree(out, ignore_errors=True)


def nearest(vecs, query_id, k=3):
    q = (vecs or {}).get(query_id)
    if not q:
        return []
    scored = [(round(_cos(q, v), 3), sid) for sid, v in vecs.items() if sid != query_id]
    return sorted(scored, reverse=True)[:k]
