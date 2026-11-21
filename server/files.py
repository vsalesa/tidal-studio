"""Abrir y guardar archivos de Tidal (.tidal, .hs, .txt) en cualquier carpeta del ordenador.

- read/write: el estudio corre en este ordenador, así que lee y escribe archivos por su ruta.
  Solo extensiones de texto de Tidal, y como mucho 2 MB.
- dialog: muestra el diálogo nativo del sistema para elegir el archivo:
  macOS → osascript (choose file), Windows → PowerShell (OpenFileDialog), Linux → zenity o kdialog.
  La app de Mac usa sus propios paneles (main.swift); esto sirve cuando abres el estudio en el navegador.
  Si no hay diálogo disponible devuelve {"unavailable": true} y la web usa el del navegador.
"""
import os
import platform
import shutil
import subprocess

EXTS = (".tidal", ".hs", ".txt")
MAX_BYTES = 2 * 1024 * 1024


class FileError(Exception):
    pass


def default_dir():
    home = os.path.expanduser("~")
    for sub in ("Documents", "Documentos", "Music", "Música"):
        d = os.path.join(home, sub)
        if os.path.isdir(d):
            return d
    return home


def _norm(path, for_write=False):
    path = os.path.abspath(os.path.expanduser(str(path or "").strip()))
    if not path or os.path.isdir(path):
        raise FileError("Escribe la ruta de un archivo, no de una carpeta|Type the path of a file, not a folder")
    root, ext = os.path.splitext(path)
    if for_write and not ext:
        path, ext = path + ".tidal", ".tidal"
    if ext.lower() not in EXTS:
        raise FileError("Solo archivos .tidal, .hs o .txt|Only .tidal, .hs or .txt files")
    return path


def info():
    return {"dir": default_dir(), "home": os.path.expanduser("~"), "sep": os.sep, "dialog": _dialog_kind() is not None, "os": platform.system()}


def read(path):
    path = _norm(path)
    if not os.path.isfile(path):
        raise FileError("No encuentro el archivo|File not found")
    if os.path.getsize(path) > MAX_BYTES:
        raise FileError("El archivo es demasiado grande (máx. 2 MB)|The file is too big (max 2 MB)")
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    return {"path": path, "name": os.path.basename(path), "content": text, "mtime": os.path.getmtime(path)}


def write(path, content, overwrite=True):
    path = _norm(path, for_write=True)
    folder = os.path.dirname(path)
    if not os.path.isdir(folder):
        raise FileError("La carpeta no existe|The folder doesn't exist")
    if os.path.exists(path) and not overwrite:
        return {"exists": True, "path": path, "name": os.path.basename(path)}
    data = str(content or "")
    if len(data.encode("utf-8")) > MAX_BYTES:
        raise FileError("El archivo es demasiado grande (máx. 2 MB)|The file is too big (max 2 MB)")
    tmp = path + ".tmp-tidal-studio"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(data)
    os.replace(tmp, path)  # de golpe: si algo falla a medias no se pierde el archivo anterior
    return {"path": path, "name": os.path.basename(path), "mtime": os.path.getmtime(path)}


# ---------------------------------------------------------------- diálogos nativos
def _dialog_kind():
    system = platform.system()
    if system == "Darwin" and shutil.which("osascript"):
        return "osascript"
    if system == "Windows":
        return "powershell" if shutil.which("powershell") or shutil.which("powershell.exe") else None
    if os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"):
        if shutil.which("zenity"):
            return "zenity"
        if shutil.which("kdialog"):
            return "kdialog"
    return None


def _as_str(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _ps_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def dialog(mode, name="", start="", title=""):
    """mode "open" o "save". Devuelve {"path": …}, {"cancelled": True} o {"unavailable": True}."""
    kind = _dialog_kind()
    if not kind:
        return {"unavailable": True}
    save = mode == "save"
    start = os.path.expanduser(start or "")
    if start and not os.path.isdir(start):
        start = os.path.dirname(start)
    if not start or not os.path.isdir(start):
        start = default_dir()
    name = os.path.basename(name or "song.tidal")
    title = title or ("Save Tidal file" if save else "Open a Tidal file")
    env = None
    if kind == "osascript":
        if save:
            script = (f"activate\nPOSIX path of (choose file name with prompt {_as_str(title)} "
                      f"default name {_as_str(name)} default location (POSIX file {_as_str(start)}))")
        else:
            script = (f"activate\nPOSIX path of (choose file with prompt {_as_str(title)} "
                      f"default location (POSIX file {_as_str(start)}))")
        cmd = ["osascript", "-e", script]
    elif kind == "powershell":
        cls = "SaveFileDialog" if save else "OpenFileDialog"
        script = "\n".join([
            "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
            "Add-Type -AssemblyName System.Windows.Forms",
            # Una ventana invisible siempre encima: así el diálogo no se queda detrás del estudio
            "$owner = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}",
            f"$d = New-Object System.Windows.Forms.{cls}",
            f"$d.Title = {_ps_str(title)}",
            "$d.Filter = 'Tidal (*.tidal;*.hs)|*.tidal;*.hs|Text (*.txt)|*.txt|All files (*.*)|*.*'",
            f"$d.InitialDirectory = {_ps_str(start)}",
            *( [f"$d.FileName = {_ps_str(name)}", "$d.DefaultExt = 'tidal'", "$d.OverwritePrompt = $true"] if save else [] ),
            "if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }",
        ])
        exe = shutil.which("powershell") or shutil.which("powershell.exe")
        cmd = [exe, "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script]
    elif kind == "zenity":
        cmd = ["zenity", "--file-selection", f"--title={title}",
               "--file-filter=Tidal | *.tidal *.hs *.txt", "--file-filter=* | *"]
        cmd += ["--save", "--confirm-overwrite", f"--filename={os.path.join(start, name)}"] if save else [f"--filename={start}{os.sep}"]
        env = dict(os.environ)
    else:  # kdialog
        cmd = ["kdialog", "--title", title, "--getsavefilename" if save else "--getopenfilename",
               os.path.join(start, name) if save else start, "*.tidal *.hs *.txt"]
    kw = {}
    if platform.system() == "Windows":
        kw["creationflags"] = 0x08000000  # CREATE_NO_WINDOW: sin consola negra
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=600, env=env, **kw)
    except Exception as e:  # noqa: BLE001
        return {"unavailable": True, "error": str(e)}
    out = r.stdout.decode("utf-8", "replace").strip().splitlines()
    path = out[-1].strip() if out else ""
    if r.returncode != 0 or not path:
        err = r.stderr.decode("utf-8", "replace")
        # osascript: -128 = el usuario canceló. Otros errores: que la web use su propio diálogo
        if kind == "osascript" and "-128" not in err and r.returncode != 0:
            return {"unavailable": True, "error": err.strip()[:300]}
        return {"cancelled": True}
    return {"path": path, "name": os.path.basename(path)}
