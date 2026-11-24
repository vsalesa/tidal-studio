"""Sonidos que aprenden (Maestro v2, release 0.16).

- Análisis de sonido BAJO DEMANDA: eliges qué analizar (tu biblioteca, lo que has descargado, tus packs
  comprados, las pistas separadas de tus audios) y se miden ataque, caída, brillo, altura (nota) y ruido.
  Con el WAV basta la biblioteca estándar de Python; para mp3/ogg/flac/aiff se usa librosa del entorno de
  herramientas de audio (el mismo de MSST/Demucs), si está instalado.
- Las medidas van a SQLite (maestro-data/sounds.db). Los packs comprados se marcan «solo local»: se analizan
  donde están, no se copian, no se suben a GitHub y no salen en el dataset exportado.
- Cuatro estados por instrumento: en el catálogo → descargado → cargado en SuperDirt → suena de verdad.
  Maestro solo propone lo que suena.
- El ranking aprende de tus elecciones (sin LLM): cada vez que eliges un sonido entre varios, gana puntos en
  ese papel y ese género, y los que no elegiste pierden un poco.
"""
import array
import io
import json
import math
import os
import sqlite3
import struct
import subprocess
import threading
import time
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_EXT = (".wav", ".aif", ".aiff", ".flac", ".ogg", ".mp3")
STATES = ("catalog", "downloaded", "loaded", "playable")
FEATURE_KEYS = ("dur", "attack", "decay", "bright", "noise", "pitch", "level")
SR = 11025          # analizamos a 11 kHz: de sobra para estas medidas y rápido en Python puro
MAX_SEC = 3.0


# ---------------------------------------------------------------- medidas (biblioteca estándar)

def _pcm_from_wav(data):
    """WAV (16/24/32 bits o float, por medio de instlib.wav_to16) → (muestras mono float, frecuencia)."""
    import instlib
    w16 = instlib.wav_to16(data, max_sec=MAX_SEC)
    with wave.open(io.BytesIO(w16)) as w:
        nch, sr, n = w.getnchannels(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    a = array.array("h")
    a.frombytes(raw[: len(raw) - len(raw) % 2])
    if nch > 1:
        a = [sum(a[i:i + nch]) / nch for i in range(0, len(a) - nch + 1, nch)]
    step = max(1, round(sr / SR))
    x = [v / 32768.0 for v in a[::step]]
    return x, sr / step


def _dft_mag(frame):
    """Magnitudes del espectro de una ventana corta (DFT directa con tabla de senos; N pequeño)."""
    n = len(frame)
    win = [frame[i] * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1))) for i in range(n)]
    cos_t = [math.cos(2 * math.pi * k / n) for k in range(n)]
    sin_t = [math.sin(2 * math.pi * k / n) for k in range(n)]
    out = []
    for k in range(1, n // 2):
        re = im = 0.0
        idx = 0
        for v in win:
            re += v * cos_t[idx]
            im -= v * sin_t[idx]
            idx = (idx + k) % n
        out.append(math.hypot(re, im))
    return out


def _pitch(x, sr):
    """Altura por autocorrelación (40-1000 Hz). Devuelve (midi, claridad 0..1) o (None, 0)."""
    n = min(len(x), 1536)
    if n < 400:
        return None, 0.0
    seg = x[:n]
    mean = sum(seg) / n
    seg = [v - mean for v in seg]
    e0 = sum(v * v for v in seg) or 1e-12
    lo, hi = int(sr / 1000), int(sr / 40)
    best, best_lag, dipped = 0.0, 0, False
    for lag in range(2, min(hi, n // 2)):
        c = 0.0
        for i in range(n - lag):
            c += seg[i] * seg[i + lag]
        c /= e0
        if not dipped:          # el primer pico de verdad viene después de que la autocorrelación baje de 0
            dipped = c < 0
            continue
        if lag >= lo and c > best:
            best, best_lag = c, lag
    if best < 0.45 or not best_lag:
        return None, round(max(0.0, best), 2)
    f0 = sr / best_lag
    return round(69 + 12 * math.log2(f0 / 440.0), 1), round(best, 2)


def features_from_samples(x, sr):
    """Ataque, caída, brillo, ruido, altura y nivel de unas muestras mono (floats -1..1)."""
    if not x:
        return None
    hop = max(1, int(sr * 0.01))  # envolvente cada 10 ms
    env = []
    for i in range(0, len(x), hop):
        fr = x[i:i + hop]
        env.append(math.sqrt(sum(v * v for v in fr) / len(fr)))
    peak = max(env) or 1e-9
    ipk = env.index(peak)
    start = next((i for i, v in enumerate(env) if v > peak * 0.1), 0)
    top = next((i for i, v in enumerate(env) if v >= peak * 0.9), ipk)   # el ataque acaba al llegar al 90 %
    after = next((i for i in range(ipk, len(env)) if env[i] < peak * 0.1), len(env))
    attack = max(0.0, (top - start) * 0.01)
    decay = max(0.01, (after - ipk) * 0.01)
    # espectro: 4 ventanas de 256 muestras desde el pico
    n = 256
    p0 = ipk * hop
    mags = None
    for j in range(4):
        fr = x[p0 + j * n: p0 + (j + 1) * n]
        if len(fr) < n:
            break
        m = _dft_mag(fr)
        mags = m if mags is None else [a + b for a, b in zip(mags, m)]
    bright = noise = 0.0
    if mags:
        tot = sum(mags) or 1e-12
        centroid = sum((k + 1) * v for k, v in enumerate(mags)) / tot   # en «bins» (0 … n/2)
        bright = min(1.0, centroid / (n / 2) * 2.2)                       # 0 oscuro … 1 muy brillante
        pw = [v * v + 1e-12 for v in mags]
        geo = math.exp(sum(math.log(v) for v in pw) / len(pw))
        noise = min(1.0, (geo / (sum(pw) / len(pw))) ** 0.5 * 1.6)      # planitud espectral: 0 tono … 1 ruido
    pitch, clarity = _pitch(x[p0 + int(0.02 * sr):], sr)
    if clarity < 0.6:
        noise = max(noise, 0.5 * (1 - clarity))
    return {"dur": round(len(x) / sr, 2), "attack": round(attack, 3), "decay": round(min(decay, MAX_SEC), 2),
            "bright": round(bright, 2), "noise": round(noise, 2), "pitch": pitch,
            "level": round(20 * math.log10(peak), 1)}


def analyze_file(path):
    """Medidas de un archivo de audio con la biblioteca estándar (solo WAV). None si hace falta librosa."""
    if not path.lower().endswith(".wav"):
        return None
    with open(path, "rb") as f:
        data = f.read(int(48000 * 4 * 2 * (MAX_SEC + 1)) + 4096)
    try:
        x, sr = _pcm_from_wav(data)
    except Exception:  # noqa: BLE001  WAV raro o recortado
        return None
    return features_from_samples(x, sr)


def describe(f, en=False):
    """Las medidas en palabras: «ataque seco, brillante, nota c3, cola corta»."""
    if not f:
        return ""
    w = []
    w.append(("percussive attack" if en else "ataque seco") if f.get("attack", 1) < 0.015 else
             ("soft attack" if en else "ataque suave") if f.get("attack", 0) > 0.08 else ("medium attack" if en else "ataque medio"))
    b = f.get("bright", 0)
    w.append(("dark" if en else "oscuro") if b < 0.25 else ("bright" if en else "brillante") if b > 0.55 else ("warm" if en else "cálido"))
    if f.get("noise", 0) > 0.55:
        w.append("noisy" if en else "ruidoso")
    if f.get("pitch") is not None:
        p = int(round(f["pitch"]))
        names = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"]
        w.append(("note " if en else "nota ") + f"{names[p % 12]}{p // 12 - 1}")
    d = f.get("decay", 0)
    w.append(("short tail" if en else "cola corta") if d < 0.2 else ("long tail" if en else "cola larga") if d > 1.0 else ("medium tail" if en else "cola media"))
    return ", ".join(w)


def distance(a, b):
    """0 (iguales) … 1 (nada que ver) entre dos juegos de medidas."""
    if not a or not b:
        return 0.5
    d = 0.0
    d += min(1, abs(math.log((a.get("attack", 0) + 0.005) / (b.get("attack", 0) + 0.005))) / 3) * 0.25
    d += min(1, abs(math.log((a.get("decay", 0) + 0.02) / (b.get("decay", 0) + 0.02))) / 3) * 0.2
    d += abs(a.get("bright", 0) - b.get("bright", 0)) * 0.25
    d += abs(a.get("noise", 0) - b.get("noise", 0)) * 0.15
    pa, pb = a.get("pitch"), b.get("pitch")
    d += (min(1, abs(pa - pb) / 24) if pa is not None and pb is not None else 0.5 if (pa is None) != (pb is None) else 0) * 0.15
    return round(d, 3)


# ---------------------------------------------------------------- de dónde salen los sonidos

def dirt_samples_dir():
    """La carpeta Dirt-Samples de SuperDirt, si la encontramos (instalador offline o quarks del usuario)."""
    cands = []
    if os.environ.get("TIDAL_DIRT_SAMPLES"):
        cands.append(os.environ["TIDAL_DIRT_SAMPLES"])
    conf = os.environ.get("TIDAL_SCLANG_CONF")
    if conf:
        cands.append(os.path.join(os.path.dirname(conf), "quarks", "Dirt-Samples"))
    home = os.path.expanduser("~")
    cands += [os.path.join(home, "Library", "Application Support", "SuperCollider", "downloaded-quarks", "Dirt-Samples"),
              os.path.join(home, ".local", "share", "SuperCollider", "downloaded-quarks", "Dirt-Samples"),
              os.path.join(os.environ.get("LOCALAPPDATA", home), "SuperCollider", "downloaded-quarks", "Dirt-Samples")]
    return next((c for c in cands if os.path.isdir(c)), None)


def _audio_files(folder):
    try:
        return sorted(f for f in os.listdir(folder) if f.lower().endswith(AUDIO_EXT) and not f.startswith("."))
    except OSError:
        return []


def representative(folder, kind="hit"):
    """El archivo que mejor representa un sonido: el 0 de un golpe, el del centro de un instrumento afinado."""
    files = _audio_files(folder)
    if not files:
        return None
    f = files[len(files) // 2] if kind == "pitched" and len(files) > 2 else files[0]
    return os.path.join(folder, f)


def sources(lib_dir, items, packs=None, stems_dir=None):
    """Lo que se puede analizar, por fuente, con cuántos sonidos tiene cada una."""
    by_origin = {"library": 0, "mine": 0, "builtin": 0}
    for e in items:
        if e["origin"] in by_origin and e.get("installed") and e["kind"] not in ("synth", "engine", "midi"):
            by_origin[e["origin"]] += 1
    out = [
        {"id": "library", "es": "Biblioteca de instrumentos (descargados)", "en": "Instrument library (downloaded)", "n": by_origin["library"]},
        {"id": "mine", "es": "Mis sonidos y descargas (Freesound, packs, Maestro)", "en": "My sounds and downloads (Freesound, packs, Maestro)", "n": by_origin["mine"]},
        {"id": "builtin", "es": "Sonidos incluidos (Dirt-Samples)", "en": "Built-in sounds (Dirt-Samples)",
         "n": _count_dirs(dirt_samples_dir(), items)},
    ]
    for p in packs or []:
        n = sum(1 for _ in _walk_audio(p["path"], limit=5000))
        out.append({"id": "pack:" + p["path"], "es": f"Pack comprado: {p.get('name') or os.path.basename(p['path'])} (solo local)",
                    "en": f"Bought pack: {p.get('name') or os.path.basename(p['path'])} (local only)", "n": n, "local_only": True})
    if stems_dir and os.path.isdir(stems_dir):
        n = sum(1 for _ in _walk_audio(stems_dir, limit=5000))
        out.append({"id": "stems", "es": "Pistas separadas de tus audios (MSST/Demucs)", "en": "Stems split from your audio (MSST/Demucs)", "n": n})
    return out


def _count_dirs(dd, items):
    if not dd:
        return 0
    return sum(1 for e in items if e["origin"] == "builtin" and e["kind"] in ("hit", "pitched") and os.path.isdir(os.path.join(dd, e["sound"])))


def _walk_audio(root, limit=20000):
    k = 0
    for d, _, files in os.walk(root):
        for f in sorted(files):
            if f.lower().endswith(AUDIO_EXT) and not f.startswith("."):
                yield os.path.join(d, f)
                k += 1
                if k >= limit:
                    return


def targets(source, lib_dir, items, stems_dir=None):
    """(sound, file, origin, local_only) a analizar de una fuente."""
    out = []
    if source in ("library", "mine"):
        for e in items:
            if e["origin"] == source and e.get("installed") and e["kind"] not in ("synth", "engine", "midi", "loop"):
                f = representative(os.path.join(lib_dir, e["sound"]), e["kind"])
                if f:
                    out.append((e["sound"], f, source, False))
    elif source == "builtin":
        dd = dirt_samples_dir()
        if dd:
            for e in items:
                if e["origin"] == "builtin" and e["kind"] in ("hit", "pitched"):
                    f = representative(os.path.join(dd, e["sound"]), e["kind"])
                    if f:
                        out.append((e["sound"], f, "builtin", False))
    elif source.startswith("pack:"):
        root = source[5:]
        for f in _walk_audio(root):
            rel = os.path.relpath(f, root)
            out.append(("pack/" + rel.replace(os.sep, "/"), f, "pack", True))
    elif source == "stems" and stems_dir:
        for f in _walk_audio(stems_dir):
            out.append(("stem/" + os.path.relpath(f, stems_dir).replace(os.sep, "/"), f, "stem", False))
    return out


# ---------------------------------------------------------------- estados de un instrumento

def state_of(entry, loaded=(), missing=(), engine_ok=False):
    """En qué punto está un sonido: catalog (solo en el catálogo) · downloaded (archivos en disco) ·
    loaded (SuperDirt lo tiene cargado) · playable (cargado, sin error y con el motor de sonido en marcha)."""
    s = entry["sound"]
    if entry["kind"] == "midi":
        return "playable" if engine_ok else "loaded"
    if entry["kind"] in ("synth", "engine"):
        if entry["kind"] == "engine" and s not in loaded:
            return "downloaded" if entry.get("installed") else "catalog"
        return "playable" if engine_ok and s not in missing else "loaded"
    if not entry.get("installed"):
        return "catalog"
    if s in missing or (loaded and s not in loaded):
        return "downloaded"
    if not loaded:   # sin motor no sabemos qué hay cargado
        return "downloaded"
    return "playable" if engine_ok else "loaded"


# ---------------------------------------------------------------- almacén SQLite

class Store:
    def __init__(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.lock, self.db:
            self.db.execute("""CREATE TABLE IF NOT EXISTS features (
                sound TEXT, file TEXT, origin TEXT, local_only INTEGER, mtime REAL, engine TEXT, data TEXT,
                PRIMARY KEY (sound, file))""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS choices (
                ctx TEXT, sound TEXT, picks INTEGER DEFAULT 0, passes INTEGER DEFAULT 0, updated REAL,
                PRIMARY KEY (ctx, sound))""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS recipes (
                id TEXT PRIMARY KEY, name TEXT, data TEXT, created REAL)""")

    # medidas
    def save_features(self, sound, file, origin, local_only, mtime, engine, data):
        with self.lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO features VALUES (?,?,?,?,?,?,?)",
                            (sound, file, origin, 1 if local_only else 0, mtime, engine, json.dumps(data)))

    def known(self, file):
        with self.lock:
            r = self.db.execute("SELECT mtime FROM features WHERE file = ?", (file,)).fetchone()
        return r["mtime"] if r else None

    def features(self, sound):
        with self.lock:
            r = self.db.execute("SELECT data FROM features WHERE sound = ? ORDER BY mtime DESC", (sound,)).fetchone()
        return json.loads(r["data"]) if r else None

    def all_features(self, include_local=True):
        q = "SELECT sound, origin, local_only, data FROM features" + ("" if include_local else " WHERE local_only = 0")
        with self.lock:
            rows = self.db.execute(q).fetchall()
        return {r["sound"]: dict(json.loads(r["data"]), origin=r["origin"], local_only=bool(r["local_only"])) for r in rows}

    def forget_source(self, origin):
        with self.lock, self.db:
            self.db.execute("DELETE FROM features WHERE origin = ?", (origin,))

    def stats(self):
        with self.lock:
            rows = self.db.execute("SELECT origin, COUNT(*) n FROM features GROUP BY origin").fetchall()
            ch = self.db.execute("SELECT COUNT(*) n, COALESCE(SUM(picks),0) p FROM choices").fetchone()
            rc = self.db.execute("SELECT COUNT(*) n FROM recipes").fetchone()
        return {"features": {r["origin"]: r["n"] for r in rows}, "choices": ch["n"], "picks": ch["p"], "recipes": rc["n"]}

    # elecciones: aprender sin LLM
    def choose(self, role, style, chosen, others):
        now = time.time()
        with self.lock, self.db:
            for ctx in {f"{role or '*'}|{style or '*'}", f"{role or '*'}|*"}:
                self.db.execute("INSERT INTO choices (ctx, sound, picks, passes, updated) VALUES (?,?,1,0,?) "
                                "ON CONFLICT(ctx, sound) DO UPDATE SET picks = picks + 1, updated = ?", (ctx, chosen, now, now))
                for o in others or []:
                    if o and o != chosen:
                        self.db.execute("INSERT INTO choices (ctx, sound, picks, passes, updated) VALUES (?,?,0,1,?) "
                                        "ON CONFLICT(ctx, sound) DO UPDATE SET passes = passes + 1, updated = ?", (ctx, o, now, now))

    def learned(self, role, style):
        """{sound: puntuación -1..1} para ese papel y género (mezclado con lo aprendido para el papel en general)."""
        out = {}
        with self.lock:
            rows = self.db.execute("SELECT ctx, sound, picks, passes FROM choices WHERE ctx IN (?, ?)",
                                   (f"{role or '*'}|{style or '*'}", f"{role or '*'}|*")).fetchall()
        for r in rows:
            w = 0.5 if r["ctx"].endswith("|*") else 1.0
            score = (r["picks"] - r["passes"] * 0.5) / (r["picks"] + r["passes"] + 2)
            out[r["sound"]] = round(out.get(r["sound"], 0) + w * score, 3)
        return out

    # recetas
    def save_recipe(self, rec):
        rid = rec.get("id") or ("r" + str(int(time.time() * 1000)))
        rec = dict(rec, id=rid)
        with self.lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO recipes VALUES (?,?,?,?)", (rid, rec.get("name") or rid, json.dumps(rec), time.time()))
        return rec

    def recipes(self):
        with self.lock:
            rows = self.db.execute("SELECT data FROM recipes ORDER BY created").fetchall()
        return [json.loads(r["data"]) for r in rows]

    def delete_recipe(self, rid):
        with self.lock, self.db:
            self.db.execute("DELETE FROM recipes WHERE id = ?", (rid,))


# ---------------------------------------------------------------- trabajo de análisis

class Analyzer:
    """Analiza en segundo plano las fuentes que elijas. Un trabajo a la vez; se puede parar."""

    def __init__(self, store, tools_python=None):
        self.store = store
        self.tools_python = tools_python   # función que devuelve el Python del entorno de audio (o None)
        self.job = {"state": "idle", "done": 0, "total": 0, "skipped": 0, "msg": "", "sources": []}
        self._stop = False

    def status(self):
        return dict(self.job)

    def stop(self):
        self._stop = True

    def start(self, plan):
        """plan: [(sound, file, origin, local_only)]"""
        if self.job["state"] == "running":
            return self.status()
        self._stop = False
        self.job = {"state": "running", "done": 0, "total": len(plan), "skipped": 0, "msg": "", "started": time.time(),
                    "sources": sorted({p[2] for p in plan})}
        threading.Thread(target=self._run, args=(plan,), daemon=True).start()
        return self.status()

    def _run(self, plan):
        pending_librosa = []
        try:
            for sound, f, origin, local in plan:
                if self._stop:
                    break
                try:
                    mt = os.path.getmtime(f)
                except OSError:
                    self.job["skipped"] += 1
                    continue
                if self.store.known(f) == mt:
                    self.job["done"] += 1
                    continue
                feats = analyze_file(f)
                if feats is None:
                    pending_librosa.append((sound, f, origin, local, mt))
                    continue
                self.store.save_features(sound, f, origin, local, mt, "stdlib", feats)
                self.job["done"] += 1
                self.job["msg"] = sound
            if pending_librosa and not self._stop:
                self._librosa(pending_librosa)
            self.job["state"] = "stopped" if self._stop else "done"
        except Exception as e:  # noqa: BLE001
            self.job.update(state="error", msg=str(e)[-300:])

    def _librosa(self, pending):
        py = self.tools_python() if self.tools_python else None
        if not py or not os.path.isfile(py):
            self.job["skipped"] += len(pending)
            self.job["note"] = "mp3/ogg/flac/aiff need the audio tools (librosa)"
            return
        by_file = {p[1]: p for p in pending}
        proc = subprocess.Popen([py, os.path.join(HERE, "sound_worker.py")], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, text=True)
        proc.stdin.write("\n".join(by_file) + "\n")
        proc.stdin.close()
        for line in proc.stdout:
            if self._stop:
                proc.kill()
                break
            try:
                r = json.loads(line)
            except ValueError:
                continue
            p = by_file.get(r.get("file"))
            if not p:
                continue
            if r.get("features"):
                self.store.save_features(p[0], p[1], p[2], p[3], p[4], "librosa", r["features"])
                self.job["done"] += 1
                self.job["msg"] = p[0]
            else:
                self.job["skipped"] += 1
        proc.wait()


# ---------------------------------------------------------------- ranking: parecido + lo que suena + lo que eliges

def rank(items, base_sound, store=None, role="", style="", loaded=(), missing=(), engine_ok=False, n=3, playable_only=True):
    """Los mejores candidatos para sustituir/elegir `base_sound`, con su estado y por qué."""
    import library as soundlib
    base = soundlib.find(items, base_sound) or {"sound": base_sound, "family": "synth_keys", "role": role, "kind": "pitched", "tags": base_sound}
    feats = store.all_features() if store else {}
    learned = store.learned(role or base.get("role") or "", style) if store else {}
    bf = feats.get(base_sound)
    out = []
    for e in items:
        if e["kind"] == "midi" or e.get("shadowed") or e["sound"] == base_sound:
            continue
        sim = soundlib.similarity(base, e)
        if sim <= 2:
            continue
        st = state_of(e, loaded, missing, engine_ok)
        score = sim
        f = feats.get(e["sound"])
        if bf and f:
            score += (1 - distance(bf, f)) * 3
        score += learned.get(e["sound"], 0) * 4
        out.append(dict(e, state=st, score=round(score, 2), learned=learned.get(e["sound"], 0),
                        sounds_like=describe(f, en=False) if f else "", sounds_like_en=describe(f, en=True) if f else ""))
    out.sort(key=lambda x: (-x["score"], STATES.index(x["state"]) * -1))
    seen, uniq = set(), []
    for e in out:
        g = e.get("group") or e["sound"]
        if g in seen:
            continue
        seen.add(g)
        uniq.append(e)
    ready = [e for e in uniq if e["state"] == "playable"]
    top = ready[:n] if playable_only else uniq[:n]
    return {"base": dict(base, features=bf, sounds_like=describe(bf) if bf else "", sounds_like_en=describe(bf, True) if bf else ""),
            "top": top, "more": [e for e in uniq if e not in top][:8]}
