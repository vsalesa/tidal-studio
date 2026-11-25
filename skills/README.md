# Maestro's skills

Maestro (the AI teacher in Tidal Studio) can load **skills**: folders with a `SKILL.md`, the same format as
[Claude's Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview).

- `skills/` holds the skills that ship with Tidal Studio. They were written by other people and keep their own license.
- `my-skills/` (created when needed, not tracked by git) holds the skills you install from the Skills panel
  (paste a GitHub link to a skill folder or to its `SKILL.md`) or copy there by hand.

How Maestro uses them, like Claude does (progressive disclosure):

1. With every message Maestro sees the **list** of active skills (name and description).
2. The skills that match the request are found in a **persistent index** (SQLite FTS5 in the app's data folder, rebuilt
   by itself when a skill changes; the Markdown files stay the source). From up to 2 skills per answer, plus any you
   mark «Always load», Maestro gets only the **sections** that fit, with the parent section and the exceptions they
   depend on («Contexto (padre)»), within a token budget. Spanish music words are translated to the English the skills
   use (`server/data/music_aliases.json`). If Maestro needs a section that wasn't sent, it asks for it (`mas_skills`).
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

| `music-evaluate/` | [sb-dev/music-production-skills · music-evaluate](https://github.com/sb-dev/music-production-skills/tree/aa3933bc87f54a48ec018bb868bf6385b340db22/skills/music-evaluate) (SKILL.md + `references/`) | MIT | Evaluates a song or a draft against rubrics, names the weakest element first and keeps what already works. |
| `music-compose/` | [sb-dev/music-production-skills · music-compose](https://github.com/sb-dev/music-production-skills/tree/aa3933bc87f54a48ec018bb868bf6385b340db22/skills/music-compose) (SKILL.md + `references/`) | MIT | Composing in drafts: compare, select and refine, preserving what was approved. |
| `arrangement-advisor/` | [Vocaler-AI/music-skills](https://github.com/Vocaler-AI/music-skills/tree/4479796b9f05e2fc300fee1a848b0effa1993b8a/skills/arrangement-advisor) (SKILL.md) | MIT | What plays in each section, builds and drops, fixing a song that feels static or crowded. |
| `melody-writer/` | [Vocaler-AI/music-skills](https://github.com/Vocaler-AI/music-skills/tree/4479796b9f05e2fc300fee1a848b0effa1993b8a/skills/melody-writer) (SKILL.md) | MIT | Vocal melodies and toplines as notes. |
| `hook-writer/` | [Vocaler-AI/music-skills](https://github.com/Vocaler-AI/music-skills/tree/4479796b9f05e2fc300fee1a848b0effa1993b8a/skills/hook-writer) (SKILL.md) | MIT | A song's central hook: where it lands and how it repeats. |
| `prosody-checker/` | [Vocaler-AI/music-skills](https://github.com/Vocaler-AI/music-skills/tree/4479796b9f05e2fc300fee1a848b0effa1993b8a/skills/prosody-checker) (SKILL.md) | MIT | Lyrics: syllables and stress against the rhythm. **Off by default**; turn it on if you write lyrics. |
| `music-composition/` | [SJY051/music-composition](https://github.com/SJY051/music-composition/tree/07cecf9c8fd15249ea3da311dc9a7c7893ff801f) v1.0 (SKILL.md, `references/`, `assets/`, `LICENSE.md`) | CC BY 4.0 (text), MIT (scripts, not included) | General music composition: harmony, melody, rhythm and groove, form, orchestration, arrangement for the mix and 24+ genres, in about 100 reference files. Tool-agnostic (no Tidal code), so Maestro turns its advice into Tidal. Recommended by Victor. |

Files are copied unchanged from the commits linked above; each folder keeps its license file. Changes, as CC BY 4.0
asks: from `music-composition` we left out the repository's release, benchmark and validation documents
(`references/validation/`, `benchmarks/`, release notes) and `scripts/`; the skill files themselves are not edited.

Large skills work too: Maestro picks the single reference file that best fits each message (by file name and content),
so a skill with a hundred references costs about the same as a small one.

## How the included skills are kept (0.21)

`tools/vendor_music_skills.py --fetch` copies only the text files of each skill from a pinned commit, with its
`LICENSE` and a `SOURCE.json`, and writes `BUNDLE-MANIFEST.json` (SHA-256 of every file, default on/off, headings that
are indexed but never sent, such as script instructions). `--verify` checks the folder against the manifest. At start
the app checks every included file: a skill whose files don't match is **quarantined** (shown in the panel, never sent
to the AI) until you reinstall. On upgrade, included files that a newer version no longer ships are removed, unless
you edited them. Scripts are never copied and never run.

Maestro uses the copies the app ships and the plugins it downloads into `my-plugins/`. It does not depend on the
skills or plugins installed in your global Claude Code (`~/.claude`): with the Claude subscription provider, the CLI
runs with `--safe-mode --disable-slash-commands` when available (setting `claudecode.skill_isolation`), so you can
uninstall a plugin from your Claude and keep using it in Maestro.
