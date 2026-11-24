"""Librería única (server/library.py): incluidos y descargados en una sola lista, buscar y parecidos.
Ejecuta: python3 -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import instcatalog as cat  # noqa: E402
import library  # noqa: E402
from samples import Library  # noqa: E402


class FakeInstLib:
    def __init__(self, installed=()):
        self.done = set(installed)

    def all_items(self):
        return cat.ITEMS

    def installed(self, iid):
        return iid in self.done


class UnifiedLibrary(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.lib = Library(self.tmp)
        wav = b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
        self.lib.add_file("mykick", "k.wav", wav, "bombo")
        self.lib.add_file("bd", "b.wav", wav, "bombo")      # se llama igual que uno incluido
        self.items = library.build(self.lib, FakeInstLib({"acoustic_grand_piano_fluid"}), [], set())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def by(self, sound, origin=None):
        return [e for e in self.items if e["sound"] == sound and (origin is None or e["origin"] == origin)]

    def test_everything_in_one_list(self):
        origins = {e["origin"] for e in self.items}
        self.assertTrue({"builtin", "library", "mine"} <= origins)
        self.assertTrue(self.by("bd", "builtin"))
        self.assertTrue(self.by("superpiano"))
        self.assertTrue(self.by("mykick", "mine"))
        self.assertTrue(self.by("midi"))
        # cada ficha tiene la misma forma
        for e in self.items:
            for k in ("key", "sound", "es", "en", "family", "kind", "origin", "installed"):
                self.assertIn(k, e)

    def test_builtin_from_samples_js(self):
        names = {b["name"] for b in library.builtin_sounds()}
        self.assertIn("808bd", names)
        self.assertGreater(len(names), 60)

    def test_same_name_yours_wins(self):
        self.assertTrue(self.by("bd", "builtin")[0].get("shadowed"))
        self.assertEqual(library.find(self.items, "bd:3")["origin"], "mine")

    def test_search_spanish_without_accents(self):
        found = [e["sound"] for e in library.search(self.items, "organo")]
        self.assertTrue(any("organ" in s for s in found))
        self.assertTrue(library.search(self.items, "trompeta"))
        self.assertEqual([e["sound"] for e in library.search(self.items, "mykick")], ["mykick"])

    def test_similar_kick(self):
        r = library.suggest(self.items, "808bd")
        have = [e["sound"] for e in r["have"]]
        self.assertTrue(have)
        roles = {e["role"] for e in r["have"]}
        self.assertEqual(roles, {"bombo"})
        self.assertNotIn("808bd", have)

    def test_similar_piano_offers_download(self):
        r = library.suggest(self.items, "superpiano")
        self.assertIn("acoustic_grand_piano_fluid", [e["sound"] for e in r["have"]])
        self.assertTrue(all(not e["installed"] for e in r["download"]))
        self.assertTrue(r["download"])
        fams = {e["family"] for e in r["have"] + r["download"]}
        self.assertIn("pianos", fams)

    def test_hits_do_not_replace_melodies(self):
        r = library.suggest(self.items, "superpiano", 12)
        self.assertFalse([e for e in r["have"] if e["kind"] == "hit"])


if __name__ == "__main__":
    unittest.main()
