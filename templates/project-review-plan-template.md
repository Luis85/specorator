---
id: PRV-<AREA>-PLAN-001
title: <Project> — project review plan
status: in-progress
created: YYYY-MM-DD
inputs:
  - quality/<review-slug>/project-review-state.md
---

# Project review plan — <project>

## Review intent

- Problem:
- Desired learning:
- Decisions this review should inform:
- First draft PR selection criteria:

## Scope

- Included project / feature / release:
- Review period:
- Included branches or tags:
- Included GitHub issues / PRs:
- Excluded areas:

## Evidence plan

| Source | Query or path | Why it matters | Status |
|---|---|---|---|
| Workflow state | `specs/<slug>/workflow-state.md` | Stage progress and handoffs | pending |
| Git history | `<range>` | Commit cadence and branch hygiene | pending |
| Pull requests | `<query>` | Review feedback and rework | pending |
| CI | `<query>` | Verification failures and flaky checks | pending |
| Issue mirror sync | `npm run sync:issues -- --dry-run --json` or `skipped: <reason>` | Advisory comparison between local `issues/` records and GitHub issue metadata | pending |
| Issue mirror drift | `npm run check:issues` | Advisory local drift check for malformed issue records and specs without linked issues | pending |
| Retrospectives | `specs/*/retrospective.md` | Prior learnings | pending |

## Issue mirror evidence

- Sync dry-run: `pending | passed | skipped: <reason> | failed: <summary>`
- Drift check: `pending | passed | warnings: <summary> | failed: <summary>`
- Local mirror limitations:
- GitHub access limitations:

## Review questions

- PRV-Q-001 — What repeated delivery friction appears in artifacts or history?
- PRV-Q-002 — Which workflow rules worked well and should be preserved?
- PRV-Q-003 — Which gaps should become concrete improvement proposals?
- PRV-Q-004 — Which proposal is small and valuable enough for a first draft PR?

## Issue plan

- Proposed issue title:
- Labels:
- Summary sections:

## Quality gate

- [ ] Scope and exclusions are explicit.
- [ ] Evidence sources are concrete and repeatable.
- [ ] Issue mirror sync and drift evidence is planned or explicitly skipped with a reason.
- [ ] First draft PR criteria are stated before findings are written.
