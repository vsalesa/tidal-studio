"""
Biblioteca de instrumentos: descarga, instalación, importación (SoundFont, SFZ, carpetas) y escucha previa.

Un instrumento instalado es una carpeta de samples/ con una grabación por nota, y cada archivo lleva su
nota MIDI delante (m060_C4.wav). SuperDirt la toca con notas gracias a studio-instruments.scd:
    d1 $ n "c5 e5 g5" # s "harpsichord_fluid"
Los kits (congas, gong…) son carpetas normales: n 0, n 1…

Se descarga solo cuando el alumno lo pide (o cuando Maestro lo usa en una canción y es pequeño).
Los MP3 de General MIDI se pasan a WAV con afconvert (macOS) o ffmpeg si los hay; si no, se quedan
en MP3 (SuperCollider 3.13+ los lee). Los WAV largos se recortan a 8 s y se guardan a 16 bits.
Solo biblioteca estándar.
"""
import io
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import instcatalog as cat
from samples import SampleError, safe_name, _fetch, check_remote, _lock

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "instrument-files.json")
NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
MAX_SEC = 8.0           # una nota no necesita más (y así la biblioteca no pesa gigas)
AUTO_MB = 12            # Maestro descarga solo lo que pese menos que esto; lo demás pide permiso
_files = None
_jobs = {}
_size_cache = {}


def note_label(midi):
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def files_map():
    global _files
    if _files is None:
        with open(DATA, "r", encoding="utf-8") as f:
            _files = json.load(f)
    return _files


# ---------------------------------------------------------------- qué hay que bajar
def plan(item):
    """[(url, nombre de archivo)] de un instrumento del catálogo."""
    if item["kind"] != "multi" and item["kind"] != "kit":
        return []
    if item["src"] in ("fluid", "musyng", "fatboy"):
        lo, hi = item["range"]
        base = cat.SOURCES[item["src"]]["base"] + item["gm"] + "-mp3/"
        notes = list(range(lo, hi + 1, cat.GM_STEP))
        if notes[-1] != hi:
            notes.append(hi)
        return [(base + note_label(m) + ".mp3", f"m{m:03d}_{note_label(m)}.mp3") for m in notes]
    f = files_map().get(item["id"])
    if not f:
        return []
    if "hits" in f:
        return [(f["base"] + p, f"{i:02d}_{os.path.basename(p).replace('%20', '-')}") for i, p in enumerate(f["hits"])]
    # "shift": semitonos que hay que sumar al nombre de la nota (medido con tools/measure_instrument_pitch.py)
    notes = sorted((int(k) + int(f.get("shift", 0)), v) for k, v in f["notes"].items())
    # Una grabación cada ~2 semitonos como mucho: suena igual y pesa la mitad
    keep, last = [], -99
    for m, p in notes:
        if m - last >= 3:
            keep.append((m, p))
            last = m
    ext = os.path.splitext(keep[0][1])[1].lower() if keep else ".wav"
    return [(f["base"] + p, f"m{m:03d}_{note_label(m)}{ext}") for m, p in keep]


def kind_of(item):
    f = files_map().get(item["id"]) if item["kind"] == "multi" and item["src"] in ("vcsl",) else None
    return "kit" if f and "hits" in f else item["kind"]


def estimate_mb(item):
    p = plan(item)
    if not p:
        return 0
    if item["src"] in ("fluid", "musyng", "fatboy"):
        return round(len(p) * 0.028, 1)   # ~28 kB por nota (3 s en MP3)
    if item["id"] in _size_cache:
        return _size_cache[item["id"]]
    f = files_map().get(item["id"]) or {}
    if f.get("mb"):   # medido con tools/build_instrument_files.py (tamaño de la descarga)
        return round(f["mb"] * len(p) / max(1, len(f.get("notes") or f.get("hits") or [1])), 1)
    return round(len(p) * 0.6, 1)


# ---------------------------------------------------------------- audio (sin dependencias)
def _wav_chunks(data):
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("no es WAV")
    pos, out = 12, {}
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        out.setdefault(cid, (pos + 8, size))
        pos += 8 + size + (size & 1)
    return out


def wav_to16(data, max_sec=None):
    """WAV de 16/24/32 bits o float → WAV de 16 bits, recortado a max_sec con un fundido final."""
    max_sec = MAX_SEC if max_sec is None else max_sec
    ch = _wav_chunks(data)
    fpos, _ = ch[b"fmt "]
    fmt, nch, sr = struct.unpack("<HHI", data[fpos:fpos + 8])
    bits = struct.unpack("<H", data[fpos + 14:fpos + 16])[0]
    if fmt == 0xFFFE:   # WAVE_FORMAT_EXTENSIBLE: el formato real va en el subformato
        fmt = struct.unpack("<H", data[fpos + 24:fpos + 26])[0]
    dpos, dsize = ch[b"data"]
    raw = data[dpos:dpos + dsize]
    width = bits // 8
    frames = len(raw) // (width * nch)
    keep = min(frames, int(sr * max_sec)) if max_sec else frames
    raw = raw[:keep * width * nch]
    if fmt == 1 and bits == 16:
        out = bytearray(raw)
    elif fmt == 1 and bits == 24:
        out = bytearray(len(raw) // 3 * 2)
        out[0::2] = raw[1::3]
        out[1::2] = raw[2::3]
    elif fmt == 1 and bits == 32:
        out = bytearray(len(raw) // 2)
        out[0::2] = raw[2::4]
        out[1::2] = raw[3::4]
    elif fmt == 3 and bits == 32:
        import array
        a = array.array("f")
        a.frombytes(raw)
        out = bytearray(struct.pack(f"<{len(a)}h", *(max(-32768, min(32767, int(x * 32767))) for x in a)))
    elif fmt == 1 and bits == 8:
        out = bytearray(struct.pack(f"<{len(raw)}h", *((b - 128) << 8 for b in raw)))
    else:
        raise ValueError(f"formato WAV no soportado ({fmt}, {bits} bits)")
    if keep < frames:   # fundido de 80 ms para que el corte no haga clic
        fade = min(keep, int(sr * 0.08))
        import array
        a = array.array("h")
        a.frombytes(bytes(out))
        n = len(a)
        for i in range(fade * nch):
            a[n - 1 - i] = int(a[n - 1 - i] * (i // nch) / fade)
        out = a.tobytes()
    return make_wav(bytes(out), sr, nch)


LEVEL_DB = -6.0     # pico al que se llevan los instrumentos WAV (VCSL y VSCO vienen a −20/−40 dB y casi no se oían)
MAX_BOOST_DB = 36.0


def wav_peak16(data):
    """Pico (0..1) de un WAV de 16 bits."""
    import array
    ch = _wav_chunks(data)
    dpos, dsize = ch[b"data"]
    a = array.array("h")
    a.frombytes(data[dpos:dpos + dsize - (dsize % 2)])
    return (max(max(a), -min(a)) / 32768.0) if len(a) else 0.0


def normalize_folder(folder, target_db=LEVEL_DB):
    """Sube todos los WAV de un instrumento con la MISMA ganancia, para que el más fuerte llegue a target_db.
    Así se conservan las diferencias entre golpes suaves y fuertes. Devuelve los dB que se han subido."""
    import array
    import math
    files = [os.path.join(folder, f) for f in sorted(os.listdir(folder)) if f.lower().endswith(".wav")]
    datas, peak = {}, 0.0
    for f in files:
        try:
            with open(f, "rb") as fh:
                d = fh.read()
            fpos, _ = _wav_chunks(d)[b"fmt "]
            if struct.unpack("<H", d[fpos + 14:fpos + 16])[0] != 16:
                continue
            datas[f] = d
            peak = max(peak, wav_peak16(d))
        except (OSError, ValueError, KeyError, struct.error):
            continue
    if not datas or peak <= 0:
        return 0.0
    boost = min(target_db - 20 * math.log10(peak), MAX_BOOST_DB)
    if boost < 1.0:   # ya está a buen nivel (o más fuerte): no se toca
        return 0.0
    g = 10 ** (boost / 20)
    for f, d in datas.items():
        ch = _wav_chunks(d)
        dpos, dsize = ch[b"data"]
        a = array.array("h")
        a.frombytes(d[dpos:dpos + dsize - (dsize % 2)])
        b = array.array("h", (max(-32768, min(32767, int(x * g))) for x in a))
        with open(f, "wb") as fh:
            fh.write(d[:dpos] + b.tobytes() + d[dpos + len(a) * 2:])
    return round(boost, 1)


def make_wav(pcm16, sr, nch=1):
    return (b"RIFF" + struct.pack("<I", 36 + len(pcm16)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, nch, sr, sr * nch * 2, nch * 2, 16)
            + b"data" + struct.pack("<I", len(pcm16)) + pcm16)


def converter():
    for exe in ("afconvert", "ffmpeg"):
        if shutil.which(exe):
            return exe
    return None


def to_wav(path):
    """Pasa un MP3/OGG/FLAC a WAV si hay con qué (afconvert en macOS, ffmpeg). Devuelve la ruta final."""
    exe = converter()
    if not exe:
        return path
    out = os.path.splitext(path)[0] + ".wav"
    cmd = ["afconvert", "-f", "WAVE", "-d", "LEI16", path, out] if exe == "afconvert" else \
        ["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-acodec", "pcm_s16le", out]
    try:
        subprocess.run(cmd, capture_output=True, timeout=60, check=True)
        if os.path.getsize(out) > 44:
            os.remove(path)
            return out
    except Exception:  # noqa: BLE001  si falla, el MP3 sigue sirviendo
        pass
    if os.path.exists(out) and out != path:
        try:
            os.remove(out)
        except OSError:
            pass
    return path


def store(folder, fname, data):
    """Guarda un archivo de audio en la carpeta del instrumento (WAV a 16 bits y recortado)."""
    os.makedirs(folder, exist_ok=True)
    ext = os.path.splitext(fname)[1].lower()
    if ext == ".wav":
        try:
            data = wav_to16(data)
        except (ValueError, KeyError, struct.error):
            pass
    path = os.path.join(folder, fname)
    with open(path, "wb") as f:
        f.write(data)
    if ext in (".mp3",):
        path = to_wav(path)
        if path.endswith(".wav"):   # recién convertido: también se recorta
            try:
                with open(path, "rb") as f:
                    pcm = wav_to16(f.read())
                with open(path, "wb") as f:
                    f.write(pcm)
            except (ValueError, KeyError, struct.error, OSError):
                pass
    return path


# ---------------------------------------------------------------- estado
class InstLib:
    def __init__(self, library, engine=None):
        self.lib = library
        self.engine = engine
        self.dir = library.dir

    def folder(self, iid):
        return os.path.join(self.dir, safe_name(iid))

    def installed(self, iid):
        d = self.folder(iid)
        return os.path.isdir(d) and any(f.lower().endswith((".wav", ".mp3", ".ogg", ".flac", ".aif", ".aiff")) for f in os.listdir(d))

    def user_items(self):
        out = []
        if not os.path.isdir(self.dir):
            return out
        for name in sorted(os.listdir(self.dir)):
            meta = os.path.join(self.dir, name, "instrument.json")
            if os.path.isfile(meta):
                try:
                    with open(meta, "r", encoding="utf-8") as f:
                        m = json.load(f)
                except (OSError, ValueError):
                    continue
                if m.get("src") == "user":
                    out.append({"id": name, "cat": "mine", "es": m.get("es") or name, "en": m.get("en") or name,
                                "kind": m.get("kind", "multi"), "src": "user", "photo": "analog_synth", "group": name,
                                "tags": m.get("tags", "") + " mío mine", "from": m.get("from", ""), "notes": m.get("notes", 0)})
        return out

    def all_items(self):
        return cat.ITEMS + self.user_items()

    def get(self, iid):
        return cat.BY_ID.get(iid) or next((u for u in self.user_items() if u["id"] == iid), None)

    def listing(self, engines=None):
        engines = engines or {}
        items = []
        for it in self.all_items():
            k = kind_of(it) if it["kind"] == "multi" else it["kind"]
            row = {k2: it.get(k2) for k2 in ("id", "cat", "es", "en", "src", "photo", "group", "tags", "voice", "range", "from")}
            row["kind"] = k
            row["sound"] = it.get("sound") or it["id"]
            row["extra"] = it.get("extra", "")
            if it["kind"] in ("multi", "kit"):
                row["installed"] = self.installed(it["id"])
                row["mb"] = estimate_mb(it) if it["src"] != "user" else 0
            elif it["kind"] == "engine":
                row["engine"] = it["engine"]
                row["installed"] = bool(engines.get(it["engine"], {}).get("ready"))
            else:
                row["installed"] = True
            items.append(row)
        cats = [{"id": c[0], "es": c[1], "en": c[2], "photo": c[3], "n": sum(1 for i in items if i["cat"] == c[0])} for c in cat.CATEGORIES]
        sources = {k: {kk: v.get(kk) for kk in ("name", "short", "license", "license_url", "author", "home", "es", "en")} for k, v in cat.SOURCES.items()}
        return {"categories": cats, "items": items, "sources": sources, "converter": converter(), "synonyms": cat.SYNONYMS}

    # ------------------------------------------------------------ instalar
    def install(self, iid, progress=None):
        it = self.get(iid)
        if not it:
            raise SampleError("Ese instrumento no está en el catálogo")
        if it["kind"] not in ("multi", "kit"):
            return {"id": iid, "files": 0, "loaded": True}
        files = plan(it)
        if not files:
            raise SampleError("No sé de dónde bajar ese instrumento")
        folder = self.folder(iid)
        tmp = folder + ".part"
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp, exist_ok=True)
        done = [0]
        total_bytes = [0]

        def one(job):
            url, fname = job
            check_remote(url)
            data = _fetch(url, 40 * 1024 * 1024)
            total_bytes[0] += len(data)
            store(tmp, fname, data)
            done[0] += 1
            if progress:
                progress(done[0], len(files))

        try:
            with ThreadPoolExecutor(6) as ex:
                list(ex.map(one, files))
        except Exception:
            shutil.rmtree(tmp, ignore_errors=True)
            raise
        src = cat.SOURCES.get(it["src"], {})
        boost = normalize_folder(tmp)
        with open(os.path.join(tmp, "instrument.json"), "w", encoding="utf-8") as f:
            json.dump({"id": iid, "src": it["src"], "es": it["es"], "en": it["en"], "kind": kind_of(it),
                       "license": src.get("license"), "author": src.get("author"), "home": src.get("home"),
                       "installed": time.strftime("%Y-%m-%d"), "level_db": boost}, f, ensure_ascii=False, indent=1)
        shutil.rmtree(folder, ignore_errors=True)
        os.replace(tmp, folder)
        _size_cache[iid] = round(total_bytes[0] / 1048576, 1)
        self._credit(iid, it, src)
        loaded = self.engine.reload_sample(folder, safe_name(iid)) if self.engine else False
        return {"id": iid, "files": len(files), "loaded": loaded, "mb": round(total_bytes[0] / 1048576, 1)}

    def _credit(self, iid, it, src):
        with _lock:
            meta = self.lib._meta()
            meta["sounds"][safe_name(iid)] = {
                "type": "percusion" if kind_of(it) == "kit" else "melodico", "source": "instrument",
                "files_meta": [{"file": "*", "title": f'{src.get("name", "")}: {it["en"]}', "author": src.get("author", ""),
                                "license_name": src.get("license", ""), "url": src.get("home", "")}] if src.get("author") else []}
            self.lib._save_meta(meta)

    def remove(self, iid):
        d = self.folder(iid)
        if not os.path.isfile(os.path.join(d, "instrument.json")):
            raise SampleError("Eso no es un instrumento de la biblioteca")
        shutil.rmtree(d, ignore_errors=True)
        with _lock:
            meta = self.lib._meta()
            meta["sounds"].pop(safe_name(iid), None)
            self.lib._save_meta(meta)
        if self.engine:
            self.engine.free_sample(safe_name(iid))
        return {"id": iid, "removed": True}

    # ------------------------------------------------------------ lo que necesita un código (cursos)
    def missing_in(self, codes):
        """Ids del catálogo que usan estos códigos ( s "…" ) y que aún no están descargados."""
        found = []
        for code in codes:
            for m in _SOUND_RX.finditer(str(code or "")):
                for word in re.findall(r"[A-Za-z][\w]*", m.group(1)):
                    it = cat.BY_ID.get(word)
                    if it and it["kind"] == "multi" and not self.installed(word) and word not in found:
                        found.append(word)
        return found

    def ensure(self, codes, progress=None):
        """Descarga los instrumentos que faltan para tocar estos códigos. No para si uno falla."""
        need = self.missing_in(codes)
        done, failed = [], []
        for k, iid in enumerate(need):
            if progress:
                progress(k, len(need))
            try:
                self.install(iid)
                done.append(iid)
            except Exception as e:  # noqa: BLE001  (sin red, GitHub caído…)
                failed.append({"id": iid, "es": cat.BY_ID[iid]["es"], "en": cat.BY_ID[iid]["en"], "error": str(e)})
        if progress:
            progress(len(need), len(need))
        return {"installed": done, "failed": failed}

    def level_old(self):
        """Los instrumentos WAV instalados antes de la 0.9 se oían muy bajos: se suben una vez."""
        out = []
        if not os.path.isdir(self.dir):
            return out
        for name in sorted(os.listdir(self.dir)):
            meta_f = os.path.join(self.dir, name, "instrument.json")
            if not os.path.isfile(meta_f):
                continue
            try:
                with open(meta_f, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                if meta.get("src") == "user" or "level_db" in meta:
                    continue
                meta["level_db"] = normalize_folder(os.path.join(self.dir, name))
                with open(meta_f, "w", encoding="utf-8") as f:
                    json.dump(meta, f, ensure_ascii=False, indent=1)
                if meta["level_db"]:
                    out.append(name)
                    if self.engine:
                        self.engine.reload_sample(os.path.join(self.dir, name), name)
            except (OSError, ValueError):
                continue
        return out

    # ------------------------------------------------------------ escuchar antes (y después) de instalar
    def preview(self, iid, midi):
        """(bytes, tipo, nota de la grabación) de la grabación más cercana a midi."""
        it = self.get(iid)
        if not it:
            raise SampleError("Instrumento desconocido")
        if self.installed(iid):
            d = self.folder(iid)
            files = sorted(f for f in os.listdir(d) if f.lower().endswith((".wav", ".mp3", ".ogg", ".flac")))
            roots = [(int(m.group(1)), f) for f in files for m in [re.match(r"m(\d{3})_", f)] if m]
            if roots:
                root, f = min(roots, key=lambda x: abs(x[0] - midi))
            else:
                f = files[min(max(0, midi - 60), len(files) - 1)] if files else None
                root = None
            if f:
                with open(os.path.join(d, f), "rb") as fh:
                    return fh.read(), _mime(f), root
        p = plan(it)
        if not p:
            raise SampleError("Este instrumento no tiene grabaciones")
        tagged = [(int(fn[1:4]), u, fn) for u, fn in p if re.match(r"m\d{3}_", fn)]
        if tagged:
            root, url, fn = min(tagged, key=lambda x: abs(x[0] - midi))
        else:
            url, fn = p[min(max(0, midi - 60), len(p) - 1)]
            root = None
        check_remote(url)
        return _fetch(url, 30 * 1024 * 1024), _mime(fn), root

    # ------------------------------------------------------------ importar tus instrumentos
    def import_dir(self):
        d = os.path.join(self.dir, ".imports")
        os.makedirs(d, exist_ok=True)
        return d

    def write_user_meta(self, iid, es, frm, kind="multi", notes=0, tags=""):
        with open(os.path.join(self.folder(iid), "instrument.json"), "w", encoding="utf-8") as f:
            json.dump({"id": iid, "src": "user", "es": es, "en": es, "kind": kind, "from": frm, "notes": notes, "tags": tags,
                       "installed": time.strftime("%Y-%m-%d")}, f, ensure_ascii=False, indent=1)
        with _lock:
            meta = self.lib._meta()
            meta["sounds"].setdefault(safe_name(iid), {"files_meta": []}).update(
                {"type": "percusion" if kind == "kit" else "melodico", "source": "instrument"})
            self.lib._save_meta(meta)

    def upload(self, filename, data, name=None, root=None):
        """Lo que arrastras al importador: .sf2, .zip (SFZ o carpeta de notas) o archivos de audio sueltos."""
        base, ext = os.path.splitext(os.path.basename(filename or ""))
        ext = ext.lower()
        if ext in (".sf2", ".sf3"):
            if ext == ".sf3":
                raise SampleError("Los .sf3 van comprimidos: guárdalo como .sf2 (por ejemplo con Polyphone) y vuelve a probar")
            path = os.path.join(self.import_dir(), safe_name(base) + ".sf2")
            with open(path, "wb") as f:
                f.write(data)
            presets = SF2(path).presets()
            return {"kind": "sf2", "file": os.path.basename(path), "presets": presets}
        if ext == ".zip":
            return self._import_zip(base, data, name)
        if ext == ".sfz":
            raise SampleError("Un .sfz necesita sus grabaciones: comprime la carpeta entera en un .zip y arrástrala")
        if ext in (".wav", ".aif", ".aiff", ".flac", ".ogg", ".mp3"):
            iid = safe_name(name or base)
            if not iid:
                raise SampleError("Ponle un nombre al instrumento")
            m = midi_in_name(base)
            if m is None:
                m = int(root) if root not in (None, "") else 60
            folder = self.folder(iid)
            os.makedirs(folder, exist_ok=True)
            fname = f"m{m:03d}_{note_label(m)}{ext}"
            store(folder, fname, data)
            n = len([f for f in os.listdir(folder) if f.startswith("m")])
            self.write_user_meta(iid, name or base, filename, "multi", n)
            loaded = self.engine.reload_sample(folder, iid) if self.engine else False
            return {"kind": "audio", "id": iid, "note": note_label(m), "notes": n, "loaded": loaded}
        raise SampleError("Arrastra un SoundFont (.sf2), un .zip con un SFZ o con grabaciones por nota, o archivos de audio")

    def _import_zip(self, base, data, name):
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            raise SampleError("Ese .zip está roto")
        names = [n for n in z.namelist() if not n.endswith("/") and "__MACOSX" not in n]
        sfz = [n for n in names if n.lower().endswith(".sfz")]
        iid = safe_name(name or base)
        if not iid:
            raise SampleError("Ponle un nombre al instrumento")
        if sfz:
            return self._import_sfz(z, names, sfz[0], iid, name or base)
        audio = [n for n in names if n.lower().endswith((".wav", ".aif", ".aiff", ".flac", ".ogg", ".mp3"))]
        if not audio:
            raise SampleError("En el .zip no hay grabaciones")
        folder = self.folder(iid)
        shutil.rmtree(folder, ignore_errors=True)
        noted = [(midi_in_name(os.path.basename(n)), n) for n in audio]
        if sum(1 for m, _ in noted if m is not None) >= max(2, len(audio) // 2):
            seen = {}
            for m, n in noted:
                if m is not None and m not in seen:
                    seen[m] = n
            for m, n in sorted(seen.items()):
                store(folder, f"m{m:03d}_{note_label(m)}{os.path.splitext(n)[1].lower()}", z.read(n))
            kind, count = "multi", len(seen)
        else:   # sin notas en el nombre: un kit de golpes (n 0, n 1…)
            for i, n in enumerate(sorted(audio)[:64]):
                store(folder, f"{i:02d}_{safe_name(os.path.splitext(os.path.basename(n))[0])[:40] or 'hit'}{os.path.splitext(n)[1].lower()}", z.read(n))
            kind, count = "kit", min(64, len(audio))
        self.write_user_meta(iid, name or base, base + ".zip", kind, count)
        loaded = self.engine.reload_sample(folder, iid) if self.engine else False
        return {"kind": kind, "id": iid, "notes": count, "loaded": loaded}

    def _import_sfz(self, z, names, sfz_name, iid, label):
        text = z.read(sfz_name).decode("utf-8", "replace")
        regions = parse_sfz(text)
        folder = self.folder(iid)
        shutil.rmtree(folder, ignore_errors=True)
        lower = {n.lower().replace("\\", "/"): n for n in names}
        sfz_dir = os.path.dirname(sfz_name)
        picked = {}
        for r in regions:
            if r.get("trigger") == "release":
                continue
            lv, hv = int(r.get("lovel", 1)), int(r.get("hivel", 127))
            if not lv <= 100 <= hv:
                continue
            root = parse_key(r.get("pitch_keycenter")) if r.get("pitch_keycenter") is not None else parse_key(r.get("key"))
            if root is None:
                root = parse_key(r.get("lokey"))
            if root is None:
                root = 60
            if root in picked:
                continue
            rel = (r.get("default_path", "") + r.get("sample", "")).replace("\\", "/")
            path = os.path.normpath(os.path.join(sfz_dir, rel)).replace("\\", "/")
            real = lower.get(path.lower()) or lower.get(rel.lower())
            if real:
                picked[root] = real
        if not picked:
            raise SampleError("No encuentro las grabaciones que nombra el .sfz dentro del .zip")
        for m, n in sorted(picked.items()):
            store(folder, f"m{m:03d}_{note_label(m)}{os.path.splitext(n)[1].lower()}", z.read(n))
        self.write_user_meta(iid, label, os.path.basename(sfz_name), "multi", len(picked))
        loaded = self.engine.reload_sample(folder, iid) if self.engine else False
        return {"kind": "sfz", "id": iid, "notes": len(picked), "loaded": loaded}

    def import_sf2(self, file, presets, progress=None):
        path = os.path.join(self.import_dir(), os.path.basename(file))
        if not os.path.isfile(path):
            raise SampleError("Vuelve a arrastrar el SoundFont")
        sf = SF2(path)
        allp = sf.presets()
        want = [p for p in allp if p["key"] in set(presets or [])] or allp[:1]
        base = safe_name(os.path.splitext(os.path.basename(file))[0])[:24]
        out = []
        for i, p in enumerate(want[:200]):
            iid = safe_name(f"{base}_{p['name']}")[:60] or f"{base}_{p['preset']}"
            folder = self.folder(iid)
            shutil.rmtree(folder, ignore_errors=True)
            n = sf.render(p["key"], folder)
            if n:
                self.write_user_meta(iid, p["name"], os.path.basename(file), "multi", n, "soundfont sf2")
                if self.engine:
                    self.engine.reload_sample(folder, iid)
                out.append({"id": iid, "name": p["name"], "notes": n})
            if progress:
                progress(i + 1, len(want))
        return {"imported": out}

    # ------------------------------------------------------------ trabajos en segundo plano
    def start_job(self, kind, fn):
        jid = uuid.uuid4().hex[:12]
        job = {"id": jid, "kind": kind, "state": "running", "done": 0, "total": 0, "result": None, "error": None}
        _jobs[jid] = job

        def prog(d, t):
            job["done"], job["total"] = d, t

        def run():
            try:
                job["result"] = fn(prog)
                job["state"] = "done"
            except Exception as e:  # noqa: BLE001
                job["state"], job["error"] = "error", str(e)
        threading.Thread(target=run, daemon=True).start()
        return job

    @staticmethod
    def job(jid):
        return _jobs.get(jid)


def _mime(f):
    return {".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".flac": "audio/flac"}.get(os.path.splitext(f)[1].lower(), "application/octet-stream")


# ---------------------------------------------------------------- notas en nombres de archivo
_NOTE_RX = re.compile(r"(?<![A-Za-z])([A-Ga-g])(#|b|s|♯|♭)?(-?\d)(?![0-9])")
_PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def midi_in_name(name):
    """«Piano_C#4_mf.wav» → 61; «violin-060.wav» → 60. None si no hay nota."""
    stem = os.path.splitext(name)[0]
    for m in _NOTE_RX.finditer(stem):
        pc = _PC[m.group(1).lower()] + {"#": 1, "s": 1, "♯": 1, "b": -1, "♭": -1, None: 0}[m.group(2)]
        midi = (int(m.group(3)) + 1) * 12 + pc
        if 12 <= midi <= 120:
            return midi
    m = re.search(r"(?<!\d)(\d{2,3})(?!\d)", stem)
    if m and 21 <= int(m.group(1)) <= 108:
        return int(m.group(1))
    return None


def parse_key(v):
    if v is None:
        return None
    v = str(v).strip()
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    m = re.fullmatch(r"([A-Ga-g])(#|b)?(-?\d)", v)
    if m:
        return (int(m.group(3)) + 1) * 12 + _PC[m.group(1).lower()] + {"#": 1, "b": -1, None: 0}[m.group(2)]
    return None


def parse_sfz(text):
    """Regiones de un .sfz con los valores heredados de <control>, <global>, <master> y <group>."""
    text = re.sub(r"//[^\n]*", "", text)
    tokens = re.split(r"(<\w+>)", text)
    ctl, glob, master, group, regions = {}, {}, {}, {}, []
    cur, head = None, None
    for tok in tokens:
        if re.fullmatch(r"<\w+>", tok):
            head = tok[1:-1].lower()
            if head == "region":
                cur = {}
                regions.append(cur)
            elif head == "group":
                group, cur = {}, None
            elif head == "master":
                master, group, cur = {}, {}, None
            elif head == "global":
                glob, cur = {}, None
            continue
        if head is None:
            continue
        # opcode=valor; el valor de sample= puede llevar espacios (hasta el siguiente opcode)
        for m in re.finditer(r"(\w+)=(.*?)(?=\s+\w+=|\s*$)", tok.strip(), re.S):
            k, v = m.group(1), m.group(2).strip()
            target = {"control": ctl, "global": glob, "master": master, "group": group}.get(head, cur)
            if target is not None:
                target[k] = v
        if head == "region" and cur is not None:
            merged = {**ctl, **glob, **master, **group, **cur}
            cur.clear()
            cur.update(merged)
    return regions


# ---------------------------------------------------------------- SoundFont 2
class SF2:
    """Lector mínimo de SoundFont 2: lista los presets y saca una grabación por nota de cada uno."""

    def __init__(self, path):
        self.path = path
        with open(path, "rb") as f:
            data = f.read()
        if data[:4] != b"RIFF" or data[8:12] != b"sfbk":
            raise SampleError("Ese archivo no es un SoundFont 2")
        self.data = data
        self.chunks = {}
        pos = 12
        while pos + 8 <= len(data):
            cid, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
            if cid == b"LIST":
                sub = pos + 12
                end = pos + 8 + size
                while sub + 8 <= end:
                    sid, ssize = data[sub:sub + 4], struct.unpack("<I", data[sub + 4:sub + 8])[0]
                    self.chunks[sid] = (sub + 8, ssize)
                    sub += 8 + ssize + (ssize & 1)
            pos += 8 + size + (size & 1)
        for need in (b"phdr", b"pbag", b"pgen", b"inst", b"ibag", b"igen", b"shdr", b"smpl"):
            if need not in self.chunks:
                raise SampleError("Al SoundFont le falta una parte (" + need.decode() + ")")

    def _recs(self, cid, size, fmt):
        pos, total = self.chunks[cid]
        return [struct.unpack(fmt, self.data[pos + i * size:pos + (i + 1) * size]) for i in range(total // size)]

    @staticmethod
    def _name(b):
        return b.split(b"\0", 1)[0].decode("latin-1").strip()

    def presets(self):
        out = []
        for r in self._recs(b"phdr", 38, "<20sHHHIII")[:-1]:
            name, preset, bank = self._name(r[0]), r[1], r[2]
            out.append({"key": f"{bank}:{preset}", "name": name or f"Preset {preset}", "bank": bank, "preset": preset,
                        "drums": bank == 128})
        out.sort(key=lambda p: (p["bank"], p["preset"]))
        return out

    def _zones(self, bags, gens, start, end):
        """Zonas (diccionario de generadores) entre los índices de bag start..end; la primera puede ser global."""
        zones = []
        for b in range(start, end):
            g0, g1 = bags[b][0], bags[b + 1][0]
            z = {}
            for oper, amt in gens[g0:g1]:
                z[oper] = amt
            zones.append(z)
        return zones

    def render(self, key, folder):
        phdr = self._recs(b"phdr", 38, "<20sHHHIII")
        pbag = self._recs(b"pbag", 4, "<HH")
        pgen = [(o, a) for o, a in self._recs(b"pgen", 4, "<HH")]
        inst = self._recs(b"inst", 22, "<20sH")
        ibag = self._recs(b"ibag", 4, "<HH")
        igen = [(o, a) for o, a in self._recs(b"igen", 4, "<HH")]
        shdr = self._recs(b"shdr", 46, "<20sIIIIIBbHH")
        spos, _ = self.chunks[b"smpl"]
        bank, preset = (int(x) for x in key.split(":"))
        idx = next((i for i, r in enumerate(phdr[:-1]) if r[1] == preset and r[2] == bank), None)
        if idx is None:
            return 0
        pz = self._zones(pbag, pgen, phdr[idx][3], phdr[idx + 1][3])
        rng = lambda a: (a & 0xFF, a >> 8)
        s16 = lambda a: a - 65536 if a > 32767 else a
        picked = {}
        drums = bank == 128
        for z in pz:
            if 41 not in z:
                continue
            ii = z[41]
            plo, phi = rng(z.get(43, 0x7F00))
            iz = self._zones(ibag, igen, inst[ii][1], inst[ii + 1][1])
            glob = iz[0] if iz and 53 not in iz[0] else {}
            for zz in iz:
                if 53 not in zz:
                    continue
                g = {**glob, **zz}
                klo, khi = rng(g.get(43, 0x7F00))
                vlo, vhi = rng(g.get(44, 0x7F00))
                if not (vlo <= 100 <= vhi) or khi < plo or klo > phi:
                    continue
                sh = shdr[g[53]]
                if sh[9] & 0x8000 or sh[9] == 2:   # ROM o canal derecho de un par estéreo: nos basta el izquierdo
                    continue
                root = g[58] if 58 in g and g[58] < 128 else sh[6]
                root -= s16(g.get(51, 0))   # coarseTune en semitonos
                file_key = klo if drums else root
                if drums:   # en un kit cada tecla es un golpe: se guarda en su tecla y suena sin afinar
                    root = file_key
                if file_key in picked:
                    continue
                start = sh[1] + s16(g.get(0, 0)) + 32768 * s16(g.get(4, 0))
                end = sh[2] + s16(g.get(1, 0)) + 32768 * s16(g.get(12, 0))
                ls = sh[3] + s16(g.get(2, 0)) + 32768 * s16(g.get(45, 0))
                le = sh[4] + s16(g.get(3, 0)) + 32768 * s16(g.get(50, 0))
                loop = g.get(54, 0) in (1, 3) and start <= ls < le <= end
                picked[file_key] = (start, end, ls, le, loop, sh[5] or 44100, root if not drums else file_key)
        os.makedirs(folder, exist_ok=True)
        n = 0
        for k, (start, end, ls, le, loop, sr, root) in sorted(picked.items()):
            raw = self.data[spos + start * 2:spos + end * 2]
            if loop and (end - start) < sr * 3:
                # las notas de un SoundFont suelen ser cortas y repetir un trozo (el bucle) mientras se mantienen:
                # lo desenrollamos hasta unos 3 s y terminamos con un fundido
                head = self.data[spos + start * 2:spos + le * 2]
                seg = self.data[spos + ls * 2:spos + le * 2]
                body = bytearray(head)
                while len(body) < sr * 2 * 3 and seg:
                    body += seg
                raw = _fade_tail(bytes(body), sr)
            if len(raw) < 64:
                continue
            with open(os.path.join(folder, f"m{k:03d}_{note_label(k)}.wav"), "wb") as f:
                f.write(make_wav(raw, sr, 1))
            n += 1
        return n


def _fade_tail(pcm, sr, sec=0.4):
    import array
    a = array.array("h")
    a.frombytes(pcm[: len(pcm) // 2 * 2])
    n = len(a)
    fade = min(n, int(sr * sec))
    for i in range(fade):
        a[n - 1 - i] = int(a[n - 1 - i] * i / fade)
    return a.tobytes()


def for_maestro(il, text, limit=36):
    """Instrumentos que encajan con lo que pide el alumno (para el mensaje de sistema de Maestro)."""
    words = [w for w in re.findall(r"[a-záéíóúñü0-9]+", (text or "").lower()) if len(w) > 2]
    extra = []
    for w in words:
        if w in cat.SYNONYMS:
            extra += [x.strip() for x in cat.SYNONYMS[w].split(",") if x.strip()]
    q = set(words + extra)
    if not q:
        return []
    scored = []
    for it in il.all_items():
        hay = f'{it["id"]} {it["es"]} {it["en"]} {it.get("tags", "")}'.lower()
        sc = sum(2 if re.search(r"\b" + re.escape(w) + r"\b", hay) else 0 for w in q)
        if sc:
            pref = {"fluid": 0.3, "vsco2": 0.6, "vcsl": 0.5, "salamander": 0.6, "user": 1}.get(it["src"], 0)
            scored.append((sc + pref, it))
    scored.sort(key=lambda x: -x[0])
    return [x[1] for x in scored[:limit]]


# ---------------------------------------------------------------- Maestro
PROMPT = """

BIBLIOTECA DE INSTRUMENTOS (más de 600, al estilo de GarageBand): además de Dirt-Samples, el alumno puede tocar instrumentos CONCRETOS grabados nota a nota. Úsalos cuando pida un instrumento real o un estilo que lo pida (barroco → clavecín, jazz → contrabajo pizzicato y vibráfono, orquesta → cuerdas VSCO, India → sitar…). Se tocan con notas, como un sintetizador: n "c5 e5 g5" # s "<id>" (c5 = do central; n "c3" para bajos). Los kits de golpes (congas, gong…) van con n 0, n 1…
- Ids General MIDI: <nombre_gm>_<juego>, con juego fluid (ligero), musyng (más realista) o fatboy. Ej.: acoustic_grand_piano_musyng, harpsichord_fluid, contrabass_musyng, string_ensemble_1_musyng, choir_aahs_fluid, sitar_fluid, steel_drums_fatboy, electric_piano_1_musyng, drawbar_organ_fluid, tango_accordion_fluid.
- Orquesta VSCO 2: vsco_contrabass_pizz/arco/spic/trem, vsco_violin_arco/pizz, vsco_violins_arco/pizz/spic/trem, vsco_violas_*, vsco_cellos_arco/pizz/spic/trem, vsco_harp, vsco_horn, vsco_trumpet, vsco_trombone, vsco_tuba, vsco_flute, vsco_oboe, vsco_clarinet, vsco_bassoon, vsco_upright.
- Modelos concretos: steinway_b, salamander_grand (Yamaha C5), kawai_grand, hohner_special20, hohner_super64, pipe_organ_loud, renaissance_organ_8, recorder_alto, dan_tranh, folk_harp, psaltery_bow, balafon, mbira_kenya, vibraphone_soft.
- Synths sin descarga: superpiano, supersaw, superhoover, superreese, ts_rhodes, ts_organ, ts_pluck, ts_strings, ts_pad, ts_brass, ts_bell, ts_acid (# cutoff, # resonance), ts_sub, ts_wobble, ts_choir (# vowel 0-4), ts_juno, ts_lead, ts_marimba, ts_flute.
- Si usas uno que el alumno aún no tiene descargado, la app lo descarga sola (los pequeños) o le pide permiso; no hace falta "descargar" para estos. Cuéntale en el mensaje qué instrumento concreto has elegido y por qué.
{lista}"""


def maestro_lines(il, text, limit=24, with_mine=True):
    """Instrumentos descargados + los que encajan con el mensaje (para que Maestro elija bien).
    with_mine=False: los descargados ya van en el inventario (inventory.py), aquí solo los que encajan."""
    lines = []
    mine = [it for it in il.all_items() if it["kind"] in ("multi", "kit") and il.installed(it["id"])]
    if mine and with_mine:
        lines.append("Ya descargados: " + ", ".join(f'{it["id"]} ({it["es"]})' for it in mine[:40]))
    hits = [it for it in for_maestro(il, text, limit) if it not in mine]
    if hits:
        lines.append("Encajan con lo que pide: " + ", ".join(f'{it["id"]} ({it["es"]}{"; kit" if kind_of(it) == "kit" else ""})' for it in hits))
    return lines


_SOUND_RX = re.compile(r'(?:\bs|\bsound)\s+"([^"]+)"')


def used_instruments(il, reply):
    """Ids del catálogo que usa el código de una respuesta de Maestro y que aún no están descargados."""
    blocks = [reply.get("cambios") or {}] + [v.get("cambios") or {} for v in reply.get("variantes") or []] \
        + [x.get("cambios") or {} for x in reply.get("sugerencias") or []]
    found = []
    for b in blocks:
        for p in b.get("pistas") or []:
            for m in _SOUND_RX.finditer(str(p.get("codigo") or "")):
                for word in re.findall(r"[A-Za-z][\w]*", m.group(1)):
                    it = cat.BY_ID.get(word)
                    if it and it["kind"] in ("multi",) and not il.installed(word) and word not in found:
                        found.append(word)
    return found


def auto_install(il, reply, log=None):
    """Descarga ya los instrumentos pequeños que usa Maestro; los grandes quedan pendientes de permiso."""
    out = []
    for iid in used_instruments(il, reply)[:3]:
        it = cat.BY_ID[iid]
        mb = estimate_mb(it)
        item = {"id": iid, "es": it["es"], "en": it["en"], "mb": mb}
        if mb > AUTO_MB:
            item["estado"] = "permiso"
        else:
            try:
                il.install(iid)
                item["estado"] = "descargado"
            except Exception as e:  # noqa: BLE001
                item["estado"], item["error"] = "error", str(e)
        if log:
            log(item)
        out.append(item)
    return out
