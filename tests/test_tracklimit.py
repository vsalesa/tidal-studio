"""0.25.1: el número de pistas es un ajuste (12 por defecto) y BootTidal/orbits salen de él."""
import os
import re
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))

import tracklimit  # noqa: E402

TEMPLATE = open(os.path.join(ROOT, "tidal", "BootTidal.hs"), encoding="utf-8").read()


class TrackLimit(unittest.TestCase):
    def test_default_is_the_shipped_boot(self):
        self.assertEqual(tracklimit.count({}), 12)
        self.assertEqual(tracklimit.boot_text(TEMPLATE, 12), TEMPLATE)

    def test_clamp(self):
        self.assertEqual(tracklimit.clamp(4), 12)
        self.assertEqual(tracklimit.clamp(99), 32)
        self.assertEqual(tracklimit.clamp("16"), 16)
        self.assertEqual(tracklimit.clamp("x"), 12)
        self.assertEqual(tracklimit.count({"tracks": {"count": 20}}), 20)

    def test_boot_has_n_tracks_each_on_its_orbit(self):
        text = tracklimit.boot_text(TEMPLATE, 20)
        ds = re.findall(r"^    d(\d+) = p (\d+) \. \(\|< orbit (\d+)\)$", text, re.M)
        self.assertEqual([int(d) for d, _, _ in ds], list(range(1, 21)))
        self.assertTrue(all(int(p) == int(d) and int(o) == int(d) - 1 for d, p, o in ds))
        # lo demás del arranque sigue igual
        self.assertIn("eqlow = pF", text)
        self.assertIn("TIDAL_STUDIO_READY", text)
        self.assertLess(text.index("setcps"), text.index("d1 ="))

    def test_write_boot(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = tracklimit.write_boot(ROOT, tmp, 16)
            self.assertTrue(path.startswith(tmp))
            self.assertIn("d16 = p 16 . (|< orbit 15)", open(path, encoding="utf-8").read())

    def test_superdirt_uses_same_bounds(self):
        sd = open(os.path.join(ROOT, "supercollider", "start_superdirt.scd"), encoding="utf-8").read()
        self.assertIn(f"clip({tracklimit.MIN}, {tracklimit.MAX})", sd)
        js = open(os.path.join(ROOT, "web", "tracklimit.js"), encoding="utf-8").read()
        self.assertIn(f"TRACKS_MIN = {tracklimit.MIN}, TRACKS_MAX = {tracklimit.MAX}", js)


if __name__ == "__main__":
    unittest.main()
