"""
Conexión con la IA.

Dos tipos de proveedor:
  - "openai":    cualquier API compatible con OpenAI (/v1/chat/completions):
                 OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Together, Ollama, LM Studio, vLLM…
  - "anthropic": Claude, usando la Messages API de Anthropic.
"""
import json
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


def chat_completion(cfg, system, messages, max_tokens=1500):
    if cfg["provider"] == "anthropic":
        return _anthropic(cfg, system, messages, max_tokens)
    return _openai(cfg, system, messages, max_tokens)
