"""Pruebas de 0.24 «Respuestas cortas»: Maestro piensa menos y escribe menos por defecto (prompt RESPUESTAS CORTAS y
`claude -p --effort low` si tu versión lo tiene), con la opción de pedir respuestas detalladas.
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import assistant  # noqa: E402
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

HIST = [{"role": "user", "content": "Añade un bajo funky"}]


class BriefPromptTest(unittest.TestCase):
    def test_short_by_default(self):
        system, _ = assistant.build_messages(HIST, {"bpm": 120, "tracks": []})
        self.assertIn("RESPUESTAS CORTAS", system)
        self.assertTrue(system.endswith(assistant.BRIEF_PROMPT))   # al final: manda sobre las longitudes anteriores

    def test_detailed_keeps_old_prompt(self):
        system, _ = assistant.build_messages(HIST, {"bpm": 120, "tracks": [], "detalle": "detailed"})
        self.assertNotIn("RESPUESTAS CORTAS", system)

    def test_plan_step_is_short_too(self):
        ps = {"titulo": "P", "resumen": "r", "i": 0, "pasos": [{"titulo": "Ritmo", "que": "bombo"}, {"titulo": "Bajo", "que": "b"}]}
        system, _ = assistant.build_messages(HIST, {"bpm": 120, "tracks": [], "plan_paso": ps})
        self.assertIn("EJECUTANDO UN PLAN APROBADO", system)
        self.assertTrue(system.endswith(assistant.BRIEF_PROMPT))

    def test_same_system_every_turn(self):
        # el prompt de sistema no cambia entre mensajes: la caché del proveedor sigue sirviendo
        a, _ = assistant.build_messages(HIST, {"bpm": 120, "tracks": []})
        b, _ = assistant.build_messages(HIST + [{"role": "assistant", "content": "{}"}, {"role": "user", "content": "otra"}],
                                        {"bpm": 90, "tracks": []})
        self.assertEqual(a, b)

    def test_output_format_untouched(self):
        # las respuestas cortas no cambian el JSON que entiende la app
        raw = json.dumps({"mensaje": "Bajo funky en d4.", "cambios": {"pistas": [{"id": "d4", "nombre": "Bajo", "tipo": "bajo",
                                                                            "codigo": 'n "0 ~ 3 5" # s "bass3"'}]}})
        r = assistant.parse_reply(raw)
        self.assertEqual(r["cambios"]["pistas"][0]["id"], "d4")


@unittest.skipIf(os.name == "nt", "script de shell")
class EffortTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.log = os.path.join(self.tmp, "calls.jsonl")
        llm._FLAGS.clear()

    def tearDown(self):
        shutil.rmtree(self.tmp)
        llm._FLAGS.clear()

    def fake(self, help_text):
        p = os.path.join(self.tmp, "claude")
        with open(p, "w") as f:
            f.write(FAKE.replace("HELP", repr(help_text)).replace("LOG", repr(self.log)))
        os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
        return p

    def args(self):
        return json.loads(open(self.log).read().strip().splitlines()[-1])

    def test_low_by_default(self):
        exe = self.fake("  --effort <level>  x\n")
        r = llm.claude_run({"claudecode": {"path": exe}}, "sys", "hola", timeout=30)
        a = self.args()
        self.assertEqual(a[a.index("--effort") + 1], "low")
        self.assertEqual(r["effort"], "low")

    def test_user_choice_and_empty(self):
        exe = self.fake("  --effort <level>  x\n")
        llm.claude_run({"claudecode": {"path": exe, "effort": "high"}}, "sys", "hola", timeout=30)
        a = self.args()
        self.assertEqual(a[a.index("--effort") + 1], "high")
        llm.claude_run({"claudecode": {"path": exe, "effort": ""}}, "sys", "hola", timeout=30)
        self.assertNotIn("--effort", self.args())    # "" = lo que tenga tu Claude Code

    def test_old_cli_without_effort(self):
        exe = self.fake("  --tools  x\n")
        r = llm.claude_run({"claudecode": {"path": exe}}, "sys", "hola", timeout=30)
        self.assertEqual(r["error"], "")
        self.assertNotIn("--effort", self.args())
