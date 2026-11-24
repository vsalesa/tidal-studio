"""Guardar canciones en un repositorio de GitHub recién creado y vacío (sin ningún commit).

GitHub responde 409 «Git Repository is empty» a la API de datos de Git en un repo vacío; antes
eso rompía «Guardar en GitHub». Aquí GitHub se simula con un servidor HTTP local que imita
ese comportamiento. Ejecuta: python3 -m unittest discover tests"""
import base64
import hashlib
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import github  # noqa: E402

OWNER_REPO = "victor/canciones"
R = f"/repos/{OWNER_REPO}"


def _sha(*parts):
    return hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()


class FakeRepo:
    """Un repo mínimo: commits con un árbol plano {ruta: contenido} y ramas."""

    def __init__(self, default_branch="main"):
        self.default_branch = default_branch
        self.refs = {}       # rama -> sha de commit
        self.commits = {}    # sha -> {"tree": sha, "parents": [...], "message": str}
        self.trees = {}      # sha -> {ruta: contenido}
        self.log = []

    def empty(self):
        return not self.refs

    def _commit(self, files, parents, message):
        tree = _sha("tree", files)
        self.trees[tree] = dict(files)
        sha = _sha("commit", tree, parents, message)
        self.commits[sha] = {"tree": tree, "parents": parents, "message": message}
        return sha

    def handle(self, method, path, body):
        self.log.append((method, path))
        path = path.split("?")[0]
        if path == R and method == "GET":
            return 200, {"full_name": OWNER_REPO, "default_branch": self.default_branch}
        if path.startswith(f"{R}/git/") and self.empty():
            return 409, {"message": "Git Repository is empty."}
        if path.startswith(f"{R}/git/ref/heads/") and method == "GET":
            b = path.rsplit("/heads/", 1)[1]
            if b not in self.refs:
                return 404, {"message": "Not Found"}
            return 200, {"object": {"sha": self.refs[b]}}
        if path == f"{R}/git/refs" and method == "POST":
            b = body["ref"].split("refs/heads/", 1)[1]
            if b in self.refs:
                return 422, {"message": "Reference already exists"}
            self.refs[b] = body["sha"]
            return 201, {"ref": body["ref"]}
        if path.startswith(f"{R}/git/refs/heads/") and method == "PATCH":
            self.refs[path.rsplit("/heads/", 1)[1]] = body["sha"]
            return 200, {}
        if path.startswith(f"{R}/git/commits/") and method == "GET":
            return 200, {"tree": {"sha": self.commits[path.rsplit("/", 1)[1]]["tree"]}}
        if path == f"{R}/git/trees" and method == "POST":
            files = dict(self.trees[body["base_tree"]])
            files.update({e["path"]: e["content"] for e in body["tree"]})
            sha = _sha("tree", files)
            self.trees[sha] = files
            return 201, {"sha": sha}
        if path == f"{R}/git/commits" and method == "POST":
            sha = _sha("commit", body["tree"], body["parents"], body["message"])
            self.commits[sha] = {"tree": body["tree"], "parents": body["parents"], "message": body["message"]}
            return 201, {"sha": sha, "html_url": f"https://github.com/{OWNER_REPO}/commit/{sha}"}
        if path.startswith(f"{R}/contents/") and method == "PUT":
            name = path.split("/contents/", 1)[1]
            content = base64.b64decode(body["content"]).decode()
            branch = body.get("branch")
            if self.empty():
                # Como GitHub: en un repo vacío solo vale la rama por defecto
                if branch and branch != self.default_branch:
                    return 404, {"message": f"Branch {branch} not found"}
                sha = self._commit({name: content}, [], body["message"])
                self.refs[self.default_branch] = sha
            else:
                branch = branch or self.default_branch
                if branch not in self.refs:
                    return 404, {"message": f"Branch {branch} not found"}
                head = self.refs[branch]
                files = dict(self.trees[self.commits[head]["tree"]])
                files[name] = content
                sha = self._commit(files, [head], body["message"])
                self.refs[branch] = sha
            return 201, {"commit": {"sha": sha, "html_url": f"https://github.com/{OWNER_REPO}/commit/{sha}"}}
        if path.startswith(f"{R}/contents/") and method == "GET":
            if self.empty():
                return 404, {"message": "This repository is empty."}
            return 404, {"message": "Not Found"}
        if path == f"{R}/commits" and method == "GET":
            if self.empty():
                return 409, {"message": "Git Repository is empty."}
            return 200, []
        return 500, {"message": f"no simulado: {method} {path}"}

    def files(self, branch="main"):
        return self.trees[self.commits[self.refs[branch]]["tree"]]


class Handler(BaseHTTPRequestHandler):
    repo = None

    def _do(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n)) if n else None
        code, out = self.repo.handle(self.command, self.path, body)
        raw = json.dumps(out).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    do_GET = do_POST = do_PUT = do_PATCH = _do

    def log_message(self, *a):
        pass


PROJECT = {"name": "Mi Primera Canción", "bpm": 110, "style": "house",
           "tracks": [{"id": "d1", "name": "Batería", "kind": "drums", "code": 's "bd*4"'}]}


class EmptyRepoTest(unittest.TestCase):
    def setUp(self):
        os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"
        self.repo = FakeRepo()
        Handler.repo = self.repo
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.cfg = {"github": {"token": "x", "repo": OWNER_REPO,
                               "api_url": f"http://127.0.0.1:{self.srv.server_address[1]}"}}

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def test_save_into_empty_repo(self):
        out = github.save_song(self.cfg, PROJECT)
        self.assertEqual(out["slug"], "mi-primera-cancion")
        files = self.repo.files("main")
        self.assertIn("README.md", files)  # primer commit del repo
        for n in ("song.tidal", "song.json", "README.md"):
            self.assertIn(f"songs/mi-primera-cancion/{n}", files)
        self.assertEqual(json.loads(files["songs/mi-primera-cancion/song.json"])["bpm"], 110)
        # El guardado de la canción es un único commit encima del primero
        head = self.repo.commits[self.repo.refs["main"]]
        self.assertEqual(len(self.repo.commits[head["parents"][0]]["parents"]), 0)

    def test_second_save_is_normal(self):
        github.save_song(self.cfg, PROJECT)
        first = self.repo.refs["main"]
        changed = dict(PROJECT, bpm=124)
        github.save_song(self.cfg, changed)
        self.assertEqual(self.repo.commits[self.repo.refs["main"]]["parents"], [first])
        self.assertEqual(github.save_song(self.cfg, changed).get("unchanged"), True)

    def test_custom_branch_in_empty_repo(self):
        self.cfg["github"]["branch"] = "canciones"
        github.save_song(self.cfg, PROJECT)
        self.assertIn("songs/mi-primera-cancion/song.tidal", self.repo.files("canciones"))

    def test_missing_branch_in_non_empty_repo(self):
        github.save_song(self.cfg, PROJECT)
        self.cfg["github"]["branch"] = "borradores"
        github.save_song(self.cfg, dict(PROJECT, name="Otra"))
        self.assertIn("songs/otra/song.json", self.repo.files("borradores"))

    def test_list_and_history_on_empty_repo(self):
        self.assertEqual(github.list_songs(self.cfg), [])
        self.assertEqual(github.history(self.cfg, "mi-primera-cancion"), [])


class RepoUrlTest(unittest.TestCase):
    def test_accepts_urls(self):
        for v in ("vsalesa/mis-canciones", " https://github.com/vsalesa/mis-canciones ", "https://github.com/vsalesa/mis-canciones.git",
                  "github.com/vsalesa/mis-canciones/", "https://github.com/vsalesa/mis-canciones/tree/main",
                  "git@github.com:vsalesa/mis-canciones.git"):
            self.assertEqual(github.normalize_repo(v), "vsalesa/mis-canciones", v)
            self.assertTrue(github.configured({"github": {"token": "t", "repo": v}}), v)


if __name__ == "__main__":
    unittest.main()
