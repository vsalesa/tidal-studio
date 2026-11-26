# Model routing

Pick the cheapest model and the lowest effort that can do the job. Start there, and go up only when the result fails.
Spanish version: [MODEL_ROUTING.es.md](MODEL_ROUTING.es.md).

## Effort levels

- `low`: the change is local and the answer sits in one place. Edit or answer directly.
- `medium`: the change spans a few files, or needs a short plan first.
- `high`: needs tracing across modules, weighing design options, or checking a subtle behaviour.

| Task | Examples in this repo | Model | Effort | Why |
|---|---|---|---|---|
| Config, hooks, docs | `.claude/settings.json`, a README line, `CLAUDE.md` | Haiku 5.5 | low | Mechanical, nothing to plan |
| One-file fix | Wrong label in `web/`, typo in a prompt in `server/assistant.py` | Haiku 5.5 | low | Single file, clear fix |
| Lookups and questions | Where `skills.py` picks a skill; what `engine.py` sends to SuperCollider | Haiku 5.5 | low | The answer is in the code; Graphify finds it |
| Renames | Rename a helper used in one module | Haiku 5.5 | low | Mechanical |
| Multi-file feature | New setting read in `server/app.py`, shown in `web/` | Sonnet 5.5 | medium | Plan across files, no deep design |
| UI work | New panel, button or state in `web/` | Sonnet 5.5 | medium | Local layout and state decisions |
| Non-trivial bug | Behaviour that spans two or three modules | Sonnet 5.5 | high | Trace across modules before editing |
| Architecture | How Maestro plans and picks skills (`assistant.py`, `skills.py`) | Opus 5.5 | high | Trade-offs and design choices |
| Cross-cutting refactor | Changing a layer used by several server modules | Opus 5.5 | high | Many dependents to keep consistent |
| Hard debugging | A bug a cheaper model already failed to fix | Opus 5.5 | high | Needs new hypotheses, not more of the same |

## Escalation

1. Match the task to a row and use that row's model and effort.
2. If the result fails (tests still red after two fixes, or the answer is wrong), raise effort one level on the same model: `low` -> `medium` -> `high`.
3. If it still fails at `high`, move to the next model and start it at `medium` (Sonnet) or `high` (Opus).
4. Start at Sonnet or Opus right away when the task touches 5 or more files.
5. Never raise effort to compensate for missing facts. Explore first with Graphify.

## Split by difficulty

Even one request can mix easy and hard parts. Split it into subtasks, each with its own model and effort: lookups and docs on Haiku `low`, code on Sonnet `medium`, design or hard debugging on Opus `high`. In Claude Code, run subtasks as subagents with the `model` parameter, in parallel when they are independent.

## Token savers

- Explore code with Graphify before grep or Read.
- Use Context7 for library docs.
- Run only the tests for the code you changed.
- Build installers and regenerate README and screenshots only at releases.
