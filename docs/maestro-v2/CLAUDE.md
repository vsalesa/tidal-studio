# Instructions for Claude — Maestro v2

You are working on the **Maestro v2 music-composition architecture** for Tidal Studio. This file is deliberately compact and intended to reduce repeated prompts and token consumption.

## Authorization and scope

- All decisions **D01–D18 are approved**; architecture is level 6, not level 7.
- The user authorized **creation of this documentation handoff folder**. **Do not change production code, install models, download datasets, run migrations, create further branches/PRs, or touch other repositories unless the user explicitly authorizes a concrete implementation step.**
- After implementation is authorized, implement **one bounded slice at a time** on a feature branch; use small commits and preserve backward compatibility.
- `tidal-studio` is the execution/state authority. `music-composition-skills` contains expert knowledge; an existing experimental branch remains unmerged.
- Never silently change locked/approved tracks, other songs, key/harmony, tempo, time signature, sound inventory, or copyright permissions.

## Token-minimizing execution protocol (mandatory)

1. **Retrieve narrowly.** Read this file and [DECISIONS_D01_D18.en.md](DECISIONS_D01_D18.en.md) once at session start; use headings/search to read only related sections from the other documents. Inspect specific source files and functions with `rg -n`, `sed -n`, and narrow diffs. Do **not** dump entire repositories, full logs, all skills, or full user songs into context.
2. **Use a fixed small task envelope:** goal, invariant(s), files likely affected, inputs/outputs, tests, rollback. Confirm scope when ambiguous; avoid serial architecture re-discussions after decisions are settled.
3. **Prioritize local deterministic work.** Instrument availability ranking, version/lock checks, hash comparisons, role/genre lookup, RAG filtering, Git export, and validation should not call an LLM.
4. **Separate retrieval from creativity.** Supply the composer only the task-scoped song summary, approved constraints, relevant top-ranked evidence with IDs, and a concise request. Do not resend large skill documents or the entire conversation.
5. **Bound costly agent loops.** Make iteration counts, candidates, retrieved chunks, tokens, wall time, and CPU/GPU usage configurable; prefer one good targeted generation to repeated general reasoning. Stop on validation failure or budget exhaustion, and return a safe fallback.
6. **Avoid unnecessary model calls.** Optional Graphiti extraction, CLaMP 3, vector search, audio analysis, or specialized generators are *capability adapters*, not mandatory background jobs. Do not automatically download or activate them.
7. **Cache safely.** Cache read-only retrievals and computed musical features by content hash + model/index version + permissions + task parameters. Invalidate on approved edits. Do not cache private input across users without isolation.
8. **Use tools efficiently.** Batch related small inspections; run focused tests first, then targeted regression suites. Report failure excerpts rather than entire outputs. Avoid repeated identical searches or re-reading unchanged files.
9. **Keep responses concise and useful.** Each iteration report: what changed, exact files, tests (pass/fail), observed quality/cost evidence, risks/next slice. No elaborate recaps of D01–D18. Do not claim tests, listening, or savings that were not actually measured.
10. **Track actual cost.** Record input/output tokens when available, invocation count, retrieval items, latency, memory/CPU/GPU, and fallback rate per operation. No invented percentages or guaranteed performance numbers.
11. **Make changes auditable.** Stable IDs, schema versions, source/version references, typed patches, tests, reversible migrations, meaningful local Git milestones. Never commit each audition or provisional preference.
12. **Be privacy- and license-aware.** Source-level eligibility, explicit user approval for literal copying of protected musical material, opt-in remote sync, retention and deletion flows.

### Preferred minimal context envelope

```json
{
  "request_id": "req-123",
  "task": "compose_alternative_lead",
  "song_ref": {"id": "song-1", "version": 42},
  "editable_scope": {"track_ids": ["d6"], "bar_range": [9, 16]},
  "hard_constraints": {"locked_track_hashes": {"d1": "sha256:..."}, "preserve_bpm": true},
  "musical_summary": {"genre": "merengue", "variant": "orquesta", "bpm": 140, "key": "C", "harmony_ref": "harm-1"},
  "retrieval": [{"source_id": "kb-17", "version": 2, "why": "brass call-response"}],
  "max_candidates": 3
}
```

Use references and targeted event ranges rather than embedding entire MIDI streams or audio blobs. The payload is illustrative, **not an existing API**.

### Work protocol after explicit implementation approval

- **Inspect → propose narrow patch → implement → validate invariants → focused tests → A/B if musical → checkpoint.**
- Before changing any interface, locate callers and existing tests, and keep a compatibility route.
- Use provider-neutral typed structures, deterministic pre/post-flight validation, user-controlled apply/undo, and clear fallbacks.
- Preserve current reggaeton examples as a fixed regression group.
- No completion claim without test evidence; human/expert listening is required for release-level musical improvement.
- If a new optional model does not beat the relevant baseline at acceptable resource cost, leave it disabled.

### Source map

`web/courses.js`: static lesson presets. `web/app.js`: course operations and auditions. `web/variants.js`: existing proposal selection. `server/assistant.py`: Maestro JSON contract. `server/skills.py`: skills loading/routing. `server/midigen.py`: deterministic MIDI generation. `server/inventory.py`, `server/instcatalog.py`, `server/instlib.py`, `server/engines.py`: sounds and engines. `server/timeline.py`: musical timeline. Confirm current file names and behavior before editing.

**North star:** improve *audible* music quality while protecting user decisions, keeping model usage proportional to musical complexity.
