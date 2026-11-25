"""Pruebas de 0.21 «troceo en árbol»: padres e hijos, líneas exactas, vallas de código con ``` y ~~~, listas,
tablas y bloques que nunca se cortan, y las skills incluidas troceadas sin perder ni una línea.
Ejecuta: python3 -m unittest discover tests"""
import glob
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import knowledge_parse as kp  # noqa: E402

DOC = """---
name: x
description: y
---
Intro line.

# Salsa
Salsa overview.
## Bass
Tumbao.
### Exceptions
Avoid beat 1 unless the band hits.
~~~~
## not a heading inside tildes
~~~~
```haskell
# not a heading either
```
## Piano
| a | b |
|---|---|
| 1 | 2 |
"""


class ChunkTest(unittest.TestCase):
    def test_tree_and_lines(self):
        secs = kp.parse(DOC)
        heads = [(s["heading"], s["parent"], s["level"]) for s in secs]
        self.assertEqual(heads, [("", None, 0), ("Salsa", None, 1), ("Bass", 1, 2), ("Exceptions", 2, 3), ("Piano", 1, 2)])
        for s in secs:
            self.assertEqual(kp.slice_lines(DOC, s["start"], s["end"]), s["text"])
        exc = secs[3]
        self.assertIn("## not a heading inside tildes", exc["text"])
        self.assertIn("# not a heading either", exc["text"])
        self.assertEqual(exc["kind"], "caveat")
        self.assertEqual(secs[3]["path"], ["Salsa", "Bass", "Exceptions"])
        self.assertTrue(secs[0]["text"].startswith("Intro line"))           # el YAML no es la introducción

    def test_long_sections_split_by_blocks_never_cut(self):
        para = "word " * 120
        lst = "\n".join(f"- item {i} " + "x" * 40 for i in range(30))
        code = "```\n" + "\n".join("d1 $ s \"bd*4\"" for _ in range(300)) + "\n```"
        doc = "# Big\n" + "\n\n".join([para] * 6) + "\n\n" + lst + "\n\n" + code + "\n"
        secs = kp.parse(doc)
        self.assertGreater(len(secs), 2)
        joined = "\n".join(s["text"] for s in secs)
        self.assertIn(lst, joined)                                           # la lista entera, en un solo trozo
        self.assertTrue(any(code in s["text"] for s in secs))                # el bloque de código entero
        big = [s for s in secs if code in s["text"]][0]
        self.assertTrue(big["oversize"])                                     # marcado, no recortado
        self.assertTrue(all(s["heading"].startswith("Big (") for s in secs))
        self.assertTrue(all(s["parent"] is None for s in secs))

    def test_bundled_skills_round_trip(self):
        n = 0
        for f in glob.glob(os.path.join(ROOT, "skills", "**", "*.md"), recursive=True):
            text = open(f, encoding="utf-8").read()
            for s in kp.parse(text):
                self.assertEqual(kp.slice_lines(text, s["start"], s["end"]), s["text"], f)
                n += 1
        self.assertGreater(n, 1000)


if __name__ == "__main__":
    unittest.main()
