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

**Next:**

- **Moving filter** toggle that writes `# lpf (range a b $ slow n sine)`; Euclidean selector `bd(3,8)`.
- **Notes and harmony**: scale and chord selectors (`scale "minPent"`, `c'min7`), octave/transpose steppers, a small piano roll.
- **Time and structure**: selectors for `every`, `whenmod`, `mask "<t!8 f!8>"`, `swingBy`.
- **Chance**: probability sliders for `degradeBy`, `sometimesBy`.
- Controls that act on wrappers (`fast`, `every`) and on several tracks at once (a mix panel).

## Also planned

- Real-machine testing of the installers on macOS and Windows, and of every catalog pattern on real TidalCycles.
- Translate the installer messages (currently Spanish) to English.
- Song sections timeline: arrange `mask` patterns visually across bars.
- Export: record the song to audio (SuperCollider recording) and export the `.tidal` file.
- Shareable song links (code + BPM encoded in the URL).
- Samples: waveform view and trimming; drag a sample from the library onto a block in the Blocks view.
- Blocks view: edit by dragging (reorder steps, drop a setting onto a sound).

## Done

- Base-project wizard, brainstorm wizard, style recipes, pre-listen, My projects.
- English/Spanish interface; Maestro replies in the chosen language.
- Code help: per-track «Help» with offline checks and AI fixes, before/after and revert to the last version that worked.
- Code palette: blocks organized by goal (rhythm, sound, notes, effects, time, chance) and level, with undo.
- Blocks view: the song as nested blocks (tracks, transforms, steps of the cycle, settings), click to explain.
- Sample library: built-in sounds by type, your own uploads, Freesound search with license filter and automatic credits, packs.
- GitHub: save each version as a commit, browse history, open old versions.
- Online packs: browse, listen to and install sounds from community packs with a strudel.json index (Tidal Drum Machines, Uzu, VCSL, Salamander piano, SP-12, mridangam, or any github:user/repo).
- Agentic UI v1: sliders, tempo, sound selector and step sequencer inside Maestro's messages.
