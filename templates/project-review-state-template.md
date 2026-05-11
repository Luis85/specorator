---
project_review: <review-slug>
scope: <project | feature | release | portfolio | engagement | template>
status: active          # active | blocked | paused | done
current_phase: start    # start | plan | inspect | synthesize | propose | handoff
last_updated: YYYY-MM-DD
last_agent: project-reviewer
issue_url: TBD
draft_pr_url: TBD
branch: TBD
commit_sha: TBD
artifacts:
  review-plan.md: pending
  history-review.md: pending
  findings.md: pending
  improvement-proposals.md: pending
---

# Project review state — <review-slug>

## Scope

- Boundary:
- Repository:
- Integration branch:
- Review period:
- Related artifacts:
- Exclusions:

## Phase progress

| Phase | Artifact | Status |
|---|---|---|
| Plan | `review-plan.md` | pending |
| Inspect | `history-review.md` | pending |
| Synthesize | `findings.md` | pending |
| Propose | `improvement-proposals.md` | pending |
| Handoff | issue + draft PR | pending |

## Evidence sources

- `specs/<feature>/workflow-state.md`
- `projects/<project>/`
- `quality/<review>/`
- `git log --oneline --decorate --graph --all`
- GitHub issues / pull requests / CI runs:

## Handoff

- Issue:
- Draft PR:
- Worktree:
- Branch:
- Commit:
- Verification:
- Remaining risks:

## Blocks

- None.

## Hand-off notes

- YYYY-MM-DD (project-reviewer): …

## Open clarifications

- [ ] PRV-CLAR-001 — …
