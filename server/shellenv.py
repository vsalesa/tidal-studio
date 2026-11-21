"""
Variables de entorno de tu terminal, también cuando el estudio se abre desde el Finder.

Una app de Mac abierta desde el Finder (o un lanzador de Linux) no lee ~/.bashrc, ~/.bash_profile,
~/.zshrc… así que no ve el PATH donde vive el comando `claude` (nvm, npm, Homebrew…) ni variables
como ANTHROPIC_API_KEY o un proxy. Aquí abrimos tu shell de inicio una vez, en segundo plano,
leemos su entorno y añadimos lo que falte (sin pisar lo que ya hay).

Desactívalo con TIDAL_STUDIO_NO_SHELL_ENV=1.
"""
import os
import subprocess
import sys
import threading
import time

MARK = "__TIDAL_STUDIO_ENV__"
# Cosas propias de una terminal concreta que no tiene sentido copiar
SKIP = {"PWD", "OLDPWD", "SHLVL", "_", "PS1", "PS2", "PS4", "PROMPT_COMMAND", "TERM", "COLUMNS", "LINES",
        "SHELL_SESSION_ID", "HISTFILE", "HISTSIZE", "HISTFILESIZE", "MAIL", "MAILCHECK"}
SKIP_PREFIX = ("BASH_FUNC_", "BASH_", "ZSH", "TERM_", "ITERM", "TMUX", "VSCODE_", "__CF", "__CFBundle", "SSH_")

REPORT = {"state": "pending", "shell": "", "seconds": 0, "path_added": [], "imported": [], "error": ""}
_done = threading.Event()


def _shell():
    sh = os.environ.get("SHELL") or ""
    if not sh or not os.path.exists(sh):
        sh = "/bin/zsh" if sys.platform == "darwin" else "/bin/bash"
    return sh


def _command(sh):
    """Shell de inicio e interactiva: lee .bash_profile/.profile y también .bashrc (o .zprofile y .zshrc)."""
    dump = f"printf '\\n{MARK}\\n'; /usr/bin/env -0"
    name = os.path.basename(sh)
    if name == "bash":
        # bash -l no lee ~/.bashrc si .bash_profile no lo incluye: lo cargamos nosotros
        return [sh, "-l", "-i", "-c", f"[ -r ~/.bashrc ] && . ~/.bashrc >/dev/null 2>&1; {dump}"]
    if name == "fish":
        return [sh, "-l", "-i", "-c", f"printf '\\n{MARK}\\n'; /usr/bin/env -0"]
    return [sh, "-l", "-i", "-c", dump]


def read_login_env(timeout=10):
    sh = _shell()
    REPORT["shell"] = sh
    r = subprocess.run(_command(sh), stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout,
                       env=dict(os.environ, TIDAL_STUDIO_READING_ENV="1"), start_new_session=True)
    out = r.stdout.decode("utf-8", errors="replace")
    if MARK not in out:
        raise RuntimeError(f"{os.path.basename(sh)} exit {r.returncode}: "
                           + r.stderr.decode("utf-8", errors="replace").strip()[-300:])
    env = {}
    for item in out.split(MARK + "\n", 1)[1].split("\0"):
        if "=" in item:
            k, v = item.split("=", 1)
            env[k.strip()] = v
    return env


def merge(env):
    cur = os.environ.get("PATH", "").split(os.pathsep)
    added = []
    for p in env.get("PATH", "").split(os.pathsep):
        if p and p not in cur and p not in added:
            added.append(p)
    if added:
        os.environ["PATH"] = os.pathsep.join([p for p in cur if p] + added)
    imported = []
    for k, v in env.items():
        if not k or k == "PATH" or k in SKIP or k.startswith(SKIP_PREFIX) or k == "TIDAL_STUDIO_READING_ENV":
            continue
        if k not in os.environ:
            os.environ[k] = v
            imported.append(k)
    return added, sorted(imported)


def load():
    t0 = time.time()
    try:
        added, imported = merge(read_login_env())
        REPORT.update(state="ok", path_added=added, imported=imported)
        print(f"[env] {os.path.basename(REPORT['shell'])}: +{len(added)} PATH, +{len(imported)} variables"
              + (f" ({', '.join(imported[:12])}{'…' if len(imported) > 12 else ''})" if imported else ""), flush=True)
    except Exception as e:  # noqa: BLE001
        REPORT.update(state="error", error=str(e)[:400])
        print(f"[env] No se pudo leer el entorno de tu shell / could not read your shell environment: {e}", flush=True)
    REPORT["seconds"] = round(time.time() - t0, 1)
    _done.set()


def start():
    """Lee el entorno de tu shell en segundo plano (no en Windows ni si ya vienes de una terminal)."""
    if os.name == "nt" or os.environ.get("TIDAL_STUDIO_NO_SHELL_ENV") == "1" or os.environ.get("TIDAL_STUDIO_READING_ENV"):
        REPORT["state"] = "skipped"
        _done.set()
        return
    threading.Thread(target=load, daemon=True).start()


def wait(timeout=12):
    _done.wait(timeout)
