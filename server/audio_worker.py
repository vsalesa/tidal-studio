"""Convierte una canción en audio (mp3, wav, flac, m4a…) en un MIDI aproximado.

Se ejecuta con el Python de las herramientas de audio (~/.tidal-studio/audio-tools), NO con el del
estudio, porque necesita MSST o Demucs (separar instrumentos), basic-pitch (pasar a notas) y librosa (tempo).
Uso: python audio_worker.py entrada.mp3 salida.mid carpeta_temporal [auto|msst|demucs] [carpeta_de_modelos]
Va escribiendo «PROGRESS <0-100> <texto>» para que el estudio enseñe por dónde va.
"""
import os
import struct
import sys

import numpy as np

os.environ.setdefault("TQDM_DISABLE", "1")  # sin barras de progreso de texto: el estudio enseña la suya


def progress(p, es, en):
    print(f"PROGRESS {int(p)} {es}|{en}", flush=True)


# Separadores, del mejor al de respaldo. MSST (Music-Source-Separation-Training, de ZFTurbo, licencia MIT)
# con su modelo SCNet XL: en canciones reales separa mejor que Demucs, sobre todo bajo y batería.
MSST_MODEL = {
    "type": "scnet",
    "config": "https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/download/v1.0.15/config_musdb18_scnet_xl_more_wide_v5.yaml",
    "weights": "https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/download/v1.0.15/model_scnet_ep_36_sdr_10.0891.ckpt",
    "size_mb": 214,
}
STEMS = ("drums", "bass", "other", "vocals")


def _download(url, dest, pct0, pct1, es, en):
    """Descarga con progreso (una sola vez: luego se queda en la carpeta de modelos)."""
    import urllib.request
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    tmp = dest + ".part"
    with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        got, last = 0, -1
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            got += len(b)
            if total:
                p = pct0 + (pct1 - pct0) * got / total
                if int(p) != last:
                    last = int(p)
                    progress(p, f"{es} ({got >> 20}/{total >> 20} MB)…", f"{en} ({got >> 20}/{total >> 20} MB)…")
    os.replace(tmp, dest)
    return dest


def separate_msst(path, work, models_dir):
    """MSST: descarga el modelo la primera vez y separa batería, bajo, voz y el resto."""
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")  # Apple Silicon: lo que MPS no sepa hacer va a la CPU
    import soundfile as sf
    from msst import Separator
    os.makedirs(models_dir, exist_ok=True)
    cfg = _download(MSST_MODEL["config"], os.path.join(models_dir, os.path.basename(MSST_MODEL["config"])), 3, 4,
                    "Descargando la configuración del modelo", "Downloading the model configuration")
    ckpt = _download(MSST_MODEL["weights"], os.path.join(models_dir, os.path.basename(MSST_MODEL["weights"])), 4, 20,
                     f"Descargando el modelo SCNet XL de MSST (solo la primera vez, {MSST_MODEL['size_mb']} MB)",
                     f"Downloading MSST's SCNet XL model (first time only, {MSST_MODEL['size_mb']} MB)")
    import re
    import torch
    gpu = torch.cuda.is_available() or (hasattr(torch.backends, "mps") and torch.backends.mps.is_available())
    if not gpu:
        # Sin tarjeta gráfica (ni Apple Silicon) va lento: solapamos menos los trozos (2 en vez de 4).
        # Pierde muy poca calidad y tarda la mitad.
        fast = cfg[:-5] + "-cpu.yaml"
        with open(cfg, encoding="utf-8") as f:
            txt = re.sub(r"(num_overlap:\s*)\d+", r"\g<1>2", f.read())
        with open(fast, "w", encoding="utf-8") as f:
            f.write(txt)
        cfg = fast
    progress(22, "Separando instrumentos con MSST (SCNet XL)…", "Separating instruments with MSST (SCNet XL)…")
    import threading
    import soundfile as _sf
    done = threading.Event()
    secs = _sf.info(path).duration * (1.5 if gpu else 6.0)  # lo que suele tardar (medido en CPU de 4 núcleos)

    def tick():  # MSST no dice por dónde va: avanzamos la barra con lo que suele tardar
        t = 0
        while not done.wait(2):
            t += 2
            p = 22 + 22 * min(0.97, t / max(secs, 1))
            progress(p, f"Separando instrumentos con MSST (SCNet XL)… {int(t // 60)}:{int(t % 60):02d}",
                     f"Separating instruments with MSST (SCNet XL)… {int(t // 60)}:{int(t % 60):02d}")
    threading.Thread(target=tick, daemon=True).start()
    try:
        with Separator(model_type=MSST_MODEL["type"], config_path=cfg, checkpoint_path=ckpt) as sep:
            print(f"DEVICE {sep.device}", flush=True)
            out = sep.separate_file(path)
            sr = sep.sample_rate
    finally:
        done.set()
    stems = {}
    for k in STEMS:
        if k in out:
            p = os.path.join(work, k + ".wav")
            a = out[k]
            sf.write(p, a.T if a.ndim == 2 and a.shape[0] <= 2 else a, sr)
            stems[k] = p
    return stems


def separate_demucs(path, work, announce=True):
    """Demucs (htdemucs): rápido; el separador de respaldo."""
    import demucs.separate
    if announce:
        progress(22, "Separando instrumentos con Demucs (la primera vez descarga el modelo, ~80 MB)…",
                 "Separating instruments with Demucs (first time downloads the model, ~80 MB)…")
    demucs.separate.main(["-n", "htdemucs", "-o", work, "--jobs", "0", path])
    base = os.path.splitext(os.path.basename(path))[0]
    d = os.path.join(work, "htdemucs", base)
    return {k: os.path.join(d, k + ".wav") for k in STEMS if os.path.exists(os.path.join(d, k + ".wav"))}


def separate(path, work, engine="auto", models_dir=None):
    """Devuelve {nombre: ruta.wav}.
    msst/auto: batería, voz y resto con MSST (SCNet XL) y el bajo con Demucs, que en nuestras pruebas con
    canciones reales (MUSDB18) separa mejor el bajo; si MSST falla, todo con Demucs.
    demucs: todo con Demucs (rápido)."""
    models_dir = models_dir or os.path.join(os.path.dirname(os.path.dirname(sys.executable)), "..", "models")
    if engine in ("auto", "msst"):
        try:
            stems = separate_msst(path, work, os.path.abspath(models_dir))
        except Exception as e:  # noqa: BLE001
            print(f"MSST falló, uso Demucs: {e}", flush=True)
            progress(20, "MSST no ha funcionado aquí: uso Demucs…", "MSST didn't work here: using Demucs…")
            return separate_demucs(path, work)
        try:
            progress(45, "Sacando el bajo con Demucs…", "Getting the bass with Demucs…")
            dem = separate_demucs(path, os.path.join(work, "demucs"), announce=False)
            if "bass" in dem:
                stems["bass"] = dem["bass"]
        except Exception as e:  # noqa: BLE001  el bajo de MSST también sirve
            print(f"Demucs falló, me quedo con el bajo de MSST: {e}", flush=True)
        return stems
    return separate_demucs(path, work)


def beat_grid(path):
    """Tiempos de cada pulso (segundos) y tempo medio."""
    import librosa
    y, sr = librosa.load(path, sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    tempo = float(np.atleast_1d(tempo)[0])
    beats = [float(b) for b in beats]
    if len(beats) < 4:
        step = 60.0 / (tempo or 120)
        beats = [i * step for i in range(int(len(y) / sr / step) + 1)]
    # el detector suele empezar a contar tarde: alargamos la rejilla hacia atrás hasta el principio
    step = (beats[-1] - beats[0]) / (len(beats) - 1)
    while beats[0] - step > -step * 0.25:
        beats.insert(0, beats[0] - step)
    return tempo, beats, len(y) / sr


def to_beats(t, beats):
    """Segundos → pulsos, interpolando entre los pulsos detectados (sigue los cambios de tempo)."""
    if t <= beats[0]:
        step = beats[1] - beats[0]
        return (t - beats[0]) / step
    for i in range(len(beats) - 1):
        if beats[i] <= t < beats[i + 1]:
            return i + (t - beats[i]) / (beats[i + 1] - beats[i])
    step = beats[-1] - beats[-2]
    return len(beats) - 1 + (t - beats[-1]) / step


def transcribe(path, low, high):
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH
    _, _, events = predict(path, ICASSP_2022_MODEL_PATH, onset_threshold=0.55, frame_threshold=0.3,
                           minimum_note_length=90, minimum_frequency=low, maximum_frequency=high,
                           multiple_pitch_bends=False, melodia_trick=True)
    return [(float(s), float(e), int(p), float(a)) for s, e, p, a, *_ in events]


def drum_hits(path):
    """Golpes de batería: bombo (graves), caja (medios con ruido) o platillos (agudos)."""
    import librosa
    y, sr = librosa.load(path, sr=22050, mono=True)
    on = librosa.onset.onset_detect(y=y, sr=sr, units="samples", backtrack=False)
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=256))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=1024)
    lo, mid, hi = freqs < 150, (freqs >= 200) & (freqs < 3000), freqs >= 6000
    feats = []
    peak = float(np.max(np.abs(y))) or 1.0
    for s in on:
        f = int(s / 256)
        seg = S[:, f:f + 6]
        if seg.size == 0:
            continue
        e = seg.mean(axis=1)
        tot = float(e.sum()) + 1e-9
        amp = float(np.max(np.abs(y[s:s + 2048]))) / peak
        if amp < 0.08:
            continue
        feats.append((s / sr, amp, float(e[lo].sum()) / tot, float(e[hi].sum()) / tot, float((e * freqs).sum()) / tot))
    if not feats:
        return []
    # Cada canción suena distinto: comparamos cada golpe con los demás de la misma canción
    lows = sorted(x[2] for x in feats)
    cents = sorted(x[4] for x in feats)
    q = lambda arr, p: arr[min(len(arr) - 1, int(len(arr) * p))]  # noqa: E731
    low_cut, cent_lo, cent_hi = max(0.25, q(lows, 0.6)), q(cents, 0.5), q(cents, 0.75)
    hits = []
    for t, amp, lr, hr, cent in feats:
        if lr >= low_cut and cent <= cent_lo:
            note = 36
        elif cent >= cent_hi and lr < low_cut:
            note = 42
        else:
            note = 38
        hits.append((t, t + 0.1, note, amp))
    return hits


def write_midi(out, tempo, parts, ppq=480):
    """parts: [(nombre, canal, programa, [(inicio_pulsos, fin_pulsos, tono, vel)])]"""
    def vl(n):
        b = [n & 0x7F]
        n >>= 7
        while n:
            b.insert(0, (n & 0x7F) | 0x80)
            n >>= 7
        return bytes(b)

    def chunk(events):
        events.sort(key=lambda e: (e[0], e[1]))
        data, last = b"", 0
        for t, _, msg in events:
            data += vl(t - last) + msg
            last = t
        data += vl(0) + b"\xff\x2f\x00"
        return b"MTrk" + struct.pack(">I", len(data)) + data

    us = int(60_000_000 / (tempo or 120))
    mark = b"tidal-studio:audio"  # para que el importador sepa que viene de un audio (cuadra más suelto)
    tracks = [chunk([(0, 0, b"\xff\x51\x03" + us.to_bytes(3, "big")), (0, 0, b"\xff\x58\x04\x04\x02\x18\x08"),
                     (0, 0, b"\xff\x01" + vl(len(mark)) + mark)])]
    for name, ch, prog, notes in parts:
        ev = [(0, 0, b"\xff\x03" + vl(len(name.encode())) + name.encode())]
        if ch != 9:
            ev.append((0, 1, bytes([0xC0 | ch, prog])))
        for s, e, p, v in notes:
            ts, te = int(round(s * ppq)), int(round(e * ppq))
            if ts < -ppq // 4 or not 0 <= p < 128:
                continue
            ts = max(0, ts)
            te = max(te, ts + ppq // 8)
            ev.append((ts, 3, bytes([0x90 | ch, p, max(1, min(127, int(v)))])))
            ev.append((te, 2, bytes([0x80 | ch, p, 0])))
        tracks.append(chunk(ev))
    with open(out, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), ppq) + b"".join(tracks))


def main(src, out, work, engine="auto", models_dir=None):
    stems = separate(src, work, engine, models_dir)
    progress(55, "Buscando el pulso y el tempo…", "Finding the beat and tempo…")
    tempo, beats, dur = beat_grid(src)
    import librosa
    rms = {}
    for k, path in stems.items():
        yk, _ = librosa.load(path, sr=11025, mono=True)
        rms[k] = float(np.sqrt(np.mean(yk ** 2))) if len(yk) else 0.0
    loudest = max(rms.values() or [0]) or 1.0
    stems = {k: v for k, v in stems.items() if rms[k] >= loudest * 0.05}  # pistas casi en silencio: fuera
    parts = []
    plan = [("bass", "Bass", 0, 33, 30, 400, 55), ("other", "Chords", 1, 0, 80, 2000, 70), ("vocals", "Melody", 2, 52, 80, 1400, 85)]
    for i, (stem, name, ch, prog, lo, hi, pct) in enumerate(plan):
        if stem not in stems:
            continue
        progress(pct, f"Pasando a notas: {name}…", f"Transcribing: {name}…")
        notes = transcribe(stems[stem], lo, hi)
        if stem == "bass":  # el bajo: una nota cada vez, la más grave
            notes.sort()
            mono = []
            for n in notes:
                if mono and n[0] < mono[-1][1] - 0.05:
                    if n[2] < mono[-1][2]:
                        mono[-1] = n
                    continue
                mono.append(n)
            notes = mono
        parts.append((name, ch, prog, [(to_beats(s, beats), to_beats(e, beats), p, 40 + a * 87) for s, e, p, a in notes]))
    if "drums" in stems:
        progress(92, "Leyendo la batería…", "Reading the drums…")
        hits = drum_hits(stems["drums"])
        parts.append(("Drums", 9, 0, [(to_beats(s, beats), to_beats(e, beats), p, 50 + a * 77) for s, e, p, a in hits]))
    write_midi(out, tempo, parts)
    progress(100, "Listo", "Done")
    print(f"TEMPO {tempo:.1f} DURATION {dur:.1f}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], *(sys.argv[4:6]))
