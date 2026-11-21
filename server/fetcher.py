"""
Maestro descarga samples por sí mismo.

Cuando a una canción le falta un sonido (un cencerro de verdad, crujido de vinilo, una marimba…),
Maestro lo pide en su respuesta JSON con "descargar":
    [{"nombre": "vinilo", "busqueda": "vinyl crackle", "tipo": "fx", "duracion": "loop",
      "alternativa": "noise", "por_que": "da textura de disco viejo"}]
y usa s "vinilo" en su código. Es una acción del estudio (no una herramienta del proveedor),
así que funciona con cualquier IA: Claude, OpenAI, Ollama, LM Studio…

El estudio busca en fuentes con licencia libre:
  - Packs de la comunidad con índice strudel.json (VCSL CC0, Uzu drumkit dominio público,
    piano Salamander CC BY, mridangam CC BY-SA): no necesitan clave.
  - Freesound (CC0 y CC BY), si hay clave API.
Elige el mejor resultado, lo descarga, apunta los créditos en samples/CREDITS.md y lo carga en
SuperDirt. Los paquetes grandes (muchos archivos o muchos MB) no se descargan sin permiso.
Si no encuentra nada, cambia el sonido por la "alternativa" de Dirt-Samples para que siga sonando.
Solo biblioteca estándar.
"""
import os
import re
import urllib.request

import net
from samples import SampleError, safe_name, pack_index

RAW = "https://raw.githubusercontent.com/"
DOUGH = RAW + "felixroos/dough-samples/main/"
# Packs donde buscar sin clave: solo los que tienen una licencia libre conocida
SOURCES = [
    {"id": "vcsl", "name": "VCSL (Versilian Community Sample Library)", "url": DOUGH + "vcsl.json",
     "license_name": "CC0", "author": "Versilian Studios", "home": "https://github.com/sgossner/VCSL"},
    {"id": "uzu", "name": "Uzu drumkit", "url": RAW + "tidalcycles/uzu-drumkit/main/strudel.json",
     "license_name": "Unlicense", "author": "TidalCycles", "home": "https://github.com/tidalcycles/uzu-drumkit"},
    {"id": "piano", "name": "Salamander Grand Piano", "url": DOUGH + "piano.json",
     "license_name": "CC BY", "author": "Alexander Holm", "home": "https://github.com/felixroos/dough-samples"},
    {"id": "mridangam", "name": "Mridangam", "url": DOUGH + "mridangam.json",
     "license_name": "CC BY-SA", "author": "Arthur Carabott, Harishankar V Menon", "home": "https://github.com/yaxu/mrid"},
]
# Más de esto pide permiso antes de descargar
BIG_FILES = 16
BIG_BYTES = 8 * 1024 * 1024

# Palabras del alumno (o de la IA) → nombres que usan los packs
SYN = {
    "kick": ["bd", "bassdrum"], "bombo": ["bd", "bassdrum", "kick"], "bassdrum": ["bd"],
    "snare": ["sd", "snare"], "caja": ["sd", "snare"], "redoble": ["snare"],
    "hihat": ["hh", "hihat"], "hat": ["hh", "hihat"], "charles": ["hh", "hihat"], "hats": ["hh", "hihat"],
    "openhat": ["oh"], "clap": ["cp", "clap"], "palmas": ["cp", "clap"], "palmada": ["clap"],
    "cowbell": ["cb", "cowbell"], "cencerro": ["cb", "cowbell"], "rim": ["rim"], "rimshot": ["rim"],
    "crash": ["cr", "clash"], "ride": ["rd"], "shaker": ["sh", "shaker"], "maraca": ["shaker"], "maracas": ["shaker"],
    "tambourine": ["tb", "tambourine"], "pandereta": ["tambourine"], "tom": ["tom", "lt", "mt", "ht"],
    "platillo": ["cymbal", "sus_cymbal"], "plato": ["cymbal"], "cymbal": ["sus_cymbal", "cymbal"],
    "trompeta": ["trumpet"], "saxofon": ["sax"], "saxofón": ["sax"], "saxophone": ["sax"],
    "organo": ["organ"], "órgano": ["organ"], "arpa": ["harp"], "flauta": ["recorder", "flute"], "flute": ["recorder"],
    "xilofono": ["xylophone"], "xilófono": ["xylophone"], "campanas": ["bells", "tubularbells", "handbells"],
    "campana": ["bell", "tubularbells"], "bells": ["tubularbells", "handbells", "sleighbells"],
    "cascabeles": ["sleighbells"], "triangulo": ["triangles"], "triángulo": ["triangles"], "triangle": ["triangles"],
    "vibrafono": ["vibraphone"], "vibráfono": ["vibraphone"], "glockenspiel": ["glockenspiel"],
    "armonica": ["harmonica"], "armónica": ["harmonica"], "sirena": ["siren"], "silbato": ["whistle"],
    "gong": ["gong"], "timbal": ["timpani"], "timbales": ["timpani"], "bongos": ["bongo"], "congas": ["conga"],
    "clave": ["clave"], "claves": ["clave"], "cajón": ["cajon"], "guiro": ["guiro"], "güiro": ["guiro"],
    "kalimba": ["kalimba"], "marimba": ["marimba"], "didgeridoo": ["didgeridoo"], "copa": ["wineglass"],
    "breakbeat": ["brk"], "break": ["brk"], "lluvia": ["rain"], "vinilo": ["vinyl"], "viento": ["wind"],
    "agua": ["water"], "pajaros": ["birds"], "pájaros": ["birds"], "voz": ["vocal", "voice"], "coro": ["choir"],
}
STOP = {"a", "de", "del", "la", "el", "un", "una", "y", "con", "the", "of", "and", "with", "sample", "samples", "sound",
        "sonido", "sonidos", "real", "acoustic", "acustico", "acústico", "single", "hit", "one", "shot", "oneshot", "golpe"}


def _tokens(text):
    out = []
    for w in re.findall(r"[a-záéíóúñü0-9]+", (text or "").lower()):
        if w in STOP or len(w) < 2:
            continue
        out.append(w)
    return out


def _name_tokens(name):
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    return [w for w in re.split(r"[\s_\-.]+|(?<=\D)(?=\d)", s.lower()) if w]


def _score(query_tokens, name):
    """Cuánto se parece el nombre de un sonido de un pack a lo que se busca."""
    nt = _name_tokens(name)
    joined = name.lower()
    score = 0
    for q in query_tokens:
        alts = [q] + SYN.get(q, [])
        if any(a in nt or a == joined for a in alts):
            score += 3
        elif any(len(a) >= 4 and a in joined for a in alts):
            score += 2
    # nombres más cortos = el sonido «principal» (cowbell antes que cowbell_damped)
    return score - len(nt) * 0.1 if score else 0


def _head_size(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "tidal-studio"})
        with net.urlopen(req, timeout=8) as r:
            return int(r.headers.get("Content-Length") or 0)
    except Exception:
        return 0


def search_packs(query, limit=3):
    qt = _tokens(query)
    if not qt:
        return []
    found = []
    for src in SOURCES:
        try:
            idx = pack_index(src["url"])
        except SampleError:
            continue
        for snd in idx["sounds"]:
            sc = _score(qt, snd["name"])
            if sc >= 2.5:
                found.append((sc, src, snd))
    found.sort(key=lambda x: -x[0])
    out = []
    for sc, src, snd in found[:limit]:
        files = snd["files"]
        out.append({
            "source": "pack", "pack": src["id"], "pack_name": src["name"], "pack_url": src["url"], "sound": snd["name"],
            "title": snd["name"], "author": src["author"], "license_name": src["license_name"], "url": src["home"],
            "files": len(files), "preview": files[0], "score": round(sc, 2),
        })
    return out


def search_freesound(lib, key, api, query, loop=False, limit=3):
    if not key:
        return []
    try:
        res = lib.freesound_search(key, query, "libre", not loop, 1, api)
    except SampleError:
        return []
    out = []
    for r in res.get("results", [])[:limit]:
        if r.get("license_name") not in ("CC0", "CC BY") or not r.get("preview_ogg"):
            continue
        out.append({"source": "freesound", "title": r["name"], "author": r["author"], "license": r["license"],
                    "license_name": r["license_name"], "url": r["url"], "files": 1, "duration": r["duration"],
                    "preview": r.get("preview") or r["preview_ogg"], "item": r})
    return out


def _needs_ok(c):
    if c["source"] != "pack":
        return False
    if c["files"] > BIG_FILES:
        return True
    return c.get("bytes", 0) > BIG_BYTES


def _estimate(c):
    if c["source"] == "pack" and "bytes" not in c:
        one = _head_size(c["preview"])
        c["bytes"] = one * min(c["files"], 64) if one else 0
    return c


def candidates(lib, cfg, req):
    q = str(req.get("busqueda") or req.get("nombre") or "")
    loop = str(req.get("duracion") or "").lower() in ("loop", "largo", "long", "textura", "ambiente")
    sc = cfg.get("samples") or {}
    packs = search_packs(q)
    fs = search_freesound(lib, sc.get("freesound_key"), sc.get("freesound_api") or "https://freesound.org/apiv2", q, loop)
    strong = [p for p in packs if p["score"] >= 2.4 * max(1, len(_tokens(q)))]
    # Packs que encajan de lleno primero (instrumentos y baterías bien grabados), luego Freesound, luego el resto
    order = strong + fs + [p for p in packs if p not in strong]
    if loop:
        order = fs + [p for p in order if p not in fs]
    return [_estimate(c) for c in order[:4]]


def install(lib, engine, name, c):
    name = safe_name(name)
    if c["source"] == "freesound":
        sc_key = c.pop("_key", None)
        r = lib.freesound_add(sc_key, c["item"], name, None, c.pop("_api", None) or "https://freesound.org/apiv2")
    else:
        r = lib.pack_install(c["pack_url"], c["sound"], name, None,
                             {"author": c.get("author"), "license_name": c.get("license_name"), "title": f'{c.get("pack_name")}: {c["sound"]}'})
    loaded = engine.reload_sample(os.path.join(lib.dir, safe_name(r["name"])), safe_name(r["name"])) if engine else False
    return {"name": r["name"], "loaded": loaded}


def _have(lib, name):
    d = os.path.join(lib.dir, name)
    return os.path.isdir(d) and any(not f.startswith(".") for f in os.listdir(d))


def public(c):
    """Lo que ve la interfaz (sin la respuesta cruda de Freesound)."""
    return {k: v for k, v in c.items() if k not in ("_key", "_api")}


def resolve(lib, engine, cfg, requests, auto=True, log=None):
    """Busca (y descarga, si es pequeño y auto) cada sonido que ha pedido Maestro."""
    sc = cfg.get("samples") or {}
    out = []
    for req in requests[:4]:
        name = safe_name(req.get("nombre") or req.get("busqueda"))
        if not name:
            continue
        item = {"nombre": name, "busqueda": str(req.get("busqueda") or name)[:80], "tipo": str(req.get("tipo") or ""),
                "por_que": str(req.get("por_que") or "")[:240], "alternativa": safe_name(req.get("alternativa")) or "",
                "candidatos": [], "elegido": 0}
        if _have(lib, name):
            item["estado"] = "ya"
            out.append(item)
            continue
        if log:
            log(name, item["busqueda"])
        try:
            cands = candidates(lib, cfg, req)
        except Exception as e:  # sin red, índice roto…
            cands, item["error"] = [], str(e)
        item["candidatos"] = [public(c) for c in cands]
        if not cands:
            item["estado"] = "nada"
        elif not auto or _needs_ok(cands[0]):
            item["estado"] = "permiso"
        else:
            try:
                c = dict(cands[0], _key=sc.get("freesound_key"), _api=sc.get("freesound_api"))
                item.update(install(lib, engine, name, c), estado="descargado")
            except SampleError as e:
                item["estado"], item["error"] = "error", str(e)
        out.append(item)
    return out


def install_choice(lib, engine, cfg, name, c, replace=False):
    """Descarga el candidato elegido en la tarjeta del chat (con permiso o «otro sonido»)."""
    name = safe_name(name)
    if not name or not isinstance(c, dict):
        raise SampleError("Falta el sonido")
    if c.get("source") == "pack":
        if not any(s["url"] == c.get("pack_url") for s in SOURCES):
            raise SampleError("Pack desconocido")
        c = {k: c.get(k) for k in ("source", "pack_url", "sound", "pack_name", "author", "license_name")}
    elif c.get("source") == "freesound":
        sc = cfg.get("samples") or {}
        c = {"source": "freesound", "item": c.get("item") or {}, "_key": sc.get("freesound_key"), "_api": sc.get("freesound_api")}
    else:
        raise SampleError("Origen desconocido")
    if replace and _have(lib, name):
        lib.delete(name)
    return install(lib, engine, name, c)


def swap_sound(code, name, alt):
    """Cambia un sonido que no se pudo descargar por uno de Dirt-Samples (solo dentro de las comillas)."""
    if not name or not alt:
        return code
    rx = re.compile(r'"[^"]*"')
    # «cencerro:1» con alternativa «808:3» → «808:3» (no «808:3:1»)
    word = re.compile(r"(?<![\w.'])" + re.escape(name) + (r"(?::\d+)?" if ":" in alt else "") + r"(?![\w'])")
    return rx.sub(lambda m: word.sub(alt, m.group(0)), code)


def apply_fallbacks(reply, items):
    """Sonidos que no se encontraron: la canción usa la alternativa para que nada quede en silencio."""
    for it in items:
        if it.get("estado") in ("nada", "error") and it.get("alternativa"):
            blocks = [reply.get("cambios") or {}] + [v.get("cambios") or {} for v in reply.get("variantes") or []] \
                + [s.get("cambios") or {} for s in reply.get("sugerencias") or []]
            for b in blocks:
                for p in b.get("pistas") or []:
                    p["codigo"] = swap_sound(p.get("codigo", ""), it["nombre"], it["alternativa"])
            it["sustituido"] = True
    return reply
