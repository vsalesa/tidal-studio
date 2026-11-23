#!/usr/bin/env python3
"""Teclado MIDI virtual para probar «Tocar con mi teclado MIDI» sin piano.

Toca una frase corta (melodía con la derecha y acordes con la izquierda, con algo de imprecisión humana,
como si la tocara una persona) y se la manda al estudio igual que lo haría SuperCollider con tu piano USB:
mensajes OSC /ts/midi al puerto 57140. Abre el panel del teclado en la web, pulsa Grabar y ejecuta:

    python3 tools/virtual_midi.py                 # la frase de ejemplo a 100 BPM
    python3 tools/virtual_midi.py --bpm 120 --bars 4 --pedal
    python3 tools/virtual_midi.py --list-only     # solo anuncia el teclado virtual en Ajustes

Con --port (y `pip install mido python-rtmidi`) crea además un puerto MIDI virtual de verdad
("Tidal Studio Virtual Piano"): SuperCollider lo ve como un teclado más (en Mac pulsa «Buscar teclados»).
Solo biblioteca estándar en el modo normal.
"""
import argparse
import math
import random
import socket
import struct
import sys
import threading
import time

NAME = "Virtual Piano · Tidal Studio"


def _s(x):
    b = str(x).encode("utf-8") + b"\0"
    return b + b"\0" * (-len(b) % 4)


def osc(addr, *args):
    tags, data = ",", b""
    for a in args:
        if isinstance(a, int):
            tags += "i"; data += struct.pack(">i", a)
        elif isinstance(a, float):
            tags += "f"; data += struct.pack(">f", a)
        else:
            tags += "s"; data += _s(a)
    return _s(addr) + _s(tags) + data


# C - Am - F - G: derecha (corcheas) e izquierda (acorde en el 1 y el 3)
MELODY = [[76, 79, 77, 76, 72, None, 74, 76], [72, 74, 76, None, 72, 69, None, None],
          [69, 72, 74, 77, 76, None, 74, 72], [74, None, 71, 67, 67, None, None, None]]
CHORDS = [(48, 52, 55), (45, 48, 52), (41, 45, 48), (43, 47, 50)]


def phrase(bars=4, human=0.018, seed=7):
    """[(segundos en pulsos, tipo, nota, vel)] con el tiempo en negras desde el principio."""
    rng = random.Random(seed)
    ev = []
    for b in range(bars):
        mel, ch = MELODY[b % 4], CHORDS[b % 4]
        for i, n in enumerate(mel):
            if n is None:
                continue
            t = b * 4 + i * 0.5 + rng.uniform(-human, human) * 2
            ev += [(t, "on", n, rng.randint(80, 105)), (t + 0.42, "off", n, 0)]
        for beat in (0, 2):
            for n in ch:
                t = b * 4 + beat + rng.uniform(-human, human) * 2
                ev += [(t, "on", n, rng.randint(60, 78)), (t + 1.8, "off", n, 0)]
    return sorted(ev, key=lambda e: e[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port-osc", type=int, default=57140)
    ap.add_argument("--bpm", type=float, default=100)
    ap.add_argument("--bars", type=int, default=4)
    ap.add_argument("--wait", type=float, default=0, help="segundos antes de empezar (para pulsar Grabar)")
    ap.add_argument("--pedal", action="store_true", help="pisa el pedal de sustain en cada compás")
    ap.add_argument("--list-only", action="store_true")
    ap.add_argument("--port", action="store_true", help="crear también un puerto MIDI virtual real (mido)")
    ap.add_argument("--fake-song", action="store_true",
                    help="simula además una canción sonando en SuperDirt (eventos /ts/ev) y toca a compás con ella")
    a = ap.parse_args()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    dest = (a.host, a.port_osc)
    send = lambda *m: sock.sendto(osc(*m), dest)  # noqa: E731
    out = None
    if a.list_only or not a.port:
        send("/ts/mididevs", NAME)
    if a.list_only:
        print(f"Anunciado «{NAME}»")
        return
    if a.port:
        try:
            import mido  # noqa: PLC0415
            out = mido.open_output("Tidal Studio Virtual Piano", virtual=True)
            print("Puerto MIDI virtual creado: Tidal Studio Virtual Piano")
        except Exception as e:  # noqa: BLE001
            print(f"No puedo crear el puerto virtual ({e}); sigo solo por OSC", file=sys.stderr)
    beat = 60.0 / a.bpm
    ev = phrase(a.bars)
    if a.pedal:
        ev += [(b * 4 + 0.05, "pedal", 64, 127) for b in range(a.bars)] + [(b * 4 + 3.9, "pedal", 64, 0) for b in range(a.bars)]
        ev.sort(key=lambda e: e[0])
    start = time.time() + a.wait
    if a.fake_song:
        # Una «canción» a este tempo: SuperDirt avisa de cada negra (ciclo = 4 negras). La frase empieza en un ciclo.
        cps = a.bpm / 240.0
        c0 = 37.0
        t_c0 = time.time()
        first = math.ceil((start - t_c0) * cps)
        start = t_c0 + first / cps

        def song():
            k = 0
            while True:
                t = t_c0 + k / (4 * cps)
                d = t - time.time()
                if d > 0:
                    time.sleep(d)
                send("/ts/ev", 0, float(c0 + k / 4), 0.25, 0.0, "bd", 0.0, float(cps))
                k += 1
        threading.Thread(target=song, daemon=True).start()
    time.sleep(max(0, start - time.time()))
    print(f"Tocando {a.bars} compases a {a.bpm:g} BPM…")
    for t, kind, note, vel in ev:
        delay = start + t * beat - time.time()
        if delay > 0:
            time.sleep(delay)
        if out is not None:
            import mido  # noqa: PLC0415
            msg = (mido.Message("control_change", control=64, value=vel) if kind == "pedal"
                   else mido.Message("note_on" if kind == "on" else "note_off", note=note, velocity=vel))
            out.send(msg)
        else:
            send("/ts/midi", kind, note, vel, 0, NAME)
    print("Hecho.")
    if a.fake_song:
        time.sleep(1.0)  # la canción sigue un poco (para que el estudio vea que sonaba)


if __name__ == "__main__":
    main()
