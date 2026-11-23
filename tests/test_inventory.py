"""Maestro ve lo recién descargado (server/inventory.py). Ejecuta: python3 -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import inventory  # noqa: E402
import instlib  # noqa: E402
import assistant  # noqa: E402
from samples import Library  # noqa: E402
from engine import Engine  # noqa: E402


def touch(path, t):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"RIFF0000WAVE")
    os.utime(path, (t, t))


class FakeEngine:
    def __init__(self, sounds=(), missing=()):
        self.sounds, self.missing = list(sounds), list(missing)

    def sound_list(self):
        return {"sounds": self.sounds, "missing": self.missing}


class InventoryTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.lib = Library(self.root)
        self.il = instlib.InstLib(self.lib, None)
        old = time.time() - 30 * 86400
        # 60 samples viejos que van antes en el alfabeto: antes cortaban la lista en 40
        for i in range(60):
            touch(os.path.join(self.lib.dir, f"aaa{i:02d}", "x.wav"), old)
        touch(os.path.join(self.lib.dir, "zz_cowbell", "cowbell.wav"), time.time() - 60)
        # Un instrumento de la biblioteca recién descargado (no debe salir como sample)
        touch(os.path.join(self.lib.dir, "harpsichord_fluid", "m060_C4.wav"), time.time() - 30)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_new_sample_is_first_and_marked(self):
        inv = inventory.summary(self.lib, self.il, FakeEngine())
        self.assertEqual(inv["samples"][0]["name"], "zz_cowbell")
        self.assertTrue(inv["samples"][0]["nuevo"])
        self.assertNotIn("harpsichord_fluid", [x["name"] for x in inv["samples"]])
        self.assertEqual(inv["instrumentos"][0]["id"], "harpsichord_fluid")

    def test_reaches_maestro_prompt(self):
        inv = inventory.summary(self.lib, self.il, FakeEngine())
        system = assistant.session_summary({"inventario": inventory.maestro_text(inv), "tracks": []})
        self.assertIn("zz_cowbell (", system)
        self.assertIn("NUEVO", system)
        self.assertIn("harpsichord_fluid", system)
        self.assertIn("No digas que no lo tiene", system)

    def test_not_loaded_yet_and_missing(self):
        inv = inventory.summary(self.lib, self.il, FakeEngine(sounds=["bd", "aaa00"], missing=["kalimba", "bd"]))
        self.assertIn("zz_cowbell", inv["no_cargados"])
        self.assertEqual(inv["missing"], ["kalimba"])

    def test_reload_waits_for_superdirt(self):
        eng = Engine(self.root)

        class Proc:
            def poll(self):
                return None
        eng.sclang = Proc()   # SuperCollider arrancando: todavía no escucha órdenes
        sent = []
        self.assertFalse(eng.reload_sample("/x/samples/kalimba", "kalimba"))
        self.assertIn("kalimba", eng.pending_reloads)
        eng.osc_ready = True
        eng.sc_cmd = lambda *a: sent.append(a) or True
        eng._flush_reloads()
        self.assertEqual(sent, [("reload", "kalimba", "/x/samples/kalimba")])
        self.assertEqual(eng.pending_reloads, {})


if __name__ == "__main__":
    unittest.main()
