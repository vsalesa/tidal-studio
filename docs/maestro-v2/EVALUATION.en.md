# Maestro v2 — Evaluation and Quality Gates

**Objective:** prove improvement in *audible composition quality* and protect musical state. No benchmark results or claimed gains exist from this blueprint alone.

## Representative benchmark matrix

| Case | Arrangement/skills under test | Expected properties |
|---|---|---|
| Merengue típico | Güira, differentiated tambora gestures, bass, accordion; lead/reply | Authentic role interaction, phrase breaks and articulation |
| Merengue orquesta | Piano, Dominican percussion, bass, brass, mambo/jaleo | Coordinated section responses, plausible ranges and breaths |
| Salsa 2–3 and 3–2 | Montuno/guajeo, tumbao, congas, optional bell and voice | Clave-aware interaction without forcing every note onto clave |
| Timba | Coordinated gear transitions across bass/piano/percussion | Audible whole-ensemble switch, planned return |
| Bachata | Requinto, segunda, bass, bongó/güira | Distinct guitar roles and expressive phrase arcs |
| Cumbia (two variants) | E.g. Colombian and sonidera; variant-specific roles | Not the same generic MIDI pattern under two names |
| Bossa (optional) | Nylon guitar voicings, sparse melody, subtle percussion | Genre-sensitive nuance, secondary to D03 |
| **Reggaeton** | Existing persuasive groove/courses | **Must not regress** |

Use approved/licensed MIDI/audio sources. Keep era, subgenre, ensemble, bar count, playback assets, source and license annotations.

## Four independent test layers

### I. Hard deterministic safety gates (must pass)

- Permission/source license check before retrieval, copying, exporting or syncing.
- Exact identity/hash preservation for locked and approved tracks outside edit scope.
- Base song revision matches; stale proposals rejected.
- Bar/beat length, meter, note range, allowed events/roles, resource IDs, renderer syntax.
- Candidate differs meaningfully from preset or prior alternatives.
- Copy/paste into another song never occurs through an *inspiration* or *transformation* request.
- Rollback/undo reproduces the exact previous accepted state.
- Provider or remote-sync failure preserves the previous song and data.

### II. Musical heuristics (diagnostic, not definitive)

- Motif identity and transformed recurrence.
- Phrase segmentation, rests, melodic direction, climax, cadential behavior.
- Anticipation and rhythmic relationship among bass/percussion/piano.
- Competing roles, voice leading, dynamics and articulation.
- Transitions and ensemble-level gear coordination.
- Style specificity rather than generic note density.

A symbolic score is not equivalent to quality. Beware of benchmark gaming and overfitting to a small song corpus.

### III. Human A/B listening

- For **composition** comparisons: freeze timbre/sample inventory, tempo, accompaniment, gain and other non-compositional variables; compare changed symbolic musical content.
- For **sound/articulation** comparisons: freeze MIDI/events while changing the chosen source/articulation.
- Blind ordering where practical, matched loudness, balanced sample order, same excerpts.
- Record preference, perceived defects, confidence and disagreement; allow 'no preference'.
- Distinguish everyday user audition from *release-level* genre-expert review.
- Only declare superiority when sample size/uncertainty and baseline conditions justify it. Suggested 60–65% blind preference is an aspirational threshold, **not an observed result or guaranteed acceptance criterion**.

### IV. Experimental retrieval/memory/model evaluation (D17)

Controlled ablations, with fixed inputs, seeds where possible, number of candidates, accepted song version, instrument renderer and budgets:

- Current composer vs new composer.
- RAG on/off, approved memories on/off.
- Optional CLaMP 3-like multimodal retrieval on/off.
- Optional Graphiti-style temporal retrieval on/off.
- Different provider versions/critic configurations.
- Same instrument events with alternative samples/articulations.
- Genre/subgenre-specific breakdown and reggaeton no-regression.

Metrics: correct retrieval rate and provenance, permission errors, session-state contamination, motif/arrangement diagnostics, blind human preference, time to accepted solution, user acceptance/rejection, latency, input/output tokens, cost, cache hit rate and CPU/GPU/memory use.

For each release candidate publish: test manifest, model/prompt/index versions, asset licenses, dataset revisions, seeds, engine versions, musical samples with rights, statistical uncertainty, failure cases and rollback plan.

## Feature activation policy

**No optional new model is required just because it is state of the art.** Add a provider only if it proves value in at least one defined musical use case with acceptable resources, clear provenance, correct user-facing controls, and no degradation of safety/reliability.

## Source and licensing notes

The Google Magenta Groove MIDI Dataset (CC BY 4.0) may help study expressive drumming but does not replace authenticated Dominican tambora/güira and Latin bass examples. Use curated and appropriately licensed examples. Do not bundle copyrighted melodies simply because they are publicly downloadable.
