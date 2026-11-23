"""La ruta de Tidal Studio de un plugin «usar siempre» (mc-tidal-studio) se carga en cada mensaje.
Ejecuta: python3 -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import plugins  # noqa: E402
import skills  # noqa: E402


def _skill(base, folder, name, body, desc="x"):
    d = os.path.join(base, "skills", folder)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "SKILL.md"), "w") as f:
        f.write(f"---\nname: {name}\ndescription: {desc}\n---\n{body}\n")


class RouteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = (plugins.PLUGIN_DIR, skills.BUILTIN_DIR, skills.USER_DIR)
        plugins.PLUGIN_DIR = os.path.join(self.tmp, "my-plugins")
        skills.BUILTIN_DIR = skills.USER_DIR = os.path.join(self.tmp, "none")
        self.plug = os.path.join(plugins.PLUGIN_DIR, "music-composition")
        os.makedirs(os.path.join(self.plug, ".claude-plugin"))
        with open(os.path.join(self.plug, ".claude-plugin", "plugin.json"), "w") as f:
            f.write('{"name": "music-composition", "version": "1.2.0"}')
        _skill(self.plug, "music-composition", "music-composition", "Parent index of all mc skills.")
        _skill(self.plug, "mc-style-latin-salsa", "mc-style-latin-salsa", "Salsa clave montuno tumbao bass.",
               "Salsa arranging: clave, montuno, tumbao, salsa percussion")
        self.cfg = {"plugins": {"preferred": ["music-composition"]}, "skills": {}}

    def tearDown(self):
        plugins.PLUGIN_DIR, skills.BUILTIN_DIR, skills.USER_DIR = self.old
        shutil.rmtree(self.tmp)

    def pinned(self):
        return sorted(s["name"] for s in skills.scan(self.cfg) if s["pinned"])

    def test_without_route_main_skill_is_pinned(self):
        self.assertEqual(self.pinned(), ["music-composition"])

    def test_route_replaces_main_skill(self):
        _skill(self.plug, "mc-tidal-studio", "mc-tidal-studio", "Compose first, choose the sound second.")
        self.assertEqual(self.pinned(), ["mc-tidal-studio"])
        _, loaded, text = skills.select(self.cfg, "quiero una salsa con tumbao y clave")
        names = [x["name"] for x in loaded]
        self.assertEqual(names[0], "mc-tidal-studio")
        self.assertIn("mc-style-latin-salsa", names)
        self.assertIn("Compose first", text)
        route = next(s for s in skills.scan(self.cfg) if s["name"] == "mc-tidal-studio")
        self.assertTrue(route["route"])

    def test_route_only_when_plugin_always_used(self):
        _skill(self.plug, "mc-tidal-studio", "mc-tidal-studio", "Compose first.")
        self.cfg["plugins"]["preferred"] = []
        self.assertEqual(self.pinned(), [])

    def test_user_pin_of_main_skill_is_kept(self):
        _skill(self.plug, "mc-tidal-studio", "mc-tidal-studio", "Compose first.")
        self.cfg["skills"]["pinned"] = ["music-composition"]
        self.assertEqual(self.pinned(), ["mc-tidal-studio", "music-composition"])


if __name__ == "__main__":
    unittest.main()
