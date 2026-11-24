"""Maestro v2 (0.14): índice de canciones en SQLite, dataset de votos, enrutador por capas y candados.
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import assistant  # noqa: E402
import llm  # noqa: E402
import router  # noqa: E402
import songindex  # noqa: E402

SONG = {"id": "p1", "name": "Merengue de prueba", "bpm": 130, "style": "merengue", "tracks": [
    {"id": "d1", "name": "Tambora", "kind": "percusion", "code": 's "tambora*4 ~ tambora:2"'},
    {"id": "d2", "name": "Güira", "kind": "percusion", "code": 'fast 2 $ s "guira*8" # gain 0.8', "lock": {"all": True}},
    {"id": "d4", "name": "Bajo", "kind": "bajo", "code": 'n "0 ~ 7 5" # s "superfm" # lpf 800', "lock": {"ritmo": True}},
]}


class SongIndexTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ix = songindex.SongIndex(os.path.join(self.tmp, "m.db"))

    def test_sounds_of(self):
        self.assertEqual(songindex.sounds_of('every 4 (fast 2) $ s "bd*2 [sn:3 ~] <hh oh>" # room 0.2'), {"bd", "sn", "hh", "oh"})
        self.assertEqual(songindex.sounds_of('n "0 3" # s "superpiano"'), {"superpiano"})

    def test_sync_is_idempotent_and_read_only(self):
        r1 = self.ix.sync(SONG)
        r2 = self.ix.sync(json.loads(json.dumps(SONG)))
        self.assertTrue(r1["changed"])
        self.assertFalse(r2["changed"])
        self.assertEqual(r1["hash"], r2["hash"])
        changed = json.loads(json.dumps(SONG))
        changed["tracks"][0]["code"] = 's "tambora*2"'
        self.assertTrue(self.ix.sync(changed)["changed"])
        self.assertEqual(self.ix.song("p1")["tracks"][0]["code"], 's "tambora*2"')
        with self.assertRaises(ValueError):
            self.ix.sync({"tracks": []})

    def test_search_and_with_sound(self):
        self.ix.sync(SONG)
        hits = self.ix.with_sound("guira")
        self.assertEqual([h["track_id"] for h in hits], ["d2"])
        self.assertTrue(self.ix.search("bajo superfm"))
        self.ix.forget("p1")
        self.assertEqual(self.ix.with_sound("guira"), [])

    def test_votes_export_jsonl(self):
        self.ix.vote({"kind": "ab", "song_id": "p1", "candidates": [{"code": "a"}, {"code": "b"}], "chosen": 1, "blind": True})
        self.ix.vote({"kind": "rating", "genre": "merengue", "score": 3, "missing": "más tambora"})
        with self.assertRaises(ValueError):
            self.ix.vote({"kind": "nope"})
        lines = self.ix.export_jsonl().strip().split("\n")
        self.assertEqual(len(lines), 2)
        first = json.loads(lines[0])
        self.assertEqual(first["kind"], "ab")
        self.assertEqual(first["dataset_version"], songindex.DATASET_VERSION)
        self.assertEqual(first["license"], "own")
        st = self.ix.votes_stats()
        self.assertEqual(st["total"], 2)
        self.assertEqual(st["baseline"]["merengue"]["score"], 3)


class RouterTest(unittest.TestCase):
    def setUp(self):
        self.ix = songindex.SongIndex(os.path.join(tempfile.mkdtemp(), "m.db"))
        self.ix.sync(SONG)

    def test_config_defaults_and_limits(self):
        r = router.config({})
        self.assertEqual(r["max_candidates"], 4)
        r = router.config({"router": {"max_candidates": 9, "max_tokens": 50, "layers": {"skills": False, "x": True}}})
        self.assertEqual(r["max_candidates"], 4)
        self.assertEqual(r["max_tokens"], 300)
        self.assertFalse(r["layers"]["skills"])
        self.assertNotIn("x", r["layers"])
        cfg = {}
        router.update(cfg, {"max_candidates": 2, "layers": {"index": False}})
        self.assertEqual(cfg["router"]["max_candidates"], 2)
        self.assertFalse(cfg["router"]["layers"]["index"])

    def test_local_answers_need_no_llm(self):
        ans, conf, hits = router.local_answer("¿Qué canciones mías usan guira?", self.ix, "es")
        self.assertIn("Merengue de prueba", ans["mensaje"])
        self.assertEqual(conf, 1.0)
        self.assertEqual(hits, 1)
        ans, _, _ = router.local_answer("which songs use superfm", self.ix, "en")
        self.assertIn("d4", ans["mensaje"])
        self.assertIsNotNone(router.local_answer("mis canciones", self.ix, "es"))
        self.assertIsNone(router.local_answer("hazme un bajo más funky", self.ix, "es"))

    def test_index_context_skips_current_song(self):
        other = dict(SONG, id="p2", name="Otra")
        self.ix.sync(other)
        lines, n = router.index_context(self.ix, "tambora", "p1", 3)
        self.assertTrue(n >= 1)
        self.assertTrue(all("Otra" in x for x in lines))

    def test_validate_drops_locked(self):
        sess = {"tracks": SONG["tracks"], "bpm_lock": True}
        reply = {"cambios": {"bpm": 140, "pistas": [{"id": "d2", "codigo": "x"}, {"id": "d1", "codigo": "y"}], "eliminar": ["d2"]},
                 "variantes": [{"cambios": {"pistas": [{"id": "d2"}]}} for _ in range(4)]}
        blocked = router.validate(reply, sess, max_candidates=2)
        self.assertEqual(blocked, ["bpm", "d2"])
        self.assertNotIn("bpm", reply["cambios"])
        self.assertEqual([p["id"] for p in reply["cambios"]["pistas"]], ["d1"])
        self.assertEqual(reply["cambios"]["eliminar"], [])
        # las opciones que solo tocaban la pista bloqueada desaparecen
        self.assertEqual(reply["variantes"], [])
        reply = {"variantes": [{"cambios": {"pistas": [{"id": "d2"}, {"id": "d1"}]}}, {"cambios": {"pistas": [{"id": "d4"}]}}]}
        router.validate(reply, sess)
        self.assertEqual([[p["id"] for p in v["cambios"]["pistas"]] for v in reply["variantes"]], [["d1"], ["d4"]])

    def test_monitor_records_layers(self):
        mon = router.Monitor(keep=3)
        req = mon.start("hola", "t1")
        req.begin("llm")
        req.add_tokens("llm", 100, 20, 50)
        req.end("llm", "hit")
        req.finish()
        pub = mon.public()[0]
        self.assertEqual(pub["answered_by"], "llm")
        self.assertEqual(pub["layers"]["llm"]["tokens_in"], 100)
        self.assertEqual(pub["layers"]["rules"]["status"], "skip")
        self.assertEqual(mon.summary()["requests"], 1)
        for i in range(5):
            mon.start(str(i)).finish()
        self.assertEqual(len(mon.public()), 3)
        # una petición instantánea que ya terminó no sigue contando tiempo
        self.assertTrue(all(r["done"] and r["total_ms"] < 1000 for r in mon.public()))


class LocksPromptTest(unittest.TestCase):
    def test_session_summary_mentions_locks(self):
        txt = assistant.session_summary({"bpm": 130, "bpm_lock": True, "tracks": SONG["tracks"], "max_opciones": 2})
        self.assertIn("BLOQUEADA", txt)
        self.assertIn("bloqueado: ritmo", txt)
        self.assertIn("BPM BLOQUEADO", txt)
        self.assertIn("como mucho 2", txt)

    def test_usage_counter(self):
        llm.take_usage()
        llm.note_usage({"prompt_tokens": 7, "completion_tokens": 3})
        llm.note_usage({"input_tokens": 5, "output_tokens": 1})
        self.assertEqual(llm.take_usage(), {"in": 12, "out": 4, "cached": 0})


if __name__ == "__main__":
    unittest.main()
