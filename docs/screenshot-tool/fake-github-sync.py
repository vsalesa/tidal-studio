#!/usr/bin/env python3
"""A fake GitHub API with several repositories, for the 0.19 sync screenshots (point config.json github.api_url to it).
Supports what the memory sync uses: refs, commits, trees (with deletions and ?recursive=1), blobs and the contents API
(raw files and folder listings). Usage: python3 fake-github-sync.py 8798"""
import base64
import hashlib
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPOS = {}   # "owner/repo" -> {"commits": {sha: {"files": {...}}}, "head": sha}


def sha(*parts):
    return hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()


def repo(name):
    if name not in REPOS:
        c = sha(name, "root")
        REPOS[name] = {"commits": {c: {"files": {"README.md": f"# {name}\n"}}}, "head": c, "trees": {}}
        REPOS[name]["trees"][c] = REPOS[name]["commits"][c]["files"]
    return REPOS[name]


def seed(name, files):
    r = repo(name)
    f = dict(r["commits"][r["head"]]["files"], **files)
    c = sha(name, f)
    r["commits"][c] = {"files": f}
    r["trees"][c] = f
    r["head"] = c


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj, raw=False):
        data = obj.encode() if raw else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"null") if n else None
        path, _, q = self.path.partition("?")
        if path == "/user":
            return self.send(200, {"login": "victor"})
        m = re.match(r"^/repos/([\w.-]+/[\w.-]+)(/.*)?$", path)
        if not m:
            return self.send(404, {"message": "Not Found"})
        r, rest = repo(m.group(1)), m.group(2) or ""
        files = r["commits"][r["head"]]["files"]
        if rest == "" and self.command == "GET":
            return self.send(200, {"default_branch": "main"})
        if rest.startswith("/git/ref/heads/"):
            return self.send(200, {"object": {"sha": r["head"]}})
        if rest.startswith("/git/commits/") and self.command == "GET":
            return self.send(200, {"tree": {"sha": rest.rsplit("/", 1)[1]}})
        if rest == "/git/trees" and self.command == "POST":
            f = dict(r["trees"].get(body.get("base_tree")) or files)
            for e in body["tree"]:
                if e.get("sha", "x") is None:
                    f.pop(e["path"], None)
                else:
                    f[e["path"]] = e["content"]
            t = sha("tree", f)
            r["trees"][t] = f
            return self.send(201, {"sha": t})
        if rest == "/git/commits" and self.command == "POST":
            c = sha("commit", body)
            r["commits"][c] = {"files": r["trees"][body["tree"]]}
            return self.send(201, {"sha": c, "html_url": f"https://github.com/{m.group(1)}/commit/{c}"})
        if rest.startswith("/git/refs/heads/") and self.command == "PATCH":
            r["head"] = body["sha"]
            return self.send(200, {})
        if rest.startswith("/git/trees/") and self.command == "GET":
            return self.send(200, {"tree": [{"type": "blob", "path": p, "sha": "b:" + p, "size": len(c)} for p, c in files.items()]})
        if rest.startswith("/git/blobs/b:"):
            p = rest[len("/git/blobs/b:"):]
            return self.send(200, {"content": base64.b64encode(files[p].encode()).decode()})
        if rest.startswith("/contents/") and self.command == "GET":
            p = rest[len("/contents/"):]
            if p in files:
                if "raw" in (self.headers.get("Accept") or ""):
                    return self.send(200, files[p], raw=True)
                return self.send(200, {"content": base64.b64encode(files[p].encode()).decode()})
            kids = sorted({x[len(p) + 1:].split("/")[0] for x in files if x.startswith(p + "/")})
            if kids:
                return self.send(200, [{"name": k, "path": f"{p}/{k}", "type": "file" if f"{p}/{k}" in files else "dir"} for k in kids])
            return self.send(404, {"message": "Not Found"})
        return self.send(500, {"message": f"not simulated: {self.command} {rest}"})

    do_GET = do_POST = do_PATCH = do_PUT = do


if __name__ == "__main__":
    # Ana shares her memory in ana/musica (tidal-studio/ folder), like a 0.19 sync leaves it
    seed("ana/musica", {
        "tidal-studio/memories.json": json.dumps({"version": 2, "memories": [
            {"uid": "a1", "scope": "genre", "scope_key": "salsa", "text": "En salsa el piano siempre en montuno, nunca en bloque",
             "text_en": "In salsa the piano always plays a montuno, never block chords", "subject": "", "source": "manual", "evidence": 1},
            {"uid": "a2", "scope": "global", "scope_key": "", "text": "Las congas un poco a la izquierda",
             "text_en": "Congas slightly to the left", "subject": "", "source": "chat", "evidence": 2}]}),
        "tidal-studio/cases.json": json.dumps({"version": 2, "cases": []}),
        "tidal-studio/styles/son-de-ana.json": json.dumps({"version": 1, "name": "Son de Ana", "genre": "salsa", "bpm": 170, "roles": [
            {"role": "percusion", "name": "Clave", "sounds": ["claves"], "fx": "", "groove": 's "claves*2"'},
            {"role": "bajo", "name": "Tumbao", "sounds": ["acoustic_bass_fluid"], "fx": "", "groove": ""}]}),
    })
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1] if len(sys.argv) > 1 else 8798)), H).serve_forever()
