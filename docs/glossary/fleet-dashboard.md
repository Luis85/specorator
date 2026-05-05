---
term: "Fleet dashboard"
aliases: ["Mission Control", "workflow fleet dashboard", "cockpit fleet view"]
category: ui
status: draft
version: "v2.0"
related:
  - cockpit.md
  - pipeline.md
  - adlc.md
  - hitl.md
  - hotl.md
  - oversight-mode.md
  - session-log.md
  - traceability-chain.md
issues:
  - "#168"
  - "#23"
last_updated: 2026-05-05
---

# Fleet dashboard

The portfolio-level cockpit view that shows all active features across all projects on a single screen, with each feature's pipeline stage, active agent session status, oversight mode, and pending governance decisions visible at a glance. The fleet dashboard is a v2.0 feature; its v1 foundation is the workflow navigator.

## The pipeline matrix

The primary panel of the fleet dashboard is a matrix: **features as rows, stages as columns**, with each cell showing the state of that stage for that feature:

```
Feature                    | idea | research | requirements | design | spec | tasks | impl | …
───────────────────────────────────────────────────────────────────────────────────────────
auth-flow                  |  ✓   |    ✓     |      ✓       |   ●    |      |       |      |
user-profile-editor        |  ✓   |    ⟳    |              |        |      |       |      |
onboarding-redesign        |  ✓   |    ✓     |      ✓       |   ✓    |  ✓   |   ✓   |  ⟳  |
notification-service       |  ✓   |    ✓     |      ⏸       |        |      |       |      |
```

Legend: `✓` done · `●` agent working (HOTL) · `⟳` awaiting review (HITL) · `⏸` blocked

The user scans the matrix and immediately knows where their attention is needed.

## The five panels

1. **Fleet status** — the pipeline matrix described above
2. **Live session feed** — streaming plain-language progress for the selected feature's active agent session
3. **Intervention controls** — approve, redirect, pause, resume, or abandon from inline actions on any feature row
4. **Artifact links** — one click from any stage cell to the stage artifact, session log, or root issue
5. **Health signals** — automatic flags for stuck features, review backlog, scope drift, agent failures, and high escalation rate

## Recursive hierarchy

The fleet dashboard supports recursive feature trees: a root epic shows child features; each child shows its pipeline. The user can view the full portfolio tree or drill into any subtree while maintaining awareness of the whole.

## v1 foundation

The Increment 2 workflow navigator (see [workflow-navigator.md](./workflow-navigator.md)) is the per-feature pipeline view that establishes the pipeline mental model. The fleet dashboard in v2.0 extends this to N features with live agent session data.

## Full specification

Issue #168.
