"""Pruebas de 0.21 «skills incluidas en el instalador»: manifiesto con SHA-256 de lo empaquetado, licencias de las
seis skills nuevas, prosody-checker apagada por defecto, y al actualizar la app se borran SOLO los archivos de skills
incluidas que la versión nueva ya no trae y que no has tocado (nunca my-skills/, my-plugins/ ni un archivo cambiado).
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import skills  # noqa: E402

NEW = ["music-evaluate", "music-compose", "arrangement-advisor", "melody-writer", "hook-writer", "prosody-checker"]


class BundleTest(unittest.TestCase):
    def test_manifest_matches_the_files(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "vendor_music_skills.py"), "--verify"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_six_new_skills_text_only_with_license(self):
        man = json.load(open(os.path.join(ROOT, "skills", "BUNDLE-MANIFEST.json"), encoding="utf-8"))
        by = {s["folder"]: s for s in man["skills"]}
        for name in NEW:
            s = by[name]
            self.assertEqual(s["license"], "MIT")
            self.assertEqual(len(s["commit"]), 40)
            self.assertFalse(s["execution_supported"])
            files = [f["path"] for f in s["files"]]
            self.assertIn(f"{name}/LICENSE", files)
            self.assertIn(f"{name}/SOURCE.json", files)
            self.assertTrue(all(p.endswith((".md", "LICENSE", "SOURCE.json")) for p in files), files)
        self.assertFalse(by["prosody-checker"]["default_enabled"])
        self.assertIn("vsalesa/music-composition-skills", open(os.path.join(ROOT, "server", "plugins.py")).read())
        self.assertNotIn("music-composition-skills", [s["upstream"] for s in man["skills"]])

    def test_bundled_skills_scan_and_default_off(self):
        sk = {s["name"]: s for s in skills.scan({"skills": {}})}
        for name in NEW:
            self.assertIn(name, sk)
            self.assertIsNone(sk[name]["quarantine"])
            self.assertTrue(sk[name]["bundled"])
        self.assertFalse(sk["prosody-checker"]["enabled"])
        self.assertTrue(sk["hook-writer"]["enabled"])
        on = {s["name"]: s for s in skills.scan({"skills": {"enabled": ["prosody-checker"]}})}
        self.assertTrue(on["prosody-checker"]["enabled"])


class CleanupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = skills.BUILTIN_DIR
        skills.BUILTIN_DIR = os.path.join(self.tmp, "skills")
        self.state = os.path.join(self.tmp, "data", "managed-skills.json")

    def tearDown(self):
        skills.BUILTIN_DIR = self.old
        shutil.rmtree(self.tmp)

    def put(self, rel, text):
        p = os.path.join(skills.BUILTIN_DIR, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)
        return {"path": rel, "sha256": skills._sha256(p)}

    def manifest(self, files):
        os.makedirs(skills.BUILTIN_DIR, exist_ok=True)
        with open(os.path.join(skills.BUILTIN_DIR, "BUNDLE-MANIFEST.json"), "w") as f:
            json.dump({"files_root": "skills", "skills": [{"folder": "x", "files": files}]}, f)

    def test_only_untouched_removed_files_go(self):
        a = self.put("old-skill/SKILL.md", "# old")
        b = self.put("old-skill/references/r.md", "# r")
        c = self.put("edited/SKILL.md", "# v1")
        keep = self.put("kept/SKILL.md", "# kept")
        self.manifest([a, b, c, keep])
        self.assertEqual(skills.cleanup_managed(self.state), [])        # primera vez: solo recuerda
        with open(os.path.join(skills.BUILTIN_DIR, "edited", "SKILL.md"), "w") as f:
            f.write("# my own edit")
        self.manifest([keep])                                            # la versión nueva ya no trae tres archivos
        gone = skills.cleanup_managed(self.state)
        self.assertEqual(sorted(gone), ["old-skill/SKILL.md", "old-skill/references/r.md"])
        self.assertFalse(os.path.exists(os.path.join(skills.BUILTIN_DIR, "old-skill")))
        self.assertTrue(os.path.exists(os.path.join(skills.BUILTIN_DIR, "edited", "SKILL.md")))   # la tocaste: se queda
        self.assertTrue(os.path.exists(os.path.join(skills.BUILTIN_DIR, "kept", "SKILL.md")))

    def test_never_outside_skills(self):
        outside = os.path.join(self.tmp, "my-skills", "mine", "SKILL.md")
        os.makedirs(os.path.dirname(outside))
        with open(outside, "w") as f:
            f.write("# mine")
        bad = {"path": "../my-skills/mine/SKILL.md", "sha256": skills._sha256(outside)}
        os.makedirs(os.path.dirname(self.state))
        with open(self.state, "w") as f:
            json.dump({"files_root": "skills", "skills": [{"folder": "x", "files": [bad]}]}, f)
        self.manifest([])
        self.assertEqual(skills.cleanup_managed(self.state), [])
        self.assertTrue(os.path.exists(outside))


if __name__ == "__main__":
    unittest.main()
