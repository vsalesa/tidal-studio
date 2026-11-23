"""
Fotos de instrumentos desde Wikimedia Commons.

Cualquier instrumento de la biblioteca (también los tuyos) puede llevar una foto real: buscas en
Wikimedia Commons, eliges una con licencia libre (CC0, dominio público, CC BY o CC BY-SA) y Tidal Studio
la descarga a samples/.photos/<id>.jpg con su autor y licencia, que se muestran siempre debajo.
Solo biblioteca estándar.
"""
import json
import os
import re
import urllib.parse
import urllib.request

import net
from samples import SampleError, safe_name

API = "https://commons.wikimedia.org/w/api.php"
HOSTS = ("commons.wikimedia.org", "upload.wikimedia.org")
UA = {"User-Agent": "TidalStudio/1.0 (https://github.com/vsalesa/tidal-studio; instrument photos)"}
FREE = ("CC0", "Public domain", "PD", "CC BY", "CC-BY")


def _get(url, limit=8 * 1024 * 1024, retry=True):
    host = urllib.parse.urlparse(url).hostname or ""
    if not url.startswith("https://") or host not in HOSTS:
        raise SampleError("Solo descargo fotos de Wikimedia Commons")
    try:
        with net.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            data = r.read(limit + 1)
    except urllib.error.HTTPError as e:
        if e.code == 429 and retry:   # Wikimedia limita las peticiones seguidas: esperamos lo que pida y otra vez
            import time
            try:
                wait = min(10, max(2, int(e.headers.get("Retry-After") or 4)))
            except ValueError:
                wait = 4
            time.sleep(wait)
            return _get(url, limit, False)
        raise SampleError("Wikimedia está ocupado, prueba en unos segundos" if e.code == 429 else f"Error {e.code} en Wikimedia")
    except Exception as e:  # noqa: BLE001
        raise SampleError(f"No se pudo conectar con Wikimedia: {e}")
    if len(data) > limit:
        raise SampleError("La foto es demasiado grande")
    return data


def _clean(text):
    import html
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()[:120]


def search(query, limit=12):
    """Fotos con licencia libre para «query» (en inglés suele encontrar más)."""
    q = (query or "").strip()
    if not q:
        return []
    url = API + "?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrsearch": q + " filetype:bitmap", "gsrnamespace": 6,
        "gsrlimit": 30, "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 900})
    data = json.loads(_get(url).decode("utf-8"))
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata") or {}
        lic = (md.get("LicenseShortName") or {}).get("value", "")
        if not lic.startswith(FREE) or "NC" in lic or "ND" in lic or ii.get("width", 0) < 400 or not ii.get("thumburl"):
            continue
        out.append({"title": p["title"], "thumb": ii["thumburl"], "license": lic,
                    "license_url": (md.get("LicenseUrl") or {}).get("value", ""),
                    "author": _clean((md.get("Artist") or {}).get("value", "")) or "unknown",
                    "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(p["title"].replace(" ", "_"))})
        if len(out) >= limit:
            break
    return out


class Photos:
    def __init__(self, samples_dir):
        self.dir = os.path.join(samples_dir, ".photos")

    def path(self, iid):
        return os.path.join(self.dir, safe_name(iid) + ".jpg")

    def meta(self):
        try:
            with open(os.path.join(self.dir, "photos.json"), "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def save(self, iid, pick):
        iid = safe_name(iid)
        if not iid or not isinstance(pick, dict):
            raise SampleError("Falta el instrumento o la foto")
        thumb = str(pick.get("thumb") or "")
        data = _get(thumb)
        if not (data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:4] == b"RIFF"):
            raise SampleError("Eso no parece una foto")
        os.makedirs(self.dir, exist_ok=True)
        with open(self.path(iid), "wb") as f:
            f.write(data)
        m = self.meta()
        m[iid] = {k: str(pick.get(k) or "")[:300] for k in ("title", "author", "license", "license_url", "page")}
        m[iid]["v"] = int(os.path.getmtime(self.path(iid)))
        with open(os.path.join(self.dir, "photos.json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, indent=1)
        return {"id": iid, **m[iid]}

    def remove(self, iid):
        iid = safe_name(iid)
        try:
            os.remove(self.path(iid))
        except OSError:
            pass
        m = self.meta()
        m.pop(iid, None)
        os.makedirs(self.dir, exist_ok=True)
        with open(os.path.join(self.dir, "photos.json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, indent=1)
        return {"id": iid, "removed": True}

    def read(self, iid):
        p = self.path(iid)
        if not os.path.isfile(p):
            raise SampleError("Sin foto")
        with open(p, "rb") as f:
            return f.read()
