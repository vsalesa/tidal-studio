"""
Conexión con la IA.

Dos tipos de proveedor:
  - "openai":    cualquier API compatible con OpenAI (/v1/chat/completions):
                 OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Together, Ollama, LM Studio, vLLM…
  - "anthropic": Claude, usando la Messages API de Anthropic.
  - "claudecode": Claude a través del comando `claude` (Claude Code) instalado en el ordenador:
                 usa la sesión iniciada con tu suscripción Pro/Max, sin clave de API.
"""
import json
import os
import shutil
import subprocess
import tempfile
import ssl
import urllib.error
import urllib.request


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
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        raise LLMError(f"La IA respondió con error {e.code}: {detail}")
    except urllib.error.URLError as e:
        raise LLMError(f"No se pudo conectar con la IA ({url}): {e.reason}")
    except TimeoutError:
        raise LLMError("La IA tardó demasiado en responder")


def _openai(cfg, system, messages, max_tokens):
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
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise LLMError(f"Respuesta inesperada de la IA: {str(data)[:300]}")


def _anthropic(cfg, system, messages, max_tokens):
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
    data = _post("https://api.anthropic.com/v1/messages", headers, body)
    if data.get("stop_reason") == "refusal":
        raise LLMError("Claude no ha querido responder a esta petición. Prueba a reformularla.")
    try:
        return "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
    except (KeyError, TypeError):
        raise LLMError(f"Respuesta inesperada de Claude: {str(data)[:300]}")


def claude_cli(cfg):
    c = cfg.get("claudecode") or {}
    return (c.get("path") or "").strip() or shutil.which("claude") or ""


def _claudecode(cfg, system, messages, max_tokens):
    exe = claude_cli(cfg)
    if not exe:
        raise LLMError("No encuentro el comando «claude». Instala Claude Code (https://claude.com/claude-code), "
                       "ejecuta «claude» una vez para iniciar sesión con tu suscripción y vuelve a probar.")
    # Claude Code recibe la conversación como texto; las instrucciones de Maestro van como system prompt
    turns = []
    for m in messages:
        who = "Alumno" if m["role"] == "user" else "Maestro"
        turns.append(f"[{who}]\n{m['content']}")
    prompt = ("Conversación hasta ahora (responde SOLO al último mensaje del alumno, como Maestro, "
              "con el formato JSON indicado y nada más):\n\n" + "\n\n".join(turns))
    c = cfg.get("claudecode") or {}
    with tempfile.TemporaryDirectory(prefix="tidal-studio-") as tmp:
        sp = os.path.join(tmp, "system.txt")
        with open(sp, "w", encoding="utf-8") as f:
            f.write(system)
        cmd = [exe, "-p", "--output-format", "json", "--tools", "", "--no-session-persistence",
               "--strict-mcp-config", "--system-prompt-file", sp]
        if c.get("model"):
            cmd += ["--model", c["model"]]
        try:
            # cwd temporal: así no lee CLAUDE.md ni ajustes de ninguna carpeta del usuario
            r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8",
                               timeout=int(c.get("timeout", 180)), cwd=tmp)
        except subprocess.TimeoutExpired:
            raise LLMError("Claude Code tardó demasiado en responder")
        except OSError as e:
            raise LLMError(f"No se pudo ejecutar «claude»: {e}")
    out = (r.stdout or "").strip()
    try:
        data = json.loads(out.splitlines()[-1] if out else "{}")
    except ValueError:
        data = {}
    if not data:
        err = (r.stderr or out or "").strip()[:400]
        raise LLMError("Claude Code no respondió bien. ¿Has iniciado sesión? Ejecuta «claude» en una terminal y escribe /login. " + err)
    if data.get("is_error"):
        raise LLMError("Claude Code: " + str(data.get("result") or data.get("subtype") or "error")[:400])
    return data.get("result") or ""


def chat_completion(cfg, system, messages, max_tokens=1500):
    if cfg["provider"] == "claudecode":
        return _claudecode(cfg, system, messages, max_tokens)
    if cfg["provider"] == "anthropic":
        return _anthropic(cfg, system, messages, max_tokens)
    return _openai(cfg, system, messages, max_tokens)
