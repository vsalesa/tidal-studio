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
import re
import sys
import threading
import time
from xml.etree.ElementTree import ParseError as ET_ParseError
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import Engine, find_ghci, find_sclang  # noqa: E402
from timeline import TimelineQuery  # noqa: E402
from llm import chat_completion, LLMError, LLMTimeout, LLMCancelled, claude_cli  # noqa: E402
from assistant import (build_messages, DETAIL_LEVELS, parse_reply, build_explain, parse_explain,
                       build_brainstorm, parse_brainstorm, with_lang, build_fix, parse_fix,
                       variants_on, fetch_on, plan_on, plan_step)  # noqa: E402
import fetcher  # noqa: E402
import github  # noqa: E402
import skills as skillset  # noqa: E402
import knowledge_store as kstore  # noqa: E402
import plugins as pluginset  # noqa: E402
from assistant import _extract_json  # noqa: E402
import net  # noqa: E402
import llm as llmmod  # noqa: E402
import llmdiag  # noqa: E402
import shellenv  # noqa: E402
import files as tfiles  # noqa: E402
import ccdetect  # noqa: E402
import songimport  # noqa: E402
import midigen  # noqa: E402
import midilive  # noqa: E402
import library as soundlib  # noqa: E402
import instcatalog  # noqa: E402
import audioimport  # noqa: E402
import loops  # noqa: E402
import appupdate  # noqa: E402
import instlib  # noqa: E402
import references  # noqa: E402
import inventory  # noqa: E402
import router  # noqa: E402
import songindex  # noqa: E402
import score as scoremod  # noqa: E402
import soundlab  # noqa: E402
import recipes as recipemod  # noqa: E402
import critic  # noqa: E402
import clamp  # noqa: E402
import memory as memorymod  # noqa: E402
import stylesave  # noqa: E402
import storage  # noqa: E402
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
        # 0.21: que el Maestro no cargue TUS skills, plugins, hooks ni CLAUDE.md globales de Claude Code
        # auto = --safe-mode y --disable-slash-commands si tu versión de claude los tiene · safe_mode · disable_cli_skills · off
        "skill_isolation": "auto",
        # Esfuerzo de razonamiento de `claude -p` (--effort): low = piensa menos y contesta antes y más corto.
        # "" = el de tu Claude Code. Si tu versión de claude no tiene --effort, se ignora.
        "effort": "low",
    },
    "github": {
        "token": "",
        "repo": "",                # "usuario/repositorio"
        "branch": "main",
        "folder": "songs",
        "api_url": "https://api.github.com",
        "create_new": False,       # las canciones nuevas se crean directamente en GitHub
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
    # Versiones nuevas de la propia app (GitHub Releases): avisar al arrancar y cada 12 h
    "updates": {
        "auto_check": True,
        "skipped": "",             # versión que elegiste saltarte
    },
    # Salida de audio de SuperCollider ("" = la del sistema). Se elige en el aviso de audio de la web.
    "audio": {
        "out": "",
    },
    "temperature": 0.7,
    # Segundos que la IA puede pasar SIN mandar nada antes de darla por perdida (si va respondiendo, no se corta)
    "ai_timeout": 300,
    "language": "es",
    # Maestro v2: enrutador por capas (ver server/router.py y la ventana Monitor RAG)
    "router": json.loads(json.dumps(router.DEFAULT)),
    # Maestro v2, 0.16: sonidos que aprenden (crítico opcional, frecuencia de preguntas, CLaMP 3, packs comprados)
    "soundlab": {"critic": False, "questions": "sometimes", "detail": "short", "clamp_auto": True, "clamp_min": 10, "packs": []},
    # Maestro v2, 0.18: memoria (aprobar sola lo muy claro, apuntar lo que dices en el chat, aprender de tus
    # elecciones de oído) y copia automática en GitHub de lo aprobado (memorias, estilos y casos)
    "memory": {"auto_approve": True, "observe_chat": True, "learn_picks": True, "backup": True, "backup_folder": "tidal-studio"},
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
        active, loaded, text = skillset.select(cfg, query or "", extra, force, genre=str(session.get("style") or ""))
        meta = dict(skillset.last_meta())
        # Para el monitor: cuánto habría ocupado cargarlas enteras (como hasta la 0.19)
        whole = len(skillset.select(cfg, query or "", extra, force, mode="whole")[2]) if active and skill_mode(cfg) != "whole" else len(text)
    except Exception as e:  # una skill rota no debe romper el chat
        print(f"[skills] {e}")
        return "", None
    if not active:
        return "", None
    return text, (active, loaded, whole, meta)


def skill_mode(cfg):
    return skillset.mode_of(cfg)


def skills_report(sk, raw):
    if not sk:
        return {"loaded": [], "used": [], "active": 0}
    active, loaded = sk[0], sk[1]
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


def _score_reply(reply, sess):
    """La «partitura» que escribe Maestro se convierte en pistas de Tidal, y cada pista de melodía, acordes o bajo
    que sea una partitura lleva su parte para el cuaderno. Igual en las opciones y en los pasos de un plan."""
    tracks = [t for t in sess.get("tracks") or [] if isinstance(t, dict)]
    sc = sess.get("score") if isinstance(sess.get("score"), dict) else None

    def one(c):
        if not isinstance(c, dict):
            return
        if isinstance(c.get("partitura"), dict):
            try:
                new, pistas = scoremod.apply_partitura(sc, c["partitura"], tracks)
            except ValueError as e:
                c.setdefault("avisos", []).append(f"partitura: {e}")
                new, pistas = None, []
            if new:
                ids = {p["id"] for p in pistas}
                c["pistas"] = [p for p in (c.get("pistas") or []) if p.get("id") not in ids] + pistas
                c["score_meta"] = {"key": new["key"], "meter": new["meter"]}
            c.pop("partitura", None)
        scoremod.attach_parts(c.get("pistas"), (sc or {}).get("meter") or "4/4", sc)

    one(reply.get("cambios"))
    for v in reply.get("variantes") or []:
        one(v.get("cambios") if isinstance(v, dict) else None)


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


def app_update_loop():
    """Busca versiones nuevas de Tidal Studio al arrancar (tras 20 s) y luego cada 12 horas."""
    time.sleep(20)
    while True:
        try:
            cfg = load_config()
            appupdate.GITHUB_TOKEN = ((cfg.get("github") or {}).get("token") or "").strip()
            r = appupdate.maybe_check(cfg, cfg.get("language") or "es")
            if r and r.get("state") in ("available", "ready"):
                print(f"[update] Tidal Studio {r.get('latest')} disponible / available")
        except Exception as e:  # noqa: BLE001
            print(f"[update] {e}")
        time.sleep(1800)


ENGINE = Engine(ROOT)
# Teclado MIDI (piano USB): las notas llegan de SuperCollider por OSC o de la web. Ver midilive.py
MIDI = midilive.MidiHub(ENGINE)
ENGINE.midi_handler = MIDI.on_osc
ENGINE.on_ready.append(MIDI.on_engine_ready)
TIMELINE = TimelineQuery(ROOT)
llmmod.LOGGER = lambda line: ENGINE._add("ia", line)
LIBRARY = Library(ROOT)
LIBRARY.on_add = lambda name, fname, info: loops.maybe_analyse(LIBRARY, name, fname, info)
INSTLIB = instlib.InstLib(LIBRARY, ENGINE)
# Maestro v2: índice de canciones (copia de solo lectura), votos y monitor de capas. Se puede borrar: se rehace solo.
DATA_DIR = os.environ.get("TIDAL_STUDIO_DATA") or os.path.join(ROOT, "maestro-data")
try:
    SONGS = songindex.SongIndex(os.path.join(DATA_DIR, "maestro.db"))
except Exception as _e:  # noqa: BLE001  sin disco escribible el estudio sigue funcionando
    print(f"[maestro-data] {_e}")
    SONGS = None
MONITOR = router.Monitor()
# 0.16: medidas de sonido, elecciones y recetas (maestro-data/sounds.db). Los packs comprados se marcan «solo local».
try:
    SOUNDS = soundlab.Store(os.path.join(DATA_DIR, "sounds.db"))
except Exception as _e:  # noqa: BLE001
    print(f"[maestro-data] {_e}")
    SOUNDS = None
ANALYZER = soundlab.Analyzer(SOUNDS, audioimport.tools_python) if SOUNDS else None
STEMS_DIR = os.path.join(os.path.dirname(audioimport.TOOLS), "stems")
# 0.21: índice de las skills (SQLite FTS5, se rehace solo desde los Markdown) y limpieza de skills incluidas que
# una versión nueva ya no trae (solo archivos de la app que no hayas tocado)
kstore.configure(os.path.join(DATA_DIR, "maestro-knowledge.sqlite"))
try:
    _gone = skillset.cleanup_managed(os.path.join(DATA_DIR, "managed-skills.json"))
    if _gone:
        print(f"[skills] archivos de skills que ya no vienen con la app, borrados: {', '.join(_gone)}")
except Exception as _e:  # noqa: BLE001
    print(f"[skills] {_e}")


def knowledge_status():
    """Estado del índice de skills para el panel y el monitor (sin rutas de tu disco más allá de la carpeta de datos)."""
    try:
        st = kstore.status()
    except Exception as e:  # noqa: BLE001
        return {"available": False, "error": str(e)}
    st.pop("path", None)
    st["mode"] = skill_mode(load_config())
    return st


def index_skills_on_start():
    """Indexa las skills en segundo plano al arrancar (sin red; si no hay FTS5, Maestro usa la búsqueda de la 0.20)."""
    try:
        r = skillset.ensure_index(load_config())
        if r and r.get("changed"):
            print(f"[skills] índice: {r['changed']} archivo(s), {r['sections']} secciones en {r['seconds']} s")
    except Exception as e:  # noqa: BLE001
        print(f"[skills] índice: {e}")


# 0.18: memoria con ámbitos, registro que se deshace, «Mis estilos» y casos musicales (maestro-data/memory.db)
try:
    MEMORY = memorymod.Store(os.path.join(DATA_DIR, "memory.db"))
except Exception as _e:  # noqa: BLE001
    print(f"[maestro-data] {_e}")
    MEMORY = None
PHOTOS = instphotos.Photos(LIBRARY.dir)


def memory_cfg(cfg=None):
    m = dict(DEFAULT_CONFIG["memory"])
    m.update((cfg or load_config()).get("memory") or {})
    return m


_backup = {"timer": None, "state": "idle", "last": None, "error": "", "commit_url": "", "retries": 0, "next_retry": None,
           "pulled": 0, "pushed": 0, "deleted": 0, "remote_bad": []}
_backup_lock = threading.Lock()
_sync_lock = threading.Lock()
RETRY_DELAYS = (60, 300, 900, 1800)   # si falla la sincronización: 1 min, 5 min, 15 min y 30 min


def _sync_folder(mc):
    return re.sub(r"[^\w./-]", "", str(mc.get("backup_folder") or "tidal-studio")).strip("/") or "tidal-studio"


def sync_compare():
    """Sin cambiar nada: qué hay en GitHub, qué hay aquí y qué haría la sincronización con cada cosa."""
    cfg = load_config()
    mc = memory_cfg(cfg)
    if not (MEMORY and github.configured(cfg)):
        return {"skipped": True}
    folder = _sync_folder(mc)
    remote, bad = MEMORY.parse_remote(github.read_folder(cfg, folder), folder)
    plan = MEMORY.sync_plan(remote)
    counts = {}
    for p_ in plan:
        counts[p_["action"]] = counts.get(p_["action"], 0) + 1
    return {"plan": [{k: v for k, v in p_.items() if k != "path"} for p_ in plan], "counts": counts, "remote_bad": bad,
            "folder": folder, "repo": github.where(cfg).get("repo")}


def backup_now():
    """Sincroniza con GitHub en los dos sentidos: trae lo nuevo de allí (otro ordenador, una instalación nueva), sube lo
    aprobado de aquí y borra allí lo que borraste aquí. Nunca la bandeja, ni votos ni audiciones. Si falla, lo reintenta."""
    cfg = load_config()
    mc = memory_cfg(cfg)
    if not (MEMORY and mc.get("backup") and github.configured(cfg)):
        return {"skipped": True}
    with _backup_lock:
        _backup["state"] = "running"
    try:
        with _sync_lock:
            folder = _sync_folder(mc)
            remote, bad = MEMORY.parse_remote(github.read_folder(cfg, folder), folder)
            plan = MEMORY.sync_plan(remote)
            pulled = MEMORY.apply_pull(plan, remote)
            files, delete, hashes = MEMORY.sync_files(folder, remote)
            r = github.commit_files(cfg, files, delete=delete,
                                    message="Sincronizo la memoria y los estilos de Maestro (Tidal Studio)")
            MEMORY.mark_synced(hashes)
        pushed = sum(1 for p_ in plan if p_["action"] in ("push", "both"))
        with _backup_lock:
            _backup.update(state="done", last=time.time(), error="", retries=0, next_retry=None, pulled=pulled, pushed=pushed,
                           deleted=len([p_ for p_ in plan if p_["action"] == "delete_remote"]), remote_bad=bad,
                           commit_url=r.get("commit_url") or _backup["commit_url"])
        return {**r, "pulled": pulled, "pushed": pushed}
    except Exception as e:  # noqa: BLE001
        with _backup_lock:
            n = _backup["retries"]
            _backup.update(state="error", error=str(e), retries=n + 1)
            if n < len(RETRY_DELAYS):
                _backup["next_retry"] = time.time() + RETRY_DELAYS[n]
            else:
                _backup["next_retry"] = None
        if n < len(RETRY_DELAYS):
            schedule_backup(RETRY_DELAYS[n], retry=True)
        return {"error": str(e)}


def schedule_backup(delay=20, retry=False):
    """Tras un cambio aprobado, espera un poco (por si hay más) y hace UNA sincronización."""
    with _backup_lock:
        if not retry:
            _backup["retries"] = 0
            _backup["next_retry"] = None
        if _backup["timer"]:
            _backup["timer"].cancel()
        t = threading.Timer(delay, backup_now)
        t.daemon = True
        _backup["timer"] = t
        t.start()


if MEMORY:
    MEMORY.on_change = schedule_backup


def learn_picks(cfg=None):
    mc = memory_cfg(cfg)
    if not (MEMORY and SOUNDS and mc.get("learn_picks")):
        return []
    return MEMORY.learn_from_choices(SOUNDS.choice_rows(), auto_approve=bool(mc.get("auto_approve")))


def memory_ctx(sess):
    curso = sess.get("curso") if isinstance(sess.get("curso"), dict) else {}
    cid = str(curso.get("id") or "")
    return {"song_id": str(sess.get("song_id") or ""), "course": cid,
            "genre": memorymod.genre_of(cid, sess.get("style"), [curso.get("nombre")])}


def storage_paths():
    return {"root": ROOT, "lib_dir": LIBRARY.dir, "data_dir": DATA_DIR, "tools": audioimport.TOOLS, "stems": STEMS_DIR}


def storage_counts():
    out = {}
    try:
        st = SONGS.stats() if SONGS else {}
        out["songs"] = st.get("songs", 0)
        out["index_bytes"] = SONGS.index_bytes() if SONGS else 0
    except Exception:  # noqa: BLE001
        pass
    try:
        out["features"] = sum((SOUNDS.stats().get("features") or {}).values()) if SOUNDS else 0
        out["features_bytes"] = SOUNDS.features_bytes() if SOUNDS else 0
    except Exception:  # noqa: BLE001
        pass
    return out


def library_items():
    """La librería única (server/library.py): incluidos, biblioteca de instrumentos, tuyos, loops y tu teclado."""
    try:
        loaded = set((ENGINE.sound_list() or {}).get("sounds") or [])
    except Exception:  # noqa: BLE001
        loaded = set()
    try:
        lps = loops.listing(LIBRARY)["loops"]
    except Exception:  # noqa: BLE001
        lps = []
    items = soundlib.build(LIBRARY, INSTLIB, lps, loaded)
    # 0.16: cuatro estados por sonido (catálogo → descargado → cargado → suena)
    _, missing, ok = sound_states()
    for e in items:
        e["state"] = soundlab.state_of(e, loaded, missing, ok)
    return items


def sound_states():
    """(cargados en SuperDirt, los que dijo que no encuentra, si el motor suena) para los 4 estados."""
    try:
        sl = ENGINE.sound_list() or {}
        st = ENGINE.status()
    except Exception:  # noqa: BLE001
        return set(), set(), False
    ok = bool(st.get("superdirt_ready") and st.get("tidal_running")) or bool(st.get("simulation"))
    return set(sl.get("sounds") or []), set(sl.get("missing") or []), ok


def soundlab_cfg(cfg=None):
    sc = dict(DEFAULT_CONFIG["soundlab"])
    sc.update((cfg or load_config()).get("soundlab") or {})
    return sc


def song_counts():
    """Canciones por género en el índice (para activar CLaMP 3 por género)."""
    if not SONGS:
        return {}
    with SONGS.lock:
        rows = SONGS.db.execute("SELECT style, COUNT(*) n FROM songs GROUP BY style").fetchall()
    return {r["style"]: r["n"] for r in rows if r["style"]}


def not_playable(tracks):
    """Sonidos que usa la canción y que ahora no suenan (en el catálogo o descargados, sin cargar)."""
    loaded, missing, ok = sound_states()
    if not loaded:
        return []
    items = library_items()
    out = []
    for snd in sorted({w for t in tracks for w in songindex.sounds_of(t.get("code") or "")}):
        e = soundlib.find(items, snd)
        if e and soundlab.state_of(e, loaded, missing, ok) in ("catalog", "downloaded"):
            out.append(snd)
    return out


def critic_on(reply, sess, lang):
    """Si el crítico está encendido, cada opción lleva su nota (groove, armonía, forma) como pista."""
    tracks = [{"id": t.get("id"), "code": t.get("code"), "kind": t.get("kind"), "muted": t.get("muted")}
              for t in sess.get("tracks") or [] if isinstance(t, dict)]
    sc = sess.get("score") if isinstance(sess.get("score"), dict) else None
    for v in reply.get("variantes") or []:
        if isinstance(v, dict) and isinstance(v.get("cambios"), dict):
            v["critica"] = critic.judge(v["cambios"], tracks, sc, lang)


def apply_style_saves(reply, sess, en=False):
    """Lo que Maestro pide guardar en «Mis estilos» se guarda de verdad, y la confirmación la escribe la app.
    Si Maestro dice que ha guardado estilos sin pedirlo, se avisa de que no se ha guardado nada."""
    items = stylesave.parse_items(reply.pop("guardar_estilos", None))
    if items and MEMORY:
        opts = stylesave.recent_options(sess)
        genre = (sess.get("_memory_ctx") or memory_ctx(sess))["genre"]
        try:
            saved, errs = stylesave.save(MEMORY, sess, items, opts, genre)
        except Exception as e:  # noqa: BLE001
            saved, errs = [], [str(e)]
        reply["estilos_guardados"] = saved
        reply["mensaje"] = (str(reply.get("mensaje") or "").rstrip() + "\n\n" + stylesave.result_text(saved, errs, en)).strip()
    elif items or stylesave.claims_saved(reply.get("mensaje")):
        reply["mensaje"] = (str(reply.get("mensaje") or "").rstrip() + "\n\n" + stylesave.not_saved_text(en)).strip()
    return reply


def save_recipes(reply, lang):
    """Las recetas que combina Maestro van al recetario del alumno."""
    if not SOUNDS:
        return []
    mine = {r["id"]: r for r in SOUNDS.recipes()}
    saved = []
    for c in [reply.get("cambios")] + [v.get("cambios") for v in reply.get("variantes") or [] if isinstance(v, dict)]:
        for r in (c or {}).pop("recetas", None) or []:
            ids = [str(x) for x in r.get("de") or []][:2]
            src = [recipemod.BY_ID.get(i) or mine.get(i) for i in ids]
            if len(src) != 2 or not all(src):
                continue
            mode = {"capa": "layer", "mezcla": "blend", "intermedia": "morph"}.get(str(r.get("modo") or ""), str(r.get("modo") or "layer"))
            rec = recipemod.combine(src[0], src[1], mode)
            if r.get("nombre"):
                rec["name_es"] = rec["name_en"] = str(r["nombre"])[:60]
            rec["by"] = "maestro"
            saved.append(SOUNDS.save_recipe(rec))
    return saved


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

    def _chat(self, cfg, rcfg, req, data, msgs, sess):
        """Maestro con IA: capas 2-6 del enrutador (índice, biblioteca, skills, LLM, validación)."""
        command = None
        last_user = next((m for m in reversed(msgs) if isinstance(m, dict) and m.get("role") == "user"), None)
        if last_user and str(last_user.get("content", "")).lstrip().startswith("/"):
            # /comando de un plugin: se cambia por su texto antes de enviarlo a la IA
            expanded, command = pluginset.expand_command(cfg, str(last_user.get("content", "")))
            if command:
                msgs = [dict(m, content=expanded) if m is last_user else m for m in msgs]
        tr = Trace(str(data.get("trace") or "")[:64], data.get("lang"))
        tracks = [t for t in sess.get("tracks") or [] if isinstance(t, dict)]
        sess["max_opciones"] = rcfg["max_candidates"]
        last = next((m.get("content", "") for m in reversed(msgs) if m.get("role") == "user"), "")
        # Capa 2: pistas de OTRAS canciones tuyas relacionadas (índice SQLite, sin LLM)
        if rcfg["layers"]["index"] and rcfg["index_hits"]:
            req.begin("index")
            try:
                rel, n = router.index_context(SONGS, last, str(sess.get("song_id") or ""), rcfg["index_hits"])
            except Exception:  # noqa: BLE001
                rel, n = [], 0
            sess["canciones_relacionadas"] = rel
            req.end("index", "pass" if n else "skip", hits=n)
            if n:
                tr.add("step", tr.L(f"Busco en tus canciones: {n} pistas relacionadas", f"Searching your songs: {n} related tracks"))
        else:
            req.end("index", "off")
        req.begin("library")
        tr.add("step", tr.L(f"Leo tu mensaje y tu canción: {len(tracks)} pistas, {sess.get('bpm') or '?'} bpm",
                            f"Reading your message and your song: {len(tracks)} tracks, {sess.get('bpm') or '?'} bpm"))
        if command:
            tr.add("step", tr.L(f"Comando /{command['plugin']}:{command['command']} → uso su texto como petición",
                                f"Command /{command['plugin']}:{command['command']} → using its text as the request"))
        try:
            if not rcfg["layers"]["loops"]:
                raise RuntimeError("off")
            sess["loops_lines"] = loops.for_maestro(LIBRARY, float(sess.get("bpm") or 120))
            if sess["loops_lines"]:
                tr.add("step", tr.L(f"Tienes {len(sess['loops_lines'])} loops largos analizados: se los paso con su tempo y su código",
                                    f"You have {len(sess['loops_lines'])} analysed long loops: passing them on with their tempo and code"))
        except Exception:  # noqa: BLE001
            sess["loops_lines"] = []
        # Lo que hay de verdad en el ordenador, leído ahora (no la lista que la web guardó hace rato)
        inv = None
        try:
            if not rcfg["layers"]["library"]:
                raise RuntimeError("off")
            inv = inventory.summary(LIBRARY, INSTLIB, ENGINE, synthengines.status, synthengines.vst_list)
            sess["inventario"] = inventory.maestro_text(inv)
            sess["samples"] = [{"name": x["name"], "type": x["type"], "n": x["n"]} for x in inv["samples"]]
            nuevos = [x["name"] for x in inv["samples"] if x["nuevo"]] + [x["id"] for x in inv["instrumentos"] if x["nuevo"]]
            tr.add("step", tr.L(f"Miro tu biblioteca: {len(inv['samples'])} samples y {len(inv['instrumentos'])} instrumentos"
                                + (f" (nuevos: {', '.join(nuevos[:6])})" if nuevos else ""),
                                f"Checking your library: {len(inv['samples'])} samples and {len(inv['instrumentos'])} instruments"
                                + (f" (new: {', '.join(nuevos[:6])})" if nuevos else "")))
        except Exception:  # noqa: BLE001
            inv = None
        try:
            if not rcfg["layers"]["library"]:
                raise RuntimeError("off")
            sess["instrument_lines"] = instlib.maestro_lines(INSTLIB, last, with_mine=inv is None)
        except Exception:  # noqa: BLE001
            sess["instrument_lines"] = []
        if rcfg["layers"]["library"]:
            req.end("library", "pass", hits=(len(inv["samples"]) + len(inv["instrumentos"])) if inv else 0)
        else:
            req.end("library", "off")
        slc = soundlab_cfg(cfg)
        sess["preguntas"] = slc.get("questions") or "sometimes"
        sess["detalle"] = slc.get("detail") or "short"   # respuestas cortas (por defecto) o detalladas
        try:
            sess["recetas"] = recipemod.maestro_text(SOUNDS.recipes() if SOUNDS else [], data.get("lang") == "en")
            sess["no_suenan"] = not_playable(tracks)
        except Exception:  # noqa: BLE001
            sess["no_suenan"] = []
        if MEMORY:
            try:
                mctx = sess.get("_memory_ctx") or memory_ctx(sess)
                mems = MEMORY.relevant(mctx["song_id"], mctx["course"], mctx["genre"])
                cases = MEMORY.cases_for(last, mctx["genre"])
                est = sess.get("estilo") if isinstance(sess.get("estilo"), dict) else {}
                style = MEMORY.style(str(est.get("id") or "")) if est.get("id") else None
                sess["memoria"] = memorymod.maestro_text(mems, cases, style, str(est.get("modo") or ""))
                if mems or cases or style:
                    tr.add("step", tr.L(f"Recuerdo {len(mems)} cosa(s) tuya(s)" + (f" y {len(cases)} caso(s) parecido(s)" if cases else "")
                                        + (f"; estilo «{style['name']}»" if style else ""),
                                        f"Remembering {len(mems)} thing(s) about you" + (f" and {len(cases)} similar case(s)" if cases else "")
                                        + (f"; style «{style['name']}»" if style else "")))
                if sess.get("_noted"):
                    tr.add("step", tr.L(f"Apunto en tu memoria: «{sess['_noted'][0]['text'][:60]}»", f"Noting in your memory: «{sess['_noted'][0]['text'][:60]}»"))
            except Exception:  # noqa: BLE001
                sess["memoria"] = ""
        ps = plan_step(sess)
        if ps:
            tr.add("step", tr.L(f"Plan «{ps.get('titulo', '')}» · paso {int(ps.get('i') or 0) + 1} de {len(ps['pasos'])}",
                                f"Plan «{ps.get('titulo', '')}» · step {int(ps.get('i') or 0) + 1} of {len(ps['pasos'])}"))
        system, messages = build_messages(msgs, sess)
        # En los pasos de un plan, las skills se eligen con la petición original: son las mismas en cada paso,
        # así el prompt no cambia y el proveedor lo reutiliza de su caché (más rápido y sin repetir trabajo)
        skill_query = str(ps.get("peticion") or last) if ps else last
        req.begin("skills")
        if rcfg["layers"]["skills"]:
            stext, sk = skills_text(cfg, skill_query, sess)
            whole = sk[2] if sk else 0
            km = sk[3] if sk else {}
            req.end("skills", "pass" if sk and sk[1] else "skip", hits=len(sk[1]) if sk else 0,
                    chars=len(stext), whole_chars=whole if skill_mode(cfg) != "whole" else None,
                    sections=sum(x.get("sections") or 0 for x in sk[1]) if sk else 0,
                    parents=sum(x.get("parents") or 0 for x in sk[1]) if sk else 0,
                    tokens_est=km.get("tokens_est"), engine=km.get("engine"), fallback=km.get("fallback"),
                    generation=km.get("generation"),
                    trace=[{"skill": x["name"], **t} for x in sk[1] for t in x.get("trace") or []][:24] if sk else [],
                    note=skill_mode(cfg) + (" · " + str(km["fallback"])[:80] if km.get("fallback") else ""))
        else:
            stext, sk = "", None
            req.end("skills", "off")
        system = [with_lang(system, data.get("lang")), stext]
        if sk:
            active, loaded = sk[0], sk[1]
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
        llmmod.take_usage()
        req.begin("llm")
        try:
            try:
                auto_tokens = 1800 if ps else (3500 if variants_on(sess) or plan_on(sess) else 1800)
                raw = chat_completion(cfg, system, messages, max_tokens=rcfg["max_tokens"] or auto_tokens,
                                      on_event=_ev if tr.id else None)
                u = llmmod.take_usage()
                req.add_tokens("llm", u["in"], u["out"], u["cached"])
                req.end("llm", "hit", note=provider_label(cfg))
            except LLMTimeout as e:
                # Demasiado grande para una sola respuesta: se propone hacerlo por pasos (o reintentar solo este paso)
                tr.add("step", tr.L("La IA ha tardado demasiado", "The AI took too long"))
                return self._json({"error": str(e), "timeout": True, "plan_paso": bool(ps),
                                   "seconds": tr.public()["seconds"]}, 504)
            except LLMCancelled:
                return self._json({"error": "Cancelado", "cancelled": True}, 409)
            if tr.cancel.is_set():  # canceló justo cuando llegaba la respuesta: no se descarga nada
                return self._json({"error": "Cancelado", "cancelled": True}, 409)
            more = (_extract_json(raw) or {}).get("mas_skills") if sk and skill_mode(cfg) != "whole" else None
            if isinstance(more, list) and more:
                # Skills a la carta: Maestro pide una sección que no le mandé. Se la mando y pregunto otra vez (una sola vez).
                got, extra_text = skillset.sections_for(cfg, more)
                if extra_text:
                    tr.add("step", tr.L(f"Maestro pide {len(got)} sección(es) más de las skills: {', '.join(got)}",
                                        f"Maestro asks for {len(got)} more skill section(s): {', '.join(got)}"))
                    stext += extra_text
                    system = [system[0], stext]
                    req.end("skills", "pass", chars=len(stext), extra=len(got))
                    raw = chat_completion(cfg, system, messages, max_tokens=rcfg["max_tokens"] or auto_tokens,
                                          on_event=_ev if tr.id else None)
                    u = llmmod.take_usage()
                    req.add_tokens("llm", u["in"], u["out"], u["cached"])
                    for g in got:   # lo pedido cuenta como cargado (y se ve en el chat)
                        name, _, sec = g.partition(":")
                        cur = next((x for x in sk[1] if x["name"] == name), None)
                        if not cur:
                            cur = {"name": name, "refs": [], "sections": 0, "pinned": False, "score": 0}
                            sk[1].append(cur)
                        cur["sections"] = (cur.get("sections") or 0) + 1
                        cur["asked"] = cur.get("asked", []) + [sec]
            tr.add("step", tr.L("Respuesta recibida: aplico los cambios", "Answer received: applying the changes"))
            reply = parse_reply(raw)
            _score_reply(reply, sess)
            req.begin("validate")
            blocked = router.validate(reply, sess, rcfg["max_candidates"])
            req.end("validate", "blocked" if blocked else "pass", hits=len(blocked), note=", ".join(blocked) or None)
            if blocked:
                tr.add("step", tr.L(f"Candados: descarto lo que tocaba {', '.join(blocked)}", f"Locks: dropping what touched {', '.join(blocked)}"))
                reply["bloqueado"] = blocked
            if reply.get("descargar") and fetch_on(sess):
                reply["descargas"] = fetch_samples(cfg, reply, sess, tr)
            loops.fix_reply(LIBRARY, reply, float(sess.get("bpm") or 120))
            try:
                new_recipes = save_recipes(reply, data.get("lang"))
            except Exception:  # noqa: BLE001
                new_recipes = []
            if new_recipes:
                reply["recetas_nuevas"] = new_recipes
                tr.add("step", tr.L(f"Guardo {len(new_recipes)} receta(s) nueva(s) en tu recetario", f"Saving {len(new_recipes)} new recipe(s) to your recipe book"))
            if slc.get("critic") and reply.get("variantes"):
                critic_on(reply, sess, data.get("lang"))
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
        if sess.get("_noted"):
            reply["memoria_nueva"] = sess["_noted"]
        apply_style_saves(reply, sess, data.get("lang") == "en")
        return self._json({**reply, "skills": skills_report(sk, raw), "monitor": req.id,
                           **({"command": command} if command else {}),
                           **({"trace": tr.public()} if tr.id else {})})

    def _score(self, path, data):
        """Partitura (release 0.15): MusicXML de ida y vuelta y traducción entre partitura y Tidal."""
        lang = data.get("lang")
        try:
            if path == "/api/score/xml":
                sc = scoremod.normalize(data.get("score")) or scoremod.empty_score()
                return self._json({"xml": scoremod.to_musicxml(sc, str(data.get("title") or ""))})
            if path == "/api/score/parse":
                return self._json({"score": scoremod.to_json(scoremod.from_musicxml(str(data.get("xml") or "")))})
            if path == "/api/score/render":
                # Una partitura (p. ej. editada en MuseScore) → el código de cada pista que sale de ella
                sc = scoremod.normalize(data.get("score")) or scoremod.empty_score()
                return self._json({"tracks": [{"id": p["track"], "part": p["id"], "role": p["role"], "name": p["name"], "code": scoremod.part_to_tidal(p)}
                                              for p in sc["parts"] if p.get("track")]})
            if path == "/api/score/from-tidal":
                code = str(data.get("code") or "")
                bars = scoremod.tidal_to_bars(code, str(data.get("meter") or "4/4"))
                if bars is None:
                    return self._json({"bars": None})
                sound, fx = scoremod.fx_of(code)
                part = scoremod.new_part("x", "", "melodia", None, sound, bars, fx)
                return self._json({"bars": scoremod.part_json(part)["bars"], "sound": sound, "fx": fx})
        except (ValueError, ET_ParseError) as e:
            msg = str(e)
            return self._json({"error": msg if lang != "en" else f"Couldn't read the score: {msg}"}, 400)
        return self._json({"error": "Ruta no encontrada"}, 404)

    # ---------- 0.16: sonidos que aprenden ----------
    def _soundlab_status(self):
        cfg = load_config()
        slc = soundlab_cfg(cfg)
        items = library_items()
        loaded, missing, ok = sound_states()
        states = {k: 0 for k in soundlab.STATES}
        for e in items:
            if e["kind"] not in ("loop",):
                states[soundlab.state_of(e, loaded, missing, ok)] += 1
        return {"settings": slc, "sources": soundlab.sources(LIBRARY.dir, items, slc.get("packs"), STEMS_DIR),
                "job": ANALYZER.status() if ANALYZER else None, "stats": SOUNDS.stats() if SOUNDS else None,
                "states": states, "engine_ok": ok, "audio_tools": audioimport.status().get("ready", False),
                "clamp": clamp.status(audioimport.TOOLS, song_counts(), int(slc.get("clamp_min") or 10), bool(slc.get("clamp_auto"))),
                "recipes": {"builtin": recipemod.BUILTIN, "mine": SOUNDS.recipes() if SOUNDS else []}}

    # ------------------------------------------------------------ 0.18: memoria, estilos, casos y almacenamiento
    def _memory_status(self):
        cfg = load_config()
        with _backup_lock:
            bk = {k: v for k, v in _backup.items() if k != "timer"}
        return {"settings": memory_cfg(cfg), "memories": MEMORY.memories() if MEMORY else [], "stats": MEMORY.stats() if MEMORY else {},
                "sync": MEMORY.sync_states() if MEMORY else {},
                "cases": MEMORY.cases() if MEMORY else [], "github": github.configured(cfg), "github_where": github.where(cfg),
                "backup": bk, "styles_list": midigen.styles_list()}

    def _memory_get(self, path):
        if path == "/api/storage":
            return self._json(storage.scan(storage_paths(), storage_counts()))
        if not MEMORY:
            return self._json({"error": "Sin carpeta de datos|No data folder"}, 500)
        if path == "/api/memory":
            try:
                learn_picks()
            except Exception:  # noqa: BLE001
                pass
            return self._json(self._memory_status())
        if path == "/api/memory/log":
            return self._json({"log": MEMORY.log()})
        if path == "/api/memory/sync":
            try:
                r = sync_compare()
            except github.GitHubError as e:
                return self._json({"error": str(e)}, 502)
            if r.get("skipped"):
                return self._json({"error": "GitHub no está conectado|GitHub isn't connected"}, 400)
            return self._json(r)
        if path == "/api/styles":
            return self._json({"styles": MEMORY.styles(), "github": github.configured(load_config()), "genres": midigen.styles_list()})

    def _memory_post(self, path, data):
        lang = data.get("lang") or "es"
        if path == "/api/storage/delete":
            gid, item = str(data.get("id") or ""), (str(data["item"]) if data.get("item") else None)
            hooks = {"clear_index": lambda: SONGS and SONGS.clear_index(),
                     "clear_features": lambda: SOUNDS and SOUNDS.clear_features(),
                     "remove_instrument": INSTLIB.remove,
                     "remove_sound": lambda n: (LIBRARY.delete(n), ENGINE.free_sample(safe_name(n)) if hasattr(ENGINE, "free_sample") else None)}
            try:
                r = storage.delete(storage_paths(), gid, item, hooks)
            except KeyError:
                return self._err("No existe|Not found", lang, 404)
            except (ValueError, SampleError) as e:
                return self._err(str(e), lang)
            return self._json({**r, "storage": storage.scan(storage_paths(), storage_counts())})
        if not MEMORY:
            return self._err("Sin carpeta de datos|No data folder", lang, 500)
        cfg = load_config()
        mc = memory_cfg(cfg)
        try:
            if path == "/api/memory/settings":
                cur = cfg.get("memory") or {}
                for k in ("auto_approve", "observe_chat", "learn_picks", "backup"):
                    if k in data:
                        cur[k] = bool(data[k])
                cfg["memory"] = {**DEFAULT_CONFIG["memory"], **cur}
                save_config(cfg)
                return self._json(self._memory_status())
            if path == "/api/memory/add":
                MEMORY.add(data.get("text"), data.get("scope") or "global", data.get("scope_key") or "", source="manual", by="user")
            elif path == "/api/memory/status":
                MEMORY.set_status(int(data.get("id")), str(data.get("status")))
            elif path == "/api/memory/edit":
                MEMORY.edit(int(data.get("id")), data.get("text"), data.get("scope"), data.get("scope_key"))
            elif path == "/api/memory/delete":
                MEMORY.delete(int(data.get("id")))
            elif path == "/api/memory/revert":
                MEMORY.revert(int(data.get("log_id")))
                return self._json({**self._memory_status(), "log": MEMORY.log()})
            elif path == "/api/memory/backup":
                r = backup_now()
                if r.get("error"):
                    return self._err(r["error"], lang, 502)
                if r.get("skipped"):
                    return self._err("Conecta GitHub y activa la copia|Connect GitHub and turn the backup on", lang)
            elif path == "/api/memory/import":
                link = str(data.get("link") or "").strip()
                if not link:
                    return self._err("Pega el enlace de su repositorio|Paste the link to their repository", lang)
                files = github.fetch_memory(cfg, link)
                remote, bad = MEMORY.parse_remote(files, "tidal-studio")
                who = re.sub(r"^(?:https?://)?(?:www\.)?github\.com/", "", link).split("/")[0]
                got = MEMORY.import_shared(remote, who)
                return self._json({**self._memory_status(), "imported": got, "errors": bad[:5]})
            elif path == "/api/cases/add":
                MEMORY.add_case(data)
            elif path == "/api/cases/delete":
                MEMORY.delete_case(int(data.get("id")))
            elif path == "/api/styles/save":
                st = data.get("style") if isinstance(data.get("style"), dict) else memorymod.style_from_song(
                    data.get("song") or {}, data.get("name"), data.get("genre") or "", data.get("description") or "",
                    keep_literal=data.get("literal", True) is not False)
                return self._json({"style": MEMORY.save_style(st), "styles": MEMORY.styles()})
            elif path == "/api/styles/delete":
                MEMORY.delete_style(str(data.get("id")))
                return self._json({"styles": MEMORY.styles()})
            elif path == "/api/styles/transform":
                st = MEMORY.style(str(data.get("id")))
                if not st:
                    return self._err("No existe ese estilo|That style doesn't exist", lang, 404)
                ens = {str(k): str(v) for k, v in (data.get("ensemble") or {}).items() if v}
                return self._json(memorymod.transform(st, str(data.get("genre") or ""), data.get("bpm"), str(data.get("key") or ""),
                                                      ens, int(data.get("seed") or 1), lang))
            elif path == "/api/styles/literal":
                st = MEMORY.style(str(data.get("id")))
                if not st or not st.get("literal"):
                    return self._err("Este estilo no guarda una copia literal|This style keeps no literal copy", lang, 404)
                MEMORY.log_literal(st["id"], st.get("from_song", ""))
                return self._json({"bpm": st["bpm"], "tracks": st["literal"], "name": st["name"]})
            elif path == "/api/styles/share":
                st = MEMORY.style(str(data.get("id")))
                if not st:
                    return self._err("No existe ese estilo|That style doesn't exist", lang, 404)
                if not github.configured(cfg):
                    return self._err("Conecta GitHub en Ajustes para compartir|Connect GitHub in Settings to share", lang)
                fpath = f"styles/{st['id']}.json"
                body = json.dumps(memorymod.shareable(st, bool(data.get("literal"))), ensure_ascii=False, indent=2)
                r = github.commit_files(cfg, {fpath: body}, f"Comparto mi estilo «{st['name']}» (Tidal Studio)")
                return self._json({**r, "url": github.share_url(cfg, fpath), "path": fpath})
            elif path == "/api/styles/import":
                got, errs = [], []
                for fp, txt in github.fetch_shared(cfg, str(data.get("link") or "")):
                    try:
                        raw = json.loads(txt)
                        st = memorymod.validate_style(raw)
                        st.pop("id", None)
                        st["source"] = "imported"
                        st["url"] = str(data.get("link") or "")[:200]
                        got.append(MEMORY.save_style(st))
                    except (ValueError, TypeError) as e:
                        errs.append(f"{fp}: {str(e).split('|')[0]}")
                if not got:
                    return self._err("No he encontrado ningún estilo válido|No valid style found" + (": " + "; ".join(errs[:3]) if errs else ""), lang)
                return self._json({"imported": got, "errors": errs, "styles": MEMORY.styles()})
            else:
                return self._err("No existe|Not found", lang, 404)
        except KeyError:
            return self._err("No existe|Not found", lang, 404)
        except github.GitHubError as e:
            return self._err(str(e), lang, 502)
        except (ValueError, TypeError) as e:
            return self._err(str(e), lang)
        return self._json(self._memory_status())

    def _soundlab_get(self, path):
        q = parse_qs(urlparse(self.path).query)
        arg = lambda k: q.get(k, [""])[0]  # noqa: E731
        if path == "/api/soundlab":
            return self._json(self._soundlab_status())
        if path == "/api/recipes":
            mine = SOUNDS.recipes() if SOUNDS else []
            return self._json({"builtin": [dict(r, code=recipemod.code(r)) for r in recipemod.BUILTIN],
                               "mine": [dict(r, code=recipemod.code(r)) for r in mine]})
        # /api/sounds/rank?sound=&role=&style=&n=3: los mejores para elegir de oído, con su estado
        loaded, missing, ok = sound_states()
        r = soundlab.rank(library_items(), arg("sound"), SOUNDS, arg("role"), arg("style"), loaded, missing, ok,
                          int(arg("n") or 3), playable_only=arg("all") != "1")
        r["engine_ok"] = ok
        return self._json(r)

    def _soundlab_post(self, path, data):
        lang = data.get("lang")
        en = lang == "en"
        cfg = load_config()
        slc = soundlab_cfg(cfg)
        if path == "/api/soundlab/settings":
            for k in ("critic", "clamp_auto"):
                if isinstance(data.get(k), bool):
                    slc[k] = data[k]
            if data.get("questions") in ("never", "sometimes", "often"):
                slc["questions"] = data["questions"]
            if data.get("detail") in DETAIL_LEVELS:
                slc["detail"] = data["detail"]
            if data.get("clamp_min") is not None:
                slc["clamp_min"] = max(2, min(200, int(data["clamp_min"])))
            cfg["soundlab"] = slc
            save_config(cfg)
            return self._json(self._soundlab_status())
        if path == "/api/soundlab/packs":
            # Packs comprados: se analizan donde están (solo local, nunca se suben ni se exportan)
            if not self._same_origin():
                return self._json({"error": "forbidden"}, 403)
            packs = [p for p in slc.get("packs") or [] if isinstance(p, dict)]
            pth = os.path.abspath(os.path.expanduser(str(data.get("path") or "").strip()))
            if data.get("remove"):
                packs = [p for p in packs if p.get("path") != pth]
                if SOUNDS:
                    SOUNDS.forget_source("pack")
            else:
                if not os.path.isdir(pth):
                    return self._err("No encuentro esa carpeta|I can't find that folder", lang)
                if not any(p.get("path") == pth for p in packs):
                    packs.append({"path": pth, "name": str(data.get("name") or os.path.basename(pth))[:60]})
            slc["packs"] = packs
            cfg["soundlab"] = slc
            save_config(cfg)
            return self._json(self._soundlab_status())
        if path == "/api/soundlab/analyze":
            if not ANALYZER:
                return self._err("Sin carpeta de datos|No data folder", lang, 500)
            items = library_items()
            plan = []
            for src in data.get("sources") or []:
                plan += soundlab.targets(str(src), LIBRARY.dir, items, STEMS_DIR)
            return self._json(ANALYZER.start(plan))
        if path == "/api/soundlab/stop":
            if ANALYZER:
                ANALYZER.stop()
            return self._json({"ok": True})
        if path == "/api/sounds/check":
            # 0.17: ¿suenan ya los sonidos de un curso? Para cada uno, su estado y si se puede bajar con licencia libre
            want = [str(s) for s in (data.get("sounds") or [])][:80]
            items = library_items()
            by = {}
            for e in items:
                by.setdefault(e.get("sound"), e)
            out = []
            for s in want:
                e = by.get(s)
                if e:
                    out.append({"sound": s, "state": e.get("state"), "name": e.get("en") if en else e.get("es"),
                                "kind": e.get("kind"), "license": e.get("license") or "", "installed": bool(e.get("installed"))})
                else:
                    out.append({"sound": s, "state": "unknown", "name": s, "kind": "", "license": "", "installed": False})
            loaded, _, ok = sound_states()
            return self._json({"sounds": out, "engine_ok": ok})
        if path == "/api/sounds/choice":
            learned = []
            if SOUNDS and data.get("chosen"):
                SOUNDS.choose(str(data.get("role") or ""), str(data.get("style") or ""), str(data["chosen"]),
                              [str(x) for x in data.get("others") or []][:6])
                try:  # 0.18: 3+ elecciones claras para lo mismo → una memoria de género
                    learned = learn_picks()
                except Exception:  # noqa: BLE001
                    learned = []
            return self._json({"ok": True, "memoria_nueva": learned})
        if path in ("/api/recipes/combine", "/api/recipes/save", "/api/recipes/delete", "/api/recipes/code"):
            if not SOUNDS:
                return self._err("Sin carpeta de datos|No data folder", lang, 500)
            mine = {r["id"]: r for r in SOUNDS.recipes()}
            get = lambda i: recipemod.BY_ID.get(i) or mine.get(i)  # noqa: E731
            if path == "/api/recipes/delete":
                SOUNDS.delete_recipe(str(data.get("id") or ""))
                return self._json({"ok": True})
            if path == "/api/recipes/code":
                rec = get(str(data.get("id") or "")) or data.get("recipe")
                if not isinstance(rec, dict):
                    return self._err("Esa receta no existe|That recipe doesn't exist", lang, 404)
                return self._json({"code": recipemod.code(rec, data.get("pattern") or None)})
            if path == "/api/recipes/combine":
                a, b = get(str(data.get("a") or "")), get(str(data.get("b") or ""))
                if not a or not b:
                    return self._err("Elige dos recetas|Pick two recipes", lang)
                rec = recipemod.combine(a, b, str(data.get("mode") or "layer"), en)
                if data.get("save"):
                    rec = SOUNDS.save_recipe(rec)
                return self._json({"recipe": rec, "code": recipemod.code(rec)})
            rec = data.get("recipe") if isinstance(data.get("recipe"), dict) else None
            if not rec or not rec.get("sound"):
                return self._err("Receta vacía|Empty recipe", lang)
            rec = SOUNDS.save_recipe({k: rec.get(k) for k in ("id", "name_es", "name_en", "kind", "sound", "n", "fx", "role", "tags",
                                                               "from", "mode", "layers") if rec.get(k) is not None})
            return self._json({"recipe": rec, "code": recipemod.code(rec)})
        if path == "/api/critic":
            cand = data.get("cambios") if isinstance(data.get("cambios"), dict) else {}
            return self._json(critic.judge(cand, data.get("tracks") or [], data.get("score"), lang))
        if path == "/api/clamp/install":
            try:
                return self._json(clamp.install(audioimport.tools_python, audioimport.TOOLS))
            except ValueError as e:
                return self._err(str(e), lang)
        return self._json({"error": "not found"}, 404)

    def _midi(self, path, data):
        """Teclado MIDI: notas de la web, ajustes, buscar teclados, grabar una toma y traducirla a Tidal."""
        if not self._same_origin():
            return self._json({"error": "forbidden"}, 403)
        if path == "/api/midi/note":
            return self._json(MIDI.web_note(str(data.get("type", "on")), int(data.get("note", 60)), int(data.get("vel", 90)),
                                            int(data.get("ch", 0)), str(data.get("src", "web"))[:40]))
        if path == "/api/midi/settings":
            return self._json({"settings": MIDI.set_settings(data)})
        if path == "/api/midi/panic":
            return self._json({"ok": MIDI.panic()})
        if path == "/api/midi/clock":
            return self._json({"lines": MIDI.clock_code(bool(data.get("start")))})
        if path == "/api/midi/scan":
            return self._json({"ok": MIDI.scan()})
        if path == "/api/midi/record":
            if data.get("action") == "stop":
                return self._json(MIDI.record_stop())
            if data.get("action") == "capture":
                return self._json(MIDI.capture(data.get("bpm", 120), sync=bool(data.get("sync", True))))
            return self._json(MIDI.record_start(data.get("bpm", 120), int(data.get("countin", 0) or 0), bool(data.get("sync", True)),
                                                bool(data.get("start_now"))))
        if path == "/api/midi/translate":
            return self._json(MIDI.translate_take(data))
        return self._json({"error": "not found"}, 404)

    def _import(self, path):
        """Importar una canción: MIDI (al momento) o audio (en segundo plano, con herramientas opcionales)."""
        q = parse_qs(urlparse(self.path).query)
        arg = lambda k, d="": q.get(k, [d])[0]  # noqa: E731
        lang = arg("lang", "es")
        if path in ("/api/import/midi", "/api/import/audio", "/api/import/generate"):
            if not self._origin_ok():
                return self._json({"error": "forbidden"}, 403)
            length = int(self.headers.get("Content-Length") or 0)
            if length > audioimport.MAX_AUDIO:
                return self._err("El archivo es demasiado grande|The file is too big", lang, 413)
            raw = self.rfile.read(length)
            try:
                if path == "/api/import/generate":
                    start, seed = arg("start"), arg("seed", "1")
                    return self._json(midigen.generate(raw, arg("style", "merengue"), [k for k in arg("keep").split(",") if k],
                                                       int(seed) if seed.isdigit() else 1, lang,
                                                       int(start) if start.isdigit() else None, int(arg("bars", "4") or 4), arg("name")))
                if path == "/api/import/midi":
                    start = arg("start")
                    return self._json(songimport.analyse(raw, lang, int(start) if start.isdigit() else None,
                                                         int(arg("bars", "4") or 4), arg("name")))
                return self._json(audioimport.start_job(arg("filename", "song.mp3"), raw, arg("engine") or None))
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
                    "github_where": github.where(cfg),
                    "github_create_new": bool(cfg["github"].get("create_new")),
                })
            if path == "/api/config":
                return self._json(public_config(load_config()))
            if path == "/api/appupdate":
                return self._json(appupdate.public(load_config()))
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
            if path == "/api/audio":
                return self._json(ENGINE.audio_state())
            if path in ("/api/library", "/api/library/search", "/api/library/similar"):
                q = parse_qs(urlparse(self.path).query)
                arg = lambda k: q.get(k, [""])[0]  # noqa: E731
                items = library_items()
                if path == "/api/library/similar":
                    return self._json(soundlib.suggest(items, arg("sound"), int(arg("n") or 6)))
                if path == "/api/library/search":
                    return self._json({"items": soundlib.search(items, arg("q"), arg("kind") or None, arg("origin") or None,
                                                                int(arg("limit") or 60))})
                cats = [{"id": c[0], "es": c[1], "en": c[2]} for c in instcatalog.CATEGORIES] + [{"id": "loops", "es": "Loops", "en": "Loops"}]
                return self._json({"items": items, "families": cats})
            if path == "/api/midi/state":
                q = parse_qs(urlparse(self.path).query)
                try:
                    since = int(q.get("since", ["0"])[0])
                except ValueError:
                    since = 0
                return self._json(MIDI.state(since))
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
            if path in ("/api/soundlab", "/api/sounds/rank", "/api/recipes"):
                return self._soundlab_get(path)
            if path in ("/api/memory", "/api/memory/log", "/api/memory/sync", "/api/styles", "/api/storage"):
                return self._memory_get(path)
            if path == "/api/knowledge":
                return self._json(knowledge_status())
            if path == "/api/monitor":
                q = parse_qs(urlparse(self.path).query)
                try:
                    since = float(q.get("since", ["0"])[0])
                except ValueError:
                    since = 0
                return self._json({"layers": router.LAYERS, "requests": MONITOR.public(since), "summary": MONITOR.summary(),
                                   "router": router.config(load_config()), "ai_timeout": load_config().get("ai_timeout", 300),
                                   "skills_mode": skill_mode(load_config()), "index": SONGS.stats() if SONGS else None,
                                   "knowledge": knowledge_status()})
            if path == "/api/songs/search":
                q = parse_qs(urlparse(self.path).query)
                if not SONGS:
                    return self._json({"results": []})
                return self._json({"results": SONGS.search(q.get("q", [""])[0], 20)})
            if path == "/api/ab/stats":
                return self._json({**(SONGS.votes_stats() if SONGS else {"counts": {}, "total": 0, "baseline": {}}),
                                   "index": SONGS.stats() if SONGS else None})
            if path == "/api/ab/export":
                body = (SONGS.export_jsonl() if SONGS else "").encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="tidal-studio-dataset.jsonl"')
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return
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
            if path.startswith("/api/midi/"):
                return self._midi(path, data)
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
                    elif k == "create_new" and isinstance(v, bool):
                        cfg["github"][k] = v
                if "temperature" in data:
                    cfg["temperature"] = float(data["temperature"])
                if "ai_timeout" in data:
                    cfg["ai_timeout"] = max(30, min(1800, int(float(data["ai_timeout"]))))
                if isinstance(data.get("router"), dict):
                    router.update(cfg, data["router"])
                if data.get("skills_mode") in skillset.MODES:
                    cfg.setdefault("skills", {})["mode"] = data["skills_mode"]
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

            if path.startswith("/api/score/"):
                return self._score(path, data)
            if path.startswith(("/api/memory/", "/api/styles/", "/api/cases/", "/api/storage/")):
                return self._memory_post(path, data)
            if path.startswith(("/api/soundlab/", "/api/sounds/choice", "/api/sounds/check", "/api/recipes/", "/api/critic", "/api/clamp/")):
                return self._soundlab_post(path, data)
            if path == "/api/course/variants":
                # «Otra versión» de un paso del curso: 3 candidatas de esa pista, el resto de la canción congelado (sin IA)
                tk = data.get("track") if isinstance(data.get("track"), dict) else {}
                role = str(tk.get("tipo") or data.get("role") or "melodia")
                try:
                    r = midigen.course_variants(str(data.get("style") or ""), role, str(tk.get("codigo") or ""),
                                                int(data.get("bars") or 0) or None, 3, int(data.get("seed") or 1), data.get("lang") or "es")
                    tid = str(tk.get("id") or "d6")
                    variantes = []
                    for v in r["variants"]:
                        pistas = [{"id": tid, "nombre": str(tk.get("nombre") or tid), "tipo": role, "codigo": v["codigo"]}]
                        scoremod.attach_parts(pistas)
                        variantes.append({"titulo": v["titulo"], "descripcion": v["descripcion"], "concepto": v["concepto"], "cambios": {"pistas": pistas}})
                    out = {"key": r["key"], "chords": r["chords"], "variantes": variantes}
                    if soundlab_cfg().get("critic"):
                        critic_on(out, {"tracks": data.get("tracks") or []}, data.get("lang"))
                    return self._json(out)
                except ValueError as e:
                    es, _, en = str(e).partition("|")
                    return self._json({"error": en if data.get("lang") == "en" and en else es}, 400)
            if path == "/api/songs/sync":
                # Copia de SOLO LECTURA de la canción del navegador: el servidor nunca la escribe de vuelta
                if not SONGS:
                    return self._json({"ok": False, "error": "sin índice"})
                song = data.get("song") if isinstance(data.get("song"), dict) else {}
                try:
                    return self._json(SONGS.sync(song))
                except ValueError as e:
                    return self._json({"ok": False, "error": str(e)}, 400)
            if path == "/api/songs/forget":
                if SONGS:
                    SONGS.forget(str(data.get("id") or ""))
                return self._json({"ok": True})
            if path == "/api/ab/vote":
                if not SONGS:
                    return self._json({"ok": False, "error": "sin índice"})
                try:
                    vid = SONGS.vote(data)
                    learned = []
                    # 0.21: elegir varias veces opciones parecidas propone una memoria (a la bandeja, decides tú)
                    if data.get("kind") == "pick" and MEMORY and memory_cfg().get("learn_picks"):
                        try:
                            learned = MEMORY.learn_from_option_picks(SONGS.pick_votes())
                        except Exception as e:  # noqa: BLE001
                            print(f"[memoria] {e}")
                    return self._json({"ok": True, "id": vid, "memoria_nueva": learned})
                except ValueError as e:
                    return self._json({"ok": False, "error": str(e)}, 400)
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
                rcfg = router.config(cfg)
                msgs = data.get("messages") or []
                sess = data.get("session") or {}
                last_txt = next((str(m.get("content", "")) for m in reversed(msgs) if isinstance(m, dict) and m.get("role") == "user"), "")
                req = MONITOR.start(last_txt, str(data.get("trace") or "")[:64])
                # 0.18: lo que pides que recuerde («recuerda que…», «nunca…», «prefiero…») pasa por la capa de
                # validación: lo muy claro se aprueba solo y lo dudoso va a la bandeja de Memoria
                noted, mctx = [], memory_ctx(sess)
                mc = memory_cfg(cfg)
                last_msg = msgs[-1] if msgs and isinstance(msgs[-1], dict) else {}
                if MEMORY and mc.get("observe_chat") and last_msg.get("role") == "user" and not sess.get("plan_paso"):
                    try:
                        for o in memorymod.observe(last_txt, mctx):
                            noted.append(MEMORY.add(o["text"], o["scope"], o["scope_key"], source="chat", clear=o["clear"],
                                                    auto_approve=bool(mc.get("auto_approve")), by="maestro"))
                    except Exception:  # noqa: BLE001
                        noted = []
                sess["_memory_ctx"] = mctx
                sess["_noted"] = noted
                try:
                    # Capa 1: lo que se puede contestar con tus propios datos no gasta ni un token
                    req.begin("rules")
                    ans = router.local_answer(last_txt, SONGS, data.get("lang")) if rcfg["local_answers"] else None
                    if ans and ans[1] >= rcfg["confidence"]:
                        req.end("rules", "hit", hits=ans[2], note="local")
                        req.end("validate", "skip")
                        return self._json({**ans[0], "local": True, "monitor": req.id})
                    if noted and memorymod.only_memory(last_txt):
                        # «Recuerda que…» y nada más: se contesta sin IA
                        req.end("rules", "hit", hits=len(noted), note="memory")
                        req.end("validate", "skip")
                        return self._json({**memorymod.noted_reply(noted, data.get("lang") == "en"), "local": True,
                                           "memoria_nueva": noted, "monitor": req.id})
                    # 0.20.1: «guarda la A y la C como estilos» se guarda aquí de verdad, sin IA, si se entiende cuáles
                    if MEMORY and last_msg.get("role") == "user" and not sess.get("plan_paso") and stylesave.wants_save(last_txt):
                        opts = stylesave.recent_options(sess)
                        targets = stylesave.parse_targets(last_txt, opts)
                        if targets:
                            saved, errs = stylesave.save(MEMORY, sess, [{"opcion": x} for x in targets], opts, mctx["genre"])
                            req.end("rules", "hit", hits=len(saved), note="styles")
                            req.end("validate", "skip")
                            return self._json({**stylesave.local_reply(saved, errs, data.get("lang") == "en"), "local": True,
                                               **({"memoria_nueva": noted} if noted else {}), "monitor": req.id})
                    req.end("rules", "pass" if rcfg["local_answers"] else "off")
                    if not llm_configured(cfg):
                        return self._json({"error": "La IA no está configurada. Abre ⚙️ Ajustes."}, 400)
                    return self._chat(cfg, rcfg, req, data, msgs, sess)
                finally:
                    req.finish()

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

            if path.startswith("/api/appupdate/"):
                act = path[len("/api/appupdate/"):]
                cfg = load_config()
                lang = data.get("lang") or cfg.get("language") or "es"
                up = cfg.setdefault("updates", {})
                if act == "check":
                    appupdate.GITHUB_TOKEN = ((cfg.get("github") or {}).get("token") or "").strip()
                    appupdate.check(lang)
                elif act == "download":
                    appupdate.start_download()
                elif act == "install":
                    try:
                        r = appupdate.install(lang)
                    except ValueError as e:
                        return self._json({"error": str(e)}, 400)
                    return self._json({**appupdate.public(cfg), **r})
                elif act == "auto":
                    up["auto_check"] = bool(data.get("on"))
                    save_config(cfg)
                elif act == "skip":
                    up["skipped"] = str(data.get("version") or "")
                    save_config(cfg)
                else:
                    return self._json({"error": "Ruta no encontrada"}, 404)
                return self._json(appupdate.public(cfg))

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

            if path == "/api/knowledge/rebuild":
                # Botón «Reconstruir índice»: se borra y se rehace desde los Markdown instalados (no se pierde nada)
                r = skillset.rebuild_index(load_config())
                return self._json({**{k: v for k, v in r.items() if k != "ids"}, "knowledge": knowledge_status()},
                                  500 if r.get("error") else 200)

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
                        if act == "enable":   # 0.21: las incluidas que vienen apagadas (p. ej. prosody-checker)
                            ons = set(sk.get("enabled") or [])
                            (ons.add if on else ons.discard)(name)
                            sk["enabled"] = sorted(ons)
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
            if path == "/api/audio/restart":
                # «Reconectar audio» (opcional: otra salida). La salida elegida se guarda para el próximo arranque.
                if not self._same_origin():
                    return self._json({"error": "forbidden"}, 403)
                out = data.get("out")
                if out is not None:
                    cfg = load_config()
                    cfg.setdefault("audio", {})["out"] = str(out or "")[:200]
                    save_config(cfg)
                threading.Thread(target=ENGINE.restart_audio, args=(out,), daemon=True).start()
                return self._json({"ok": True})
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
                        r = tfiles.read(data.get("path"))
                        if not str(r["path"]).lower().endswith(".txt"):
                            sx = tfiles.read_score(r["path"])
                            if sx:
                                # cancion.tidal + cancion.musicxml: la partitura viaja con el código
                                try:
                                    r["score"] = scoremod.to_json(scoremod.from_musicxml(sx["xml"]))
                                    r["score_path"], r["score_mtime"] = sx["path"], sx["mtime"]
                                except (ValueError, ET_ParseError) as e:
                                    r["score_error"] = str(e)
                        return self._json(r)
                    if path == "/api/file/write":
                        r = tfiles.write(data.get("path"), data.get("content", ""), bool(data.get("overwrite", True)))
                        sc = scoremod.normalize(data.get("score")) if data.get("score") else None
                        if sc and sc["parts"] and not r.get("exists"):
                            w = tfiles.write_score(r["path"], scoremod.to_musicxml(sc, data.get("title") or os.path.splitext(r["name"])[0]))
                            r["score_path"], r["score_mtime"] = w["path"], w["mtime"]
                        return self._json(r)
                    if path == "/api/file/list":
                        return self._json(tfiles.list_dir(data.get("dir", "")))
                    if path == "/api/file/trash":
                        return self._json(tfiles.trash(data.get("path"), data.get("mtime"), data.get("size")))
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
    ENGINE.audio_out = str((load_config().get("audio") or {}).get("out") or "")
    if not ARGS.no_engine:
        threading.Thread(target=ENGINE.start, daemon=True).start()
    threading.Thread(target=update_plugins_on_start, daemon=True).start()
    threading.Thread(target=index_skills_on_start, daemon=True).start()
    threading.Thread(target=app_update_loop, daemon=True).start()
    if MEMORY and memory_cfg().get("backup") and github.configured(load_config()):
        schedule_backup(8)   # al arrancar: trae lo de GitHub (p. ej. en un ordenador nuevo) y sube lo pendiente
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
