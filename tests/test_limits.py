"""0.25.1: todos los topes son configurables (Ajustes → Límites) y los de serie no cambian nada."""
import importlib
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))

import limits  # noqa: E402


class Limits(unittest.TestCase):
    def tearDown(self):
        limits.apply({})

    def test_defaults_match_the_code(self):
        for key, mod, attr, default, lo, hi, _u, scale, group, *_ in limits.DEFS:
            self.assertLessEqual(lo, default, key)
            self.assertLessEqual(default, hi, key)
            self.assertIn(group, limits.GROUPS, key)
            if mod:
                m = importlib.import_module(mod)
                self.assertEqual(getattr(m, attr), default * scale, key)

    def test_clean_and_clamp(self):
        self.assertEqual(limits.clean({"inv_samples": 99999, "nope": 3, "skills_loaded": 2, "file_midi_mb": ""}),
                         {"inv_samples": 2000})
        self.assertEqual(limits.values({"limits": {"inv_samples": "x"}})["inv_samples"], 150)

    def test_apply_changes_the_module_constant(self):
        import files
        import inventory
        limits.apply({"limits": {"inv_samples": 300, "file_tidal_mb": 5}})
        self.assertEqual(inventory.MAX_SAMPLES, 300)
        self.assertEqual(files.MAX_BYTES, 5 * 1024 * 1024)
        self.assertEqual(os.environ["TIDAL_STUDIO_SOUND_SEC"], "3")
        limits.apply({})
        self.assertEqual(inventory.MAX_SAMPLES, 150)

    def test_public_has_labels_in_both_languages(self):
        for lang in ("es", "en"):
            p = limits.public({}, lang)
            self.assertEqual(len(p["limits"]), len(limits.DEFS))
            self.assertTrue(all(x["label"] for x in p["limits"]))


if __name__ == "__main__":
    unittest.main()
