"""Importar canciones en audio (mp3, wav…): herramientas opcionales y trabajos en segundo plano.

Las herramientas (Demucs + PyTorch, basic-pitch, librosa) pesan mucho (~1-2 GB), así que no van con el
estudio: se instalan la primera vez que alguien importa un audio, en un entorno de Python aparte
(~/.tidal-studio/audio-tools) que no toca nada más. Todo corre en este ordenador; no se sube nada.
"""
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.environ.get("TIDAL_STUDIO_AUDIO_TOOLS") or os.path.join(os.path.expanduser("~"), ".tidal-studio", "audio-tools")
MARKER = os.path.join(TOOLS, "ready-v1")
AUDIO_EXTS = (".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aiff", ".aif")
MAX_AUDIO = 80 * 1024 * 1024

# basic-pitch pide versiones viejas de numpy/tensorflow: lo instalamos sin dependencias y usamos su
# modelo ONNX con onnxruntime, que funciona en Mac (Apple Silicon), Windows y Linux.
PIP_STEPS = [
    (15, "PyTorch (el más grande, ~200-800 MB)", "PyTorch (the biggest one, ~200-800 MB)", ["torch", "torchaudio"]),
    (55, "Demucs (separa batería, bajo, voz…)", "Demucs (splits drums, bass, vocals…)", ["demucs"]),
    (75, "librosa y onnxruntime (tempo y notas)", "librosa and onnxruntime (tempo and notes)",
     ["onnxruntime", "librosa", "pretty_midi", "mir_eval", "resampy", "scipy", "soundfile"]),
    (90, "basic-pitch (pasa el audio a notas)", "basic-pitch (turns audio into notes)", ["--no-deps", "basic-pitch"]),
]

_lock = threading.Lock()
_install = {"state": "idle", "pct": 0, "msg": "", "log": []}
_jobs = {}


def tools_python():
    sub = ("Scripts", "python.exe") if os.name == "nt" else ("bin", "python")
    return os.path.join(TOOLS, "venv", *sub)


def status():
    ready = os.path.exists(MARKER) and os.path.exists(tools_python())
    with _lock:
        inst = {k: v for k, v in _install.items() if k != "log"}
        inst["log"] = _install["log"][-8:]
    return {"ready": ready, "install": inst, "dir": TOOLS, "size_hint": "1-2 GB"}


def _set(**kw):
    with _lock:
        _install.update(kw)
        if kw.get("msg"):
            _install["log"].append(kw["msg"])


def _run(cmd, on_line=None):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    tail = []
    for line in p.stdout:
        line = line.rstrip()
        if line:
            tail = (tail + [line])[-20:]
            if on_line:
                on_line(line)
    if p.wait() != 0:
        raise RuntimeError("\n".join(tail[-6:]))


def _base_python():
    """Un Python 3.10-3.12 para el entorno (PyTorch aún va justo con versiones muy nuevas)."""
    if sys.version_info[:2] <= (3, 13):
        return sys.executable
    for name in ("python3.12", "python3.11", "python3.10"):
        p = shutil.which(name)
        if p:
            return p
    return sys.executable


def install():
    with _lock:
        if _install["state"] == "running":
            return status()
        _install.update(state="running", pct=1, msg="", log=[])

    def work():
        try:
            os.makedirs(TOOLS, exist_ok=True)
            if not os.path.exists(tools_python()):
                _set(pct=3, msg="Creando el entorno de Python…|Creating the Python environment…")
                _run([_base_python(), "-m", "venv", os.path.join(TOOLS, "venv")])
            py = tools_python()
            _run([py, "-m", "pip", "install", "-q", "--upgrade", "pip"])
            for pct, es, en, pkgs in PIP_STEPS:
                _set(pct=pct, msg=f"Instalando {es}…|Installing {en}…")
                extra = []
                if pkgs[0] == "torch" and platform.system() != "Darwin":
                    extra = ["--index-url", "https://download.pytorch.org/whl/cpu"]  # sin CUDA: 5 veces menos
                _run([py, "-m", "pip", "install", "--progress-bar", "off", *pkgs, *extra])
            _set(pct=97, msg="Comprobando…|Checking…")
            _run([py, "-c", "import demucs.separate, librosa, onnxruntime; from basic_pitch import ICASSP_2022_MODEL_PATH"])
            with open(MARKER, "w") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M"))
            _set(state="done", pct=100, msg="Listo|Ready")
        except Exception as e:  # noqa: BLE001
            _set(state="error", msg=f"No se pudo instalar|Couldn't install: {str(e)[-600:]}")

    threading.Thread(target=work, daemon=True).start()
    return status()


def start_job(filename, data):
    """Guarda el audio en una carpeta temporal y lo convierte a MIDI en segundo plano."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in AUDIO_EXTS:
        raise ValueError("Formato no soportado (usa mp3, wav, flac, ogg, m4a o aiff)|Unsupported format (use mp3, wav, flac, ogg, m4a or aiff)")
    if len(data) > MAX_AUDIO:
        raise ValueError("El audio es demasiado grande (máx. 80 MB)|The audio file is too big (max 80 MB)")
    if not status()["ready"]:
        raise ValueError("Faltan las herramientas de audio|The audio tools aren't installed")
    jid = uuid.uuid4().hex[:12]
    work = tempfile.mkdtemp(prefix="tidal-import-")
    src = os.path.join(work, "song" + ext)
    with open(src, "wb") as f:
        f.write(data)
    job = {"id": jid, "state": "running", "pct": 1, "msg": "Empezando…|Starting…", "name": os.path.splitext(os.path.basename(filename))[0],
           "work": work, "midi": None, "error": None, "started": time.time()}
    _jobs[jid] = job

    def work_fn():
        out = os.path.join(work, "song.mid")
        try:
            def line(l):
                if l.startswith("PROGRESS "):
                    _, pct, msg = l.split(" ", 2)
                    job.update(pct=int(pct), msg=msg)
            _run([tools_python(), os.path.join(HERE, "audio_worker.py"), src, out, work], line)
            with open(out, "rb") as f:
                job["midi"] = f.read()
            job.update(state="done", pct=100)
        except Exception as e:  # noqa: BLE001
            job.update(state="error", error=str(e)[-600:])
        finally:
            shutil.rmtree(work, ignore_errors=True)

    threading.Thread(target=work_fn, daemon=True).start()
    return job_public(job)


def job_public(job):
    return {k: job[k] for k in ("id", "state", "pct", "msg", "name", "error")}


def get_job(jid):
    return _jobs.get(jid)
