"""
Loops largos: Tidal Studio los escucha y sabe qué hacer con ellos.

Un loop descargado (una base de reggaetón de 4 compases, un bajo, una melodía…) no se toca como
un golpe: hay que ajustarlo al tempo de la canción. Al importarlo se analiza:

  - duración, BPM (del nombre del archivo, «95bpm», o escuchando el audio), pulsos y compases
  - tonalidad (si suena afinado), tipo (batería, bajo, melodía, voz, textura)
  - golpes (transitorios) y en qué trozo cae cada uno (bombo, caja, platos)
  - una forma de onda pequeña para dibujarla

Con eso el estudio (y Maestro) escriben el código correcto:

  loopAt 4 $ chop 32 $ s "base" # cut 1               ← dura justo 4 compases, al tempo de la canción
  slow 4 $ splice 32 "<[0 1 2 …] [0 1 2 … 6 6]>" $ s "base" # cut 1   ← variaciones, no repetir
  loopAt 1 $ s "base" # begin 0.25 # end 0.5 # cut 1  ← solo el compás 2

Los metadatos se guardan en samples/library.json («loops»: {archivo: {...}}).

Leer el audio: WAV y AIFF con la biblioteca estándar; MP3/OGG/FLAC/M4A con ffmpeg si está instalado.
Si no se puede, el navegador decodifica el archivo y manda el audio (POST /api/loops/pcm).
Solo biblioteca estándar.
"""
import array
import math
import os
import re
import shutil
import struct
import subprocess
import sys
from operator import mul

SR = 11025               # el análisis trabaja a esta frecuencia (de sobra para tempo y tonalidad)
MIN_LOOP = 1.5           # menos que esto es un golpe, no un loop
MAX_SECONDS = 120        # se analizan como mucho los primeros 2 minutos
KINDS = ["drums", "bass", "melody", "chords", "vocal", "texture", "full"]
KIND_TYPE = {"drums": "loop", "bass": "bajo", "melody": "melodico", "chords": "melodico", "vocal": "voz", "texture": "pad", "full": "loop"}
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
VERSION = 1
MAX_UPLOAD = 400 * 1024 * 1024   # un zip con un pack entero
MAX_FILE = 120 * 1024 * 1024     # una canción entera en WAV


# ====================================================================== leer el audio
class NoDecoder(Exception):
    """Este formato no se puede leer aquí (el navegador lo hará)."""


def _mono_down(vals, ch, k, scale):
    """Mezcla a mono y baja la frecuencia promediando k muestras (rápido: todo con slices)."""
    step = ch * k
    n = len(vals) // step
    if not n:
        return []
    acc = list(vals[0:n * step:step])
    for j in range(1, step):
        acc = list(map(float.__add__, map(float, acc), map(float, vals[j:n * step:step])))
    f = 1.0 / (step * scale)
    return [x * f for x in acc]


def _pcm(raw, fmt, bits, ch, rate, big=False):
    """Bytes PCM → (muestras mono a ~SR, sr efectiva)."""
    width = bits // 8
    frames = len(raw) // (width * ch)
    frames = min(frames, int(rate * MAX_SECONDS))
    raw = raw[:frames * width * ch]
    if fmt == 3:
        a = array.array("f" if bits == 32 else "d")
        a.frombytes(raw)
        scale = 1.0
    elif bits == 8:
        a = array.array("b", bytes((b - 128) & 0xFF for b in raw)) if not big else array.array("b", raw)
        scale = 128.0
    elif bits == 16:
        a = array.array("h")
        a.frombytes(raw)
        scale = 32768.0
    elif bits == 24:
        b32 = bytearray(frames * ch * 4)
        if big:
            b32[3::4], b32[2::4], b32[1::4] = raw[0::3], raw[1::3], raw[2::3]
        else:
            b32[1::4], b32[2::4], b32[3::4] = raw[0::3], raw[1::3], raw[2::3]
        a = array.array("i")
        a.frombytes(bytes(b32))
        big = False
        scale = 2147483648.0
    elif bits == 32:
        a = array.array("i")
        a.frombytes(raw)
        scale = 2147483648.0
    else:
        raise NoDecoder(f"{bits} bits")
    if big and a.itemsize > 1:
        a.byteswap()
    k = max(1, int(round(rate / SR)))
    return _mono_down(a, ch, k, scale), rate / k


def _read_wav(data):
    if data[:4] not in (b"RIFF", b"RIFX") or data[8:12] != b"WAVE":
        raise NoDecoder("no es WAV")
    big = data[:4] == b"RIFX"
    e = ">" if big else "<"
    pos, fmt = 12, None
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack(e + "I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b"fmt ":
            tag, ch, rate = struct.unpack(e + "HHI", body[:8])
            bits = struct.unpack(e + "H", body[14:16])[0]
            if tag == 0xFFFE and len(body) >= 26:
                tag = struct.unpack(e + "H", body[24:26])[0]
            fmt = (tag, bits, ch, rate)
        elif cid == b"data" and fmt:
            tag, bits, ch, rate = fmt
            if tag not in (1, 3):
                raise NoDecoder("WAV comprimido")
            y, sr = _pcm(body, tag, bits, ch, rate, big)
            return y, sr, (len(body) // (bits // 8 * ch)) / rate
        pos += 8 + size + (size & 1)
    raise NoDecoder("WAV sin datos")


def _ext80(b):
    exp, mant = struct.unpack(">HQ", b)
    sign = -1 if exp & 0x8000 else 1
    exp &= 0x7FFF
    return 0.0 if exp == 0 and mant == 0 else sign * mant * 2.0 ** (exp - 16383 - 63)


def _read_aiff(data):
    if data[:4] != b"FORM" or data[8:12] not in (b"AIFF", b"AIFC"):
        raise NoDecoder("no es AIFF")
    pos, comm, little, flt = 12, None, False, False
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack(">I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b"COMM":
            ch, frames, bits = struct.unpack(">hIh", body[:8])
            rate = _ext80(body[8:18])
            comp = body[18:22] if data[8:12] == b"AIFC" else b"NONE"
            little = comp == b"sowt"
            flt = comp in (b"fl32", b"FL32", b"fl64", b"FL64")
            if comp not in (b"NONE", b"sowt", b"twos") and not flt:
                raise NoDecoder("AIFF comprimido")
            comm = (ch, frames, bits, rate)
        elif cid == b"SSND" and comm:
            ch, frames, bits, rate = comm
            off = struct.unpack(">I", body[:4])[0]
            raw = body[8 + off:8 + off + frames * ch * bits // 8]
            if flt:
                a = array.array("f" if bits == 32 else "d")
                a.frombytes(raw)
                if sys.byteorder == "little":
                    a.byteswap()
                k = max(1, int(round(rate / SR)))
                return _mono_down(a, ch, k, 1.0), rate / k, frames / rate
            y, sr = _pcm(raw, 1, bits, ch, int(rate), big=not little)
            return y, sr, frames / rate
        pos += 8 + size + (size & 1)
    raise NoDecoder("AIFF sin datos")


def _read_ffmpeg(path):
    exe = shutil.which("ffmpeg")
    if not exe:
        raise NoDecoder("sin ffmpeg")
    try:
        p = subprocess.run([exe, "-v", "error", "-i", path, "-t", str(MAX_SECONDS), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                           capture_output=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise NoDecoder(str(e))
    if p.returncode != 0 or not p.stdout:
        raise NoDecoder("ffmpeg no pudo")
    y, sr = from_int16(p.stdout)
    dur = len(y) / SR
    # duración real (puede ser más larga que lo analizado)
    m = re.search(rb"Duration: (\d+):(\d+):([\d.]+)", subprocess.run([exe, "-i", path], capture_output=True).stderr or b"")
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return y, sr, dur


def from_int16(raw, sr=SR):
    a = array.array("h")
    a.frombytes(raw[:len(raw) // 2 * 2])
    if sys.byteorder == "big":
        a.byteswap()
    return [x / 32768.0 for x in a], sr


def decode(path):
    """→ (muestras mono a ~11 kHz, frecuencia, duración en segundos). NoDecoder si no se puede."""
    with open(path, "rb") as f:
        head = f.read(12)
        if head[:4] in (b"RIFF", b"RIFX", b"FORM"):
            data = head + f.read()
            try:
                return (_read_wav if head[:4] != b"FORM" else _read_aiff)(data)
            except (NoDecoder, struct.error, ValueError):
                pass
    return _read_ffmpeg(path)


def quick_duration(path):
    """Duración sin decodificar (solo WAV/AIFF); None si no se sabe."""
    try:
        with open(path, "rb") as f:
            data = f.read(1 << 16)
        size = os.path.getsize(path)
        if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
            pos, fmt = 12, None
            while pos + 8 <= len(data):
                cid, sz = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
                if cid == b"fmt ":
                    ch, rate = struct.unpack("<HI", data[pos + 10:pos + 16])
                    bits = struct.unpack("<H", data[pos + 22:pos + 24])[0]
                    fmt = (ch, rate, bits)
                elif cid == b"data" and fmt:
                    ch, rate, bits = fmt
                    sz = min(sz, size - pos - 8)
                    return sz / (ch * max(1, bits // 8) * rate)
                pos += 8 + sz + (sz & 1)
    except (OSError, struct.error):
        pass
    return None


# ====================================================================== pistas en el nombre
def name_hints(name):
    """«Reggaeton_Drums_95BPM_Am» → {"bpm": 95, "key": "A minor", "kind": "drums"}."""
    n = name.replace("_", " ").replace("-", " ")
    out = {}
    m = re.search(r"(?<!\d)(\d{2,3}(?:[.,]\d)?)\s*bpm", n, re.I) or re.search(r"bpm\s*(\d{2,3})(?!\d)", n, re.I)
    if m:
        v = float(m.group(1).replace(",", "."))
        if 50 <= v <= 220:
            out["bpm"] = v
    m = re.search(r"(?:^|[\s(\[])([A-G])([#b♯♭]?)\s*(maj(?:or)?|min(?:or)?|m(?!aj|in)|dur|moll)?(?=$|[\s)\]])", n)
    if m and (m.group(3) or m.group(2) or re.search(r"\bkey\b", n, re.I)):
        root = m.group(1) + m.group(2).replace("♯", "#").replace("♭", "b")
        root = FLAT.get(root, root)
        if root in NOTES:
            minor = (m.group(3) or "").lower().startswith(("m", "moll")) and not (m.group(3) or "").lower().startswith("maj")
            out["key"] = f"{root} {'minor' if minor else 'major'}"
    low = n.lower()
    for kind, rx in (("vocal", r"vox|vocal|voice|acapella|voz|chant"), ("bass", r"\bbass|808|sub\b|bajo"),
                     ("drums", r"drum|beat|perc|break|kick|hat|snare|dembow|top\s?loop|groove|bateria|batería|ritmo"),
                     ("chords", r"chord|acorde|pad|stab|keys|piano|rhodes|organ"),
                     ("melody", r"melod|lead|guitar|guitarra|synth|arp|pluck|bell|flute|sax|string|violin|horn|trumpet"),
                     ("texture", r"ambient|atmo|texture|fx|noise|vinyl|rain|field|drone"),
                     ("full", r"full|mix|instrumental|song")):
        if re.search(rx, low):
            out["kind"] = kind
            break
    return out


# ====================================================================== análisis
def _onset_env(y, sr, hop):
    """Fuerza de los golpes por cuadro, en tres bandas: graves (bombo), todo, agudos (platos)."""
    n = len(y) // hop
    # graves: paso bajo de un polo (~150 Hz)
    a = math.exp(-2 * math.pi * 150 / sr)
    lo, z = [0.0] * len(y), 0.0
    for i, x in enumerate(y):
        z = x + a * (z - x)
        lo[i] = z
    hi = [0.0] + list(map(float.__sub__, y[1:], y[:-1]))
    def energies(sig):
        return [sum(map(mul, sig[i * hop:(i + 1) * hop], sig[i * hop:(i + 1) * hop])) / hop for i in range(n)]
    e_lo, e_all, e_hi = energies(lo), energies(y), energies(hi)
    env = [0.0] * n
    for e in (e_lo, e_all, e_hi):
        ref = max(e) or 1.0
        lg = [math.log1p(1000 * v / ref) for v in e]
        for i in range(n):
            d = lg[i] - (lg[i - 1] if i else 0.0)  # el primer cuadro cuenta como golpe si empieza fuerte
            if d > 0:
                env[i] += d
    return env, e_lo, e_all, e_hi


def _acf(env, lags):
    m = sum(env) / (len(env) or 1)
    e = [v - m for v in env]
    z = sum(map(mul, e, e)) or 1.0
    out = {}
    for L in lags:
        if L < len(e):
            out[L] = sum(map(mul, e[:-L], e[L:])) / z
    return out


def _acf_at(acf, lag):
    i = int(lag)
    if i not in acf or i + 1 not in acf:
        return acf.get(int(round(lag)), 0.0)
    f = lag - i
    return acf[i] * (1 - f) + acf[i + 1] * f


def _tempo(env, fps, dur):
    """BPM: autocorrelación de los golpes + la pista de que un loop dura compases enteros."""
    lags = range(max(2, int(60 * fps / 220)), int(60 * fps / 45) * 2 + 3)
    acf = _acf(env, lags)

    def strength(bpm):
        lag = 60 * fps / bpm
        s = _acf_at(acf, lag) + 0.5 * _acf_at(acf, lag * 2) + 0.25 * _acf_at(acf, lag / 2) + 0.25 * _acf_at(acf, lag * 4)
        prior = math.exp(-0.5 * (math.log2(bpm / 110) / 0.7) ** 2)  # los tempos raros, menos probables
        return max(0.0, s) * (0.5 + prior)

    # candidatos libres (cada 0.5 BPM) …
    def whole(bpm):  # ¿el archivo dura un número redondo de compases a este tempo?
        bars = dur * bpm / 240
        return any(abs(bars - b) < 0.04 * b for b in (1, 2, 4, 8, 16, 32))
    free = max((strength(b / 2) * (1.0 if whole(b / 2) else 0.8), b / 2) for b in range(120, 401))
    best = free
    exact = False
    # … y candidatos «el archivo dura N compases exactos» (lo normal en un loop bien cortado)
    for bars in (0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64):
        for bpb in (4, 3):
            if bpb == 3 and bars not in (1, 2, 4, 8, 16):
                continue
            bpm = bars * bpb * 60 / dur
            if 60 <= bpm <= 200:
                s = strength(bpm) * (1.3 if bars in (1, 2, 4, 8, 16, 32) and bpb == 4 else 1.0)
                if s >= free[0] * 0.8 and (not exact or s > best[0]):
                    best, exact = (s, bpm), True
    conf = min(1.0, best[0])
    return best[1], exact, conf


def _fft(re_, im):
    """FFT radix 2 en el sitio (n potencia de 2)."""
    n = len(re_)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            re_[i], re_[j] = re_[j], re_[i]
            im[i], im[j] = im[j], im[i]
    size = 2
    while size <= n:
        half = size // 2
        ang = -2 * math.pi / size
        wr = [math.cos(ang * k) for k in range(half)]
        wi = [math.sin(ang * k) for k in range(half)]
        for start in range(0, n, size):
            for k in range(half):
                a, b = start + k, start + k + half
                tr = wr[k] * re_[b] - wi[k] * im[b]
                ti = wr[k] * im[b] + wi[k] * re_[b]
                re_[b], im[b] = re_[a] - tr, im[a] - ti
                re_[a] += tr
                im[a] += ti
        size *= 2


# Perfiles de Krumhansl-Kessler (cuánto «pertenece» cada nota a una tonalidad)
MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def _corr(a, b):
    ma, mb = sum(a) / 12, sum(b) / 12
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) or 1.0
    return num / den


def _spectrum_stats(y, sr, frames=24, n=4096):
    """Croma (12 notas), centroide y cuánto suena «afinado» (picos vs. ruido)."""
    if len(y) < n:
        y = y + [0.0] * (n - len(y))
    win = [0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1)) for i in range(n)]
    starts = sorted({int(i * (len(y) - n) / max(1, frames - 1)) for i in range(frames)})
    chroma, cent_sum, mag_sum, peaky, low = [0.0] * 12, 0.0, 0.0, [], 0.0
    pcs, freqs = [], []
    for k in range(n // 2):
        f = k * sr / n
        freqs.append(f)
        pcs.append(int(round(12 * math.log2(f / 440) + 69)) % 12 if 55 <= f <= 2000 else -1)
    for s in starts:
        seg = y[s:s + n]
        if max(map(abs, seg)) < 1e-4:
            continue
        re_ = [a * w for a, w in zip(seg, win)]
        im = [0.0] * n
        _fft(re_, im)
        mag = [math.sqrt(re_[k] * re_[k] + im[k] * im[k]) for k in range(n // 2)]
        tot = sum(mag) or 1.0
        cent_sum += sum(map(mul, mag, freqs))
        mag_sum += tot
        low += sum(mag[:int(150 * n / sr)])
        band = mag[int(55 * n / sr):int(2000 * n / sr)]
        if band:
            srt = sorted(band)
            peaky.append(sum(srt[-12:]) / (12 * (srt[len(srt) // 2] or 1e-9)))
        for k, pc in enumerate(pcs):
            if pc >= 0:
                chroma[pc] += mag[k] ** 2
    return {"chroma": chroma, "centroid": cent_sum / (mag_sum or 1.0), "low": low / (mag_sum or 1.0),
            "peaky": sorted(peaky)[len(peaky) // 2] if peaky else 0.0}


def _key(chroma):
    if not any(chroma):
        return None, 0.0
    scores = []
    for r in range(12):
        rot = chroma[r:] + chroma[:r]
        scores.append((_corr(rot, MAJ), f"{NOTES[r]} major"))
        scores.append((_corr(rot, MIN), f"{NOTES[r]} minor"))
    scores.sort(reverse=True)
    return scores[0][1], round(scores[0][0], 2)


def _onsets(env, fps):
    """Picos de la curva de golpes → segundos."""
    n = len(env)
    out, last = [], -99
    w = max(2, int(fps * 0.1))
    mean = sum(env) / (n or 1)
    for i in range(0, n - 1):
        lo, hi = max(0, i - w), min(n, i + w + 1)
        loc = env[lo:hi]
        if env[i] == max(loc) and env[i] > 1.5 * mean + 0.5 * (sum(loc) / len(loc)) and i - last >= w:
            out.append((i / fps, env[i]))
            last = i
    return out


def analyse_samples(y, sr, dur, filename="", extra_hints=None):
    """El análisis completo de un audio ya decodificado (mono, ~11 kHz)."""
    hints = {k: v for k, v in (extra_hints or {}).items() if k in ("bpm", "key", "kind")}
    hints.update(name_hints(os.path.splitext(os.path.basename(filename))[0]))
    meta = {"v": VERSION, "duration": round(dur, 3), "loop": dur >= MIN_LOOP}
    if not y or len(y) < sr * 0.2:
        return {**meta, "loop": False}
    peak = max(map(abs, y)) or 1.0
    y = [v / peak for v in y]
    adur = len(y) / sr
    hop = 128
    fps = sr / hop
    env, e_lo, e_all, e_hi = _onset_env(y, sr, hop)
    # forma de onda para dibujar (200 barras, 0-100)
    nb = 200
    meta["wave"] = [int(100 * max(map(abs, y[int(i * len(y) / nb):int((i + 1) * len(y) / nb)] or [0]))) for i in range(nb)]
    if not meta["loop"]:
        return meta
    bpm, exact, conf = _tempo(env, fps, adur if adur < dur - 0.05 else dur)
    meta["bpm_source"] = "audio"
    if hints.get("bpm"):
        bpm, meta["bpm_source"], conf = hints["bpm"], "name", 1.0
    beats = dur * bpm / 60
    if abs(beats - round(beats)) < 0.12 * max(1, beats / 16):
        beats = round(beats)
        exact = True
        if meta["bpm_source"] == "audio" and abs(bpm - round(bpm)) < 0.6:
            bpm = round(bpm)  # casi todos los loops se hacen a un tempo entero (el MP3 añade silencio al final)
    meta.update(bpm=round(bpm, 1), beats=beats if isinstance(beats, int) else round(beats, 2), exact=exact, bpm_conf=round(conf, 2))
    meta["bars"] = bars_of(beats)
    # golpes
    ons = _onsets(env, fps)
    meta["onsets"] = [round(t / dur, 4) for t, _ in ons[:96]]
    # espectro: tonalidad, tipo
    st = _spectrum_stats(y, sr)
    key, kconf = _key(st["chroma"])
    density = len(ons) / max(0.1, adur)
    env_mean = sum(env) / len(env)
    punch = (sorted(env)[int(len(env) * 0.97)] / (env_mean or 1e-9)) if env else 0
    tonal = st["peaky"] >= 7 and kconf >= 0.55
    kind = hints.get("kind")
    if not kind:
        if punch > 6 and (not tonal or density > 3.5):
            kind = "drums"
        elif st["low"] > 0.35 and st["centroid"] < 400:
            kind = "bass"
        elif tonal:
            kind = "melody" if density > 1.5 else "chords"
        else:
            kind = "texture"
    meta["kind"] = kind
    meta["kind_source"] = "name" if hints.get("kind") else "audio"
    if meta["bpm_source"] == "audio" and kind in ("chords", "texture", "vocal") and meta["bars"] not in (1, 2, 4, 8, 16, 32):
        # sonidos largos sin golpes claros: el tempo «escuchado» no es fiable, pero un loop suele durar
        # 1, 2, 4, 8… compases: nos quedamos con el tempo que da compases redondos más cercano a 110
        grid = [(abs(math.log2(b * 240 / dur / 110)), b * 240 / dur, b) for b in (1, 2, 4, 8, 16, 32) if 60 <= b * 240 / dur <= 190]
        if grid:
            _, bpm, bars = min(grid)
            meta.update(bpm=round(bpm, 1), beats=bars * 4, bars=bars, exact=True, bpm_conf=0.4)
    if hints.get("key"):
        meta.update(key=hints["key"], key_source="name")
    elif kind not in ("drums",) and tonal:
        meta.update(key=key, key_source="audio", key_conf=kconf)
    meta["centroid"] = int(st["centroid"])
    # trozos: corcheas (2 por pulso), como mucho 32
    beats_i = max(1, int(round(meta["beats"])))
    slices = min(32, max(4, beats_i * 2))
    while slices > 4 and slices % 2 == 0 and slices > beats_i * 2:
        slices //= 2
    meta["slices"] = slices
    meta["slice_hits"] = _slice_hits(ons, dur, slices, e_lo, e_hi, fps)
    return meta


def _slice_hits(ons, dur, slices, e_lo, e_hi, fps):
    """Qué hay al principio de cada trozo: k (bombo/grave), s (caja/medio), h (platos/agudo) o «» (nada)."""
    out = [""] * slices
    if not ons:
        return out
    strong = max(v for _, v in ons) or 1.0
    lo_ref = max(e_lo) or 1.0
    hi_ref = max(e_hi) or 1.0
    for t, v in ons:
        i = int(round(t / dur * slices))
        if i >= slices or abs(t / dur * slices - i) > 0.3 or out[i] or v < strong * 0.25:
            continue
        f = int(t * fps)
        lo = max(e_lo[f:f + 4] or [0]) / lo_ref
        hi = max(e_hi[f:f + 4] or [0]) / hi_ref
        out[i] = "k" if lo > 0.45 and lo > hi else ("h" if hi > 0.5 and lo < 0.2 else "s")
    return out


def bars_of(beats, bpb=4):
    b = beats / bpb
    for nice in (0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64):
        if abs(b - nice) < 0.05 * nice:
            return nice
    return round(b, 2)


def from_hints(duration, filename, extra=None):
    """Sin poder decodificar: lo que se sabe por el nombre (y lo que diga Freesound)."""
    hints = {**name_hints(os.path.splitext(os.path.basename(filename))[0]), **(extra or {})}
    meta = {"v": VERSION, "duration": round(duration, 3), "loop": duration >= MIN_LOOP, "partial": True}
    if hints.get("bpm") and duration:
        beats = duration * hints["bpm"] / 60
        meta.update(bpm=hints["bpm"], bpm_source="name", beats=round(beats) if abs(beats - round(beats)) < 0.15 else round(beats, 2))
        meta["bars"] = bars_of(meta["beats"])
        meta["slices"] = min(32, max(4, int(round(meta["beats"])) * 2))
    for k in ("key", "kind"):
        if hints.get(k):
            meta[k], meta[k + "_source"] = hints[k], "name"
    return meta


# ====================================================================== el código de Tidal
def fmt(x):
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def plan(name, meta, song_bpm):
    """Qué código escribir para que este loop suene al tempo de la canción. Lo mismo que web/loops.js."""
    song_bpm = float(song_bpm or 120)
    bpm = float(meta.get("bpm") or 0)
    bars = float(meta.get("bars") or 0)
    if not bpm or not bars:
        # sin tempo: que dure lo que dura, redondeado a compases de la canción
        bars = max(1, round((meta.get("duration") or 2) * song_bpm / 240))
        bpm = bars * 240 / (meta.get("duration") or 2)
    best = None
    for f in (0.5, 1, 2):
        n = bars * f
        if n < 0.25:
            continue
        speed = bars * song_bpm / (n * bpm)
        score = abs(math.log2(speed)) + (0.05 if f != 1 else 0)
        if best is None or score < best[0]:
            best = (score, n, speed)
    _, n, speed = best
    semis = 12 * math.log2(speed)
    slices = int(meta.get("slices") or 8)
    kind = meta.get("kind") or "drums"
    s = f's "{name}"'
    fit = f"loopAt {fmt(n)} $ chop {slices * (1 if n <= bars else 2)} $ {s} # cut 1" if kind in ("drums", "full") \
        else f"loopAt {fmt(n)} $ {s} # cut 1"
    seq = " ".join(str(i) for i in range(slices))
    vs = slices  # variaciones: como mucho 16 trozos, listas cortas
    while vs > 16 and vs % 2 == 0:
        vs //= 2
    vhits = [h for i, h in enumerate(meta.get("slice_hits") or []) if i % (slices // vs) == 0]
    return {"n": n, "speed": round(speed, 3), "semitones": round(semis, 1), "slices": slices, "fit": fit,
            "splice": f'slow {fmt(n)} $ splice {vs} "<{variations(vs, vhits)}>" $ {s} # cut 1',
            "section": f"loopAt {fmt(n / bars if bars else 1)} $ {s} # begin 0 # end {fmt(round(1 / bars, 4)) if bars >= 1 else 1} # cut 1",
            "sequence": seq}


def variations(slices, hits=None):
    """Cuatro versiones del mismo loop (original, original, relleno, cambio) para que no suene igual siempre."""
    idx = list(range(slices))
    q = max(1, slices // 4)
    base = " ".join(map(str, idx))
    # relleno: el último cuarto tartamudea (cada trozo dos veces, el doble de rápido)
    fill = " ".join(map(str, idx[:slices - q])) + " " + " ".join(f"[{i} {i}]" for i in idx[slices - q:])
    # cambio: se intercambian el 2º y 3er cuarto; si sabemos dónde están los bombos, se repite uno
    swap = idx[:q] + idx[2 * q:3 * q] + idx[q:2 * q] + idx[3 * q:]
    if hits:
        kicks = [i for i, h in enumerate(hits[:slices]) if h == "k"]
        if len(kicks) >= 2:
            swap = idx[:]
            swap[slices - q] = kicks[0]
    return f"[{base}]!2 [{fill}] [{' '.join(map(str, swap))}]"


# ====================================================================== biblioteca
def _audio_files(lib, name):
    from samples import AUDIO_EXT
    d = os.path.join(lib.dir, name)
    return sorted(f for f in os.listdir(d) if f.lower().endswith(AUDIO_EXT)) if os.path.isdir(d) else []


def analyse_file(lib, name, fname, extra_hints=None):
    """Analiza un archivo de la biblioteca y guarda el resultado. Devuelve los metadatos (o pending)."""
    path = os.path.join(lib.dir, name, fname)
    try:
        y, sr, dur = decode(path)
        meta = analyse_samples(y, sr, dur, fname, extra_hints)
    except NoDecoder:
        dur = quick_duration(path) or float((extra_hints or {}).get("duration") or 0)
        meta = from_hints(dur, fname, extra_hints) if dur else {"v": VERSION, "pending": True}
        meta["pending"] = True  # el navegador lo terminará de analizar
    store(lib, name, fname, meta)
    return meta


# ====================================================================== cargador
def _summary(meta):
    if not meta:
        return {"status": "oneshot"}
    if meta.get("pending"):
        return {"status": "pending", **{k: meta.get(k) for k in ("bpm", "bars", "key", "kind")}}
    if not meta.get("loop"):
        return {"status": "oneshot"}
    return {"status": "ok", **{k: meta.get(k) for k in ("bpm", "bars", "key", "kind", "duration")}}


def loop_name(filename):
    """«Reggaeton Drums 95BPM (Am).wav» → «reggaeton_drums_95bpm_am»."""
    from samples import safe_name
    stem = os.path.splitext(os.path.basename(filename))[0]
    return safe_name(stem) or "loop"


def import_file(lib, filename, data, name=None, folder=None):
    """Añade un loop como sonido propio (una carpeta por loop) y lo analiza."""
    from samples import AUDIO_EXT, SampleError, safe_name
    base = os.path.basename((filename or "").replace("\\", "/"))
    if not base.lower().endswith(AUDIO_EXT):
        return {"file": base, "status": "skip"}
    nm = safe_name(name) if name else loop_name(base)
    nm = nm or "loop"
    d = os.path.join(lib.dir, nm)
    if os.path.isdir(d):
        same = [f for f in os.listdir(d) if os.path.getsize(os.path.join(d, f)) == len(data)]
        if same:
            return {"name": nm, "file": base, "status": "dup"}
        i = 2
        while os.path.isdir(os.path.join(lib.dir, f"{nm[:36]}_{i}")):
            i += 1
        nm = f"{nm[:36]}_{i}"
    try:
        r = lib.add_file(nm, base, data, None, {"source": "local", "title": base, "folder": (folder or "")[:120]}, max_bytes=MAX_FILE)
    except SampleError as e:
        return {"file": base, "status": "error", "error": str(e)}
    meta = (lib._meta()["sounds"].get(r["name"], {}).get("loops") or {}).get(r["file"])
    return {"name": r["name"], "file": r["file"], **_summary(meta)}


def import_zip(lib, raw, folder=None):
    """Un pack de loops en zip: cada audio de dentro se añade y se analiza."""
    import io
    import zipfile
    from samples import AUDIO_EXT, SampleError
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise SampleError("Ese archivo no es un zip válido|That file isn't a valid zip")
    out, total = [], 0
    for info in z.infolist():
        n = info.filename
        parts = n.replace("\\", "/").split("/")
        if info.is_dir() or "__MACOSX" in parts or parts[-1].startswith(".") or not n.lower().endswith(AUDIO_EXT):
            continue
        if len(out) >= 300 or info.file_size > MAX_FILE:
            out.append({"file": parts[-1], "status": "skip"})
            continue
        total += info.file_size
        if total > 2 * 1024 * 1024 * 1024:
            break
        out.append(import_file(lib, parts[-1], z.read(info), folder="/".join(parts[:-1]) or folder))
    if not out:
        raise SampleError("El zip no tiene audios (WAV, AIFF, FLAC, OGG o MP3)|The zip has no audio files (WAV, AIFF, FLAC, OGG or MP3)")
    return out


def maybe_analyse(lib, name, fname, info=None):
    """Tras añadir un archivo: si es largo, se analiza. Los golpes cortos se apuntan sin más."""
    path = os.path.join(lib.dir, name, fname)
    dur = quick_duration(path)
    if dur is None and info and info.get("duration"):
        dur = float(info["duration"])
    if dur is None and not shutil.which("ffmpeg") and os.path.getsize(path) < 120 * 1024:
        return None  # MP3/OGG pequeño: casi seguro un golpe; no hace falta que el navegador lo mire
    if dur is not None and dur < MIN_LOOP:
        store(lib, name, fname, {"v": VERSION, "duration": round(dur, 3), "loop": False})
        return None
    text = " ".join(str((info or {}).get(k) or "") for k in ("title", "tags", "search"))
    return analyse_file(lib, name, fname, {**name_hints(text), **({"duration": dur} if dur else {})})


def analyse_pcm(lib, name, index, raw, sr, duration):
    """Audio decodificado por el navegador (Int16 mono)."""
    files = _audio_files(lib, name)
    if not 0 <= index < len(files):
        raise ValueError("No existe ese sample")
    y, sr = from_int16(raw, sr)
    meta = analyse_samples(y, sr, float(duration or len(y) / sr), files[index])
    old = (lib._meta()["sounds"].get(name, {}).get("loops") or {}).get(files[index]) or {}
    for k in ("bpm", "bars", "key", "kind"):  # lo que corrigió el usuario a mano se respeta
        if old.get(k + "_source") == "user":
            meta[k], meta[k + "_source"] = old[k], "user"
    store(lib, name, files[index], meta)
    return meta


def store(lib, name, fname, meta):
    from samples import _lock
    with _lock:
        m = lib._meta()
        s = m["sounds"].setdefault(name, {"files_meta": []})
        s.setdefault("loops", {})[fname] = meta
        if meta.get("loop") and meta.get("kind") and not s.get("type_user"):
            s["type"] = KIND_TYPE.get(meta["kind"], s.get("type") or "loop")
        lib._save_meta(m)


def edit(lib, name, index, changes):
    """El usuario corrige el BPM, los compases, la tonalidad o el tipo."""
    files = _audio_files(lib, name)
    if not 0 <= index < len(files):
        raise ValueError("No existe ese sample")
    fname = files[index]
    meta = dict((lib._meta()["sounds"].get(name, {}).get("loops") or {}).get(fname) or {"v": VERSION, "loop": True})
    dur = meta.get("duration") or 0
    if changes.get("bpm"):
        bpm = max(30.0, min(300.0, float(changes["bpm"])))
        meta.update(bpm=round(bpm, 2), bpm_source="user")
        if dur:
            beats = dur * bpm / 60
            meta["beats"] = round(beats) if abs(beats - round(beats)) < 0.15 else round(beats, 2)
            meta["bars"] = bars_of(meta["beats"])
    if changes.get("bars"):
        bars = max(0.25, min(128.0, float(changes["bars"])))
        meta.update(bars=bars, beats=bars * 4, bars_source="user")
        if dur:
            meta.update(bpm=round(bars * 240 / dur, 2), bpm_source="user")
    if changes.get("bars") or changes.get("bpm"):
        meta["slices"] = min(32, max(4, int(round(meta.get("beats") or 8)) * 2))
        if len(meta.get("slice_hits") or []) != meta["slices"]:
            meta["slice_hits"] = []
    if "key" in changes:
        meta.update(key=str(changes["key"] or "")[:20] or None, key_source="user")
    if changes.get("kind") in KINDS:
        meta.update(kind=changes["kind"], kind_source="user")
    meta["loop"] = True
    store(lib, name, fname, meta)
    return meta


def scan(lib, only_new=True, limit=40):
    """Analiza los archivos largos de la biblioteca que aún no tienen análisis."""
    done = 0
    m = lib._meta()
    for snd in lib.list()["sounds"]:
        have = (m["sounds"].get(snd["name"], {}).get("loops") or {})
        for f in snd["files"]:
            old = have.get(f["file"])
            if only_new and old and old.get("v") == VERSION and not old.get("pending"):
                continue
            if old and old.get("pending") and old.get("tried"):
                continue
            dur = quick_duration(os.path.join(lib.dir, snd["name"], f["file"]))
            if dur is not None and dur < MIN_LOOP:
                store(lib, snd["name"], f["file"], {"v": VERSION, "duration": round(dur, 3), "loop": False})
                continue
            meta = analyse_file(lib, snd["name"], f["file"])
            if meta.get("pending"):
                meta["tried"] = True
                store(lib, snd["name"], f["file"], meta)
            done += 1
            if done >= limit:
                return done
    return done


def listing(lib, song_bpm=120):
    """Todos los loops de la biblioteca (y los que faltan por analizar en el navegador)."""
    m = lib._meta()
    out, pending = [], []
    for snd in lib.list()["sounds"]:
        loops = m["sounds"].get(snd["name"], {}).get("loops") or {}
        for f in snd["files"]:
            meta = loops.get(f["file"])
            if not meta:
                continue
            if meta.get("pending"):
                pending.append({"name": snd["name"], "index": f["index"], "file": f["file"]})
            if not meta.get("loop"):
                continue
            ref = snd["name"] if f["index"] == 0 else f'{snd["name"]}:{f["index"]}'
            out.append({"name": snd["name"], "index": f["index"], "file": f["file"], "ref": ref, "type": snd["type"],
                        "license_name": f.get("license_name"), "author": f.get("author"),
                        **{k: v for k, v in meta.items() if k != "tried"}, "plan": plan(ref, meta, song_bpm)})
    return {"loops": out, "pending": pending, "ffmpeg": bool(shutil.which("ffmpeg"))}


def loop_meta(lib, ref):
    """«base» o «base:1» → metadatos del loop, o None."""
    name, _, idx = ref.partition(":")
    m = lib._meta()["sounds"].get(name) or {}
    loops = m.get("loops") or {}
    if not loops:
        return None
    files = _audio_files(lib, name)
    i = int(idx) if idx.isdigit() else 0
    if not files:
        return None
    meta = loops.get(files[i % len(files)])
    return meta if meta and meta.get("loop") else None


# ====================================================================== Maestro
def for_maestro(lib, song_bpm):
    """Una línea por loop para el contexto de Maestro (con el código ya calculado)."""
    out = []
    items = listing(lib, song_bpm)["loops"]

    def _age(x):   # del más nuevo al más viejo: un loop recién descargado nunca se queda fuera
        try:
            return -os.path.getmtime(os.path.join(lib.dir, x["name"], x["file"]))
        except OSError:
            return 0
    items.sort(key=_age)
    for x in items[:30]:
        p = x["plan"]
        bits = [f'{x["ref"]}: {x.get("kind") or "?"}', f'{fmt(x.get("bpm") or 0)} BPM' if x.get("bpm") else "BPM ?",
                f'{fmt(x.get("bars") or 0)} compases' if x.get("bars") else "", x.get("key") or "", f'{x["duration"]:.1f}s',
                f'{p["slices"]} trozos']
        if x.get("slice_hits") and any(x["slice_hits"]):
            bits.append("golpes por trozo: " + "".join(h or "." for h in x["slice_hits"]))
        warn = f' (a {fmt(song_bpm)} BPM suena {abs(p["semitones"]):.0f} semitonos más {"agudo" if p["semitones"] > 0 else "grave"})' \
            if abs(p["semitones"]) >= 1 and x.get("kind") not in ("drums",) else ""
        out.append(f'- {", ".join(b for b in bits if b)}{warn} → {p["fit"]}')
    return out


LOOPS_PROMPT = """LOOPS LARGOS del alumno (ya analizados por el estudio; los BPM, compases y trozos son fiables):
{lista}
Cómo usarlos (enséñaselo al alumno en tus explicaciones):
- Un loop largo NO se toca como un golpe: usa SIEMPRE el código de la flecha como punto de partida. «loopAt n» lo estira o encoge para que dure n ciclos (1 ciclo = 1 compás) y vaya al tempo de la canción; «# cut 1» hace que cada vez corte a la anterior y no se pisen.
- Para que NO se repita igual: «slow n $ splice N "<[0 1 2 …] […]>" $ s "loop"» reordena sus N trozos con una versión distinta cada vuelta (rellenos al final, trozos repetidos, «sometimesBy 0.2 (# speed 2)»…). Las letras de «golpes por trozo» dicen qué hay en cada trozo: k = bombo/grave, s = caja, h = platos, . = nada. Usa esos índices para rellenos con sentido.
- Para usar solo una parte (un compás): «loopAt 1 $ s "loop" # begin 0.25 # end 0.5 # cut 1» (begin/end en fracciones del archivo).
- Combina loops de tipos distintos (batería + bajo + melodía) en vez de varios del mismo tipo, y arréglalos con mask para que entren y salgan.
- Si un loop melódico suena muchos semitonos desplazado al tempo de la canción, propón cambiar el BPM de la canción a su tempo (o usar otro loop)."""


def fix_code(lib, code, song_bpm):
    """Si un código usa un loop largo «a pelo» (s "base" sin loopAt/splice/chop/begin…), lo ajusta al tempo."""
    if re.search(r"\b(loopAt|splice|chop|striate|slice|bite|begin|chew|fit|legato)\b", code or ""):
        return code
    m = re.search(r'\b(?:s|sound)\s+"([^"]*)"', code or "")
    if not m:
        return code
    toks = re.findall(r"[A-Za-z][\w]*(?::\d+)?", m.group(1))
    if len(set(t.split(":")[0] for t in toks)) != 1:
        return code
    meta = loop_meta(lib, toks[0])
    if not meta:
        return code
    p = plan(toks[0], meta, song_bpm)
    out = f"loopAt {fmt(p['n'])} $ {code.strip()}"
    if not re.search(r"#\s*cut\b", code):
        out += " # cut 1"
    return out


def fix_reply(lib, reply, song_bpm):
    blocks = [reply.get("cambios") or {}] + [v.get("cambios") or {} for v in reply.get("variantes") or [] if isinstance(v, dict)] \
        + [s.get("cambios") or {} for s in reply.get("sugerencias") or [] if isinstance(s, dict)]
    for b in blocks:
        for p in b.get("pistas") or []:
            if isinstance(p, dict) and isinstance(p.get("codigo"), str):
                p["codigo"] = fix_code(lib, p["codigo"], (b.get("bpm") or song_bpm))
    return reply
