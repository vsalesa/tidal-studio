"""Pruebas de la partitura MusicXML (server/score.py), «Otra versión» del curso y la copia en SQLite.
Ejecuta: python3 -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest
from fractions import Fraction as F

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import score  # noqa: E402
import midigen  # noqa: E402
import songindex  # noqa: E402

MELODY = "c5:1 e5:1/2 ~:1/2 g5:2 | [c4,e4,g4]:4"

# Lo que exporta MuseScore: cabecera DOCTYPE, divisiones 480, ligaduras, acordes con <chord/>, sin metadatos nuestros.
MUSESCORE = """<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><key><fifths>-1</fifths><mode>minor</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>480</duration><tie type="start"/><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>480</duration><tie type="stop"/><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
      <note><chord/><pitch><step>F</step><octave>4</octave></pitch><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
      <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>480</duration><voice>2</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>"""


class CompactTest(unittest.TestCase):
    def test_parse_and_format(self):
        bars = score.parse_compact(MELODY)
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0][0], {"p": [60], "d": F(1)})
        self.assertEqual(bars[0][2], {"p": [], "d": F(1, 2)})
        self.assertEqual(bars[1][0]["p"], [48, 52, 55])
        self.assertEqual(score.parse_compact(score.format_compact(bars)), bars)

    def test_short_bar_is_padded(self):
        bars = score.parse_compact("c5:1")
        self.assertEqual(sum(e["d"] for e in bars[0]), 4)


class TidalTest(unittest.TestCase):
    def test_roundtrip(self):
        bars = score.parse_compact(MELODY)
        part = score.new_part("P1", "Melodía", "melodia", "t1", "superpiano", bars, "# room 0.2")
        code = score.part_to_tidal(part)
        self.assertTrue(code.startswith('note "<'), code)
        self.assertIn('# s "superpiano"', code)
        back = score.tidal_to_bars(code)
        self.assertEqual(back, bars)
        self.assertEqual(score.fx_of(code), ("superpiano", "# room 0.2 # legato 1"))
        part["fx"] = score.fx_of(code)[1]
        self.assertEqual(score.part_to_tidal(part), code)  # no se acumula legato

    def test_plain_patterns(self):
        self.assertEqual(score.tidal_to_bars('note "c e g e" # s "superpiano"')[0][0]["p"], [score.parse_note("c")])
        chord = score.tidal_to_bars('note "c\'maj7" # s "superpiano"')
        self.assertEqual(len(chord[0][0]["p"]), 4)

    def test_tricks_are_free_code(self):
        self.assertIsNone(score.tidal_to_bars('every 4 (fast 2) $ note "c e g" # s "superpiano"'))
        self.assertIsNone(score.tidal_to_bars('note "c e" |+ note 12 # s "superpiano"'))


class MusicXMLTest(unittest.TestCase):
    def test_roundtrip_keeps_meta(self):
        sc = score.empty_score("Am", "4/4")
        sc["parts"].append(score.new_part("P1", "Lead", "melodia", "t3", "supersaw", score.parse_compact(MELODY), "# lpf 2000"))
        sc["parts"].append(score.new_part("B", "Bass", "bajo", "t4", "superfm", score.parse_compact("a2:2 e2:2 | a2:4")))
        xml = score.to_musicxml(sc, "Prueba")
        self.assertIn("<score-partwise", xml)
        back = score.from_musicxml(xml)
        self.assertEqual(back["meter"], "4/4")
        self.assertEqual([p["id"] for p in back["parts"]], ["P1", "B"])
        self.assertEqual(back["parts"][0]["track"], "t3")
        self.assertEqual(back["parts"][0]["fx"], "# lpf 2000")
        self.assertEqual(back["parts"][0]["bars"], sc["parts"][0]["bars"])
        self.assertEqual(back["parts"][1]["role"], "bajo")

    def test_musescore_export(self):
        sc = score.from_musicxml(MUSESCORE)
        self.assertEqual(len(sc["parts"]), 1)
        bars = sc["parts"][0]["bars"]
        self.assertEqual(len(bars), 2)
        self.assertEqual([e["p"] for e in bars[0]], [[74], [77], [81]])
        self.assertEqual(bars[0][0]["d"], F(2))
        # un compás = un ciclo en Tidal: la ligadura que cruza la barra se queda en cada compás
        self.assertEqual(bars[1][0], {"p": [81], "d": F(1)})
        self.assertEqual(sorted(bars[1][-1]["p"]), [62, 65])  # la voz 2 se ignora
        code = score.part_to_tidal(sc["parts"][0])
        self.assertTrue(code.startswith('note "<'))


class PartituraTest(unittest.TestCase):
    def test_apply_creates_tracks(self):
        sc, pistas = score.apply_partitura(None, {"clave": "C", "partes": [
            {"id": "M", "pista": "t5", "nombre": "Melodía", "rol": "melodia", "compases": MELODY}]})
        self.assertEqual(sc["key"], "C")
        self.assertEqual(len(pistas), 1)
        self.assertEqual(pistas[0]["id"], "t5")
        self.assertEqual(pistas[0]["tipo"], "melodia")
        self.assertIn("parte", pistas[0])
        self.assertEqual(score.tidal_to_bars(pistas[0]["codigo"]), sc["parts"][0]["bars"])

    def test_desde_compas_keeps_earlier_bars(self):
        sc, _ = score.apply_partitura(None, {"partes": [{"id": "M", "pista": "t5", "compases": "c5:4 | d5:4"}]})
        sc, pistas = score.apply_partitura(sc, {"partes": [{"id": "M", "desde_compas": 3, "compases": "e5:4 | f5:4"}]})
        bars = sc["parts"][0]["bars"]
        self.assertEqual([b[0]["p"] for b in bars], [[60], [62], [64], [65]])  # c5 = MIDI 60
        self.assertEqual(pistas[0]["id"], "t5")  # sigue en su pista

    def test_attach_parts(self):
        pistas = [{"id": "t1", "tipo": "melodia", "nombre": "Lead", "codigo": 'note "c5 e5 g5 e5" # s "superpiano"'},
                  {"id": "t2", "tipo": "melodia", "codigo": 'jux rev $ note "c e" # s "superpiano"'},
                  {"id": "t3", "tipo": "percusion", "codigo": 's "bd sn"'}]
        score.attach_parts(pistas)
        self.assertIn("parte", pistas[0])
        self.assertNotIn("parte", pistas[1])
        self.assertNotIn("parte", pistas[2])

    def test_summary(self):
        sc, _ = score.apply_partitura(None, {"partes": [{"id": "M", "pista": "t5", "compases": MELODY}]})
        self.assertIn("t5", score.summary(sc))


class CourseVariantsTest(unittest.TestCase):
    def test_three_takes_per_role(self):
        for role, code in (("melodia", 'note "c5 e5 g5" # s "superpiano"'), ("bajo", 'note "c2 ~ g2 ~" # s "superfm"'), ("armonia", "")):
            r = midigen.course_variants("salsa", role, code, n=3, seed=7)
            self.assertEqual(len(r["variants"]), 3, role)
            codes = {v["codigo"] for v in r["variants"]}
            self.assertEqual(len(codes), 3, role)
            for v in r["variants"]:
                self.assertIsNotNone(score.tidal_to_bars(v["codigo"]), v["codigo"])

    def test_keeps_sound(self):
        r = midigen.course_variants("house", "bajo", 'note "c2 c2" # s "superfm" # lpf 800', seed=1)
        self.assertTrue(all('"superfm"' in v["codigo"] for v in r["variants"]))

    def test_unknown_style(self):
        with self.assertRaises(ValueError):
            midigen.course_variants("nope", "melodia")


class IndexScoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ix = songindex.SongIndex(os.path.join(self.tmp, "s.db"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_score_is_stored_and_changes_hash(self):
        sc, pistas = score.apply_partitura(None, {"partes": [{"id": "M", "pista": "t1", "compases": MELODY}]})
        song = {"id": "s1", "name": "Uno", "tracks": [{"id": "t1", "kind": "melodia", "code": pistas[0]["codigo"]}]}
        h0 = self.ix.sync(song)["hash"]
        self.assertIsNone(self.ix.score("s1"))
        song["score"] = score.to_json(sc)
        r = self.ix.sync(song)
        self.assertTrue(r["changed"])
        self.assertNotEqual(r["hash"], h0)
        got = self.ix.score("s1")
        self.assertEqual(got["key"], "C")
        self.assertIn("<score-partwise", got["musicxml"])
        self.ix.forget("s1")
        self.assertIsNone(self.ix.score("s1"))


if __name__ == "__main__":
    unittest.main()
