# Maestro v2 — Audit Notes and Integration Inventory

> **Revised by Claude, 2026-11-24 / Revisado por Claude, 24-11-2026.** The text below is the original ChatGPT blueprint, kept unchanged. Claude's review, agreed with Victor, is in [APPROVED_PLAN.en.md](APPROVED_PLAN.en.md) ([español](APPROVED_PLAN.es.md)). / El texto de abajo es el blueprint original de ChatGPT, sin cambios. La revisión de Claude, acordada con Victor, está en el plan aprobado.

**Snapshot basis:** Spanish analysis v3.0 dated 2026-11-24, source tree around `main@268913598467ad25e8441f9593c364f3a7fe8690`. These are hypotheses and code observations to verify, **not measured listening conclusions**.

## Existing implementation areas

| Area | Existing file(s) | Observation / inspection question |
|---|---|---|
| Static educational courses | `web/courses.js`, `web/app.js` | Presets and `courseApply()`; determine best hook for `keep preset / ask Maestro alternative`. |
| Candidate UI | `web/variants.js`, `web/app.js` | Existing audition/selection/undo primitives; reuse rather than rebuild. |
| Maestro | `server/assistant.py` | Actual JSON output expects existing `cambios`, `variantes`, `sugerencias`, `descargar` and plans. New internal types require adapters. |
| Skill loader | `server/skills.py` | Snapshot: `MAX_LOADED=2` non-pinned, `BUDGET=24000` chars total, `MAX_FILE=9000` chars/file; reference selection heuristic. Confirm current behavior. |
| Deterministic MIDI | `server/midigen.py` | Neighboring chord/scale notes and fixed four-bar question/answer shape; few accompaniment templates. Need real motif development and ensemble coordination. |
| Statistical style corpus | `server/data/style_profiles.json` | Snapshot showed merengue 3 source songs, salsa 7 and cumbia 9; too few for universal claims. |
| Instruments and optional engines | `server/inventory.py`, `server/instcatalog.py`, `server/instlib.py`, `server/engines.py` | Verify catalog vs installed vs loaded vs playable and which articulations can render. |
| Timeline/event access | `server/timeline.py` | Reuse beat/cycle information, do not re-infer known MIDI events from audio. |
| Tests | `tests/` | Identify preserved song-state constraints, course regression tests, and available audio integration fixtures. |

## Technical diagnosis

- **Melody:** valid notes can be dull if the generator mostly moves toward nearby chord tones and repeats one four-bar architecture. Improve motif construction, transform/restate, rests, tension, phrase arc and memorable hooks.
- **Accompaniment:** bass, rhythm and piano cannot be independent random presets. Model two-to-four-bar interactions, anticipated chord arrival, instrument rests and coordinated transitions.
- **Expert knowledge:** a huge single skill file is truncated by context limits. Use concise routing references and task-specific knowledge.
- **Teaching vs composing:** simple user-facing language is fine; internal musical planning may be technically deep. Avoid leaking unvalidated fake output keys into the current Maestro JSON parser.
- **Sound:** broad catalogs do not guarantee the necessary articulation is loaded or playable. A wrong tambora, güira or accordion source cannot be repaired by EQ.
- **Evaluation:** Tidal syntax validity, scale membership and agent confidence do not prove quality. Establish equivalent baseline clips, symbolic checks and blind listening.

## Specialist knowledge references

- [Berklee — Juan Luis Guerra and Dominican musical tradition](https://www.berklee.edu/berklee-today/summer-2005/juan-luis-guerra)
- [Berklee — Latin Piano Styles](https://online.berklee.edu/courses/latin-piano-styles)
- [Timba.com — Gears: what, where and how](https://www.timba.com/artist_pages/gears-what-where-and-how)
- [TidalCycles mini-notation](https://tidalcycles.org/docs/reference/mini_notation/)
- [TidalCycles cycles](https://tidalcycles.org/docs/reference/cycles/)
- [Google Magenta Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove)
- [Essentia documentation](https://essentia.upf.edu/documentation.html)
- [librosa documentation](https://librosa.org/doc/latest/index.html)

## Adjacent repository (not to modify without authorization)

`vsalesa/music-composition-skills`:
- Main baseline observed: `903fbf05a3a73d58b90b0ddd318cbe72b725547c`.
- Experimental, unmerged `feature/pro-latin-arranger-v1.3.0` at `40967c3595a240153bc1077ed52d52fbe2071569`.
- Candidate professional skill references: merengue; salsa/timba; bachata/cumbia; Brazil/urban; melody/harmony; rhythm/performance; form/arrangement; sound direction; critique/testing; research evidence; generator contracts.
- Audition improvements and genre-expert verification **before** publishing expert rules as authoritative.

## Practical first checks for Claude

1. Diff source HEAD against the snapshot hash before assuming any diagnosis still applies.
2. Search for exact functions/callers and existing integration tests rather than loading whole files.
3. Capture baseline genre clips with consistent playback and rights-cleared fixtures.
4. Identify smallest seam for introducing a typed scoped proposal without rewriting legacy song storage.
5. Report known unknowns separately; do not claim the repo already supports any proposed interface.
