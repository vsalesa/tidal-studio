# Roadmap

Ideas and next steps for Tidal Studio, roughly in priority order.

## Next: visual controls in the chat (agentic UI)

A palette of components with **sliders and selectors** that generate Tidal code chunks visually, shown by Maestro
**inside the chat** when they're useful (agentic UI). Each control writes real code you can see and learn from.

- **Tempo**: a BPM slider that writes `setcps (BPM/60/4)` live while you drag it.
- **Volume and mix**: `# gain`, `# pan` sliders per track.
- **Filters**: cutoff sliders for `# lpf` / `# hpf`, with an optional "moving filter" toggle that writes
  `# lpf (range a b $ slow n sine)`.
- **Space**: reverb (`# room`, `# size`) and echo (`# delay`, `# delaytime`, `# delayfeedback`).
- **Rhythm**: a step grid (16 steps) that writes the mini-notation (`"bd ~ ~ bd"`), plus a Euclidean selector `bd(3,8)`.
- **Notes and harmony**: scale and chord selectors (`scale "minPent"`, `c'min7`), octave and transpose steppers.
- **Time and structure**: selectors for `every`, `whenmod`, `mask "<t!8 f!8>"`, `swingBy`.
- **Chance**: probability sliders for `degradeBy`, `sometimesBy`.

How it would work:

1. Maestro's JSON replies gain a `controles` field (for example `{tipo: "slider", parametro: "lpf", pista: "d4", min: 200, max: 8000}`).
2. The chat renders the control; moving it updates the track's code (with the usual before/after highlight) and plays it live.
3. The local guide (without AI) offers the same controls from the code palette blocks, which already carry the code each
   control needs.

## Also planned

- Real-machine testing of the installers on macOS and Windows, and of every catalog pattern on real TidalCycles.
- Translate the installer messages (currently Spanish) to English.
- Song sections timeline: arrange `mask` patterns visually across bars.
- Export: record the song to audio (SuperCollider recording) and export the `.tidal` file.
- Shareable song links (code + BPM encoded in the URL).

## Done

- Base-project wizard, brainstorm wizard, style recipes, pre-listen, My projects.
- English/Spanish interface; Maestro replies in the chosen language.
- Code help: per-track «Help» with offline checks and AI fixes, before/after and revert to the last version that worked.
- Code palette: blocks organized by goal (rhythm, sound, notes, effects, time, chance) and level, with undo.
