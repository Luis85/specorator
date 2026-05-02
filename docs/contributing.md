---
title: "Specorator contribution guide"
doc_type: process
status: active
owner: engineering
last_updated: 2026-05-02
references:
  - docs/local-development.md
  - docs/roadmap-v1.md
  - docs/process/requirements-intake.md
  - CONSTITUTION.md
---

# Contributing to Specorator

**Related issues:** [#4](https://github.com/Luis85/specorator/issues/4) · [#7](https://github.com/Luis85/specorator/issues/7)

This guide covers the GitHub workflow for Specorator: how issues are filed and triaged, how labels and milestones are used, how branches are named, and what is expected before a PR is merged.

For local development setup, see [docs/local-development.md](./local-development.md).
For the non-negotiable working agreement, see [CONSTITUTION.md](../CONSTITUTION.md).

---

## 1. Opening Issues

### Issue templates

Use the provided templates when filing new issues. Blank issues are disabled.

| Template | When to use |
|---|---|
| **Feature request** | Proposing a new capability or enhancement |
| **Bug report** | Reporting unexpected behavior in the plugin |
| **Task** | Concrete setup, engineering, documentation, or maintenance work |
| **Architecture / design decision** | A decision that needs to be explored and recorded |
| **Requirement intake** | A new product or engineering requirement entering the triage process |
| **Design intake** | A design or UX concern entering the triage process |

Before opening a feature request, read the [product vision](./product-vision.md) and check the [roadmap](./roadmap-v1.md) to confirm the idea fits the current phase.

### Intake-first for requirements and design

New requirements and significant design decisions go through a structured intake process before implementation begins. See [docs/process/requirements-intake.md](./process/requirements-intake.md) for the triage and promotion steps.

### Spec-first gate for Phase 4 features

No Phase 4 feature implementation branch may be opened until a `specs/` entry exists for that feature:

1. `specs/{slug}/idea.md` — accepted by the PM role.
2. `specs/{slug}/workflow-state.md` — at the correct stage using the ADR-005 canonical schema.
3. Requirements written and accepted (or an explicit PM sign-off to proceed from idea directly to implementation).

This gate enforces that Specorator is a live example of the agentic-workflow methodology it supports. See [CONSTITUTION.md](../CONSTITUTION.md) §3 and [decisions/DEC-001](../decisions/DEC-001-adopt-agentic-workflow-for-repo.md).

---

## 2. Labels

Labels are applied by maintainers during triage. Use them when opening an issue only if the template pre-populates them.

### Type labels

| Label | Meaning |
|---|---|
| `enhancement` | New capability or improvement |
| `bug` | Defect or unexpected behavior |
| `documentation` | Documentation-only work |
| `architecture` | Architecture decision or constraint |

### Domain labels

| Label | Meaning |
|---|---|
| `setup` | Repository, tooling, CI, or GitHub configuration work |
| `github` | GitHub-specific setup (templates, labels, Actions, branch protection) |
| `product` | Product direction, PRDs, use cases, or roadmap work |
| `planning` | Project or milestone planning |
| `pages` | GitHub Pages product page |
| `ux-research` | UX research, personas, or design inputs |
| `testing` | Test harness, coverage, or verification |
| `traceability` | Requirements traceability or ID conventions |

### Process labels

| Label | Meaning |
|---|---|
| `p3-express` | P3.express governance and initiation activities |
| `project-management` | Cross-cutting project management tasks |
| `governance` | Decisions, policies, or approval gates |

### Standard GitHub labels

| Label | Meaning |
|---|---|
| `good first issue` | Suitable for new contributors |
| `help wanted` | Input or contribution welcome |
| `wontfix` | Out of scope; will not be addressed |
| `duplicate` | Covered by another issue |
| `invalid` | Not a valid issue for this repo |

---

## 3. Milestones

Milestones map to the phases in [docs/roadmap-v1.md](./roadmap-v1.md).

| Milestone | Scope |
|---|---|
| **Phase 0 — Initiation** | P3.express governance, go/no-go gate, project setup |
| **Phase 1 — Repo Foundation** | README, license, CI, release workflow, branch protection, issue workflow |
| **Phase 2 — Product Setup** | PRDs, use cases, design brief, architecture inputs, traceability, glossary |
| **Phase 3 — Plugin Shell** | Vue scaffold, browser runtime, bridge API, toolchain, test harness |
| **v1 Alpha** | Feature delivery: template install, workflow navigator, artifact creation |

Assign issues to their milestone during triage. Phase 0 and Phase 1 issues must reach "complete or explicitly deferred" before Phase 3 begins. Phase 2 must also be at sufficient completion before Phase 3 is considered ready. Phase 4 begins only after Phase 3 is complete. See [docs/roadmap-v1.md](./roadmap-v1.md) for the full prerequisite chain.

---

## 4. Issue Lifecycle

```
New issue filed
    │
    ▼
Triage (maintainer)
  • Assign label(s) and milestone
  • Link to parent objective issue if applicable
  • Mark "wontfix" or "duplicate" if out of scope
    │
    ▼
Ready for work
  • Issue has clear acceptance criteria
  • For requirements/design: intake process complete (see requirements-intake.md)
    │
    ▼
In progress
  • Assignee creates a branch (see §5)
  • PR opened referencing the issue
    │
    ▼
Review
  • CI must pass
  • PR description includes verification steps
    │
    ▼
Merged → issue closed automatically via "Closes #NNN" in PR
```

Issues without acceptance criteria should not move to "In progress". If the scope is unclear, resolve it in the issue comments before branching.

---

## 5. Branching model

The repository uses a three-branch model. All development flows through `develop`; previews publish from `demo`; releases happen only on `main`.

| Branch | Purpose | Who pushes here |
|---|---|---|
| `develop` | Primary integration branch. All feature branches are cut from here and merged back here. | PRs from feature branches |
| `demo` | Preview branch. GitHub Pages deploys from here. | PR from `develop` when a preview is wanted |
| `main` | Stable release branch. Triggers the Obsidian plugin release. | PR from `develop` only, for releases |

### CI trigger matrix

| Event | CI | GitHub Pages | Plugin release |
|---|---|---|---|
| Push / PR → `develop` | ✅ | ❌ | ❌ |
| `develop` → `demo` (merge) | ✅ | ✅ deploy | ❌ |
| `develop` → `main` (merge) | ✅ | ❌ | ✅ tag + publish |
| Manual `workflow_dispatch` | ✅ optional | ✅ optional | ❌ |

### Branch naming convention

```
<type>/<short-description>
```

| Type | When to use |
|---|---|
| `feature/` | New plugin capability |
| `fix/` | Bug fix |
| `docs/` | Documentation-only change |
| `chore/` | Tooling, CI, dependency, or configuration change |
| `refactor/` | Code restructuring with no functional change |

**Examples:**

```
feature/template-installation-service
fix/navigator-empty-state-crash
docs/contributing-guide
chore/update-vitest-to-3
```

Keep the description short (3–5 words, kebab-case). Do not include issue numbers in branch names; link the issue in the PR instead.

### Branch workflow

- **Cut feature branches from `develop`**, not from `main`.
- **Open PRs targeting `develop`**.
- **To publish a preview:** open a PR from `develop` to `demo`, merge it; GitHub Actions deploys to GitHub Pages automatically.
- **To cut a release:** open a PR from `develop` to `main`, merge it, then tag the resulting `main` HEAD with the release version (`vX.Y.Z`). The release workflow publishes the plugin.
- **Never** push directly to `main` or cut a release tag from any branch other than `main`.
- Delete merged feature branches; do not accumulate stale branches.

---

## 6. Commits

Write commit messages in the imperative present tense: "Add template installation service", not "Added" or "Adds".

**Format:**

```
<short summary (≤72 characters)>

<optional body: why this change, not what — keep it under 5 lines>
```

**Scope prefixes** (optional but helpful for larger changes):

```
feat: add template installation service
fix: prevent navigator crash on empty vault
docs: add requirements traceability index
chore: update vitest to 3.1
refactor: extract bridge event handlers
test: add unit tests for overwrite detection
```

Keep commits focused. A commit that does two unrelated things should be two commits.

---

## 7. Pull Requests

### Before opening a PR

Run the full pre-PR verification locally:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run build:web
npm run docs:api
```

All checks must pass. See [docs/local-development.md](./local-development.md) for the full verification workflow.

### PR description

Use the PR template. It asks for:

- A summary and `Closes #NNN` link.
- A list of key changes.
- Verification steps performed.
- Screenshots or test vault notes for UI or vault-content changes.
- Known risks or follow-up items.

### Review

For this repository at its current size, a PR can be self-merged if CI passes and no review has been requested. When a review is requested, wait for approval before merging.

### Merge policy

**Use squash merge.** This keeps `main` history linear and readable — one squashed commit per feature or fix, not the full branch history.

The squash commit message should follow the same format as §6: a clear summary line and optional body explaining the why.

Do not use merge commits or rebase-and-merge unless there is a specific reason (e.g., preserving co-author attribution).

---

## 8. Branch Protection for `main`

The following settings should be applied to `main` by a repository admin. These settings cannot be configured through the codebase — they require manual action in **Settings → Branches → Add branch ruleset**.

### Required settings

| Setting | Value |
|---|---|
| Require a pull request before merging | Enabled |
| Require status checks to pass before merging | Enabled |
| Required status check | `Install, typecheck, lint, test, and build` |
| Require branches to be up to date before merging | Enabled |
| Block force pushes | Enabled |
| Restrict deletions | Enabled |

### Optional (recommended once team grows)

| Setting | Value |
|---|---|
| Require approvals | 1 (when working in a team) |
| Dismiss stale pull request approvals when new commits are pushed | Enabled |

### Rationale

These settings ensure:
- No code lands on `main` without CI passing.
- `main` always builds cleanly.
- History cannot be rewritten by force pushes.
- Direct commits to `main` are prevented, keeping the PR-based review flow intact.

The required check name (`Install, typecheck, lint, test, and build`) matches the job name in `.github/workflows/ci.yml`.

---

## 9. CI and Checks

The CI workflow (`.github/workflows/ci.yml`) runs on pushes to `develop`, `demo`, and `main`, and on pull requests targeting any of those three branches. It does **not** run on raw feature-branch pushes — run the checks locally before opening a PR. Steps:

1. `npm ci` — install dependencies
2. `npm run typecheck` — TypeScript strict-mode check
3. `npm run lint` — ESLint
4. `npm run test` — Vitest unit tests
5. `npm run build` — Vite plugin build
6. `npm run build:web` — standalone UI build
7. `npm run docs:api` — TypeDoc API docs generation

All steps must pass for the check to succeed. Dependabot keeps dependencies current; security alerts are configured in `.github/dependabot.yml`.

---

## Related

- [docs/local-development.md](./local-development.md) — setup, commands, and test vault instructions
- [docs/roadmap-v1.md](./roadmap-v1.md) — current phase and priorities
- [docs/process/requirements-intake.md](./process/requirements-intake.md) — intake workflow for new requirements
- [docs/traceability.md](./traceability.md) — requirements ID conventions
