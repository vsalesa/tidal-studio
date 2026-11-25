"""Pruebas de 0.21 «Maestro aislado de tu Claude Code global»: el `claude -p` del Maestro se lanza con --safe-mode y
--disable-slash-commands si tu versión los tiene (sin tocar tu configuración), con un aviso si no los tiene, y se
puede apagar. Se usa un `claude` falso que apunta con qué opciones lo llamaron.
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import llm  # noqa: E402

FAKE = """#!/usr/bin/env python3
import json, sys
if "--help" in sys.argv:
    print(HELP)
    sys.exit(0)
open(LOG, "a").write(json.dumps(sys.argv[1:]) + "\\n")
sys.stdin.read()
print(json.dumps({"type": "result", "result": "listo", "is_error": False, "usage": {}}))
"""


@unittest.skipIf(os.name == "nt", "script de shell")
class IsolationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.log = os.path.join(self.tmp, "calls.jsonl")
        llm._FLAGS.clear()

    def tearDown(self):
        shutil.rmtree(self.tmp)
        llm._FLAGS.clear()

    def fake(self, help_text, name="claude"):
        p = os.path.join(self.tmp, name)
        with open(p, "w") as f:
            f.write(FAKE.replace("HELP", repr(help_text)).replace("LOG", repr(self.log)))
        os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
        return p

    def last_call(self):
        return json.loads(open(self.log).read().strip().splitlines()[-1])

    def test_new_cli_gets_both_flags(self):
        exe = self.fake("  --safe-mode   x\n  --disable-slash-commands  y\n")
        r = llm.claude_run({"claudecode": {"path": exe}}, "sys", "hola", timeout=30)
        self.assertEqual(r["error"], "")
        args = self.last_call()
        self.assertIn("--safe-mode", args)
        self.assertIn("--disable-slash-commands", args)
        self.assertIn("--system-prompt-file", args)                 # el prompt del Maestro sigue yendo
        self.assertEqual(args[args.index("--tools") + 1], "")
        self.assertIn("--safe-mode", r["isolation"])

    def test_old_cli_says_what_is_missing(self):
        exe = self.fake("  --tools  x\n")
        r = llm.claude_run({"claudecode": {"path": exe}}, "sys", "hola", timeout=30)
        self.assertNotIn("--safe-mode", self.last_call())
        self.assertIn("no tiene", r["isolation"])

    def test_modes(self):
        exe = self.fake("  --safe-mode\n  --disable-slash-commands\n")
        for mode, want, not_want in (("off", [], ["--safe-mode", "--disable-slash-commands"]),
                                     ("disable_cli_skills", ["--disable-slash-commands"], ["--safe-mode"]),
                                     ("safe_mode", ["--safe-mode"], ["--disable-slash-commands"])):
            llm.claude_run({"claudecode": {"path": exe, "skill_isolation": mode}}, "sys", "hola", timeout=30)
            args = self.last_call()
            for w in want:
                self.assertIn(w, args, mode)
            for w in not_want:
                self.assertNotIn(w, args, mode)


if __name__ == "__main__":
    unittest.main()
