"""Pruebas de 0.16 «sonidos que aprenden»: análisis, estados, ranking que aprende, recetas, crítico y CLaMP 3.
Ejecuta: python3 -m unittest discover tests"""
import io
import math
import os
import random
import shutil
import struct
import sys
import tempfile
import unittest
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import soundlab  # noqa: E402
import recipes  # noqa: E402
import critic  # noqa: E402
import clamp  # noqa: E402
import assistant  # noqa: E402


def wav(samples, sr=44100, width=2):
    b = io.BytesIO()
    w = wave.open(b, "wb")
    w.setnchannels(1)
    w.setsampwidth(width)
    w.setframerate(sr)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 30000)) for v in samples))
    w.close()
    return b.getvalue()


SR = 44100
TONE = [math.sin(2 * math.pi * 110 * i / SR) * math.exp(-i / SR * 1.5) for i in range(int(SR * 1.5))]
random.seed(3)
HAT = [random.uniform(-1, 1) * math.exp(-i / SR * 40) for i in range(int(SR * 0.2))]
PAD = [math.sin(2 * math.pi * 440 * i / SR) * min(1, i / (SR * 0.4)) for i in range(int(SR * 2))]


class AnalyzeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        for name, s in (("tone", TONE), ("hat", HAT), ("pad", PAD)):
            with open(os.path.join(cls.tmp, name + ".wav"), "wb") as f:
                f.write(wav(s))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def f(self, name):
        return soundlab.analyze_file(os.path.join(self.tmp, name + ".wav"))

    def test_pitch(self):
        self.assertAlmostEqual(self.f("tone")["pitch"], 45, delta=0.6)   # A2 = 110 Hz
        self.assertAlmostEqual(self.f("pad")["pitch"], 69, delta=0.6)    # A4 = 440 Hz
        self.assertIsNone(self.f("hat")["pitch"])

    def test_shape(self):
        hat, pad, tone = self.f("hat"), self.f("pad"), self.f("tone")
        self.assertGreater(hat["noise"], 0.6)
        self.assertGreater(hat["bright"], pad["bright"])
        self.assertLess(hat["decay"], 0.2)
        self.assertGreater(pad["attack"], 0.15)
        self.assertLess(tone["attack"], 0.05)
        self.assertIn("noisy", soundlab.describe(hat, True))
        self.assertIn("note a4", soundlab.describe(pad, True))

    def test_distance(self):
        hat, pad, tone = self.f("hat"), self.f("pad"), self.f("tone")
        self.assertEqual(soundlab.distance(pad, pad), 0)
        self.assertGreater(soundlab.distance(hat, pad), soundlab.distance(tone, pad))

    def test_non_wav_needs_librosa(self):
        self.assertIsNone(soundlab.analyze_file(os.path.join(self.tmp, "x.mp3")))

    def test_analyzer_job(self):
        st = soundlab.Store(os.path.join(self.tmp, "s.db"))
        an = soundlab.Analyzer(st, lambda: None)
        plan = [("tone", os.path.join(self.tmp, "tone.wav"), "mine", False),
                ("pk/hat", os.path.join(self.tmp, "hat.wav"), "pack", True)]
        an.start(plan)
        for _ in range(200):
            if an.status()["state"] != "running":
                break
            import time
            time.sleep(0.02)
        self.assertEqual(an.status()["done"], 2)
        self.assertIsNotNone(st.features("tone"))
        self.assertNotIn("pk/hat", st.all_features(include_local=False))   # los packs comprados no salen
        self.assertIn("pk/hat", st.all_features())


class StatesTest(unittest.TestCase):
    def e(self, **kw):
        return dict({"sound": "x", "kind": "hit", "installed": True}, **kw)

    def test_four_states(self):
        self.assertEqual(soundlab.state_of(self.e(installed=False), {"bd"}, set(), True), "catalog")
        self.assertEqual(soundlab.state_of(self.e(), {"bd"}, set(), True), "downloaded")
        self.assertEqual(soundlab.state_of(self.e(), {"x"}, set(), False), "loaded")
        self.assertEqual(soundlab.state_of(self.e(), {"x"}, set(), True), "playable")
        self.assertEqual(soundlab.state_of(self.e(), {"x"}, {"x"}, True), "downloaded")
        self.assertEqual(soundlab.state_of(self.e(kind="synth"), set(), set(), True), "playable")
        self.assertEqual(soundlab.state_of(self.e(kind="engine", installed=False), set(), set(), True), "catalog")


class RankTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.st = soundlab.Store(os.path.join(self.tmp, "s.db"))
        mk = lambda s, **kw: dict({"sound": s, "family": "basses", "role": "", "kind": "pitched", "origin": "library",  # noqa: E731
                                   "installed": True, "tags": "bass", "group": s}, **kw)
        self.items = [mk("bass1"), mk("jvbass"), mk("bassdm"), mk("upright"), mk("fretless", installed=False), mk("midi", kind="midi")]
        self.loaded = {"bass1", "jvbass", "bassdm", "upright"}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_only_playable_in_top(self):
        r = soundlab.rank(self.items, "bass1", self.st, "bajo", "house", self.loaded, set(), True, n=3)
        self.assertEqual(len(r["top"]), 3)
        self.assertTrue(all(e["state"] == "playable" for e in r["top"]))
        self.assertNotIn("bass1", [e["sound"] for e in r["top"]])
        self.assertIn("fretless", [e["sound"] for e in r["more"]])

    def test_learns_from_choices(self):
        for _ in range(3):
            self.st.choose("bajo", "house", "upright", ["bass1", "jvbass", "bassdm", "upright"])
        r = soundlab.rank(self.items, "bass1", self.st, "bajo", "house", self.loaded, set(), True, n=3)
        self.assertEqual(r["top"][0]["sound"], "upright")
        self.assertGreater(self.st.learned("bajo", "house")["upright"], 0)
        self.assertLess(self.st.learned("bajo", "house")["jvbass"], 0)
        # y lo aprendido para el papel sirve en otro género (con menos peso)
        self.assertGreater(self.st.learned("bajo", "techno").get("upright", 0), 0)


class RecipesTest(unittest.TestCase):
    def test_code(self):
        self.assertTrue(recipes.code(recipes.BY_ID["sub-808"]).startswith('n "c2 ~ c2 g1" # s "bass1"'))
        self.assertEqual(recipes.code(recipes.BY_ID["vinyl-kick"], "bd ~ [~ bd] ~").split(" #")[0], 's "bd:3 ~ [~ bd:3] ~"')

    def test_combine(self):
        a, b = recipes.BY_ID["lofi-keys"], recipes.BY_ID["dub-stab"]
        lay = recipes.combine(a, b, "layer")
        self.assertTrue(recipes.code(lay).startswith("stack ["))
        self.assertEqual(lay["from"], ["lofi-keys", "dub-stab"])
        bl = recipes.combine(a, b, "blend")
        self.assertEqual(bl["sound"], "superpiano")
        self.assertEqual(bl["fx"], b["fx"])
        mo = recipes.combine(a, b, "morph")
        self.assertAlmostEqual(mo["fx"]["room"], 0.4)

    def test_store_and_prompt(self):
        tmp = tempfile.mkdtemp()
        try:
            st = soundlab.Store(os.path.join(tmp, "s.db"))
            rec = st.save_recipe(recipes.combine(recipes.BY_ID["fm-bell"], recipes.BY_ID["soft-pad"], "layer"))
            self.assertEqual(st.recipes()[0]["id"], rec["id"])
            self.assertIn(rec["id"], recipes.maestro_text(st.recipes()))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_reply_keeps_recipes(self):
        r = assistant.parse_reply('{"mensaje": "ok", "cambios": {"pistas": [], "recetas": [{"de": ["fm-bell", "soft-pad"], "modo": "capa"}]}}')
        self.assertEqual(r["cambios"]["recetas"][0]["de"], ["fm-bell", "soft-pad"])


class CriticTest(unittest.TestCase):
    SONG = [{"id": "d1", "code": 's "bd*4"', "kind": "percusion"}, {"id": "d2", "code": 's "~ cp ~ cp"', "kind": "percusion"},
            {"id": "d3", "code": 's "[~ hh]*4"', "kind": "percusion"}]

    def test_onsets(self):
        self.assertEqual([p for p, _ in critic.onsets('s "bd*4"')], [0, 0.25, 0.5, 0.75])
        self.assertEqual(len(critic.onsets('s "[~ hh]*4 , cp"')), 5)

    def test_harmony_and_form(self):
        good = critic.judge({"pistas": [{"id": "d4", "tipo": "bajo", "codigo": 'note "<[c2 ~ c3 c2] [f2 c3] [g2 d3] [c2 g2]>" # s "x"'}]}, self.SONG, {"key": "C"})
        bad = critic.judge({"pistas": [{"id": "d4", "tipo": "bajo", "codigo": 'note "cs2 fs2 as2 ds2" # s "x"'}]}, self.SONG, {"key": "C"})
        self.assertGreater(good["harmony"], bad["harmony"])
        self.assertGreater(good["form"], bad["form"])
        self.assertTrue(bad["notes"])

    def test_groove_on_beat(self):
        flat = critic.judge({}, [{"id": "d1", "code": 's "bd*4"'}, {"id": "d2", "code": 's "sn*4"'}], None, "en")
        self.assertTrue(any("off the beat" in n or "same time" in n for n in flat["notes"]))


class ClampTest(unittest.TestCase):
    def test_gate(self):
        tmp = tempfile.mkdtemp()
        try:
            st = clamp.status(tmp, {"house": 12, "salsa": 3}, 10, True)
            self.assertFalse(st["installed"])
            self.assertFalse(any(g["active"] for g in st["genres"]))
            os.makedirs(clamp.home(tmp))
            open(os.path.join(clamp.home(tmp), "ready"), "w").close()
            st = clamp.status(tmp, {"house": 12, "salsa": 3}, 10, True)
            self.assertEqual({g["style"]: g["active"] for g in st["genres"]}, {"house": True, "salsa": False})
            self.assertFalse(any(g["active"] for g in clamp.status(tmp, {"house": 12}, 10, False)["genres"]))
            self.assertIsNone(clamp.embed(lambda: "/nope", tmp, {"a": "<x/>"}))   # sin su script: no rompe nada
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_nearest(self):
        v = {"a": [1, 0], "b": [0.9, 0.1], "c": [0, 1]}
        self.assertEqual(clamp.nearest(v, "a", 1)[0][1], "b")


if __name__ == "__main__":
    unittest.main()
