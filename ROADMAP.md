# Roadmap

Ideas and next steps for Tidal Studio, roughly in priority order.

## Visual controls in the chat (agentic UI): first version done, next steps

**Done (v1):** Maestro shows controls **inside its chat messages** and every control writes real Tidal code while you use it
(the grey code line under each control changes live). A «Restore» button goes back to how it was.

- Tempo slider (`setcps (BPM/60/4)`), parameter sliders (`# gain`, `# lpf` (log scale), `# hpf`, `# room`, `# size`,
  `# delay`…, `# pan`, `# speed`, `# crush`, `# shape`, `# legato`, `# resonance`, `# coarse`).
- Sound selector that keeps the rhythm (`s "bd ~ bd"` → `s "808bd ~ 808bd"`), with built-in and your own samples.
- Step sequencer (8 or 16 steps, several rows) that reads and writes the mini-notation.
- With AI: Maestro returns a `controles` field (`deslizador`, `bpm`, `selector`, `pasos`); the app validates it.
  Without AI: the «Controls» button on each track, the «Tweak with controls» chip, or asking for controls.

**Done (v2):** moving filter, Euclidean rhythms, scale/octave, chords, `every`, chance (`degradeBy`, `sometimesBy`),
`swingBy`, and a mix desk for all tracks.

**Next:**

- Edit notes by dragging them in the Timeline (today it shows them, read-only); `whenmod` and `fast`/`slow` controls.

## Also planned

- Real-machine testing of the installers on macOS and Windows, and of every catalog pattern on real TidalCycles
  (sound, recording, sample reloading in SuperDirt).
- Test Freesound search with a real API key.
- Blocks view: edit by dragging (reorder steps, drop a setting onto a sound, drag a sample from the library onto a block).
- Mixer: level meters per track (needs an RMS reply from SuperDirt).

## Done

- Base-project wizard, brainstorm wizard, style recipes, pre-listen, My projects.
- English/Spanish interface; Maestro replies in the chosen language.
- Code help: per-track «Help» with offline checks and AI fixes, before/after and revert to the last version that worked.
- Code palette: blocks organized by goal (rhythm, sound, notes, effects, time, chance) and level, with undo.
- Blocks view: the song as nested blocks (tracks, transforms, steps of the cycle, settings), click to explain.
- Blocks view editing: tooltip on the selected block to change steps, mini-notation, settings, transformation numbers, tempo.
- Configurator card in Maestro's chat (any track or the whole song), always on the current version.
- Mix tab: volume in dB and 3-band EQ per track and master (`# amp`, `# eqlow/eqmid/eqhigh`, studio_eq SuperDirt module), mute, solo.
- Undo/redo and song history (rollback); clear Maestro's chat.
- Sample library: built-in sounds by type, your own uploads, Freesound search with license filter and automatic credits, packs.
- GitHub: save each version as a commit, browse history, open old versions.
- Online packs: browse, listen to and install sounds from community packs with a strudel.json index (Tidal Drum Machines, Uzu, VCSL, Salamander piano, SP-12, mridangam, or any github:user/repo).
- Agentic UI v1: sliders, tempo, sound selector and step sequencer inside Maestro's messages.
- Agentic UI v2: every, chance, swing, Euclidean, moving filter, scale/octave, chords, mix desk.
- Arrangement timeline: paint `mask` patterns across bars, with presets (layers, drop, break, call and response).
- Timeline tab: every hit of every track on a bars-and-beats grid (piano roll for melodies), calculated by Tidal's `queryArc`, each hit linked to the code that makes it, with a moving playhead.
- Export: `.tidal` download, shareable song links, recording to WAV.
- Samples: waveform view and trimming (`# begin` / `# end`).
- Bilingual installers (English/Spanish, by system language or `--lang`).
- Interactive beginner tutorial (21 steps, waits for each action).
- Illustrated instruments: clickable drum kit; piano, bass, guitar, sax, trumpet, marimba, kalimba with an on-screen keyboard.
- An icon for every component; compact component families.
- Claude with your Pro/Max subscription through the Claude Code CLI (no API key).
