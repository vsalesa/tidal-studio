"""Pruebas de 0.18 «memoria y estilos»: capa de validación, ámbitos, registro que se deshace, aprender de las
elecciones de oído, estilos (sin notas, tres modos), casos, compartir por GitHub y panel de almacenamiento.
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import memory  # noqa: E402
import storage  # noqa: E402
import github  # noqa: E402

SONG = {"name": "Mi cumbia", "bpm": 95, "style": "cumbia", "tracks": [
    {"id": "d1", "name": "Güiro", "kind": "percusion", "code": 's "guiro*8" # gain 0.8'},
    {"id": "d2", "name": "Bajo", "kind": "bajo", "code": 'note "a2 e3 a2 e3" # s "superfm" # lpf 800 # legato 0.7'},
    {"id": "d3", "name": "Acordeón", "kind": "melodia", "code": 'note "a4 c5 e5 c5" # s "accordion_fluid" # room 0.3'}]}


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.m = memory.Store(os.path.join(self.dir, "memory.db"))

    def tearDown(self):
        self.m.db.close()
        shutil.rmtree(self.dir, ignore_errors=True)


class ObserveTest(unittest.TestCase):
    ctx = {"genre": "cumbia", "song_id": "p1", "course": "cumbia"}

    def test_explicit_is_clear(self):
        o = memory.observe("Recuerda que me gusta el bajo muy grave", self.ctx)
        self.assertEqual(o, [{"text": "Me gusta el bajo muy grave", "scope": "genre", "scope_key": "cumbia", "clear": True}])
        self.assertTrue(memory.only_memory("Remember that I like warm basses"))

    def test_preference_is_pending_and_scoped(self):
        o = memory.observe("No me gusta el reverb en esta canción", self.ctx)[0]
        self.assertEqual((o["scope"], o["scope_key"], o["clear"]), ("song", "p1", False))
        self.assertEqual(memory.observe("I never want reverb in all my songs", self.ctx)[0]["scope"], "global")

    def test_questions_and_plain_requests_are_ignored(self):
        self.assertEqual(memory.observe("¿siempre suena así?", self.ctx), [])
        self.assertEqual(memory.observe("pon un bombo", self.ctx), [])
        self.assertFalse(memory.only_memory("Remember that? what's next"))


class ValidationTest(Base):
    def test_manual_is_approved_and_clear_is_auto(self):
        a = self.m.add("Hi-hat suave", "global", source="manual")
        self.assertEqual((a["status"], a["auto"]), ("approved", 0))
        b = self.m.add("Bajo grave", "genre", "cumbia", source="chat", clear=True, by="maestro")
        self.assertEqual((b["status"], b["auto"]), ("approved", 1))
        c = self.m.add("Bajo muy grave", "genre", "cumbia", source="chat", clear=True, auto_approve=False, by="maestro")
        self.assertEqual(c["status"], "pending")

    def test_contradiction_goes_to_inbox(self):
        self.m.add("I like the bass a little behind the beat", "global", source="manual")
        c = self.m.add("The bass never goes behind the beat", "genre", "house", clear=True, by="maestro")
        self.assertEqual(c["status"], "pending")
        self.assertIn("contradice", c["note"])
        ok = self.m.add("In this song the claps always get a short room", "song", "p1", clear=True, by="maestro")
        self.assertEqual(ok["status"], "approved")

    def test_genre_tempo_check(self):
        c = self.m.add("En house quiero 150 BPM", "genre", "house", clear=True, by="maestro")
        self.assertEqual(c["status"], "pending")
        self.assertIn("tempo", c["note"])

    def test_duplicate_reinforces(self):
        self.m.add("Bajo grave", "genre", "cumbia", source="chat", clear=False, by="maestro")
        r = self.m.add("bajo grave.", "genre", "cumbia", source="chat", clear=True, by="maestro")
        self.assertEqual((r["evidence"], r["status"]), (2, "approved"))
        self.assertEqual(len(self.m.memories()), 1)

    def test_relevant_by_scope(self):
        self.m.add("global", "global", source="manual")
        self.m.add("canción", "song", "p1", source="manual")
        self.m.add("otra canción", "song", "p2", source="manual")
        self.m.add("cumbia", "genre", "cumbia", source="manual")
        self.m.add("salsa", "genre", "salsa", source="manual")
        self.assertEqual([m["text"] for m in self.m.relevant("p1", "", "cumbia")], ["canción", "cumbia", "global"])


class LogTest(Base):
    def test_every_change_is_logged_and_revertible(self):
        a = self.m.add("Hi-hat suave", "global", source="manual")
        self.m.edit(a["id"], "Hi-hat muy suave")
        self.m.delete(a["id"])
        log = self.m.log()
        self.assertEqual([e["action"] for e in log], ["delete", "edit", "add"])
        self.m.revert(log[0]["id"])           # deshacer el borrado
        self.assertEqual(self.m.memories()[0]["text"], "Hi-hat muy suave")
        self.m.revert(log[1]["id"])           # deshacer el cambio de texto
        self.assertEqual(self.m.memories()[0]["text"], "Hi-hat suave")
        with self.assertRaises(ValueError):
            self.m.revert(log[0]["id"])
        self.m.revert(log[2]["id"])           # deshacer el alta
        self.assertEqual(self.m.memories(), [])

    def test_on_change_only_after_changes(self):
        calls = []
        self.m.on_change = lambda: calls.append(1)
        self.m.add("algo dudoso", "global", source="chat", by="maestro")   # pendiente: no se copia
        self.assertEqual(calls, [])
        self.m.add("Hi-hat suave", "global", source="manual")
        self.assertEqual(len(calls), 1)


class PicksTest(Base):
    def test_clear_picks_become_genre_memory(self):
        rows = [{"ctx": "bajo|cumbia", "sound": "bass1", "picks": 3, "passes": 0},
                {"ctx": "bajo|cumbia", "sound": "bass2", "picks": 0, "passes": 3},
                {"ctx": "bajo|*", "sound": "bass1", "picks": 9, "passes": 0},
                {"ctx": "melodia|salsa", "sound": "x", "picks": 4, "passes": 0},
                {"ctx": "melodia|salsa", "sound": "y", "picks": 2, "passes": 0},
                {"ctx": "armonia|house", "sound": "z", "picks": 2, "passes": 0}]
        made = {m["subject"]: m for m in self.m.learn_from_choices(rows)}
        self.assertEqual(set(made), {"sound|bajo|cumbia", "sound|melodia|salsa"})
        self.assertEqual(made["sound|bajo|cumbia"]["status"], "approved")
        self.assertIn("«bass1»", made["sound|bajo|cumbia"]["text_en"])
        self.assertEqual(made["sound|melodia|salsa"]["status"], "pending")
        self.assertEqual(self.m.learn_from_choices(rows), [])      # no se repite
        rows[0]["sound"], rows[1]["sound"] = "bass2", "bass1"       # cambia de favorito con claridad
        self.m.learn_from_choices(rows)
        st = {m["text"]: m["status"] for m in self.m.memories() if m["subject"] == "sound|bajo|cumbia"}
        self.assertEqual(sorted(st.values()), ["approved", "rejected"])


class StyleTest(Base):
    def test_style_keeps_groove_not_notes(self):
        st = memory.style_from_song(SONG, "Mi cumbia")
        self.assertEqual(st["genre"], "cumbia")
        roles = {r["name"]: r for r in st["roles"]}
        self.assertEqual(roles["Güiro"]["groove"], SONG["tracks"][0]["code"])
        self.assertEqual(roles["Bajo"]["groove"], "")
        self.assertEqual(roles["Bajo"]["fx"], "# lpf 800 # legato 0.7")
        self.assertNotIn("a2 e3", json.dumps(memory.shareable(st)))
        self.assertIn("a2 e3", json.dumps(memory.shareable(st, include_literal=True)))

    def test_save_unique_ids_and_delete_revert(self):
        a = self.m.save_style(memory.style_from_song(SONG, "Mi cumbia"))
        b = self.m.save_style(memory.style_from_song(SONG, "Mi cumbia"))
        self.assertEqual((a["id"], b["id"]), ("mi-cumbia", "mi-cumbia-2"))
        self.m.delete_style("mi-cumbia")
        self.m.revert(self.m.log()[0]["id"])
        self.assertEqual(self.m.style("mi-cumbia")["name"], "Mi cumbia")

    def test_transform(self):
        st = memory.style_from_song(SONG)
        r = memory.transform(st, key="dm", bpm=100, ensemble={"Bajo": "acoustic_bass_fluid"})
        self.assertEqual((r["key"], r["bpm"], r["genre"]), ("Dm", 100, "cumbia"))
        codes = {t["name"]: t["code"] for t in r["tracks"]}
        self.assertEqual(codes["Güiro"], SONG["tracks"][0]["code"])
        self.assertIn('s "acoustic_bass_fluid"', codes["Bajo"])
        self.assertIn("# lpf 800", codes["Bajo"])
        self.assertIn('s "accordion_fluid"', codes["Acordeón"])
        self.assertNotEqual(codes["Bajo"], memory.transform(st, key="dm", seed=2)["tracks"][1]["code"] + "x")
        with self.assertRaises(ValueError):
            memory.transform(dict(st, genre=""))

    def test_validate_imported_style(self):
        with self.assertRaises(ValueError):
            memory.validate_style({"name": "x", "roles": []})
        st = memory.validate_style({"name": "<b>x</b>" * 30, "bpm": "999", "roles": [{"role": "bajo", "sounds": ["a"] * 20, "evil": 1}], "extra": 1})
        self.assertEqual(st["bpm"], 220)
        self.assertEqual(len(st["roles"][0]["sounds"]), 8)
        self.assertNotIn("extra", st)
        self.assertNotIn("evil", st["roles"][0])

    def test_maestro_text(self):
        st = memory.style_from_song(SONG)
        self.m.add("Bajo grave", "genre", "cumbia", source="manual")
        c = self.m.add_case({"problem": "el bajo choca con el bombo", "before": "a", "after": "b", "why": "respira", "genre": "cumbia"})
        txt = memory.maestro_text(self.m.relevant("", "", "cumbia"), self.m.cases_for("mi bajo choca", "cumbia"), st, "inspiration")
        self.assertIn("MEMORIA DEL ALUMNO", txt)
        self.assertIn("CASO MUSICAL", txt)
        self.assertIn("INSPIRACIÓN", txt)
        self.assertEqual(c["id"], 1)
        self.assertEqual(self.m.cases_for("algo distinto"), [])

    def test_backup_only_approved(self):
        self.m.add("aprobada", "global", source="manual")
        self.m.add("dudosa", "global", source="chat", by="maestro")
        self.m.save_style(memory.style_from_song(SONG))
        files = self.m.backup_files("ts")
        self.assertEqual(set(files), {"ts/memories.json", "ts/cases.json", "ts/styles/mi-cumbia.json"})
        mems = json.loads(files["ts/memories.json"])["memories"]
        self.assertEqual([m["text"] for m in mems], ["aprobada"])


class GitHubShareTest(unittest.TestCase):
    CFG = {"github": {"token": "t", "repo": "me/songs", "branch": "main"}}

    def test_links(self):
        seen = []

        def raw(url, token=""):
            seen.append(url)
            return '{"name": "x"}'
        with mock.patch.object(github, "_raw_get", raw), \
                mock.patch.object(github, "_list_get", lambda url, token="": json.dumps([{"type": "file", "name": "a.json", "path": "styles/a.json"}, {"type": "file", "name": "r.md", "path": "styles/r.md"}])):
            self.assertEqual(github.fetch_shared(self.CFG, "https://raw.githubusercontent.com/u/r/main/styles/a.json")[0][0], "styles/a.json")
            self.assertEqual(github.fetch_shared(self.CFG, "https://github.com/u/r/blob/dev/styles/b.json")[0][0], "styles/b.json")
            self.assertTrue(seen[-1].endswith("/repos/u/r/contents/styles/b.json?ref=dev"))
            got = github.fetch_shared(self.CFG, "u/r")
            self.assertEqual([p for p, _ in got], ["styles/a.json"])
        with self.assertRaises(github.GitHubError):
            github.fetch_shared(self.CFG, "not a link")
        self.assertEqual(github.share_url(self.CFG, "styles/a.json"), "https://github.com/me/songs/blob/main/styles/a.json")


class StorageTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        p = lambda *a: os.path.join(self.d, *a)  # noqa: E731
        self.paths = {"root": p("app"), "lib_dir": p("app", "samples"), "data_dir": p("data"), "tools": p("tools"), "stems": p("stems")}

        def w(path, n):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(b"x" * n)
        w(p("app", "cache", "llm", "a.json"), 100)
        w(p("app", "samples", "piano_fluid", "a.wav"), 5000)
        with open(p("app", "samples", "piano_fluid", "instrument.json"), "w") as f:
            json.dump({"src": "fluid"}, f)
        w(p("app", "samples", "mine_inst", "a.wav"), 300)
        with open(p("app", "samples", "mine_inst", "instrument.json"), "w") as f:
            json.dump({"src": "user"}, f)
        w(p("app", "samples", "kick_fs", "a.wav"), 700)
        w(p("app", "samples", "myclap", "a.wav"), 200)
        with open(p("app", "samples", "library.json"), "w") as f:
            json.dump({"sounds": {"kick_fs": {"source": "freesound"}, "myclap": {"source": "local"}}}, f)
        w(p("tools", "venv", "bin", "python"), 1000)
        w(p("tools", "ready-v2"), 1)
        w(p("stems", "song-1", "bass.wav"), 400)

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def test_scan(self):
        g = {x["id"]: x for x in storage.scan(self.paths)["groups"]}
        self.assertEqual(g["instruments"]["size"], 5000 + os.path.getsize(os.path.join(self.paths["lib_dir"], "piano_fluid", "instrument.json")))
        self.assertEqual([i["id"] for i in g["downloads"]["items"]], ["kick_fs"])
        self.assertEqual(sorted(i["id"] for i in g["mine"]["items"]), ["mine_inst", "myclap"])
        self.assertFalse(g["mine"]["deletable"])
        self.assertFalse(g["learning"]["deletable"])
        self.assertTrue(g["instruments"]["start"])
        self.assertEqual(g["cache"]["impact"], "safe")

    def test_delete(self):
        removed = []
        hooks = {"remove_instrument": removed.append, "remove_sound": removed.append}
        storage.delete(self.paths, "cache", hooks=hooks)
        self.assertFalse(os.path.exists(os.path.join(self.paths["root"], "cache")))
        storage.delete(self.paths, "instruments", hooks=hooks)
        storage.delete(self.paths, "downloads", "kick_fs", hooks=hooks)
        self.assertEqual(removed, ["piano_fluid", "kick_fs"])
        with self.assertRaises(ValueError):
            storage.delete(self.paths, "mine", hooks=hooks)
        storage.delete(self.paths, "mine", "myclap", hooks=hooks)
        with self.assertRaises(KeyError):
            storage.delete(self.paths, "downloads", "../../etc", hooks=hooks)
        storage.delete(self.paths, "stems", "song-1")
        self.assertFalse(os.path.exists(os.path.join(self.paths["stems"], "song-1")))
        storage.delete(self.paths, "audiotools")
        self.assertFalse(os.path.exists(os.path.join(self.paths["tools"], "venv")))
        self.assertFalse(os.path.exists(os.path.join(self.paths["tools"], "ready-v2")))
        with self.assertRaises(KeyError):
            storage.delete(self.paths, "learning")


if __name__ == "__main__":
    unittest.main()
