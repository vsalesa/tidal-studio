"""Pruebas de 0.19 «memoria sincronizada con GitHub»: recuperar en otro ordenador, borrar en los dos sentidos,
cambios hechos en otro sitio, copia de la 0.18 sin uid, no perder nada en una instalación nueva e importar la
memoria de otra persona. GitHub se simula con un diccionario {ruta: texto}.
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
import github  # noqa: E402
SONG = {"name": "Mi cumbia", "bpm": 95, "style": "cumbia", "tracks": [
    {"id": "d1", "name": "Güiro", "kind": "percusion", "code": 's "guiro*8" # gain 0.8'},
    {"id": "d2", "name": "Bajo", "kind": "bajo", "code": 'note "a2 e3 a2 e3" # s "superfm" # lpf 800 # legato 0.7'}]}

F = "ts"


def sync(store, gh):
    """Lo mismo que hace app.backup_now, contra un GitHub de mentira."""
    remote, bad = store.parse_remote(dict(gh), F)
    plan = store.sync_plan(remote)
    store.apply_pull(plan, remote)
    files, delete, hashes = store.sync_files(F, remote)
    for d in delete:
        gh.pop(d, None)
    gh.update(files)
    store.mark_synced(hashes)
    return {(p["kind"], p["action"]) for p in plan}, bad


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.a = memory.Store(os.path.join(self.dir, "a.db"))   # tu ordenador de siempre
        self.b = memory.Store(os.path.join(self.dir, "b.db"))   # el ordenador nuevo
        self.gh = {}

    def tearDown(self):
        self.a.db.close()
        self.b.db.close()
        shutil.rmtree(self.dir, ignore_errors=True)

    def fill(self, s):
        s.add("El hi-hat siempre suave", "global", source="manual")
        s.add("Esta canción acaba con breakdown", "song", "p1", source="manual")
        s.save_style(memory.style_from_song(SONG))
        s.add_case({"problem": "El bajo pisa al bombo", "before": "n \"c2*4\"", "after": "n \"~ c2\"", "why": "respira"})

    def test_new_computer_recovers_everything(self):
        self.fill(self.a)
        self.a.add("dudosa", "global", source="chat", by="maestro")   # en la bandeja: no viaja
        sync(self.a, self.gh)
        acts, _ = sync(self.b, self.gh)
        self.assertEqual({a for _, a in acts}, {"pull"})
        self.assertEqual(sorted(m["text"] for m in self.b.memories("approved")),
                         ["El hi-hat siempre suave", "Esta canción acaba con breakdown"])
        self.assertEqual(self.b.memories("pending"), [])
        self.assertEqual([s["id"] for s in self.b.styles()], ["mi-cumbia"])
        self.assertEqual(self.b.cases()[0]["why"], "respira")
        self.assertIn("github", {e["by"] for e in self.b.log()})
        # Una segunda vuelta no cambia nada en ninguno de los dos
        self.assertEqual({a for _, a in sync(self.b, self.gh)[0]}, {"ok"})
        self.assertEqual({a for _, a in sync(self.a, self.gh)[0]}, {"ok"})
        self.assertTrue(all(v == "synced" for v in self.b.sync_states().values()))

    def test_fresh_install_does_not_wipe_github(self):
        self.fill(self.a)
        sync(self.a, self.gh)
        self.b.add("Lo nuevo del portátil", "global", source="manual")   # antes de la primera sincronización
        sync(self.b, self.gh)
        texts = [m["text"] for m in json.loads(self.gh[f"{F}/memories.json"])["memories"]]
        self.assertEqual(len(texts), 3)
        self.assertIn("Lo nuevo del portátil", texts)

    def test_deletes_travel_both_ways(self):
        self.fill(self.a)
        sync(self.a, self.gh)
        sync(self.b, self.gh)
        self.a.delete_style("mi-cumbia")
        mid = next(m["id"] for m in self.a.memories() if m["scope"] == "song")
        self.a.set_status(mid, "rejected")
        acts, _ = sync(self.a, self.gh)
        self.assertIn(("style", "delete_remote"), acts)
        self.assertNotIn(f"{F}/styles/mi-cumbia.json", self.gh)
        self.assertEqual(len(json.loads(self.gh[f"{F}/memories.json"])["memories"]), 1)
        acts, _ = sync(self.b, self.gh)
        self.assertIn(("style", "delete_local"), acts)
        self.assertEqual(self.b.styles(), [])
        self.assertEqual(len(self.b.memories("approved")), 1)
        # y se puede deshacer en el registro del ordenador nuevo
        e = next(e for e in self.b.log() if e["obj"] == "style" and e["action"] == "delete")
        self.b.revert(e["id"])
        self.assertEqual(len(self.b.styles()), 1)

    def test_edits_elsewhere_come_back(self):
        self.fill(self.a)
        sync(self.a, self.gh)
        sync(self.b, self.gh)
        mid = next(m["id"] for m in self.b.memories() if m["scope"] == "global")
        self.b.edit(mid, "El hi-hat suave y con swing")
        self.assertEqual(self.b.sync_states()["memory:" + self.b._row(mid)["uid"]], "changed")
        sync(self.b, self.gh)
        acts, _ = sync(self.a, self.gh)
        self.assertIn(("memory", "pull"), acts)
        self.assertIn("El hi-hat suave y con swing", [m["text"] for m in self.a.memories("approved")])

    def test_both_changed_keeps_this_computer(self):
        self.fill(self.a)
        sync(self.a, self.gh)
        sync(self.b, self.gh)
        ma = next(m for m in self.a.memories() if m["scope"] == "global")
        mb = next(m for m in self.b.memories() if m["scope"] == "global")
        self.a.edit(ma["id"], "Versión de A")
        self.b.edit(mb["id"], "Versión de B")
        sync(self.a, self.gh)
        acts, _ = sync(self.b, self.gh)
        self.assertIn(("memory", "both"), acts)
        self.assertIn("Versión de B", [m["text"] for m in json.loads(self.gh[f"{F}/memories.json"])["memories"]])

    def test_reads_018_backup_without_uids(self):
        self.a.add("aprobada", "global", source="manual")
        old = {f"{F}/memories.json": json.dumps({"version": 1, "memories": [
            {"id": 7, "scope": "global", "scope_key": "", "text": "aprobada", "text_en": "", "subject": "", "source": "manual", "evidence": 1},
            {"id": 8, "scope": "genre", "scope_key": "salsa", "text": "en salsa el piano en montuno", "source": "chat", "evidence": 2}]})}
        self.gh.update(old)
        acts, bad = sync(self.a, self.gh)
        self.assertEqual(bad, [])
        self.assertEqual(sorted(m["text"] for m in self.a.memories("approved")), ["aprobada", "en salsa el piano en montuno"])
        self.assertEqual(json.loads(self.gh[f"{F}/memories.json"])["version"], 2)

    def test_old_database_gets_uids(self):
        self.a.add("vieja", "global", source="manual")
        self.a.db.execute("UPDATE memories SET uid = NULL")
        self.a.db.commit()
        self.a.db.close()
        self.a = memory.Store(os.path.join(self.dir, "a.db"))
        self.assertTrue(self.a.memories()[0]["uid"])

    def test_share_with_another_person(self):
        self.fill(self.a)
        self.a.save_style(dict(memory.style_from_song(SONG), name="Otra"))
        sync(self.a, self.gh)
        remote, _ = self.b.parse_remote(self.gh, F)
        got = self.b.import_shared(remote, "victor")
        self.assertEqual(got, {"memories": 2, "cases": 1, "styles": 2, "skipped": 0})
        self.assertEqual(len(self.b.memories("pending")), 2)       # a la bandeja: decide quien importa
        self.assertEqual(self.b.memories("approved"), [])
        st = self.b.styles()[0]
        self.assertEqual((st["source"], st["author"]), ("imported", "victor"))
        self.assertNotIn("literal", st)                            # las notas de sus canciones no viajan
        self.assertEqual(self.b.import_shared(remote, "victor")["skipped"], 5)
        # Lo que aún está en la bandeja no se sube a TU GitHub
        files, _, _ = self.b.sync_files(F, {})
        self.assertEqual(json.loads(files[f"{F}/memories.json"])["memories"], [])


class GitHubSyncApiTest(unittest.TestCase):
    CFG = {"github": {"token": "t", "repo": "me/songs", "branch": "main"}}

    def test_commit_deletes_and_read_folder(self):
        calls = []

        def req(g, method, path, body=None, ok404=False):
            calls.append((method, path, body))
            if path.endswith("/git/ref/heads/main"):
                return {"object": {"sha": "h"}}
            if "/git/commits/h" in path:
                return {"tree": {"sha": "t0"}}
            if path.endswith("/git/trees"):
                return {"sha": "t1"}
            if path.endswith("/git/commits"):
                return {"sha": "c1"}
            if "/git/trees/main" in path:
                return {"tree": [{"type": "blob", "path": "ts/memories.json", "sha": "b1", "size": 10},
                                 {"type": "blob", "path": "songs/x/song.json", "sha": "b2", "size": 10}]}
            if path.endswith("/git/blobs/b1"):
                return {"content": "eyJhIjogMX0="}
            return {}
        with mock.patch.object(github, "_req", req):
            r = github.commit_files(self.CFG, {"ts/a.json": "{}"}, "m", delete=["ts/styles/old.json"])
            self.assertEqual(r["sha"], "c1")
            tree = next(b for m, p, b in calls if p.endswith("/git/trees"))["tree"]
            self.assertIn({"path": "ts/styles/old.json", "mode": "100644", "type": "blob", "sha": None}, tree)
            self.assertEqual(github.read_folder(self.CFG, "ts"), {"ts/memories.json": '{"a": 1}'})

        def empty(g, method, path, body=None, ok404=False):
            raise github.GitHubError("vacío", 409)
        with mock.patch.object(github, "_req", empty):
            self.assertEqual(github.read_folder(self.CFG, "ts"), {})

    def test_fetch_memory_links(self):
        seen = []

        def raw(url, token=""):
            seen.append(url)
            if "cases.json" in url:
                raise github.GitHubError("no", 404)
            return "{}"
        with mock.patch.object(github, "_raw_get", raw), \
                mock.patch.object(github, "_list_get", lambda url, token="": json.dumps([{"type": "file", "name": "a.json", "path": "tidal-studio/styles/a.json"}])):
            got = github.fetch_memory(self.CFG, "https://github.com/ana/musica")
            self.assertEqual(sorted(got), ["tidal-studio/memories.json", "tidal-studio/styles/a.json"])
            self.assertTrue(seen[0].endswith("/repos/ana/musica/contents/tidal-studio/memories.json"))
            github.fetch_memory(self.CFG, "https://github.com/ana/musica/tree/dev/copias")
            self.assertTrue(seen[-1].endswith("/repos/ana/musica/contents/tidal-studio/styles/a.json?ref=dev"))
            self.assertIn("/contents/copias/memories.json?ref=dev", seen[-3])
        with self.assertRaises(github.GitHubError):
            github.fetch_memory(self.CFG, "esto no")


if __name__ == "__main__":
    unittest.main()
