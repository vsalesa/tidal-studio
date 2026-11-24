"""Importador a GitHub y rutas remotas (2026-11-24).

- Una canción guardada/abierta en GitHub sabe dónde vive: «usuario/repo/songs/slug» (la web enseña eso, no una ruta local).
- El código extra (let, definiciones…) de un .tidal importado llega a GitHub y vuelve igual.
- El importador lista los .tidal de una carpeta y solo borra un archivo si sigue igual que cuando se subió;
  el borrado va a la Papelera. Ejecuta: python3 -m unittest discover tests"""
import base64
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "server"))
sys.path.insert(0, HERE)
import files as tfiles  # noqa: E402
import github  # noqa: E402
from test_github_empty_repo import OWNER_REPO, R, FakeRepo, Handler  # noqa: E402


class ReadableRepo(FakeRepo):
    """Como FakeRepo, pero además sirve los ficheros con la API de contenidos (para load_song/list_songs)."""

    def handle(self, method, path, body):
        p = path.split("?")[0]
        if p.startswith(f"{R}/contents/") and method == "GET" and not self.empty():
            name = p.split("/contents/", 1)[1]
            files = self.files(self.default_branch)
            if name in files:
                return 200, {"content": base64.b64encode(files[name].encode()).decode()}
            dirs = sorted({f[len(name) + 1:].split("/")[0] for f in files if f.startswith(name + "/") and f.count("/") > name.count("/") + 1})
            if dirs:
                return 200, [{"name": d, "type": "dir"} for d in dirs]
        return super().handle(method, path, body)


SONG = """-- tidal-studio: {"name": "Noche", "bpm": 96}
let pat = "bd sn"
setcps (96/60/4)
d1 $ s pat
d2 $ n "0 3" # s "superpiano"
"""


class GitHubWhereTest(unittest.TestCase):
    def setUp(self):
        os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"
        self.repo = ReadableRepo()
        Handler.repo = self.repo
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.cfg = {"github": {"token": "x", "repo": "https://github.com/" + OWNER_REPO + ".git", "folder": "songs",
                               "api_url": f"http://127.0.0.1:{self.srv.server_address[1]}"}}

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def test_save_and_load_report_remote_path(self):
        project = {"name": "Noche", "bpm": 96, "extra": 'let pat = "bd sn"',
                   "tracks": [{"id": "d1", "name": "Ritmo", "kind": "percusion", "code": "s pat"}]}
        out = github.save_song(self.cfg, project, slug="noche")
        self.assertEqual(out["remote"], f"{OWNER_REPO}/songs/noche")
        self.assertTrue(out["html_url"].startswith(f"https://github.com/{OWNER_REPO}/tree/main/songs/noche"))
        tidal = self.repo.files()["songs/noche/song.tidal"]
        self.assertLess(tidal.index('let pat = "bd sn"'), tidal.index("d1 $ s pat"))  # el extra va antes de las pistas
        back = github.load_song(self.cfg, "noche")
        self.assertEqual(back["extra"], 'let pat = "bd sn"')
        self.assertEqual(back["github"]["remote"], f"{OWNER_REPO}/songs/noche")
        self.assertEqual(back["github"]["repo"], OWNER_REPO)
        self.assertEqual([s["slug"] for s in github.list_songs(self.cfg)], ["noche"])

    def test_where(self):
        self.assertEqual(github.where(self.cfg), {"repo": OWNER_REPO, "branch": "main", "folder": "songs"})


class ImportFilesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        for name, text in (("noche.tidal", SONG), ("b.hs", "d1 $ s \"hh*8\"\n"), ("notas.txt", "x"), (".oculto.tidal", "x")):
            with open(os.path.join(self.dir, name), "w") as f:
                f.write(text)
        os.mkdir(os.path.join(self.dir, "sub.tidal"))

    def tearDown(self):
        self.tmp.cleanup()

    def test_list_dir_only_tidal_files(self):
        r = tfiles.list_dir(self.dir)
        self.assertEqual([f["name"] for f in r["files"]], ["b.hs", "noche.tidal"])
        self.assertTrue(all(not f["too_big"] for f in r["files"]))
        with self.assertRaises(tfiles.FileError):
            tfiles.list_dir(os.path.join(self.dir, "no-existe"))

    def test_trash_refuses_changed_file(self):
        path = os.path.join(self.dir, "noche.tidal")
        st = os.stat(path)
        with self.assertRaises(tfiles.FileError):
            tfiles.trash(path, st.st_mtime, st.st_size + 1)
        self.assertTrue(os.path.exists(path))
        with self.assertRaises(tfiles.FileError):
            tfiles.trash(os.path.join(self.dir, "notas.txt.bak"))

    def test_trash_moves_to_trash(self):
        path = os.path.join(self.dir, "noche.tidal")
        st = os.stat(path)
        home = os.path.join(self.dir, "home")
        os.mkdir(home)
        env = {"HOME": home, "XDG_DATA_HOME": os.path.join(home, ".local", "share")}
        with mock.patch.dict(os.environ, env), mock.patch("platform.system", return_value="Linux"):
            r = tfiles.trash(path, st.st_mtime, st.st_size)
        self.assertTrue(r["trashed"])
        self.assertFalse(os.path.exists(path))
        trash = os.path.join(home, ".local", "share", "Trash")
        self.assertEqual(open(os.path.join(trash, "files", "noche.tidal")).read(), SONG)
        self.assertIn("Path=", open(os.path.join(trash, "info", "noche.tidal.trashinfo")).read())


if __name__ == "__main__":
    unittest.main()
