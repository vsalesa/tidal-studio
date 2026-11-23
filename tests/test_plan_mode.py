"""Plan por pasos, caché de Maestro y tiempo de espera por inactividad.
Ejecuta: python3 -m unittest discover tests"""
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import assistant  # noqa: E402
import llm  # noqa: E402
import mcache  # noqa: E402

PLAN = {"titulo": "Salsa", "resumen": "r", "pasos": [
    {"titulo": "Clave", "que": "a", "aspecto": "ritmo", "pistas": ["d1", "d99"]},
    {"titulo": "Bajo", "que": "b", "aspecto": "bajo", "pistas": ["d3"]},
    {"titulo": "Piano", "que": "c"}]}


class PlanTest(unittest.TestCase):
    def test_plan_prompt_on_by_default(self):
        system, _ = assistant.build_messages([{"role": "user", "content": "hazme una salsa entera"}], {})
        self.assertIn("MODO PLAN POR PASOS", system)
        system, _ = assistant.build_messages([{"role": "user", "content": "x"}], {"plan_modo": False})
        self.assertNotIn("MODO PLAN POR PASOS", system)

    def test_parse_plan_clears_changes(self):
        import json
        raw = json.dumps({"mensaje": "m", "plan": PLAN, "cambios": {"pistas": [{"id": "d1", "codigo": "s \"bd\""}]}})
        r = assistant.parse_reply(raw)
        self.assertEqual(len(r["plan"]["pasos"]), 3)
        self.assertEqual(r["plan"]["pasos"][0]["pistas"], ["d1"])  # d99 no es un id válido
        self.assertEqual(r["cambios"]["pistas"], [])  # con un plan no se aplica nada aún

    def test_one_step_plan_is_ignored(self):
        r = assistant.parse_reply('{"mensaje": "m", "plan": {"titulo": "x", "pasos": [{"titulo": "solo"}]}}')
        self.assertIsNone(r["plan"])

    def test_step_system_prompt_is_identical_across_steps(self):
        """El paso va en el mensaje del alumno: el prompt de sistema no cambia y el proveedor lo cachea."""
        systems, lasts = [], []
        for i in range(3):
            ps = dict(PLAN, i=i, peticion="salsa", pasos=[dict(p, estado="hecho" if k < i else "pendiente") for k, p in enumerate(PLAN["pasos"])])
            system, msgs = assistant.build_messages([{"role": "user", "content": f"paso {i}"}], {"plan_paso": ps})
            systems.append(system)
            lasts.append(msgs[-1]["content"])
        self.assertEqual(len(set(systems)), 1)
        self.assertIn("EJECUTANDO UN PLAN APROBADO", systems[0])
        self.assertNotIn("MODO OPCIONES", systems[0])  # en un paso no hay variantes
        self.assertIn("AHORA haz SOLO el paso 2 de 3: «Bajo»", lasts[1])
        self.assertIn("1. [HECHO] Clave", lasts[1])

    def test_step_history_is_short(self):
        hist = [{"role": "user" if k % 2 == 0 else "assistant", "content": f"m{k}"} for k in range(30)]
        ps = dict(PLAN, i=0)
        _, msgs = assistant.build_messages(hist, {"plan_paso": ps})
        self.assertLessEqual(len(msgs), 7)  # 6 del historial (+1 si hay que abrir turno)

    def test_force_plan(self):
        system, _ = assistant.build_messages([{"role": "user", "content": "x"}], {"plan_forzar": True})
        self.assertIn("hacerlo POR PASOS", system)


class CacheTest(unittest.TestCase):
    def setUp(self):
        self.old = mcache.DIR
        mcache.DIR = tempfile.mkdtemp()
        mcache._mem.clear()

    def tearDown(self):
        mcache.clear()
        mcache.DIR = self.old

    def test_disk_survives_memory_loss(self):
        mcache.put("ns", "k", {"a": 1})
        mcache._mem.clear()  # como si se reiniciara el estudio
        self.assertEqual(mcache.get("ns", "k"), {"a": 1})

    def test_ttl(self):
        mcache.put("ns", "k", 1)
        self.assertIsNone(mcache.get("ns", "k", ttl=-1))

    def test_cached_skips_failures(self):
        calls = []
        f = lambda: calls.append(1) or 0  # noqa: E731
        mcache.cached("ns", "z", f, keep=bool)
        mcache.cached("ns", "z", f, keep=bool)
        self.assertEqual(len(calls), 2)  # un 0 (fallo) no se guarda
        g = lambda: calls.append(1) or 5  # noqa: E731
        mcache.cached("ns", "y", g, keep=bool)
        mcache.cached("ns", "y", g, keep=bool)
        self.assertEqual(len(calls), 3)


class IdleTimeoutTest(unittest.TestCase):
    """Con streaming, `claude` no se corta mientras va mandando algo; sí si se queda callado."""

    def run_script(self, script, timeout):
        res = {}
        llm._run_streaming([sys.executable, "-c", script], "", None, dict(os.environ), timeout, lambda *a: None, res)
        return res

    def test_talking_process_is_not_killed(self):
        t0 = time.time()
        res = self.run_script("import time,sys\nfor i in range(5):\n print('{}', flush=True); time.sleep(0.6)", 2)
        self.assertGreater(time.time() - t0, 2.5)  # pasó del tiempo de espera…
        self.assertNotIn("error", res)  # …y no se cortó porque iba hablando

    def test_silent_process_is_killed(self):
        res = self.run_script("import time; time.sleep(30)", 2)
        self.assertEqual(res.get("error"), "timeout")

    def test_timeout_config(self):
        self.assertEqual(llm.timeout_for({"provider": "openai", "openai": {}}), llm.DEFAULT_TIMEOUT)
        self.assertEqual(llm.timeout_for({"provider": "openai", "openai": {}, "ai_timeout": 90}), 90)
        self.assertEqual(llm.timeout_for({"provider": "claudecode", "claudecode": {"timeout": 5}}), 30)  # mínimo


class AnthropicCacheTest(unittest.TestCase):
    def test_system_blocks_get_cache_control(self):
        sent = {}

        def fake_post(url, headers, body, timeout=120):
            sent.update(body)
            return {"content": [{"type": "text", "text": "{}"}], "usage": {"cache_read_input_tokens": 9000}}
        old = llm._post
        llm._post = fake_post
        try:
            seen = []
            llm._anthropic({"anthropic": {"api_key": "k", "model": "claude-opus-5-5"}}, ["FIXED", "SKILLS"],
                           [{"role": "user", "content": "hola"}], 100)
            llm._cache_note({"cache_read_input_tokens": 9000}, lambda k, t: seen.append((k, t)))
        finally:
            llm._post = old
        self.assertEqual([b["text"] for b in sent["system"]], ["FIXED", "SKILLS"])
        self.assertTrue(all(b.get("cache_control") == {"type": "ephemeral"} for b in sent["system"]))
        self.assertEqual(seen, [("cache", "9000")])


if __name__ == "__main__":
    unittest.main()
