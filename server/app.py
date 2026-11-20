#!/usr/bin/env python3
"""
Tidal Studio: servidor local.

- Sirve la interfaz web (carpeta ../web)
- Arranca y controla SuperCollider (SuperDirt) y GHCi con TidalCycles
- Habla con la IA (cualquier endpoint compatible con OpenAI, o Claude de Anthropic)

Solo usa la biblioteca estándar de Python (3.8+), así que no hace falta "pip install".
"""
import argparse
import json
import os
import platform
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import Engine, find_ghci, find_sclang  # noqa: E402
from llm import chat_completion, LLMError  # noqa: E402
from assistant import (build_messages, parse_reply, build_explain, parse_explain,
                       build_brainstorm, parse_brainstorm, with_lang, build_fix, parse_fix)  # noqa: E402
import github  # noqa: E402
from samples import Library, SampleError, safe_name, TYPES as SAMPLE_TYPES  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(ROOT, "web")
CONFIG_PATH = os.path.join(ROOT, "config.json")

DEFAULT_CONFIG = {
    "provider": "openai",          # "openai" (cualquier API compatible) o "anthropic" (Claude)
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "api_key": "",
        "model": "gpt-4o-mini",
    },
    "anthropic": {
        "api_key": "",
        "model": "claude-opus-5-5",
        "effort": "low",
    },
    "github": {
        "token": "",
        "repo": "",                # "usuario/repositorio"
        "branch": "main",
        "folder": "songs",
        "api_url": "https://api.github.com",
    },
    "samples": {
        "freesound_key": "",       # clave API gratuita de freesound.org/apiv2/apply
        "freesound_api": "https://freesound.org/apiv2",
    },
    "temperature": 0.7,
    "language": "es",
}

_config_lock = threading.Lock()


def load_config():
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            for k, v in saved.items():
                if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                    cfg[k].update(v)
                else:
                    cfg[k] = v
        except Exception as e:  # config corrupta: seguimos con la de por defecto
            print(f"[config] No se pudo leer config.json: {e}")
    # Variables de entorno opcionales
    if os.environ.get("OPENAI_API_KEY") and not cfg["openai"]["api_key"]:
        cfg["openai"]["api_key"] = os.environ["OPENAI_API_KEY"]
    if os.environ.get("ANTHROPIC_API_KEY") and not cfg["anthropic"]["api_key"]:
        cfg["anthropic"]["api_key"] = os.environ["ANTHROPIC_API_KEY"]
    return cfg


def save_config(cfg):
    with _config_lock:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)


def mask(key):
    if not key:
        return ""
    return key[:4] + "…" + key[-4:] if len(key) > 10 else "••••"


def public_config(cfg):
    out = json.loads(json.dumps(cfg))
    for p in ("openai", "anthropic"):
        out[p]["api_key_set"] = bool(cfg[p]["api_key"])
        out[p]["api_key"] = mask(cfg[p]["api_key"])
    out["github"]["token_set"] = bool(cfg["github"]["token"])
    out["github"]["token"] = mask(cfg["github"]["token"])
    out["samples"]["freesound_key_set"] = bool(cfg["samples"]["freesound_key"])
    out["samples"]["freesound_key"] = mask(cfg["samples"]["freesound_key"])
    return out


def llm_configured(cfg):
    if cfg["provider"] == "anthropic":
        return bool(cfg["anthropic"]["api_key"])
    # Un endpoint local (Ollama, LM Studio…) no necesita clave
    base = cfg["openai"]["base_url"]
    return bool(cfg["openai"]["api_key"]) or "localhost" in base or "127.0.0.1" in base


ENGINE = Engine(ROOT)
LIBRARY = Library(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, fmt, *args):  # menos ruido en la consola
        if "/api/status" not in (args[0] if args else ""):
            sys.stderr.write("[web] " + (fmt % args) + "\n")

    # ---------- utilidades ----------
    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def _local_only(self):
        # El estudio solo debe controlarse desde este ordenador
        host = self.client_address[0]
        if host not in ("127.0.0.1", "::1", "localhost") and not ARGS.allow_remote:
            self._json({"error": "Solo se permite acceso local"}, 403)
            return False
        return True

    # ---------- rutas ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            if not self._local_only():
                return
            if path == "/api/status":
                cfg = load_config()
                return self._json({
                    "os": platform.system(),
                    "engine": ENGINE.status(),
                    "llm_configured": llm_configured(cfg),
                    "provider": cfg["provider"],
                    "github_configured": github.configured(cfg),
                })
            if path == "/api/config":
                return self._json(public_config(load_config()))
            if path == "/api/samples":
                return self._json(LIBRARY.list())
            if path == "/api/samples/file":
                q = parse_qs(urlparse(self.path).query)
                try:
                    fp = LIBRARY.file_path(q.get("name", [""])[0], int(q.get("i", ["0"])[0]))
                except (SampleError, ValueError) as e:
                    return self._json({"error": str(e)}, 404)
                ext = os.path.splitext(fp)[1].lower()
                ctype = {".wav": "audio/wav", ".ogg": "audio/ogg", ".flac": "audio/flac"}.get(ext, "audio/aiff")
                with open(fp, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/log":
                return self._json({"log": ENGINE.log_tail(200)})
            return self._json({"error": "Ruta no encontrada"}, 404)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if not self._local_only():
            return
        if path == "/api/samples/upload":
            q = parse_qs(urlparse(self.path).query)
            length = int(self.headers.get("Content-Length") or 0)
            if length > 30 * 1024 * 1024:
                return self._json({"error": "El archivo es demasiado grande (máx. 30 MB)"}, 413)
            try:
                r = LIBRARY.add_file(q.get("name", [""])[0], q.get("filename", ["sample.wav"])[0], self.rfile.read(length),
                                     q.get("type", [None])[0] if q.get("type", [""])[0] in SAMPLE_TYPES else None)
            except SampleError as e:
                return self._json({"error": str(e)}, 400)
            r["loaded"] = ENGINE.reload_sample(os.path.join(LIBRARY.dir, r["name"]), r["name"])
            return self._json(r)
        data = self._body()
        try:
            if path == "/api/config":
                cfg = load_config()
                if data.get("provider") in ("openai", "anthropic"):
                    cfg["provider"] = data["provider"]
                for p in ("openai", "anthropic"):
                    for k, v in (data.get(p) or {}).items():
                        if k == "api_key" and (v is None or "…" in v or v == "••••"):
                            continue  # no sobrescribir con la versión enmascarada
                        if k in cfg[p]:
                            cfg[p][k] = v.strip() if isinstance(v, str) else v
                for k, v in (data.get("samples") or {}).items():
                    if k == "freesound_key" and (v is None or "…" in v or v == "••••"):
                        continue
                    if k in cfg["samples"] and isinstance(v, str):
                        cfg["samples"][k] = v.strip()
                for k, v in (data.get("github") or {}).items():
                    if k == "token" and (v is None or "…" in v or v == "••••"):
                        continue
                    if k in cfg["github"] and isinstance(v, str):
                        cfg["github"][k] = v.strip()
                if "temperature" in data:
                    cfg["temperature"] = float(data["temperature"])
                save_config(cfg)
                return self._json(public_config(cfg))

            if path == "/api/llm/test":
                cfg = load_config()
                text = chat_completion(cfg, "Responde solo con la palabra: listo", [
                    {"role": "user", "content": "¿Estás ahí?"}], max_tokens=20)
                return self._json({"ok": True, "reply": text.strip()[:200]})

            if path == "/api/chat":
                cfg = load_config()
                if not llm_configured(cfg):
                    return self._json({"error": "La IA no está configurada. Abre ⚙️ Ajustes."}, 400)
                system, messages = build_messages(data.get("messages") or [], data.get("session") or {})
                raw = chat_completion(cfg, with_lang(system, data.get("lang")), messages, max_tokens=1800)
                return self._json(parse_reply(raw))

            if path == "/api/explain":
                cfg = load_config()
                if not llm_configured(cfg):
                    return self._json({"error": "La IA no está configurada"}, 400)
                system, messages = build_explain(data.get("code", ""), data.get("name", ""))
                return self._json(parse_explain(chat_completion(cfg, with_lang(system, data.get("lang")), messages, max_tokens=1500)))

            if path == "/api/fix":
                cfg = load_config()
                if not llm_configured(cfg):
                    return self._json({"error": "La IA no está configurada"}, 400)
                system, messages = build_fix(data)
                raw = chat_completion(cfg, with_lang(system, data.get("lang")), messages, max_tokens=1500)
                return self._json(parse_fix(raw))

            if path == "/api/brainstorm":
                cfg = load_config()
                if not llm_configured(cfg):
                    return self._json({"error": "La IA no está configurada"}, 400)
                nxt = data.get("next")
                system, messages = build_brainstorm(data.get("answers"), nxt, data.get("session"))
                raw = chat_completion(cfg, with_lang(system, data.get("lang")), messages, max_tokens=600 if nxt else 2500)
                return self._json(parse_brainstorm(raw, final=not nxt))

            if path.startswith("/api/samples/"):
                cfg = load_config()
                act = path[len("/api/samples/"):]
                sc = cfg["samples"]
                try:
                    if act == "type":
                        LIBRARY.set_type(data.get("name"), data.get("type"))
                        return self._json(LIBRARY.list())
                    if act == "delete":
                        LIBRARY.delete(data.get("name"), data.get("index"))
                        name = data.get("name", "")
                        if data.get("index") is not None:
                            ENGINE.reload_sample(os.path.join(LIBRARY.dir, name), name)
                        else:
                            ENGINE.sc_eval(f"~dirt.freeSoundFiles([\\{safe_name(name)}]);")
                        return self._json(LIBRARY.list())
                    if act == "search":
                        return self._json(LIBRARY.freesound_search(sc["freesound_key"], data.get("query", ""), data.get("license", "libre"),
                                                                   data.get("oneshot", True), int(data.get("page") or 1), sc["freesound_api"]))
                    if act == "add":
                        r = LIBRARY.freesound_add(sc["freesound_key"], data.get("item") or {}, data.get("name"),
                                                  data.get("type") if data.get("type") in SAMPLE_TYPES else None, sc["freesound_api"])
                        r["loaded"] = ENGINE.reload_sample(os.path.join(LIBRARY.dir, r["name"]), r["name"])
                        return self._json(r)
                except SampleError as e:
                    return self._json({"error": str(e)}, 400)
                return self._json({"error": "Ruta no encontrada"}, 404)

            if path.startswith("/api/github/"):
                cfg = load_config()
                act = path[len("/api/github/"):]
                if act == "test":
                    return self._json(github.test(cfg))
                if not github.configured(cfg):
                    return self._json({"error": "GitHub isn't set up. Open Settings." if data.get("lang") == "en" else "GitHub no está configurado. Abre Ajustes."}, 400)
                if act == "create-repo":
                    return self._json(github.create_repo(cfg))
                if act == "save":
                    return self._json(github.save_song(cfg, data.get("project") or {}, data.get("message", ""), data.get("slug")))
                if act == "list":
                    return self._json({"songs": github.list_songs(cfg)})
                if act == "load":
                    return self._json(github.load_song(cfg, github.slugify(data.get("slug")), data.get("ref")))
                if act == "history":
                    return self._json({"commits": github.history(cfg, github.slugify(data.get("slug")))})
                return self._json({"error": "Ruta no encontrada"}, 404)

            if path == "/api/engine/start":
                return self._json(ENGINE.start())
            if path == "/api/engine/stop":
                ENGINE.stop()
                return self._json(ENGINE.status())
            if path == "/api/eval":
                return self._json(ENGINE.eval(data.get("code", "")))
            if path == "/api/hush":
                return self._json(ENGINE.eval("hush"))
            return self._json({"error": "Ruta no encontrada"}, 404)
        except LLMError as e:
            return self._json({"error": str(e)}, 502)
        except github.GitHubError as e:
            return self._json({"error": github.translate(str(e), data.get("lang")), "status": e.status}, 502)
        except Exception as e:
            return self._json({"error": f"{type(e).__name__}: {e}"}, 500)


def check():
    """Diagnóstico rápido: python server/app.py --check"""
    print(f"Sistema:      {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"Python:       {sys.version.split()[0]}")
    g = find_ghci()
    s = find_sclang()
    print(f"GHCi (Tidal): {g or 'NO encontrado'}")
    print(f"sclang (SC):  {s or 'NO encontrado'}")
    cfg = load_config()
    print(f"IA:           {cfg['provider']} -> {'configurada' if llm_configured(cfg) else 'sin configurar'}")
    if not g or not s:
        print("\nFalta algo: ejecuta el instalador (install.sh / install.bat). "
              "Mientras tanto el estudio funciona en modo simulación (sin sonido).")


def main():
    global ARGS
    ap = argparse.ArgumentParser(description="Tidal Studio")
    ap.add_argument("--port", type=int, default=int(os.environ.get("TIDAL_STUDIO_PORT", 8765)))
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--no-engine", action="store_true", help="No arrancar SuperCollider/Tidal automáticamente")
    ap.add_argument("--allow-remote", action="store_true", help="Permitir acceso desde otros equipos (no recomendado)")
    ap.add_argument("--check", action="store_true", help="Comprobar la instalación y salir")
    ARGS = ap.parse_args()

    if ARGS.check:
        check()
        return

    host = "0.0.0.0" if ARGS.allow_remote else "127.0.0.1"
    server = ThreadingHTTPServer((host, ARGS.port), Handler)
    url = f"http://localhost:{ARGS.port}"
    print(f"\n🎛  Tidal Studio listo en {url}\n   (Ctrl+C para salir)\n")
    if not ARGS.no_engine:
        threading.Thread(target=ENGINE.start, daemon=True).start()
    if not ARGS.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print("\nApagando…")
        ENGINE.stop()
        server.server_close()


ARGS = None

if __name__ == "__main__":
    main()
