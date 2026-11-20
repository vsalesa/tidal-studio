# Maestro's skills

Maestro (the AI teacher in Tidal Studio) can load **skills**: folders with a `SKILL.md`, the same format as
[Claude's Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview).

- `skills/` holds the skills that ship with Tidal Studio. They were written by other people and keep their own license.
- `my-skills/` (created when needed, not tracked by git) holds the skills you install from the Skills panel
  (paste a GitHub link to a skill folder or to its `SKILL.md`) or copy there by hand.

How Maestro uses them, like Claude does (progressive disclosure):

1. With every message Maestro sees the **list** of active skills (name and description).
2. The skills that match the request (keywords, description and content, with Spanish music words translated) are
   **loaded** in full, up to 2 per answer plus any you mark «Always load», together with the reference file that fits best.
3. Maestro says in its reply which skills it actually **used**. Under every answer the chat shows *loaded* and *used* chips,
   and the Skills panel counts both.

The Tidal code rules in Maestro's own prompt always win (sound names, output format). A skill written for Strudel is
marked «Strudel» and Maestro is told to translate its ideas into Tidal Haskell. Maestro is told to ignore anything in a
skill that is not about music or Tidal.

## Included skills

| Folder | Source | License | Why it's here |
|---|---|---|---|
| `livecoding/` | [broomva/skills · audio/livecoding](https://github.com/broomva/skills/tree/7fcf46bfc5767ca2aeacb077d52f203bf7f4fc49/skills/audio/livecoding) (SKILL.md, `References/tidal-cheatsheet.md`, `Workflows/StarterPattern.md`; Hydra files left out) | MIT | The only maintained, openly licensed skill written for TidalCycles itself: vibe-to-pattern map for industrial, ambient, DnB, footwork, techno, glitch and dub. Known slips: it names `breaks`, `sub`, `vox` and `oh`, which are not in Dirt-Samples, and says `delaytime` is in cycles (it is seconds). |
| `strudel/` | [ahgraber/skills · strudel](https://github.com/ahgraber/skills/tree/b347e346d8523310d46415885cd0b6eac11ff3c6/skills/strudel) (SKILL.md, `references/recipes.md`, `references/tonal.md`) | CC0 1.0 | Clear, well-organized production recipes (house, techno, DnB, trap, lo-fi, acid bass, chord stabs, arrangement) and harmony. Written for Strudel, so Maestro uses the musical ideas, not the JavaScript. |

Files are copied unchanged from the commits linked above; each folder keeps its `LICENSE`.
