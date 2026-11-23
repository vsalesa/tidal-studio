"""
Tidal Studio launcher for the Windows and Linux offline installs (the Mac has its own Swift app).

What it does, with no console window:
  1. copies the program files to a writable folder in your user profile (your config.json, samples,
     recordings, my-skills/ and my-plugins/ are never touched),
  2. starts the studio server (Python + SuperCollider/SuperDirt + Tidal) in the background,
     logging to <data>/logs/studio.log,
  3. opens the studio in its own window:
       Windows: Microsoft Edge in app mode (no tabs or address bar; Edge comes with Windows 10/11),
       Linux:   a GTK + WebKit window (tidal-studio-window.py), or Chromium/Chrome in app mode,
     and if none is available, a small control window plus your default browser,
  4. when that window closes, stops the server and everything it started.

Run with the bundled pythonw.exe (Windows) or python3 (Linux):  launcher.py [--self-test]
--self-test starts the server, waits until it answers, shuts it down and checks nothing is left (CI).
"""
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

WIN = sys.platform == "win32"
HERE = os.path.dirname(os.path.abspath(__file__))
RT = os.path.dirname(HERE)  # install root: C:\TidalStudio or /opt/tidal-studio
SELF_TEST = "--self-test" in sys.argv
NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW

if WIN:
    DATA = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Tidal Studio")
else:
    DATA = os.path.join(os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share"), "tidal-studio")
APP = os.path.join(DATA, "app")
LOGDIR = os.path.join(DATA, "logs")
LOG = os.path.join(LOGDIR, "studio.log")
PORT_FILE = os.path.join(DATA, ".port")
QUIT_FILE = os.path.join(DATA, ".quit-request")  # the studio writes it to close the app (to install an update)
KEEP = {"config.json", "samples", "recordings", "my-plugins", "my-skills"}


def spanish():
    lang = os.environ.get("TIDAL_STUDIO_LANG") or os.environ.get("LANG") or ""
    if not lang and WIN:
        try:
            import ctypes
            lang = "es" if (ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3FF) == 0x0A else "en"
        except Exception:
            pass
    return lang.lower().startswith("es")


ES = spanish()


def T(en, es):
    return es if ES else en


def say(msg):
    print(f"[launcher] {msg}", flush=True)


# ---------------------------------------------------------------- program files
def sync_app():
    """Copies RT/app to APP, skipping the user's own files (like rsync without --delete)."""
    src = os.path.join(RT, "app")
    for d, dirs, files in os.walk(src):
        rel = os.path.relpath(d, src)
        if rel == ".":
            dirs[:] = [x for x in dirs if x not in KEEP]
            files = [f for f in files if f not in KEEP]
        out = os.path.join(APP, rel)
        os.makedirs(out, exist_ok=True)
        for f in files:
            a, b = os.path.join(d, f), os.path.join(out, f)
            try:
                sa = os.stat(a)
                if os.path.exists(b):
                    sb = os.stat(b)
                    if sb.st_size == sa.st_size and int(sb.st_mtime) == int(sa.st_mtime):
                        continue
                shutil.copy2(a, b)
                if not WIN:
                    os.chmod(b, sa.st_mode | 0o200)
            except OSError as e:
                say(f"copy {a}: {e}")
    os.makedirs(os.path.join(APP, "samples"), exist_ok=True)


def server_env():
    env = dict(os.environ)
    if WIN:
        import glob
        sclang = (glob.glob(os.path.join(RT, "SuperCollider", "**", "sclang.exe"), recursive=True) or [""])[0]
        env.update({
            "TIDAL_GHCI": os.path.join(RT, "ghc", "bin", "ghci.exe"),
            "TIDAL_SCLANG": sclang,
            "PATH": os.pathsep.join([os.path.join(RT, "ghc", "bin"), os.path.join(RT, "python"), env.get("PATH", "")]),
        })
    else:
        env.update({
            "TIDAL_GHCI": os.path.join(RT, "ghc", "bin", "ghci"),
            "PATH": os.pathsep.join([os.path.join(RT, "python", "bin"), os.path.join(RT, "ghc", "bin"),
                                     env.get("PATH", "/usr/bin:/bin"), "/usr/local/bin",
                                     os.path.expanduser("~/.local/bin")]),
        })
        if os.path.exists("/usr/bin/sclang"):
            env["TIDAL_SCLANG"] = "/usr/bin/sclang"
        env["TIDAL_STUDIO_WATCH_PARENT"] = "1"  # own process group + stop if the launcher dies
    env.update({
        "GHC_ENVIRONMENT": os.path.join(RT, "tidal.env"),
        "TIDAL_SCLANG_CONF": os.path.join(RT, "sclang_conf.yaml"),
        "PYTHONUNBUFFERED": "1",
        "PYTHONIOENCODING": "utf-8",
        "TIDAL_STUDIO_LANG": env.get("TIDAL_STUDIO_LANG") or ("es" if ES else "en"),
        # updates (server/appupdate.py): where the install is, how to ask us to quit, and whom to wait for
        "TIDAL_STUDIO_RUNTIME": RT,
        "TIDAL_STUDIO_QUIT_FILE": QUIT_FILE,
        "TIDAL_STUDIO_SHELL_PID": str(os.getpid()),
    })
    return env


# ---------------------------------------------------------------- Windows job object
def kill_on_close_job():
    """Every process the server starts (sclang, scsynth, ghci) joins this job, and Windows kills them
    all when the launcher exits, even if it crashes."""
    if not WIN:
        return None
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.windll.kernel32

        class IO(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ulonglong) for n in
                        ("r", "w", "o", "rb", "wb", "ob")]

        class BASIC(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class EXT(ctypes.Structure):
            _fields_ = [("Basic", BASIC), ("Io", IO), ("ProcessMemoryLimit", ctypes.c_size_t),
                        ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t),
                        ("PeakJobMemoryUsed", ctypes.c_size_t)]

        k32.CreateJobObjectW.restype = wintypes.HANDLE
        job = k32.CreateJobObjectW(None, None)
        info = EXT()
        # KILL_ON_JOB_CLOSE, plus BREAKAWAY_OK so the update installer can outlive the app
        info.Basic.LimitFlags = 0x2000 | 0x0800
        k32.SetInformationJobObject(wintypes.HANDLE(job), 9, ctypes.byref(info), ctypes.sizeof(info))
        return job
    except Exception as e:
        say(f"job object: {e}")
        return None


def join_job(job, proc):
    if not job:
        return
    try:
        import ctypes
        from ctypes import wintypes
        ctypes.windll.kernel32.AssignProcessToJobObject(wintypes.HANDLE(job), wintypes.HANDLE(int(proc._handle)))
    except Exception as e:
        say(f"assign job: {e}")


# ---------------------------------------------------------------- server
class Server:
    def __init__(self):
        self.proc = None
        self.token = secrets.token_hex(16)
        self.port = None
        self.owned = True
        self.job = kill_on_close_job()

    def start(self):
        os.makedirs(LOGDIR, exist_ok=True)
        if os.path.exists(LOG):
            try:
                os.replace(LOG, os.path.join(LOGDIR, "studio.previous.log"))
            except OSError:
                pass
        try:
            os.remove(PORT_FILE)
        except OSError:
            pass
        env = server_env()
        env["TIDAL_STUDIO_SHUTDOWN_TOKEN"] = self.token
        py = os.path.join(RT, "python", "python.exe") if WIN else os.path.join(RT, "python", "bin", "python3")
        log = open(LOG, "ab")
        kw = dict(cwd=APP, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
        if WIN:
            kw["creationflags"] = NO_WINDOW
        self.proc = subprocess.Popen([py, os.path.join("server", "app.py"), "--no-browser", "--port-file", PORT_FILE], **kw)
        join_job(self.job, self.proc)
        say(f"server pid {self.proc.pid}, log {LOG}")

    def wait_ready(self, timeout=120):
        end = time.time() + timeout
        while time.time() < end:
            if self.port is None and os.path.exists(PORT_FILE):
                try:
                    self.port = int(open(PORT_FILE).read().strip())
                except (OSError, ValueError):
                    pass
            if self.port:
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/status", timeout=2) as r:
                        if r.status == 200:
                            # exit code 0 right away: another Tidal Studio was already running; we just use it
                            if self.proc.poll() == 0:
                                self.owned = False
                            return True
                except Exception:
                    pass
            if self.proc.poll() not in (None, 0):
                return False
            time.sleep(0.4)
        return False

    @property
    def url(self):
        return f"http://localhost:{self.port}/"

    def stop(self):
        if not self.proc or not self.owned:
            return
        if self.proc.poll() is None and self.port:
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/shutdown", data=b"{}", method="POST",
                                             headers={"X-Shutdown-Token": self.token,
                                                      "Content-Type": "application/json"})
                urllib.request.urlopen(req, timeout=3).read()
            except Exception as e:
                say(f"shutdown request: {e}")
            try:
                self.proc.wait(timeout=12)
            except subprocess.TimeoutExpired:
                pass
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        if not WIN:
            import signal
            try:
                os.killpg(self.proc.pid, signal.SIGTERM)
                time.sleep(0.5)
                os.killpg(self.proc.pid, signal.SIGKILL)
            except OSError:
                pass
        say("server stopped")


def log_tail(n=30):
    try:
        with open(LOG, encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except OSError:
        return ""


# ---------------------------------------------------------------- windows (the UI kind)
def quit_requested():
    if os.path.exists(QUIT_FILE):
        try:
            os.remove(QUIT_FILE)
        except OSError:
            pass
        say("the studio asked to quit (update)")
        return True
    return False


def wait_window(p):
    """Waits for the window to close, or closes it when the studio asks (to install an update).
    Returns the window's exit code, or 0 if we closed it."""
    while p.poll() is None:
        if quit_requested():
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
            return 0
        time.sleep(0.5)
    return p.returncode


def app_mode_browser():
    """Edge / Chrome / Chromium, which can show a page as an app window (no tabs or address bar)."""
    cands = []
    if WIN:
        for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
            if base:
                cands += [os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                          os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")]
    else:
        cands = [shutil.which(n) or "" for n in ("chromium", "chromium-browser", "google-chrome",
                                                  "google-chrome-stable", "microsoft-edge", "brave-browser")]
    return next((c for c in cands if c and os.path.exists(c)), None)


def run_window(url):
    """Shows the studio in its own window and returns when the user closes it."""
    if not WIN:
        # 1) GTK + WebKit window, with the system Python (python3-gi), like a native Linux app
        gtk = os.path.join(HERE, "tidal-studio-window.py")
        sys_py = "/usr/bin/python3"
        if os.path.exists(gtk) and os.path.exists(sys_py) and os.environ.get("DISPLAY", "") + os.environ.get("WAYLAND_DISPLAY", ""):
            env = {k: v for k, v in os.environ.items() if not k.startswith("PYTHON")}
            if wait_window(subprocess.Popen([sys_py, gtk, url, T("Tidal Studio", "Tidal Studio")], env=env)) == 0:
                return
            say("GTK window not available, trying a browser in app mode")
    # 2) Edge / Chrome in app mode, with its own profile so this window is its own process
    exe = app_mode_browser()
    if exe:
        profile = os.path.join(DATA, "window")
        args = [exe, f"--app={url}", f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
                "--disable-features=Translate", "--window-size=1440,920", "--autoplay-policy=no-user-gesture-required"]
        start = time.time()
        p = subprocess.Popen(args, creationflags=NO_WINDOW if WIN else 0)
        wait_window(p)
        # if it handed the window to an already running browser, fall back to the control window
        if time.time() - start > 5:
            return
        say("app-mode browser returned at once; showing the control window")
    # 3) control window + default browser
    control_window(url)


def control_window(url):
    import webbrowser
    webbrowser.open(url)
    try:
        import tkinter as tk
    except Exception:
        say("no tkinter: the studio keeps running until you log out")
        while True:
            time.sleep(3600)
    root = tk.Tk()
    root.title("Tidal Studio")
    root.geometry("380x170")
    root.resizable(False, False)
    tk.Label(root, text=T("Tidal Studio is running", "Tidal Studio está en marcha"), font=("", 14, "bold")).pack(pady=(18, 4))
    tk.Label(root, text=T("It opened in your web browser.\nClose this window to stop the studio.",
                          "Se ha abierto en tu navegador.\nCierra esta ventana para parar el estudio.")).pack()
    row = tk.Frame(root)
    row.pack(pady=12)
    tk.Button(row, text=T("Open again", "Volver a abrir"), command=lambda: webbrowser.open(url)).pack(side="left", padx=6)
    tk.Button(row, text=T("Stop the studio", "Parar el estudio"), command=root.destroy).pack(side="left", padx=6)

    def watch():
        if quit_requested():
            root.destroy()
        else:
            root.after(700, watch)
    root.after(700, watch)
    root.mainloop()


def error_box(title, text):
    say(f"ERROR: {title}\n{text}")
    if SELF_TEST:
        return
    if WIN:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text[-1800:], title, 0x10)
        return
    try:
        import tkinter as tk
        from tkinter import scrolledtext
        root = tk.Tk()
        root.title(title)
        tk.Label(root, text=title, font=("", 13, "bold")).pack(padx=12, pady=8)
        box = scrolledtext.ScrolledText(root, width=100, height=24)
        box.insert("end", text)
        box.pack(padx=12, pady=(0, 12))
        root.mainloop()
    except Exception:
        pass


# ---------------------------------------------------------------- main
def main():
    os.makedirs(LOGDIR, exist_ok=True)
    if WIN and sys.executable.lower().endswith("pythonw.exe"):
        # no console: keep the launcher's own messages in a file
        sys.stdout = sys.stderr = open(os.path.join(LOGDIR, "launcher.log"), "w", encoding="utf-8", buffering=1)
    if not os.path.isdir(os.path.join(RT, "app")):
        error_box("Tidal Studio", T(f"The studio files are missing in {RT}. Please run the installer again.",
                                    f"Faltan los archivos del estudio en {RT}. Vuelve a ejecutar el instalador."))
        return 1
    sync_app()
    try:
        os.remove(QUIT_FILE)
    except OSError:
        pass
    srv = Server()
    srv.start()
    try:
        if not srv.wait_ready():
            error_box(T("The studio could not start", "El estudio no ha podido arrancar"),
                      T("End of the log", "Final del registro") + f" ({LOG}):\n\n" + log_tail(60))
            if SELF_TEST:
                print(log_tail(80))
            return 1
        say(f"studio ready at {srv.url}")
        if SELF_TEST:
            time.sleep(5)
            print(json.dumps({"self_test": "ready", "url": srv.url, "owned": srv.owned}))
            return 0
        run_window(srv.url)
        return 0
    finally:
        srv.stop()


if __name__ == "__main__":
    sys.exit(main())
