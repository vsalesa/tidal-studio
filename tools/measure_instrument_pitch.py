"""
Algunas bibliotecas nombran las notas con otra octava (su «C3» es el do central).
Este script descarga el principio de 3 grabaciones de cada instrumento, mide su altura real y guarda
en server/data/instrument-files.json cuántos semitonos hay que sumar al nombre ("shift").
Necesita numpy y ffmpeg (solo para quien mantiene el catálogo, no para usar Tidal Studio).

    python3 tools/measure_instrument_pitch.py
"""
import json
import os
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

PATH = os.path.join(os.path.dirname(__file__), "..", "server", "data", "instrument-files.json")
SR = 44100
DEFAULT = {"https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/": 12, "https://raw.githubusercontent.com/sgossner/VCSL/master/": 12}


def f0(url):
    req = urllib.request.Request(url, headers={"User-Agent": "tidal-studio-dev", "Range": "bytes=0-1500000"})
    data = urllib.request.urlopen(req, timeout=60).read()
    a = np.frombuffer(subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "-", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                                     input=data, capture_output=True).stdout, dtype=np.float32).astype(float)
    on = int(np.argmax(np.abs(a) > 0.1 * np.abs(a).max()))
    x = a[on + 2000:on + 2000 + 32768]
    x = x - x.mean()
    sp = np.abs(np.fft.rfft(x * np.hanning(len(x)), 1 << 19))
    fr = np.fft.rfftfreq(1 << 19, 1 / SR)
    hps = sp.copy()
    for h in (2, 3, 4):
        hps[:len(sp) // h] *= sp[::h][:len(sp) // h]
    m = (fr > 25) & (fr < 3000)
    return float(fr[m][np.argmax(hps[m])])


def measure(item):
    iid, v = item
    notes = sorted((int(k), p) for k, p in v["notes"].items())
    picks = [notes[len(notes) // 4], notes[len(notes) // 2], notes[3 * len(notes) // 4]]
    offs = []
    for k, p in picks:
        try:
            real = 69 + 12 * np.log2(f0(v["base"] + p) / 440)
            off = real - k
            if abs(off - 12 * round(off / 12)) < 0.7:
                offs.append(int(12 * round(off / 12)))
        except Exception:
            pass
    best = max(set(offs), key=offs.count) if offs else None
    if best is not None and offs.count(best) >= 2:   # dos de tres medidas coinciden
        return iid, best, offs
    return iid, DEFAULT.get(v["base"], 0), offs


def main():
    with open(PATH, encoding="utf-8") as f:
        d = json.load(f)
    todo = [(k, v) for k, v in d.items() if v.get("notes") and k != "salamander_grand"]
    with ThreadPoolExecutor(6) as ex:
        for iid, shift, offs in ex.map(measure, todo):
            d[iid]["shift"] = shift
            print(f"{iid:28s} shift {shift:+d}   medidas {offs}")
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
