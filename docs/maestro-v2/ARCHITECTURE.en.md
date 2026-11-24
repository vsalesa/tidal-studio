# Maestro v2 — Technical Architecture (English)

**Purpose:** turn approved D01–D18 into a coherent implementation target for an **expert music-composition engine**, not simply an extended assistant prompt.  
**Status:** proposed architecture and contracts; not yet implemented. Named types and endpoints are illustrative until verified against Tidal Studio's current code.

## 1. Problem statement and priorities

Current Tidal Studio already exposes three distinct musical paths:

1. **Course presets** from `web/courses.js`, applied in the web UI. Educational examples may be static; a user must be able to request a new proposal **for that same step** without replacing the preset until explicit acceptance.
2. **Conversational Maestro** in `server/assistant.py`, which emits structured JSON including `cambios`, `variantes`, `sugerencias`, `descargar` and plan-like content. A future internal composition schema cannot simply be fed to today's parser.
3. **Generate from MIDI** in `server/midigen.py`, currently a deterministic template/scale/chord-neighbor generator. This path needs phrase design, interaction among instruments, and intentional variation; better prompts alone cannot correct its algorithms.

**Quality priorities:** a distinctive motif; question/answer phrasing, silence, development, climax, tension/release; stylistically grounded grooves; interaction among bass, drums, piano, brass, lead; appropriate instrumental articulation; realistic audition and measurable human preference.

## 2. Proposed modular architecture

```text
User intention + lesson/project + exact SongState(version N)
                      |
           [Local ContextRouter]
        intent / scope / genre / budget
                      |
           [Deterministic Preflight]
  rights, edit permissions, locks, key, tempo, assets
                      |
  +-------------------+--------------------+
  |                   |                    |
[RetrievalProvider] [MemoryStore]     [InstrumentSelector]
 lexical/metadata    approved songs  loaded inventory
 embeddings optional styles/cases    ranked 2–3
 CLaMP 3 optional    graph optional  deterministic
                      |
             [MusicalPlan + MusicalIR]
                      |
     [ComposerProvider: current engine first]
 optional specialized MIDI, constrained generative audio
                      |
       [CriticProvider + structural validators]
         harmonic/groove/form/instrument scope
                      |
           [Candidate A/B/C with typed diffs]
                      |
         [Renderer + exact-context audition]
                      |
         [User accepts a specific candidate]
                      |
         [Atomic host revalidation + apply]
                      |
    [SongState N+1 + undo + Git milestone]
                      |
      [Provisional evidence and review queue]
```

The LLM is a **director of high-value creative exceptions**. Eligibility, retrieval filters, authorization, version control, and invariant checks belong to the application. Simple queries must not trigger multi-agent reasoning.

## 3. Canonical SongState (D05)

Design versioned `SongStateVn` with stable IDs and immutable revision references:

- Song identity, schema version, song revision, provenance, and parent revision.
- Meter/cycle semantics, BPM, key/scale, chord progression **by bar/time range**, form/sections.
- Tracks by stable ID: role, instrument binding, articulation, events, automation, origin, accepted status, content hash, locked flag.
- Accepted motifs and phrases, relationships between parts, groove templates, pickups/anticipations, rhythmic dependencies, voice-leading constraints, arrangements and section transitions.
- User instructions and authorized edit scope; candidates previously accepted/rejected, undo checkpoints, relevant source/style/template versions.
- References to authorized recordings/MIDI with asset IDs and license metadata, never implicit storage of secret audio.
- Explicit flags for absent/unknown information; avoid inventing relationships based solely on genre.

**Source of truth:** runtime transactional state and its version; Git snapshots are audit/export material; vector and graph indexes are secondary. Existing legacy songs may have only text Tidal patterns—define conservative extraction, confidence marking and loss-aware conversions, not fabricated structured certainty.

### Proposed typed change transaction

```json
{
  "proposal_id": "p-1042",
  "song_id": "song-77",
  "base_song_version": 12,
  "intended_scope": {"track_ids": ["d6"], "bar_ranges": [[9, 16]]},
  "operations": [{"op": "replace_events", "track_id": "d6", "from_bar": 9, "to_bar": 16, "events_ref": "candidate-A"}],
  "preconditions": {
    "expected_track_hashes": {"d1": "sha256:...", "d2": "sha256:..."},
    "must_preserve_bpm": true,
    "must_preserve_harmony": true,
    "must_preserve_locked_tracks": true
  },
  "required_consents": [],
  "candidate_id": "A",
  "source_refs": ["style-X@3", "kb-merengue@2"]
}
```

Host applies **only** after validating base revision, permissions, dependencies and exact protected hashes, with an atomic snapshot and undo. If a dependent track must change, split it into a separately consented proposal. A proposal targeting a stale revision must be rebased or rejected with explanation; never silently merge musical changes.

### Hard vs soft musical constraints

**Hard:** explicit locks, rights/consent, exact edit scope, correct meters and bar lengths, supported IDs and loaded sound capabilities, range where specified, resource permissions, unchanged accepted base unless approved, and syntactic/render integrity.

**Soft:** syncopation degree, chromatic passing notes, density, interval leaps, microtiming, phrase shape, response timbre, and groove variation. Avoid simplistic rules that force every melody onset to match the kick, clave or chord root.

## 4. Provider-neutral MusicalIR

Introduce an explicitly versioned intermediate representation for composition, independent of raw Tidal/Haskell syntax. At minimum:

- Meter, beat/bar/cycle reference, tick-resolution and timing convention.
- Pitched and unpitched note/onset/duration/velocity/articulation events, including chords and polyphonic overlap.
- Role/instrument channel, section markers, tempo/key/chord references.
- Phrase, motif, variation relationship, source/provenance and confidence.
- Capability and fidelity flags (e.g. unsupported articulation, unrepresentable Tidal live-code semantics).

The pipeline is `SongState → MusicalContext → MusicalPlan → CandidatePhrase/MusicalIR → validation → Tidal renderer → audition → accepted typed transaction`.

Preserve a **validated raw-Tidal escape path** for live-code features MusicalIR cannot faithfully represent. Declare lossy conversion rather than discarding user's existing music. Version tests must cover round-trip, tempo mapping, rests, triplets, polyphony, ties, sample numbers, and changing meters where supported.

Illustrative event:

```json
{"track_id":"d6","bar":2,"onset_ticks":480,"duration_ticks":240,
 "midi_pitch":76,"velocity":92,"articulation":"staccato","motif_id":"hook-1"}
```

## 5. Composer brain and adaptive orchestration (D10/D18)

### ComposerProvider

Proposed interface concepts: `id`, `model_version`, `capabilities`, `estimate_cost()`, `health()`, `generate(plan, context, budgets)`, `cancel()`, `explain_limitations()`. Return candidate IDs, MusicalIR, provenance, seed, consumed resources and failure modes. Keep **current generators as the baseline provider**.

Potential optional provider families:
- Specialized symbolic MIDI generation / conditional track infilling.
- Phrase/motif transformations and ensemble-aware arranging.
- Audio-generation/reference providers for expressive timbral experimentation, **not direct overwrite of editable symbolic song state**.
- Later Level 7 locally adapted or trained models behind the *same capability contract*, without mandatory retraining now.

### ContextRouter

Local first: parse user intent, target roles/ranges, known genre/subgenre, profile, approved song state, locks, inventory and budget. Fast paths for lookup, deterministic selection and validation. For hard creative tasks only: retrieve relevant knowledge → optionally expand evidence → invoke creative composer → optionally critique/refine a bounded number of times.

**Strict precedence:** (1) permission/license/safety; (2) current SongState, locks and inter-track dependencies; (3) user edit scope; (4) approved contextual memories; (5) expert retrieved evidence; (6) candidate creativity.

All optional escalation requires a reason, trace and configured ceilings (tokens, time, number of candidates, turns, CPU/GPU). Do not use a universal multi-agent loop.

### Critics

Separate deterministic checks (bar lengths, scope, harmonic targets, range, valid sounds) from subjective musical heuristics (groove, motif variety, voice leading, genre markers) and human listening. Critic scores are **diagnostic signals**, not an objective artistic truth. Human A/B is authoritative for preference; specialist reviewers evaluate release candidates.

## 6. Knowledge retrieval and multimodal RAG (D01/D11)

Use one `RetrievalProvider` contract with metadata filtering, top-k and provenance:

1. **Local structured metadata**: genre, subgenre, era, ensemble, instrument, role, articulation, quality, source license, user scope.
2. **FTS5 lexical retrieval** over concise expert skills and user-approved notes.
3. **Optional local embeddings** for semantic relevance and reranking when benchmarked.
4. **Optional CLaMP 3-like multimodal embeddings** to retrieve related text, scores, MIDI and audio from rights-cleared corpora. This is retrieval, **not generative composition**.
5. **Optional temporal/graph relationships** (Graphiti-like projection) for song versions, accepted revisions, style lineage and inter-track dependencies. Do not entrust canonical song transactions to the graph.
6. **Bounded assembly**: send only short retrieved excerpts or IDs whose value is demonstrated; report why each was selected and which permission allows use.

Never infer an instrument is installed merely because a catalog or semantic search returned it. Treat model popularity as unrelated to suitability. Monitor false retrievals and contamination of genre expert rules.

### Expert knowledge structure

A compact router plus deep references is preferable to one huge skill. The audited loader in `server/skills.py` used `MAX_LOADED=2` non-pinned skills, `BUDGET=24000` chars, `MAX_FILE=9000` chars, commonly one reference per skill; verify current behavior. Increasing prompt budget is **not** an architectural fix.

Separate:
- Genre-specific rules, traditions and regional variants.
- Melody/harmony, groove/microtiming, arrangement/form, sound selection, critique.
- Evidence quality, references, license and uncertainty.
- Expert knowledge **versus** subjective user likes.

Avoid claiming universal rules from few transcriptions. The observed `style_profiles.json` once contained merengue examples from 3 songs, salsa 7, cumbia 9: correlated bars are not independent songs.

## 7. Memory, My Styles, cases and templates (D02/D09/D12/D13/D16)

### Memory hierarchy

`current song approvals/locks > approved per-genre/per-role/style memories > approved general user preferences`, with expert knowledge in a separate referenced library. Provisional patterns discovered from a session may influence only that local session and must not become permanent cross-project rules without approval.

### Entity contracts

- `ApprovedMemory`: scoped claim/preference, confidence/evidence, accepted_at, author, version, active/pinned flag, provenance, privacy/sync scope.
- `MemorySuggestion`: detected pattern, supporting positive/negative evidence, uncertainty, source projects, proposed scope, group/dedup ID, review state (pending/accepted/edited/postponed/rejected).
- `StyleRecipe`: arbitrary user-defined label (e.g. **Style X**), version, genre tags, groove rules, instrumentation/roles, articulations, arrangement features, reference cases, license and permitted reuse modes. A style **is not an automatic melody/song clone**.
- `MusicalCase`: source song/version and accepted solution; musical problem, intended role, before/after, relationship across instruments, why user accepted it, authorizations and references.
- `SongTemplate`: versioned song structure, sections, parts, inter-track dependencies, symbolic content refs, adaptation constraints, and explicit permissions for any literal assets.
- `KnowledgeAsset`: ID/hash, media type (text/MIDI/audio/score), origin, attribution, license, restrictions, user rights, retention policy and permitted destinations.
- `ListeningEvidence`: context-specific choice/rejection/undo metadata; user preview alone is not a positive endorsement.

### User experience

`My Styles` / `Musical Knowledge Studio` supports naming, categories, browsing, filters, edit/pin/disable/delete, import/export, version comparison, provenance, visual relationships, proposed-memory inbox, style A/B audition, and explanation of retrieved sources used in a proposal.

**Three distinct template reuse modes:**

1. **Inspiration** — use transferable relations as references; generate new original material.
2. **Transformation** — remap structure/groove/parts to target key, harmony, meter, tempo and ensemble with preview/validation.
3. **Literal copy** — explicitly user-selected, legally permitted material only; log source and authorization.

For each mode, destination song locks and approved parts still win. A transformation cannot mutate its source template.

### Evidence pipeline

Record only relevant events: candidate shown, candidate heard, picked/rejected/undone, user corrections, explicit style saves. Accumulate provisional candidate memories, deduplicate and group them, compute descriptive confidence with source evidence, and present non-intrusive review. **Never silently promote to global permanent memory**.

## 8. Instrument selector and performance (D06)

Instrument selection is a host-side deterministic pipeline:

`(genre, variant, role, desired articulation, pitch range, phrase, installed inventory, SongState choices) → eligible sources → scored top 2–3 → same-phrase audition → explicit pick`.

Track separate states: *listed in catalog*, *downloaded*, *loaded into SuperDirt*, *actually playable*. Compare attack, decay, articulations, range, dynamics and provenance. For merengue, separate güira scrape gestures and tambora rim/open/muted strikes; distinguish accordion phrase attacks and brass short/long articulations. EQ/reverb cannot substitute for the wrong source.

Try the existing `inventory.py`, `instcatalog.py`, `instlib.py`, `engines.py` paths before adding dependencies. Optionally run Essentia/librosa on rendered audio **only when needed**, and CLAP-like embeddings only for descriptive timbral similarity. Acoustic metrics do not certify authentic genre feel. Ask before downloading assets or executing external code.

## 9. Course alternatives and candidate workflow (D04)

At a relevant course step, show the **precomputed preset** alongside **Ask Maestro for another musical proposal**. Initial likely scope: melody/brass steps, not automatic replacement of drum patterns. The user may request alternate melody, rhythm-only changes to melody, new notes with rhythm fixed, or motif development; extend other roles by explicit design.

Generate ~3 alternatives as a configurable default, audition them with the *same unchanged* accompaniment/tempo/sounds/harmony, then let the user pick or keep the original. Save snapshot and accepted motifs/seed/model context for subsequent steps. Provide an undo path. Without an AI service, the preset/course remains usable.

The UI already has proposal and pick concepts; inspect `web/app.js` and `web/variants.js` before inventing a parallel state machine.

## 10. Genre-aware ensemble composition (D03)

| Genre/variant | Arrangement model must consider | Failure mode to reject |
|---|---|---|
| Merengue típico | Accordion lead, güira with articulated scraping, tambora gestures, active bass, appropriate sax replies | Treating all percussion as one kick/snare or imposing salsa clave |
| Merengue orquesta | Piano, bass, Dominican percussion, brass section voicing, mambo/jaleo and coordinated entries | Endless unphrased brass ostinato |
| Salsa (2–3 / 3–2 as relevant) | Clave **orientation**, conga/tumbao, anticipated bass, guajeo/montuno, bell and vocals | Forcing every melody note onto a clave strike |
| Timba | Multi-track coordinated 'gear' changes and intentional section transitions | One isolated random fill called a 'gear change' |
| Bachata | Requinto/segunda roles, expressive guitars, bongó, güira and bass | Identical generic strums for every guitar role |
| Cumbia variants | Colombian, sonidera, villera, chicha etc., chosen **before** instrumentation/rhythm mapping | One undifferentiated kit renamed 'cumbia' |
| Reggaeton (control) | Preserve existing electronic groove strengths | Regressions from rules tuned for unrelated genres |

Brazilian styles (samba/pagode/bossa) may be additional cases where existing coverage warrants, but should not displace approved D03 priorities.

Build a 2–4 bar **inter-track interaction map**. Subdivision/percussion creates opportunities for bass; bass anticipations inform harmonic changes; piano leaves space for lead; brass answers phrase gaps; arranger coordinates section transitions. A generative model can propose events, but host validation checks interdependencies and authorized changes.

## 11. Git, synchronization, privacy and retention (D12/D14/D15)

- Transactional local store manages live songs/memories, with stable IDs and schema migrations.
- Export approved musical knowledge, styles, cases, templates and meaningful song snapshots to readable versioned files and manifests, including content hashes, license, source references and schema versions.
- Make **automatic local commits for approved milestones** (e.g. save/update Style X, accept a reusable memory, consolidate a song version), not every listen/render/candidate.
- **Remote sync must be opt-in**. Data Git repository or isolated namespace is distinct from application source code; never auto-push private content.
- On divergent revisions, show entity-aware musical differences and retain both variants until a safe human-approved merge. Locks must not be overridden by a Git text merge.
- Git stores history: deleting the latest file does **not** remove older commits or remote clones. Provide safe exclusion, desindexing, future-history policies and documented exceptional purge mechanisms; do not guarantee erasure outside controlled storage.
- Keep provisional evidence, sensitive recordings, caches, model binaries and large artifacts out of Git unless explicitly requested and eligible. Git LFS or verified references are optional for eligible large files.
- Approved data persist until user deletion; provisional evidence/auditions/renders/caches have configurable expiration.
- Rebuild FTS, embeddings and graph projections from authorized source data; honor deletions, license changes and revocations.

## 12. Compatibility, fallback and rollout principles

- Compare all design assumptions with the **current** `main`; the 2026-11-24 baseline is an audit snapshot, not a guaranteed current tree.
- Add migrations that preserve existing .tidal/.hs songs and course presets; provide safe import/export and known-loss warnings.
- Enable new providers behind capability/feature toggles; absence of CLaMP 3/Graphiti/GPU must not prevent baseline functionality.
- Cache indexed features by asset hash + permissions + model/index version; invalidate correctly.
- Reject stale or unauthorized proposals; never overwrite state because an LLM returned 'valid' JSON.
- Use release-level musical evaluation before claims of improvement. See [EVALUATION.en.md](EVALUATION.en.md).

**Do not build everything at once:** strong contracts now, evidence-gated modules over time.
