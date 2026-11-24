"""Importar canciones en audio (mp3, wav…): herramientas opcionales y trabajos en segundo plano.

Las herramientas (MSST + PyTorch, Demucs de respaldo, basic-pitch, librosa) pesan mucho (~1-2 GB), así que no van con el
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
MARKER = os.path.join(TOOLS, "ready-v2")   # v2: MSST (SCNet XL) para separar; v1 solo tenía Demucs
OLD_MARKER = os.path.join(TOOLS, "ready-v1")
MODELS = os.path.join(TOOLS, "models")
# auto = MSST y, si falla, Demucs. Se puede forzar uno con TIDAL_STUDIO_SEPARATOR=msst|demucs
SEPARATOR = os.environ.get("TIDAL_STUDIO_SEPARATOR", "auto")
AUDIO_EXTS = (".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aiff", ".aif")
MAX_AUDIO = 80 * 1024 * 1024

# basic-pitch pide versiones viejas de numpy/tensorflow: lo instalamos sin dependencias y usamos su
# modelo ONNX con onnxruntime, que funciona en Mac (Apple Silicon), Windows y Linux.
PIP_STEPS = [
    # MSST pide torch < 2.12
    (15, "PyTorch (el más grande, ~200-800 MB)", "PyTorch (the biggest one, ~200-800 MB)", ["torch<2.12", "torchaudio<2.12"]),
    (45, "MSST (separa batería, bajo, voz y el resto)", "MSST (splits drums, bass, vocals and the rest)", ["msst[scnet]"]),
    (60, "Demucs (separador de respaldo)", "Demucs (backup separator)", ["demucs"]),
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
    has_py = os.path.exists(tools_python())
    # Con las herramientas viejas (solo Demucs) se sigue pudiendo importar: el trabajador usa Demucs si no
    # encuentra MSST. «upgrade» hace que la web ofrezca actualizarlas.
    upgrade = has_py and os.path.exists(OLD_MARKER) and not os.path.exists(MARKER)
    ready = has_py and (os.path.exists(MARKER) or upgrade)
    with _lock:
        inst = {k: v for k, v in _install.items() if k != "log"}
        inst["log"] = _install["log"][-8:]
    out = {"ready": ready, "upgrade": upgrade, "install": inst, "dir": TOOLS, "size_hint": "1-2 GB", "separator": SEPARATOR}
    if ready and os.path.exists(MARKER):
        out["msst"] = True
        out["accel"] = accel()
    return out


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
                if pkgs[0].startswith("torch") and platform.system() != "Darwin":
                    extra = ["--index-url", "https://download.pytorch.org/whl/cpu"]  # sin CUDA: 5 veces menos
                _run([py, "-m", "pip", "install", "--progress-bar", "off", *pkgs, *extra])
            _set(pct=97, msg="Comprobando…|Checking…")
            _run([py, "-c", "import msst, demucs.separate, librosa, onnxruntime; from basic_pitch import ICASSP_2022_MODEL_PATH"])
            with open(MARKER, "w") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M"))
            _set(state="done", pct=100, msg="Listo|Ready")
        except Exception as e:  # noqa: BLE001
            _set(state="error", msg=f"No se pudo instalar|Couldn't install: {str(e)[-600:]}")

    threading.Thread(target=work, daemon=True).start()
    return status()


_accel = {}


def accel():
    """¿Las herramientas tienen tarjeta gráfica o Apple Silicon (MPS)? Se mira una vez (tarda un par de segundos)."""
    if "v" not in _accel:
        try:
            out = subprocess.run([tools_python(), "-c", "import torch;print('cuda' if torch.cuda.is_available() else 'mps' if "
                                  "getattr(torch.backends,'mps',None) and torch.backends.mps.is_available() else 'cpu')"],
                                 capture_output=True, text=True, timeout=60).stdout.strip().splitlines()
            _accel["v"] = out[-1] if out else "cpu"
        except Exception:  # noqa: BLE001
            _accel["v"] = "cpu"
    return _accel["v"]


def start_job(filename, data, engine=None):
    """Guarda el audio en una carpeta temporal y lo convierte a MIDI en segundo plano."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in AUDIO_EXTS:
        raise ValueError("Formato no soportado (usa mp3, wav, flac, ogg, m4a o aiff)|Unsupported format (use mp3, wav, flac, ogg, m4a or aiff)")
    if len(data) > MAX_AUDIO:
        raise ValueError("El audio es demasiado grande (máx. 80 MB)|The audio file is too big (max 80 MB)")
    if not status()["ready"]:
        raise ValueError("Faltan las herramientas de audio|The audio tools aren't installed")
    eng = engine if engine in ("msst", "demucs") else SEPARATOR
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
                if "PROGRESS " in l:  # a veces llega pegado detrás de una barra de progreso
                    _, pct, msg = l[l.rfind("PROGRESS "):].split(" ", 2)
                    job.update(pct=int(pct), msg=msg)
            _run([tools_python(), os.path.join(HERE, "audio_worker.py"), src, out, work, eng, MODELS], line)
            with open(out, "rb") as f:
                job["midi"] = f.read()
            keep_stems(work, job["name"], jid)
            job.update(state="done", pct=100)
        except Exception as e:  # noqa: BLE001
            job.update(state="error", error=str(e)[-600:])
        finally:
            shutil.rmtree(work, ignore_errors=True)

    threading.Thread(target=work_fn, daemon=True).start()
    return job_public(job)


STEMS = os.path.join(os.path.dirname(TOOLS), "stems")
STEM_KEYS = ("drums", "bass", "vocals", "other")


def keep_stems(work, name, jid):
    """Guarda las pistas separadas (batería, bajo, voz, resto) para poder analizarlas luego en el Laboratorio de sonido.
    Van a ~/.tidal-studio/stems/<canción>-<id>/; se pueden borrar sin problema."""
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in (name or "song"))[:40] or "song"
    dst = os.path.join(STEMS, f"{safe}-{jid[:6]}")
    try:
        for d, _, files in os.walk(work):
            for f in files:
                low = f.lower()
                if low.endswith((".wav", ".flac")) and any(k in low for k in STEM_KEYS):
                    os.makedirs(dst, exist_ok=True)
                    shutil.copy2(os.path.join(d, f), os.path.join(dst, f))
    except OSError:
        pass


def job_public(job):
    return {k: job[k] for k in ("id", "state", "pct", "msg", "name", "error")}


def get_job(jid):
    return _jobs.get(jid)
