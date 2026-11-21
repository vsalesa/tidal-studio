"""
Autodetección del Claude Code de tu terminal (proveedor «Claude con tu suscripción»).

Mira, sin gastar ninguna petición a la IA:
  - dónde está `claude` y su versión
  - si tiene sesión iniciada con tu plan (y si la tendría sin las claves de API de tu entorno)
  - el modelo que usa por defecto (ANTHROPIC_MODEL o ~/.claude/settings.json)
  - si usa un endpoint propio (ANTHROPIC_BASE_URL), una clave de API, Bedrock/Vertex…
y elige el modo «auto». Cada valor dice de dónde sale. Los secretos nunca salen enteros.
"""
import json
import os
import subprocess
import threading
import time

import llm
import shellenv

RESULT = {}
_lock = threading.Lock()
KEYS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")


def mask(v):
    v = str(v or "")
    return (v[:7] + "…" + v[-4:]) if len(v) > 14 else ("••••" if v else "")


def _run(cmd, env, timeout=25):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, env=env, stdin=subprocess.DEVNULL)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except subprocess.TimeoutExpired:
        return None, "", "timeout"
    except OSError as e:
        return None, "", str(e)


def _auth(exe, env):
    rc, out, err = _run([exe, "auth", "status"], env)
    try:
        return json.loads(out) if out.startswith("{") else {"error": (err or out)[:300]}
    except ValueError:
        return {"error": (err or out)[:300]}


def settings():
    """Ajustes de usuario de Claude Code: modelo, variables env, apiKeyHelper."""
    base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
    out = {"model": None, "env": {}, "apiKeyHelper": False, "files": []}
    for name in ("settings.json", "settings.local.json"):
        f = os.path.join(base, name)
        if not os.path.exists(f):
            continue
        try:
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:  # noqa: BLE001
            continue
        short = f.replace(os.path.expanduser("~"), "~")
        out["files"].append(short)
        if d.get("model"):
            out["model"] = (d["model"], short)
        for k, v in (d.get("env") or {}).items():
            out["env"][k] = (str(v), short)
        if d.get("apiKeyHelper"):
            out["apiKeyHelper"] = short
    return out


def _item(value, source, shown=None):
    return {"value": value, "shown": value if shown is None else shown, "source": source}


def detect(cfg):
    shellenv.wait(12)
    t0 = time.time()
    c = cfg.get("claudecode") or {}
    term = "terminal" if shellenv.REPORT.get("state") == "ok" else "entorno"
    st = settings()
    res = {"ok": False, "items": {}, "auto": {}, "settings_files": st["files"]}
    items = res["items"]

    exe, how = llm.find_claude({"claudecode": {}})  # lo que hay en tu ordenador, sin la ruta de Ajustes
    if c.get("path"):
        items["path"] = _item(c["path"], "settings")
    elif exe:
        items["path"] = _item(exe, {"PATH": "terminal_path", "search": "search"}[how])
    else:
        items["path"] = _item("", "missing")
    use = (c.get("path") or exe)
    if use:
        env = dict(os.environ)
        env["PATH"] = os.path.dirname(use) + os.pathsep + env.get("PATH", "")
        env.pop("CLAUDECODE", None)
        rc, out, err = _run([use, "--version"], env)
        items["version"] = _item(out if rc == 0 else "", "cli", out if rc == 0 else (err or "?")[:200])
        a_term = _auth(use, env)
        sub_env = {k: v for k, v in env.items() if k not in llm.SUB_STRIP}
        a_sub = _auth(use, sub_env) if any(k in env for k in llm.SUB_STRIP) else a_term
        res["auth_terminal"], res["auth_subscription"] = a_term, a_sub
        items["login"] = _item(bool(a_term.get("loggedIn")), "cli",
                               f"{a_term.get('authMethod', '?')} · {a_term.get('apiProvider', '?')}" if "loggedIn" in a_term
                               else a_term.get("error", "?"))
        res["ok"] = rc == 0
    else:
        a_term = a_sub = {}

    # modelo por defecto
    if c.get("model"):
        items["model"] = _item(c["model"], "settings")
    elif os.environ.get("ANTHROPIC_MODEL"):
        items["model"] = _item(os.environ["ANTHROPIC_MODEL"], "env:ANTHROPIC_MODEL")
    elif st["env"].get("ANTHROPIC_MODEL"):
        v, f = st["env"]["ANTHROPIC_MODEL"]
        items["model"] = _item(v, f + " (env)")
    elif st["model"]:
        items["model"] = _item(st["model"][0], st["model"][1])
    else:
        items["model"] = _item("", "plan_default")

    # endpoint
    if os.environ.get("ANTHROPIC_BASE_URL"):
        items["endpoint"] = _item(os.environ["ANTHROPIC_BASE_URL"], "env:ANTHROPIC_BASE_URL")
    elif st["env"].get("ANTHROPIC_BASE_URL"):
        v, f = st["env"]["ANTHROPIC_BASE_URL"]
        items["endpoint"] = _item(v, f + " (env)")
    else:
        items["endpoint"] = _item("", "official")

    # clave
    key = None
    for k in KEYS:
        if os.environ.get(k):
            key = _item(k, "env:" + k, mask(os.environ[k]))
            break
        if st["env"].get(k):
            v, f = st["env"][k]
            key = _item(k, f + " (env)", mask(v))
            break
    if not key and st["apiKeyHelper"]:
        key = _item("apiKeyHelper", st["apiKeyHelper"], "apiKeyHelper")
    items["key"] = key or _item("", "none")

    cloud = [k for k in ("CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY")
             if os.environ.get(k) or st["env"].get(k)]
    items["cloud"] = _item(", ".join(cloud), "env" if cloud else "none")

    # ¿qué hace «auto»?
    custom_endpoint = bool(items["endpoint"]["value"]) and "api.anthropic.com" not in items["endpoint"]["value"]
    has_key = bool(key)
    sub_ok = bool(a_sub.get("loggedIn")) and a_sub.get("authMethod") not in ("api_key", "apiKey")
    if cloud or custom_endpoint or (st["env"].get("ANTHROPIC_API_KEY") or st["env"].get("ANTHROPIC_AUTH_TOKEN")):
        mode, why = "terminal", "custom"
    elif has_key and sub_ok:
        mode, why = "subscription", "key_and_login"
    elif has_key:
        mode, why = "terminal", "key_only"
    else:
        mode, why = "subscription", "login" if sub_ok else "no_login"
    res["auto"] = {"mode": mode, "why": why, "sub_logged_in": sub_ok}
    llm.AUTO.update(mode=mode, reason=why)
    res["seconds"] = round(time.time() - t0, 1)
    res["at"] = time.time()
    with _lock:
        RESULT.clear()
        RESULT.update(res)
    llm.log(f"autodetección / autodetect: claude={items['path']['value'] or '-'} {items.get('version', {}).get('value', '')}"
            f" · modelo/model={items['model']['value'] or '(plan)'} [{items['model']['source']}]"
            f" · endpoint={items['endpoint']['value'] or 'api.anthropic.com'} · key={items['key']['shown'] or '-'}"
            f" · auto={mode} ({why})")
    return res


def start(cfg_loader):
    def run():
        try:
            detect(cfg_loader())
        except Exception as e:  # noqa: BLE001
            llm.log(f"autodetección falló / autodetect failed: {e}")
    threading.Thread(target=run, daemon=True).start()


def get(cfg, refresh=False):
    with _lock:
        cached = dict(RESULT)
    if cached and not refresh and time.time() - cached.get("at", 0) < 600:
        return cached
    return detect(cfg)
