#!/usr/bin/env python3
"""A fake GitHub API (repo victor/canciones) for screenshots: point config.json github.api_url to it.
Usage: python3 fake-github.py 8799"""
import os
import sys
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tests"))
from test_github_import import ReadableRepo  # noqa: E402
from test_github_empty_repo import Handler  # noqa: E402


class UserHandler(Handler):
    def _do(self):
        if self.path.split("?")[0] == "/user":
            import json
            raw = json.dumps({"login": "victor"}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
            return
        super()._do()

    do_GET = do_POST = do_PUT = do_PATCH = _do


Handler.repo = ReadableRepo()
UserHandler.repo = Handler.repo
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1] if len(sys.argv) > 1 else 8799)), UserHandler).serve_forever()
