---
id: PRV-<AREA>-HIST-001
title: <Project> — history review
status: in-progress
created: YYYY-MM-DD
inputs:
  - quality/<review-slug>/review-plan.md
---

# History review — <project>

## Git history summary

- Range reviewed:
- Commit count:
- Merge count:
- Revert / fix-forward count:
- Release tags:
- Notable branch patterns:

## Artifact review

| Artifact | Signal | Evidence | Notes |
|---|---|---|---|
| `specs/<slug>/workflow-state.md` |  |  |  |

## Pull request and issue review

| Item | Signal | Evidence | Notes |
|---|---|---|---|
| #<n> |  |  |  |

## Issue mirror review

| Check | Command or source | Result | Notes |
|---|---|---|---|
| Sync dry-run | `npm run sync:issues -- --dry-run --json` | pending | Advisory; skip with reason when `gh` access or local mirror records are unavailable. |
| Drift check | `npm run check:issues` | pending | Advisory; warnings such as missing linked issue files are review evidence, not universal verify failures. |

### Issue mirror limitations

- [ ] PRV-ISSUE-001 — Stale or missing local issue records:
- [ ] PRV-ISSUE-002 — GitHub access, authentication, or availability limits:
- [ ] PRV-ISSUE-003 — Issue mirror evidence excluded from required local verify gates:

## CI and verification review

| Check | Pattern | Evidence | Notes |
|---|---|---|---|
|  |  |  |  |

## Repeated-change hotspots

| Surface | Pattern | Evidence | Notes |
|---|---|---|---|
|  |  |  |  |

## Unknowns

- [ ] PRV-UNK-001 — …

## Quality gate

- [ ] Every claim links to a source path, commit, issue, PR, or command summary.
- [ ] Evidence and inference are separated.
- [ ] Issue mirror sync/drift commands are summarized or explicitly skipped with a reason.
- [ ] Unknowns are named instead of filled by guesswork.
