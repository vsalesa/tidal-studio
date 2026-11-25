"""Pruebas de 0.21 «tus elecciones como candidatas a memoria»: cambiar tú el sonido de una pista cuenta igual que
elegirlo entre opciones (3 iguales → memoria de género), y elegir varias veces opciones parecidas del Maestro (la más
sencilla, la más lenta…) propone una memoria que SIEMPRE va a la bandeja.
Ejecuta: python3 -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import memory  # noqa: E402
import soundlab  # noqa: E402


def opt(code, bpm=None, tracks=1):
    ch = {"pistas": [{"id": f"d{i + 1}", "codigo": code} for i in range(tracks)]}
    if bpm:
        ch["bpm"] = bpm
    return {"title": "x", "changes": ch}


class ChoicesTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.m = memory.Store(os.path.join(self.dir, "memory.db"))
        self.s = soundlab.Store(os.path.join(self.dir, "sounds.db"))

    def tearDown(self):
        self.m.db.close()
        self.s.db.close()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_manual_swaps_become_memory(self):
        for _ in range(3):       # lo que manda la web cuando cambias el sonido a mano
            self.s.choose("bajo", "salsa", "acoustic_bass_fluid", ["superfm"])
        made = self.m.learn_from_choices(self.s.choice_rows())
        self.assertEqual(len(made), 1)
        self.assertIn("«acoustic_bass_fluid»", made[0]["text"])
        self.assertIn("cambiándolo yo", made[0]["text"])

    def test_traits(self):
        sparse, busy = opt('n "c ~ ~ e"'), opt('n "c e g c e g c e"')
        self.assertEqual(memory.Store.option_traits([sparse, busy, busy], 0), {"sparser"})
        self.assertEqual(memory.Store.option_traits([sparse, busy], 1), {"denser"})
        self.assertEqual(memory.Store.option_traits([opt('n "c"', 90), opt('n "c"', 100)], 0), {"slower"})
        self.assertIn("fewer_layers", memory.Store.option_traits([opt('n "c"', tracks=1), opt('n "c"', tracks=2)], 0))
        self.assertEqual(memory.Store.option_traits([sparse], 0), set())

    def test_repeated_option_picks_go_to_inbox(self):
        sparse, busy = opt('n "c ~ ~ e"'), opt('n "c e g c e g c e"')
        votes = [{"kind": "pick", "style": "salsa", "candidates": [busy, sparse, busy], "chosen": 1} for _ in range(2)]
        self.assertEqual(self.m.learn_from_option_picks(votes), [])          # 2 veces: aún no
        votes.append({"kind": "pick", "style": "salsa", "candidates": [sparse, busy], "chosen": 0})
        made = self.m.learn_from_option_picks(votes)
        self.assertEqual(len(made), 1)
        self.assertEqual(made[0]["status"], "pending")                     # decides tú
        self.assertIn("más sencilla", made[0]["text"])
        self.assertEqual(made[0]["scope"], "genre")
        self.assertEqual(self.m.learn_from_option_picks(votes), [])          # no se repite
        self.m.set_status(made[0]["id"], "rejected")
        votes.append(votes[0])
        self.assertEqual(self.m.learn_from_option_picks(votes), [])          # rechazada: no vuelve

    def test_mixed_picks_propose_nothing(self):
        sparse, busy = opt('n "c ~ ~ e"'), opt('n "c e g c e g c e"')
        votes = [{"kind": "pick", "style": "cumbia", "candidates": [sparse, busy], "chosen": k % 2} for k in range(6)]
        self.assertEqual(self.m.learn_from_option_picks(votes), [])


if __name__ == "__main__":
    unittest.main()
