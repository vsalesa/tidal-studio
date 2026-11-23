"""Pruebas de las actualizaciones de la app (server/appupdate.py) sin red: GitHub se simula.
Ejecuta: python3 -m unittest discover tests"""
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import appupdate as au  # noqa: E402

NOTES = """## What's new in 0.11.0 / Novedades

- **Tidal Studio updates itself**: it checks GitHub.

**Español:** **Tidal Studio se actualiza solo**: mira en GitHub.

## 0.10.0

- Old stuff.
"""
PAYLOAD = b"fake installer " * 1000


def release(version="0.11.0", payload=PAYLOAD, digest=True):
    sha = "sha256:" + hashlib.sha256(payload).hexdigest()
    names = [f"tidal-studio_{version}_amd64.deb", f"TidalStudio-{version}-macOS-AppleSilicon.pkg",
             f"TidalStudio-{version}-Windows-x64-Setup.exe"]
    return {"tag_name": "v" + version, "html_url": f"https://github.com/vsalesa/tidal-studio/releases/tag/v{version}",
            "body": NOTES, "assets": [{"name": n, "size": len(payload), "digest": sha if digest else None,
                                        "browser_download_url": "https://example.invalid/" + n} for n in names]}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.rt = os.path.join(self.tmp, "runtime")
        os.makedirs(self.rt)
        with open(os.path.join(self.rt, "VERSION"), "w") as f:
            f.write("0.10.0\n")
        self.env = {k: os.environ.get(k) for k in ("TIDAL_STUDIO_RUNTIME", "TIDAL_STUDIO_QUIT_FILE", "TIDAL_STUDIO_SHELL_PID")}
        os.environ["TIDAL_STUDIO_RUNTIME"] = self.rt
        os.environ.pop("TIDAL_STUDIO_QUIT_FILE", None)
        self.old_dir = au.UPDATES_DIR
        au.UPDATES_DIR = os.path.join(self.tmp, "updates")
        self.rel = release()
        self.payload = PAYLOAD
        au.http_get = lambda url: json.dumps(self.rel).encode()
        au.open_stream = lambda url: io.BytesIO(self.payload)
        self.spawned = []
        au.spawn = lambda argv, **kw: self.spawned.append((argv, kw))
        au.STATE.clear()
        au.STATE.update(state="idle", checked_at=0, error="")

    def tearDown(self):
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        au.UPDATES_DIR = self.old_dir
        au.http_get = au.open_stream = au.spawn = None
        shutil.rmtree(self.tmp, ignore_errors=True)


class Versions(unittest.TestCase):
    def test_compare(self):
        self.assertTrue(au.newer("0.11.0", "0.10.0"))
        self.assertTrue(au.newer("v0.10.0", "0.9.1"))   # 10 > 9, no comparación de texto
        self.assertFalse(au.newer("0.9.1", "0.9.1"))
        self.assertFalse(au.newer("0.9.0", "0.10.0"))
        self.assertTrue(au.newer("1.0", "0.99.9"))

    def test_pick_asset(self):
        rel = release()
        self.assertTrue(au.pick_asset(rel, "mac-pkg", "arm64")["name"].endswith("macOS-AppleSilicon.pkg"))
        self.assertIsNone(au.pick_asset(rel, "mac-pkg", "x86_64"))  # esta Release no trae el de Intel
        self.assertTrue(au.pick_asset(rel, "windows-setup", "AMD64")["name"].endswith("Setup.exe"))
        self.assertTrue(au.pick_asset(rel, "deb", "x86_64")["name"].endswith("_amd64.deb"))
        self.assertIsNone(au.pick_asset(rel, "deb", "aarch64"))

    def test_whats_new_only_first_section(self):
        self.assertIn("updates itself", au.whats_new(NOTES, "en"))
        self.assertNotIn("Español", au.whats_new(NOTES, "en"))
        self.assertNotIn("Old stuff", au.whats_new(NOTES, "en"))
        self.assertIn("se actualiza solo", au.whats_new(NOTES, "es"))


class Flow(Base):
    def test_version_from_runtime(self):
        self.assertEqual(au.current_version(), "0.10.0")
        self.assertNotEqual(au.install_kind(), "source")

    def test_up_to_date(self):
        self.rel = release("0.10.0")
        self.assertEqual(au.check()["state"], "uptodate")

    def test_check_download_install(self):
        s = au.check()
        self.assertEqual(s["state"], "available")
        self.assertEqual(s["latest"], "0.11.0")
        self.assertIn("updates itself", s["notes"]["en"])
        self.assertTrue(au.public({})["can_install"])
        self.assertEqual(au.download()["state"], "ready")
        path = au.STATE["_path"]
        with open(path, "rb") as f:
            self.assertEqual(f.read(), PAYLOAD)
        self.assertNotIn("_path", au.public({}))  # la ruta no sale a la web

        quit_file = os.path.join(self.tmp, ".quit-request")
        os.environ["TIDAL_STUDIO_QUIT_FILE"] = quit_file
        os.environ["TIDAL_STUDIO_SHELL_PID"] = "4242"
        r = au.install("en")
        self.assertTrue(r["quitting"])
        self.assertTrue(os.path.exists(quit_file))
        argv, kw = self.spawned[0]
        script = argv[-1]
        self.assertTrue(os.path.exists(script))
        body = open(script, encoding="utf-8").read()
        self.assertIn("4242", body)
        self.assertIn(path, body)
        if sys.platform == "win32":
            self.assertEqual(argv[0], "powershell.exe")
        else:
            self.assertTrue(kw.get("start_new_session"))  # sobrevive al cierre del grupo del servidor
            self.assertEqual(subprocess.run(["bash", "-n", script]).returncode, 0)

    def test_bad_download_is_rejected(self):
        au.check()
        self.payload = PAYLOAD[:-1] + b"X"  # mismo tamaño, otro contenido
        s = au.download()
        self.assertEqual(s["state"], "error")
        self.assertIn("SHA-256", s["error"])
        self.assertEqual(os.listdir(au.UPDATES_DIR), [])

    def test_already_downloaded(self):
        au.check()
        au.download()
        au.STATE.update(state="idle")
        self.assertEqual(au.check()["state"], "ready")

    def test_install_needs_download(self):
        au.check()
        with self.assertRaises(ValueError):
            au.install()

    def test_offline(self):
        def boom(url):
            raise OSError("offline")
        au.http_get = boom
        s = au.check()
        self.assertEqual(s["state"], "error")
        self.assertIn("offline", s["error"])

    def test_auto_check_off(self):
        self.assertIsNone(au.maybe_check({"updates": {"auto_check": False}}))
        self.assertEqual(au.maybe_check({"updates": {"auto_check": True}})["state"], "available")
        self.assertIsNone(au.maybe_check({}))  # comprobado hace nada: espera 12 h

    def test_source_install_only_links(self):
        os.environ["TIDAL_STUDIO_RUNTIME"] = ""
        if au.runtime_root():
            self.skipTest("this machine has a Tidal Studio install")
        self.assertEqual(au.install_kind(), "source")
        au.check()
        self.assertFalse(au.public({})["can_install"])


@unittest.skipIf(sys.platform == "win32" or not shutil.which("bash"), "bash script")
class DebHelper(Base):
    """Ejecuta de verdad el script de Linux con pkexec, apt-get y tidal-studio simulados."""

    def test_waits_installs_and_reopens(self):
        bin_dir = os.path.join(self.tmp, "bin")
        os.makedirs(bin_dir)
        log = os.path.join(self.tmp, "calls.log")
        for name in ("pkexec", "tidal-studio", "xdg-open"):
            with open(os.path.join(bin_dir, name), "w") as f:
                f.write(f'#!/bin/bash\necho "{name} $*" >> {log}\n')
            os.chmod(os.path.join(bin_dir, name), 0o755)
        app = subprocess.Popen(["sleep", "1.5"])
        installer = os.path.join(self.tmp, "tidal-studio_0.11.0_amd64.deb")
        open(installer, "w").close()
        os.makedirs(au.UPDATES_DIR, exist_ok=True)
        name, body = au.helper_script("deb", installer, app.pid)
        script = os.path.join(au.UPDATES_DIR, name)
        with open(script, "w") as f:
            f.write(body)
        env = dict(os.environ, PATH=bin_dir + os.pathsep + os.environ["PATH"])
        start = time.time()
        p = subprocess.Popen(["bash", script], env=env)
        time.sleep(0.6)
        self.assertFalse(os.path.exists(log))  # todavía espera a que se cierre la app
        app.wait()
        p.wait(timeout=20)
        time.sleep(0.5)  # tidal-studio se lanza en segundo plano
        calls = open(log).read()
        self.assertGreater(time.time() - start, 1.4)
        self.assertIn(f"pkexec apt-get install -y --allow-downgrades {installer}", calls)
        self.assertIn("tidal-studio", calls.splitlines()[-1])
        self.assertFalse(os.path.exists(installer))


if __name__ == "__main__":
    unittest.main()
