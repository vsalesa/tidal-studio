"""
Diagnóstico de la conexión con la IA (Ajustes → Diagnóstico).

Muestra paso a paso qué ve el estudio: proveedor, modelo (tal como lo escribiste y como se envía),
dónde está el comando `claude`, su versión, si hay sesión iniciada, variables de entorno que cambian
su comportamiento, la petición exacta y la respuesta en bruto. También prueba qué modelos funcionan.
"""
import json
import os
import subprocess
import sys
import threading
import urllib.error
import urllib.request

import llm
import net
import shellenv

ENV_KEYS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "ANTHROPIC_SMALL_FAST_MODEL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
            "CLAUDE_CODE_USE_FOUNDRY", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN",
            "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "NVM_DIR")
SECRET = ("KEY", "TOKEN")


def _mask(k, v):
    if any(s in k for s in SECRET):
        return (v[:6] + "…" + v[-4:]) if len(v) > 12 else "••••"
    return v


def _t(lang):
    return (lambda es, en: en if lang == "en" else es)


def _run(cmd, env, timeout=25):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, env=env, stdin=subprocess.DEVNULL)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except subprocess.TimeoutExpired:
        return None, "", "timeout"
    except OSError as e:
        return None, "", str(e)


def _env_block(t):
    rep = dict(shellenv.REPORT)
    vars_ = {k: _mask(k, os.environ[k]) for k in ENV_KEYS if os.environ.get(k)}
    state = {"ok": t("leído", "loaded"), "error": t("falló", "failed"), "skipped": t("no hacía falta", "skipped"),
             "pending": t("leyendo…", "loading…")}.get(rep["state"], rep["state"])
    return {
        "name": t("Entorno de tu terminal", "Your terminal environment"),
        "ok": rep["state"] != "error",
        "summary": f"{os.path.basename(rep['shell']) or '-'}: {state}"
                   + (f" · +{len(rep['path_added'])} PATH, +{len(rep['imported'])} {t('variables', 'variables')}"
                      if rep["state"] == "ok" else ""),
        "detail": {"shell": rep["shell"], "state": rep["state"], "seconds": rep["seconds"], "error": rep["error"],
                   "path_added": rep["path_added"], "imported": rep["imported"],
                   "PATH": os.environ.get("PATH", "").split(os.pathsep), "vars": vars_,
                   "platform": sys.platform, "python": sys.executable},
    }


def _settings_file():
    base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
    out = {}
    for name in ("settings.json", "settings.local.json"):
        f = os.path.join(base, name)
        if os.path.exists(f):
            try:
                with open(f, encoding="utf-8") as fh:
                    d = json.load(fh)
                out[f] = {"model": d.get("model"), "env": sorted((d.get("env") or {}).keys()),
                          "apiKeyHelper": bool(d.get("apiKeyHelper"))}
            except Exception as e:  # noqa: BLE001
                out[f] = {"error": str(e)[:200]}
    return out


def diagnose_claudecode(cfg, lang):
    t = _t(lang)
    steps, hints = [], []
    steps.append(_env_block(t))
    exe, how = llm.find_claude(cfg)
    env, removed = llm.cli_env(cfg, exe)
    if not exe:
        steps.append({"name": t("Comando claude", "claude command"), "ok": False,
                      "summary": t("no encontrado", "not found"), "detail": {"PATH": env.get("PATH", "")}})
        hints.append(t("No encuentro «claude». En una terminal ejecuta «which claude» y pega esa ruta en «Ruta de claude».",
                       "Can't find «claude». In a terminal run «which claude» and paste that path into «Path to claude»."))
        return {"provider": "claudecode", "ok": False, "steps": steps, "hints": hints}
    how_txt = {"config": t("ruta de Ajustes", "path from Settings"), "PATH": "PATH",
               "search": t("buscado en carpetas habituales", "found in usual folders")}[how]
    rc, out, err = _run([exe, "--version"], env)
    ok_v = rc == 0
    steps.append({"name": t("Comando claude", "claude command"), "ok": ok_v,
                  "summary": f"{exe} ({how_txt}) · {out or err[:120]}",
                  "detail": {"path": exe, "realpath": os.path.realpath(exe), "found_by": how,
                             "version_rc": rc, "version": out, "stderr": err[-800:]}})
    if not ok_v and "node" in err:
        hints.append(t("«claude» está instalado con npm pero no encuentra node. Instálalo con el instalador nativo "
                       "(curl -fsSL https://claude.ai/install.sh | bash) o pon en «Ruta de claude» la ruta completa.",
                       "«claude» was installed with npm but can't find node. Use the native installer "
                       "(curl -fsSL https://claude.ai/install.sh | bash) or put the full path in «Path to claude»."))

    rc, out, err = _run([exe, "auth", "status"], env)
    auth = {}
    try:
        auth = json.loads(out) if out.startswith("{") else {}
    except ValueError:
        pass
    logged = auth.get("loggedIn")
    steps.append({"name": t("Sesión", "Sign-in"), "ok": bool(logged) if auth else None,
                  "summary": (f"{t('iniciada', 'signed in') if logged else t('NO iniciada', 'NOT signed in')}"
                              f" · {auth.get('authMethod', '?')} · {auth.get('apiProvider', '?')}") if auth
                  else t("esta versión no tiene «claude auth status»", "this version has no «claude auth status»"),
                  "detail": {"rc": rc, "stdout": out[-1500:], "stderr": err[-800:], "env_removed": removed}})
    if auth and not logged:
        hints.append(t("Claude Code no tiene sesión iniciada para el estudio. En una terminal ejecuta «claude» y escribe /login.",
                       "Claude Code isn't signed in for the studio. In a terminal run «claude» and type /login."))
    if auth and auth.get("apiProvider") not in (None, "firstParty"):
        hints.append(t(f"Claude Code está usando {auth.get('apiProvider')} (Bedrock/Vertex…), no tu suscripción: "
                       "revisa CLAUDE_CODE_USE_* en tu entorno o settings.json.",
                       f"Claude Code is using {auth.get('apiProvider')} (Bedrock/Vertex…), not your subscription: "
                       "check CLAUDE_CODE_USE_* in your environment or settings.json."))
    if auth and "api" in str(auth.get("authMethod", "")).lower() and "key" in str(auth.get("authMethod", "")).lower():
        hints.append(t("Claude Code está usando una clave de API en vez de tu suscripción.",
                       "Claude Code is using an API key instead of your subscription."))

    sf = _settings_file()
    if sf:
        steps.append({"name": t("Ajustes de Claude Code", "Claude Code settings"), "ok": True,
                      "summary": ", ".join(f"{os.path.basename(k)}: model={v.get('model') or '-'}" for k, v in sf.items()),
                      "detail": sf})

    c = cfg.get("claudecode") or {}
    asked = c.get("model", "")
    resolved, note = llm.normalize_cli_model(asked)
    steps.append({"name": t("Modelo", "Model"), "ok": True,
                  "summary": (f"«{asked}» → «{resolved}»" if note else (f"«{asked}»" if asked else
                              t("vacío: el de tu plan por defecto", "empty: your plan's default"))),
                  "detail": {"input": asked, "sent": resolved}})
    if note:
        hints.append(t(f"El modelo «{asked}» es un nombre de Claude Desktop; el comando claude necesita «{resolved}». "
                       "El estudio ya lo convierte solo.",
                       f"«{asked}» is a Claude Desktop name; the claude command needs «{resolved}». "
                       "The studio now converts it for you."))

    r = llm.claude_run(cfg, "Responde solo con la palabra: listo", "¿Estás ahí?", timeout=120)
    d = r["data"]
    ok = not r["error"]
    summary = (f"{t('responde', 'replies')} «{str(d.get('result', ''))[:60]}» · {', '.join(r['used_models'])} · {r['seconds']} s"
               if ok else f"{r['error']}: {str(d.get('result') or r['stderr'] or r['stdout'])[:200]}")
    steps.append({"name": t("Prueba real", "Live test"), "ok": ok, "summary": summary,
                  "detail": {"command": " ".join(_q(a) for a in r["cmd"]), "rc": r["rc"], "seconds": r["seconds"],
                             "env_removed": r["env_removed"], "used_models": r["used_models"],
                             "api_error_status": d.get("api_error_status"), "api_error_type": d.get("api_error_type"),
                             "result": d.get("result"), "stdout": r["stdout"][-3000:], "stderr": r["stderr"][-2000:]}})
    if not ok and (d.get("api_error_status") == 404 or "model" in str(d.get("result", "")).lower()):
        hints.append(t("Ese modelo no lo acepta tu Claude Code. Pulsa «Probar modelos» y elige uno que funcione. "
                       "Si es un modelo muy nuevo, actualiza Claude Code (claude update).",
                       "Your Claude Code doesn't accept that model. Press «Test models» and pick one that works. "
                       "If it's a brand-new model, update Claude Code (claude update)."))
    return {"provider": "claudecode", "ok": ok, "steps": steps, "hints": hints}


def _q(a):
    return a if a and all(ch.isalnum() or ch in "-_./[]<>:" for ch in a) else json.dumps(a)


def _get_json(url, headers):
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "tidal-studio/0.1")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with net.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), ""
    except urllib.error.HTTPError as e:
        return e.code, None, e.read().decode("utf-8", errors="replace")[:1500]
    except Exception as e:  # noqa: BLE001
        return None, None, str(e)[:500]


def diagnose_api(cfg, lang):
    t = _t(lang)
    p = cfg["provider"]
    steps, hints = [_env_block(t)], []
    if p == "anthropic":
        c = cfg["anthropic"]
        url = "https://api.anthropic.com/v1/models?limit=100"
        status, data, err = _get_json(url, {"x-api-key": c.get("api_key", ""), "anthropic-version": "2023-06-01"})
    else:
        c = cfg["openai"]
        url = c["base_url"].rstrip("/").replace("/chat/completions", "") + "/models"
        status, data, err = _get_json(url, {"Authorization": "Bearer " + c["api_key"]} if c.get("api_key") else {})
    models = [m.get("id") for m in (data or {}).get("data", []) if isinstance(m, dict) and m.get("id")]
    steps.append({"name": t("Modelos disponibles", "Available models"), "ok": bool(models),
                  "summary": f"GET {url.split('?')[0]} → {status} · {len(models)}",
                  "detail": {"status": status, "models": models, "error": err}})
    model = c.get("model", "")
    if models and model not in models:
        hints.append(t(f"«{model}» no está en la lista de tu cuenta. Elige uno de la lista.",
                       f"«{model}» is not in your account's list. Pick one from the list."))
    try:
        reply = llm.chat_completion(cfg, "Responde solo con la palabra: listo", [{"role": "user", "content": "¿Estás ahí?"}], 20)
        steps.append({"name": t("Prueba real", "Live test"), "ok": True, "summary": f"{model}: «{reply.strip()[:60]}»",
                      "detail": {"model": model}})
        ok = True
    except llm.LLMError as e:
        steps.append({"name": t("Prueba real", "Live test"), "ok": False, "summary": str(e)[:300],
                      "detail": {"model": model, "error": str(e)}})
        ok = False
    return {"provider": p, "ok": ok, "steps": steps, "hints": hints, "models": [{"model": m, "ok": None} for m in models]}


def diagnose(cfg, lang="es"):
    shellenv.wait(12)
    res = diagnose_claudecode(cfg, lang) if cfg["provider"] == "claudecode" else diagnose_api(cfg, lang)
    llm.log(f"diagnóstico / diagnostics ({res['provider']}): {'OK' if res['ok'] else 'ERROR'}"
            + "".join(f"\n  {'✓' if s['ok'] else ('✗' if s['ok'] is False else '·')} {s['name']}: {s['summary']}" for s in res["steps"])
            + "".join(f"\n  → {h}" for h in res["hints"]))
    return res


def test_models(cfg, lang="es"):
    """Prueba en paralelo los alias de Claude Code (y el modelo que tengas puesto)."""
    shellenv.wait(12)
    c = cfg.get("claudecode") or {}
    cands = list(llm.ALIASES)
    mine = llm.normalize_cli_model(c.get("model", ""))[0]
    if mine and mine not in cands:
        cands.insert(0, mine)
    out = {}

    def one(m):
        r = llm.claude_run(cfg, "Responde solo con la palabra: listo", "¿Estás ahí?", model=m, timeout=120)
        d = r["data"]
        out[m] = {"model": m, "ok": not r["error"], "used": r["used_models"], "seconds": r["seconds"],
                  "error": "" if not r["error"] else str(d.get("result") or r["stderr"] or r["error"])[:300]}
    th = [threading.Thread(target=one, args=(m,)) for m in cands]
    for x in th:
        x.start()
    for x in th:
        x.join()
    return {"models": [out[m] for m in cands]}
