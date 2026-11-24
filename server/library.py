"""Una sola librería de sonidos: lo que trae SuperDirt, la biblioteca de instrumentos, tus samples,
lo que bajas de Freesound o de packs, los loops y lo que descarga Maestro.

Los archivos no se mueven: cada fuente sigue en su carpeta. Aquí se leen todas y se les da la misma
forma (una «ficha» por sonido), para que el panel Librería, el asistente de cambiar instrumento y la
búsqueda las traten igual. El origen es un dato más de la ficha, no una sección aparte.

Ficha: {key, sound, es, en, family, role, kind, origin, installed, mb, tags, range, license, author, shadowed}
- sound: el nombre que va en el código (s "sound")
- family: la categoría de la biblioteca de instrumentos (pianos, basses, percussion…) o "loops"
- role: para los golpes, bombo / caja / platos / percusion; para el resto, el tipo de muestra
- kind: hit (golpe) · pitched (instrumento afinado, una grabación por nota) · synth · engine · loop · midi
- origin: builtin (incluido) · library (biblioteca de instrumentos) · mine (tuyo / Freesound / pack / Maestro) · loop
"""
import os
import re
import unicodedata

import instcatalog as cat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_JS = os.path.join(ROOT, "web", "samples.js")

# Tipo de muestra (biblioteca de samples) → familia de la biblioteca de instrumentos y si es un golpe
TYPE_FAMILY = {
    "bombo": ("percussion", "hit"), "caja": ("percussion", "hit"), "platos": ("percussion", "hit"),
    "percusion": ("percussion", "hit"), "loop": ("loops", "loop"), "bajo": ("basses", "pitched"),
    "melodico": ("synth_keys", "pitched"), "pad": ("synth_pad", "pitched"), "voz": ("voices", "hit"),
    "fx": ("fx", "hit"), "synth": ("synth_lead", "synth"), "otro": ("fx", "hit"),
}
# Familias parecidas entre sí (para sugerir, cuando no hay nada de la misma familia)
NEAR = {
    "pianos": {"keys", "early", "synth_keys", "organs"}, "keys": {"pianos", "synth_keys", "organs"},
    "organs": {"keys", "pianos", "synth_pad"}, "early": {"pianos", "strings", "guitars"},
    "mallets": {"synth_keys", "percussion", "world"}, "guitars": {"world", "basses", "early"},
    "basses": {"synth_bass", "guitars"}, "synth_bass": {"basses", "synth_lead"},
    "strings": {"synth_pad", "early", "voices"}, "brass": {"woodwinds", "synth_lead"},
    "woodwinds": {"brass", "world"}, "voices": {"strings", "synth_pad"},
    "world": {"guitars", "percussion", "woodwinds", "mallets"}, "percussion": {"world", "fx"},
    "synth_lead": {"synth_keys", "brass", "synth_bass"}, "synth_pad": {"strings", "organs", "voices"},
    "synth_keys": {"pianos", "keys", "mallets", "synth_lead"}, "synth_fx": {"fx", "synth_pad"},
    "engines": {"synth_lead", "synth_pad"}, "fx": {"synth_fx", "percussion"}, "loops": {"percussion"},
}
# Sonidos incluidos con una familia más precisa que la de su tipo
BUILTIN_FAMILY = {"sax": "woodwinds", "gtr": "guitars", "pluck": "guitars", "sitar": "world", "arpy": "mallets",
                  "moog": "synth_lead", "casio": "synth_keys", "tabla": "world", "east": "world", "numbers": "voices",
                  "alphabet": "voices", "speech": "voices", "mouth": "voices", "yeah": "voices"}
# Los sintes incluidos que el catálogo de instrumentos ya describe mejor no se repiten
_B_RE = re.compile(r'B\("(\w+)",\s*"([\w.-]+)",\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\)')


def norm(text):
    """minúsculas y sin tildes, para buscar «organo» y encontrar «órgano»"""
    t = unicodedata.normalize("NFKD", str(text or "").lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def builtin_sounds():
    """Los sonidos de Dirt-Samples y sintes descritos en web/samples.js (BUILTIN): una sola fuente de verdad."""
    try:
        with open(SAMPLES_JS, encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return []
    start = src.find("export const BUILTIN")
    end = src.find("];", start)
    return [{"type": t, "name": n, "es": es, "en": en} for t, n, es, en in _B_RE.findall(src[start:end])]


def _role_from_name(name):
    n = name.lower()
    for role, pat in (("bombo", r"kick|bd"), ("caja", r"snare|sn|sd|clap|cp|rim"), ("platos", r"hat|hh|oh|cym|crash|ride|cr\b")):
        if re.search(pat, n):
            return role
    return ""


def build(lib=None, il=None, loops_list=None, loaded=None):
    """Todas las fichas. lib: samples.Library · il: instlib.InstLib · loops_list: loops.listing()["loops"]
    loaded: sonidos que SuperDirt tiene cargados ahora (para saber qué está «instalado» de verdad)."""
    items, by_sound = [], {}

    def add(entry):
        entry.setdefault("tags", "")
        entry.setdefault("installed", True)
        entry.setdefault("mb", 0)
        entry["key"] = f'{entry["origin"]}:{entry.get("id") or entry["sound"]}'
        items.append(entry)
        by_sound.setdefault(entry["sound"], []).append(entry)

    # 1) biblioteca de instrumentos (catálogo + importados)
    cat_sounds = set()
    if il is not None:
        for it in il.all_items():
            sound = it.get("sound") or it["id"]
            kind = {"multi": "pitched", "kit": "hit", "synth": "synth", "engine": "engine"}.get(it["kind"], "pitched")
            installed = il.installed(it["id"]) if it["kind"] in ("multi", "kit") else it["kind"] != "engine"
            if it["kind"] == "engine":
                installed = bool(loaded and sound in loaded)
            mine = it.get("src") == "user"
            add({"id": it["id"], "sound": sound, "es": it.get("es") or it["id"], "en": it.get("en") or it["id"],
                 "family": it.get("cat") or "fx", "role": it.get("voice") or "", "kind": kind,
                 "origin": "mine" if mine else ("builtin" if it.get("src") == "superdirt" else "library"),
                 "installed": bool(installed), "tags": it.get("tags") or "", "range": it.get("range"),
                 "group": it.get("group") or "", "extra": it.get("extra") or "",
                 "mb": 0 if installed or mine else _mb(it)})
            cat_sounds.add(sound)
    else:
        for it in cat.ITEMS:
            cat_sounds.add(it.get("sound") or it["id"])

    # 2) lo que trae SuperDirt (Dirt-Samples + sintes que el catálogo no tiene)
    for b in builtin_sounds():
        if b["name"] in cat_sounds:
            continue
        fam, kind = TYPE_FAMILY.get(b["type"], ("fx", "hit"))
        fam = BUILTIN_FAMILY.get(b["name"], fam)
        add({"sound": b["name"], "es": b["es"], "en": b["en"], "family": fam, "role": b["type"], "kind": kind,
             "origin": "builtin"})

    # 3) tus samples (subidos, Freesound, packs, Maestro). Las carpetas de instrumentos ya están arriba.
    loop_names = {x["name"] for x in (loops_list or [])}
    if lib is not None:
        meta = lib._meta()["sounds"]
        for s in lib.list()["sounds"]:
            name = s["name"]
            if not s["files"] or name in cat.BY_ID or os.path.isfile(os.path.join(lib.dir, name, "instrument.json")):
                continue
            if name in loop_names and all((meta.get(name, {}).get("loops") or {}).get(f["file"], {}).get("loop") for f in s["files"]):
                continue  # solo loops: van como loops
            fam, kind = TYPE_FAMILY.get(s["type"], ("fx", "hit"))
            f0 = s["files"][0]
            add({"sound": name, "es": name, "en": name, "family": fam, "role": s["type"] or _role_from_name(name),
                 "kind": kind, "origin": "mine", "source": s.get("source") or "local", "variants": len(s["files"]),
                 "license": f0.get("license_name") or "", "author": f0.get("author") or ""})

    # 4) loops largos
    for x in loops_list or []:
        add({"id": x["ref"], "sound": x["name"], "ref": x["ref"], "es": x["ref"], "en": x["ref"], "family": "loops",
             "role": x.get("kind") or "loop", "kind": "loop", "origin": "loop", "bpm": x.get("bpm"), "bars": x.get("bars"),
             "license": x.get("license_name") or "", "author": x.get("author") or ""})

    # 5) tu teclado MIDI como instrumento (s "midi"): siempre está, suena si lo has elegido en «Enviar a mi teclado»
    add({"sound": "midi", "es": "Mi teclado MIDI (suena en tu piano)", "en": "My MIDI keyboard (plays on your piano)",
         "family": "pianos", "role": "midi", "kind": "midi", "origin": "builtin", "tags": "teclado piano keyboard hardware"})

    # Nombres repetidos: el tuyo manda (SuperDirt carga tu carpeta después), y lo avisamos
    for sound, entries in by_sound.items():
        mine = [e for e in entries if e["origin"] in ("mine", "loop")]
        if mine and len(entries) > len(mine):
            for e in entries:
                if e["origin"] not in ("mine", "loop"):
                    e["shadowed"] = True
    return items


def _mb(it):
    try:
        import instlib
        return instlib.estimate_mb(it)
    except Exception:  # noqa: BLE001
        return 0


# ---------------------------------------------------------------- buscar y parecidos

def _words(e):
    syn = cat.SYNONYMS if isinstance(getattr(cat, "SYNONYMS", None), dict) else {}
    base = norm(" ".join(str(e.get(k) or "") for k in ("sound", "es", "en", "tags", "family", "role", "group")))
    extra = []
    for k, v in syn.items():
        if norm(k) in base:
            extra.append(norm(v if isinstance(v, str) else " ".join(v)))
    return base + " " + " ".join(extra)


def search(items, q, kind=None, origin=None, limit=60):
    """Buscar por nombre, sinónimo, familia o etiqueta (español o inglés, con o sin tildes)."""
    terms = [t for t in norm(q).replace(",", " ").split() if t]
    out = []
    for e in items:
        if kind and e["kind"] != kind:
            continue
        if origin == "installed" and not e.get("installed"):
            continue
        if origin == "download" and e.get("installed"):
            continue
        if origin and origin not in ("installed", "download") and e["origin"] != origin:
            continue
        if terms:
            w = _words(e)
            if not all(t in w for t in terms):
                continue
            score = sum(3 if norm(e["sound"]).startswith(t) else 2 if re.search(r"\b" + re.escape(t), w) else 1 for t in terms)
        else:
            score = 0
        out.append((score + (0.5 if e.get("installed") else 0), e))
    out.sort(key=lambda x: (-x[0], norm(x[1]["es"])))
    return [e for _, e in out[:limit]]


def find(items, sound):
    """La ficha de un sonido del código (prefiere la tuya, luego la instalada)."""
    sound = (sound or "").split(":")[0]
    cands = [e for e in items if e["sound"] == sound]
    cands.sort(key=lambda e: (e["origin"] not in ("mine", "loop"), not e.get("installed")))
    return cands[0] if cands else None


def similarity(a, b):
    """0..10: cuánto se parece b a a (misma familia, mismo papel, etiquetas, tipo y registro)."""
    if a["sound"] == b["sound"]:
        return -1
    s = 0.0
    if a["family"] == b["family"]:
        s += 4
    elif b["family"] in NEAR.get(a["family"], ()):
        s += 2
    if a.get("role") and a.get("role") == b.get("role"):
        s += 2.5
    if a.get("group") and a.get("group") == b.get("group"):
        s += 1
    hit_a, hit_b = a["kind"] in ("hit", "loop"), b["kind"] in ("hit", "loop")
    if a["kind"] == b["kind"]:
        s += 1.5
    elif hit_a != hit_b:
        s -= 3   # un golpe no sustituye bien a una melodía (ni al revés)
    ta, tb = set(norm(a.get("tags")).split()), set(norm(b.get("tags")).split())
    s += min(2, 0.5 * len(ta & tb))
    ra, rb = a.get("range"), b.get("range")
    if ra and rb:
        overlap = min(ra[1], rb[1]) - max(ra[0], rb[0])
        s += 1 if overlap >= 12 else -1 if overlap < 0 else 0
    return s


def suggest(items, sound, n=6):
    """Sonidos parecidos a `sound`: primero los que ya tienes, luego los que se bajan en un clic."""
    base = find(items, sound)
    if not base:
        role = _role_from_name(sound)
        base = {"sound": sound, "family": "percussion" if role else "synth_keys", "role": role,
                "kind": "hit" if role else "pitched", "tags": sound}
    scored = [(similarity(base, e), e) for e in items if e["kind"] not in ("midi",) and not e.get("shadowed")]
    scored = [(sc, e) for sc, e in scored if sc > 2]
    # de cada grupo (el mismo piano en tres bancos de sonido) solo el mejor, para que haya variedad
    seen, out = set(), []
    for sc, e in sorted(scored, key=lambda x: (-x[0], not x[1].get("installed"), x[1].get("mb") or 0)):
        g = e.get("group") or e["sound"]
        if g in seen:
            continue
        seen.add(g)
        out.append(dict(e, score=round(sc, 2)))
    have = [e for e in out if e.get("installed")][:n]
    more = [e for e in out if not e.get("installed")][: max(4, n - len(have))]
    return {"base": base, "have": have, "download": more}
