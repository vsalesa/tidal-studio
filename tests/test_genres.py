"""Pruebas de 0.17 «géneros»: forma en la partitura, estilos nuevos del generador y patrones de los cursos.
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import score  # noqa: E402
import midigen  # noqa: E402

NEW = ("reggae", "boombap", "afrobeat", "bachata")


class FormTest(unittest.TestCase):
    def sc(self):
        return score.normalize({"key": "Am", "parts": [{"id": "P1", "name": "Bass", "role": "bajo", "track": "d4",
                                                         "bars": [[{"p": [45], "d": 4}]] * 4}],
                                "sections": score.sections_from_form([["Intro", 4], ["Verso", 8], ["Mambo", 4]])})

    def test_sections(self):
        self.assertEqual(self.sc()["sections"], [{"name": "Intro", "bar": 1}, {"name": "Verso", "bar": 5}, {"name": "Mambo", "bar": 13}])
        self.assertEqual(score.norm_sections([{"name": "B", "bar": 5}, {"name": "A", "bar": 1}, {"name": "x", "bar": 0}, {"name": "C", "bar": 5}]),
                         [{"name": "A", "bar": 1}, {"name": "B", "bar": 5}])
        self.assertIn("forma: Intro (compás 1)", score.summary(self.sc()))

    def test_musicxml_roundtrip(self):
        xml = score.to_musicxml(self.sc(), "t")
        self.assertIn("<rehearsal>Intro</rehearsal>", xml)
        back = score.from_musicxml(xml)
        self.assertEqual([s["bar"] for s in back["sections"]], [1, 5, 13])
        self.assertEqual(len(back["parts"][0]["bars"]), 4)   # la forma no alarga las partes

    def test_no_sections(self):
        self.assertNotIn("sections", score.from_musicxml(score.to_musicxml(score.empty_score())))


class NewStylesTest(unittest.TestCase):
    def test_variants(self):
        for st in NEW:
            self.assertIn(st, midigen.COURSE_KEYS)
            for role in ("bajo", "armonia", "melodia"):
                v = midigen.course_variants(st, role, seed=2, lang="en")
                self.assertEqual(len(v["variants"]), 3, (st, role))
                for x in v["variants"]:
                    self.assertTrue(x["bars"], (st, role, x["codigo"]))

    def test_keys(self):
        self.assertEqual(midigen.course_variants("afrobeat", "bajo")["chords"][:2], ["Em7", "A7"])
        self.assertEqual(midigen.course_variants("reggae", "bajo")["chords"][:2], ["Am", "G"])


@unittest.skipUnless(shutil.which("node"), "sin node")
class CoursesJsTest(unittest.TestCase):
    """Carga web/courses.js en node: 15 cursos, todos con forma de 16 compases, variantes de cumbia y patrones bien cerrados."""
    @classmethod
    def setUpClass(cls):
        js = r'''
globalThis.document = { documentElement: {} }; globalThis.localStorage = { getItem: () => "en", setItem() {} };
Object.defineProperty(globalThis, "navigator", { value: { language: "en" } });
const m = await import(process.argv[1]);
const out = { courses: [], cumbia: {} };
for (const c of m.COURSES) {
  const tracks = [];
  for (const v of (c.variants || [{}])) for (const s of m.courseFor(c.id, v.id).steps) for (const t of s.tracks || []) tracks.push({ v: v.id || "", ...t });
  out.courses.push({ id: c.id, form: (c.form || []).reduce((a, f) => a + f.bars, 0), steps: c.steps.length, tracks, sounds: m.courseSounds(c), ref: !!c.ref,
    noTry: c.steps.filter((s) => !s.try).length });
}
for (const v of m.COURSES.find((c) => c.id === "cumbia").variants) { const c = m.courseFor("cumbia", v.id); out.cumbia[v.id] = { bpm: c.bpm, d1: c.steps[0].tracks[0].codigo, d6: c.steps[4].tracks[0].codigo }; }
console.log(JSON.stringify(out));'''
        r = subprocess.run(["node", "--input-type=module", "-e", js, os.path.join(ROOT, "web", "courses.js")], capture_output=True, text=True, timeout=60)
        cls.data = json.loads(r.stdout or "{}") if r.returncode == 0 else None
        cls.err = r.stderr

    def test_courses(self):
        self.assertIsNotNone(self.data, self.err)
        ids = [c["id"] for c in self.data["courses"]]
        self.assertEqual(len(ids), 15)
        for n in NEW:
            self.assertIn(n, ids)
        for c in self.data["courses"]:
            self.assertEqual(c["form"], 16, c["id"])
            self.assertEqual(c["noTry"], 0, c["id"])

    def test_patterns_balanced(self):
        for c in self.data["courses"]:
            for t in c["tracks"]:
                code = t["codigo"]
                self.assertEqual(code.count('"') % 2, 0, code)
                self.assertEqual(code.count("[") - code.count("]"), 0, code)
                self.assertEqual(code.count("<") - code.count(">"), 0, code)

    def test_cumbia_variants(self):
        cu = self.data["cumbia"]
        self.assertEqual(set(cu), {"sonidera", "colombiana", "villera", "chicha"})
        self.assertIn("accordion_fluid", cu["sonidera"]["d6"])
        self.assertIn("flute_fluid", cu["colombiana"]["d6"])
        self.assertIn("lead_1_square_fluid", cu["villera"]["d6"])
        self.assertIn("electric_guitar_clean_fluid", cu["chicha"]["d6"])
        self.assertEqual(cu["colombiana"]["bpm"], 92)
        self.assertNotEqual(cu["colombiana"]["d1"], cu["sonidera"]["d1"])

    def test_melodic_parts_fit_score(self):
        # las pistas de melodía, acordes y bajo escritas con note/n "…" van a la partitura
        for c in self.data["courses"]:
            if c["id"] not in NEW:
                continue
            for t in c["tracks"]:
                if t["tipo"] in ("melodia", "bajo") and t["codigo"].lstrip().startswith("n "):
                    self.assertTrue(score.tidal_to_bars(t["codigo"]), (c["id"], t["id"]))


if __name__ == "__main__":
    unittest.main()
