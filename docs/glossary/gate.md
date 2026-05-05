---
term: "Gate"
aliases: ["quality gate", "stage gate", "workflow gate"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - gate-check.md
  - hitl.md
  - workflow-stage.md
  - adlc.md
  - human-authority.md
issues:
  - "#1"
  - "#165"
last_updated: 2026-05-05
---

# Gate

A quality checkpoint between two ADLC stages. A gate is the formal expression of the H-ACD principle of human authority over outcomes: no feature advances from stage N to stage N+1 without the user passing the gate.

In mechanical terms, a gate is a HITL checkpoint: the agent (or the system) proposes advancement; the user explicitly approves or rejects. Rejection returns to stage N; approval creates the next stage's artifact and begins stage N+1.

## Gate checks

A gate comprises one or more **gate checks**: specific conditions that must be satisfied for the gate to pass. Examples:

- The stage artifact exists at the expected path
- The artifact's frontmatter includes required fields
- The quality gate status in `workflow-state.md` is `passed`
- The user has explicitly approved the stage output

Gate checks are implemented via `workflow_get_quality_gates` in the MCP tool surface.

## Gate strictness

Gates can be configured with different strictness levels:
- **Hard** — advancement is blocked until all checks pass
- **Advisory** — checks surface as warnings; the user can advance despite failures with an explicit override
- **Disabled** — checks are skipped for this gate (used in low-formality workflows)

## User-facing language

The word "gate" is internal vocabulary. Users see "Ready to move on?", "Are you happy with this?", or stage-appropriate governance prompts — not "gate" or "gate check". See [workflow-encapsulation.md](./workflow-encapsulation.md).
