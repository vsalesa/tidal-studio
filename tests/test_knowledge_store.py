"""Pruebas de 0.21 «índice persistente de skills»: SQLite FTS5 que sobrevive a un reinicio, solo reindexa lo que
cambia, borra lo que desaparece, no deja ver skills apagadas ni en cuarentena (tampoco con «mas_skills»), escapa la
sintaxis FTS5, no lee fuera de la carpeta de la skill, se recupera de una base rota y, sin FTS5, Maestro usa la
búsqueda de la 0.20. También: los plugins de la app (my-plugins/) se indexan, sin depender de Claude Code global.
Ejecuta: python3 -m unittest discover tests"""
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import knowledge_retrieve as kr  # noqa: E402
import knowledge_store as ks  # noqa: E402
import plugins  # noqa: E402
import skills  # noqa: E402

FILLER = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " * 6


def _skill(base, name, body, desc, refs=None):
    d = os.path.join(base, name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "SKILL.md"), "w") as f:
        f.write(f"---\nname: {name}\ndescription: {desc}\n---\n{body}\n")
    for rel, text in (refs or {}).items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)
    return d


class KnowledgeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = (plugins.PLUGIN_DIR, skills.BUILTIN_DIR, skills.USER_DIR)
        plugins.PLUGIN_DIR = os.path.join(self.tmp, "my-plugins")
        skills.BUILTIN_DIR = os.path.join(self.tmp, "skills")
        skills.USER_DIR = os.path.join(self.tmp, "mine")
        self.db = os.path.join(self.tmp, "data", "maestro-knowledge.sqlite")
        ks.configure(self.db)
        self.salsa = _skill(skills.BUILTIN_DIR, "salsa-book", "Salsa arranging notes.\n# Salsa\nIntro to salsa.\n"
                            "## Bass tumbao\nThe bass anticipates beat 3 and 4, avoid playing on beat 1 unless the band hits.\n" + FILLER +
                            "\n## Common mistakes\nNever cross the clave: piano montuno and bass must agree with the 2-3 clave.\n"
                            "\n## Horns\nMambo section with trumpets.\n" + FILLER,
                            "Salsa: tumbao, montuno, clave, horns",
                            {"references/piano.md": "# Piano\n## Montuno\nThe montuno locks with the clave and the tumbao.\n" + FILLER})
        self.cfg = {"skills": {}}

    def tearDown(self):
        ks.close()
        ks._STATE["checked"] = 0.0
        plugins.PLUGIN_DIR, skills.BUILTIN_DIR, skills.USER_DIR = self.old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def select(self, q, **kw):
        ks._STATE["checked"] = 0.0
        return skills.select(self.cfg, q, **kw)

    def test_persists_and_only_changed_files_reindex(self):
        r = skills.ensure_index(self.cfg, force=True)
        self.assertEqual(r["changed"], 2)
        gen = ks.generation()
        ks.close()                                   # «reinicio» de la app
        ks._STATE["checked"] = 0.0
        r = skills.ensure_index(self.cfg)
        self.assertEqual((r["changed"], r["removed"]), (0, 0))
        self.assertEqual(ks.generation(), gen)
        time.sleep(0.01)
        with open(os.path.join(self.salsa, "references", "piano.md"), "a") as f:
            f.write("\n## Voicings\nOpen voicings in the montuno.\n")
        ks._STATE["checked"] = 0.0
        r = skills.ensure_index(self.cfg)
        self.assertEqual(r["changed"], 1)            # solo el archivo que cambió
        self.assertEqual(ks.generation(), gen + 1)
        _, loaded, text = self.select("open voicings en el montuno")
        self.assertIn("Open voicings in the montuno", text)

    def test_deleted_and_renamed_files_leave_no_stale_hits(self):
        skills.ensure_index(self.cfg, force=True)
        os.rename(os.path.join(self.salsa, "references", "piano.md"), os.path.join(self.salsa, "references", "keys.md"))
        _, _, text = self.select("montuno que encaje con la clave")
        self.assertNotIn("references/piano.md", text)
        self.assertIn("references/keys.md", text)
        shutil.rmtree(self.salsa)
        _, loaded, text = self.select("montuno que encaje con la clave")
        self.assertEqual(loaded, [])
        self.assertEqual(ks.status()["sections"], 0)

    def test_parent_and_exceptions_travel_with_the_child(self):
        _, loaded, text = self.select("mejora el tumbao del bajo", genre="salsa")
        tr = loaded[0]["trace"]
        bass = next(t for t in tr if t["heading"].endswith("Bass tumbao"))
        self.assertIn("exceptions", bass["reason"])
        self.assertIn("Never cross the clave", text)                    # hermana «Common mistakes» va con el hijo
        _, _, child = self.select("mejora el tumbao del bajo", genre="salsa", child_only=True)
        self.assertNotIn("Excepciones y errores", child)

    def test_disabled_and_quarantined_are_never_sent(self):
        self.cfg["skills"]["disabled"] = ["salsa-book"]
        _, loaded, text = self.select("tumbao montuno clave")
        self.assertEqual(loaded, [])
        got, extra = skills.sections_for(self.cfg, ["salsa-book:SKILL.md#Bass tumbao", "§1", "id:2"])
        self.assertEqual((got, extra), ([], ""))
        self.cfg["skills"]["disabled"] = []
        # cuarentena: un archivo incluido que no coincide con el manifiesto
        man = {"schema_version": 1, "files_root": "skills", "skills": [{"folder": "salsa-book", "files": [
            {"path": "salsa-book/SKILL.md", "sha256": "0" * 64}]}]}
        with open(os.path.join(skills.BUILTIN_DIR, "BUNDLE-MANIFEST.json"), "w") as f:
            json.dump(man, f)
        sk = next(s for s in skills.scan(self.cfg) if s["name"] == "salsa-book")
        self.assertIn("no coincide", sk["quarantine"])
        _, loaded, _ = self.select("tumbao montuno clave")
        self.assertEqual(loaded, [])

    def test_mas_skills_by_id_and_by_title(self):
        _, loaded, text = self.select("tumbao")
        sid = next(t["id"] for t in loaded[0]["trace"])
        got, extra = skills.sections_for(self.cfg, [f"§{sid}", "salsa-book#horns", "salsa-book:references/../../etc#x"])
        self.assertEqual(len(got), 2)
        self.assertIn("Mambo section", extra)
        self.assertNotIn("/etc", extra)

    def test_fts_syntax_is_escaped(self):
        for q in ['tumbao" OR body:*', "NEAR(clave montuno)", "bass AND -kick ^", '"""', "*"]:
            _, _, text = self.select(q)
            self.assertIsInstance(text, str)
        self.assertEqual(ks.match_expr(['tumbao"', "OR", "x*"]), '"tumbao"*')

    def test_symlink_and_traversal_are_not_read(self):
        outside = os.path.join(self.tmp, "secret.md")
        with open(outside, "w") as f:
            f.write("# Secret\nSECRET-TOKEN tumbao\n")
        os.symlink(outside, os.path.join(self.salsa, "references", "evil.md"))
        _, _, text = self.select("secret tumbao")
        self.assertNotIn("SECRET-TOKEN", text)
        self.assertIsNone(ks.safe_path(self.salsa, "../secret.md"))
        self.assertIsNone(ks.safe_path(self.salsa, "/etc/passwd"))

    def test_broken_database_is_rebuilt(self):
        skills.ensure_index(self.cfg, force=True)
        ks.close()
        with open(self.db, "wb") as f:
            f.write(b"this is not sqlite" * 100)
        for extra in ("-wal", "-shm"):
            if os.path.exists(self.db + extra):
                os.remove(self.db + extra)
        _, loaded, text = self.select("tumbao")
        self.assertTrue(loaded)
        self.assertTrue(any(n.startswith("maestro-knowledge.sqlite.broken-") for n in os.listdir(os.path.dirname(self.db))))

    def test_without_fts5_falls_back_to_020(self):
        ks.close()
        with mock.patch.object(ks, "fts_support", lambda: (False, False, "3.0")):
            _, loaded, text = self.select("tumbao del bajo")
            self.assertEqual(skills.last_meta()["engine"], "bm25")
            self.assertIn("SQLite", skills.last_meta()["fallback"])
            self.assertTrue(loaded)
        ks.close()

    def test_old_sqlite_without_contentless_delete_rebuilds(self):
        ks.close()
        with mock.patch.object(ks, "fts_support", lambda: (True, False, "3.40")):
            skills.ensure_index(self.cfg, force=True)
            with open(os.path.join(self.salsa, "SKILL.md"), "a") as f:
                f.write("\n## Coro\nCoro y pregón alternan.\n")
            ks._STATE["checked"] = 0.0
            _, _, text = self.select("coro pregon")
            self.assertIn("Coro y pregón alternan", text)
        ks.close()

    def test_app_plugins_are_indexed_without_global_claude(self):
        # Tu plugin vive en my-plugins/ (lo descarga la app): se indexa igual que lo incluido
        plug = os.path.join(plugins.PLUGIN_DIR, "music-composition")
        os.makedirs(os.path.join(plug, ".claude-plugin"))
        with open(os.path.join(plug, ".claude-plugin", "plugin.json"), "w") as f:
            f.write('{"name": "music-composition", "version": "1.0.0"}')
        _skill(os.path.join(plug, "skills"), "mc-style-latin-bachata", "# Bachata\n## Requinto\nThe requinto answers the voice.\n",
               "Bachata: requinto, bongo, guira")
        with mock.patch.dict(os.environ, {"HOME": os.path.join(self.tmp, "no-home")}):
            _, loaded, text = self.select("requinto de bachata")
        self.assertIn("The requinto answers the voice", text)
        st = ks.status()
        self.assertIn("plugin:music-composition:mc-style-latin-bachata", [s["source_id"] for s in st["sources"]])

    def test_skip_headings_are_indexed_but_not_sent(self):
        man = {"schema_version": 1, "files_root": "skills", "skills": [{"folder": "salsa-book", "skip_headings": ["Horns"],
               "files": [{"path": f"salsa-book/{r}", "sha256": skills._sha256(os.path.join(self.salsa, r))}
                         for r in ("SKILL.md", "references/piano.md")]}]}
        with open(os.path.join(skills.BUILTIN_DIR, "BUNDLE-MANIFEST.json"), "w") as f:
            json.dump(man, f)
        _, _, text = self.select("horns mambo trumpets")
        self.assertNotIn("Mambo section with trumpets", text)
        src = next(s for s in ks.status()["sources"] if s["source_id"] == "builtin:salsa-book")
        self.assertGreaterEqual(src["skipped"], 1)

    def test_aliases_spanish_to_english(self):
        a = kr.analyze("el estribillo con un bajo anticipado al final")
        flat = [w for g in a["gq"] for w in g]
        for w in ("chorus", "anticipation", "ending"):
            self.assertIn(w, flat)
        self.assertNotIn("final", flat)                       # «al final» no es «final chorus»
        self.assertIn("merengue", [w for g in kr.analyze("una marcha", genre="merengue")["gq"] for w in g])
        self.assertNotIn("merengue", [w for g in kr.analyze("una marcha")["gq"] for w in g])


if __name__ == "__main__":
    unittest.main()
