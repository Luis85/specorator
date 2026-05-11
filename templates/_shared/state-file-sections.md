# State-file shared sections

> Reference for the free-form sections every track-state template carries. Linked from `workflow-state-template.md`, `discovery-state-template.md`, `stock-taking-state-template.md`, `deal-state-template.md`, `project-state-template.md`, `roadmap-state-template.md`, `quality-state-template.md`, `scaffolding-state-template.md`, `portfolio-state-template.md`. Skill / agent code must keep the section *headings* in each state file (validated by `check:specs`); the *prose explanations* are factored here so each template stays terse.

## Status enums

Per-artifact `status` (used in `artifacts:` map and progress tables): `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Track-level `status` enums vary per track — see each track's state-template for its own enum.

## Skips section

Document any skipped phases / stages and why. Trivial work (cosmetic fixes, doc-only changes) may legitimately skip phases. The retrospective phase is never skipped. Phases may be skipped only when the engagement is compressed (e.g., a 1-day "Lightning" Discovery sprint that collapses Frame+Diverge); document the trade-off so a reader knows what was sacrificed.

**Meta-features.** A "meta-feature" is a plan-level feature whose implementation is a sequence of sub-task PRs rather than a single source tree (e.g., a release plan that ships through eight independent feature PRs). Meta-features may legitimately skip Stage 7-9 artifacts — `implementation-log.md`, `test-plan.md`, `test-report.md`, `review.md`, `traceability.md` — when each sub-task PR carries its own implementation evidence, tests, review, and trace links. When skipping these for a meta-feature, the `## Skips` block must list each artifact filename with a one-line rationale plus a pointer to where the evidence lives (per-PR descriptions, commit messages, or the `Satisfies:` blocks in `tasks.md`). For a worked example, see [`specs/version-0-3-plan/workflow-state.md`](../../specs/version-0-3-plan/workflow-state.md) §Skips.

## Blocks section

Anything currently blocking progress. One bullet per blocker — name the artifact, the blocker, and the responsible party where known. Move to closed once unblocked; the section is a live signal, not an audit log.

## Hand-off notes section

Free-form, append-only. What does the next agent / human need to know? Where did the previous agent stop? Format is one dated entry per hand-off (`YYYY-MM-DD (role): note`). Useful for resume-from-pause and for rerunning a phase against partial outputs.

**Release-tag hold.** Stage 10 can have release readiness complete while an irreversible tag or publish action is still waiting on human authorization. Keep `current_stage: release` and `status: active`, keep `release-notes.md: in-progress` until the release tag / publish step is complete, and add a dated hand-off note that says `release-tag hold` with:

- the readiness verdict and verification command,
- the pending irreversible action (`tag`, `GitHub Release`, `package publish`, or `stable promotion`),
- the explicit human authorization still needed,
- the issue, PR, or release branch that owns the follow-up.

Do not add a new workflow-state frontmatter field for this hold. The existing stage, status, artifact status, and hand-off note fields are the schema; the hold is a documented convention inside Stage 10.

## Open clarifications section

Add and resolve as they come up. Unresolved clarifications block phase / stage transitions. A track cannot be marked `status: done` (or the track's equivalent terminal status) while any `- [ ]` clarification remains. Active engagements may carry unresolved clarifications as visible advisory signals.

Format: each clarification is `- [ ] CLAR-NNN — <short question>` while open, becomes `- [x] CLAR-NNN — <question> *(resolved YYYY-MM-DD: <answer>)*` when closed.
