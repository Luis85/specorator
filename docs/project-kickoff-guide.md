---
title: "Project Kickoff Guide"
doc_type: process
status: active
owner: product
last_updated: 2026-05-03
references:
  - docs/contributing.md
  - docs/initiation.md
  - docs/roadmap-v1.md
  - CONSTITUTION.md
  - AGENTS.md
---

# Project Kickoff Guide

**Audience:** Solo developers, small teams, or AI agents setting up a new software project from scratch.

**Starting assumption:** A Product Requirements Document (PRD) already exists, describing the envisioned outcome and the problem being solved.

**End goal:** The team ships a quality-driven, reviewed, and CI-verified first "hello world" increment — a minimal but coherent deliverable that proves the end-to-end loop works.

**How to read this guide:** Each phase is a sequential gate. Do not proceed to the next phase until all checkboxes in the current phase are ticked. Commands are written for `bash` using the [GitHub CLI (`gh`)](https://cli.github.com/). Adapt naming conventions to your project.

---

## Table of Contents

1. [Phase 0 — Initiation & Governance](#phase-0--initiation--governance)
2. [Phase 1 — Repository Foundation](#phase-1--repository-foundation)
3. [Phase 2 — GitHub Environment](#phase-2--github-environment)
4. [Phase 3 — Backlog Bootstrap](#phase-3--backlog-bootstrap)
5. [Phase 4 — Toolchain & Project Scaffold](#phase-4--toolchain--project-scaffold)
6. [Phase 5 — CI/CD Foundation](#phase-5--cicd-foundation)
7. [Phase 6 — Architecture & Documentation](#phase-6--architecture--documentation)
8. [Phase 7 — First Increment](#phase-7--first-increment)
9. [Appendix A — Label Taxonomy](#appendix-a--label-taxonomy)
10. [Appendix B — Issue Creation Scripts](#appendix-b--issue-creation-scripts)
11. [Appendix C — Workflow Templates](#appendix-c--workflow-templates)

---

## Phase 0 — Initiation & Governance

> Gate: Written answers to every question in this phase must exist before Phase 1 begins.

This phase is about making the project real on paper. It establishes the decision authority and foundational agreements that prevent scope drift, role confusion, and technical debt accumulation later. Even for a solo developer, doing this explicitly is worth the 30 minutes it takes.

### 0.1 Appoint Roles

Write down who fills each role. For a solo project, one person fills all roles — record that explicitly alongside the risk it creates.

| Role | Responsibility | Holder | Gap / Risk |
|---|---|---|---|
| Sponsor | Decision authority, scope changes, go/no-go | | |
| Product | PRD ownership, acceptance criteria | | |
| Engineering | Architecture, implementation | | |
| QA | Test strategy, acceptance testing | | |
| Design | UX, wireframes, UI standards | | |
| Release | Versioning, deployment, marketplace | | |
| Documentation | Guides, ADRs, changelogs | | |

**Risk to record if sole contributor:** all roles held by one person. Mitigate with structured intake process, written requirements, and automated quality gates.

### 0.2 Write the Project Description

Answer these four questions in a short document (one page maximum):

1. **Purpose:** What problem does this product solve, and for whom?
2. **Expected benefits:** What measurable outcome does a successful v1 produce?
3. **Scope summary:** What is the one-sentence description of what v1 delivers? What is explicitly out of scope?
4. **Stakeholder list:** Who cares about this project, and why?

Save this as `docs/initiation.md`.

### 0.3 Seed the Risk Register

Create a table in `docs/initiation.md` with at least the following standing risks:

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RISK-001 | Key contributor unavailable | Medium | High | All decisions documented; any contributor can pick up from docs |
| RISK-002 | External dependency API instability | Medium | Medium | Design integration as an extension point, not a hard dependency |
| RISK-003 | Deployment/marketplace timeline | Low | Medium | Establish a manual distribution path first |

Add project-specific risks. Track active risks as GitHub issues.

### 0.4 Define the Deliverables Map

List the phases, their key deliverables, and a status column. Map each phase to a GitHub milestone (created in Phase 2). Example:

| Phase | Key Deliverables | Status |
|---|---|---|
| 0 — Initiation | Initiation package, go/no-go decision | Pending |
| 1 — Repo Foundation | README, LICENSE, CI, branch policy | Pending |
| 2 — Product Setup | PRD, use cases, glossary, design brief | Pending |
| 3 — Tech Scaffold | Toolchain, test harness, CI passing | Pending |
| v1 Alpha | First feature shipped end-to-end | Pending |

### 0.5 Go / No-Go Decision

Before creating the GitHub repository, the sponsor must explicitly decide: **GO** or **NO-GO**. Record the decision, date, decision owner, and any conditions that must be met before a specific phase can begin.

**Gate checklist:**
- [ ] All roles identified (gaps noted)
- [ ] Project description written (`docs/initiation.md`)
- [ ] Deliverables map created
- [ ] Risk register seeded
- [ ] Go/No-Go recorded in `docs/initiation.md`

---

## Phase 1 — Repository Foundation

> Gate: The repository exists, is baseline-configured, and `main` is protected before any development work begins.

### 1.1 Create the Repository

```bash
# Create the repository (adjust visibility as needed)
gh repo create <org>/<repo-name> \
  --description "<one-line description from PRD>" \
  --public \
  --clone

cd <repo-name>
```

**Repository settings to configure immediately** (via `gh` or GitHub web UI):

```bash
# Disable wiki and projects initially (re-enable when needed)
gh repo edit \
  --enable-wiki=false \
  --enable-issues=true \
  --enable-projects=true \
  --delete-branch-on-merge=true \
  --enable-squash-merge=true \
  --enable-merge-commit=false \
  --enable-rebase-merge=false
```

### 1.2 Add Baseline Files

Create these files before the first commit:

**`.gitignore`** — tailored to your stack. At minimum:

```
node_modules/
dist/
*.log
.env
.env.local
.DS_Store
```

**`LICENSE`** — choose a license. MIT is the most permissive:

```bash
gh api repos/<org>/<repo-name>/contents/LICENSE \
  -X PUT \
  -f message="chore: add MIT license" \
  -f content="$(base64 < /path/to/LICENSE)"
```

Or create the file manually and commit it.

**`README.md`** — minimal at first, but must exist:

```markdown
# <Project Name>

<One-sentence description from PRD>

## Status

Pre-alpha. See [docs/roadmap.md](docs/roadmap.md) for the current phase.

## Quick start

_Coming soon — see [docs/local-development.md](docs/local-development.md)_

## Contributing

See [docs/contributing.md](docs/contributing.md).
```

**`SECURITY.md`** — even for early-stage projects, define a responsible disclosure path:

```markdown
# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately via GitHub's Security Advisory feature
(Security → Report a vulnerability). Do not open a public issue.

We will respond within 5 business days.
```

**`CONSTITUTION.md`** — the non-negotiable working agreement. Define upfront:
- Core architectural constraints that must not be violated
- User control guarantees (what the product will never do without explicit user consent)
- Quality gate description (CI must pass; no exceptions)
- Branching model summary
- How this document evolves (amendments as PRs, never unilateral edits)

### 1.3 First Commit and Push

```bash
git add .gitignore README.md LICENSE SECURITY.md CONSTITUTION.md
git commit -m "chore: initialise repository with baseline files"
git push -u origin main
```

### 1.4 Create the Integration Branch

All development happens on `develop`, never directly on `main`.

```bash
git checkout -b develop
git push -u origin develop

# Set develop as the default branch
gh repo edit --default-branch develop
```

### 1.5 Protect `main`

This is a manual step in GitHub Settings → Branches → Add branch ruleset, or via the API:

```bash
# Require PRs, status checks, and block force pushes on main
gh api repos/<org>/<repo-name>/branches/main/protection \
  -X PUT \
  --input - << 'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Install, typecheck, lint, test, and build",
      "Workflow lint and pin check"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

> Update `"contexts"` to match the exact check names reported by your CI workflow (see Phase 5). In the workflow below, the job ids are `verify` and `workflow-lint`, but the reported check names are `Install, typecheck, lint, test, and build` and `Workflow lint and pin check`.

> `enforce_admins: true` applies the same rules to repository admins. This is the recommended default — without it, admins can push directly to `main` and bypass CI. If you ever need an emergency bypass (e.g., CI is broken and a hotfix is urgent), temporarily disable it via the API or web UI, land the fix, then re-enable it.

**Gate checklist:**
- [ ] Repository created with correct visibility
- [ ] `develop` branch exists and is the default branch
- [ ] `main` is branch-protected (no direct push, no force push, CI required)
- [ ] `README.md`, `LICENSE`, `SECURITY.md`, `CONSTITUTION.md` committed
- [ ] Auto-delete merged branches enabled
- [ ] Squash merge is the default merge strategy

---

## Phase 2 — GitHub Environment

> Gate: Labels, milestones, issue templates, and PR template are in place before any issues are filed.

### 2.1 Create Labels

Delete GitHub's default labels and replace them with a deliberate taxonomy. See [Appendix A](#appendix-a--label-taxonomy) for the full list and creation commands.

```bash
# Delete all default labels
gh label list --json name -q '.[].name' | xargs -I{} gh label delete "{}" --yes

# Create type labels
gh label create "enhancement"   --color "84b6eb" --description "New capability or improvement"
gh label create "bug"           --color "d73a4a" --description "Defect or unexpected behavior"
gh label create "documentation" --color "0075ca" --description "Documentation-only work"
gh label create "architecture"  --color "e4e669" --description "Architecture decision or constraint"

# Create domain labels
gh label create "setup"         --color "bfd4f2" --description "Repository, tooling, CI, or GitHub configuration"
gh label create "github"        --color "bfd4f2" --description "GitHub-specific setup (templates, labels, Actions, branch protection)"
gh label create "ci"            --color "0e8a16" --description "CI/CD pipeline changes"
gh label create "product"       --color "d93f0b" --description "Product direction, PRDs, use cases, or roadmap"
gh label create "planning"      --color "c2e0c6" --description "Project or milestone planning"
gh label create "testing"       --color "fbca04" --description "Test harness, coverage, or verification"
gh label create "tooling"       --color "f9d0c4" --description "Developer tooling"
gh label create "ui"            --color "1d76db" --description "UI components or interactions"
gh label create "release"       --color "5319e7" --description "Release, packaging, or versioning"
gh label create "security"      --color "e11d48" --description "Security policy or vulnerability"
gh label create "traceability"  --color "ededed" --description "Requirements traceability"

# Create process labels
gh label create "governance"    --color "f1c40f" --description "Decisions, policies, or approval gates"
gh label create "codex"         --color "7c3aed" --description "Automated or AI-agent contribution"

# Standard labels
gh label create "good first issue" --color "7057ff" --description "Suitable for new contributors"
gh label create "help wanted"      --color "008672" --description "Input or contribution welcome"
gh label create "wontfix"          --color "ffffff" --description "Out of scope; will not be addressed"
gh label create "duplicate"        --color "cfd3d7" --description "Covered by another issue"
gh label create "invalid"          --color "e4e669" --description "Not a valid issue"
```

### 2.2 Create Milestones

```bash
gh api repos/<org>/<repo-name>/milestones -X POST \
  -f title="Phase 0 — Initiation" \
  -f description="Governance, roles, go/no-go decision, project setup"

gh api repos/<org>/<repo-name>/milestones -X POST \
  -f title="Phase 1 — Repo Foundation" \
  -f description="README, license, CI, release workflow, branch policy, contributing guide"

gh api repos/<org>/<repo-name>/milestones -X POST \
  -f title="Phase 2 — Product Setup" \
  -f description="PRDs, use cases, design brief, architecture inputs, traceability, glossary"

gh api repos/<org>/<repo-name>/milestones -X POST \
  -f title="Phase 3 — Tech Scaffold" \
  -f description="Language/framework scaffold, browser/test runtime, bridge API, toolchain, test harness"

gh api repos/<org>/<repo-name>/milestones -X POST \
  -f title="v1 Alpha" \
  -f description="Feature delivery and first usable release"
```

### 2.3 Add Issue Templates

Create `.github/ISSUE_TEMPLATE/config.yml` to disable blank issues:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Product vision
    url: <link-to-your-docs-or-roadmap>
    about: Read the product vision before filing a feature request.
```

Create the following templates in `.github/ISSUE_TEMPLATE/`:

**`01-feature.yml`** — new capability or enhancement:

```yaml
name: "Feature request"
description: "Propose a new capability or enhancement."
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: "Problem statement"
      description: "What problem does this solve? Who experiences it?"
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: "Proposed solution"
    validations:
      required: true
  - type: textarea
    id: acceptance
    attributes:
      label: "Acceptance criteria"
      description: "Objective, testable criteria that define done."
    validations:
      required: true
  - type: textarea
    id: related
    attributes:
      label: "Related issues"
```

**`02-bug.yml`** — defect report:

```yaml
name: "Bug report"
description: "Report unexpected behavior."
labels: ["bug"]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: "What happened?"
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: "What was expected?"
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: "Steps to reproduce"
    validations:
      required: true
  - type: input
    id: environment
    attributes:
      label: "Environment"
      placeholder: "OS, runtime version, package version, etc."
```

**`03-task.yml`** — concrete engineering or maintenance work:

```yaml
name: "Task"
description: "Concrete setup, engineering, documentation, or maintenance work."
labels: ["setup"]
body:
  - type: textarea
    id: goal
    attributes:
      label: "Goal"
      description: "What does this task accomplish?"
    validations:
      required: true
  - type: textarea
    id: scope
    attributes:
      label: "Scope"
      description: "What is in and out of scope for this task?"
  - type: textarea
    id: acceptance
    attributes:
      label: "Acceptance criteria"
    validations:
      required: true
  - type: textarea
    id: related
    attributes:
      label: "Related issues"
```

**`04-decision.yml`** — architecture or design decision:

```yaml
name: "Architecture / design decision"
description: "A decision that needs to be explored and recorded as an ADR."
labels: ["architecture", "governance"]
body:
  - type: textarea
    id: context
    attributes:
      label: "Context"
      description: "What situation or constraint drives this decision?"
    validations:
      required: true
  - type: textarea
    id: options
    attributes:
      label: "Options considered"
    validations:
      required: true
  - type: textarea
    id: decision
    attributes:
      label: "Decision"
      description: "Leave blank until decided; fill in during or after triage."
  - type: textarea
    id: consequences
    attributes:
      label: "Consequences"
  - type: textarea
    id: related
    attributes:
      label: "Related issues or ADRs"
```

**`05-requirement-intake.yml`** — new requirement entering triage:

```yaml
name: "Requirement intake"
description: "Propose a requirement before implementation. Triggers the intake workflow."
labels: ["product", "planning"]
body:
  - type: input
    id: req-id
    attributes:
      label: "Proposed requirement ID"
      placeholder: "REQ-XXXX"
    validations:
      required: true
  - type: textarea
    id: user-need
    attributes:
      label: "User need"
      description: "Who needs what, and why?"
    validations:
      required: true
  - type: textarea
    id: statement
    attributes:
      label: "Requirement statement"
      description: "The system SHALL … Use SHALL for mandatory, SHOULD for recommended."
    validations:
      required: true
  - type: textarea
    id: rationale
    attributes:
      label: "Rationale"
  - type: textarea
    id: acceptance
    attributes:
      label: "Acceptance criteria"
      description: "Objective, testable criteria."
    validations:
      required: true
```

### 2.4 Add the PR Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary

<!-- Describe the change and link the issue. -->
Closes #

## Changes

<!-- Key changes the reviewer needs to know about. -->
-
-

## Verification

- [ ] Pre-PR gate passes locally (`npm run verify` or equivalent)
- [ ] Feature works end-to-end in a manual test
- [ ] No regressions in related features

## Screenshots / notes

<!-- For UI or data-format changes: screenshots or test notes. -->

## Risks or follow-up

<!-- Known gaps, deferred work, or things to watch. -->
```

**Commit and push:**

```bash
git add .github/
git commit -m "chore: add issue templates, PR template, and GitHub environment"
git push
```

**Gate checklist:**
- [ ] Default GitHub labels deleted
- [ ] Custom label taxonomy created (type + domain + process)
- [ ] All five milestones created
- [ ] Issue templates added and blank issues disabled
- [ ] PR template added
- [ ] `develop` is the default branch

---

## Phase 3 — Backlog Bootstrap

> Gate: The initial backlog of epics, objectives, and tasks is filed, labeled, and milestone-assigned before development begins.

A well-structured backlog is the primary coordination mechanism for the project. It also serves as the project's public health indicator — anyone looking at open issues can understand where the project stands.

### 3.1 Backlog Structure

Use a three-level hierarchy:

```
Epic (#1)          — Product-level, spans multiple phases (stays open for months)
  └── Objective (#2) — Phase-level umbrella, groups related tasks
        └── Task (#3, #4, …) — Concrete, closeable work items
```

- **Epics** are filed as standard issues with label `enhancement` + `planning`. They stay open until the full product scope is delivered.
- **Objectives** are filed with label `setup` or domain label + `planning`. Their body references the epic.
- **Tasks** are filed with the appropriate type and domain labels. Their body references the objective.

### 3.2 File the Initial Epics

File one epic per major product capability. Base these on the PRD. Example:

```bash
gh issue create \
  --title "Epic: v1 alpha — <product name> end-to-end loop" \
  --body "$(cat << 'EOF'
## Purpose

Deliver the first useful version of <product name>.

## v1 Goal

Ship a minimal but coherent product that proves the end-to-end loop:
1. <step 1>
2. <step 2>
3. <step 3>

## Out of scope for v1

- <item>
- <item>

## Related

- PRD: docs/prd.md
- Roadmap tracker: (link after filing)
EOF
  )" \
  --label "enhancement,product,planning"
```

### 3.3 File the Phase Objectives

File an objective issue per phase from your deliverables map. Example for Phase 1:

```bash
gh issue create \
  --title "Objective: make the GitHub environment ready for development" \
  --body "$(cat << 'EOF'
## Objective

Prepare the repository so development can start smoothly once setup is complete.

## Scope

Repository identity, CI, branch protection, issue workflow, release pipeline.

## Acceptance

All Phase 1 tasks in this milestone are closed.

## Related

Epic: #1
EOF
  )" \
  --label "setup,github,planning" \
  --milestone "Phase 1 — Repo Foundation"
```

### 3.4 File Task Issues

File one task issue per concrete work item. Each task must have:
- A clear **Goal** (one sentence)
- Explicit **Acceptance criteria** (objective and testable)
- A reference to its parent objective

See [Appendix B](#appendix-b--issue-creation-scripts) for a shell script that creates the standard Phase 1 backlog in bulk.

### 3.5 File the Roadmap Tracker Issue

A single pinned issue that tracks which phases are complete. Update it as milestones close.

```bash
gh issue create \
  --title "Roadmap: first increment (v1 alpha)" \
  --body "$(cat << 'EOF'
## Phases

| Phase | Status | Milestone |
|---|---|---|
| 0 — Initiation | ✅ Complete | Phase 0 |
| 1 — Repo Foundation | 🔄 In progress | Phase 1 |
| 2 — Product Setup | ⏳ Pending | Phase 2 |
| 3 — Tech Scaffold | ⏳ Pending | Phase 3 |
| v1 Alpha | ⏳ Pending | v1 Alpha |
EOF
  )" \
  --label "product,planning"

# Pin the issue (separate command — gh issue create has no --pin flag)
gh issue pin <issue-number> --repo <org>/<repo-name>
```

**Gate checklist:**
- [ ] At least one epic issue filed per major product capability
- [ ] One objective issue per phase milestone
- [ ] Task issues filed for Phase 1 (repo foundation) with acceptance criteria
- [ ] All issues labeled and milestone-assigned
- [ ] Roadmap tracker issue filed and pinned

---

## Phase 4 — Toolchain & Project Scaffold

> Gate: The project builds, typechecks, lints, and tests with zero errors before CI is wired up.

This phase establishes the technical foundation. Do this work on `develop`, in feature branches if working collaboratively.

### 4.1 Initialise the Package / Build System

For a TypeScript project:

```bash
npm init -y
npm install --save-dev typescript eslint prettier vitest
```

Set `.npmrc` to strip the `v` prefix from version tags (required by most plugin marketplaces):

```
tag-version-prefix=""
```

### 4.2 TypeScript Configuration

`tsconfig.json` with strict mode enabled:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

**Why strict mode from day one:** retrofitting strict TypeScript onto an existing codebase is one of the most time-consuming tech-debt payoffs. Start strict.

### 4.3 Linting

`eslint.config.js` — use a flat config with at minimum:
- TypeScript ESLint rules
- Import restriction rules to enforce your architectural boundaries (e.g., UI must not import infrastructure directly)
- Prettier integration (so lint and format never conflict)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettierConfig,
  {
    rules: {
      // Enforce no raw try/catch outside infrastructure layer
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TryStatement',
          message: 'Use Result<T,E> instead of try/catch. Raw try/catch is only allowed in infrastructure.',
        },
      ],
    },
  },
);
```

### 4.4 Formatting

`.prettierrc`:

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "useTabs": true
}
```

Add `.prettierignore` for generated files and dependencies:

```
node_modules/
dist/
coverage/
docs/api/
```

### 4.5 Test Harness

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',  // or 'jsdom' for browser-targeting code
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/domain/**', 'src/application/**'],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
```

**Coverage scope:** measure coverage for domain and application layers, not infrastructure adapters or UI. Infrastructure is tested through integration; UI is tested through component tests or end-to-end.

### 4.6 Package Scripts

`package.json` — define a standard set of scripts that CI will call:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint":      "eslint .",
    "lint:fix":  "eslint . --fix",
    "format":    "prettier --write .",
    "format:check": "prettier --check .",
    "test":      "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "build":     "tsc --noEmit && <your build command>",
    "verify":    "npm audit --audit-level=high --omit=dev && npm run typecheck && npm run lint && npm run test && npm run build"
  }
}
```

The `verify` script is the **pre-PR gate** — it must pass before any PR is opened. This is the single source of truth for "is this code ready to be reviewed."

### 4.7 Verify the Scaffold

```bash
npm run verify
```

All commands must exit 0 before proceeding.

**Gate checklist:**
- [ ] TypeScript configured with strict mode
- [ ] ESLint configured with architectural boundary rules
- [ ] Prettier configured and does not conflict with ESLint
- [ ] Vitest configured with coverage reporting
- [ ] `npm run verify` exits 0 with no code yet (only config files)
- [ ] `package.json` scripts match the names CI will call

---

## Phase 5 — CI/CD Foundation

> Gate: CI runs on every PR to `develop` and passes the same checks as `npm run verify`.

### 5.1 CI Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [develop, demo, main]
  pull_request:
    branches: [develop, demo, main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    name: Install, typecheck, lint, test, and build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<SHA>  # pin to a commit SHA

      - uses: actions/setup-node@<SHA>
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Audit dependencies
        run: npm audit --audit-level=high --omit=dev

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build
```

> **Important:** pin `uses:` references to their commit SHAs, not branch or version tags. Use `@<40-char-SHA>` for every third-party action. This is a supply-chain security requirement — see [supply-chain policy](#55-supply-chain-hardening).

### 5.2 Release Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - '*'

permissions:
  contents: write

jobs:
  release:
    name: Create GitHub release
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<SHA>

      - uses: actions/setup-node@<SHA>
        with:
          node-version: '22'
          cache: 'npm'

      - name: Verify tag is semver
        id: semver
        run: |
          if [[ ! "$GITHUB_REF_NAME" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]]; then
            echo "ERROR: tag must be semver, e.g. 0.1.0, 0.1.0-beta.1, or 0.1.0+build.1" >&2
            exit 1
          fi
          if [[ "$GITHUB_REF_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+- ]]; then
            echo "prerelease=true" >> "$GITHUB_OUTPUT"
          else
            echo "prerelease=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Verify tag is on main HEAD
        run: |
          git fetch origin main
          MAIN_SHA=$(git rev-parse origin/main)
          TAG_SHA=$(git rev-parse HEAD)
          if [ "$TAG_SHA" != "$MAIN_SHA" ]; then
            echo "ERROR: tag must be on main HEAD" >&2
            exit 1
          fi

      - name: Install and verify
        run: npm ci && npm run verify

      - name: Create release
        uses: softprops/action-gh-release@<SHA>
        with:
          files: |
            dist/*
          prerelease: ${{ steps.semver.outputs.prerelease == 'true' }}
```

### 5.3 Dependabot

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    groups:
      dev-tooling:
        patterns: ["eslint*", "prettier*", "typescript*", "vite*", "vitest*"]
        update-types: ["minor", "patch"]
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
```

### 5.4 Auto-merge for Safe Dependabot PRs

Create `.github/workflows/dependabot-auto-merge.yml`:

```yaml
name: Dependabot auto-merge

on:
  pull_request_target:
    types: [opened, reopened, synchronize]

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: |
      github.event.pull_request.user.login == 'dependabot[bot]' &&
      github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - name: Fetch dependabot metadata
        id: meta
        uses: dependabot/fetch-metadata@<SHA>
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge patch and dev-dep minor updates
        if: |
          steps.meta.outputs.update-type == 'version-update:semver-patch' ||
          (steps.meta.outputs.update-type == 'version-update:semver-minor' &&
           steps.meta.outputs.dependency-type == 'direct:development')
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> **Token permissions for Dependabot workflows:** Dependabot PRs need a writable token to enable auto-merge. This workflow uses `pull_request_target` so the token comes from the protected base-branch workflow, then limits execution to same-repository Dependabot PRs and never checks out PR code. Keep those guards together. If you add steps that execute repository code, move them to a separate `pull_request` workflow with read-only permissions.

Add a workflow-lint step to CI that fails the build if any `uses:` reference is not SHA-pinned:

```yaml
  workflow-lint:
    name: Workflow lint and pin check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@<SHA>

      - name: Check action SHA pinning
        run: |
          set -e
          # Match both "- uses:" (inline step) and "  uses:" (named step) forms;
          # the leading whitespace+optional-dash anchor avoids matching uses: inside shell strings
          UNPINNED=$(grep -rE '^[[:space:]]*(-[[:space:]]*)?uses:[[:space:]]*[^@[:space:]#]+@[^#[:space:]]+' .github/workflows/ \
            | grep -vE '@[0-9a-f]{40}([[:space:]#]|$)' || true)
          if [ -n "$UNPINNED" ]; then
            echo "Unpinned actions found:"
            echo "$UNPINNED"
            exit 1
          fi
          echo "All actions are SHA-pinned."
```

**Gate checklist:**
- [ ] `ci.yml` workflow runs on PRs to `develop`, `demo`, `main`
- [ ] `release.yml` publishes only for semver tags on `main` HEAD
- [ ] Dependabot configured for npm and GitHub Actions
- [ ] Dependabot auto-merge for safe updates configured
- [ ] All `uses:` references SHA-pinned (not version tags)
- [ ] Supply-chain pin-check added to CI
- [ ] Branch protection updated to require the CI checks named `Install, typecheck, lint, test, and build` and `Workflow lint and pin check`

---

## Phase 6 — Architecture & Documentation

> Gate: The architecture is documented in ADRs, the contributing guide is written, and automated/AI agents have an operating manual before the first feature branch is cut.

### 6.1 Architecture Decision Records (ADRs)

Create `docs/adr/` and write an ADR for every structural decision made during the scaffold phase. Use a consistent template:

```markdown
---
title: "ADR-NNN: <short title>"
status: accepted
date: YYYY-MM-DD
---

# ADR-NNN: <Short Title>

## Context

<What situation or constraint drives this decision?>

## Decision

<What did we decide?>

## Consequences

<What does this make easier or harder?>
```

**Minimum ADRs to write before Phase 7:**
- ADR-001: Folder structure and layer boundaries
- ADR-002: Abstraction for external APIs (bridge / port pattern)
- ADR-003: Error handling strategy (Result type vs. exceptions)
- ADR-004: Testing philosophy (unit scope, what gets mocked)
- ADR-005: Branching and release model

### 6.2 Contributing Guide

Create `docs/contributing.md` covering:
1. How to open issues (templates, intake process)
2. Label and milestone conventions
3. Branching model and naming conventions (`feature/`, `fix/`, `docs/`, `chore/`, `refactor/`)
4. Commit message format (imperative present tense, optional scope prefixes)
5. Pre-PR gate (`npm run verify`)
6. PR description requirements (PR template walkthrough)
7. Merge policy (squash merge; one commit per feature)
8. Branch protection requirements (who configures them and what they are)
9. CI job descriptions

### 6.3 Local Development Guide

Create `docs/local-development.md` covering:
1. Prerequisites (Node version, package manager, any platform dependencies)
2. First-time setup (`npm ci`)
3. Running in development mode
4. Running tests and watching
5. Pre-PR verification gate command
6. How to run a single test file
7. Environment variables (if any)

### 6.4 CLAUDE.md / AGENTS.md (for AI-assisted Projects)

If AI agents or Claude Code will contribute to the repository, add:

**`CLAUDE.md`** — codebase orientation for Claude Code. Include:
- All `npm run` commands with descriptions
- Architecture diagram (text-based layer diagram)
- Key files and their roles
- Import rules (what may import what)
- Result type conventions
- Branching model summary
- Pre-PR gate command (one-liner)

**`AGENTS.md`** — operating manual for automated agents. Include:
- Which tools and APIs agents may use
- Which operations require human confirmation
- What agents must never do (e.g., push to main, delete files without confirmation)
- Standard workflows for common tasks (open PR, address review, run gate)

**`.codex/`** — mechanical step-by-step recipes for agent-executed workflows. Pair each recipe with a corresponding `AGENTS.md` section.

### 6.5 Requirements Intake Process

If your project uses formal requirements tracking, establish the intake workflow:

1. Create `requirements/intake/REQ-0000-template.md` with standard frontmatter (id, status, summary, statement using SHALL language, acceptance criteria, traceability).
2. Write `docs/process/requirements-intake.md` describing the four-step flow: file intake issue → optional design intake issue → draft PR with requirement file → promote to `accepted` after triage.
3. Create a `docs/traceability.md` index that maps requirement IDs to implementing PRs and test cases.

**Gate checklist:**
- [ ] ADRs written for all structural decisions (min 5)
- [ ] `docs/contributing.md` covers all workflow steps
- [ ] `docs/local-development.md` lets a newcomer run the project in under 10 minutes
- [ ] `CLAUDE.md` / `AGENTS.md` exist if AI agents will contribute
- [ ] Requirements intake process documented (if using formal requirements)

---

## Phase 7 — First Increment

> Gate: A reviewed, CI-passing PR is merged to `develop`, and the first tagged release is cut from `main`.

This phase closes the loop. The goal is not to ship a full feature — it is to prove that the entire pipeline works: branch → implement → pre-PR gate → PR → CI → review → merge → release.

### 7.1 Pick the "Hello World" Increment

The first increment must be:
- **Small enough** to complete in one or two sessions
- **End-to-end enough** to exercise every layer of the architecture
- **Valuable enough** to demonstrate the product's core value proposition

Good examples:
- A CLI tool that prints its own version
- A plugin that registers itself and shows a "Hello from <project>" notice
- A web app that loads a configuration file and displays its contents
- An API that returns a health check endpoint

Bad examples:
- A "hello world" that only touches one file and skips the bridge/adapter layer
- An increment so large it requires multiple PRs to land

### 7.2 File the Increment Issue

```bash
gh issue create \
  --title "feat: <hello world description>" \
  --body "$(cat << 'EOF'
## Goal

<What this increment delivers and why it proves the loop>

## Acceptance criteria

- [ ] <objective criterion 1>
- [ ] <objective criterion 2>
- [ ] CI passes
- [ ] Manual test confirms <expected behavior>

## Related

Epic: #1
Objective: #<phase 3 objective issue number>
EOF
  )" \
  --label "enhancement" \
  --milestone "v1 Alpha"
```

### 7.3 Cut a Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<short-description>
```

### 7.4 Implement

Write the minimum code to satisfy the acceptance criteria. Key discipline:

- **Follow the architecture** — every layer the ADRs define must be represented, even if trivially.
- **Write at least one test** — even a smoke test that confirms the domain object constructs correctly.
- **No shortcuts on the bridge/adapter layer** — the abstraction must be real, even if the implementation is a stub.

### 7.5 Run the Pre-PR Gate

```bash
npm run verify
```

All checks must pass. Do not open a PR until this exits 0.

For common gate failures:

| Failure | Fix |
|---|---|
| TypeScript error | Fix the type error; do not add `any` |
| ESLint error | Fix the violation; do not add `// eslint-disable` |
| Test failure | Fix the test or the code |
| Build failure | Fix the build; check for missing imports or misconfigured paths |
| Audit advisory | Run `npm audit fix` or pin to a safe version |

### 7.6 Open the Pull Request

```bash
git push -u origin feature/<short-description>
gh pr create \
  --title "feat: <short description>" \
  --body "$(cat << 'EOF'
## Summary

Closes #<issue number>

## Changes

- <key change 1>
- <key change 2>

## Verification

- [x] `npm run verify` passes locally
- [x] Manual test confirms <expected behavior>
- [x] No regressions observed

## Screenshots / notes

<if UI change, add screenshot>

## Risks or follow-up

<known gaps or deferred items>
EOF
  )" \
  --base develop
```

### 7.7 Wait for CI

CI must pass before merging. If CI fails:
1. Read the failure output — do not retry blindly.
2. Fix the root cause locally.
3. Run `npm run verify` locally to confirm the fix.
4. Push the fix; CI re-runs automatically.

### 7.8 Merge

```bash
# Squash and merge (keeps develop history linear)
gh pr merge <PR number> --squash --delete-branch
```

The squash commit message should be the PR title + an optional body explaining why (not what).

### 7.9 Cut the First Release

```bash
# Step 1: bump version files on a release branch (never commit directly to main)
git checkout develop && git pull origin develop
git checkout -b release/0.1.0
npm version 0.1.0 --no-git-tag-version   # updates package files, no commit or tag yet
for file in package.json package-lock.json manifest.json versions.json; do
  if [ -f "$file" ]; then
    git add "$file"
  fi
done
git diff --cached --quiet && { echo "No version files were staged"; exit 1; }
git commit -m "chore: bump version to 0.1.0"
git push -u origin release/0.1.0

# Step 2: PR release branch → main (goes through normal CI + review gate)
gh pr create --title "release: 0.1.0" --base main --head release/0.1.0
# (wait for CI, then squash-merge)

# Step 3: tag main HEAD — push the tag only, no extra commit
git checkout main && git pull origin main
git tag 0.1.0
git push origin 0.1.0
```

The release workflow triggers on the tag and creates a GitHub release with the built artifacts.

**Gate checklist — Phase 7 complete when:**
- [ ] Increment issue has clear acceptance criteria
- [ ] Feature branch cut from `develop`
- [ ] `npm run verify` passes locally before PR is opened
- [ ] PR description follows the PR template
- [ ] CI passes on the PR
- [ ] PR is squash-merged to `develop`
- [ ] Tag `0.1.0` (or first version) is pushed from `main` HEAD
- [ ] GitHub release is created automatically by the release workflow
- [ ] Release artifacts are attached to the GitHub release

---

## Summary — Phase Gate Dependency Chain

```
Phase 0 (Initiation + Go/No-Go)
  └── Phase 1 (Repo Foundation + Branch Protection)
        └── Phase 2 (GitHub Environment: labels, milestones, templates)
              └── Phase 3 (Backlog: epics, objectives, tasks filed)
                    └── Phase 4 (Toolchain: verify passes with zero errors)
                          └── Phase 5 (CI/CD: GitHub Actions wired)
                                └── Phase 6 (Docs: ADRs, contributing guide, AGENTS.md)
                                      └── Phase 7 (First Increment: shipped and released)
```

Each phase is a quality gate. The cost of skipping one phase accumulates as technical debt that blocks every phase that depends on it.

---

## Appendix A — Label Taxonomy

Full label set for a typical software project:

### Type Labels

| Name | Color | Description |
|---|---|---|
| `enhancement` | `#84b6eb` | New capability or improvement |
| `bug` | `#d73a4a` | Defect or unexpected behavior |
| `documentation` | `#0075ca` | Documentation-only work |
| `architecture` | `#e4e669` | Architecture decision or constraint |

### Domain Labels

| Name | Color | Description |
|---|---|---|
| `setup` | `#bfd4f2` | Repository, tooling, CI, or GitHub configuration |
| `github` | `#bfd4f2` | GitHub-specific setup (templates, labels, Actions, branch protection) |
| `ci` | `#0e8a16` | CI/CD pipeline changes |
| `product` | `#d93f0b` | Product direction, PRDs, use cases, or roadmap |
| `planning` | `#c2e0c6` | Project or milestone planning |
| `testing` | `#fbca04` | Test harness, coverage, or verification |
| `tooling` | `#f9d0c4` | Developer tooling |
| `ui` | `#1d76db` | UI components or interactions |
| `release` | `#5319e7` | Release, packaging, or versioning |
| `security` | `#e11d48` | Security policy or vulnerability |
| `traceability` | `#ededed` | Requirements traceability |
| `pages` | `#006b75` | Static site / demo deployment |

### Process Labels

| Name | Color | Description |
|---|---|---|
| `governance` | `#f1c40f` | Decisions, policies, or approval gates |
| `codex` | `#7c3aed` | Automated or AI-agent contribution |

### Standard Labels

| Name | Color | Description |
|---|---|---|
| `good first issue` | `#7057ff` | Suitable for new contributors |
| `help wanted` | `#008672` | Input or contribution welcome |
| `wontfix` | `#ffffff` | Out of scope; will not be addressed |
| `duplicate` | `#cfd3d7` | Covered by another issue |
| `invalid` | `#e4e669` | Not a valid issue |

---

## Appendix B — Issue Creation Scripts

The following script creates the standard Phase 1 backlog for a new project. Adapt titles and bodies to your stack.

```bash
#!/usr/bin/env bash
# create-phase1-backlog.sh
# Usage: REPO=<org>/<repo> bash create-phase1-backlog.sh
set -euo pipefail

REPO="${REPO:?Set REPO=org/repo}"
MILESTONE="Phase 1 — Repo Foundation"

create_issue() {
  gh issue create \
    --repo "$REPO" \
    --title "$1" \
    --body "$2" \
    --label "$3" \
    --milestone "$MILESTONE"
}

create_issue \
  "Add repository identity, README, license, and baseline documentation" \
  $'## Goal\nEstablish project identity with README, LICENSE, SECURITY.md, and CONSTITUTION.md.\n\n## Acceptance criteria\n- [ ] README includes one-sentence description and quick-start stub\n- [ ] LICENSE file present\n- [ ] SECURITY.md with responsible disclosure path\n- [ ] CONSTITUTION.md captures non-negotiable working agreements' \
  "documentation,setup"

create_issue \
  "Set up GitHub issue templates, PR template, labels, and milestone conventions" \
  $'## Goal\nCreate a deliberate GitHub environment so issues are structured and searchable.\n\n## Acceptance criteria\n- [ ] Default labels deleted\n- [ ] Custom label taxonomy created\n- [ ] All milestones exist\n- [ ] Issue templates added (feature, bug, task, decision, requirement intake)\n- [ ] PR template added\n- [ ] Blank issues disabled' \
  "documentation,setup,github"

create_issue \
  "Define branch protection and merge policy for main" \
  $'## Goal\nProtect main from direct pushes and force pushes; require CI to pass.\n\n## Acceptance criteria\n- [ ] Branch protection rule on main requires PR before merge\n- [ ] Required status check matches the CI check name exactly\n- [ ] Force pushes blocked\n- [ ] Direct deletions blocked\n- [ ] develop is the default branch' \
  "setup,github"

create_issue \
  "Scaffold the project with language and build toolchain" \
  $'## Goal\nBootstrap the project so it builds, typechecks, lints, and tests with zero errors.\n\n## Acceptance criteria\n- [ ] npm run typecheck passes\n- [ ] npm run lint passes\n- [ ] npm run test passes (even if no tests yet)\n- [ ] npm run build produces an artifact\n- [ ] npm run verify exits 0' \
  "enhancement,setup"

create_issue \
  "Add CI verification for install, lint, typecheck, test, and build" \
  $'## Goal\nCI runs the same checks as npm run verify on every PR to develop.\n\n## Acceptance criteria\n- [ ] ci.yml triggers on push/PR to develop, demo, main\n- [ ] Jobs: verify (typecheck, lint, test, build) + workflow-lint\n- [ ] All third-party actions SHA-pinned\n- [ ] Branch protection requires CI to pass' \
  "setup,ci"

create_issue \
  "Add release and packaging workflow" \
  $'## Goal\nAutomate release artifact creation on semver tags from main.\n\n## Acceptance criteria\n- [ ] release.yml validates semver tags before release creation\n- [ ] Workflow verifies tag is on main HEAD\n- [ ] GitHub release created with built artifacts\n- [ ] Pre-release flag set for tags with pre-release suffix' \
  "setup,ci,release"

create_issue \
  "Configure dependency, security, and maintenance automation" \
  $'## Goal\nKeep dependencies current and security advisories surfaced automatically.\n\n## Acceptance criteria\n- [ ] Dependabot configured for npm and GitHub Actions\n- [ ] Auto-merge for safe dependency updates\n- [ ] Dependency review action on PRs\n- [ ] OpenSSF Scorecard scheduled' \
  "setup,github,ci,security"

create_issue \
  "Document local development and contribution workflow" \
  $'## Goal\nA newcomer can run the project locally in under 10 minutes using the docs.\n\n## Acceptance criteria\n- [ ] docs/local-development.md covers prerequisites, setup, dev commands\n- [ ] docs/contributing.md covers issue workflow, branching, commits, PRs, CI\n- [ ] Pre-PR gate documented with exact command' \
  "documentation,setup"

echo "Phase 1 backlog created."
```

---

## Appendix C — Workflow Templates

### Branching Model Summary

```
develop  ←── all feature branches merge here
   │
   ├──► demo     (preview / GitHub Pages deploy)
   │
   └──► main     (stable release gate)
         │
         └──► tag X.Y.Z  →  release workflow  →  GitHub Release
```

- Cut feature branches from `develop`, not `main`.
- Open PRs targeting `develop`.
- To publish a preview: PR `develop` → `demo`.
- To cut a release: PR `develop` → `main`, merge, tag `main` HEAD with the version.
- Never push directly to `main`.
- Never tag from any branch other than `main`.

### Commit Message Format

```
<type>(<optional scope>): <short summary in imperative present tense>

<optional body: why this change, not what — keep under 5 lines>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Examples:
```
feat(auth): add token refresh on 401 response
fix: prevent navigator crash on empty vault
docs: add requirements traceability index
chore(deps): upgrade vitest to 4.1
```

### Pre-PR Checklist (Human)

Before opening any PR:

```bash
npm audit --audit-level=high --omit=dev  # no high/critical advisories in prod deps
npm run typecheck                         # strict TypeScript, zero errors
npm run lint                              # ESLint, zero errors
npm run test                              # all tests pass
npm run build                             # artifact builds cleanly
```

All must pass. Fix the root cause; never suppress errors to make the gate pass.

### Pre-PR Checklist (Agent / Automation)

See `.codex/pre-pr-gate.md` if present. At minimum:
1. Run `npm run verify`.
2. If any step fails: fix the root cause, do not bypass.
3. Confirm no secrets or generated artifacts are staged.
4. Open the PR with the standard template filled out.
