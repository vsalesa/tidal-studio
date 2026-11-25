"""0.25 «Tus datos a salvo»: carpeta de datos fuera del programa, copias de seguridad, canciones en archivo y una
actualización simulada de punta a punta (versión N → N+1 → N+2) que comprueba que no se pierde ni un byte.
Ejecuta: python3 -m unittest tests.test_user_data"""
import hashlib
import importlib
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "server"))
sys.path.insert(0, os.path.join(REPO, "packaging", "common"))


def _load(userdata):
    """paths/backup/songfiles leen la carpeta de datos al importarse: se recargan apuntando a una temporal."""
    os.environ["TIDAL_STUDIO_USERDATA"] = userdata
    os.environ.pop("TIDAL_STUDIO_DATA", None)
    import paths
    importlib.reload(paths)
    import backup
    importlib.reload(backup)
    import songfiles
    importlib.reload(songfiles)
    return paths, backup, songfiles


def _db(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    c = sqlite3.connect(path)
    c.execute("CREATE TABLE IF NOT EXISTS t (k TEXT PRIMARY KEY, v TEXT)")
    c.executemany("INSERT OR REPLACE INTO t VALUES (?, ?)", rows)
    c.commit()
    c.close()


def _rows(path):
    c = sqlite3.connect(path)
    try:
        return dict(c.execute("SELECT k, v FROM t").fetchall())
    finally:
        c.close()


def _write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode())


def _hashes(root, skip=()):
    out = {}
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in skip]
        for f in files:
            p = os.path.join(d, f)
            with open(p, "rb") as fh:
                out[os.path.relpath(p, root).replace(os.sep, "/")] = hashlib.sha256(fh.read()).hexdigest()
    return out


SONG = {"id": "p123", "name": "Mi Canción Ñ", "bpm": 96, "style": "reggae", "extra": "let x = 1",
        "tracks": [{"id": "d1", "name": "Bombo", "kind": "percusion", "code": 's "bd*4"', "muted": False,
                    "mix": {"gain": 0.9}, "lock": None}]}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ts-data-")
        self.old_env = {k: os.environ.get(k) for k in ("TIDAL_STUDIO_USERDATA", "TIDAL_STUDIO_DATA", "TIDAL_STUDIO_SAMPLES")}
        self.user = os.path.join(self.tmp, "data")
        self.paths, self.backup, self.songfiles = _load(self.user)

    def tearDown(self):
        for k, v in self.old_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestMigrate(Base):
    def legacy(self, root):
        _write(os.path.join(root, "config.json"), '{"provider": "claudecode"}')
        _write(os.path.join(root, "samples", ".gitkeep"), "")
        _write(os.path.join(root, "samples", "mi-bombo", "a.wav"), b"RIFF" + b"\0" * 64)
        _write(os.path.join(root, "my-skills", "mio", "SKILL.md"), "# mío")
        _write(os.path.join(root, "cache", "x.json"), "{}")
        _db(os.path.join(root, "maestro-data", "memory.db"), [("m1", "me gusta el reggae")])
        _db(os.path.join(root, "maestro-data", "sounds.db"), [("s1", "bombo grave")])
        _write(os.path.join(root, "maestro-data", "raro.txt"), "no sé qué es")

    def test_moves_everything_by_content_and_is_idempotent(self):
        legacy = os.path.join(self.tmp, "app")
        self.legacy(legacy)
        log = self.paths.migrate(legacy)
        self.assertTrue(log)
        P = self.paths
        self.assertTrue(os.path.isfile(P.CONFIG))
        self.assertEqual(_rows(P.MEMORY_DB), {"m1": "me gusta el reggae"})
        self.assertEqual(_rows(P.SOUNDS_DB), {"s1": "bombo grave"})
        self.assertTrue(os.path.isfile(os.path.join(P.SAMPLES, "mi-bombo", "a.wav")))
        self.assertTrue(os.path.isfile(os.path.join(P.MY_SKILLS, "mio", "SKILL.md")))
        self.assertTrue(os.path.isfile(os.path.join(self.user, "maestro-data-old", "raro.txt")))
        # Lo del repositorio se queda; lo tuyo ya no está dentro del programa
        self.assertTrue(os.path.isfile(os.path.join(legacy, "samples", ".gitkeep")))
        self.assertFalse(os.path.exists(os.path.join(legacy, "config.json")))
        self.assertFalse(os.path.exists(os.path.join(legacy, "maestro-data")))
        self.assertFalse(os.path.exists(os.path.join(legacy, "samples", "mi-bombo")))
        self.assertEqual(self.paths.migrate(legacy), [])
        self.assertTrue(self.paths.read_layout().get("migrated_at"))

    def test_never_overwrites_existing_data(self):
        legacy = os.path.join(self.tmp, "app")
        _write(os.path.join(legacy, "config.json"), "viejo")
        _write(self.paths.CONFIG, "nuevo")
        log = self.paths.migrate(legacy)
        with open(self.paths.CONFIG) as f:
            self.assertEqual(f.read(), "nuevo")
        self.assertTrue(os.path.isfile(os.path.join(legacy, "config.json")))  # no se borra lo que no se copió
        self.assertTrue(any(x.startswith("skip") for x in log))

    def test_source_run_inside_program(self):
        # Desde el código fuente, <datos> = <programa>/data: no hay nada que mover desde sí misma
        self.assertEqual(self.paths.migrate(self.user), [])


class TestBackup(Base):
    def seed(self):
        P = self.paths
        _write(P.CONFIG, '{"a": 1}')
        _db(P.MEMORY_DB, [("m1", "uno")])
        _db(P.SOUNDS_DB, [("s1", "x")])
        _db(P.SONGS_DB, [("i1", "índice")])  # vive dentro de songs/, junto a las carpetas de las canciones
        _write(os.path.join(P.MY_SKILLS, "mio", "SKILL.md"), "# skill")
        self.songfiles.write(SONG)

    def test_create_verify_and_contents(self):
        self.seed()
        b = self.backup.create("manual", "0.25.0")
        self.assertEqual(b["errors"], [])
        self.assertEqual(b["songs"], 1)
        self.assertTrue(b["memory"])
        self.assertEqual(self.backup.verify(b["id"]), [])
        listed = self.backup.list_all()
        self.assertEqual(listed[0]["id"], b["id"])
        # Una copia manipulada se detecta
        p = os.path.join(self.paths.BACKUPS, b["id"], "config.json")
        _write(p, '{"a": 2}')
        self.assertEqual(self.backup.verify(b["id"]), ["config.json"])

    def test_db_copy_is_consistent_while_open(self):
        self.seed()
        c = sqlite3.connect(self.paths.MEMORY_DB)
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("INSERT INTO t VALUES ('m2', 'en el WAL')")
        c.commit()  # sigue abierta: lo nuevo vive en -wal
        try:
            b = self.backup.create("manual")
        finally:
            c.close()
        self.assertEqual(_rows(os.path.join(self.paths.BACKUPS, b["id"], "memory", "memory.db")),
                         {"m1": "uno", "m2": "en el WAL"})

    def test_prune_keeps_last_five_and_pending(self):
        self.seed()
        ids = [self.backup.create(f"r{i}")["id"] for i in range(7)]
        left = [b["id"] for b in self.backup.list_all()]
        self.assertEqual(len(left), self.backup.KEEP)
        self.assertEqual(set(left), set(ids[-5:]))
        self.backup.schedule_restore(ids[-5])
        for i in range(3):
            self.backup.create(f"s{i}")
        self.assertIn(ids[-5], [b["id"] for b in self.backup.list_all()])

    def test_restore_applies_on_next_start_and_can_be_undone(self):
        self.seed()
        b = self.backup.create("manual")
        _db(self.paths.MEMORY_DB, [("m1", "cambiado"), ("m9", "nuevo")])
        _write(self.paths.CONFIG, '{"a": 99}')
        self.songfiles.write({**SONG, "id": "p999", "name": "Hecha después"})
        self.backup.schedule_restore(b["id"])
        r = self.backup.apply_pending("0.25.0")
        self.assertTrue(r["ok"], r)
        self.assertEqual(_rows(self.paths.MEMORY_DB), {"m1": "uno"})
        self.assertEqual(_rows(self.paths.SONGS_DB), {"i1": "índice"})
        with open(self.paths.CONFIG) as f:
            self.assertEqual(json.load(f), {"a": 1})
        # Las canciones hechas después no se borran
        self.assertEqual({s["projectId"] for s in self.songfiles.list_local()}, {"p123", "p999"})
        # Lo anterior quedó en otra copia
        before = r["before"]
        self.assertEqual(_rows(os.path.join(self.paths.BACKUPS, before, "memory", "memory.db")), {"m1": "cambiado", "m9": "nuevo"})
        self.assertIsNone(self.backup.read_pending())
        self.assertIsNone(self.backup.apply_pending())

    def test_damaged_backup_is_not_restored(self):
        self.seed()
        b = self.backup.create("manual")
        _write(os.path.join(self.paths.BACKUPS, b["id"], "memory", "memory.db"), b"basura")
        _db(self.paths.MEMORY_DB, [("m1", "actual")])
        self.backup.schedule_restore(b["id"])
        r = self.backup.apply_pending()
        self.assertFalse(r["ok"])
        self.assertEqual(_rows(self.paths.MEMORY_DB), {"m1": "actual"})

    def test_bad_ids_rejected(self):
        for bad in ("../etc", "", "x", "20261125T000000Z-../../a"):
            with self.assertRaises(ValueError):
                self.backup.schedule_restore(bad)

    def test_on_start_backs_up_only_when_version_changes(self):
        self.assertIsNone(self.backup.on_start("0.25.0"))  # sin datos: nada que copiar
        self.seed()
        made = self.backup.on_start("0.26.0")
        self.assertTrue(made and made["id"].endswith("before-0.26.0-from-0.25.0"), made)
        self.assertIsNone(self.backup.on_start("0.26.0"))


class TestSongFiles(Base):
    def test_write_load_rename_forget(self):
        sf = self.songfiles
        folder = sf.write(SONG)
        self.assertEqual(folder, "mi-cancion-n")
        d = os.path.join(self.paths.SONGS, folder)
        self.assertEqual(sorted(os.listdir(d)), ["README.md", "song.json", "song.tidal"])
        data = sf.load(folder)
        self.assertEqual(data["projectId"], "p123")
        self.assertEqual(data["extra"], "let x = 1")
        self.assertEqual(data["tracks"][0]["mix"], {"gain": 0.9})
        # Otra canción con el mismo nombre no pisa la primera
        self.assertEqual(sf.write({**SONG, "id": "p2"}), "mi-cancion-n-2")
        # Cambiar de nombre renombra su carpeta (y no crea otra)
        self.assertEqual(sf.write({**SONG, "name": "Otro Nombre"}), "otro-nombre")
        self.assertFalse(os.path.exists(d))
        self.assertEqual(len(sf.list_local()), 2)
        self.assertEqual(sf.forget("p123"), "otro-nombre")
        self.assertEqual([s["projectId"] for s in sf.list_local()], ["p2"])

    def test_ignores_empty_and_bad_names(self):
        self.assertIsNone(self.songfiles.write({"id": "p1", "tracks": []}))
        self.assertIsNone(self.songfiles.write({"tracks": [{"id": "d1", "code": "x"}]}))
        for bad in ("../x", "", "A B"):
            with self.assertRaises(ValueError):
                self.songfiles.load(bad)


class TestSimulatedUpdate(Base):
    """Instala la versión N (datos dentro del programa, como hasta la 0.24), crea datos, instala la N+1 con el
    lanzador de verdad, arranca (migración + copia) y comprueba byte a byte que todo sigue ahí. Luego la N+2."""

    def program(self, rt, version):
        app = os.path.join(rt, "app")
        shutil.rmtree(app, ignore_errors=True)
        _write(os.path.join(app, "server", "app.py"), f"# programa {version}")
        _write(os.path.join(app, "packaging", "VERSION"), version)
        _write(os.path.join(app, "samples", ".gitkeep"), "")
        # Cada instalador trae sus archivos con su propia fecha (el lanzador copia lo que cambia de tamaño o fecha)
        stamp = 1_700_000_000 + int(version.split(".")[1]) * 86400
        for d, _, fs in os.walk(app):
            for f in fs:
                os.utime(os.path.join(d, f), (stamp, stamp))

    def test_update_keeps_every_user_file(self):
        import launcher
        importlib.reload(launcher)
        rt, home = os.path.join(self.tmp, "rt"), os.path.join(self.tmp, "home")
        launcher.RT, launcher.APP = rt, os.path.join(home, "app")
        userdata = os.path.join(home, "data")
        self.paths, self.backup, self.songfiles = _load(userdata)
        app = launcher.APP

        # Versión N (0.24): todo vive dentro de la copia del programa
        self.program(rt, "0.24.0")
        launcher.sync_app()
        _write(os.path.join(app, "config.json"), '{"github": {"token": "x"}}')
        _write(os.path.join(app, "samples", "mio", "1.wav"), os.urandom(2048))
        _write(os.path.join(app, "recordings", "toma.wav"), os.urandom(512))
        _write(os.path.join(app, "my-plugins", "p", "plugin.json"), "{}")
        _write(os.path.join(app, "references", "groove.zip"), os.urandom(300))
        _db(os.path.join(app, "maestro-data", "memory.db"), [("m1", "recuerda esto")])
        _db(os.path.join(app, "maestro-data", "maestro.db"), [("s1", "índice")])
        _db(os.path.join(app, "maestro-data", "sounds.db"), [("x", "y")])
        _write(os.path.join(app, "maestro-data", "maestro-knowledge.sqlite"), os.urandom(100))
        mine = {k: v for k, v in _hashes(app).items() if not k.startswith(("server/", "packaging/")) and k != "samples/.gitkeep"}

        # Versión N+1 (0.25): el lanzador copia el programa nuevo SIN tocar lo tuyo…
        self.program(rt, "0.25.0")
        launcher.sync_app()
        after_sync = _hashes(app)
        for k, h in mine.items():
            self.assertEqual(after_sync.get(k), h, f"el lanzador cambió {k}")
        with open(os.path.join(app, "server", "app.py")) as f:
            self.assertEqual(f.read(), "# programa 0.25.0")

        # …y al arrancar, el servidor lo mueve a <datos> y hace una copia antes de abrir ninguna base
        self.paths.migrate(app)
        made = self.backup.on_start("0.25.0")
        self.assertIsNotNone(made)
        where = {"config.json": "config.json", "samples/mio/1.wav": "samples/mio/1.wav",
                 "recordings/toma.wav": "recordings/toma.wav", "my-plugins/p/plugin.json": "my-plugins/p/plugin.json",
                 "references/groove.zip": "references/groove.zip", "maestro-data/memory.db": "memory/memory.db",
                 "maestro-data/maestro.db": "songs/maestro.db", "maestro-data/sounds.db": "sounds/sounds.db",
                 "maestro-data/maestro-knowledge.sqlite": "knowledge/maestro-knowledge.sqlite"}
        self.assertEqual(set(where), set(mine))
        now = _hashes(userdata, skip=("backups",))
        for old, new in where.items():
            self.assertEqual(now.get(new), mine[old], f"{old} → {new} no es idéntico")
        self.assertEqual(self.backup.verify(made["id"]), [])
        self.assertEqual(_rows(self.paths.MEMORY_DB), {"m1": "recuerda esto"})

        # Ya no queda nada tuyo dentro del programa
        left = [k for k in _hashes(app) if not k.startswith(("server/", "packaging/"))]
        self.assertEqual(left, [])  # el lanzador nunca copia samples/ (ni su .gitkeep)

        # La 0.25 guarda una canción en archivo; la N+2 se instala encima
        self.songfiles.write(SONG)
        before = _hashes(userdata, skip=("backups",))
        self.program(rt, "0.26.0")
        launcher.sync_app()
        self.assertEqual(self.paths.migrate(app), [])
        made2 = self.backup.on_start("0.26.0")
        self.assertEqual(made2["songs"], 1)
        self.assertEqual(_hashes(userdata, skip=("backups",)) | {"layout.json": None},
                         before | {"layout.json": None})
        # El lanzador pasa la carpeta de datos al servidor
        self.assertEqual(launcher.server_env()["TIDAL_STUDIO_USERDATA"], launcher.USERDATA)


if __name__ == "__main__":
    unittest.main()
