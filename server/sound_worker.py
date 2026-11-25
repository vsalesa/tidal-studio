"""Medidas de sonido con librosa (entorno de herramientas de audio). Lee rutas por stdin, una por línea, y
escribe una línea JSON por archivo: {"file", "features"} o {"file", "error"}. Lo lanza server/soundlab.py."""
import json
import math
import os
import sys

import numpy as np
import librosa

SR = 22050
MAX_SEC = float(os.environ.get("TIDAL_STUDIO_SOUND_SEC") or 3.0)  # Ajustes → Límites (server/limits.py)


def measure(path):
    y, sr = librosa.load(path, sr=SR, mono=True, duration=MAX_SEC)
    if not len(y):
        return None
    hop = int(sr * 0.01)
    env = librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]
    peak = float(env.max()) or 1e-9
    ipk = int(env.argmax())
    start = int(np.argmax(env > peak * 0.1))
    after = ipk + int(np.argmax(env[ipk:] < peak * 0.1)) if (env[ipk:] < peak * 0.1).any() else len(env)
    cent = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    flat = librosa.feature.spectral_flatness(y=y)[0]
    f0, voiced, prob = librosa.pyin(y, fmin=40, fmax=1000, sr=sr, frame_length=2048)
    good = f0[(voiced) & (prob > 0.6)] if f0 is not None else []
    pitch = round(float(69 + 12 * math.log2(np.median(good) / 440.0)), 1) if len(good) else None
    return {"dur": round(len(y) / sr, 2), "attack": round(max(0, ipk - start) * 0.01, 3),
            "decay": round(max(0.01, (after - ipk) * 0.01), 2),
            "bright": round(min(1.0, float(np.median(cent)) / (sr / 2) * 2.2), 2),
            "noise": round(min(1.0, float(np.median(flat)) ** 0.5 * 1.6), 2), "pitch": pitch,
            "level": round(20 * math.log10(float(np.abs(y).max()) or 1e-9), 1)}


for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    try:
        print(json.dumps({"file": path, "features": measure(path)}), flush=True)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"file": path, "error": str(e)[:200]}), flush=True)
