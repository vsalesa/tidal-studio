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
import time
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import Engine, find_ghci, find_sclang  # noqa: E402
from timeline import TimelineQuery  # noqa: E402
from llm import chat_completion, LLMError, LLMTimeout, LLMCancelled, claude_cli  # noqa: E402
from assistant import (build_messages, parse_reply, build_explain, parse_explain,
                       build_brainstorm, parse_brainstorm, with_lang, build_fix, parse_fix,
                       variants_on, fetch_on, plan_on, plan_step)  # noqa: E402
import fetcher  # noqa: E402
import github  # noqa: E402
import skills as skillset  # noqa: E402
import plugins as pluginset  # noqa: E402
from assistant import _extract_json  # noqa: E402
import net  # noqa: E402
import llm as llmmod  # noqa: E402
import llmdiag  # noqa: E402
import shellenv  # noqa: E402
import files as tfiles  # noqa: E402
import ccdetect  # noqa: E402
import songimport  # noqa: E402
import audioimport  # noqa: E402
import loops  # noqa: E402
import instlib  # noqa: E402
import references  # noqa: E402
import engines as synthengines  # noqa: E402
import photos as instphotos  # noqa: E402
from samples import Library, SampleError, safe_name, pack_index, check_remote, TYPES as SAMPLE_TYPES  # noqa: E402

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
    # Claude Code (comando «claude») con la suscripción Pro/Max: sin clave de API
    "claudecode": {
        "path": "",                # vacío = buscar «claude» en el PATH
        "model": "",               # vacío = el modelo por defecto de tu plan (alias: opus, sonnet, haiku, fable)
        # auto = lo detectado en tu terminal · subscription = tu plan (como Claude Desktop, sin claves)
        # api = clave/endpoint propio (abajo, o los de tu terminal) · terminal = exactamente como en tu terminal
        "auth_mode": "auto",
        "base_url": "",            # solo modo api: ANTHROPIC_BASE_URL (vacío = el de tu terminal)
        "api_key": "",             # solo modo api: ANTHROPIC_API_KEY (vacío = la de tu terminal)
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
    # Skills de Maestro (carpetas con SKILL.md en skills/ y my-skills/)
    "skills": {
        "disabled": [],
        "pinned": [],
    },
    # Plugins de Claude Code instalados en my-plugins/ (sus skills y comandos los usa Maestro)
    "plugins": {
        "disabled": [],
        # «Usar siempre»: Maestro carga su skill principal en cada mensaje y prefiere sus skills
        "preferred": ["music-composition"],
        # Se descargan la primera vez que arranca (no van en el instalador: ver plugins.ensure_defaults)
        "defaults": ["https://github.com/vsalesa/music-composition-skills"],
        "defaults_done": [],
        # Al arrancar, buscar versiones nuevas de los plugins en GitHub e instalarlas solas
        "auto_update": True,
    },
    "temperature": 0.7,
    # Segundos que la IA puede pasar SIN mandar nada antes de darla por perdida (si va respondiendo, no se corta)
    "ai_timeout": 300,
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
    for p in ("openai", "anthropic", "claudecode"):
        out[p]["api_key_set"] = bool(cfg[p]["api_key"])
        out[p]["api_key"] = mask(cfg[p]["api_key"])
    out["github"]["token_set"] = bool(cfg["github"]["token"])
    out["github"]["token"] = mask(cfg["github"]["token"])
    out["samples"]["freesound_key_set"] = bool(cfg["samples"]["freesound_key"])
    out["samples"]["freesound_key"] = mask(cfg["samples"]["freesound_key"])
    return out


def llm_configured(cfg):
    if cfg["provider"] == "claudecode":
        return bool(claude_cli(cfg))
    if cfg["provider"] == "anthropic":
        return bool(cfg["anthropic"]["api_key"])
    # Un endpoint local (Ollama, LM Studio…) no necesita clave
    base = cfg["openai"]["base_url"]
    return bool(cfg["openai"]["api_key"]) or "localhost" in base or "127.0.0.1" in base


def with_skills(cfg, system, query, session):
    """Añade al prompt la lista de skills y el contenido de las que encajan con el mensaje."""
    text, sk = skills_text(cfg, query, session)
    return system + text, sk


def skills_text(cfg, query, session):
    """(texto de skills para el prompt, (activas, cargadas)) o ("", None). Va aparte del prompt fijo de Maestro
    para que la caché de prompts del proveedor reutilice la parte fija aunque cambien las skills."""
    extra = " ".join(str(x) for x in (session.get("step"), session.get("style")) if x)
    curso = session.get("curso") if isinstance(session.get("curso"), dict) else {}
    force = (str(curso["skill"]),) if curso.get("skill") else ()   # los cursos latinos se basan en una skill del plugin
    extra += " " + " ".join(f"{t.get('kind', '')} {t.get('name', '')}" for t in session.get("tracks") or [] if isinstance(t, dict))
    try:
        active, loaded, text = skillset.select(cfg, query or "", extra, force)
    except Exception as e:  # una skill rota no debe romper el chat
        print(f"[skills] {e}")
        return "", None
    if not active:
        return "", None
    return text, (active, loaded)


def skills_report(sk, raw):
    if not sk:
        return {"loaded": [], "used": [], "active": 0}
    active, loaded = sk
    data = _extract_json(raw) or {}
    # Solo cuentan las decisiones con skills cuyo contenido se cargó en este mensaje: si no, la regla sería inventada
    loaded_names = {x["name"] for x in loaded}
    decisions = skillset.decisions_from(data.get("decisiones") or data.get("decisions"),
                                        [s for s in active if s["name"] in loaded_names])
    used = skillset.used_from(data.get("skills"), active)
    for d in decisions:  # si decidió algo con una skill, la ha usado
        if d["skill"] not in used:
            used.append(d["skill"])
    return {"loaded": loaded, "used": used, "active": len(active), "decisions": decisions}


def install_any(cfg, url, names=None):
    """Un solo cuadro para instalar: enlace a una skill (carpeta con SKILL.md) o a un plugin / marketplace."""
    url = (url or "").strip()
    is_skill_link = bool(skillset.GH_RE.match(url) or skillset.RAW_RE.match(url))
    if url.rstrip("/").endswith("SKILL.md") or skillset.RAW_RE.match(url):
        return {"kind": "skill", **skillset.install(url, cfg["github"].get("token", ""))}
    try:
        return {"kind": "plugin", **pluginset.install(url, names)}
    except pluginset.PluginError as e:
        if is_skill_link and "no parece un plugin" in str(e):
            return {"kind": "skill", **skillset.install(url, cfg["github"].get("token", ""))}
        raise


DEFAULT_PLUGINS = {"state": "idle", "installed": []}


# ------------------------------------------------------------------ razonamiento en directo
# Mientras Maestro piensa, el navegador pregunta cada medio segundo por /api/trace?id=… y enseña los
# pasos (skills cargadas, a quién pregunta…) y el razonamiento de la IA, si el proveedor lo da.
TRACES = {}
_traces_lock = threading.Lock()


def fetch_samples(cfg, reply, sess, tr):
    """Maestro ha pedido sonidos de internet: se buscan y, si son pequeños, se descargan ya."""
    def log(name, q):
        tr.add("step", tr.L(f"Busco en internet un sonido para «{name}»: {q}", f"Searching the internet for a «{name}» sound: {q}"))
    auto = sess.get("descargas", True) != "preguntar"
    items = fetcher.resolve(LIBRARY, ENGINE, cfg, reply["descargar"], auto=auto, log=log)
    for it in items:
        c = (it.get("candidatos") or [{}])[0]
        msg = {"descargado": tr.L(f"Descargado «{it['nombre']}» de {c.get('pack_name') or 'Freesound'} ({c.get('license_name')}) y cargado en SuperDirt",
                                  f"Downloaded «{it['nombre']}» from {c.get('pack_name') or 'Freesound'} ({c.get('license_name')}) and loaded it into SuperDirt"),
               "permiso": tr.L(f"«{it['nombre']}» es grande ({c.get('files')} archivos): te pido permiso antes de descargarlo",
                               f"«{it['nombre']}» is big ({c.get('files')} files): asking you before downloading it"),
               "nada": tr.L(f"No encuentro «{it['busqueda']}» con licencia libre", f"Couldn't find «{it['busqueda']}» with a free license"),
               "ya": tr.L(f"«{it['nombre']}» ya está en tu biblioteca", f"«{it['nombre']}» is already in your library"),
               "error": tr.L(f"No he podido descargar «{it['nombre']}»: {it.get('error')}", f"Couldn't download «{it['nombre']}»: {it.get('error')}")}
        tr.add("step", msg.get(it.get("estado"), ""))
    fetcher.apply_fallbacks(reply, items)
    return items


class Trace:
    def __init__(self, tid, lang):
        import time as _t
        self.id, self.es = tid, not str(lang or "es").startswith("en")
        self.t0 = _t.time()
        self.events = []  # [{"kind": "step"|"thinking", "text": …, "t": segundos}]
        self.done = False
        self.cancel = threading.Event()  # el alumno pulsó Cancelar
        if tid:
            with _traces_lock:
                for k in [k for k, v in TRACES.items() if self.t0 - v.t0 > 900]:
                    TRACES.pop(k, None)
                TRACES[tid] = self

    def L(self, es, en):
        return es if self.es else en

    def add(self, kind, text):
        import time as _t
        if not self.id or not text:
            return
        with _traces_lock:
            if kind == "thinking" and self.events and self.events[-1]["kind"] == "thinking":
                self.events[-1]["text"] = (self.events[-1]["text"] + text)[-20000:]
            else:
                self.events.append({"kind": kind, "text": str(text)[:20000], "t": round(_t.time() - self.t0, 1)})

    def finish(self):
        self.done = True

    def public(self):
        import time as _t
        with _traces_lock:
            return {"events": [dict(e) for e in self.events], "done": self.done, "seconds": round(_t.time() - self.t0, 1)}


def provider_label(cfg):
    p = cfg.get("provider")
    if p == "claudecode":
        return "Claude Code" + (f" ({(cfg.get('claudecode') or {}).get('model')})" if (cfg.get("claudecode") or {}).get("model") else "")
    if p == "anthropic":
        return f"Claude ({cfg['anthropic'].get('model', '')})"
    return f"{cfg['openai'].get('model', '')} ({cfg['openai'].get('base_url', '')})"


def install_default_plugins():
    """Primer arranque: descarga los plugins por defecto (el de composición musical) en my-plugins/."""
    cfg = load_config()
    pending = [u for u in cfg["plugins"].get("defaults") or [] if u not in (cfg["plugins"].get("defaults_done") or [])]
    if not pending:
        return
    DEFAULT_PLUGINS["state"] = "installing"
    print("[plugins] Descargando los plugins por defecto / downloading default plugins…")
    try:
        got = pluginset.ensure_defaults(cfg)
        fresh = load_config()  # por si cambiaste algo mientras tanto
        fresh["plugins"]["defaults_done"] = cfg["plugins"]["defaults_done"]
        save_config(fresh)
        DEFAULT_PLUGINS.update(state="done", installed=got)
        if got:
            print(f"[plugins] Instalado / installed: {', '.join(got)}")
    except Exception as e:  # sin red, sin git…: se reintenta en el próximo arranque
        DEFAULT_PLUGINS["state"] = "error"
        print(f"[plugins] {e}")


PLUGIN_UPDATES = {"state": "idle", "updated": [], "checked_at": 0}


def update_plugins_on_start():
    """Al arrancar: primero los plugins por defecto (si faltan) y luego, buscar versiones nuevas."""
    install_default_plugins()
    cfg = load_config()
    pluginset.GITHUB_TOKEN = ((cfg.get("github") or {}).get("token") or "").strip()
    if not os.path.isdir(pluginset.PLUGIN_DIR):
        return
    PLUGIN_UPDATES["state"] = "checking"
    try:
        got = pluginset.auto_update(cfg)
        PLUGIN_UPDATES.update(state="done", updated=got, checked_at=int(time.time()))
        if got:
            print(f"[plugins] Actualizado / updated: {', '.join(got)}")
    except Exception as e:  # sin red: lo intentará en el próximo arranque
        PLUGIN_UPDATES["state"] = "error"
        print(f"[plugins] {e}")


ENGINE = Engine(ROOT)
TIMELINE = TimelineQuery(ROOT)
llmmod.LOGGER = lambda line: ENGINE._add("ia", line)
LIBRARY = Library(ROOT)
LIBRARY.on_add = lambda name, fname, info: loops.maybe_analyse(LIBRARY, name, fname, info)
INSTLIB = instlib.InstLib(LIBRARY, ENGINE)
PHOTOS = instphotos.Photos(LIBRARY.dir)


def instrument_listing():
    """La biblioteca de instrumentos tal y como la ve la interfaz (con los motores y Surge XT si están)."""
    try:
        sounds = (ENGINE.sound_list() or {}).get("sounds") or []
    except Exception:  # noqa: BLE001
        sounds = []
    st = synthengines.status(sounds)
    out = INSTLIB.listing({"mi": {"ready": st["mi"]["installed"]}, "surge": {"ready": st["surge"]["ready"]},
                           "vital": {"ready": st["vital"]["ready"]}})
    active = {v.get("name") for v in synthengines.vst_list(LIBRARY.dir)}
    extra = synthengines.surge_items() if st["surge"]["installed"] else []
    for it in extra:
        out["items"].append({**{k: it.get(k) for k in ("id", "cat", "es", "en", "src", "photo", "group", "tags", "voice", "sound", "extra")},
                             "kind": "engine", "engine": "surge", "installed": it["id"] in active, "program": True})
    for it in out["items"]:
        if it["kind"] == "engine" and it["id"] in ("surge", "vital"):
            it["installed"] = it["id"] in active
    for c in out["categories"]:
        c["n"] = sum(1 for i in out["items"] if i["cat"] == c["id"])
    out["engines"] = st
    out["photos"] = PHOTOS.meta()   # fotos de Wikimedia que has elegido tú (sustituyen a la de la categoría)
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        # La web (html, js, css) no se guarda en la caché del navegador: tras actualizar Tidal Studio
        # basta con recargar la página para ver lo nuevo (Safari guardaba los módulos .js viejos).
        if not self.path.startswith("/api/") and not self.path.startswith("/img/"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

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

    def _same_origin(self):
        # Leer y escribir archivos del ordenador: solo desde la propia web del estudio (ninguna otra
        # página abierta en el navegador puede pedirlo) y con JSON (que obliga al navegador a preguntar antes)
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).hostname not in ("127.0.0.1", "localhost", "::1"):
            return False
        if origin and urlparse(origin).port != self.server.server_address[1]:
            return False
        return "application/json" in (self.headers.get("Content-Type") or "")

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        u = urlparse(origin)
        return u.hostname in ("127.0.0.1", "localhost", "::1") and u.port == self.server.server_address[1]

    def _err(self, msg, lang, status=400):
        es, _, en = str(msg).partition("|")
        return self._json({"error": en if lang == "en" and en else es}, status)

    def _import(self, path):
        """Importar una canción: MIDI (al momento) o audio (en segundo plano, con herramientas opcionales)."""
        q = parse_qs(urlparse(self.path).query)
        arg = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
        lang = arg("lang", "es")
        if path in ("/api/import/midi", "/api/import/audio"):
            if not self._origin_ok():
                return self._json({"error": "forbidden"}, 403)
            length = int(self.headers.get("Content-Length") or 0)
            if length > audioimport.MAX_AUDIO:
                return self._err("El archivo es demasiado grande|The file is too big", lang, 413)
            raw = self.rfile.read(length)
            try:
                if path == "/api/import/midi":
                    start = arg("start")
                    return self._json(songimport.analyse(raw, lang, int(start) if start.isdigit() else None,
                                                         int(arg("bars", "4") or 4), arg("name")))
                return self._json(audioimport.start_job(arg("filename", "song.mp3"), raw))
            except (songimport.ImportError_, ValueError) as e:
                return self._err(e, lang)
            except Exception as e:  # noqa: BLE001  un MIDI raro no debe tumbar el estudio
                return self._err(f"No he podido leer el archivo: {e}|Couldn't read the file: {e}", lang)
        if path == "/api/import/audio/install":
            if not self._same_origin():
                return self._json({"error": "forbidden"}, 403)
            self._body()
            return self._json(audioimport.install())
        return self._json({"error": "not found"}, 404)

    def _instrument_upload(self):
        """Añadir tus instrumentos: SoundFont (.sf2), .zip con un SFZ o con grabaciones por nota, o audio suelto."""
        if not self._origin_ok():
            return self._json({"error": "forbidden"}, 403)
        q = parse_qs(urlparse(self.path).query)
        arg = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
        length = int(self.headers.get("Content-Length") or 0)
        if length > 400 * 1024 * 1024:
            return self._err("El archivo es demasiado grande (máx. 400 MB)|The file is too big (max. 400 MB)", arg("lang"), 413)
        raw = self.rfile.read(length)
        try:
            return self._json(INSTLIB.upload(arg("filename"), raw, arg("name") or None, arg("root") or None))
        except SampleError as e:
            return self._err(e, arg("lang"))
        except Exception as e:  # noqa: BLE001  un archivo raro no debe tumbar el estudio
            return self._err(f"No he podido leer el archivo: {e}|Couldn't read the file: {e}", arg("lang"))

    def _loops(self, path):
        """Loops largos: cargador (archivos sueltos o zip), análisis y correcciones."""
        if not self._origin_ok():
            return self._json({"error": "forbidden"}, 403)
        q = parse_qs(urlparse(self.path).query)
        arg = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
        lang = arg("lang", "es")
        try:
            bpm = float(arg("bpm", "120") or 120)
        except ValueError:
            bpm = 120
        try:
            if path in ("/api/loops/upload", "/api/loops/zip", "/api/loops/pcm"):
                length = int(self.headers.get("Content-Length") or 0)
                if length > loops.MAX_UPLOAD:
                    return self._err("El archivo es demasiado grande|The file is too big", lang, 413)
                raw = self.rfile.read(length)
                if path == "/api/loops/pcm":
                    meta = loops.analyse_pcm(LIBRARY, safe_name(arg("name")), int(arg("i", "0") or 0), raw,
                                             float(arg("sr", str(loops.SR))), float(arg("dur", "0") or 0))
                    return self._json({"meta": {k: v for k, v in meta.items() if k != "wave"}})
                if path == "/api/loops/upload":
                    added = [loops.import_file(LIBRARY, arg("filename", "loop.wav"), raw, arg("name"), arg("folder"))]
                else:
                    added = loops.import_zip(LIBRARY, raw, arg("folder"))
                for nm in {a["name"] for a in added if a.get("name")}:
                    ENGINE.reload_sample(os.path.join(LIBRARY.dir, nm), nm)
                return self._json({"added": added, **loops.listing(LIBRARY, bpm)})
            data = self._body()
            if path == "/api/loops/scan":
                n = loops.scan(LIBRARY)
                return self._json({"analysed": n, **loops.listing(LIBRARY, bpm)})
            if path == "/api/loops/edit":
                loops.edit(LIBRARY, safe_name(data.get("name")), int(data.get("index") or 0), data)
                return self._json(loops.listing(LIBRARY, bpm))
        except (SampleError, ValueError) as e:
            return self._err(e, lang)
        return self._json({"error": "not found"}, 404)

    # ---------- rutas ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            if not self._local_only():
                return
            if path == "/api/import/audio/status":
                return self._json(audioimport.status())
            if path == "/api/import/audio/job":
                job = audioimport.get_job(parse_qs(urlparse(self.path).query).get("id", [""])[0])
                if not job:
                    return self._json({"error": "not found"}, 404)
                out = audioimport.job_public(job)
                if job["state"] == "done" and job["midi"]:
                    import base64
                    out["midi"] = base64.b64encode(job["midi"]).decode()
                return self._json(out)
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
            if path == "/api/loops":
                q = parse_qs(urlparse(self.path).query)
                try:
                    bpm = float(q.get("bpm", ["120"])[0])
                except ValueError:
                    bpm = 120
                return self._json(loops.listing(LIBRARY, bpm))
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
            if path == "/api/samples/remote":
                # Escuchar un sample remoto (GitHub/Freesound) a través del servidor
                q = parse_qs(urlparse(self.path).query)
                url = q.get("url", [""])[0]
                try:
                    check_remote(url)
                    import urllib.request as _u
                    with net.urlopen(_u.Request(url, headers={"User-Agent": "tidal-studio"}), timeout=20) as r:
                        body = r.read(25 * 1024 * 1024)
                except Exception as e:
                    return self._json({"error": str(e)}, 502)
                ext = os.path.splitext(urlparse(url).path)[1].lower()
                self.send_response(200)
                self.send_header("Content-Type", {".wav": "audio/wav", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".flac": "audio/flac"}.get(ext, "application/octet-stream"))
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=3600")
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/recordings":
                d = os.path.join(ROOT, "recordings")
                files = sorted((f for f in os.listdir(d) if f.endswith(".wav")), reverse=True) if os.path.isdir(d) else []
                return self._json({"folder": d, "files": [{"name": f, "size": os.path.getsize(os.path.join(d, f))} for f in files[:30]]})
            if path == "/api/recordings/file":
                name = os.path.basename(parse_qs(urlparse(self.path).query).get("name", [""])[0])
                fp = os.path.join(ROOT, "recordings", name)
                if not name.endswith(".wav") or not os.path.isfile(fp):
                    return self._json({"error": "No existe esa grabación"}, 404)
                with open(fp, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Disposition", f'attachment; filename="{name}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/events":
                q = parse_qs(urlparse(self.path).query)
                try:
                    since = int(q.get("since", ["0"])[0])
                except ValueError:
                    since = 0
                return self._json(ENGINE.events_since(since))
            if path == "/api/sounds":
                return self._json(ENGINE.sound_list())
            if path == "/api/instruments":
                return self._json(instrument_listing())
            if path == "/api/instruments/photo":
                q = parse_qs(urlparse(self.path).query)
                try:
                    body = PHOTOS.read(q.get("id", [""])[0])
                except SampleError as e:
                    return self._json({"error": str(e)}, 404)
                self.send_response(200)
                self.send_header("Content-Type", "image/png" if body[:4] == b"\x89PNG" else "image/jpeg")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=86400")
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/instruments/job":
                q = parse_qs(urlparse(self.path).query)
                job = instlib.InstLib.job(q.get("id", [""])[0])
                return self._json(job or {"state": "unknown"})
            if path == "/api/instruments/sample":
                # Escuchar un instrumento (instalado o no): la grabación más cercana a la nota pedida
                q = parse_qs(urlparse(self.path).query)
                try:
                    body, mime, root = INSTLIB.preview(q.get("id", [""])[0], int(q.get("midi", ["60"])[0] or 60))
                except (SampleError, ValueError) as e:
                    return self._json({"error": str(e)}, 404)
                except Exception as e:  # noqa: BLE001  sin red…
                    return self._json({"error": str(e)}, 502)
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("X-Root-Midi", "" if root is None else str(root))
                self.send_header("Cache-Control", "max-age=3600")
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/log":
                return self._json({"log": ENGINE.log_tail(200)})
            if path == "/api/skills":
                cfg = load_config()
                return self._json({"skills": skillset.public(skillset.scan(cfg)), "folder": skillset.USER_DIR,
                                   "plugins": pluginset.public(pluginset.scan(cfg)), "plugin_folder": pluginset.PLUGIN_DIR,
                                   "default_plugins": DEFAULT_PLUGINS["state"],
                                   "plugin_updates": PLUGIN_UPDATES,
                                   "plugins_auto_update": bool(cfg.get("plugins", {}).get("auto_update", True))})
            if path == "/api/trace":
                q = parse_qs(urlparse(self.path).query)
                with _traces_lock:
                    tr = TRACES.get(q.get("id", [""])[0])
                return self._json(tr.public() if tr else {"events": [], "done": False, "seconds": 0})
            if path == "/api/skills/body":
                q = parse_qs(urlparse(self.path).query)
                try:
                    return self._json(skillset.body_of(load_config(), q.get("name", [""])[0]))
                except skillset.SkillError as e:
                    return self._json({"error": str(e)}, 404)
            return self._json({"error": "Ruta no encontrada"}, 404)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if not self._local_only():
            return
        if path == "/api/shutdown":
            # Lo usan los lanzadores de Windows y Linux al cerrar la ventana (con un token secreto,
            # para que ninguna web pueda apagar el estudio).
            token = os.environ.get("TIDAL_STUDIO_SHUTDOWN_TOKEN")
            if not token or self.headers.get("X-Shutdown-Token") != token:
                return self._json({"error": "forbidden"}, 403)
            self._json({"ok": True})
            threading.Thread(target=SERVER.shutdown, daemon=True).start()
            return
        if path.startswith("/api/import/"):
            return self._import(path)
        if path == "/api/instruments/upload":
            return self._instrument_upload()
        if path.startswith("/api/loops/"):
            return self._loops(path)
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
                if data.get("provider") in ("openai", "anthropic", "claudecode"):
                    cfg["provider"] = data["provider"]
                for p in ("openai", "anthropic", "claudecode"):
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
                if "ai_timeout" in data:
                    cfg["ai_timeout"] = max(30, min(1800, int(float(data["ai_timeout"]))))
                save_config(cfg)
                return self._json(public_config(cfg))

            if path == "/api/llm/test":
                cfg = load_config()
                text = chat_completion(cfg, "Responde solo con la palabra: listo", [
                    {"role": "user", "content": "¿Estás ahí?"}], max_tokens=20)
                return self._json({"ok": True, "reply": text.strip()[:200]})

            if path == "/api/llm/detect":
                return self._json(ccdetect.get(load_config(), bool(data.get("refresh"))))

            if path == "/api/llm/diagnose":
                return self._json(llmdiag.diagnose(load_config(), data.get("lang", "es")))

            if path == "/api/llm/models":
                cfg = load_config()
                if cfg["provider"] != "claudecode":
                    return self._json(llmdiag.diagnose_api(cfg, data.get("lang", "es")))
                return self._json(llmdiag.test_models(cfg, data.get("lang", "es")))

            if path == "/api/chat/cancel":
                # Cancelar lo que se ha mandado al chat: corta la llamada a la IA en curso (mata `claude`,
                # deja de leer el streaming) y no se aplica ni descarga nada
                with _traces_lock:
                    tr = TRACES.get(str(data.get("trace") or ""))
                if tr:
                    tr.cancel.set()
                    tr.add("step", tr.L("Cancelado por ti", "Cancelled by you"))
                return self._json({"ok": bool(tr)})

            if path == "/api/chat":
                cfg = load_config()
                if not llm_configured(cfg):
                    return self._json({"error": "La IA no está configurada. Abre ⚙️ Ajustes."}, 400)
                msgs = data.get("messages") or []
                command = None
                last_user = next((m for m in reversed(msgs) if isinstance(m, dict) and m.get("role") == "user"), None)
                if last_user and str(last_user.get("content", "")).lstrip().startswith("/"):
                    # /comando de un plugin: se cambia por su texto antes de enviarlo a la IA
                    expanded, command = pluginset.expand_command(cfg, str(last_user.get("content", "")))
                    if command:
                        msgs = [dict(m, content=expanded) if m is last_user else m for m in msgs]
                tr = Trace(str(data.get("trace") or "")[:64], data.get("lang"))
                sess = data.get("session") or {}
                tracks = [t for t in sess.get("tracks") or [] if isinstance(t, dict)]
                tr.add("step", tr.L(f"Leo tu mensaje y tu canción: {len(tracks)} pistas, {sess.get('bpm') or '?'} bpm",
                                    f"Reading your message and your song: {len(tracks)} tracks, {sess.get('bpm') or '?'} bpm"))
                if command:
                    tr.add("step", tr.L(f"Comando /{command['plugin']}:{command['command']} → uso su texto como petición",
                                        f"Command /{command['plugin']}:{command['command']} → using its text as the request"))
                try:
                    sess["loops_lines"] = loops.for_maestro(LIBRARY, float(sess.get("bpm") or 120))
                    if sess["loops_lines"]:
                        tr.add("step", tr.L(f"Tienes {len(sess['loops_lines'])} loops largos analizados: se los paso con su tempo y su código",
                                            f"You have {len(sess['loops_lines'])} analysed long loops: passing them on with their tempo and code"))
                except Exception:  # noqa: BLE001
                    sess["loops_lines"] = []
                last = next((m.get("content", "") for m in reversed(msgs) if m.get("role") == "user"), "")
                try:
                    sess["instrument_lines"] = instlib.maestro_lines(INSTLIB, last)
                except Exception:  # noqa: BLE001
                    sess["instrument_lines"] = []
                ps = plan_step(sess)
                if ps:
                    tr.add("step", tr.L(f"Plan «{ps.get('titulo', '')}» · paso {int(ps.get('i') or 0) + 1} de {len(ps['pasos'])}",
                                        f"Plan «{ps.get('titulo', '')}» · step {int(ps.get('i') or 0) + 1} of {len(ps['pasos'])}"))
                system, messages = build_messages(msgs, sess)
                # En los pasos de un plan, las skills se eligen con la petición original: son las mismas en cada paso,
                # así el prompt no cambia y el proveedor lo reutiliza de su caché (más rápido y sin repetir trabajo)
                skill_query = str(ps.get("peticion") or last) if ps else last
                stext, sk = skills_text(cfg, skill_query, sess)
                system = [with_lang(system, data.get("lang")), stext]
                if sk:
                    active, loaded = sk
                    names = [x["name"] + (f" (+{', '.join(r.split('/')[-1] for r in x['refs'])})" if x["refs"] else "")
                             + (tr.L(" · siempre", " · always") if x.get("pinned") else "") for x in loaded]
                    tr.add("step", tr.L(f"Elijo skills entre {len(active)}: ", f"Picking skills out of {len(active)}: ")
                           + (", ".join(names) if names else tr.L("ninguna encaja", "none match")))
                tr.add("step", tr.L(f"Pregunto a {provider_label(cfg)}…", f"Asking {provider_label(cfg)}…"))
                def _ev(kind, text):
                    if kind == "cache":
                        tr.add("step", tr.L(f"Reutilizo {text} tokens de instrucciones y skills que ya tenía en caché",
                                            f"Reusing {text} tokens of instructions and skills already cached"))
                    else:
                        tr.add(kind, text)
                llmmod.set_cancel(tr.cancel)
                try:
                    try:
                        raw = chat_completion(cfg, system, messages,
                                              max_tokens=1800 if ps else (3500 if variants_on(sess) or plan_on(sess) else 1800),
                                              on_event=_ev if tr.id else None)
                    except LLMTimeout as e:
                        # Demasiado grande para una sola respuesta: se propone hacerlo por pasos (o reintentar solo este paso)
                        tr.add("step", tr.L("La IA ha tardado demasiado", "The AI took too long"))
                        return self._json({"error": str(e), "timeout": True, "plan_paso": bool(ps),
                                           "seconds": tr.public()["seconds"]}, 504)
                    except LLMCancelled:
                        return self._json({"error": "Cancelado", "cancelled": True}, 409)
                    if tr.cancel.is_set():  # canceló justo cuando llegaba la respuesta: no se descarga nada
                        return self._json({"error": "Cancelado", "cancelled": True}, 409)
                    tr.add("step", tr.L("Respuesta recibida: aplico los cambios", "Answer received: applying the changes"))
                    reply = parse_reply(raw)
                    if reply.get("descargar") and fetch_on(sess):
                        reply["descargas"] = fetch_samples(cfg, reply, sess, tr)
                    loops.fix_reply(LIBRARY, reply, float(sess.get("bpm") or 120))
                    # Instrumentos de la biblioteca que usa Maestro: los pequeños se descargan ya
                    def _ilog(item):
                        name = tr.L(item["es"], item["en"])
                        tr.add("step", {"descargado": tr.L(f"Descargo el instrumento «{name}» ({item['mb']} MB) de la biblioteca", f"Downloading the «{name}» instrument ({item['mb']} MB) from the library"),
                                        "permiso": tr.L(f"«{name}» pesa {item['mb']} MB: te pido permiso antes de descargarlo", f"«{name}» is {item['mb']} MB: asking before downloading it"),
                                        "error": tr.L(f"No he podido descargar «{name}»: {item.get('error')}", f"Couldn't download «{name}»: {item.get('error')}")}.get(item["estado"], ""))
                    try:
                        inst_items = instlib.auto_install(INSTLIB, reply, _ilog)
                    except Exception:  # noqa: BLE001
                        inst_items = []
                    if inst_items:
                        reply["instrumentos"] = inst_items
                finally:
                    llmmod.set_cancel(None)
                    tr.finish()
                return self._json({**reply, "skills": skills_report(sk, raw),
                                   **({"command": command} if command else {}),
                                   **({"trace": tr.public()} if tr.id else {})})

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
                system, sk = with_skills(cfg, system, f"{data.get('wish') or ''} {data.get('code') or ''}", {})
                raw = chat_completion(cfg, with_lang(system, data.get("lang")), messages, max_tokens=1500)
                return self._json({**parse_fix(raw), "skills": skills_report(sk, raw)})

            if path == "/api/brainstorm":
                cfg = load_config()
                if not llm_configured(cfg):
                    return self._json({"error": "La IA no está configurada"}, 400)
                nxt = data.get("next")
                system, messages = build_brainstorm(data.get("answers"), nxt, data.get("session"))
                sk = None
                if not nxt:
                    answers = " ".join(str(a.get("respuesta", "")) for a in data.get("answers") or [] if isinstance(a, dict))
                    system, sk = with_skills(cfg, system, answers, data.get("session") or {})
                raw = chat_completion(cfg, with_lang(system, data.get("lang")), messages, max_tokens=600 if nxt else 2500)
                out = parse_brainstorm(raw, final=not nxt)
                if sk:
                    out["skills"] = skills_report(sk, raw)
                return self._json(out)

            if path == "/api/courses/reference":
                # Un baterista real tocando el estilo del curso (Groove MIDI Dataset), convertido en pistas
                try:
                    bpm = data.get("bpm")
                    return self._json(references.example(ROOT, data.get("ref") or {}, data.get("lang") or "es",
                                                         float(bpm) if bpm else None))
                except references.RefError as e:
                    return self._err(e, data.get("lang") or "es")

            if path.startswith("/api/instruments/") or path.startswith("/api/engines/"):
                try:
                    if path == "/api/instruments/install":
                        iid = str(data.get("id") or "")
                        it = INSTLIB.get(iid) or next((x for x in synthengines.surge_items() if x["id"] == iid), None)
                        if not it:
                            return self._json({"error": "Instrumento desconocido"}, 404)
                        if it["kind"] == "engine" and it.get("engine") in ("surge", "vital"):
                            return self._json(synthengines.vst_activate(LIBRARY.dir, ENGINE, it["sound"], it["engine"], it.get("program", "")))
                        if it["kind"] in ("synth", "engine"):
                            return self._json({"id": iid, "ready": True})
                        return self._json(INSTLIB.start_job("install", lambda prog: INSTLIB.install(iid, prog)))
                    if path == "/api/instruments/ensure":
                        # Los cursos (y lo que se escuche antes) descargan los instrumentos que usa su código
                        codes = [str(c) for c in (data.get("codes") or [])][:60]
                        if not INSTLIB.missing_in(codes):
                            return self._json({"ready": True, "installed": [], "failed": []})
                        return self._json(INSTLIB.start_job("ensure", lambda prog: INSTLIB.ensure(codes, prog)))
                    if path == "/api/instruments/remove":
                        iid = str(data.get("id") or "")
                        if iid.startswith("surge") or iid == "vital":
                            return self._json(synthengines.vst_deactivate(LIBRARY.dir, iid))
                        return self._json(INSTLIB.remove(iid))
                    if path == "/api/instruments/photos":
                        return self._json({"photos": instphotos.search(str(data.get("q") or ""))})
                    if path == "/api/instruments/photo":
                        return self._json(PHOTOS.save(data.get("id"), data.get("pick")))
                    if path == "/api/instruments/photo-remove":
                        return self._json(PHOTOS.remove(data.get("id")))
                    if path == "/api/instruments/sf2":
                        return self._json(INSTLIB.start_job("sf2", lambda prog: INSTLIB.import_sf2(data.get("file", ""), data.get("presets") or [], prog)))
                    if path == "/api/engines/install":
                        eid = str(data.get("id") or "")
                        return self._json(INSTLIB.start_job("engine", lambda prog: synthengines.install(eid)))
                    if path == "/api/engines/editor":
                        return self._json({"ok": ENGINE.sc_cmd("vsteditor", str(data.get("name") or "vital"))})
                except (SampleError, synthengines.EngineError) as e:
                    return self._json({"error": str(e)}, 400)
                return self._json({"error": "Ruta no encontrada"}, 404)

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
                            ENGINE.free_sample(safe_name(name))
                        return self._json(LIBRARY.list())
                    if act == "pack":
                        return self._json(pack_index(data.get("url", "")))
                    if act == "pack-install":
                        r = LIBRARY.pack_install(data.get("url", ""), data.get("sound", ""), data.get("name"),
                                                 data.get("type") if data.get("type") in SAMPLE_TYPES else None)
                        r["loaded"] = ENGINE.reload_sample(os.path.join(LIBRARY.dir, safe_name(r["name"])), safe_name(r["name"]))
                        return self._json(r)
                    if act == "find":
                        # Buscar sin descargar (la guía sin IA y «buscar otro»)
                        return self._json({"descargas": fetcher.resolve(LIBRARY, ENGINE, cfg, [data], auto=bool(data.get("auto")))})
                    if act == "fetch":
                        return self._json(fetcher.install_choice(LIBRARY, ENGINE, cfg, data.get("name"), data.get("choice"), bool(data.get("replace"))))
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

            if path.startswith("/api/plugins/"):
                act = path[len("/api/plugins/"):]
                cfg = load_config()
                pl = cfg.setdefault("plugins", {})
                name = str(data.get("name") or "")
                try:
                    if act == "enable":
                        cur = set(pl.get("disabled") or [])
                        (cur.discard if data.get("on") else cur.add)(name)
                        pl["disabled"] = sorted(cur)
                        save_config(cfg)
                    elif act == "prefer":
                        cur = set(pl.get("preferred") or [])
                        (cur.add if data.get("on") else cur.discard)(name)
                        pl["preferred"] = sorted(cur)
                        save_config(cfg)
                    elif act == "install":
                        r = install_any(cfg, data.get("url"), data.get("names"))
                        return self._json({**r, "skills": skillset.public(skillset.scan(cfg)),
                                           "plugins": pluginset.public(pluginset.scan(cfg))})
                    elif act == "remove":
                        pluginset.remove(name)
                    elif act == "check":
                        pluginset.GITHUB_TOKEN = ((cfg.get("github") or {}).get("token") or "").strip()
                        if name:
                            pluginset.check_one(name)
                        else:
                            pluginset.check_all()
                        PLUGIN_UPDATES["checked_at"] = int(time.time())
                    elif act == "update":
                        names = [name] if name else [p["name"] for p in pluginset.scan(cfg) if (p["update"] or {}).get("available")]
                        done = []
                        for n in names:
                            pluginset.update(n)
                            done.append(n)
                        return self._json({"updated": done, "skills": skillset.public(skillset.scan(cfg)),
                                           "plugins": pluginset.public(pluginset.scan(cfg))})
                    elif act == "autoupdate":
                        pl["auto_update"] = bool(data.get("on"))
                        save_config(cfg)
                    else:
                        return self._json({"error": "Ruta no encontrada"}, 404)
                except (pluginset.PluginError, skillset.SkillError) as e:
                    return self._json({"error": str(e)}, 400)
                return self._json({"skills": skillset.public(skillset.scan(cfg)),
                                   "plugins": pluginset.public(pluginset.scan(cfg))})

            if path.startswith("/api/skills/"):
                act = path[len("/api/skills/"):]
                cfg = load_config()
                sk = cfg.setdefault("skills", {})
                name = str(data.get("name") or "")
                try:
                    if act in ("enable", "pin"):
                        key = "disabled" if act == "enable" else "pinned"
                        cur = set(sk.get(key) or [])
                        on = bool(data.get("on"))
                        if (act == "enable") == on:
                            cur.discard(name)
                        else:
                            cur.add(name)
                        sk[key] = sorted(cur)
                        save_config(cfg)
                    elif act == "install":
                        r = skillset.install(data.get("url"), cfg["github"].get("token", ""))
                        return self._json({**r, "skills": skillset.public(skillset.scan(cfg))})
                    elif act == "remove":
                        skillset.remove(cfg, name)
                    else:
                        return self._json({"error": "Ruta no encontrada"}, 404)
                except skillset.SkillError as e:
                    return self._json({"error": str(e)}, 400)
                return self._json({"skills": skillset.public(skillset.scan(cfg))})

            if path == "/api/record/start":
                d = os.path.join(ROOT, "recordings")
                os.makedirs(d, exist_ok=True)
                import time as _t
                name = github.slugify(data.get("name") or "cancion") + _t.strftime("-%Y%m%d-%H%M%S") + ".wav"
                if not ENGINE.record_start(os.path.join(d, name)):
                    return self._json({"error": "Para grabar hace falta el motor de sonido (SuperCollider) en marcha."
                                       if data.get("lang") != "en" else "Recording needs the sound engine (SuperCollider) running."}, 400)
                return self._json({"ok": True, "name": name, "folder": d})
            if path == "/api/record/stop":
                ENGINE.record_stop()
                return self._json({"ok": True})

            if path == "/api/engine/start":
                return self._json(ENGINE.start())
            if path == "/api/engine/stop":
                ENGINE.stop()
                return self._json(ENGINE.status())
            if path.startswith("/api/file/"):
                if not self._same_origin():
                    return self._json({"error": "forbidden"}, 403)
                lang = data.get("lang")
                try:
                    if path == "/api/file/info":
                        return self._json(tfiles.info())
                    if path == "/api/file/dialog":
                        return self._json(tfiles.dialog(data.get("mode", "open"), data.get("name", ""), data.get("dir", ""), data.get("title", "")))
                    if path == "/api/file/read":
                        return self._json(tfiles.read(data.get("path")))
                    if path == "/api/file/write":
                        return self._json(tfiles.write(data.get("path"), data.get("content", ""), bool(data.get("overwrite", True))))
                except (tfiles.FileError, OSError) as e:
                    msg = str(e) if isinstance(e, tfiles.FileError) else f"{e.strerror or e}|{e.strerror or e}"
                    es, _, en = msg.partition("|")
                    return self._json({"error": en if lang == "en" and en else es}, 400)
            if path == "/api/eval":
                return self._json(ENGINE.eval(data.get("code", "")))
            if path == "/api/timeline":
                return self._json(TIMELINE.query(data.get("tracks") or [], data.get("from", 0), data.get("to", 4)))
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
    lang = os.environ.get("TIDAL_STUDIO_LANG") or os.environ.get("LC_ALL") or os.environ.get("LANG") or "en"
    es = lang.lower().startswith("es")
    t = (lambda a, b: a if es else b)
    g = find_ghci()
    s = find_sclang()
    cfg = load_config()
    print(f"{t('Sistema', 'System'):14}{platform.system()} {platform.release()} ({platform.machine()})")
    print(f"{'Python:':14}{sys.version.split()[0]}")
    print(f"{'GHCi (Tidal):':14}{g or t('NO encontrado', 'NOT found')}")
    print(f"{'sclang (SC):':14}{s or t('NO encontrado', 'NOT found')}")
    ok = llm_configured(cfg)
    print(f"{t('IA:', 'AI:'):14}{cfg['provider']} -> {t('configurada', 'configured') if ok else t('sin configurar', 'not configured')}")
    if not g or not s:
        print("\n" + t("Falta algo: ejecuta el instalador (install.sh / install.bat). "
                       "Mientras tanto el estudio funciona en modo simulación (sin sonido).",
                       "Something is missing: run the installer (install.sh / install.bat). "
                       "Meanwhile the studio runs in simulation mode (no sound)."))


def _studio_running(port):
    """True si en ese puerto responde un Tidal Studio (p. ej. abierto en otra ventana)."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=2) as r:
            return r.status == 200 and b"{" in r.read(200)
    except Exception:
        return False


def _write_port_file(port):
    if ARGS.port_file:
        tmp = ARGS.port_file + ".tmp"
        with open(tmp, "w") as f:
            f.write(str(port))
        os.replace(tmp, ARGS.port_file)


def _graceful_signals():
    """SIGINT/SIGTERM apagan el estudio ordenadamente (la app de Mac los usa al salir).
    Con TIDAL_STUDIO_WATCH_PARENT=1 (app de Mac) el servidor y todo lo que arranca (sclang, scsynth,
    ghci) van en su propio grupo de procesos, y si la app muere sin avisar el servidor se apaga solo."""
    import signal

    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    if os.environ.get("TIDAL_STUDIO_WATCH_PARENT") == "1" and hasattr(os, "setpgrp"):
        try:
            os.setpgrp()
        except OSError:
            pass
        parent = os.getppid()

        def watch():
            while os.getppid() == parent:
                time.sleep(2)
            print("[server] La app se ha cerrado: apago el estudio / app closed, shutting down")
            os.kill(os.getpid(), signal.SIGTERM)
        threading.Thread(target=watch, daemon=True).start()


def _kill_group():
    """Al salir desde la app de Mac, no dejar vivo nada de lo que arrancamos (p. ej. scsynth)."""
    if os.environ.get("TIDAL_STUDIO_WATCH_PARENT") != "1" or not hasattr(os, "killpg"):
        return
    import signal
    try:
        if os.getpgrp() == os.getpid():
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            os.killpg(os.getpid(), signal.SIGTERM)
    except OSError:
        pass


SERVER = None


def main():
    global ARGS, SERVER
    ap = argparse.ArgumentParser(description="Tidal Studio")
    ap.add_argument("--port", type=int, default=int(os.environ.get("TIDAL_STUDIO_PORT", 8765)))
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--insecure-ssl", action="store_true",
                    help="No comprobar certificados SSL en las descargas (último recurso; ver server/net.py)")
    ap.add_argument("--no-engine", action="store_true", help="No arrancar SuperCollider/Tidal automáticamente")
    ap.add_argument("--allow-remote", action="store_true", help="Permitir acceso desde otros equipos (no recomendado)")
    ap.add_argument("--check", action="store_true", help="Comprobar la instalación y salir")
    ap.add_argument("--port-file", help="Escribir aquí el puerto en uso (lo usa la app de Mac)")
    ARGS = ap.parse_args()
    if ARGS.insecure_ssl:
        net.FORCE_INSECURE = True

    shellenv.start()
    if not ARGS.check:
        ccdetect.start(load_config)
    if ARGS.check:
        shellenv.wait(12)
        check()
        return

    host = "0.0.0.0" if ARGS.allow_remote else "127.0.0.1"
    port = ARGS.port
    server = None
    for port in range(ARGS.port, ARGS.port + 10):
        try:
            server = ThreadingHTTPServer((host, port), Handler)
            break
        except OSError:
            # ¿Ya hay un Tidal Studio abierto en este puerto? Entonces solo abrimos el navegador.
            if _studio_running(port):
                url = f"http://localhost:{port}"
                _write_port_file(port)
                print(f"\n🎛  Tidal Studio ya estaba abierto / is already running: {url}\n")
                if not ARGS.no_browser:
                    webbrowser.open(url)
                return
            print(f"[server] Puerto {port} ocupado por otro programa, pruebo el siguiente / port busy, trying the next one")
    if server is None:
        print(f"No hay puertos libres entre {ARGS.port} y {ARGS.port + 9} / no free port. Usa --port.")
        sys.exit(1)
    SERVER = server
    url = f"http://localhost:{port}"
    print(f"\n🎛  Tidal Studio listo en {url}\n   (Ctrl+C para salir)\n")
    _graceful_signals()
    _write_port_file(port)
    try:   # instrumentos WAV de antes de la 0.9: se suben de nivel antes de que SuperDirt los cargue
        lv = INSTLIB.level_old()
        if lv:
            print(f"[instrumentos] nivel corregido: {', '.join(lv)}")
    except Exception as e:  # noqa: BLE001
        print(f"[instrumentos] {e}")
    if not ARGS.no_engine:
        threading.Thread(target=ENGINE.start, daemon=True).start()
    threading.Thread(target=update_plugins_on_start, daemon=True).start()
    if not ARGS.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        ENGINE.start_event_listener()
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print("\nApagando…", flush=True)
        import faulthandler
        faulthandler.dump_traceback_later(8, exit=True)  # never hang on the way out (prints where it was stuck)
        ENGINE.stop()
        TIMELINE.close()
        server.server_close()
        _kill_group()
        print("[server] stopped / parado", flush=True)


ARGS = None

if __name__ == "__main__":
    main()
