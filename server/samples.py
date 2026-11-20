"""
Biblioteca de samples de Tidal Studio.

  samples/<nombre>/*.wav|ogg|flac|aif   tus sonidos: cada carpeta es un sonido de Tidal (s "nombre")
  samples/library.json                  tipo, origen, licencia y autor de cada sonido
  samples/CREDITS.md                    créditos para los sonidos con licencia de atribución (se genera solo)

SuperDirt carga samples/* al arrancar (ver supercollider/start_superdirt.scd) y se recarga
cuando añades o borras algo, sin reiniciar.

Búsqueda online: Freesound (freesound.org), con una clave API gratuita. Se descarga la vista previa
de alta calidad (OGG), que SuperCollider lee sin conversiones.
Solo biblioteca estándar.
"""
import json
import os
import re
import shutil
import threading
import urllib.error
import urllib.parse
import urllib.request

AUDIO_EXT = (".wav", ".aif", ".aiff", ".flac", ".ogg")
TYPES = ["bombo", "caja", "platos", "percusion", "bajo", "melodico", "pad", "voz", "fx", "loop", "otro"]
GUESS = [
    ("bombo", r"kick|bd|bombo|bassdrum"), ("caja", r"snare|sn|sd|caja|clap|cp|rim"),
    ("platos", r"hat|hh|oh|cymbal|crash|ride|plato"), ("bajo", r"bass|bajo|808|sub"),
    ("voz", r"vox|voice|vocal|voz|speech"), ("pad", r"pad|drone|ambient|atmos"),
    ("loop", r"loop|break"), ("percusion", r"perc|tom|conga|bongo|shaker|tabla"),
    ("melodico", r"piano|key|synth|pluck|guitar|chord|lead|bell"), ("fx", r"fx|noise|glitch|riser|sweep|impact"),
]
FS_API = "https://freesound.org/apiv2"
LICENSES = {
    "cc0": ["Creative Commons 0"],
    "libre": ["Creative Commons 0", "Attribution"],
    "todas": [],
}
_lock = threading.Lock()


class SampleError(Exception):
    pass


def safe_name(name):
    s = re.sub(r"[^a-z0-9_]+", "_", (name or "").lower()).strip("_")
    if s and s[0].isdigit():
        s = "s" + s
    return s[:40]


def guess_type(name):
    for t, rx in GUESS:
        if re.search(rx, name.lower()):
            return t
    return "otro"


class Library:
    def __init__(self, root):
        self.dir = os.path.join(root, "samples")
        self.meta_path = os.path.join(self.dir, "library.json")

    # -------------------------------------------------------------- metadatos
    def _meta(self):
        try:
            with open(self.meta_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"sounds": {}}

    def _save_meta(self, meta):
        os.makedirs(self.dir, exist_ok=True)
        with open(self.meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
        self._write_credits(meta)

    def _write_credits(self, meta):
        lines = ["# Créditos de samples / Sample credits", "",
                 "Generado por Tidal Studio. Si publicas música con estos sonidos, incluye estos créditos.", ""]
        n = 0
        for name, s in sorted(meta["sounds"].items()):
            for f in s.get("files_meta", []):
                if f.get("author"):
                    n += 1
                    lines.append(f"- `{name}`: «{f.get('title', '')}» por {f['author']} ({f.get('license_name', '')}) {f.get('url', '')}")
        if n:
            with open(os.path.join(self.dir, "CREDITS.md"), "w", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")

    # -------------------------------------------------------------- consulta
    def list(self):
        meta = self._meta()
        out = []
        if os.path.isdir(self.dir):
            for name in sorted(os.listdir(self.dir)):
                p = os.path.join(self.dir, name)
                if not os.path.isdir(p) or name.startswith(".") or name == "packs":
                    continue
                files = sorted(f for f in os.listdir(p) if f.lower().endswith(AUDIO_EXT))
                m = meta["sounds"].get(name, {})
                fm = {x.get("file"): x for x in m.get("files_meta", [])}
                out.append({"name": name, "type": m.get("type") or guess_type(name), "source": m.get("source", "local"),
                            "files": [{"file": f, "index": i, **{k: fm.get(f, {}).get(k) for k in ("author", "license_name", "url", "title")}}
                                      for i, f in enumerate(files)]})
        packs = []
        pdir = os.path.join(self.dir, "packs")
        if os.path.isdir(pdir):
            packs = sorted(x for x in os.listdir(pdir) if os.path.isdir(os.path.join(pdir, x)))
        return {"sounds": out, "packs": packs, "folder": self.dir}

    def file_path(self, name, index):
        name = safe_name(name)
        p = os.path.join(self.dir, name)
        files = sorted(f for f in os.listdir(p) if f.lower().endswith(AUDIO_EXT)) if os.path.isdir(p) else []
        if not 0 <= index < len(files):
            raise SampleError("No existe ese sample")
        return os.path.join(p, files[index])

    # -------------------------------------------------------------- cambios
    def add_file(self, name, filename, data, stype=None, info=None):
        name = safe_name(name)
        if not name:
            raise SampleError("Pon un nombre al sonido (letras y números)")
        base, ext = os.path.splitext(os.path.basename(filename or "sample.wav"))
        if ext.lower() not in AUDIO_EXT:
            raise SampleError("Formato no soportado: usa WAV, AIFF, FLAC u OGG")
        if len(data) > 30 * 1024 * 1024:
            raise SampleError("El archivo es demasiado grande (máx. 30 MB)")
        fname = (re.sub(r"[^A-Za-z0-9_.-]+", "-", base).strip("-") or "sample")[:60] + ext.lower()
        with _lock:
            d = os.path.join(self.dir, name)
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, fname), "wb") as f:
                f.write(data)
            meta = self._meta()
            s = meta["sounds"].setdefault(name, {"type": stype or guess_type(name + " " + base), "source": "local", "files_meta": []})
            if stype:
                s["type"] = stype
            if info:
                s["source"] = info.get("source", s.get("source"))
                s["files_meta"] = [x for x in s.get("files_meta", []) if x.get("file") != fname] + [{"file": fname, **info}]
            self._save_meta(meta)
        return {"name": name, "file": fname}

    def set_type(self, name, stype):
        if stype not in TYPES:
            raise SampleError("Tipo desconocido")
        with _lock:
            meta = self._meta()
            meta["sounds"].setdefault(safe_name(name), {"files_meta": []})["type"] = stype
            self._save_meta(meta)

    def delete(self, name, index=None):
        name = safe_name(name)
        with _lock:
            meta = self._meta()
            if index is None:
                shutil.rmtree(os.path.join(self.dir, name), ignore_errors=True)
                meta["sounds"].pop(name, None)
            else:
                p = self.file_path(name, int(index))
                os.remove(p)
                s = meta["sounds"].get(name)
                if s:
                    s["files_meta"] = [x for x in s.get("files_meta", []) if x.get("file") != os.path.basename(p)]
            self._save_meta(meta)

    # -------------------------------------------------------------- Freesound
    def freesound_search(self, key, query, license="libre", oneshot=True, page=1, api=FS_API):
        if not key:
            raise SampleError("Falta la clave API de Freesound (Biblioteca → Buscar online)")
        filt = []
        lic = LICENSES.get(license, [])
        if lic:
            filt.append("license:(" + " OR ".join(f'"{x}"' for x in lic) + ")")
        filt.append("duration:[0 TO 4]" if oneshot else "duration:[0 TO 30]")
        qs = urllib.parse.urlencode({
            "query": query, "filter": " ".join(filt), "page": page, "page_size": 15, "sort": "score",
            "fields": "id,name,tags,duration,license,username,previews,url,avg_rating,num_downloads",
        })
        data = _get_json(f"{api}/search/text/?{qs}", key)
        out = []
        for r in data.get("results", []):
            out.append({"id": r["id"], "name": r.get("name", ""), "duration": round(r.get("duration") or 0, 2),
                        "author": r.get("username", ""), "license": r.get("license", ""), "license_name": license_name(r.get("license", "")),
                        "url": r.get("url", ""), "tags": (r.get("tags") or [])[:6], "downloads": r.get("num_downloads", 0),
                        "preview": (r.get("previews") or {}).get("preview-hq-mp3"),
                        "preview_ogg": (r.get("previews") or {}).get("preview-hq-ogg")})
        return {"count": data.get("count", 0), "results": out, "next": bool(data.get("next"))}

    def freesound_add(self, key, item, name, stype, api=FS_API):
        url = item.get("preview_ogg") or ""
        origin = "/".join(api.split("/")[:3]) + "/"
        if not (re.match(r"^https://([a-z0-9-]+\.)*freesound\.org/", url) or url.startswith(origin)):
            raise SampleError("Vista previa no válida")
        req = urllib.request.Request(url, headers={"User-Agent": "tidal-studio"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read(31 * 1024 * 1024)
        except urllib.error.URLError as e:
            raise SampleError(f"No se pudo descargar de Freesound: {getattr(e, 'reason', e)}")
        title = item.get("name") or str(item.get("id"))
        fname = f"fs{item.get('id')}-{title}"
        fname = os.path.splitext(fname)[0] + ".ogg"
        return self.add_file(name, fname, data, stype, {
            "source": "freesound", "title": title, "author": item.get("author"), "license": item.get("license"),
            "license_name": item.get("license_name") or license_name(item.get("license", "")), "url": item.get("url")})


def license_name(url):
    u = (url or "").lower()
    if "zero" in u or "publicdomain" in u:
        return "CC0"
    if "by-nc" in u:
        return "CC BY-NC"
    if "sampling+" in u:
        return "Sampling+"
    if "/by/" in u or "by/" in u:
        return "CC BY"
    return url or "?"


def _get_json(url, key):
    req = urllib.request.Request(url, headers={"Authorization": f"Token {key}", "User-Agent": "tidal-studio"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise SampleError("Freesound no acepta la clave API (¿está bien copiada?)")
        raise SampleError(f"Freesound respondió {e.code}")
    except urllib.error.URLError as e:
        raise SampleError(f"No se pudo conectar con Freesound: {e.reason}")
