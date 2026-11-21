"""
Conexión con la IA.

Dos tipos de proveedor:
  - "openai":    cualquier API compatible con OpenAI (/v1/chat/completions):
                 OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Together, Ollama, LM Studio, vLLM…
  - "anthropic": Claude, usando la Messages API de Anthropic.
  - "claudecode": Claude a través del comando `claude` (Claude Code) instalado en el ordenador:
                 usa la sesión iniciada con tu suscripción Pro/Max, sin clave de API.
"""
import glob
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request

import net


class LLMError(Exception):
    pass


def _post(url, headers, body, timeout=120):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "tidal-studio/0.1")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with net.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        raise LLMError(f"La IA respondió con error {e.code}: {detail}")
    except urllib.error.URLError as e:
        raise LLMError(f"No se pudo conectar con la IA ({url}): {e.reason}{net.ssl_hint(e.reason)}")
    except TimeoutError:
        raise LLMError("La IA tardó demasiado en responder")


def _openai(cfg, system, messages, max_tokens, on_event=None):
    c = cfg["openai"]
    base = c["base_url"].rstrip("/")
    url = base + "/chat/completions" if not base.endswith("/chat/completions") else base
    headers = {}
    if c.get("api_key"):
        headers["Authorization"] = "Bearer " + c["api_key"]
    body = {
        "model": c["model"],
        "messages": [{"role": "system", "content": system}] + messages,
        "max_tokens": max_tokens,
        "temperature": cfg.get("temperature", 0.7),
    }
    data = _post(url, headers, body)
    try:
        msg = data["choices"][0]["message"]
        # Algunos modelos (DeepSeek, OpenRouter, Ollama…) devuelven su razonamiento aparte
        why = msg.get("reasoning_content") or msg.get("reasoning") or ""
        if on_event and isinstance(why, str) and why.strip():
            on_event("thinking", why.strip())
        return msg["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise LLMError(f"Respuesta inesperada de la IA: {str(data)[:300]}")


def _anthropic(cfg, system, messages, max_tokens, on_event=None):
    c = cfg["anthropic"]
    headers = {
        "x-api-key": c["api_key"],
        "anthropic-version": "2023-06-01",
    }
    # La Messages API exige que los turnos alternen y empiecen por "user"
    clean = []
    for m in messages:
        if m["role"] not in ("user", "assistant"):
            continue
        if clean and clean[-1]["role"] == m["role"]:
            clean[-1]["content"] += "\n\n" + m["content"]
        else:
            clean.append({"role": m["role"], "content": m["content"]})
    if not clean or clean[0]["role"] != "user":
        clean.insert(0, {"role": "user", "content": "Hola"})
    body = {
        "model": c["model"],
        "system": system,
        "messages": clean,
        # Los modelos actuales de Claude razonan solos (thinking adaptativo) y no aceptan
        # "temperature"; "effort" bajo hace que el chat responda rápido.
        "max_tokens": max(max_tokens, 8000),
        "output_config": {"effort": c.get("effort", "low")},
    }
    if on_event and "haiku-4" not in str(c["model"]) and "3-" not in str(c["model"]):
        # Con alguien mirando, pedimos el razonamiento resumido y lo vamos pasando según llega
        body["thinking"] = {"type": "adaptive", "display": "summarized"}
        data = _anthropic_stream(headers, body, on_event)
    else:
        data = _post("https://api.anthropic.com/v1/messages", headers, body)
    if data.get("stop_reason") == "refusal":
        raise LLMError("Claude no ha querido responder a esta petición. Prueba a reformularla.")
    try:
        return "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
    except (KeyError, TypeError):
        raise LLMError(f"Respuesta inesperada de Claude: {str(data)[:300]}")


def _anthropic_stream(headers, body, on_event, timeout=180):
    """Messages API en streaming (SSE): pasa el razonamiento (thinking_delta) a on_event y devuelve el
    mensaje completo con la misma forma que la respuesta normal."""
    body = dict(body, stream=True)
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode("utf-8"), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "tidal-studio/0.1")
    for k, v in headers.items():
        req.add_header(k, v)
    blocks, stop = {}, None
    try:
        with net.urlopen(req, timeout=timeout) as resp:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                try:
                    ev = json.loads(line[5:].strip())
                except ValueError:
                    continue
                t = ev.get("type")
                if t == "content_block_start":
                    cb = ev.get("content_block") or {}
                    blocks[ev.get("index", 0)] = {"type": cb.get("type"), "text": cb.get("text", ""), "thinking": cb.get("thinking", "")}
                elif t == "content_block_delta":
                    d = ev.get("delta") or {}
                    b = blocks.setdefault(ev.get("index", 0), {"type": "text", "text": "", "thinking": ""})
                    if d.get("type") == "text_delta":
                        b["text"] += d.get("text", "")
                    elif d.get("type") == "thinking_delta":
                        b["thinking"] += d.get("thinking", "")
                        if d.get("thinking"):
                            on_event("thinking", d["thinking"])
                elif t == "message_delta":
                    stop = (ev.get("delta") or {}).get("stop_reason") or stop
                elif t == "error":
                    raise LLMError(f"La IA respondió con error: {str(ev.get('error'))[:300]}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        raise LLMError(f"La IA respondió con error {e.code}: {detail}")
    except urllib.error.URLError as e:
        raise LLMError(f"No se pudo conectar con la IA: {e.reason}{net.ssl_hint(e.reason)}")
    except TimeoutError:
        raise LLMError("La IA tardó demasiado en responder")
    content = [{"type": b["type"], "text": b["text"]} for _, b in sorted(blocks.items()) if b["type"] == "text"]
    return {"content": content, "stop_reason": stop}


# ---------------------------------------------------------------- Claude Code (suscripción)
LOGGER = None  # app.py lo conecta a la pestaña Log


def log(line):
    if LOGGER:
        try:
            LOGGER(line)
        except Exception:  # noqa: BLE001
            pass


FAMILIES = ("opus", "sonnet", "haiku", "fable")
ALIASES = ["opus", "sonnet", "haiku", "fable"]


def normalize_cli_model(name):
    """Convierte lo que ves en Claude Desktop («Opus 5.5», «Claude Sonnet 5.5 (1M)»…) en algo que el
    comando `claude` entiende: un alias (opus, sonnet…) o un id (claude-opus-5-5). Devuelve (modelo, nota)."""
    raw = (name or "").strip()
    if not raw:
        return "", ""
    low = raw.lower().strip()
    one_m = "1m" in low and ("[1m]" in low or "(1m" in low or " 1m" in low)
    core = re.sub(r"\(.*?\)|\[.*?\]", " ", low)
    core = re.sub(r"\b(1m|context|contexto|extended|thinking)\b", " ", core).strip()
    m = re.fullmatch(r"(?:claude)?[\s\-_]*(opus|sonnet|haiku|fable)(?:[\s\-_]*v?(\d+(?:[.\-_]\d+)?))?", core)
    if not m:
        return raw, ""
    fam, ver = m.group(1), m.group(2)
    out = f"claude-{fam}-{re.sub(r'[._]', '-', ver)}" if ver else fam
    if one_m:
        out += "[1m]"
    return out, ("" if out == raw else f"«{raw}» → «{out}»")


def _cli_candidates():
    home = os.path.expanduser("~")
    dirs = [os.path.join(home, ".local", "bin"), os.path.join(home, ".claude", "local"),
            "/opt/homebrew/bin", "/usr/local/bin", os.path.join(home, ".npm-global", "bin"),
            os.path.join(home, ".volta", "bin"), os.path.join(home, ".bun", "bin"),
            os.path.join(home, ".asdf", "shims"), os.path.join(home, "bin")]
    dirs += sorted(glob.glob(os.path.join(home, ".nvm", "versions", "node", "*", "bin")), reverse=True)
    dirs += sorted(glob.glob(os.path.join(home, ".fnm", "node-versions", "*", "installation", "bin")), reverse=True)
    for d in dirs:
        for n in ("claude", "claude.exe", "claude.cmd"):
            f = os.path.join(d, n)
            if os.path.isfile(f) and os.access(f, os.X_OK):
                yield f


def find_claude(cfg):
    """(ruta, cómo la hemos encontrado)"""
    c = cfg.get("claudecode") or {}
    p = os.path.expanduser((c.get("path") or "").strip())
    if p:
        return p, "config"
    w = shutil.which("claude")
    if w:
        return w, "PATH"
    for f in _cli_candidates():
        return f, "search"
    return "", ""


def claude_cli(cfg):
    return find_claude(cfg)[0]


SUB_STRIP = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL")
AUTO = {}  # lo rellena ccdetect: {"mode": "subscription"|"terminal", "reason": "..."}


def auth_mode(cfg):
    """Cómo se conecta `claude`: subscription (tu plan, como Claude Desktop), api (clave/endpoint propio)
    o terminal (igual que en tu terminal). «auto» decide con lo detectado."""
    c = cfg.get("claudecode") or {}
    m = c.get("auth_mode") or "auto"
    if m == "auto" and c.get("use_subscription") is False:
        m = "terminal"  # ajuste antiguo
    if m == "auto":
        m = AUTO.get("mode") or "terminal"
    return m


def cli_env(cfg, exe):
    """Entorno para `claude`: su carpeta en el PATH (node de nvm vive ahí) y las credenciales según el modo."""
    c = cfg.get("claudecode") or {}
    env = dict(os.environ)
    if exe and os.path.dirname(exe):
        env["PATH"] = os.path.dirname(exe) + os.pathsep + env.get("PATH", "")
    removed = []
    mode = auth_mode(cfg)
    if mode == "subscription":
        # con ANTHROPIC_API_KEY Claude Code la usaría en vez de tu plan
        for k in SUB_STRIP:
            if env.pop(k, None) is not None:
                removed.append(k)
    elif mode == "api":
        if (c.get("base_url") or "").strip():
            env["ANTHROPIC_BASE_URL"] = c["base_url"].strip()
        if (c.get("api_key") or "").strip():
            env["ANTHROPIC_API_KEY"] = c["api_key"].strip()
    env.pop("CLAUDECODE", None)  # si el estudio se abrió desde dentro de Claude Code
    return env, removed


def _cli_event(line, on_event):
    """Una línea de `claude -p --output-format stream-json`: pasa el razonamiento y los pasos."""
    try:
        d = json.loads(line)
    except ValueError:
        return
    if not isinstance(d, dict):
        return
    if d.get("type") == "stream_event":
        ev = d.get("event") or {}
        delta = ev.get("delta") or {}
        if ev.get("type") == "content_block_delta" and delta.get("type") == "thinking_delta" and delta.get("thinking"):
            on_event("thinking", delta["thinking"])
    elif d.get("type") == "system" and d.get("subtype") == "init":
        on_event("step", f"Claude Code · {d.get('model') or ''}".strip(" ·"))


def claude_run(cfg, system, prompt, model=None, timeout=None, on_event=None):
    """Ejecuta `claude -p` y devuelve todo lo necesario para depurar."""
    import time
    c = cfg.get("claudecode") or {}
    exe, how = find_claude(cfg)
    asked = c.get("model", "") if model is None else model
    resolved, note = normalize_cli_model(asked)
    res = {"exe": exe, "found_by": how, "model_input": asked, "model": resolved, "model_note": note,
           "cmd": [], "rc": None, "stdout": "", "stderr": "", "data": {}, "seconds": 0, "error": "", "env_removed": []}
    if not exe:
        res["error"] = "not_found"
        return res
    env, res["env_removed"] = cli_env(cfg, exe)
    t0 = time.time()
    with tempfile.TemporaryDirectory(prefix="tidal-studio-") as tmp:
        sp = os.path.join(tmp, "system.txt")
        with open(sp, "w", encoding="utf-8") as f:
            f.write(system)
        fmt = ["--output-format", "stream-json", "--verbose", "--include-partial-messages"] if on_event else ["--output-format", "json"]
        cmd = [exe, "-p"] + fmt + ["--tools", "", "--no-session-persistence",
                                   "--strict-mcp-config", "--system-prompt-file", sp]
        if resolved:
            cmd += ["--model", resolved]
        res["cmd"] = ["<system.txt>" if a == sp else a for a in cmd]
        try:
            # cwd temporal: así no lee CLAUDE.md ni ajustes de ninguna carpeta del usuario
            if on_event:  # línea a línea, para enseñar el razonamiento en directo
                _run_streaming(cmd, prompt, tmp, env, int(timeout or c.get("timeout", 180)), on_event, res)
            else:
                r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                   timeout=int(timeout or c.get("timeout", 180)), cwd=tmp, env=env)
                res.update(rc=r.returncode, stdout=r.stdout or "", stderr=r.stderr or "")
        except subprocess.TimeoutExpired:
            res["error"] = "timeout"
        except OSError as e:
            res["error"] = f"oserror: {e}"
    res["seconds"] = round(time.time() - t0, 1)
    out = res["stdout"].strip()
    for line in reversed(out.splitlines()):
        try:
            d = json.loads(line)
            if isinstance(d, dict):
                res["data"] = d
                break
        except ValueError:
            continue
    d = res["data"]
    res["used_models"] = list((d.get("modelUsage") or {}).keys())
    if not res["error"]:
        if not d:
            res["error"] = "no_json"
        elif d.get("is_error"):
            res["error"] = "is_error"
    st = "ok" if not res["error"] else res["error"]
    log(f"claude {('--model ' + resolved) if resolved else '(modelo por defecto / default model)'}"
        + (f" [{note}]" if note else "") + f" -> {st} {res['seconds']}s"
        + (f" · {', '.join(res['used_models'])}" if res["used_models"] else "")
        + (f" · rc={res['rc']}" if res["rc"] not in (0, None) else "")
        + (f" · sin/without {', '.join(res['env_removed'])}" if res["env_removed"] else ""))
    if res["error"]:
        detail = str(d.get("result") or "") or res["stderr"].strip() or out
        log("  " + detail.strip().replace("\n", " ")[:600])
    return res


def _run_streaming(cmd, prompt, cwd, env, timeout, on_event, res):
    """Como subprocess.run, pero leyendo la salida línea a línea para enseñar el razonamiento en directo."""
    import threading
    try:
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                             encoding="utf-8", errors="replace", cwd=cwd, env=env)
    except OSError as e:
        res["error"] = f"oserror: {e}"
        return
    err = []
    t_err = threading.Thread(target=lambda: err.append(p.stderr.read()), daemon=True)
    t_err.start()
    timer = threading.Timer(timeout, p.kill)
    timer.start()
    out = []
    try:
        try:
            p.stdin.write(prompt)
            p.stdin.close()
        except OSError:
            pass
        for line in p.stdout:
            out.append(line)
            _cli_event(line, on_event)
        p.wait()
    finally:
        timed_out = not timer.is_alive() and p.returncode not in (0, None)
        timer.cancel()
    t_err.join(timeout=2)
    res.update(rc=p.returncode, stdout="".join(out), stderr="".join(err))
    if timed_out:
        res["error"] = "timeout"


MODEL_HINT = (" · Usa un alias (opus, sonnet, haiku, fable) o un id como claude-opus-5-5, no el nombre que "
              "ves en Claude Desktop. Ajustes → Diagnóstico te dice cuáles funcionan.")


def _claudecode(cfg, system, messages, max_tokens, on_event=None):
    # Claude Code recibe la conversación como texto; las instrucciones de Maestro van como system prompt
    turns = []
    for m in messages:
        who = "Alumno" if m["role"] == "user" else "Maestro"
        turns.append(f"[{who}]\n{m['content']}")
    prompt = ("Conversación hasta ahora (responde SOLO al último mensaje del alumno, como Maestro, "
              "con el formato JSON indicado y nada más):\n\n" + "\n\n".join(turns))
    r = claude_run(cfg, system, prompt, on_event=on_event)
    d = r["data"]
    if r["error"] == "not_found":
        raise LLMError("No encuentro el comando «claude». Instala Claude Code (https://claude.com/claude-code), "
                       "ejecuta «claude» una vez para iniciar sesión con tu suscripción y vuelve a probar. "
                       "Si ya lo tienes, pon su ruta en Ajustes (en una terminal: which claude).")
    if r["error"] == "timeout":
        raise LLMError("Claude Code tardó demasiado en responder")
    if r["error"].startswith("oserror"):
        raise LLMError(f"No se pudo ejecutar «claude» ({r['exe']}): {r['error'][9:]}")
    if r["error"] == "no_json":
        err = (r["stderr"] or r["stdout"] or "").strip()[:400]
        raise LLMError("Claude Code no respondió bien. ¿Has iniciado sesión? Ejecuta «claude» en una terminal y escribe /login. "
                       "Ajustes → Diagnóstico muestra el detalle. " + err)
    if r["error"] == "is_error":
        msg = str(d.get("result") or d.get("subtype") or "error")[:400]
        if "model" in msg.lower() or d.get("api_error_status") == 404:
            msg += MODEL_HINT
            if r["model_note"]:
                msg += f" (probé {r['model_note']})"
        raise LLMError("Claude Code: " + msg)
    return d.get("result") or ""


def chat_completion(cfg, system, messages, max_tokens=1500, on_event=None):
    """on_event(tipo, texto), opcional: recibe el razonamiento de la IA («thinking») y pasos («step»)
    mientras responde, para enseñarlo en el chat."""
    p = cfg["provider"]
    try:
        if p == "claudecode":
            return _claudecode(cfg, system, messages, max_tokens, on_event)
        if p == "anthropic":
            return _anthropic(cfg, system, messages, max_tokens, on_event)
        return _openai(cfg, system, messages, max_tokens, on_event)
    except LLMError as e:
        if p != "claudecode":  # claude_run ya lo ha apuntado con más detalle
            log(f"{p} ({(cfg.get(p) or {}).get('model', '')}) -> {e}")
        raise
