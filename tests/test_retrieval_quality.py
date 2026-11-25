"""Puerta de calidad de 0.21: las 60 consultas de tests/fixtures/retrieval_gold.json sobre las skills que vienen con
la app (sin plugins descargados). Sin IA. El modo por defecto (FTS5 + padre–hijo) tiene que:
  - no fallar ninguna consulta crítica ni colar nada prohibido (skills apagadas, letra en tareas instrumentales);
  - cubrir al menos el 95 % de lo necesario;
  - llevar con el hijo sus excepciones al menos tan bien como el modo solo-hijos, y mejor que la 0.20;
  - mandar menos que las skills enteras.
Tabla completa: python3 tools/knowledge_bench.py --misses
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import knowledge_bench as kb  # noqa: E402
import knowledge_store as ks  # noqa: E402
import plugins  # noqa: E402
import skills  # noqa: E402


class QualityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.old = (plugins.PLUGIN_DIR, skills.USER_DIR)
        plugins.PLUGIN_DIR = os.path.join(cls.tmp, "x")
        skills.USER_DIR = os.path.join(cls.tmp, "y")
        ks.configure(os.path.join(cls.tmp, "k.sqlite"))
        gold = json.load(open(kb.GOLD, encoding="utf-8"))["queries"]
        cls.gold = gold
        cfg = {"skills": {}}
        cls.r = {m: kb.run_mode(c, m, gold, cfg) for c, m, _ in kb.MODES if m in ("whole", "bm25", "child", "smart")}

    @classmethod
    def tearDownClass(cls):
        ks.close()
        plugins.PLUGIN_DIR, skills.USER_DIR = cls.old

    def test_corpus_size(self):
        self.assertGreaterEqual(len(self.gold), 60)

    def test_default_mode_gate(self):
        d = self.r["smart"]
        self.assertEqual(d["critical_fail"], [])
        self.assertEqual(d["forbid"], [])
        self.assertGreaterEqual(d["coverage"], 95.0, d["misses"])

    def test_parent_child_keeps_exceptions(self):
        self.assertGreaterEqual(self.r["smart"]["ctx_coverage"], self.r["child"]["ctx_coverage"])
        self.assertGreater(self.r["smart"]["ctx_coverage"], self.r["bm25"]["ctx_coverage"])
        self.assertGreaterEqual(self.r["smart"]["ctx_coverage"], 90.0, self.r["smart"]["ctx_miss"])

    def test_cheaper_than_whole(self):
        self.assertLess(self.r["smart"]["avg_chars"], 0.6 * self.r["whole"]["avg_chars"])


if __name__ == "__main__":
    unittest.main()
