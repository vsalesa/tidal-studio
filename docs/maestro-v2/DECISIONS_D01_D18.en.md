# Approved Architecture Decision Record — D01 to D18

> **Revised by Claude, 2026-11-24 / Revisado por Claude, 24-11-2026.** The text below is the original ChatGPT blueprint, kept unchanged. Claude's review, agreed with Victor, is in [APPROVED_PLAN.en.md](APPROVED_PLAN.en.md) ([español](APPROVED_PLAN.es.md)). / El texto de abajo es el blueprint original de ChatGPT, sin cambios. La revisión de Claude, acordada con Victor, está en el plan aprobado.

**Status:** 18/18 confirmed by the user on 2026-11-24. These are binding design choices; **they do not by themselves authorize application-code changes**.

| ID | Approved choice | Required behavior and boundary |
|---|---|---|
| **D01** | **B — Local RAG and musical memory with optional synchronization.** | Core memory/retrieval work locally; no cloud account required. Sync is user-controlled. Git details are covered in D12/D14. |
| **D02** | **A+B+C — Manual saves, proactive suggestions, and controlled automatic learning.** | Collect evidence from picks, rejections, revisions, and listens. Propose new memories proactively. Session-local provisional adaptation is allowed; **permanent cross-project memory activation requires approval**. Separate expert facts from subjective preference. |
| **D03** | **D — Multi-genre initial coverage.** | Cover merengue típico and orquesta, salsa, timba, bachata, and cumbia in architecture and benchmarks. Include reggaeton as a no-regression baseline. Staged rollout is allowed. |
| **D04** | **Preset OR ask Maestro for an alternative at each relevant course step.** | Precomputed lesson content remains selectable. Generate same-step alternatives for melody/rhythm/arrangement as applicable, audition A/B, preserve previous accepted tracks/tempo/harmony and apply only after choice. Do not silently extend scope to MIDI generation. |
| **D05** | **B — Canonical per-song musical memory owned by the host.** | Typed/versioned/persistent state: form, meter/BPM/key, harmony, tracks/roles, patterns/motifs, inter-track relationships, locks, approvals, rejected options, history. Maestro proposes scoped diffs; host validates and applies after approval. Undo/rollback and explicit approval for dependent edits. |
| **D06** | **A — Deterministic local instrument eligibility/ranking.** | Match genre/subgenre, role, articulation, range, loaded inventory; return 2–3 contextual options. A/B with identical phrase, no implicit replacement. Maestro only handles creative exceptions. Optional Essentia/librosa/CLAP are not universal quality judges; ask before downloads. |
| **D07** | **C — Reproducible automated tests + blind A/B + genre-expert release review.** | Experts review candidate releases, not every interactive variation. Audit symbolic and audible regressions, with reggaeton controls. |
| **D08** | **A — Claude implements only after a further explicit go-ahead.** | ChatGPT provided analysis/specifications/review. The experimental skills branch is not automatically merged. The user separately authorized creating this documentation folder, **not production implementation**. |
| **D09** | **B — Contextual hierarchical memory + named reusable styles.** | Current approved song state/locks outrank context-specific approved style knowledge, which outranks generic user preference. Expert knowledge is a separate source. `My Styles` lets users save, name, categorize and reuse **Style X** without silently copying the source song. House and merengue were separate illustrative genres, **not** a requested 'house-merengue' hybrid. |
| **D10** | **Level 6 — Advanced modular multimodal composition platform.** | Prioritize the musical **composer brain**: symbolic generation, arrangement, critics, retrieval, memory, optional audio models. Reuse current tools first; CLaMP 3, Graphiti, MIDI/audio generators are pluggable and evidence-gated. Provider APIs must allow later Level 7 fine-tuning/model adaptation **without redesigning host integration**; Level 7 training is out of scope now. |
| **D11** | **C — Licensed multimodal expert + user + external corpora.** | Curated skills, authorized user MIDI/audio/arrangements, and legally usable external references; preserve attribution, provenance, licenses, restrictions, consent. No opportunistic scraping and reuse of protected songs. |
| **D12** | **C — In-app Musical Knowledge Studio with Git-versionable assets.** | Browse/edit/pin/disable/delete memory; pending approvals, labeling, provenance, version history, import/export; visual relationships across songs/styles/patterns; style A/B and explanation of sources. Persist all approved musical knowledge and song states in Git-friendly exports, with indexes rebuilt locally. |
| **D13** | **B — Intelligent batched memory proposals based on evidence/confidence.** | Collect session feedback without interruptions; deduplicate/group suggested memories and show supporting evidence. Review actions: accept, edit, postpone, reject. Cross-project permanent memory still needs approval. |
| **D14** | **B — Automatic local Git versioning at milestones, controlled remote synchronization.** | Commit approved memories/styles and meaningful song milestones locally. Do not commit every audition. Push only on user request; detect divergent revisions, resolve semantic musical conflicts with supervision, never overwrite locked decisions. Use separate data repository/namespace as appropriate; choose exact remote later. |
| **D15** | **B — Smart configurable retention, exclusions and deletion.** | Approved songs/styles/memories persist until user deletion. Provisional evidence, auditions, renders and caches have configurable expiration. Allow exclusion from Git, index removal, controlled deletion, transparency about stored locations. Git-history removal is separate; remote clones cannot be guaranteed erased. Never upload secrets/restricted material automatically. |
| **D16** | **D — Full case library and reusable song templates.** | Preserve patterns, motifs, style recipes, approved arrangement cases, sections and full-song templates with inter-track dependencies. Distinguish inspiration, transformation and **literal reuse**. Literal copying requires user selection and sufficient rights; never overwrite destination locks or approved edits. |
| **D17** | **C — Continuous experimental composition-quality evaluation.** | Versioned genre benchmarks, blind A/B, specialist reviews, provider comparisons, RAG/memory ablations, regression gates, latency/tokens/resources, traceable results. Prove improvement in music, not merely retrieval. |
| **D18** | **B — Hybrid adaptive orchestration with hard constraints.** | Local deterministic router first; task-scoped retrieval and optional additional search/critics/generators for justified creative work. Configurable token/time/iteration/CPU/GPU budgets. Preflight/postflight on host. LLM creativity never overrules song locks, rights, requested scope or base-version integrity. |

## Order of authority (executable, not merely a prompt)

1. **Safety, license and explicit user permissions**.
2. **Canonical song version, locks, approved musical facts and dependencies**.
3. **Current request, intended edit scope, and user-approved exceptions**.
4. **Approved contextual memories, named styles, expert references and authorized cases**.
5. **Creative proposals**, optional models and speculative retrievals.

A lower-priority item cannot silently override a higher-priority item. If music requires touching a dependent track, report the dependency and request a separate explicit approval; otherwise propose a scoped alternative.

## Important cross-decision clarifications

- **Saving a style is not cloning a song.** A style recipe contains transferable groove/roles/articulation/voicing/form and references; copying literal notes/recordings requires D16 permission.
- **Preview is not acceptance.** Listening and hovering are not proof of preference; picking/rejecting/refining supplies stronger evidence. Permanent memories require confirmation.
- **Git is not the live database.** SQLite or an equivalent local transactional store owns runtime consistency; Git carries user-approved, diffable snapshots/version history. Retrieval/vector/graph indexes are rebuildable projections.
- **Graphiti and CLaMP 3 are optional capabilities, not mandated installations.** Tests determine whether to enable them.
- **Expert evaluation is a release gate.** Ordinary user A/B choices remain fast and self-service.
- **Level 7 is a future plug-in opportunity, not a present training project.** Provider/version contracts should make future upgrades feasible, though data gathering and evaluation remain substantial work.

## Approval change control

Treat this record as immutable design baseline unless the user explicitly reopens a numbered decision. Record any approved amendment with date and rationale. Do not infer authorization to modify another repository or to download/install assets.
