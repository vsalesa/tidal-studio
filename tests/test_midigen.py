"""Pruebas de «Generar desde mi MIDI» (server/midigen.py). Ejecuta: python3 -m unittest discover tests"""
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import midigen  # noqa: E402
import make_example_midi  # noqa: E402

SONG = make_example_midi.song()  # C Am F G, melodía, piano, bajo y batería


def by_origin(r, origin):
    return [t for t in r["tracks"] if t["origen"] == origin]


def balanced(code):
    for o, c in ("[]", "<>", "()", '""'):
        if o == c:
            if code.count(o) % 2:
                return False
        elif code.count(o) != code.count(c):
            return False
    return True


class GenerateTest(unittest.TestCase):
    def test_every_style_generates_valid_tracks(self):
        for style in midigen.STYLES:
            for keep in ((), ("melody", "chords"), ("melody", "chords", "bass", "drums", "tempo")):
                r = midigen.generate(SONG, style, keep, 1, "en")
                self.assertTrue(1 <= len(r["tracks"]) <= 12, style)
                for t in r["tracks"]:
                    self.assertIn(t["tipo"], ("percusion", "bajo", "armonia", "melodia", "textura"))
                    self.assertTrue(balanced(t["codigo"]), (style, t["codigo"]))
                    self.assertNotIn("None", t["codigo"])
                    self.assertTrue(t["explicacion"])

    def test_keeps_your_melody_note_for_note(self):
        r = midigen.generate(SONG, "bossa", ("melody", "chords"), 1, "en")
        mel = [t for t in r["tracks"] if t["tipo"] == "melodia"]
        self.assertEqual(len(mel), 1)
        self.assertEqual(mel[0]["origen"], "midi")
        self.assertIn('s "flute_fluid"', mel[0]["codigo"])
        self.assertIn("e6@2 g6 f6", mel[0]["codigo"])  # el principio de la melodía del ejemplo

    def test_keeps_your_chords_in_the_style(self):
        r = midigen.generate(SONG, "merengue", ("chords",), 1, "en")
        self.assertEqual(r["generated"]["chords"], ["C", "Am", "F", "G"])
        bossa = midigen.generate(SONG, "bossa", ("chords",), 1, "en")
        self.assertEqual(bossa["generated"]["chords"], ["Cmaj7", "Am7", "Fmaj7", "G7"])  # séptimas en bossa

    def test_style_drums_unless_you_keep_yours(self):
        r = midigen.generate(SONG, "salsa", (), 1, "en")
        self.assertTrue(any("claves" in t["codigo"] for t in by_origin(r, "style")))
        mine = midigen.generate(SONG, "salsa", ("drums",), 1, "en")
        self.assertFalse(by_origin(mine, "style"))
        self.assertTrue(any(t["tipo"] == "percusion" and t["origen"] == "midi" for t in mine["tracks"]))

    def test_tempo(self):
        self.assertEqual(midigen.generate(SONG, "house", (), 1, "en")["generated"]["bpm"], 124)
        self.assertEqual(midigen.generate(SONG, "house", ("tempo",), 1, "en")["generated"]["bpm"], 110)

    def test_style_progression_in_your_key(self):
        # sin tus acordes: la progresión del estilo (menor) en la relativa menor de Do mayor
        r = midigen.generate(SONG, "salsa", ("melody",), 1, "en")
        self.assertEqual(r["generated"]["chords"], ["Am", "Dm", "E7", "Dm"])

    def test_new_melody_is_deterministic_and_seeded(self):
        a = midigen.generate(SONG, "cumbia", ("chords",), 1, "en")
        b = midigen.generate(SONG, "cumbia", ("chords",), 1, "en")
        c = midigen.generate(SONG, "cumbia", ("chords",), 2, "en")
        mel = lambda r: [t["codigo"] for t in r["tracks"] if t["tipo"] == "melodia"][0]  # noqa: E731
        self.assertEqual(mel(a), mel(b))
        self.assertNotEqual(mel(a), mel(c))
        # bar 3 repite el motivo del compás 1 (mismo ritmo)
        bars = re.findall(r"\[([^\[\]]+)\]", mel(a).split('"')[1])
        shape = lambda s: re.sub(r"[a-g][sf]?\d+", "x", s)  # noqa: E731
        self.assertEqual(shape(bars[0]), shape(bars[2]))

    def test_bass_follows_chords(self):
        r = midigen.generate(SONG, "bossa", ("chords",), 1, "en")
        bass = [t for t in r["tracks"] if t["tipo"] == "bajo"][0]["codigo"]
        firsts = [b.split()[0] for b in re.findall(r"\[([^\[\]]+)\]", bass.split('"')[1])]
        self.assertEqual([re.sub(r"\d", "", n) for n in firsts], ["c", "a", "f", "g"])
        self.assertTrue(all(2 <= int(re.sub(r"\D", "", n)) <= 3 for n in firsts))  # octava grave

    def test_spanish(self):
        r = midigen.generate(SONG, "merengue", ("melody",), 1, "es")
        self.assertTrue(any(t["nombre"] == "Tu melodía" for t in r["tracks"]))
        self.assertIn("VERSIÓN GENERADA", r["reference"])

    def test_unknown_style(self):
        with self.assertRaises(ValueError):
            midigen.generate(SONG, "polka", (), 1, "en")

    def test_roman_chords(self):
        self.assertEqual(midigen.roman_chord("V7", 9, "minor"), {"root": 4, "tidal": "dom7"})
        self.assertEqual(midigen.roman_chord("VI", 9, "minor"), {"root": 5, "tidal": "major"})
        self.assertEqual(midigen.roman_chord("ii7", 0, "major"), {"root": 2, "tidal": "min7"})


if __name__ == "__main__":
    unittest.main()
