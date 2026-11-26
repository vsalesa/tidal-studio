"""0.26 «Medir»: el registro persistente guarda tokens y tiempos reales y calcula la línea base por versión.
Ejecuta: python3 -m unittest tests.test_ledger"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import ledger  # noqa: E402
import router  # noqa: E402


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.led = ledger.Ledger(os.path.join(self.d, "executions", "e.db"), "0.26.0")
        self.mon = router.Monitor(on_done=self.led.record)

    def _req(self, text, llm=None):
        r = self.mon.start(text)
        if llm:
            r.begin("llm")
            r.add_tokens("llm", *llm)
            r.end("llm", "hit", note="claude")
        else:
            r.begin("rules")
            r.end("rules", "hit")
        r.finish()

    def test_baseline(self):
        self._req("mis canciones")
        self._req("haz una cumbia", (1000, 200, 800))
        self._req("otra", (500, 100, 0))
        b = self.led.baseline()[0]
        self.assertEqual((b["version"], b["requests"], b["without_llm"], b["llm_calls"]), ("0.26.0", 3, 1, 2))
        self.assertEqual(b["tokens_per_llm_request"], 900)
        self.assertEqual(b["tokens_cached"], 800)
        rows = self.led.recent(10)
        local = next(r for r in rows if r["text"] == "mis canciones")
        self.assertIsNone(local["tokens_in"])  # no medido ≠ 0
        self.assertEqual(local["llm_calls"], 0)

    def test_prune_and_persist(self):
        self._req("hola", (1, 1, 0))
        self.assertEqual(self.led.prune(365), 0)
        again = ledger.Ledger(os.path.join(self.d, "executions", "e.db"), "0.26.0")
        self.assertEqual(len(again.recent()), 1)


if __name__ == "__main__":
    unittest.main()
