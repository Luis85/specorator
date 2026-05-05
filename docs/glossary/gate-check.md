---
term: "Gate check"
aliases: ["quality gate check"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - gate.md
  - artifact.md
  - workflow-state.md
issues:
  - "#1"
last_updated: 2026-05-05
---

# Gate check

A specific condition evaluated at a stage gate. Gate checks verify that the required work for a stage is complete before the user is presented with the option to advance to the next stage.

## Common checks

- **Artifact existence** — the stage artifact file exists at `specs/{slug}/{stage}.md`
- **Required frontmatter** — the artifact contains specified YAML frontmatter fields with non-empty values
- **Quality gate status** — `workflow-state.md` records a `passed` status for this stage's gate
- **Explicit user acceptance** — the user has reviewed and accepted the agent's proposal for this stage

## Results

A gate check can return:

| Result | Meaning |
|---|---|
| `passed` | Check satisfied; gate can proceed |
| `failed` | Check not satisfied; blocks gate (if hard gate) |
| `warning` | Check not satisfied but advisory only; user can override |
| `skipped` | Check disabled for this workflow configuration |

## Implementation

Gate checks are exposed through the `workflow_get_quality_gates(feature_slug, stage)` MCP tool, which returns the full check results for a given stage. The workflow navigator and fleet dashboard use this tool to compute stage cell states.
