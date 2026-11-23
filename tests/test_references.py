"""Pruebas de los ejemplos de baterista real (server/references.py). Ejecuta: python3 -m unittest discover tests"""
import io
import os
import shutil
import struct
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import references  # noqa: E402
from songimport import parse_midi  # noqa: E402

PPQ = 480
MEMBER = "drummer1/session1/79_latin-reggaeton_90_beat_4-4.mid"


def varlen(v):
    out = [v & 0x7F]
    v >>= 7
    while v:
        out.insert(0, (v & 0x7F) | 0x80)
        v >>= 7
    return bytes(out)


def midi_bytes(notes):
    """notes: (tick, pitch, vel). Una pista en el canal 10, cada golpe dura una semicorchea."""
    ev = []
    for t, p, v in notes:
        ev.append((t, 0x99, p, v))
        ev.append((t + PPQ // 4, 0x89, p, 0))
    ev.sort()
    body, last = bytearray(b"\x00\xff\x51\x03" + (666667).to_bytes(3, "big")), 0
    for t, st, p, v in ev:
        body += varlen(t - last) + bytes([st, p, v])
        last = t
    body += b"\x00\xff\x2f\x00"
    return b"MThd" + struct.pack(">IHHH", 6, 0, 1, PPQ) + b"MTrk" + struct.pack(">I", len(body)) + bytes(body)


def dembow(bars=4, early=0):
    """Bombo en los 4 tiempos, aro en el dembow (adelantado `early` ticks), charles en corcheas con acento en el «y»."""
    s16 = PPQ // 4
    n = []
    for b in range(bars):
        o = b * 4 * PPQ
        n += [(o + k * PPQ, 36, 90) for k in range(4)]
        n += [(o + k * s16 - early, 37, 100) for k in (3, 6, 11, 14)]
        n += [(o + k * 2 * s16, 42, 110 if k % 2 else 50) for k in range(8)]
    return midi_bytes(n)


class FakeResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class ReferencesTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("groove/" + MEMBER, dembow(early=20))
        self.zip = buf.getvalue()
        self.calls = 0

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def opener(self, req, timeout=None):
        self.calls += 1
        return FakeResp(self.zip)

    def test_downloads_once_and_converts(self):
        ref = {"file": MEMBER, "start": 0, "bars": 2, "sounds": {"kick": "808bd:3"}}
        a = references.example(self.root, ref, "en", 92, opener=self.opener)
        b = references.example(self.root, ref, "en", 92, opener=self.opener)
        self.assertEqual(self.calls, 1)  # la segunda vez usa el zip ya descargado
        self.assertEqual(a["tracks"], b["tracks"])
        self.assertIn("CC BY 4.0", a["credit"]["text"])
        ids = [t["id"] for t in a["tracks"]]
        self.assertEqual(ids, ["d9", "d10", "d11"])  # bombo, aro y charles; sin pisar d1..d8 del curso
        kick, rim, hats = (t["codigo"] for t in a["tracks"])
        self.assertTrue(kick.startswith('s "[808bd:3 ~ ~ ~ 808bd:3'))
        self.assertIn('s "[~ ~ ~ rm ~ ~ rm ~ ~ ~ ~ rm ~ ~ rm ~]"', rim)
        # el acento del charles en el «y» sobrevive como gain
        gains = hats.split('# gain "')[1].split('"')[0].strip("[]").split()
        self.assertLess(float(gains[0]), float(gains[2]))
        self.assertTrue(all(t["tipo"] == "percusion" for t in a["tracks"]))

    def test_shared_offset_removed_but_feel_kept(self):
        midi = parse_midi(dembow(bars=1, early=20))
        out = references.to_tracks(midi, MEMBER, 0, 1, steps=16, bpm=90)
        rim = next(t for t in out["tracks"] if t["group"] == "snare")["codigo"]
        nudges = [float(x) for x in rim.split('# nudge "')[1].split('"')[0].strip("[]").split()]
        self.assertTrue(all(-0.03 < x < 0 for x in (nudges[3], nudges[6], nudges[11], nudges[14])))
        kick = next(t for t in out["tracks"] if t["group"] == "kick")["codigo"]
        self.assertNotIn("nudge", kick)  # el bombo va a tempo: nada que mover

    def test_triplet_grid_for_swing(self):
        trip = PPQ // 3
        notes = []
        for b in range(2):
            o = b * 4 * PPQ
            notes += [(o, 51, 100), (o + PPQ, 51, 90), (o + PPQ + 2 * trip, 51, 60), (o + 2 * PPQ, 51, 100),
                      (o + 3 * PPQ, 51, 90), (o + 3 * PPQ + 2 * trip, 51, 60), (o + PPQ, 44, 80), (o + 3 * PPQ, 44, 80)]
        midi = parse_midi(midi_bytes(notes))
        self.assertEqual(references.best_grid(midi, 0, 2), 12)
        out = references.to_tracks(midi, "drummer10/session1/1_jazz-swing_124_beat_4-4.mid", 0, 2)
        self.assertEqual(out["steps"], 12)

    def test_slow_and_max_tracks(self):
        midi = parse_midi(dembow(bars=1))
        out = references.to_tracks(midi, MEMBER, 0, 1, slow=2)
        self.assertTrue(all(t["codigo"].startswith("slow 2 $ ") for t in out["tracks"]))
        self.assertLessEqual(len(references.GROUPS), 4)  # d9..d12 como mucho

    def test_rejects_paths_outside_dataset(self):
        for bad in ("../../etc/passwd", "drummer1/../x.mid", "/abs/file.mid", "drummer1/session1/x.wav"):
            with self.assertRaises(references.RefError):
                references.example(self.root, {"file": bad}, opener=self.opener)
        self.assertEqual(self.calls, 0)

    def test_bad_download(self):
        with self.assertRaises(references.RefError):
            references.example(self.root, {"file": MEMBER}, opener=lambda req, timeout=None: FakeResp(b"<html>nope"))
        self.assertFalse(os.path.exists(references.zip_path(self.root)))


if __name__ == "__main__":
    unittest.main()


class StyleProfilesTest(unittest.TestCase):
    def test_profiles_reach_maestro(self):
        import assistant
        import styleprofiles
        for g in ("merengue", "salsa", "cumbia", "bossa", "reggaeton"):
            self.assertIn("PERFIL MEDIDO", styleprofiles.text_for(g), g)
        self.assertEqual(styleprofiles.genre_in("Reguetón desde cero"), "reggaeton")
        txt = assistant.session_summary({"bpm": 140, "tracks": [], "curso": {"nombre": "Merengue", "ejemplo_del_alumno": "Mi canción"}})
        self.assertIn("PERFIL MEDIDO DE MERENGUE", txt)
        self.assertIn("Mi canción", txt)
        self.assertNotIn("PERFIL MEDIDO", assistant.session_summary({"bpm": 124, "tracks": [], "style": "house"}))

    def test_profiles_hold_statistics_only(self):
        import json
        import styleprofiles
        data = json.load(open(styleprofiles.PATH, encoding="utf-8"))
        for g, p in data.items():
            for role in (p.get("roles") or {}).values():
                self.assertEqual(len(role["onsets"]), 16)
                self.assertTrue(all(set(r["grid"].split()) <= {"x", "."} for r in role["rhythms"]))
            self.assertNotIn("notes", json.dumps(p).replace("notes_per_hit", ""))  # ninguna nota de ninguna canción
