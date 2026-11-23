"""Pruebas de la biblioteca de instrumentos (server/instcatalog.py, server/instlib.py). Sin red.
Ejecuta: python3 -m unittest discover tests"""
import io
import math
import os
import shutil
import struct
import sys
import tempfile
import unittest
import wave
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import instcatalog as cat  # noqa: E402
import instlib  # noqa: E402
from samples import Library  # noqa: E402

SR = 22050


def sine(freq, sec=0.5, sr=SR):
    return struct.pack("<%dh" % int(sr * sec), *(int(12000 * math.sin(2 * math.pi * freq * i / sr)) for i in range(int(sr * sec))))


def wav_bytes(pcm, sr=SR, ch=1, bits=16):
    b = io.BytesIO()
    w = wave.open(b, "wb")
    w.setnchannels(ch)
    w.setsampwidth(bits // 8)
    w.setframerate(sr)
    w.writeframes(pcm)
    w.close()
    return b.getvalue()


def tiny_sf2(pcm, root=60, sr=SR):
    """Un SoundFont 2 mínimo: un preset (0:0) con un instrumento y una grabación con bucle."""
    def chunk(cid, data):
        return cid + struct.pack("<I", len(data)) + data + (b"\0" if len(data) & 1 else b"")

    def lst(kind, *chunks):
        body = kind + b"".join(chunks)
        return b"LIST" + struct.pack("<I", len(body)) + body

    n = len(pcm) // 2
    smpl = pcm + b"\0" * 92   # 46 muestras de silencio al final, como pide la especificación
    phdr = struct.pack("<20sHHHIII", b"Tiny Piano", 0, 0, 0, 0, 0, 0) + struct.pack("<20sHHHIII", b"EOP", 0, 0, 1, 0, 0, 0)
    pbag = struct.pack("<HH", 0, 0) + struct.pack("<HH", 1, 0)
    pgen = struct.pack("<HH", 41, 0) + struct.pack("<HH", 0, 0)
    inst = struct.pack("<20sH", b"Tiny", 0) + struct.pack("<20sH", b"EOI", 1)
    ibag = struct.pack("<HH", 0, 0) + struct.pack("<HH", 4, 0)
    igen = (struct.pack("<HH", 43, 0 | (127 << 8)) + struct.pack("<HH", 54, 1)
            + struct.pack("<HH", 58, root) + struct.pack("<HH", 53, 0) + struct.pack("<HH", 0, 0))
    shdr = (struct.pack("<20sIIIIIBbHH", b"tone", 0, n, n // 2, n - 10, sr, root, 0, 0, 1)
            + struct.pack("<20sIIIIIBbHH", b"EOS", 0, 0, 0, 0, 0, 0, 0, 0, 0))
    body = b"sfbk" + lst(b"INFO", chunk(b"ifil", struct.pack("<HH", 2, 1))) + lst(b"sdta", chunk(b"smpl", smpl)) + lst(
        b"pdta", chunk(b"phdr", phdr), chunk(b"pbag", pbag), chunk(b"pmod", b"\0" * 10), chunk(b"pgen", pgen),
        chunk(b"inst", inst), chunk(b"ibag", ibag), chunk(b"imod", b"\0" * 10), chunk(b"igen", igen), chunk(b"shdr", shdr))
    return b"RIFF" + struct.pack("<I", len(body)) + body


class CatalogTest(unittest.TestCase):
    def test_ids_unique_and_complete(self):
        ids = [i["id"] for i in cat.ITEMS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreater(len(ids), 500)
        for it in cat.ITEMS:
            self.assertIn(it["cat"], cat.CAT_IDS, it["id"])
            self.assertTrue(it["es"] and it["en"], it["id"])
            self.assertRegex(it["id"], r"^[a-z0-9_]+$")

    def test_specific_instruments_exist(self):
        for iid in ("harpsichord_fluid", "contrabass_fluid", "vsco_contrabass_pizz", "salamander_grand", "ts_rhodes"):
            self.assertIn(iid, cat.BY_ID, iid)

    def test_sampled_have_files(self):
        files = instlib.files_map()
        for it in cat.ITEMS:
            if it["kind"] in ("multi", "kit") and it["src"] not in ("fluid", "musyng", "fatboy"):
                self.assertIn(it["id"], files, it["id"])


class PlanTest(unittest.TestCase):
    def test_gm_plan_covers_range(self):
        it = cat.BY_ID["harpsichord_fluid"]
        p = instlib.plan(it)
        lo, hi = it["range"]
        self.assertTrue(p[0][1].startswith(f"m{lo:03d}_"))
        self.assertTrue(p[-1][1].startswith(f"m{hi:03d}_"))
        self.assertTrue(all(u.startswith("https://gleitz.github.io/") for u, _ in p))
        self.assertIn("harpsichord-mp3/", p[0][0])

    def test_sampled_plan_spacing_and_names(self):
        for iid, f in list(instlib.files_map().items())[:60]:
            if "notes" not in f or iid not in cat.BY_ID:
                continue
            p = instlib.plan(cat.BY_ID[iid])
            midis = [int(n[1:4]) for _, n in p]
            self.assertEqual(midis, sorted(midis), iid)
            self.assertTrue(all(b - a >= 3 for a, b in zip(midis, midis[1:])), iid)
            for _, name in p:
                self.assertRegex(name, r"^m\d{3}_[A-G]b?-?\d")

    def test_note_label(self):
        self.assertEqual(instlib.note_label(60), "C4")
        self.assertEqual(instlib.note_label(61), "Db4")
        self.assertEqual(instlib.note_label(21), "A0")


class NamesTest(unittest.TestCase):
    def test_midi_in_name(self):
        self.assertEqual(instlib.midi_in_name("Piano_C#4_mf.wav"), 61)
        self.assertEqual(instlib.midi_in_name("Cello Bb2.wav"), 46)
        self.assertEqual(instlib.midi_in_name("violin-060.wav"), 60)
        self.assertIsNone(instlib.midi_in_name("kick.wav"))

    def test_parse_key(self):
        self.assertEqual(instlib.parse_key("60"), 60)
        self.assertEqual(instlib.parse_key("c4"), 60)
        self.assertEqual(instlib.parse_key("F#3"), 54)
        self.assertIsNone(instlib.parse_key("zz"))

    def test_parse_sfz_inheritance(self):
        regs = instlib.parse_sfz("""
        // comentario
        <control> default_path=samples/
        <global> ampeg_release=0.5
        <group> lokey=0 hikey=60
        <region> sample=Low C.wav pitch_keycenter=48
        <region> sample=mid.wav pitch_keycenter=c4
        <group> lokey=61
        <region> sample=hi.wav pitch_keycenter=72
        """)
        self.assertEqual(len(regs), 3)
        self.assertEqual(regs[0]["sample"], "Low C.wav")
        self.assertEqual(regs[0]["default_path"], "samples/")
        self.assertEqual(regs[1]["hikey"], "60")
        self.assertNotIn("hikey", regs[2])
        self.assertEqual(regs[2]["ampeg_release"], "0.5")


class AudioTest(unittest.TestCase):
    def test_wav_to16_trims_and_converts(self):
        pcm = struct.pack("<%di" % (SR * 10), *([1000 << 8] * (SR * 10)))
        raw = b"".join(pcm[i:i + 3] for i in range(1, len(pcm), 4))   # 24 bits
        out = instlib.wav_to16(wav_bytes(raw, bits=24))
        w = wave.open(io.BytesIO(out))
        self.assertEqual(w.getsampwidth(), 2)
        self.assertLessEqual(w.getnframes() / w.getframerate(), instlib.MAX_SEC + 0.01)


class ImportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.il = instlib.InstLib(Library(self.tmp))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def files(self, iid):
        return sorted(os.listdir(self.il.folder(iid)))

    def test_single_audio_file(self):
        r = self.il.upload("my_flute_A4.wav", wav_bytes(sine(440)), name="my flute")
        self.assertEqual(r["note"], "A4")
        self.assertIn("m069_A4.wav", self.files(r["id"]))
        self.assertIn(r["id"], [i["id"] for i in self.il.user_items()])

    def test_zip_with_notes(self):
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            for n, f in (("C3", 130.8), ("C4", 261.6), ("C5", 523.3)):
                z.writestr(f"oboe/oboe_{n}.wav", wav_bytes(sine(f)))
        r = self.il.upload("oboe.zip", b.getvalue())
        self.assertEqual((r["kind"], r["notes"]), ("multi", 3))
        self.assertEqual([f for f in self.files("oboe") if f.startswith("m")], ["m048_C3.wav", "m060_C4.wav", "m072_C5.wav"])

    def test_zip_kit(self):
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            for n in ("kick", "snare", "hat"):
                z.writestr(f"{n}.wav", wav_bytes(sine(100, 0.1)))
        r = self.il.upload("mykit.zip", b.getvalue())
        self.assertEqual((r["kind"], r["notes"]), ("kit", 3))

    def test_zip_sfz(self):
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            z.writestr("bass/bass.sfz", "<region> sample=low.wav pitch_keycenter=36\n<region> sample=high.wav pitch_keycenter=48\n")
            z.writestr("bass/low.wav", wav_bytes(sine(65.4)))
            z.writestr("bass/high.wav", wav_bytes(sine(130.8)))
        r = self.il.upload("bass.zip", b.getvalue())
        names = [f for f in self.files(r["id"]) if f.startswith("m")]
        self.assertEqual([n[:4] for n in names], ["m036", "m048"])

    def test_sf2_roundtrip(self):
        r = self.il.upload("tiny.sf2", tiny_sf2(sine(261.6, 0.5)))
        self.assertEqual(r["kind"], "sf2")
        self.assertEqual([(p["key"], p["name"]) for p in r["presets"]], [("0:0", "Tiny Piano")])
        sf = instlib.SF2(os.path.join(self.il.import_dir(), r["file"]))
        out = os.path.join(self.tmp, "tiny_piano")
        self.assertEqual(sf.render("0:0", out), 1)
        self.assertEqual(os.listdir(out), ["m060_C4.wav"])
        w = wave.open(os.path.join(out, "m060_C4.wav"))
        self.assertGreater(w.getnframes() / w.getframerate(), 2.5)   # el bucle se desenrolla hasta ~3 s

    def test_not_a_soundfont(self):
        with self.assertRaises(Exception):
            self.il.upload("x.sf2", b"RIFF\0\0\0\0WAVE")


class MaestroTest(unittest.TestCase):
    def test_used_instruments(self):
        tmp = tempfile.mkdtemp()
        try:
            il = instlib.InstLib(Library(tmp))
            reply = {"cambios": {"pistas": [{"codigo": 'n "c5 e5" # s "harpsichord_fluid"'},
                                            {"codigo": 'sound "bd*4 vsco_contrabass_pizz"'},
                                            {"codigo": 's "superpiano"'}]}}
            self.assertEqual(instlib.used_instruments(il, reply), ["harpsichord_fluid", "vsco_contrabass_pizz"])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
