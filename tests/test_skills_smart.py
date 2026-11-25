"""Pruebas de 0.20 «skills a la carta»: solo las secciones que encajan, índice de lo que no se envía, catálogo corto,
ruta fijada por partes, secciones pedidas con «mas_skills» y el modo «enteras» de antes.
Ejecuta: python3 -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import plugins  # noqa: E402
import skills  # noqa: E402

FILLER = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " * 12


def _skill(base, name, body, desc, refs=None):
    d = os.path.join(base, name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "SKILL.md"), "w") as f:
        f.write(f"---\nname: {name}\ndescription: {desc}\n---\n{body}\n")
    for rel, text in (refs or {}).items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)


class SmartTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = (plugins.PLUGIN_DIR, skills.BUILTIN_DIR, skills.USER_DIR)
        plugins.PLUGIN_DIR = os.path.join(self.tmp, "none")
        skills.BUILTIN_DIR = os.path.join(self.tmp, "skills")
        skills.USER_DIR = os.path.join(self.tmp, "mine")
        _skill(skills.BUILTIN_DIR, "groove-book", "Intro: how to make grooves.\n\n## Bass lines\nA house bassline sits off the beat, "
               "the bass leaves room for the kick.\n" + FILLER + "\n## Drum fills\nFills every 8 bars, snare rolls.\n" + FILLER +
               "\n## Chord voicings\nSad minor chords, voicing and modulation.\n" + FILLER,
               "Grooves: bass, drums, chords", {"references/mixing.md": "# Mixing\n## Reverb\nShort room on claps.\n" + FILLER +
                                               "\n## Compression\nSidechain the bass to the kick.\n" + FILLER})
        for i in range(12):
            _skill(skills.BUILTIN_DIR, f"other-{i}", "Nothing musical here.\n## Knitting\nYarn.", f"Knitting patterns {i}")
        self.cfg = {"skills": {}}

    def tearDown(self):
        plugins.PLUGIN_DIR, skills.BUILTIN_DIR, skills.USER_DIR = self.old
        skills._SEC_CACHE.clear()
        shutil.rmtree(self.tmp)

    def test_only_matching_sections(self):
        _, loaded, text = skills.select(self.cfg, "quiero un bajo de house que deje sitio al bombo")
        self.assertEqual(loaded[0]["name"], "groove-book")
        self.assertIn("A house bassline sits off the beat", text)
        self.assertIn("Sidechain the bass to the kick", text)          # de una referencia
        self.assertNotIn("Sad minor chords", text)                      # sección que no encaja…
        self.assertIn("SKILL.md#Chord voicings", text)                  # …pero sale en el índice
        self.assertIn("Intro: how to make grooves", text)               # la introducción siempre
        self.assertEqual(loaded[0]["refs"], ["references/mixing.md"])
        whole = skills.select(self.cfg, "quiero un bajo de house que deje sitio al bombo", mode="whole")[2]
        self.assertLess(len(text), len(whole))

    def test_short_catalog(self):
        _, _, text = skills.select(self.cfg, "acordes tristes con modulación")
        self.assertIn("- groove-book:", text)
        self.assertNotIn("- other-11:", text)
        self.assertIn("skills más instaladas que no encajan", text)
        self.assertIn("Sad minor chords", text)
        self.assertIn("mas_skills", text)

    def test_whole_mode_unchanged(self):
        self.cfg["skills"]["mode"] = "whole"
        _, _, text = skills.select(self.cfg, "quiero un bajo de house")
        self.assertIn("SKILLS INSTALADAS", text)
        self.assertIn("- other-11:", text)
        self.assertIn("Sad minor chords", text)

    def test_pinned_route_by_parts(self):
        _skill(skills.BUILTIN_DIR, "route", "Always compose first.\n## Gate 1: rhythm\nDrums first, kick and snare.\n" + FILLER +
               "\n## Gate 5: mix\nBalance levels, reverb.\n" + FILLER, "The app route")
        self.cfg["skills"]["pinned"] = ["route"]
        _, loaded, text = skills.select(self.cfg, "hola")
        self.assertEqual([x["name"] for x in loaded], ["route"])
        self.assertIn("Always compose first", text)
        self.assertNotIn("Drums first", text)
        self.assertIn("SKILL.md#Gate 1: rhythm", text)
        _, _, text = skills.select(self.cfg, "mejora la mezcla y la reverb")
        self.assertIn("Balance levels", text)
        self.assertNotIn("Drums first", text)

    def test_sections_on_demand(self):
        got, text = skills.sections_for(self.cfg, ["groove-book:SKILL.md#Chord voicings", "groove-book#drum", "nope#x", "groove-book:references/mixing.md#Reverb"])
        self.assertEqual(got, ["groove-book:SKILL.md#Chord voicings", "groove-book:SKILL.md#Drum fills", "groove-book:references/mixing.md#Reverb"])
        self.assertIn("Sad minor chords", text)
        self.assertIn("Short room on claps", text)
        self.assertEqual(skills.sections_for(self.cfg, ["nope"]), ([], ""))

    def test_split(self):
        secs = skills._split("intro\n## A\n```\n# not a title\n```\ntext\n## B\n" + ("p " * 400 + "\n\n") * 8)
        self.assertEqual([t for t, _ in secs][:2], ["", "A"])
        self.assertIn("# not a title", secs[1][1])
        self.assertTrue(all(len(b) <= skills.SEC_MAX for _, b in secs))
        self.assertTrue(secs[-1][0].startswith("B ("))


if __name__ == "__main__":
    unittest.main()
