"""Pruebas de las actualizaciones de plugins (server/plugins.py) sin red: GitHub se simula.
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import plugins  # noqa: E402


class FakeGitHub:
    """Un marketplace con un plugin en plugins/music-composition, como vsalesa/music-composition-skills."""

    def __init__(self, base):
        self.repo = os.path.join(base, "upstream")
        self.sha = "a" * 40
        self.calls = []
        self.publish("1.0.0", "Version one")

    def publish(self, version, text, sha=None):
        if sha:
            self.sha = sha
        os.makedirs(os.path.join(self.repo, ".claude-plugin"), exist_ok=True)
        with open(os.path.join(self.repo, ".claude-plugin", "marketplace.json"), "w") as f:
            json.dump({"name": "mcs", "plugins": [{"name": "music-composition", "source": "./plugins/music-composition"}]}, f)
        d = os.path.join(self.repo, "plugins", "music-composition")
        os.makedirs(os.path.join(d, ".claude-plugin"), exist_ok=True)
        os.makedirs(os.path.join(d, "skills", "melody"), exist_ok=True)
        with open(os.path.join(d, ".claude-plugin", "plugin.json"), "w") as f:
            json.dump({"name": "music-composition", "version": version}, f)
        with open(os.path.join(d, "skills", "melody", "SKILL.md"), "w") as f:
            f.write(f"---\nname: melody\ndescription: x\n---\n{text}\n")

    def fetch(self, owner, repo, ref=""):
        tmp = tempfile.mkdtemp()
        clean = os.path.join(tmp, "repo")
        shutil.copytree(self.repo, clean)
        return tmp, clean

    def http(self, url, accept_json=True):
        self.calls.append(url)
        if self.offline:
            raise OSError("offline")
        if "api.github.com" in url:
            assert "path=plugins/music-composition" in url, url
            return json.dumps([{"sha": self.sha}]).encode()
        with open(os.path.join(self.repo, "plugins", "music-composition", ".claude-plugin", "plugin.json"), "rb") as f:
            return f.read()

    offline = False


class PluginUpdates(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.gh = FakeGitHub(self.tmp)
        self.saved = (plugins.PLUGIN_DIR, plugins.fetch, plugins._http)
        plugins.PLUGIN_DIR = os.path.join(self.tmp, "my-plugins")
        plugins.fetch = self.gh.fetch
        plugins._http = self.gh.http
        plugins.UPDATES.clear()
        plugins.install("https://github.com/vsalesa/music-composition-skills", None)

    def tearDown(self):
        plugins.PLUGIN_DIR, plugins.fetch, plugins._http = self.saved
        shutil.rmtree(self.tmp, ignore_errors=True)

    def skill_text(self):
        with open(os.path.join(plugins.PLUGIN_DIR, "music-composition", "skills", "melody", "SKILL.md")) as f:
            return f.read()

    def test_install_records_commit_and_version(self):
        src = plugins._source("music-composition")
        self.assertEqual(src["commit"], "a" * 40)
        self.assertEqual(src["version"], "1.0.0")
        self.assertEqual(src["path"], "plugins/music-composition")

    def test_no_update_when_same_commit(self):
        self.assertFalse(plugins.check_one("music-composition")["available"])

    def test_new_commit_is_detected_and_installed(self):
        self.gh.publish("1.1.0", "Version two", sha="b" * 40)
        info = plugins.check_one("music-composition")
        self.assertTrue(info["available"])
        self.assertEqual(info["remote_version"], "1.1.0")
        p = [x for x in plugins.scan({}) if x["name"] == "music-composition"][0]
        self.assertTrue(p["update"]["available"])
        plugins.update("music-composition")
        self.assertIn("Version two", self.skill_text())
        self.assertEqual(plugins._source("music-composition")["commit"], "b" * 40)
        self.assertFalse(plugins.check_one("music-composition")["available"])

    def test_change_without_version_bump_is_detected(self):
        self.gh.publish("1.0.0", "Fixed typo", sha="c" * 40)
        self.assertTrue(plugins.check_one("music-composition")["available"])

    def test_auto_update_respects_setting(self):
        self.gh.publish("1.1.0", "Version two", sha="b" * 40)
        self.assertEqual(plugins.auto_update({"plugins": {"auto_update": False}}), [])
        self.assertIn("Version one", self.skill_text())
        self.assertEqual(plugins.auto_update({"plugins": {}}), ["music-composition"])
        self.assertIn("Version two", self.skill_text())

    def test_offline_keeps_plugin(self):
        self.gh.offline = True
        info = plugins.check_one("music-composition")
        self.assertFalse(info["available"])
        self.assertEqual(info["error"], "offline")
        self.assertEqual(plugins.auto_update({"plugins": {}}), [])

    def test_old_install_without_commit_gets_updated(self):
        path = os.path.join(plugins.PLUGIN_DIR, "music-composition", "PLUGIN-SOURCE.json")
        src = plugins._source("music-composition")
        src.pop("commit")
        with open(path, "w") as f:
            json.dump(src, f)
        self.assertTrue(plugins.check_one("music-composition")["available"])


if __name__ == "__main__":
    unittest.main()
