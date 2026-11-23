"""Pruebas del teclado MIDI (server/midilive.py): de las notas que tocas a pistas de Tidal.
Ejecuta: python3 -m unittest discover tests"""
import base64
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import midilive  # noqa: E402
import songimport  # noqa: E402
import virtual_midi  # noqa: E402


def events_from_phrase(bpm=100, bars=4, t0=1000.0, pedal=False):
    beat = 60.0 / bpm
    ev = [{"t": t0 + t * beat, "type": k, "note": n, "vel": v, "ch": 0} for t, k, n, v in virtual_midi.phrase(bars)]
    if pedal:
        for b in range(bars):
            ev += [{"t": t0 + (b * 4 + 0.05) * beat, "type": "pedal", "note": 64, "vel": 127},
                   {"t": t0 + (b * 4 + 3.9) * beat, "type": "pedal", "note": 64, "vel": 0}]
    return ev


class FakeEngine:
    osc_ready = False

    def __init__(self, clock=None):
        self.clock = clock
        self.sent = []

    def sc_cmd(self, *args):
        self.sent.append(args)
        return True

    def song_clock(self, max_age=2.5):
        return self.clock


class PairTest(unittest.TestCase):
    def test_on_off(self):
        n = midilive.pair_notes([{"t": 1, "type": "on", "note": 60, "vel": 90}, {"t": 2, "type": "off", "note": 60, "vel": 0}])
        self.assertEqual(n, [(1.0, 2.0, 60, 90, 0)])

    def test_pedal_holds_until_release(self):
        ev = [{"t": 0, "type": "pedal", "note": 64, "vel": 127}, {"t": 1, "type": "on", "note": 60, "vel": 90},
              {"t": 1.2, "type": "off", "note": 60, "vel": 0}, {"t": 3, "type": "pedal", "note": 64, "vel": 0}]
        self.assertEqual(midilive.pair_notes(ev)[0][1], 3.0)

    def test_retrigger_and_hanging(self):
        ev = [{"t": 1, "type": "on", "note": 60, "vel": 90}, {"t": 1.5, "type": "on", "note": 60, "vel": 80}]
        n = midilive.pair_notes(ev, end=4)
        self.assertEqual([(a, b) for a, b, *_ in n], [(1.0, 1.5), (1.5, 4)])

    def test_note_on_velocity_zero_is_off(self):
        ev = [{"t": 1, "type": "on", "note": 62, "vel": 90}, {"t": 1.4, "type": "on", "note": 62, "vel": 0}]
        self.assertEqual(midilive.pair_notes(ev)[0][1], 1.4)


class TranslateTest(unittest.TestCase):
    def test_hands_key_and_chords(self):
        r = midilive.translate(events_from_phrase(), 100, lang="en")
        self.assertEqual([t["nombre"] for t in r["tracks"]], ["Left hand", "Right hand"])
        self.assertEqual(r["bars"], 4)
        self.assertEqual(r["grid"], 8)
        self.assertEqual(r["summary"]["key"]["name"], "C")
        self.assertEqual(r["summary"]["progression"], ["C", "Am", "F", "G"])
        left, right = r["tracks"]
        self.assertTrue(left["codigo"].startswith('note "<[c4,e4,g4]*2 [a3,c4,e4]*2'), left["codigo"])
        self.assertIn('e6 g6 f6 e6 c6', right["codigo"])
        self.assertIn('# s "superpiano"', right["codigo"])

    def test_one_track_and_sound(self):
        r = midilive.translate(events_from_phrase(), 100, split="none", sound="ts_rhodes", lang="es")
        self.assertEqual(len(r["tracks"]), 1)
        self.assertEqual(r["tracks"][0]["nombre"], "Mi frase")
        self.assertIn('# s "ts_rhodes"', r["tracks"][0]["codigo"])

    def test_midi_roundtrip(self):
        r = midilive.translate(events_from_phrase(), 100)
        midi = songimport.parse_midi(base64.b64decode(r["midi_b64"]))
        self.assertEqual(sum(len(t["notes"]) for t in midi["tracks"]), r["notes"])
        self.assertAlmostEqual(60_000_000 / midi["tempos"][0][1], 100, places=0)

    def test_pickup_note_before_one(self):
        # una anacrusa: la primera nota medio pulso antes del «uno» marcado
        ev = events_from_phrase(bars=1, t0=10.0) + [{"t": 9.7, "type": "on", "note": 67, "vel": 90}, {"t": 9.95, "type": "off", "note": 67, "vel": 0}]
        r = midilive.translate(ev, 100, t0=10.0)
        self.assertEqual(r["bars"], 2)

    def test_leading_silence_dropped(self):
        r = midilive.translate(events_from_phrase(bars=1, t0=20.0), 100, t0=20.0 - 2 * 2.4)
        self.assertEqual(r["bars"], 1)

    def test_rotation_follows_song_cycle(self):
        # La toma empezó en el ciclo 37: en «<a b c d>» Tidal toca el elemento 37 mod 4 = 1 en ese ciclo
        r0 = midilive.translate(events_from_phrase(t0=50.0), 100, t0=50.0, cycle0=36, split="none")
        r1 = midilive.translate(events_from_phrase(t0=50.0), 100, t0=50.0, cycle0=37, split="none")
        self.assertEqual(r1["rotation"], 1)
        bars0 = r0["tracks"][0]["codigo"].split('"')[1]
        bars1 = r1["tracks"][0]["codigo"].split('"')[1]
        self.assertNotEqual(bars0, bars1)
        self.assertTrue(bars1.startswith("<[[g3,b3,d4"), bars1)  # el último compás (G) va primero

    def test_triplets_only_when_clearly_better(self):
        bar = 2.4
        ev = []
        for i in range(12):  # tresillos de corchea exactos
            t = 5 + i * bar / 12
            ev += [{"t": t, "type": "on", "note": 72, "vel": 90}, {"t": t + 0.1, "type": "off", "note": 72, "vel": 0}]
        self.assertEqual(midilive.translate(ev, 100, t0=5)["grid"], 12)

    def test_drums_on_channel_10(self):
        ev = []
        for i, n in enumerate([36, 42, 38, 42] * 2):
            ev += [{"t": i * 0.3, "type": "on", "note": n, "vel": 100, "ch": 9}, {"t": i * 0.3 + 0.1, "type": "off", "note": n, "vel": 0, "ch": 9}]
        r = midilive.translate(ev, 100)
        self.assertEqual(r["tracks"][0]["tipo"], "percusion")
        self.assertTrue(r["tracks"][0]["codigo"].startswith('s "'), r["tracks"][0]["codigo"])

    def test_empty(self):
        self.assertTrue(midilive.translate([], 120)["empty"])


class HubTest(unittest.TestCase):
    def test_web_note_plays_in_supercollider(self):
        eng = FakeEngine()
        hub = midilive.MidiHub(eng)
        hub.web_note("on", 60, 100)
        self.assertIn(("midinote", "60", "100"), eng.sent)
        hub.set_settings({"play": False})
        hub.web_note("on", 62, 100)
        self.assertNotIn(("midinote", "62", "100"), eng.sent)

    def test_osc_and_record_take(self):
        hub = midilive.MidiHub(FakeEngine())
        hub.on_osc("/ts/mididevs", ["Casio · USB MIDI"])
        self.assertEqual(hub.state()["devices"], ["Casio · USB MIDI"])
        r = hub.record_start(100)
        for e in events_from_phrase(t0=r["now"] + 0.1):
            hub.add(e["type"], e["note"], e["vel"], t=e["t"])
        hub.record_stop()
        hub.rec["stop"] = r["now"] + 20
        res = hub.translate_take({"lang": "en"})
        self.assertEqual(res["bars"], 4)
        self.assertFalse(res["synced"])

    def test_record_syncs_to_playing_song(self):
        import time
        now = time.time()
        hub = midilive.MidiHub(FakeEngine(clock=(0.5, now - 0.6, 12.5)))  # 120 BPM: ahora va por el ciclo 12,8
        r = hub.record_start(90)
        self.assertTrue(r["synced"])
        self.assertEqual(r["bpm"], 120)
        self.assertEqual(r["cycle0"], 13)  # empieza en el siguiente ciclo
        self.assertAlmostEqual(r["t0"], now - 0.6 + 0.5 / 0.5, places=2)

    def test_capture_last_phrase(self):
        hub = midilive.MidiHub(FakeEngine())
        import time
        now = time.time()
        hub.add("on", 40, 90, t=now - 30); hub.add("off", 40, 0, t=now - 29.5)  # algo de antes, tras un silencio largo
        for e in events_from_phrase(t0=now - 10):
            hub.add(e["type"], e["note"], e["vel"], t=e["t"])
        r = hub.capture(100)
        self.assertTrue(r["ok"])
        res = hub.translate_take({"lang": "en"})
        self.assertNotIn("e2", " ".join(t["codigo"] for t in res["tracks"]))
        self.assertEqual(res["bars"], 4)


if __name__ == "__main__":
    unittest.main()
