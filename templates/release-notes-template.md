---
id: RELEASE-<AREA>-NNN
title: <Feature name> — Release notes
stage: release
feature: <feature-slug>
version: <semver or release tag>
status: draft         # draft | published
owner: release-manager
inputs:
  - REVIEW-<AREA>-NNN
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Release notes — <Feature name>

## Summary

One paragraph for end users / stakeholders. What's new and why they care.

## Changes

### New

- …

### Improved

- …

### Fixed

- …

### Deprecated

- …

### Removed

- …

## User-visible impact

- Who is affected.
- Any action required (e.g., update client, re-authenticate, migrate data).
- Breaking changes (call out clearly).

## Readiness summary

- Release readiness guide: `release-readiness-guide.md` / not used.
- Go/no-go verdict:
- Required conditions or approvals:

## Known limitations

- …
- …

## Verification steps

How to confirm the release is healthy in production.

1. Run the standard script test suite with `npm test` when the release changes scripts or validators.
2. …

## Rollback plan

- **Trigger criteria:** what conditions force a rollback.
- **Mechanism:** how to roll back (commands, dashboard links).
- **Data implications:** what happens to data created during the rolled-back release.
- **Communication:** who is told, where, in what tone.

## Observability

- New metrics / dashboards.
- New alerts and their thresholds.
- Log queries for common diagnoses.

## Communication

- Internal announcement: who, where, when.
- External announcement (if any): channel, copy approver, embargo.
- Support / docs updates: link to updated articles.

---

## Quality gate

- [ ] Summary written for the audience (users / stakeholders, not engineers).
- [ ] User-visible impact stated.
- [ ] Readiness conditions and approvals summarized, or guide marked not used.
- [ ] Known limitations disclosed.
- [ ] Verification steps documented.
- [ ] Rollback plan documented.
- [ ] Observability hooks in place.
- [ ] Communication plan ready.
- [ ] Merged worktrees pruned (`git worktree prune`) and stale topic worktrees/branches cleaned up.
