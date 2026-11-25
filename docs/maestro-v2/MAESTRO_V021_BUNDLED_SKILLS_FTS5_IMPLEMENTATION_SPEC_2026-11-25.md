# Tidal Studio v0.21 — Bundled Musical Skills + Persistent FTS5 Knowledge Engine

**Status:** IMPLEMENTATION HANDOFF / PROPOSAL FOR CLAUDE CODE  
**Date:** 2026-11-25  
**Baseline:** `vsalesa/tidal-studio` `main@2a8298e95eb0783cdaef34509139e5142e5ed7f9` (v0.20.0 merged, PR #71)  
**Implementation authorization:** This document is a specification, **not** an instruction to modify repositories until the user explicitly asks Claude to implement v0.21.  
**Scope:** Application runtime, *not* installing skills into the user's personal Claude Code environment.  
**Primary objective:** Ship a carefully curated collection of third-party musical Agent Skills *inside the Tidal Studio desktop installers* for macOS, Windows, and Linux, then incrementally index their Markdown contents in a persistent, locally stored SQLite FTS5 knowledge database. Retrieve only the relevant semantic sections with adaptive parent/child context for each musical task, with measurable music-quality non-regression, offline availability, reproducible provenance, and no need for globally installed Claude plugins.

---

## 0. Executive decision

**Build v0.21 as a Music Knowledge Runtime, not another generic skill loader.**

- Markdown files (`SKILL.md`, `references/*.md`) remain the **authoritative source**, packaged with the app; do **not** replace them with SQLite records or rewrite their musical content in a database.
- SQLite stores **metadata, file/section references, version hashes, and an FTS5 inverted index**. It must be reconstructible; no second readable copy of whole Markdown is necessary.
- On first launch, locally **bootstrap/index bundled skills with no network**. On app update or any authorized skill/plugin change, **reconcile** added/changed/deleted files and update the index incrementally and atomically.
- For each Maestro request, select by **task + genre + instrument/role + current SongState + approved personal preferences**, rank via FTS5 BM25, then load suitable child snippets **with enough parent context and exceptions**. Do not load all installed skills or always send their full catalog.
- Keep v0.20 `smart/whole` compatibility, `mas_skills` follow-up, chips, monitoring and current CLI (`claude -p`) support. Preserve locks, human approvals, and user's personal-memory separation.
- Prefer deterministic routing and efficient one-call execution. Additional LLM roundtrips and expansion are exceptions, not the default.
- Ship **six selected, text-only, permissively licensed third-party skills** as a candidate v0.21 core; stage actual enablement behind evidence and license review. Do not include source-code music engines or binaries merely because a skill describes them.
- Keep `vsalesa/music-composition-skills` available through its existing plugin flow **unless its redistribution rights have been verified**. Its source currently expressly says it is downloaded on first launch instead of bundled because of copyright-related source references. Avoid accidentally bundling it through a new packaging step.

**Terminology (never conflate):**

1. **Bundled / installed**: files already reside in the app's offline installer and can be indexed. This is the default for the curated set.
2. **Indexed**: metadata and searchable terms have been added to the local SQLite database.
3. **Active / eligible**: the user allows this skill to influence retrieval.
4. **Retrieved**: selected section contents were read from the Markdown source for this request.
5. **Injected**: the retrieved text was actually sent to the LLM on that request.
6. **Used**: a resulting musical decision cites the retrieved knowledge; do not infer usage merely from installation or injection.

---

## 1. Verified v0.20 baseline and gaps

The project currently has the following implemented features:

- `server/skills.py`: `scan`, `_ranked`, `_split`, `_chunks`, local Python `_bm25`, `_select_smart`, `_select_whole`, and `sections_for`.
- `smart` mode: Markdown sections by heading; large sections broken by paragraphs; title bonus; short skill catalog; one introductory section; index of omitted section headings; `mas_skills` can trigger one extra Claude call.
- v0.20 budgets: `SMART_BUDGET=8000` characters, `SEC_MAX=2600`, `HEAD_MAX=1200`, `CAT_MAX=8`, `INDEX_MAX=20`, `EXTRA_MAX=8000`; previous hard budget `BUDGET=24000` chars. These are **character counts, not measured model tokens**.
- In-memory `_SEC_CACHE` keyed by file modification time. Every request still involves scanning/ranking skills; the system has **no persistent skill FTS5 index**. It already has an *unrelated* SQLite song index (`server/songindex.py`), whose FTS5 design can inform reuse but must not be confused with the skill index.
- `server/app.py`: `skills_text`/`with_skills`, `mas_skills` second-call path, `smart/whole` setting, and RAG monitor integration. Existing `mas_skills` is string-based; retain compatibility via an adapter.
- `tests/test_skills_smart.py`: six synthetic tests; no verified expert-labeled retrieval benchmark, multilingual regression corpus, parent-context preservation test, or blind musical A/B comparison.
- Build scripts copy the entire `skills/` folder into application installers: `packaging/macos/build.sh`, `packaging/windows/build.sh`, `packaging/linux/build.sh`. Existing built-ins are `livecoding`, `strudel`, `music-composition`.
- **Important packaging behavior:** Windows/Linux `packaging/common/launcher.py::sync_app` copies runtime files into the user's writable data folder **without deleting obsolete app files**; macOS `packaging/macos/run-studio.sh` uses `rsync -a` without `--delete`. A removed/renamed bundled skill may remain on disk after an upgrade. v0.21 needs an explicit manifest and a safe upgrade reconciliation mechanism.
- `server/plugins.py::ensure_defaults` downloads `https://github.com/vsalesa/music-composition-skills` at first run into `my-plugins/`, *not* bundled. It explicitly cites copyright-related sources as the reason. Keep the existing behavior by default until rights are reviewed, and handle offline as a valid state.
- `server/llm.py::claude_run` already invokes Claude CLI with temporary working directory, `--tools ""`, `--no-session-persistence`, `--strict-mcp-config`, and `--system-prompt-file`. These measures do **not** prove global Claude user skills/plugins are suppressed.

**Specific v0.20 problems to resolve:**

1. `max chars` is not a reliable tokenizer budget; the short catalog, headings, and follow-up retrieval also consume tokens.
2. Existing `_split` treats all headings as separate flat sections and limits by raw characters. Long single paragraphs or fenced blocks can be truncated (`para[:SEC_MAX]`), losing code fences or musical exceptions.
3. v0.20 has no explicit parent-child section dependency model; removing background can produce musically incorrect rules.
4. mtime-only cache may miss atomic replacements with reused timestamps; it does not robustly track renames/deletions or app upgrades.
5. Indexing/ranking not persistent; adding libraries makes per-request text scanning expensive.
6. v0.20 reports a claimed **55% reduction in skill characters across four sample requests**, not an established reduction in billed tokens or a musical quality improvement. Preserve the measurement, but do not present it as proof of quality.
7. `mas_skills` can force a complete second LLM request, inflating aggregate tokens/latency; measure *total request cost*, including this follow-up.

---

## 2. Curated Internet skill selection — bundle recommendations

### 2.1 Recommended core: ship as Markdown resources inside the app

**All inclusions are subject to automated source pinning, actual license/NOTICE validation, and human redistribution review before release.** The stated MIT licenses were inspected in the repositories on 2026-11-25. A permissive repository license does not automatically authorize every referenced audio sample, model, image, data set, or external service. Copy only the curated, verified *text files* and their permitted Markdown reference documents, not linked assets blindly.

| Tier | Exact skill + original path | Repository and pinned source head *for initial review* | Primary musical value | Suggested shipped state | Why / caveat |
|---|---|---|---|---|---|
| A | **`music-evaluate`**, `skills/music-evaluate/` | `sb-dev/music-production-skills` @ `aa3933bc87f54a48ec018bb868bf6385b340db22` (MIT) | Lifecycle-aware composition vs arrangement vs performance evaluation, fault isolation, preservation of locks, narrow corrections | **Bundled, eligible; prioritized for evaluate/refine tasks** | Strongest immediate differentiated value; use documented criteria, but do not execute Node/FFmpeg scripts unless separately integrated |
| A | **`music-compose`**, `skills/music-compose/` | Same repo and commit (MIT) | Alternatives, selected/approved/locked decision states, scoped composition/arrangement revision, lineage | **Bundled, conditional** | Overlaps the existing `music-composition` and `mc-*` content; only activate relevant novel sections after a retrieval/quality ablation; no automatic Replicate calls |
| A | **`arrangement-advisor`**, `skills/arrangement-advisor/` | `Vocaler-AI/music-skills` @ `4479796b9f05e2fc300fee1a848b0effa1993b8a` (MIT) | Part-entry strategies, fills, inter-section energy, counterlines, avoiding crowded/static arrangements | **Bundled, eligible** | Highly applicable to whole-song architecture and genre-aware instrumentation |
| A | **`melody-writer`**, `skills/melody-writer/` | Same Vocaler commit (MIT) | Pitched and rhythmic topline generation, motif/phrase/contour and voice range | **Bundled, eligible for melody tasks** | Written primarily for vocal toplines; mark vocal-only sections as such; do not apply lyric-specific rules to instrumental phrases by default |
| A | **`hook-writer`**, `skills/hook-writer/` | Same Vocaler commit (MIT) | Memorable thematic hooks, repeated rhythmic/melodic motifs, chorus lift | **Bundled, eligible** | Differentiate lyrics/chants from instrumental motif use; cross-check with current song harmony and genre |
| B | **`prosody-checker`**, `skills/prosody-checker/` | Same Vocaler commit (MIT) | Lyric stress, singable vowels, syllable/beats alignment and breathing | **Bundled, disabled unless lyrics/vocal workflow is present** | Future-ready, but should not pollute purely instrumental salsa/merengue tasks |

**Optional next candidate after proof of benefit:** `Vocaler-AI/music-skills/skills/instrument-expert/` (MIT). It offers playable instrument range/techniques; much may already exist in `mc-orchestration`/local sound inventory. Do **not** turn it on automatically without measuring unique value. It can be shipped disabled if the approved bundle budget and legal review permit.

**Selection rationale:** complement the app's current generic composition knowledge and its Latin-specific library rather than replacing it. The first release should be compact and auditable; app installations can grow later without changing retrieval architecture.

**Do not ship by default in v0.21:**

| Source | Decision | Reason |
|---|---|---|
| `sb-dev/music-production-skills/skills/music-produce` | **Not in core** | Replicate model orchestration, optional remote generation, API token, Node+FFmpeg dependencies; overlaps existing audio engine and would introduce a second production pipeline |
| `the0cp/beatflow-skill` | **Separate evaluation only** | Potentially valuable deterministic Python MIDI composer/validator but GPL-3.0-only; integration and redistribution obligations need explicit legal/product review; not a simple text-only skill loader |
| `owoevan-dev/music-skill` | **Separate prototype, not bundled** | Powerful note-level composition/rendering, but 30k+ character skill with Python, NumPy, FluidSynth, sound banks, and a GPL-licensed helper; major dependency/redundancy burden |
| `EtienneLescot/claude-music-skill` | **Later** | Attractive orchestral/studio workflows, but narrower value for initial Latin genre focus and more execution dependencies |
| `doseedo/skills` | **Optional future provider integration** | Remote DAW/stem/transcription services, not a replacement for musical retrieval |
| Vocaler `genre-expert` | **Defer** | Broad genre guide, partly redundant with genre-specific Latin knowledge; prioritize specialty rules and audition/quality validation |
| The entire third-party repositories | **Never indiscriminately bundle** | Many skills are guides for other agents, reference remote services, duplicate prompts, or contain executable scripts not supported by Maestro |

**Links and license checks**:

- https://github.com/sb-dev/music-production-skills/tree/aa3933bc87f54a48ec018bb868bf6385b340db22/skills
- https://github.com/Vocaler-AI/music-skills/tree/4479796b9f05e2fc300fee1a848b0effa1993b8a/skills
- https://github.com/the0cp/beatflow-skill (GPL-3.0-only; not core)
- https://github.com/owoevan-dev/music-skill (MIT repo; check individual GPL helper and sample rights)
- https://github.com/EtienneLescot/claude-music-skill
- https://github.com/doseedo/skills
- Current user-authored Latin library: https://github.com/vsalesa/music-composition-skills (do **not** assume redistributable)

### 2.2 Redistribution and provenance gate

Before adding a vendored file, record: upstream repository URL, exact commit, upstream relative path, SPDX license, original author(s), exact local package path, SHA-256, copied vs adapted, third-party notice text, and whether external assets are referenced. Keep a local `LICENSE`/`NOTICE`, and update `CREDITS.md`/`skills/README.md` as needed. No downloading external code, images, sound fonts, MIDI songs, or other resources at install time.

No modification of upstream text unless necessary for Tidal context; if adapting, preserve upstream original separately as legally appropriate, document differences, and do not represent derived musical rules as upstream verbatim. **Never execute upstream scripts automatically by merely installing a skill.** Mark `execution_supported=false` in manifest unless a separate trusted adapter exists.

### 2.3 Bundle layout

Suggested structure (exact filenames up to implementation):

```text
skills/
  livecoding/                        # existing, untouched
  strudel/                           # existing, untouched
  music-composition/                 # existing, untouched
  bundled-third-party/
    music-evaluate/SKILL.md
    music-evaluate/references/*.md   # reviewed text references only
    music-compose/SKILL.md
    music-compose/references/*.md
    arrangement-advisor/SKILL.md
    melody-writer/SKILL.md
    hook-writer/SKILL.md
    prosody-checker/SKILL.md
    LICENSES/                        # upstream copyright and license notices
    BUNDLE-MANIFEST.json             # authoritative manifest for managed bundled resources
```

**Compatibility caveat:** `skills.scan()` currently assumes a **skill folder directly below `skills/`**. Either use direct folders (`skills/music-evaluate/`, etc.) or extend discovery deliberately to support `skills/bundled-third-party/*` without recursively treating `LICENSES` as skills. Do not introduce the above nested layout and expect the v0.20 loader to find it automatically. Use stable qualified IDs to avoid a `music-compose` name collision with a plugin-provided skill.

Recommended ID format: `builtin:music-evaluate`, `builtin:arrangement-advisor`, `plugin:<plugin-name>:<skill>`, `user:<name>`. Preserve human-readable names as display labels. The router must never inadvertently treat same-name skills from different origins as one, or silently let user content overwrite an app-managed copy.

**Bundle manifest example** (illustrative, not a committed artifact):

```json
{
  "schema_version": 1,
  "bundle_id": "maestro-v21-curated-music",
  "bundle_version": "0.21.0",
  "files_root": "skills/bundled-third-party",
  "skills": [
    {
      "id": "builtin:music-evaluate",
      "folder": "music-evaluate",
      "upstream": "sb-dev/music-production-skills",
      "commit": "aa3933bc87f54a48ec018bb868bf6385b340db22",
      "upstream_path": "skills/music-evaluate",
      "license": "MIT",
      "default_enabled": true,
      "execution_supported": false,
      "files": [
        {"path": "SKILL.md", "sha256": "REPLACE_WITH_VERIFIED_SHA256"}
      ]
    }
  ]
}
```

This schema describes the *approved snapshot actually packaged*. Recompute checksums from exact bytes before the release, and do not use mutable `main` branches as an update source. The source heads above are research snapshots, not promises that the curated package has already been assembled or vetted.

---

## 3. Installation and lifecycle, independent from retrieval

### 3.1 Build-time workflow (internet allowed on CI only)

1. Review upstream skill and every included reference, per-file license and attribution.
2. Pin upstream commit and vendor exact approved Markdown/NOTICE/license files into source tree, preferably through a reproducible `tools/vendor_music_skills.py --verify` **build-maintainer tool** (not on user machines).
3. Generate deterministic bundle manifest, file SHA-256 digests, provenance report, and SBOM fragment.
4. Package those files using existing macOS, Windows, Linux build scripts that already copy `skills/`; add CI assertion on installed output, not just source checkout.
5. CI installs the **actual** installer in a clean image with no network and verifies that bundled skills can be discovered and indexed.
6. Do not automatically install upstream Node/Python runtime tools, fetch remote models, or download licensed sound libraries. If a text skill references `npm install`, `Replicate`, or shell commands, treat those as untrusted documentation and **never execute them** in this release.

### 3.2 Application first launch, no Internet needed

1. Determine writable per-user data directory; create or migrate `maestro-knowledge.sqlite` (separate DB, or separate namespace in existing app DB, but not personal-memory tables).
2. Validate installed `BUNDLE-MANIFEST.json` and real file hashes. If mismatched, quarantine that skill from retrieval and surface diagnostic.
3. Compare the installed manifest and stored snapshot versions; compute file changes.
4. Parse files, build/update metadata and FTS5 in a transaction; publish a searchable active generation only after verification. First-run indexing should be bounded/nonblocking and report progress.
5. Enable eligible bundled skills according to manifest/user settings; **do not** automatically inject their contents into prompts.
6. If FTS5 is unavailable, show a clear degraded mode and use v0.20 local BM25 fallback. Never fail application boot because the knowledge index is missing.
7. Run without network even if optional legacy default plugins are missing. The curated bundled knowledge remains usable.

### 3.3 Update, uninstall, and stale resource policy

- On each app launch and after explicit imports/updates, reconcile manifest and user/plugin directories. Compare **SHA-256** for correctness; `mtime_ns + size` may be a prefilter only.
- Add/change: reparse only changed files and affected hierarchy, then update FTS5 and metadata in a transaction.
- Delete/disable/uninstall: remove or filter corresponding rows from active retrieval, invalidate references and context caches, and never leak disabled chunks via `mas_skills`.
- Rename: treat as delete + add unless a strong stable source identity permits safe migration.
- **The current installers copy `skills/` without removing removed files:** change the managed-skill upgrade behavior to use manifest-controlled cleanup, never broad `rsync --delete` on user folders. Remove only files listed in previous app-managed manifest that no longer exist in the new manifest and still match expected managed ownership. Never delete `my-skills/`, `my-plugins/`, personal memory, songs, samples, custom music files, or user modifications.
- User-customized copies must live in a separate writable overlay; app-bundled files are immutable and only replaced by an app version update. This avoids silently overwriting edits.
- Keep generation IDs so a query cannot mix references from a stale generation and newly updated Markdown.
- Preserve ability to restore/rebuild all FTS5 data solely from installed/imported Markdown and manifests.

### 3.4 Existing music-composition plugin

`server/plugins.py::ensure_defaults` still downloads `vsalesa/music-composition-skills` on first launch and the main code expressly avoids bundling it due to source copyright. Keep this **legacy/optional** behavior for v0.21. Do not silently vendor that entire plugin. If the product later makes it distributable, perform a separate source-by-source rights audit and migration: one authoritative managed bundle version, no duplicate retrieval, user preference preservation and explicit confirmation before deprecating auto-download.

---

## 4. Knowledge store: Markdown authority + SQLite FTS5 index

### 4.1 Storage and boundaries

- Bundled skill Markdown: versioned app resources, read-only managed snapshot.
- User skills: writable independent locations; require authorization to add and execute *nothing* on import.
- Plugin skills: under Tidal Studio's `my-plugins`, independently from Claude CLI's global plugins.
- Knowledge SQLite: per-user writable **rebuildable cache**, no primary ownership of human-authored skill text.
- Personal memory/approved My Styles: separate canonical data and separate provenance/approval logic; retrieval can combine them with permission-controlled rank but must never merge raw third-party instructions into personal memory automatically.
- SongState remains browser/song-owned as in v0.15+; SQLite knowledge is not an alternate writable song source.

### 4.2 SQLite schema — implementation blueprint

Use a separate database `maestro-knowledge.sqlite` with explicit schema migrations and WAL where reliable. Detect FTS5 availability and `sqlite3.sqlite_version` at runtime, **including the standalone Python shipped by each installer**.

```sql
CREATE TABLE knowledge_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE knowledge_sources (
  source_id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,              -- bundled | user | plugin
  display_name TEXT NOT NULL,
  repo_url TEXT,
  commit_sha TEXT,
  license_spdx TEXT,
  bundle_version TEXT,
  manifest_sha256 TEXT,
  trust_level TEXT NOT NULL DEFAULT 'third_party',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_files (
  file_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(source_id),
  rel_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  generation INTEGER NOT NULL,
  UNIQUE(source_id, rel_path)
);

CREATE TABLE knowledge_sections (
  section_id INTEGER PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES knowledge_files(file_id),
  parent_id INTEGER REFERENCES knowledge_sections(section_id),
  heading_path TEXT NOT NULL,
  heading TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL,             -- policy | explanation | example | code | caveat ...
  estimated_tokens INTEGER NOT NULL,
  generation INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(file_id, ordinal, generation),
  CHECK(start_line > 0 AND end_line >= start_line)
);

CREATE TABLE knowledge_tags (
  section_id INTEGER NOT NULL REFERENCES knowledge_sections(section_id),
  tag_kind TEXT NOT NULL,          -- genre | task | instrument | role | language | intent
  tag_value TEXT NOT NULL,
  PRIMARY KEY(section_id, tag_kind, tag_value)
);

-- The indexed tokens exist in SQLite, but source Markdown text is not stored
-- as a second readable copy. Requires SQLite >= 3.43 for contentless_delete.
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  heading, aliases, body,
  content='', contentless_delete=1,
  tokenize='unicode61 remove_diacritics 2'
);
```

**FTS rowid = `knowledge_sections.section_id`.** Insert indexed heading, expanded aliases and body with the same rowid, then read them back **only from Markdown** using `knowledge_files` + line ranges. `contentless` means stored column values cannot be retrieved from the FTS table. Retain the effective title/breadcrumb in the metadata tables for display.

If the bundled Python's SQLite version is older than **3.43.0**, do **not** assume `contentless_delete=1` works. Options: use a tested compatible contentless delete-command strategy with exact prior indexed content, or atomically rebuild a staging index from Markdown and swap it; do not attempt unsupported DELETE and leave stale terms. Prefer shipping a verified SQLite version on all platforms if that reduces complexity. The FTS5 `bm25()` function returns *smaller = better* ranks.

Proposed lookup, after building a safe `MATCH` query from normalized musical terms, with metadata filtering:

```sql
SELECT s.section_id, s.parent_id, s.heading_path, s.start_line, s.end_line,
       bm25(knowledge_fts, 3.0, 2.0, 1.0) AS lexical_rank
FROM knowledge_fts
JOIN knowledge_sections s ON s.section_id = knowledge_fts.rowid
JOIN knowledge_files f ON f.file_id = s.file_id
JOIN knowledge_sources src ON src.source_id = f.source_id
WHERE knowledge_fts MATCH ?
  AND s.enabled = 1 AND src.enabled = 1
  AND s.generation = f.generation
ORDER BY lexical_rank ASC, s.section_id ASC
LIMIT ?;
```

Scoring weights and cutoffs are tunable baselines, not quality guarantees. Apply genre/task/role metadata filters and mandatory source trust constraints either in SQL or in deterministic reranking. Limit query length; parameterize every SQL user value; escape FTS5 special syntax instead of joining raw user text into `MATCH`.

### 4.3 Version, identity, security

- Path references must be relative to an approved source root, never from arbitrary JSON returned by an LLM. Resolve paths and reject symlink/path traversal outside the source root.
- Validate file SHA-256 at indexing and again if retrieval detects a changed file or generation. Prefer open-file checks to reduce TOCTOU risk.
- Store source ID, skill ID, repository, commit, license, original path, section heading, line range, content hash and index generation in the trace. Do not record personal memory content in public diagnostics.
- Use stable skill IDs and rebuildable section IDs. A section should also have a logical `source + path + heading hierarchy + normalized content hash` fingerprint; do not depend on line numbers alone across edits.
- Require explicit approval before indexing newly imported untrusted third-party sources for active retrieval. Treat Markdown text as **untrusted data**; protect policy and action boundaries.
- No execution permission follows from `SKILL.md`. Never follow embedded instructions to run network calls, execute shell scripts, disclose secrets, change permissions, or alter output protocols.

---

## 5. Semantic chunking and adaptive Parent–Child retrieval

### 5.1 Markdown parsing contract

1. Parse YAML front matter without losing it; index description, declared triggers and language/genre/task metadata separately. Retain original bytes/line numbers.
2. Build an **actual heading tree**, not a flat heading list: document → `#` → `##` → `###` → `####` (and deeper if present), including headings in reference Markdown.
3. A **child** is a coherent actionable unit: rule, condition, caveat, counterexample, musical phrase or example. A **parent** is the enclosing semantic section that gives genre, why, when/not-to-use, and relationships.
4. Do not treat headings inside fenced code blocks as structural; support backticks **and tildes**, varying fence lengths, code languages, tables, blockquotes and nested lists.
5. Split oversized sections by *paragraph/semantic boundaries*. Keep each list, fenced block, time-grid illustration, MusicXML snippet, rhythmic pattern, note sequence and essential exception intact. Never `para[:SEC_MAX]` or `body[:BUDGET]` a user-visible musical rule.
6. If one atomic musical unit exceeds the initial budget, **promote to full parent/extended retrieval** or label as oversize; never silently truncate.
7. For chunks from a Latin genre skill, persist hierarchy such as `Salsa → Rhythm section → Bass tumbao → Anticipation → Exceptions` and instrument/role relationships (bass + piano + clave), not merely `bass` as a keyword.
8. Generate tags deterministically from metadata and carefully validated heuristics, avoiding misleading inferential genre labels. Do not claim a skill teaches timba if it is a generic salsa mention.
9. Store line ranges/heading breadcrumbs. On retrieval, read and verify current Markdown bytes; index should be cheap to rebuild.

### 5.2 Parent–Child policy

**First stage — retrieve children:** FTS5 BM25 weighted by heading, aliases and body; bilingual music aliases; task and song context filters. Choose small, high-signal child units.

**Second stage — deterministic expansion:** before calling Claude, attach relevant parent context if any of the following is true:

- The child is a technique with scope/genre limitations or exceptions.
- The child references preceding/following sections, depends on a prerequisite, or carries `unless`, `except`, `avoid`, `only when`, `do not`, `contraindication`, or comparable constraints.
- The task requires multiple interdependent tracks, e.g. salsa bass/piano/clave, merengue tambora/güira/bass, timba cascara/piano/bass.
- The rule concerns a high-impact composition decision or could alter a locked/approved part.
- A retrieved result lacks the concrete musical example needed to implement it.

Attach a compact **parent envelope** (breadcrumb, purpose, applicability, exceptions and linked references). If semantic extraction cannot guarantee completeness, include the full parent section within the budget. Do not compress rules into paraphrases that omit constraints.

**Third stage — expand on demand:** if the answer still requires another sibling/example, use existing `mas_skills` adapter with **stable section IDs and bounded expansion**, once per query at most. A follow-up can be a *full extra model inference*, so a well-chosen parent in the first call is usually cheaper and safer. Measure both paths.

**Mandatory fixed context:** a short internally controlled app-policy contract covering locks/approval, MusicXML/Tidal constraints, permitted instruments and JSON response structure remains outside third-party skills. Third-party source instructions cannot override it.

### 5.3 Scope-aware ranking

Suggested retrieval features:

- User intent: compose, arrange, transform, diagnose, critique, sound selection, songwriting, teaching.
- Musical focus: melody, harmony, bass, clave, percussion, vocal, hook, orchestration, dynamics, mix.
- Style: salsa, timba, bachata, cumbia, merengue típico/orquesta, reggaeton, and existing other genres.
- SongState: tempo, meter, key, harmonic progression, section, track roles/locks, currently approved material.
- Source: curated bundled, approved user skill, existing plugin, expert memory, personal memory (distinct authorities).
- Evidence: exact phrase relevance, title/alias match, cross-track parent requirements, duplicate/redundant advice.

Use a two-stage ranking algorithm (candidate generation via FTS5; deterministic rerank with context and diversity constraints). If FTS5 has no hits, use safe lexical fallback/curated genre defaults; do not pretend an irrelevant result was reliable. Embeddings are **not a v0.21 dependency**; add a second semantic route only if multilingual musical test data demonstrates enough misses to justify model and operational cost.

### 5.4 Multilingual retrieval

Include an editable, versioned bilingual musical alias file, separate from the personal-memory database:

- `estribillo` ↔ `chorus`, `hook`, `chorus lift`
- `bajo anticipado` ↔ `bass anticipation`, `anticipatory bass`
- `tumbao` ↔ `tumbao`, `bass tumbao`, `piano montuno`
- `clave` in music context ↔ `clave rhythm`, not `key` indiscriminately
- `marcha` in genre context ↔ `merengue marcha`, but not every `march`
- `repique`, `tambora`, `güira`, `guira` (accent normalization)
- `arreglo` ↔ `arrangement`, `orchestration` depending on context
- `contras`, `mambo`, `moña` in appropriate Latin subgenres

Never treat every translation as unconditional equivalence; use genre and role context. Add regression queries for Spanish, English, mixed language, accents, mistakes and colloquial terms.

### 5.5 Token budgets and caching

- Set model-context budgets **in actual token estimates** where a provider-compatible tokenizer is available; otherwise use conservative estimates plus measured provider usage and never label characters as tokens.
- Suggested *initial hypotheses*, not universal limits: 1,000–2,000 expert-retrieval tokens for simple requests; 2,000–4,000 for multi-track composition; allow adaptive expansion only when justified. Keep policy and song context budget distinct.
- Instrument the entire LLM call: fixed prompt, skill catalog/metadata, selected chunks, parent envelopes, song state, personal memory, user prompt, optional extra inference, output and provider cache hits.
- Maintain stable ordering of fixed prompt and retrieved sections for cache efficiency, but **do not freeze selection across a multi-step plan** if the task/section materially changes. Keep already approved/locked context stable.
- Cache by `(query/task hash, song context hash, active index generation, enabled skills/version, permissions)`; invalidate when any input changes.
- Deduplicate nearly identical advice *at injection time* using source priority and trace aliases; keep full provenance in SQLite.

---

## 6. Professional composition safety and quality rules

The retriever must not become a new authoritative music agent. Its outputs are **evidence and guidance**, not commands or automatic changes.

Priority order:

1. User-specified intent and permissions; legal/licensing scope.
2. Canonical SongState and track locks / approved choices / no collateral editing.
3. Validated Tidal Studio MusicXML/Tidal/renderer schemas and actual installed sounds.
4. Approved personal My Styles, scoped memories and templates.
5. Curated expert skill evidence, with provenance and genre applicability.
6. External creative proposals and optional model escalation.

This hierarchy must resolve conflicts predictably. Where approved personal style differs from an external recommendation, disclose the alternative without silently overriding approval.

- Expert corpus must never be auto-approved as a durable personal preference merely because it was retrieved, matched or used.
- Literal musical copying is permitted only where the user selected it and rights allow it, consistent with D16; otherwise use inspiration/transformation, record provenance and avoid copyright infringement.
- Critique a draft based on evidence available: cannot claim to have heard audio when only MusicXML/MIDI is present. Separate deterministic checks from listening or expert assessments.
- Preserve clean baseline reggaeton as well as expanded Latin genres.
- Skills may propose, but **Maestro validates**, and the user approves meaningful edits.

---

## 7. Isolate Claude Code CLI from global user plugins/skills

**Keep the existing `claude -p` route and subscription authentication.** Do not substitute Anthropic API billing, hijack account tokens or implement an unofficial local HTTP API.

The current launch command already uses a temporary cwd, `--tools ""`, `--strict-mcp-config`, `--no-session-persistence`, and `--system-prompt-file`. The two former control tool and MCP availability but **do not guarantee that globally enabled Claude Code skills, plugin hooks, and user configuration are absent**.

Claude Code officially documents:

- `--disable-slash-commands`: **disables all skills and commands for that Claude session**.
- `--safe-mode`: disables customizations including CLAUDE.md, skills, plugins, hooks, MCP servers, custom commands and agents, while retaining auth/model/built-in tools/permissions; any applicable managed settings behavior should be verified.
- `--setting-sources`: selects user/project/local settings sources.
- `CLAUDE_CONFIG_DIR`: moves the Claude Code configuration directory, **which may also affect session/auth state**; do not assume copied or inherited subscription login. Never copy credentials automatically.

Official references:
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/settings

**Recommended implementation order:**

1. Add a configurable `claudecode.skill_isolation` mode with values `default`, `disable_cli_skills`, `safe_mode` and clear diagnostics; default only after feature/capability detection.
2. First test `--disable-slash-commands` together with existing `--system-prompt-file` in the project's supported Claude CLI versions. Verify subscription auth, expected schema/JSON, prompt input, model output, and no automatic global skill availability.
3. Test `--safe-mode` as a stronger isolation option. Verify that it does not strip explicit Maestro system-prompt input or break authentication/streaming/cancel behavior. This may be the best runtime profile if validated end to end.
4. If versions lack these flags, report isolation as incomplete and use explicit manual remediation; **do not silently drop necessary runtime features**.
5. Validate with a purposely planted **sentinel skill** in the user's global Claude Code profile: its sentinel instructions must never appear or affect the Maestro runtime result. Keep personal CLI untouched in the test.
6. Do not add `--plugin-dir` for the bundled music skills: that would reintroduce duplicate/plugin-level retrieval. Tidal Studio is the source of expert context for runtime Claude.
7. Use the app's own `my-plugins/` and `my-skills/` for user-managed Maestro resources; never install the bundled curated set into the user's global `~/.claude`.

**No destructive global cleanup:** do **not** uninstall or disable the user's personal Claude Code plugins automatically. After v0.21 tests pass, the user can choose to disable the global music plugin manually, as planned.

---

## 8. Integrations with v0.19 memory, SongState and v0.20 observability

### 8.1 Interfaces / files to update (bounded)

- **New** `server/knowledge_store.py`: SQLite schema, generations, transactions, integrity, source file reconciliation, rebuild, FTS availability.
- **New** `server/knowledge_parse.py`: Markdown front matter, headings, semantic child/parent structure, line offsets, code fence preservation and fingerprints.
- **New** `server/knowledge_retrieve.py`: FTS query normalization, bilingual aliases, deterministic filters/rerank, deduplication, parent expansion, budget packer, source evidence records.
- **New** `server/data/music_aliases.json`: versioned, reviewed music vocabulary / multilingual synonym map.
- **New** bundled skill directories and authoritative manifest under `skills/`, plus copyright/NOTICE files and `CREDITS.md` updates.
- **Modify** `server/skills.py`: preserve public APIs where possible; delegate smart mode to persisted retrieval; retain `whole` rollback/fallback. `sections_for` becomes stable-ID/manifest-backed; keep adapter for old `skill:filename#Heading` identifiers.
- **Modify** `server/app.py`: index initialization/rebuild API, wiring to installer/plugin updates and per-request source selection; allow nonblocking first-run setup and health signals.
- **Modify** `server/plugins.py`: register imported/updated/disabled plugin source changes with the knowledge store. Preserve current copyright-related default-plugin behavior.
- **Modify** `server/llm.py`: isolation flags and diagnostics for Claude Code only if tested; maintain existing subscription provider and no-tool policy.
- **Modify** `server/router.py`: knowledge-layer metrics, optional controls for index health and retrieval, not another LLM router.
- **Modify** relevant `web/skills.js`, `web/monitor.js`: visible bundled/indexed/enabled/retrieved/injected/used distinctions, provenance, index health, per-request tokens, fallback status and one-click explicit rebuild.
- **Modify** `packaging/common/launcher.py`, `packaging/macos/run-studio.sh` and packaging smoke tests to reconcile managed bundled content on upgrades without touching user data.
- **New** `tests/test_knowledge_store.py`, `tests/test_semantic_chunks.py`, `tests/test_retrieval_quality.py`, `tests/test_knowledge_upgrade.py`, `tests/test_claudecode_isolation.py`, plus curated benchmark fixtures and integration tests.

Do not rewrite the entire backend, change the course engine or replace Tidal/SuperDirt merely to implement retrieval. Keep all modifications narrowly scoped and backwards compatible.

### 8.2 API/result contract example

A retrieval result should expose stable references instead of raw agent-controlled filesystem paths:

```json
{
  "query_id": "local-generated-id",
  "index_generation": 17,
  "task": "improve_bass",
  "genre": "salsa",
  "sections": [
    {
      "source_id": "builtin:music-evaluate",
      "section_id": 845,
      "file": "references/failure-routing.md",
      "lines": [14, 33],
      "parents": [809],
      "license": "MIT",
      "score": {"fts_rank": -3.12, "context_adjustment": 1.0},
      "token_estimate": 212,
      "content_hash": "sha256:...",
      "reason": "request seeks correction of bass section without altering approved harmony"
    }
  ],
  "fallback": null
}
```

This is **illustrative**; scores are diagnostic signals, not probabilities, and exact line ranges must be computed from real files. Do not give the model permission to request arbitrary paths; `mas_skills` can only reference indexed and enabled sections in an authorized source.

### 8.3 UI / RAG monitor

Expose an additional **Knowledge** section (or extend Skills panel) showing:

- Bundled approved sources and license, exact source commit and app bundle version.
- Indexed vs active vs disabled, last successful indexing generation/hash, number of files/sections, and any failure to read/verify source files.
- For each Maestro request: task/genre/role, candidate skills, retrieved children, expanded parents, exact source lines and why, user-memory hits kept distinct, sent tokens estimate, provider tokens if available, extra roundtrips, cache reuse and final usage/decisions.
- Whole-mode baseline comparison for controlled experiments; savings must include the full prompt and all follow-ups, not only text sections.
- Controls: explicit **Rebuild index** (safe, rebuildable), **Disable source**, **View source/attribution**, **Inspect retrieved context**, **Compare quality modes**. Avoid user-unapproved remote updates of bundled content.

Do not show internal untrusted raw skill text as if it were a product policy. Limit log retention and avoid leaking private songs or personal memory to the renderer unnecessarily.

---

## 9. Acceptance and quality validation — mandatory before release

### 9.1 Non-LLM deterministic corpus

Create a stable, human-reviewed benchmark of **at least 60 representative queries** in Spanish, English and mixed language, spanning these five originally prioritized genres plus reggaeton regression and generic songwriting tasks. Each query has expected skill IDs, expected section/parent references, forbidden unrelated sources, a task/genre/role label and severity of missing context.

Example scenarios:

| Task | Must retrieve / validate | Common failure to prevent |
|---|---|---|
| Salsa: improve bass tumbao | Bass anticipation, piano/clave relationship, exceptions | Applying anticipation indiscriminately |
| Timba: piano + bass interplay | Multi-track rhythmic-role context, section-specific variation | Treating timba as generic salsa |
| Merengue típico: tambora/güira and accordion interaction | Genre-specific roles, articulation and actual sound inventory | Replacing real roles with generic GM kit |
| Merengue orquesta: horn section | Arrangement voicings, brass ranges, accents and energy arc | Reusing típico instrumentation blindly |
| Bachata: requinto fill | Phrase space, voice-leading, guitar expression | Overcrowding the vocal phrase |
| Cumbia: several variants | Correct subgenre, rhythm/role distinctions | Mixing sonidera/villera/chicha conventions |
| Reggaeton regression | Correct dembow/genre baseline, locked tracks | Breaking previously strong baseline |
| Instrumental motif | Melody/hook-development chunk with adequate context | Triggering lyrics/prosody unnecessarily |
| Vocal topline | Melody-writer + prosody dependencies when asked | Missing syllable stress/range |
| Technical audio issue | Evaluate by owning stage; do not conflate with harmony | Proposing full recomposition for clipping |
| No relevant source | Explicit 'no match'/safe baseline | Inventing authoritative skill guidance |
| Disabled source | No candidate/no `mas_skills` access | Leaking disabled guidance |
| Global Claude sentinel | No external CLI skill influence | Double loading or contamination |

Use an approved answer key created before measuring. Measure Recall@K, Precision@K, coverage of mandatory conditions/exceptions, correct parent expansion, genre correctness, and inclusion of unauthorized/irrelevant content. Record a per-query trace. **Suggested initial go/no-go thresholds (provisional, to calibrate on baseline):** no critical missing exceptions or lock policy violations; ≥95% high-priority required-evidence coverage in the labeled set; ≥90% Recall@5; every disabled/unlicensed source exclusion correct. Do not hide misses behind average ranking metrics.

### 9.2 Comparative retrieval ablation

Test the *same* corpus under these configurations:

A. v0.20 `whole` (control; raw full selected skills up to previous cap).
B. v0.20 `smart` (current local Python BM25 sections + `mas_skills`).
C. v0.21 FTS5 **child only**, no parent expansion (negative control).
D. v0.21 FTS5 **child + adaptive Parent–Child** (proposed default).
E. D + bundled third-party set disabled (measures retrieval architecture alone).
F. D + six selected bundled skills (measures actual incremental knowledge).
G. D + optional deferred candidates enabled, where legally supported (exploration only).

Isolate changes to prevent confusing better retrieval with new skill content. Hold genre/song/model parameters, requested task, token budget, and candidate seeds fixed where possible. Collect:

- Required-knowledge recall, exception preservation, invalid cross-genre transfer.
- Real input/output/cache usage from provider where available; fallback estimates labeled as estimates.
- Total network/model roundtrips including `mas_skills`, total latency p50/p95, cold/warm index time and DB size.
- Cost per *accepted musical improvement*, not merely tokens per response.
- Fallback rate, index reconciliation correctness, cache hit behavior.

### 9.3 Real music quality: blind listening and reproducibility

Create a small, diverse dataset of fixed song sections (existing suitable user-approved project examples and original/test compositions only, without unauthorized copyrighted copies). Cover salsa, timba, merengue típico, merengue orquesta, bachata, cumbia and reggaeton. Include multiple task types: motif/hook, bass groove, section transitions, arrangement density, sound selection and scoped refinement.

For each candidate output, record full SongState/lock snapshot, model and settings, prompt hash, retrieval provenance, source versions, optional seed and resulting MusicXML/MIDI/Tidal/audio. Reuse the same playable instruments and levels; use loudness-matched blind A/B where applicable, avoid revealing which variant used the new system, randomize presentation order. Ask genre-skilled listeners where available, and general listeners for secondary preference. Collect qualitative defect diagnosis as well as pairwise preference.

**Must pass:**

1. All structural validations (MusicXML parse, timing, bar counts, chord compatibility where defined, executable Tidal syntax/known instrument mapping, no missing locked parts).
2. No unapproved modification of locked/approved tracks; explicit authorization for high-impact collateral changes.
3. No substantiated regression versus v0.20 whole or smart on genre-focused listening. A positive win is desirable but not guaranteed; report CIs/uncertainty rather than inventing significance.
4. Parent–Child performs at least as well as child-only on cases with critical conditions and beats it on documented failure modes. If it does not, inspect chunk boundaries and ranking before release.
5. The six curated skills must each be evaluated for **marginal benefit**; disable or remove those that add no unique benefit or increase prompt conflict.
6. Reggaeton baseline remains stable.

### 9.4 Offline, packaging, upgrade and security matrix

Run CI/package checks on macOS Apple Silicon, Windows x64 and Linux `.deb` paths:

- Install v0.21 **offline**, launch, list all six curated Markdown skill folders and license files, build SQLite index, retrieve a known section, check no network attempts for curated skills.
- Upgrade from v0.20 → v0.21 and from a v0.21 test bundle with a removed/renamed skill; verify no stale managed skill/index hit. **Do not delete user customizations**.
- Update an installed skill Markdown, change headings without changing text, shift line numbers, delete one file, disable/enable a source, remove user skill; ensure accurate incremental indexing/availability.
- Corrupt SQLite, lock DB, revoke write permissions, run without FTS5, use older SQLite, simulate disk-full, or try broken plugin: Maestro still starts and falls back with visible status.
- Create Markdown with malicious instruction to run a command, with `../../` references, nested/tilde code fences, giant single code block, Unicode accents, mixed languages, duplicate headings, invalid YAML, executable-looking snippets, and symlink escape; ensure no execution and no unauthorized reads.
- Test Claude CLI with *global music sentinel plugin installed*: Maestro runtime must not consume sentinel; personal `claude` interactive session remains unchanged; subscription still works.
- Make `mas_skills` request a disabled or stale ID: return no content and no path disclosure.
- Check all three installer layouts contain pinned `LICENSE` and accurate notice/credit information, and each bundled source's SHA matches the manifest.

---

## 10. Implementation plan for Claude — minimize tokens, keep quality

**Do not generate a new architecture from scratch: v0.20 already has the public skill selection surface.** Follow these bounded milestones, each with concrete tests and narrow diffs.

### P0 — Audit + measurement baseline

- Inspect current `main`, `server/skills.py`, `server/plugins.py`, `server/app.py`, `server/llm.py`, `server/songindex.py`, packaging scripts and existing tests. Confirm current SHA. Verify packaged SQLite version on CI targets.
- Collect baseline v0.20 `whole/smart` traces on a fixed reference corpus, including actual LLM tokens/latency and a few real musical A/B samples. Freeze gold labels before tuning.
- Deliver one short scope/decision file and test matrix. Do not change unrelated repositories.

**Acceptance:** tests reproducible; no baseline metrics invented.

### P1 — Bundle curated Markdown, license-aware

- Vendor six exact reviewed skill folders and approved referenced Markdown from pinned commits into managed read-only `skills/` resources; add manifest, licenses, NOTICE and attribution. Keep existing three built-ins and user/plugin discovery.
- Adjust native installer smoke tests and packaging path assertions. Do not rely on runtime GitHub access.

**Acceptance:** offline installed app lists six curated resources, not just the Git checkout; no global Claude plugin needed.

### P2 — SQLite index engine

- Implement schema, versioning, source reconciliation, FTS contentless mode, FTS5 capability probe, source hash verification, delete/rename handling, transaction boundary and rebuild/fallback.
- Add deterministic parsing and indexing tests; source folders may be large, but queries should not re-read unrelated skills.

**Acceptance:** persistence across restart; only modified files reindexed; no stale results.

### P3 — Hierarchical semantic parsing

- Replace naive flat heading extraction in the new engine with parent/child semantic structure; ensure no loss of exceptions, code fences, musical grids or line positions. Keep old v0.20 parser behind fallback.

**Acceptance:** all Markdown round-trip extraction tests pass and `start_line/end_line` match source.

### P4 — Retrieval/reranking and runtime integration

- Add structured task/genre/role context and bilingual aliases; FTS candidate generation; deterministic parent expansion; token-aware packing; measured tokens; stable section IDs; `mas_skills` compatibility.
- Preserve `whole` and old smart as explicit rollback modes for A/B and failure handling.

**Acceptance:** retrieval gold corpus passes; no extra LLM call in simple requests.

### P5 — Claude CLI isolation and memory boundaries

- Capability-test supported Claude Code flags. Enable per-app isolation by explicit setting only after auth and system prompt checks; never mutate global plugins or credentials.
- Keep personal-memory approval/storage semantics separate; enforce SongState locks and user permissions.

**Acceptance:** sentinel plugin absent from Maestro outputs, subscription intact, no lock regressions.

### P6 — Product UI/telemetry and knowledge control

- Add skill source/provenance/index details in Skills UI, rebuild/enable/disable and monitor metrics. Show retrieved vs used distinction, fallbacks and total LLM usage including expansion.

**Acceptance:** every reviewed musical decision can be traced to exact source/version/section, or labeled as model-only.

### P7 — Musical A/B and release gate

- Run A–F ablations, genre-specialist listening, determinism checks, non-regression. Remove/disable unhelpful bundled candidates instead of inflating context. Verify offline packaging for 3 OSes and in-place upgrades.

**Acceptance:** passes criteria in §9 and meets distribution/license audit. Release notes accurately distinguish *installed*, *indexed* and *used*.

### P8 — Optional future engines (not needed to ship v0.21)

- Evaluate BeatFlow as a separate command/API adapter with explicit legal review; consider note-level renderer components only if genre quality benchmarks justify added complexity. Do not import GPL code into the core app by default. Any external audio generation provider requires opt-in, credits/cost, privacy and provenance.

---

## 11. Critical release-blocking risks

| Risk | Mitigation / release condition |
|---|---|
| **Bundled copyrighted source material** | Per-file rights review; do not bundle user-authored `music-composition-skills` plugin by default; include verified MIT text-only resources and notices |
| **Global Claude Code plugins contaminating Maestro** | Test CLI `--disable-slash-commands` or `--safe-mode` with auth+system-prompt; sentinel test; never auto-modify global environment |
| **Stale app-managed skill files after upgrading** | Prior/new manifest reconciliation; safe cleanup of only owned files; generation-verified index |
| **Tiny child chunks alter genre meaning** | Parent envelope and exception preservation with negative-control tests |
| **Character limits cut structured musical rules** | Token-aware packer, atomic paragraph/code policy; never raw truncate |
| **FTS5 not in packaged SQLite** | Capability probe and fallback; test on real offline installed OS builds |
| **Cross-repo/skill duplicate instructions** | Qualified IDs, dedup and relevance scoring, source precedence; measure marginal utility |
| **Extra `mas_skills` call costs more than it saves** | Deterministic parent expansion, track end-to-end token/latency cost |
| **Lyrics guidance in instrumental tasks** | Intent/role filtering, prosody skill disabled when not relevant |
| **Untrusted Markdown tricks model into side effects** | No tools by default, high-priority app contract, treat skills as data, path sandbox, no script execution |
| **Foreign expert guidance becomes private memory** | Explicit separate storage and human approval for durable user memories |
| **Subjective quality regression despite better recall** | Blind musical A/B on genre set; real measurable non-regression; rollback to whole/smart |

---

## 12. Exact handoff prompt for Claude (copy/paste)

> Implement Tidal Studio v0.21 using `MAESTRO_V021_BUNDLED_SKILLS_FTS5_IMPLEMENTATION_SPEC_2026-11-25.md` as the contract. Start by verifying current main SHA and v0.20 public APIs. Distinguish **bundled, indexed, enabled, retrieved, injected and used** skills. Ship only the six curated MIT text-only skills (subject to source/file license verification) with macOS/Windows/Linux offline installers; do not auto-install third-party executable engines or vendor the current `vsalesa/music-composition-skills` default plugin without explicit rights review. Build a persistent, incremental, rebuildable SQLite FTS5 knowledge index with Markdown as source of truth and semantic Parent–Child retrieval; preserve exceptions and instrument/genre interdependencies. Keep v0.20 APIs and `smart/whole` rollback, `mas_skills`, monitoring, v0.19 memory boundaries, song locks and the existing Claude CLI subscription. Test CLI skill isolation with official flags without modifying my global Claude Code setup. Implement P0–P7 in small bounded commits, run the stated deterministic tests and genre-focused A/B benchmarks, and do not claim quality improvement based only on character reductions. Use minimal tokens: read only relevant source files, reuse existing components, report only changed files/test results/blockers after each milestone. No other repo changes.

**If implementation is not yet authorized, first produce P0 audit and a phase estimate only.**

---

## 13. Source references (research snapshot)

### Tidal Studio implementation

- v0.20 merged PR: https://github.com/vsalesa/tidal-studio/pull/71
- v0.19 merged PR: https://github.com/vsalesa/tidal-studio/pull/70
- v0.20 `server/skills.py`: https://github.com/vsalesa/tidal-studio/blob/2a8298e95eb0783cdaef34509139e5142e5ed7f9/server/skills.py
- Existing Claude CLI launcher: https://github.com/vsalesa/tidal-studio/blob/2a8298e95eb0783cdaef34509139e5142e5ed7f9/server/llm.py
- Third-party plugin installer and copyright-related note: https://github.com/vsalesa/tidal-studio/blob/2a8298e95eb0783cdaef34509139e5142e5ed7f9/server/plugins.py
- Windows/Linux upgrade copy path: https://github.com/vsalesa/tidal-studio/blob/2a8298e95eb0783cdaef34509139e5142e5ed7f9/packaging/common/launcher.py
- macOS upgrade copy: https://github.com/vsalesa/tidal-studio/blob/2a8298e95eb0783cdaef34509139e5142e5ed7f9/packaging/macos/run-studio.sh

### External technical documentation

- SQLite FTS5 (contentless/contentless-delete, BM25): https://sqlite.org/fts5.html
- Claude Code official CLI flags (including `--disable-slash-commands`, `--safe-mode`, `--setting-sources`): https://code.claude.com/docs/en/cli-reference
- Claude Code settings/config directory behavior: https://code.claude.com/docs/en/settings

### Scope exclusions

- No direct third-party code or copyrighted reference asset has been copied by this research report.
- No implementation, release or build test is claimed to have been run as part of the report.
- Exact model token savings, musical quality improvements, and production-safe CLI isolation remain hypotheses to test.

**End of v0.21 handoff.**