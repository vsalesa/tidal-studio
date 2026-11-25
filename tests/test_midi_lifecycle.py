"""Enchufar, desenchufar, activar y desactivar el teclado MIDI, y el aviso de audio (0.13.0).
Ejecuta: python3 -m unittest discover tests"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import engine  # noqa: E402
import midilive  # noqa: E402


class FakeEngine:
    osc_ready = True

    def __init__(self):
        self.sent = []

    def sc_cmd(self, *args):
        self.sent.append(args)
        return True

    def song_clock(self, max_age=2.5):
        return None


PIANO = "Digital Piano · Port 1"


class MidiLifecycle(unittest.TestCase):
    def setUp(self):
        self.hub = midilive.MidiHub(FakeEngine())

    def held(self):
        h = set()
        for e in self.hub.state()["events"]:
            if e["type"] == "on":
                h.add(e["note"])
            elif e["type"] == "off":
                h.discard(e["note"])
        return h

    def test_unplug_releases_held_notes_and_pedal(self):
        self.hub.on_osc("/ts/midi", ["on", 60, 100, 0, PIANO])
        self.hub.on_osc("/ts/midi", ["on", 64, 100, 0, PIANO])
        self.hub.on_osc("/ts/midi", ["pedal", 64, 127, 0, PIANO])
        self.hub.on_osc("/ts/midiunplug", [PIANO])
        self.assertEqual(self.held(), set())
        evs = self.hub.state()["events"]
        self.assertEqual(evs[-1]["type"], "pedal")
        self.assertEqual(evs[-1]["vel"], 0)
        plugs = self.hub.state()["plugs"]
        self.assertEqual(plugs[-1]["name"], PIANO)
        self.assertFalse(plugs[-1]["added"])

    def test_unplug_other_keyboard_keeps_notes(self):
        self.hub.on_osc("/ts/midi", ["on", 60, 100, 0, PIANO])
        self.hub.on_osc("/ts/midiunplug", ["Other · Port"])
        self.assertEqual(self.held(), {60})

    def test_plug_is_reported(self):
        self.hub.on_osc("/ts/midiplug", [PIANO])
        self.assertTrue(self.hub.state()["plugs"][-1]["added"])

    def test_disable_sound_releases_everything(self):
        self.hub.on_osc("/ts/midi", ["on", 67, 100, 0, PIANO])
        self.hub.set_settings({"play": False})
        self.assertEqual(self.held(), set())

    def test_resending_same_settings_does_not_release(self):
        self.hub.set_settings({"device": "", "chan": -1, "play": True})
        self.hub.on_osc("/ts/midi", ["on", 67, 100, 0, PIANO])
        self.hub.set_settings({"device": "", "chan": -1, "play": True})
        self.assertEqual(self.held(), {67})

    def test_engine_restart_releases_and_rescans(self):
        self.hub.on_osc("/ts/midi", ["on", 72, 100, 0, PIANO])
        self.hub.on_engine_ready()
        self.assertEqual(self.held(), set())
        self.assertIn(("midiscan",), self.hub.engine.sent)


class MidiOut(unittest.TestCase):
    def setUp(self):
        self.hub = midilive.MidiHub(FakeEngine())

    def test_choose_output_and_sound(self):
        self.hub.set_settings({"out": PIANO, "outch": 2, "prog": 4})
        sent = self.hub.engine.sent
        self.assertIn(("midiout", PIANO), sent)
        self.assertIn(("midiprog", "2", "4"), sent)
        self.assertFalse(any(a[0] == "midiset" and a[1] in midilive.OUT_KEYS for a in sent))

    def test_output_comes_back_after_unplug(self):
        self.hub.set_settings({"out": PIANO})
        self.hub.on_osc("/ts/midiout", [PIANO])
        self.hub.on_osc("/ts/midiout", [""])  # desenchufado
        self.hub.engine.sent.clear()
        self.hub.on_osc("/ts/midiouts", [PIANO])
        self.assertIn(("midiout", PIANO), self.hub.engine.sent)

    def test_clock_only_with_output(self):
        self.hub.set_settings({"clock": True})
        self.assertEqual(self.hub.clock_code(True), [])
        self.hub.set_settings({"out": PIANO})
        lines = self.hub.clock_code(True)
        self.assertIn("midiClock*96", lines[0])
        self.assertIn('midicmd "start"', lines[1])


class AudioState(unittest.TestCase):
    def setUp(self):
        self.e = engine.Engine(ROOT)

    def test_reads_audio_lines(self):
        self.assertTrue(self.e._audio_line("TIDAL_STUDIO_AUDIO:\t48000\t0"))
        self.assertTrue(self.e._audio_line("TIDAL_STUDIO_AUDIO_DEVICES:MacBook Air Speakers\tZoom"))
        a = self.e.audio_state()
        self.assertEqual(a["rate"], 48000)
        self.assertEqual(a["inputs"], 0)
        self.assertEqual(a["devices"], ["MacBook Air Speakers", "Zoom"])
        self.assertEqual(a["problem"], "")

    def test_device_change_and_back(self):
        self.e._audio_line("TIDAL_STUDIO_AUDIO_DEVICES:MacBook Air Speakers")
        self.e._audio_line("TIDAL_STUDIO_AUDIO_DEVICES:MacBook Air Speakers\tDigital Piano")
        a = self.e.audio_state()
        self.assertEqual(a["problem"], "devices-changed")
        self.assertEqual(a["added"], ["Digital Piano"])
        self.e._audio_line("TIDAL_STUDIO_AUDIO_DEVICES:MacBook Air Speakers")
        self.assertEqual(self.e.audio_state()["problem"], "")

    def test_server_lost_and_rate_mismatch(self):
        self.e._audio_line("TIDAL_STUDIO_AUDIO_LOST")
        self.assertEqual(self.e.audio_state()["problem"], "server-lost")
        self.assertFalse(self.e._audio_line("ERROR: Mismatched sample rates are not supported"))
        self.assertEqual(self.e.audio_state()["problem"], "rate-mismatch")


class ScripsStayConsistent(unittest.TestCase):
    """El teclado suena en su propia orbit (la última, índice N) y SuperDirt arranca con N + 1 (0.25.1)."""

    def test_orbits(self):
        sd = open(os.path.join(ROOT, "supercollider", "start_superdirt.scd"), encoding="utf-8").read()
        mi = open(os.path.join(ROOT, "supercollider", "studio-midi.scd"), encoding="utf-8").read()
        self.assertIn("0 ! (~studioTracks + 1)", sd)
        self.assertIn('"TIDAL_STUDIO_TRACKS".getenv', sd)
        self.assertIn("orbit: ~studioTracks ? 12", mi)
        self.assertIn("\"midicut\"", sd)
        self.assertIn("~studioMidiWatch", mi)


if __name__ == "__main__":
    unittest.main()
