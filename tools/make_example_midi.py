"""Escribe examples/little-tune.mid: una canción original y sencilla (melodía, acordes, bajo y batería) para
probar «Generar desde mi MIDI». Sin dependencias: escribe el MIDI a mano.

    python3 tools/make_example_midi.py
"""
import os
import struct
import sys

PPQ = 480
BAR = PPQ * 4


def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(out)


def track(events, name=None, program=None, ch=0):
    """events: (tick, nota, duración, velocidad)."""
    ev = []
    if name:
        ev.append((0, b"\xff\x03" + vlq(len(name)) + name.encode()))
    if program is not None:
        ev.append((0, bytes([0xC0 | ch, program])))
    for t, n, d, v in events:
        ev.append((t, bytes([0x90 | ch, n, v])))
        ev.append((t + d, bytes([0x80 | ch, n, 0])))
    ev.sort(key=lambda e: (e[0], e[1][0] & 0xF0 == 0x90))
    data, last = b"", 0
    for t, b in ev:
        data += vlq(t - last) + b
        last = t
    data += b"\x00\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def song():
    tempo = b"\x00\xff\x51\x03" + (60_000_000 // 110).to_bytes(3, "big") + b"\x00\xff\x58\x04\x04\x02\x18\x08\x00\xff\x2f\x00"
    meta = b"MTrk" + struct.pack(">I", len(tempo)) + tempo
    chords = [(60, 64, 67), (57, 60, 64), (53, 57, 60), (55, 59, 62)] * 2  # C Am F G
    E = PPQ // 2  # corchea
    mel_bars = [
        [(0, 76, 2), (2, 79, 1), (3, 77, 1), (4, 76, 2), (6, 72, 2)],
        [(0, 72, 1), (1, 74, 1), (2, 76, 2), (4, 72, 2), (6, 69, 2)],
        [(0, 69, 2), (2, 72, 1), (3, 74, 1), (4, 77, 2), (6, 76, 1), (7, 74, 1)],
        [(0, 74, 3), (3, 71, 1), (4, 67, 4)],
        [(0, 76, 2), (2, 79, 1), (3, 77, 1), (4, 76, 2), (6, 79, 2)],
        [(0, 81, 2), (2, 79, 1), (3, 76, 1), (4, 72, 4)],
        [(0, 77, 1), (1, 76, 1), (2, 74, 1), (3, 72, 1), (4, 69, 2), (6, 72, 2)],
        [(0, 71, 2), (2, 74, 2), (4, 72, 4)],
    ]
    mel = [(b * BAR + s * E, n, d * E - 20, 96) for b, bar in enumerate(mel_bars) for s, n, d in bar]
    pad = [(b * BAR + beat * PPQ, n, PPQ - 30, 70) for b, c in enumerate(chords) for beat in (0, 2) for n in c]
    bass = []
    for b, c in enumerate(chords):
        r = c[0] - 24 if c[0] < 57 or c[0] == 60 else c[0] - 24
        bass += [(b * BAR, r, PPQ * 2 - 40, 100), (b * BAR + PPQ * 2, r + 7, PPQ - 40, 90), (b * BAR + PPQ * 3, r, PPQ - 40, 90)]
    drums = []
    for b in range(8):
        for k in range(8):
            t = b * BAR + k * E
            drums.append((t, 42, 60, 70))
            if k in (0, 4, 5):
                drums.append((t, 36, 60, 110))
            if k in (2, 6):
                drums.append((t, 38, 60, 100))
    head = b"MThd" + struct.pack(">IHHH", 6, 1, 5, PPQ)
    return (head + meta + track(mel, "Melody", 73, 0) + track(pad, "Piano", 0, 1)
            + track(bass, "Bass", 33, 2) + track(drums, "Drums", None, 9))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "examples", "little-tune.mid")
    with open(out, "wb") as f:
        f.write(song())
    print(out)
