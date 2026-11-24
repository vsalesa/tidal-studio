# Maestro v2 — English Implementation Blueprint

> **Revised by Claude, 2026-11-24 / Revisado por Claude, 24-11-2026.** The text below is the original ChatGPT blueprint, kept unchanged. Claude's review, agreed with Victor, is in [APPROVED_PLAN.en.md](APPROVED_PLAN.en.md) ([español](APPROVED_PLAN.es.md)). / El texto de abajo es el blueprint original de ChatGPT, sin cambios. La revisión de Claude, acordada con Victor, está en el plan aprobado.

**Project:** Tidal Studio | **Owner repository:** `vsalesa/tidal-studio`  
**Status:** Architectural decisions D01–D18 approved; this folder contains an **implementation blueprint, not implemented features**.  
**Working branch:** `feature/maestro-v2-blueprint`  
**Source baseline reviewed:** `main@268913598467ad25e8441f9593c364f3a7fe8690` (2026-11-24). Recheck current code before coding.  
**Primary objective:** Dramatically improve Maestro's **actual musical composition quality**, especially merengue (típico and orquesta), salsa, timba, bachata, and cumbia, while retaining the existing reggaeton strengths.

## Start here — minimal-token reading order

| If you need to… | Read |
|---|---|
| Start a Claude coding/design session | [CLAUDE.md](CLAUDE.md) — agent operating contract and token discipline |
| Understand approved product requirements | [DECISIONS_D01_D18.en.md](DECISIONS_D01_D18.en.md) |
| Design data, providers, memory, and musical safety | [ARCHITECTURE.en.md](ARCHITECTURE.en.md) — read only the relevant section |
| Select the next work package | [IMPLEMENTATION_ROADMAP.en.md](IMPLEMENTATION_ROADMAP.en.md) |
| Validate a release or model upgrade | [EVALUATION.en.md](EVALUATION.en.md) |
| Verify the original audit hypotheses | [CURRENT_SYSTEM_AUDIT.en.md](CURRENT_SYSTEM_AUDIT.en.md) |

These documents are a **faithful, implementation-oriented English consolidation** of the approved Spanish analysis v3.0, reorganized so Claude need not load a single long report on every task. They preserve the full D01–D18 decision set and the main technical diagnosis. They are **not a line-for-line translation** of historical decision-session prose.

## Non-negotiable product invariants

1. **The song state belongs to Tidal Studio**, not an LLM, RAG index, or graph. Approved tracks, locks, tempo, harmony, motifs, inter-track relationships, and user permissions must survive every proposal.
2. **Generate alternatives; do not overwrite.** Preserve course presets, enable A/B audition, apply only after explicit selection, and support undo.
3. **Make Maestro a better composer, not merely a better chatbot.** Prioritize controlled symbolic composition, motif development, ensemble interaction, realistic articulation, and audible evaluation.
4. **Reuse existing engines first.** Level-6 modular multimodal architecture must allow CLaMP 3, Graphiti, specialized MIDI/audio generators, and later level-7 model adaptation, but no model is mandatory without a validated benefit.
5. **Knowledge and musical artifacts are versionable.** Local Git commits at meaningful milestones; remote sync only when requested; honor licensing and privacy.
6. **Measure quality.** Reproducible genre-level benchmarks, candidate blind listening, specialist review for release candidates, RAG/memory ablations, and reggaeton non-regression.
7. **Do not confuse design approval with authorization to implement.** This initial repository change is explicitly limited to creating this handoff folder. Before changing application code, request or follow a separate, explicit implementation instruction.

## Recommended first Claude task

> Read `docs/maestro-v2/CLAUDE.md`, then `DECISIONS_D01_D18.en.md` and only the relevant sections of `ARCHITECTURE.en.md`. Verify the present code against `CURRENT_SYSTEM_AUDIT.en.md`. Deliver a minimal, testable technical specification and the first bounded milestone. Do not modify production code until I explicitly authorize that milestone. Optimize token use and give compact evidence-backed updates.

## Repository boundaries

- The folder is a **documentation-only handoff** committed on its own branch.
- Do not merge the experimental `music-composition-skills/feature/pro-latin-arranger-v1.3.0` branch without separate authorization.
- Do not introduce credentials, private recordings, unlicensed reference audio/MIDI, model weights, or generated large binary files into Git.
- Existing projects, presets, tracks, and user data must stay compatible.

## Completion definition

The architecture becomes an implemented product **only** when each separately authorized slice has code, migration/fallback plans, tests, listening evidence, and explicit acceptance. A written plan, Git commit, or passing symbolic test alone does not establish musical quality.
