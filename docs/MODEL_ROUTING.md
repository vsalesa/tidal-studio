# Model routing

Pick the cheapest model that can do the job. Start there, and escalate only when it fails.
Spanish version: [MODEL_ROUTING.es.md](MODEL_ROUTING.es.md).

| Task | Examples in this repo | Model | Effort |
|---|---|---|---|
| Config, hooks, docs | `.claude/settings.json`, a README line, `CLAUDE.md` | Haiku 5.5 | low |
| One-file fix | Wrong label in `web/`, typo in a prompt string in `server/assistant.py` | Haiku 5.5 | low |
| Lookups and questions | Where `skills.py` selects a skill; what `engine.py` sends to SuperCollider | Haiku 5.5 | low |
| Renames | Rename a helper used in one module | Haiku 5.5 | low |
| Multi-file feature | New setting read in `server/app.py` and shown in `web/` | Sonnet 5.5 | medium |
| UI work | New panel, button or state in `web/` | Sonnet 5.5 | medium |
| Non-trivial bug | Behaviour that needs tracing across two or three modules | Sonnet 5.5 | medium |
| Architecture | How Maestro plans and chooses skills (`assistant.py`, `skills.py`) | Opus 5.5 | high |
| Cross-cutting refactor | Changing a layer used by several server modules | Opus 5.5 | high |
| Hard debugging | A bug a cheaper model already failed to fix | Opus 5.5 | high |

## Escalation rule

1. Find the row that matches the task and start with its model.
2. Escalate one step (Haiku -> Sonnet -> Opus) only if the cheaper model fails: tests still red after two fixes, or the answer is wrong and must be redone.
3. Start at Sonnet or Opus right away when the task touches 5 or more files.
4. Keep effort at `low` unless the row says otherwise. Do not raise effort to compensate for missing facts; explore with Graphify first.

## Token savers

- Explore code with Graphify before grep or Read.
- Use Context7 for library docs.
- Run only the tests for the code you changed.
- Build installers and regenerate README and screenshots only at releases.
