# CLAUDE.md

## Save tokens: ask the Graphify graph first

This repository is indexed in Graphify (MCP server `Graphify`, repository `vsalesa/tidal-studio`).
The code is about 2.7 MB (~650k tokens), so reading files to find things is expensive.
Before grepping or opening files, ask the graph:

| Question | Tool |
|---|---|
| Where is X defined? | `graphify_find` |
| How does X work / where is behaviour Y handled? | `query_graph` (start with `skeleton: true` and a small `budget`, e.g. 1500) |
| Who calls X? A symbol and its neighbours | `graphify_callers`, `graphify_node` |
| What breaks if I change X? | `graphify_impact` (`include_risk: true`) |
| Which tests cover X? | `graphify_tests_for` |
| What does this file import / who imports it? | `graphify_file_neighbors` |

Rules:

1. Every result carries `commitSha`. If it equals `git rev-parse HEAD`, trust it without re-checking by grep.
   For files changed since that commit (`git diff --name-only <commitSha> HEAD`), read the current file instead.
2. Open a file only for the lines you are going to edit (use `offset`/`limit`), not whole files.
3. Use plain `grep` only for literal strings, config values, i18n texts, and non-code files
   (Markdown skills in `skills/`, `docs/`, `packaging/`). The Free plan indexes only `README.md` from documents.
4. If Graphify is not connected or the repository is not ready, fall back to grep/Read as usual.

## Project map (short)

- `server/` Python stdlib backend (`app.py` HTTP API, `assistant.py` Maestro prompts, `skills.py` skill selection, `engine.py` Tidal/SuperCollider).
- `web/` vanilla JS UI. `tests/` unittest suite (`python3 -m unittest discover tests`).
- `packaging/VERSION` on `main` publishes a release; dev-only changes do not need a version bump.
- Docs: README.md (English) + README.es.md (Spanish). Diagrams: PlantUML -> SVG -> PNG, never ASCII art.
