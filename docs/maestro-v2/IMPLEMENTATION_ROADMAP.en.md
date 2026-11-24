# Maestro v2 — Phased Implementation and Claude Handoff

**Status:** implementation roadmap proposed for review; only this documentation folder is currently authorized. Do not turn a selected milestone into code without a separate explicit user instruction.

## Work packages, dependencies and acceptance gates

| Step | Slice | Core work | Proof required to finish |
|---|---|---|---|
| **P0** | Audit + musical baseline | Recheck current repo, three musical flows, available sounds, existing tests. Capture same-source clips and manifests for approved genres. | Reproducible fixtures and honest baseline; no claims of sound improvement without auditions. |
| **P1** | Canonical SongState + safe changes | Schema/migration design; locks, typed scoped proposals, base revision, dependency checks, transactions, preview/accept/undo. | Zero unauthorized edits on locked tracks; version conflicts rejected; legacy song compatibility. |
| **P2** | Local ContextRouter + provider contracts | Deterministic fast paths, Retrieval/Composer/Critic/Instrument adapters, context budgets, logging, caching, failure fallback. | No LLM needed for trivial lookup/validation; budgets observable; existing generation still works. |
| **P3** | Composition quality + course alternatives | MusicalIR, motif/phrase arranger, three candidate variants, course preset or Maestro option, audition with frozen accompaniment. | Identical approved backing, valid rhythm/harmony/ranges, no automatic replace, undo. |
| **P4** | Ensemble interactions + sound choice | Bass/drum/piano/lead/brass dependencies, genre grammars, timba gear switches, instrument eligibility and articulation. | Genre-appropriate fixtures, exact inventory eligibility, same-phrase sound A/B. |
| **P5** | Musical memory + My Styles + cases/templates | Approved/provisional memory, categorized Style X, visual knowledge studio, case and full-song template reuse modes. | Explicit authorization for literal copy, provenance, no cross-song contamination, version comparisons. |
| **P6** | Git and privacy | Human-readable snapshots, milestone commits, controlled sync, semantic conflicts, exclusion/retention/deletion. | Restore tested; no secrets/private licensed assets pushed; no silent conflict resolution. |
| **P7** | Optional multimodal adapters | Benchmarked CLaMP 3-like search, Graphiti-like temporal relations, specialized MIDI/audio models, GPU/resource controls. | Activate only when test outcome beats baseline with acceptable cost and permissions; safe off switch. |
| **P8** | Release evaluation | Full A/B and expert review by genre, RAG and memory ablations, cost tracking, reggaeton non-regression. | Release gate passes; measurable musical improvement or explicit documented limitation. |

The ordering is proposed, **not a claim that any component exists or is complete**. P0 must precede feature claims. Instrumentation for evaluation begins at P0 rather than being postponed to P8.

## First technical specification to ask Claude for

1. **Reality check** against actual source at current HEAD, limited to `server/midigen.py`, `server/assistant.py`, `server/skills.py`, `server/timeline.py`, `server/inventory.py`, `server/instlib.py`, `web/courses.js`, `web/app.js`, `web/variants.js` and relevant tests. Identify absent, existing and reusable primitives; cite file paths/functions.
2. **Component map and sequence diagram** for `request → preflight → retrieval → composition → validate → audition → approval → commit/undo`. Mark where no LLM is needed.
3. **Data contracts** for `SongStateVn`, `MusicalIR`, `ChangeProposal`, `ComposerProvider`, `CriticProvider`, `RetrievalProvider`, `MemorySuggestion`, `StyleRecipe`, `MusicalCase`, `SongTemplate`, `KnowledgeAsset`, `GitExport`, `EvaluationHarness`.
4. **Migration and compatibility plan**, including saved course examples, .tidal/.hs songs, old variants, sample IDs, versioned schemas, rollback and optional adapters.
5. **Minimal P1 patch proposal**, estimated touchpoints and **tests first**. State risks, token budgets and dependencies rather than modifying code yet.

## Milestone-specific implementation prompt (for later authorization)

> Implement **P[n] only**, following `docs/maestro-v2/CLAUDE.md` and the named Dxx decisions. Inspect only the relevant code paths; preserve public APIs and existing behavior unless the milestone explicitly changes them. Write or update focused tests, run them, report the exact commands/outcomes, and make one meaningful Git checkpoint. Do not expand scope, install optional models or modify the skills repository. Return a concise summary: files changed, what was verified, remaining risks, next slice.

## Technical design checklist

- [ ] Current behavior verified, not assumed from the 2026-11-24 snapshot.
- [ ] Stable per-song revisions and non-destructive migration plan.
- [ ] Explicit requested scope and exact protected-track hashes.
- [ ] Typed musical events and known lossy conversions.
- [ ] Validations implemented in host rather than only prompts.
- [ ] Evidence of independence between genre rules and user preferences.
- [ ] Installed/loaded/actually playable sound states distinguished.
- [ ] No unlicensed resource or literal copy without authorization.
- [ ] Default route without LLM and safe fallback on unavailable providers.
- [ ] Configurable token, time, candidate and CPU/GPU budgets.
- [ ] My Styles, cases and templates are versioned and traceable.
- [ ] Local Git milestones distinct from remote synchronization.
- [ ] Rebuildable projections, retention and deletion semantics.
- [ ] A/B designed with frozen control variables.
- [ ] Reggaeton baseline included in regression suite.
- [ ] Specialist release review and cost/quality measurements planned.

## Token-efficient progress ledger

After authorization, maintain **compact milestone notes**, not a large daily transcript. Suggested status per slice:

```
Milestone: P1
Commit: <sha or "not committed">
Scope: <files/functional change, <= 3 lines>
Checks: <command → result>
Safety: <locked tracks / rights / rollback checks>
Measured: <tokens, latency, audio A/B if applicable, else "not measured">
Next: <one bounded task>
```

Avoid repeated re-explanation of approved architecture. Link to the decision IDs and the relevant document section instead.

## Definition of done for the entire program

A user can compose meaningful genre-correct alternatives, preserve every approved part, build and reuse named styles and authorized complete templates, understand and manage long-term memory, recover Git milestones, and evaluate whether new retrieval/models actually improve **audible compositions**. Optional advanced models are valuable only when demonstrated by controlled experiments.
