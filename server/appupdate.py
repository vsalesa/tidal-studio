"""Actualizaciones de la propia app de Tidal Studio (no de los plugins: eso es plugins.py).

Cada versión nueva se publica como Release de GitHub (vsalesa/tidal-studio) con tres instaladores:
  TidalStudio-<v>-macOS-AppleSilicon.pkg (y a veces -Intel.pkg), TidalStudio-<v>-Windows-x64-Setup.exe,
  tidal-studio_<v>_amd64.deb

Qué hace este módulo:
  1. check(): pregunta a GitHub por la última Release y la compara con la versión instalada.
  2. download(): baja el instalador de tu sistema a ~/.tidal-studio/updates y comprueba su SHA-256
     (GitHub lo publica junto a cada archivo) y su tamaño.
  3. install(): escribe un pequeño script que espera a que se cierre Tidal Studio, ejecuta el instalador
     (con la ventana de contraseña de tu sistema) y vuelve a abrir la app; luego le pide a la app que se cierre
     escribiendo el archivo TIDAL_STUDIO_QUIT_FILE, que vigilan la app de Mac y el lanzador de Windows y Linux.

Si Tidal Studio se ejecuta desde el código (git clone + start.sh), solo avisa y enlaza la descarga.
"""
import hashlib
import json
import os
import platform
import re
import shlex
import subprocess
import sys
import threading
import time
import urllib.request

import net

REPO = "vsalesa/tidal-studio"
API = f"https://api.github.com/repos/{REPO}/releases/latest"
RELEASES_PAGE = f"https://github.com/{REPO}/releases/latest"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPDATES_DIR = os.path.join(os.path.expanduser("~"), ".tidal-studio", "updates")
MAC_RUNTIME = "/Users/Shared/TidalStudio"
MAC_APP = "/Applications/Tidal Studio.app"
GITHUB_TOKEN = ""   # lo pone app.py si configuraste GitHub (más margen con el límite de la API)
CHECK_EVERY = 12 * 3600

# Para las pruebas: se pueden sustituir
http_get = None     # fn(url) -> bytes (JSON de la API)
open_stream = None  # fn(url) -> objeto con .read(n) (descarga del instalador)
spawn = None        # fn(argv, **popen_kwargs)

STATE = {"state": "idle", "checked_at": 0, "error": ""}
BEFORE_INSTALL = None  # app.py pone aquí la copia de seguridad (backup.create)
_lock = threading.Lock()


# ------------------------------------------------------------------ dónde y qué está instalado
def runtime_root():
    """Carpeta del instalador (/Users/Shared/TidalStudio, C:\\TidalStudio, /opt/tidal-studio) o "" si se
    ejecuta desde el código fuente."""
    rt = os.environ.get("TIDAL_STUDIO_RUNTIME", "")
    if rt and os.path.isdir(rt):
        return rt
    # apps de antes de que existiera la variable
    if sys.platform == "darwin" and os.path.exists(os.path.join(MAC_RUNTIME, "VERSION")) and \
            "Application Support/Tidal Studio" in ROOT:
        return MAC_RUNTIME
    return ""


def install_kind():
    """mac-pkg | windows-setup | deb | source"""
    if not runtime_root():
        return "source"
    if sys.platform == "darwin":
        return "mac-pkg"
    if sys.platform == "win32":
        return "windows-setup"
    return "deb"


def current_version():
    for p in ([os.path.join(runtime_root(), "VERSION")] if runtime_root() else []) + \
             [os.path.join(ROOT, "packaging", "VERSION")]:
        try:
            with open(p, encoding="utf-8") as f:
                v = f.read().strip()
            if v:
                return v.lstrip("v")
        except OSError:
            continue
    return "0.0.0"


def parse_version(v):
    """'v0.10.2' -> (0, 10, 2). Lo que no sea número cuenta como 0."""
    parts = re.findall(r"\d+", str(v or "").split("-")[0].split("+")[0])
    return tuple(int(x) for x in (parts + ["0", "0", "0"])[:3])


def newer(remote, local):
    return parse_version(remote) > parse_version(local)


def asset_pattern(kind=None, machine=None):
    """Expresión que reconoce el instalador de este ordenador entre los archivos de la Release."""
    kind = kind or install_kind()
    machine = (machine or platform.machine() or "").lower()
    if kind == "mac-pkg" or (kind == "source" and sys.platform == "darwin"):
        return r"macOS-AppleSilicon\.pkg$" if machine in ("arm64", "aarch64") else r"macOS-Intel\.pkg$"
    if kind == "windows-setup" or (kind == "source" and sys.platform == "win32"):
        return r"Windows-x64-Setup\.exe$"
    if machine in ("x86_64", "amd64"):
        return r"_amd64\.deb$"
    return r"(?!)"  # no hay instalador para este equipo (p. ej. Linux ARM)


def pick_asset(release, kind=None, machine=None):
    pat = re.compile(asset_pattern(kind, machine), re.I)
    for a in release.get("assets") or []:
        if pat.search(a.get("name") or ""):
            return {"name": a["name"], "size": int(a.get("size") or 0), "url": a.get("browser_download_url") or "",
                    "digest": a.get("digest") or ""}
    return None


def whats_new(body, lang="es"):
    """Solo la primera sección de las notas (la de esta versión), en el idioma de la app."""
    body = (body or "").replace("\r\n", "\n")
    secs = re.split(r"\n(?=## )", "\n" + body.strip())
    first = next((s.strip() for s in secs if s.strip()), "")
    first = re.sub(r"^## .*\n?", "", first).strip()
    en, _, es = first.partition("**Español:**")
    text = (es if lang == "es" and es.strip() else en).strip()
    return text[:4000]


# ------------------------------------------------------------------ red
def _get(url):
    if http_get:
        return http_get(url)
    feed = os.environ.get("TIDAL_STUDIO_UPDATE_FEED", "")  # pruebas: un JSON de Release local
    if feed and url == API:
        with open(feed, "rb") as f:
            return f.read()
    req = urllib.request.Request(url, headers={"User-Agent": "tidal-studio-updater",
                                               "Accept": "application/vnd.github+json"})
    if GITHUB_TOKEN:
        req.add_header("Authorization", "Bearer " + GITHUB_TOKEN)
    with net.urlopen(req, timeout=20) as r:
        return r.read(3_000_000)


def _stream(url):
    if open_stream:
        return open_stream(url)
    req = urllib.request.Request(url, headers={"User-Agent": "tidal-studio-updater"})
    return net.urlopen(req, timeout=60)


# ------------------------------------------------------------------ estado público
def public(cfg=None):
    up = (cfg or {}).get("updates") or {}
    with _lock:
        s = dict(STATE)
    s.update({
        "current": current_version(),
        "kind": install_kind(),
        "can_install": install_kind() != "source" and bool(s.get("asset")),
        "auto_check": up.get("auto_check", True) is not False,
        "skipped": up.get("skipped") or "",
        "page": s.get("page") or RELEASES_PAGE,
        "platform": {"darwin": "mac", "win32": "windows"}.get(sys.platform, "linux"),
    })
    s.pop("_path", None)
    return s


def _set(**kw):
    with _lock:
        STATE.update(kw)


# ------------------------------------------------------------------ 1. comprobar
def check(lang="es"):
    """Mira la última Release. Devuelve el estado público (sin cfg)."""
    with _lock:
        if STATE["state"] in ("downloading", "installing"):
            return dict(STATE)
        STATE.update(state="checking", error="")
    try:
        rel = json.loads(_get(API))
    except Exception as e:  # noqa: BLE001  sin red, límite de la API…
        _set(state="error", error=f"{e}{net.ssl_hint(e)}", checked_at=int(time.time()))
        return dict(STATE)
    latest = str(rel.get("tag_name") or "").lstrip("v")
    cur = current_version()
    info = {"latest": latest, "notes": {"en": whats_new(rel.get("body"), "en"), "es": whats_new(rel.get("body"), "es")}, "page": rel.get("html_url") or RELEASES_PAGE,
            "published_at": rel.get("published_at") or "", "asset": pick_asset(rel), "checked_at": int(time.time())}
    if latest and newer(latest, cur):
        # ¿ya está descargado de antes?
        path = _target(info["asset"]) if info["asset"] else ""
        ready = bool(path) and _verify(path, info["asset"], quick=True)
        _set(state="ready" if ready else "available", _path=path if ready else "", progress=1 if ready else 0, **info)
    else:
        _set(state="uptodate", **info)
    return dict(STATE)


def maybe_check(cfg, lang="es", force=False):
    """Comprobación automática (al arrancar y cada 12 h) si no la has desactivado."""
    up = cfg.get("updates") or {}
    if not force and up.get("auto_check", True) is False:
        return None
    if not force and STATE.get("checked_at") and time.time() - STATE["checked_at"] < CHECK_EVERY:
        return None
    return check(lang)


# ------------------------------------------------------------------ 2. descargar
def _target(asset):
    name = os.path.basename(asset["name"])
    return os.path.join(UPDATES_DIR, name)


def _verify(path, asset, quick=False):
    try:
        if asset.get("size") and os.path.getsize(path) != asset["size"]:
            return False
    except OSError:
        return False
    dig = asset.get("digest") or ""
    if quick or not dig.startswith("sha256:"):
        return True
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest() == dig.split(":", 1)[1].lower()


def download():
    """Descarga el instalador (en este hilo: llama desde uno aparte). Estado: downloading -> ready | error."""
    with _lock:
        asset = STATE.get("asset")
        if STATE["state"] not in ("available", "error") or not asset:
            return dict(STATE)
        STATE.update(state="downloading", progress=0, error="")
    path = _target(asset)
    part = path + ".part"
    try:
        os.makedirs(UPDATES_DIR, exist_ok=True)
        # borrar instaladores viejos (ocupan cientos de MB)
        for f in os.listdir(UPDATES_DIR):
            if f != os.path.basename(path) and f != os.path.basename(part) and not f.endswith((".log", ".sh", ".ps1")):
                try:
                    os.remove(os.path.join(UPDATES_DIR, f))
                except OSError:
                    pass
        got = 0
        with _stream(asset["url"]) as r, open(part, "wb") as out:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                got += len(chunk)
                if asset.get("size"):
                    _set(progress=min(0.99, got / asset["size"]))
        _set(state="verifying")
        if not _verify(part, asset):
            os.remove(part)
            raise ValueError("el archivo descargado no coincide con el publicado (tamaño o SHA-256) / "
                             "the download does not match the published file")
        os.replace(part, path)
        _set(state="ready", progress=1, _path=path)
    except Exception as e:  # noqa: BLE001
        _set(state="error", error=f"{e}{net.ssl_hint(e)}")
    return dict(STATE)


def start_download():
    threading.Thread(target=download, daemon=True).start()


# ------------------------------------------------------------------ 3. instalar
def _q(s):
    return shlex.quote(str(s))


def _as(s):
    """Cadena de AppleScript."""
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def helper_script(kind, installer, wait_pid, lang="es", rt=""):
    """El script que instala cuando se cierra la app. Devuelve (nombre de archivo, contenido)."""
    es = lang == "es"
    log = os.path.join(UPDATES_DIR, "install.log")
    if kind == "mac-pkg":
        prompt = ("Tidal Studio quiere instalar su versión nueva." if es
                  else "Tidal Studio wants to install its new version.")
        osa = (f'do shell script "/usr/sbin/installer -pkg " & quoted form of {_as(installer)} & " -target /" '
               f'with prompt {_as(prompt)} with administrator privileges')
        return "install-update.sh", f"""#!/bin/bash
# Tidal Studio: instala la actualización cuando se cierra la app y la vuelve a abrir.
exec >>{_q(log)} 2>&1
echo "== $(date) waiting for pid {wait_pid}"
for i in $(seq 1 600); do kill -0 {wait_pid} 2>/dev/null || break; sleep 0.5; done
sleep 1
if /usr/bin/osascript -e {_q(osa)}; then
  echo "installed"; rm -f {_q(installer)}
  /usr/bin/open -a {_q(MAC_APP)}
else
  echo "installer cancelled or failed: opening it in Installer"
  /usr/bin/open {_q(installer)}
fi
"""
    if kind == "windows-setup":
        rt = rt or r"C:\TidalStudio"
        ps = lambda s: "'" + str(s).replace("'", "''") + "'"  # noqa: E731
        return "install-update.ps1", f"""# Tidal Studio: installs the update once the app has closed, then opens it again (ASCII only: PowerShell 5)
$log = {ps(log)}
Add-Content $log "== $(Get-Date) waiting for pid {wait_pid}"
try {{ Wait-Process -Id {wait_pid} -Timeout 300 -ErrorAction SilentlyContinue }} catch {{}}
Start-Sleep -Seconds 1
try {{
  $p = Start-Process -FilePath {ps(installer)} -ArgumentList '/SILENT','/SUPPRESSMSGBOXES','/NORESTART','/CLOSEAPPLICATIONS' -Wait -PassThru
  Add-Content $log "setup exit $($p.ExitCode)"
  if ($p.ExitCode -eq 0) {{ Remove-Item -LiteralPath {ps(installer)} -ErrorAction SilentlyContinue }}
}} catch {{
  Add-Content $log "setup failed: $_"
  Start-Process -FilePath {ps(installer)}
  exit
}}
Start-Process -FilePath {ps(os.path.join(rt, "python", "pythonw.exe"))} -ArgumentList ('"' + {ps(os.path.join(rt, "bin", "launcher.py"))} + '"') -WorkingDirectory {ps(rt)}
"""
    # deb
    return "install-update.sh", f"""#!/bin/bash
# Tidal Studio: instala la actualización cuando se cierra la app y la vuelve a abrir.
exec >>{_q(log)} 2>&1
echo "== $(date) waiting for pid {wait_pid}"
for i in $(seq 1 600); do kill -0 {wait_pid} 2>/dev/null || break; sleep 0.5; done
sleep 1
if command -v pkexec >/dev/null && pkexec apt-get install -y --allow-downgrades {_q(installer)}; then
  echo "installed"; rm -f {_q(installer)}
  setsid tidal-studio >/dev/null 2>&1 < /dev/null &
else
  echo "pkexec missing or cancelled: opening the package"
  xdg-open {_q(installer)}
fi
"""


def shell_pid():
    """El proceso de la ventana de Tidal Studio (app de Mac o lanzador): el script espera a que se cierre."""
    try:
        return int(os.environ.get("TIDAL_STUDIO_SHELL_PID") or 0) or os.getppid()
    except ValueError:
        return os.getppid()


def install(lang="es"):
    """Deja preparado el instalador para cuando se cierre la app y pide a la app que se cierre.
    Devuelve {"ok", "quitting"}: quitting=False si hay que cerrar Tidal Studio a mano."""
    kind = install_kind()
    with _lock:
        path = STATE.get("_path") or ""
        if kind == "source":
            raise ValueError("Tidal Studio se ejecuta desde el código: actualiza con git pull / running from source: use git pull")
        if STATE["state"] != "ready" or not path or not os.path.exists(path):
            raise ValueError("Primero descarga la actualización / download the update first")
        STATE.update(state="installing")
    # 0.25: copia de seguridad de tus datos antes de que el instalador toque nada
    if BEFORE_INSTALL:
        try:
            BEFORE_INSTALL()
        except Exception as e:  # noqa: BLE001  una copia fallida no debe dejarte sin actualizar, pero se avisa
            print(f"[backup] antes de actualizar: {e}")
    try:
        name, body = helper_script(kind, path, shell_pid(), lang, runtime_root())
        script = os.path.join(UPDATES_DIR, name)
        with open(script, "w", encoding="utf-8", newline="\r\n" if kind == "windows-setup" else "\n") as f:
            f.write(body)
        run = spawn or subprocess.Popen
        if kind == "windows-setup":
            # fuera del "job" del lanzador (si no, Windows lo mataría al cerrarse la app) y sin consola
            flags = 0x01000000 | 0x00000008 | 0x00000200 | 0x08000000  # BREAKAWAY | DETACHED | NEW_GROUP | NO_WINDOW
            run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script],
                creationflags=flags, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                close_fds=True)
        else:
            os.chmod(script, 0o755)
            # su propia sesión: así sobrevive cuando la app cierra el grupo de procesos del servidor
            run(["/bin/bash", script], start_new_session=True, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    except Exception as e:  # noqa: BLE001
        _set(state="ready", error=str(e))
        raise
    quit_file = os.environ.get("TIDAL_STUDIO_QUIT_FILE", "")
    quitting = False
    if quit_file:
        try:
            with open(quit_file, "w") as f:
                f.write("update\n")
            quitting = True
        except OSError:
            pass
    return {"ok": True, "quitting": quitting}


def skip(cfg, version):
    cfg.setdefault("updates", {})["skipped"] = str(version or "")
    return cfg
