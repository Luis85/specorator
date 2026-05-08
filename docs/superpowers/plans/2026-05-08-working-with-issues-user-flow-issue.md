---
title: "[Workflow] Working with Issues user flow"
labels:
  - feature
  - workflow
  - ui/ux
milestone: "Backlog"
assignees: []
---

# [Workflow] Working with Issues user flow

## Summary
Design and prototype an issue/PR-driven workspace flow in Specorator where:

- **Left sidebar** acts as backlog navigation, split into:
  - top section: Issues
  - bottom section: PRs
- **Main pane** is the primary issue/PR artifact editor (markdown-first).
- **Right sidebar** is the primary agent interaction area (session/task context).

The goal is a native-Obsidian first prototype that uses side panels, tabs, markdown + frontmatter files, Canvas, and Bases.

## Problem
Current workflow artifacts exist, but the operator flow is not yet organized around a clear issue → task → agent session → PR lifecycle in the UI/workspace model.

## Proposed user flow
1. User creates or selects an **Issue**.
2. Issue opens in the **main tab** (context + body are the source of truth).
3. Related **tasks** and **agent sessions** open in the **right sidebar**.
4. Tasks are linked to agent sessions (bidirectional traceability).
5. User picks a task and resolves it via agent interaction in the right sidebar.
6. During work, new docs/artifacts are created and referenced back to the issue.
7. User opens a **draft PR** (new or existing) to package work.
8. Validation sequence runs (tests, verification, quality checks).
9. PR is marked ready for review.
10. Review iteration happens until acceptance.
11. PR is merged.

Canonical flow: **issue → draft PR → implement/edit files → ready for review → iterate review → merge**.


## Right-sidebar interaction model (task-first)
When a user opens either an **Issue** or a **PR**, the right sidepanel should prioritize execution context:

1. Show all **open tasks** related to the currently opened issue/PR.
2. Treat those tasks as the primary entry point into agent interaction.
3. On task click, open/display:
   - correlated **agent sessions** for that task
   - correlated **PRs** connected to that task
4. Keep the right sidepanel focused on progressing tasks through agent-assisted work.
5. Keep the main tab focused on direct file work (editing artifacts/source docs/files).

Stretch direction (research needed): evaluate a model where each task runs on its own branch and dedicated worktree for stronger isolation and clearer traceability.

## Scope (prototype v0)
- Use only native Obsidian capabilities (no advanced custom UI required yet).
- Persist all records as markdown with frontmatter.
- Provide folder structure and workspace defaults to support:
  - issue records
  - task records
  - PR records
  - agent session logs/placeholders
- Simulate agent chat in right sidebar via markdown document(s).
- Simulate main-pane issue/PR editing with example markdown artifacts.
- Draft information architecture and interaction map in Obsidian Canvas.
- Add Obsidian Bases-compatible schema inputs for record visualization.

## Acceptance criteria
- [ ] Left sidebar can represent Issues (top) and PRs (bottom) using native panes/tabs/workspace layout.
- [ ] Selecting an issue opens issue markdown in main pane and related task/session docs in right sidebar.
- [ ] Tasks are explicitly linked to issue and session records through frontmatter fields.
- [ ] User can move from issue to draft PR record with traceable links.
- [ ] Prototype demonstrates full lifecycle from issue selection to PR review-ready state using example records.
- [ ] At least one Canvas file documents the IA/flow.
- [ ] Folder structure and frontmatter schema are documented for contributors.

## Suggested artifact model
- `issues/*.md`
- `tasks/*.md`
- `prs/*.md`
- `sessions/*.md`
- `canvases/*.canvas`
- `bases/*.md` (or base definition docs/placeholders)

Each record should include stable IDs and relational links (e.g. `issue_id`, `task_ids`, `session_ids`, `pr_id`, `status`, `updated_at`).

## Out of scope (for v0)
- Full interactive chat runtime inside plugin UI.
- Non-native sidebar rendering components.
- Automation of CI status ingestion from GitHub API.

## Open questions
- How should multi-issue sessions be represented without losing single-issue focus?
- What minimal frontmatter schema is sufficient for Bases filters and relation views?
- Should PR records be generated from issue context automatically in v1?

## Definition of done
- A reproducible workspace prototype exists in-repo.
- Example issue/task/session/PR markdown set demonstrates end-to-end flow.
- Contributor-facing doc explains how to use and extend the prototype.
