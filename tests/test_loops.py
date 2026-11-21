"""Pruebas del análisis de loops largos (server/loops.py). Ejecuta: python3 -m unittest discover tests"""
import math
import os
import random
import shutil
import struct
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import loops  # noqa: E402
from samples import Library  # noqa: E402
import assistant  # noqa: E402

SR = 22050


def write_wav(path, y, ch=1, bits=16):
    w = wave.open(path, "wb")
    w.setnchannels(ch)
    w.setsampwidth(bits // 8)
    w.setframerate(SR)
    fr = bytearray()
    for v in y:
        v = max(-1.0, min(1.0, v))
        b = struct.pack("<h", int(v * 32000)) if bits == 16 else struct.pack("<i", int(v * 8388000))[:3]
        fr += b * ch
    w.writeframes(bytes(fr))
    w.close()


def drum_loop(bpm, bars, seed=1):
    random.seed(seed)
    beat = 60 / bpm
    n = int(SR * beat * 4 * bars)
    y = [0.0] * n

    def add(t, f, length=0.2):
        s = int(t * SR)
        for i in range(int(length * SR)):
            if s + i < n:
                y[s + i] += f(i / SR)
    for b in range(bars * 4):
        t = b * beat
        add(t, lambda x: math.sin(2 * math.pi * (55 + 80 * math.exp(-x * 30)) * x) * math.exp(-x * 12))
        add(t + (0.75 if b % 2 == 0 else 0.5) * beat, lambda x: random.uniform(-1, 1) * 0.6 * math.exp(-x * 25))
        add(t + 0.5 * beat, lambda x: random.uniform(-1, 1) * 0.25 * math.exp(-x * 80), 0.05)
    return y


def bass_loop(bpm, bars):
    beat = 60 / bpm
    y = [0.0] * int(SR * beat * 4 * bars)
    notes = [45, 45, 48, 43]
    for b in range(bars * 4):
        f = 440 * 2 ** ((notes[(b // 2) % 4] - 69) / 12)
        s = int(b * beat * SR)
        for i in range(int(beat * SR * 0.9)):
            x = i / SR
            y[s + i] += 0.6 * math.sin(2 * math.pi * f * x) * min(1, x * 200) * math.exp(-x * 2)
    return y


class LoopsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.drums = os.path.join(cls.tmp, "dembow.wav")
        write_wav(cls.drums, drum_loop(96, 2), ch=2, bits=24)
        cls.bass = os.path.join(cls.tmp, "groove_bass_loop.wav")
        write_wav(cls.bass, bass_loop(100, 2))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_name_hints(self):
        h = loops.name_hints("Reggaeton_Drums_95BPM_Am")
        self.assertEqual(h["bpm"], 95)
        self.assertEqual(h["key"], "A minor")
        self.assertEqual(h["kind"], "drums")
        self.assertEqual(loops.name_hints("Lead 128 bpm F#min")["key"], "F# minor")
        self.assertNotIn("key", loops.name_hints("big drum break"))

    def test_drum_tempo_and_bars(self):
        y, sr, dur = loops.decode(self.drums)  # WAV estéreo de 24 bits
        m = loops.analyse_samples(y, sr, dur, "dembow.wav")
        self.assertTrue(m["loop"])
        self.assertAlmostEqual(m["bpm"], 96, delta=1)
        self.assertEqual(m["bars"], 2)
        self.assertEqual(m["kind"], "drums")
        self.assertEqual(m["slices"], 16)
        self.assertEqual(m["slice_hits"][0], "k")

    def test_bass_key(self):
        y, sr, dur = loops.decode(self.bass)
        m = loops.analyse_samples(y, sr, dur, "groove_bass_loop.wav")
        self.assertAlmostEqual(m["bpm"], 100, delta=1)
        self.assertEqual(m["kind"], "bass")
        self.assertIn(m.get("key"), ("A minor", "C major"))

    def test_plan(self):
        meta = {"bpm": 95, "bars": 4, "slices": 32, "kind": "drums", "duration": 10.1}
        p = loops.plan("base", meta, 95)
        self.assertEqual(p["fit"], 'loopAt 4 $ chop 32 $ s "base" # cut 1')
        self.assertAlmostEqual(p["speed"], 1)
        # a doble tempo se toca a medio tiempo en vez de sonar como una ardilla
        p = loops.plan("base", meta, 190)
        self.assertEqual(p["n"], 8)
        self.assertAlmostEqual(p["speed"], 1)
        self.assertIn("splice 16", p["splice"])
        self.assertIn("]!2 [", p["splice"])

    def test_library_flow_and_maestro(self):
        root = tempfile.mkdtemp()
        try:
            lib = Library(root)
            lib.on_add = lambda n, f, info: loops.maybe_analyse(lib, n, f, info)
            with open(self.drums, "rb") as f:
                r = loops.import_file(lib, "Dembow 96BPM.wav", f.read())
            self.assertEqual(r["status"], "ok")
            self.assertEqual(r["bpm"], 96)
            name = r["name"]
            lst = loops.listing(lib, 96)["loops"]
            self.assertEqual(lst[0]["plan"]["fit"], f'loopAt 2 $ chop 16 $ s "{name}" # cut 1')
            # Maestro escribe el loop «a pelo»: el estudio lo ajusta al tempo
            reply = {"cambios": {"pistas": [{"id": "d1", "codigo": f's "{name}" # gain 0.9'}]}}
            loops.fix_reply(lib, reply, 96)
            self.assertEqual(reply["cambios"]["pistas"][0]["codigo"], f'loopAt 2 $ s "{name}" # gain 0.9 # cut 1')
            ok = f'loopAt 2 $ chop 16 $ s "{name}" # cut 1'
            self.assertEqual(loops.fix_code(lib, ok, 96), ok)
            # el contexto de Maestro incluye el loop con su código
            lines = loops.for_maestro(lib, 96)
            self.assertIn("96 BPM", lines[0])
            msgs = assistant.build_messages([{"role": "user", "content": "hola"}], {"bpm": 96, "loops_lines": lines})[1]
            self.assertIn("LOOPS LARGOS", msgs[-1]["content"] if isinstance(msgs[-1]["content"], str) else str(msgs[-1]["content"]))
            # corrección a mano
            loops.edit(lib, name, 0, {"bars": 4})
            self.assertEqual(loops.loop_meta(lib, name)["bpm_source"], "user")
            self.assertAlmostEqual(loops.loop_meta(lib, name)["bpm"], 192, delta=1)
            # duplicado
            with open(self.drums, "rb") as f:
                self.assertEqual(loops.import_file(lib, "Dembow 96BPM.wav", f.read())["status"], "dup")
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_zip(self):
        import io
        import zipfile
        root = tempfile.mkdtemp()
        try:
            lib = Library(root)
            lib.on_add = lambda n, f, info: loops.maybe_analyse(lib, n, f, info)
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as z:
                z.write(self.drums, "Pack/Drums/dembow 96 bpm.wav")
                z.write(self.bass, "Pack/Bass/bass_loop_100bpm_Am.wav")
                z.writestr("__MACOSX/._x.wav", b"junk")
                z.writestr("Pack/readme.txt", b"hi")
            out = loops.import_zip(lib, buf.getvalue())
            self.assertEqual(sorted(o["status"] for o in out), ["ok", "ok"])
            self.assertEqual({o["bpm"] for o in out}, {96, 100})
        finally:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
