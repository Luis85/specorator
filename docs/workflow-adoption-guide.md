---
title: "Workflow adoption guide"
doc_type: process
status: active
owner: product
last_updated: 2026-05-03
references:
  - docs/project-kickoff-guide.md
  - docs/contributing.md
---

# Workflow Adoption Guide

A condensed checklist for adopting the project kickoff workflow on a new project. Each numbered step below maps directly to one GitHub issue. File them in sequence — each step is a gate for the next.

**Full reference:** [docs/project-kickoff-guide.md](./project-kickoff-guide.md)  
**Assumption:** A PRD (or equivalent brief) already exists.

---

## The Eight Steps

```
[1] Initiate
  └─ [2] Create repository
       └─ [3] Set up GitHub environment
            └─ [4] Bootstrap the backlog
                 └─ [5] Scaffold the toolchain
                      └─ [6] Wire CI/CD
                           └─ [7] Document the architecture
                                └─ [8] Ship the first increment
```

---

### Step 1 — Initiate the project

Define who is responsible for what, write the project description, seed the risk register, and make the go/no-go decision.

**Issue to file:**

```
Title:   P0: initiate project — roles, description, risk register, go/no-go
Labels:  governance, planning
Milestone: Phase 0 — Initiation

Acceptance criteria:
- [ ] Roles table complete (sponsor, product, engineering, QA, design, release)
     with gaps noted
- [ ] docs/initiation.md written (purpose, benefits, scope summary, stakeholders)
- [ ] Risk register seeded with at least three standing risks
- [ ] Go/No-Go decision recorded with date and decision owner
```

**Key outputs:** `docs/initiation.md`

---

### Step 2 — Create the repository

Create the GitHub repository, add the baseline files, create the `develop` integration branch, and protect `main`.

**Issue to file:**

```
Title:   P1: create repository with baseline files and branch protection
Labels:  setup, github
Milestone: Phase 1 — Repo Foundation

Acceptance criteria:
- [ ] Repository created (correct visibility, squash-merge default,
     auto-delete branches on merge)
- [ ] README.md, LICENSE, SECURITY.md, CONSTITUTION.md committed
- [ ] develop branch created and set as default
- [ ] main branch protected: PR required, CI required, force-push blocked
```

**Key outputs:** Repository, `develop` branch, protected `main`

---

### Step 3 — Set up the GitHub environment

Create the label taxonomy, milestones, issue templates, and PR template so issues are structured before any are filed.

**Issue to file:**

```
Title:   P1: add labels, milestones, issue templates, and PR template
Labels:  setup, github
Milestone: Phase 1 — Repo Foundation

Acceptance criteria:
- [ ] Default GitHub labels deleted
- [ ] Custom label taxonomy created (type + domain + process labels)
- [ ] Milestones created for each project phase
- [ ] Issue templates added: feature, bug, task, decision, requirement intake
- [ ] Blank issues disabled
- [ ] PR template added to .github/PULL_REQUEST_TEMPLATE.md
```

**Key outputs:** `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`

---

### Step 4 — Bootstrap the backlog

File the initial epics, phase objectives, and task issues. Every subsequent issue has a home.

**Issue to file:**

```
Title:   P1: file initial epics, phase objectives, and Phase 1 task backlog
Labels:  planning, product
Milestone: Phase 1 — Repo Foundation

Acceptance criteria:
- [ ] At least one epic issue filed per major product capability (from PRD)
- [ ] One objective issue filed per milestone phase
- [ ] Task issues filed for Phase 1 with clear acceptance criteria
- [ ] All issues labeled and milestone-assigned
- [ ] Roadmap tracker issue filed and pinned
```

**Key outputs:** Structured backlog, pinned roadmap tracker

---

### Step 5 — Scaffold the toolchain

Initialise the project with the chosen language/framework and make `npm run verify` (or equivalent) pass with zero errors.

**Issue to file:**

```
Title:   P3: scaffold project — language, build, lint, format, and test harness
Labels:  setup, tooling
Milestone: Phase 3 — Tech Scaffold

Acceptance criteria:
- [ ] TypeScript (or chosen language) configured with strict mode
- [ ] ESLint configured with architectural boundary rules
- [ ] Prettier configured (no conflicts with ESLint)
- [ ] Test harness configured (Vitest or equivalent) with coverage reporting
- [ ] package.json scripts: typecheck, lint, test, build, verify
- [ ] npm run verify exits 0
```

**Key outputs:** Working scaffold, `npm run verify` gate

---

### Step 6 — Wire CI/CD

Add GitHub Actions workflows for CI verification, automated releases, dependency management, and supply-chain hardening.

**Issue to file:**

```
Title:   P1: add CI workflow, release workflow, and dependency automation
Labels:  setup, ci, release
Milestone: Phase 1 — Repo Foundation

Acceptance criteria:
- [ ] ci.yml runs typecheck, lint, test, and build on PRs to develop/main
- [ ] release.yml triggers on semver tags from main HEAD only
- [ ] Dependabot configured for package manager and GitHub Actions
- [ ] Dependabot auto-merge for patch and dev-minor updates
- [ ] All third-party actions pinned to commit SHAs
- [ ] Branch protection updated to require CI job to pass
```

**Key outputs:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/dependabot.yml`

---

### Step 7 — Document the architecture

Write the ADRs, contributing guide, and local development guide so any contributor (human or AI) can get up to speed independently.

**Issue to file:**

```
Title:   P3: write ADRs, contributing guide, and local development guide
Labels:  documentation, architecture
Milestone: Phase 3 — Tech Scaffold

Acceptance criteria:
- [ ] ADR written for each structural decision made during scaffold
     (minimum: folder structure, error handling, testing philosophy,
      external API abstraction, branching model)
- [ ] docs/contributing.md covers: issue workflow, labels, branching,
     commits, PR process, CI, merge policy
- [ ] docs/local-development.md enables a newcomer to run the project
     in under 10 minutes
- [ ] CLAUDE.md / AGENTS.md added if AI agents will contribute
```

**Key outputs:** `docs/adr/`, `docs/contributing.md`, `docs/local-development.md`

---

### Step 8 — Ship the first increment

Implement the smallest end-to-end feature that proves the full pipeline works, and cut the first tagged release.

**Issue to file:**

```
Title:   v1: <describe your hello-world increment>
Labels:  enhancement
Milestone: v1 Alpha

Acceptance criteria:
- [ ] Feature exercises every architectural layer (not just one file)
- [ ] At least one test written
- [ ] npm run verify passes before PR is opened
- [ ] PR follows the PR template (summary, changes, verification, risks)
- [ ] CI passes on the PR
- [ ] PR squash-merged to develop
- [ ] develop → main PR opened, merged, and tagged X.Y.Z
- [ ] GitHub release created automatically by release workflow
```

**Key outputs:** First tagged GitHub release with built artifacts

---

## Quick-reference: issue creation commands

Copy and adapt these to file all eight steps at once:

```bash
#!/usr/bin/env bash
# Usage: REPO=<org>/<repo> bash create-adoption-backlog.sh
set -euo pipefail
REPO="${REPO:?Set REPO=org/repo}"

gh issue create --repo "$REPO" \
  --title "P0: initiate project — roles, description, risk register, go/no-go" \
  --body $'## Acceptance criteria\n- [ ] Roles table complete with gaps noted\n- [ ] docs/initiation.md written\n- [ ] Risk register seeded (≥3 risks)\n- [ ] Go/No-Go decision recorded' \
  --label "governance,planning" --milestone "Phase 0 — Initiation"

gh issue create --repo "$REPO" \
  --title "P1: create repository with baseline files and branch protection" \
  --body $'## Acceptance criteria\n- [ ] Repo created (squash-merge, auto-delete branches)\n- [ ] README, LICENSE, SECURITY, CONSTITUTION committed\n- [ ] develop branch created and set as default\n- [ ] main protected: PR + CI required, force-push blocked' \
  --label "setup,github" --milestone "Phase 1 — Repo Foundation"

gh issue create --repo "$REPO" \
  --title "P1: add labels, milestones, issue templates, and PR template" \
  --body $'## Acceptance criteria\n- [ ] Default labels deleted; custom taxonomy created\n- [ ] Phase milestones created\n- [ ] Issue templates added (feature, bug, task, decision, requirement intake)\n- [ ] Blank issues disabled\n- [ ] PR template added' \
  --label "setup,github" --milestone "Phase 1 — Repo Foundation"

gh issue create --repo "$REPO" \
  --title "P1: file initial epics, phase objectives, and Phase 1 task backlog" \
  --body $'## Acceptance criteria\n- [ ] One epic per major product capability\n- [ ] One objective per milestone phase\n- [ ] Phase 1 task issues filed with acceptance criteria\n- [ ] All issues labeled and milestone-assigned\n- [ ] Roadmap tracker filed and pinned' \
  --label "planning,product" --milestone "Phase 1 — Repo Foundation"

gh issue create --repo "$REPO" \
  --title "P3: scaffold project — language, build, lint, format, and test harness" \
  --body $'## Acceptance criteria\n- [ ] Strict-mode TypeScript (or equivalent) configured\n- [ ] ESLint with architectural boundary rules\n- [ ] Prettier (no ESLint conflicts)\n- [ ] Test harness with coverage reporting\n- [ ] npm run verify exits 0' \
  --label "setup,tooling" --milestone "Phase 3 — Tech Scaffold"

gh issue create --repo "$REPO" \
  --title "P1: add CI workflow, release workflow, and dependency automation" \
  --body $'## Acceptance criteria\n- [ ] ci.yml on PRs to develop/main\n- [ ] release.yml on semver tags from main HEAD\n- [ ] Dependabot + auto-merge configured\n- [ ] All actions SHA-pinned\n- [ ] Branch protection requires CI' \
  --label "setup,ci,release" --milestone "Phase 1 — Repo Foundation"

gh issue create --repo "$REPO" \
  --title "P3: write ADRs, contributing guide, and local development guide" \
  --body $'## Acceptance criteria\n- [ ] ADR per structural decision (≥5)\n- [ ] docs/contributing.md covers full workflow\n- [ ] docs/local-development.md: newcomer running in <10 min\n- [ ] CLAUDE.md/AGENTS.md added if AI agents will contribute' \
  --label "documentation,architecture" --milestone "Phase 3 — Tech Scaffold"

gh issue create --repo "$REPO" \
  --title "v1: <describe your hello-world increment>" \
  --body $'## Acceptance criteria\n- [ ] Feature exercises all architectural layers\n- [ ] At least one test written\n- [ ] npm run verify passes before PR is opened\n- [ ] CI passes on the PR\n- [ ] Squash-merged to develop\n- [ ] develop → main merged and tagged X.Y.Z\n- [ ] GitHub release created by release workflow' \
  --label "enhancement" --milestone "v1 Alpha"

echo "Adoption backlog created (8 issues)."
```

---

## What "done" looks like

The workflow is fully adopted when:

1. A stranger can clone the repository and run the project in under 10 minutes using only `docs/local-development.md`.
2. Every structural decision has a corresponding ADR.
3. `npm run verify` is the single command that certifies a branch is ready to review.
4. CI enforces the same checks as `npm run verify` on every PR.
5. The first tagged release exists on GitHub with built artifacts attached.

At that point, the team has a proven, repeatable loop: **issue → branch → implement → verify → PR → CI → merge → release.**
