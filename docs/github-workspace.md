---
title: "Specorator GitHub workspace configuration"
doc_type: governance
status: draft
owner: engineering
last_updated: 2026-05-02
references:
  - docs/contributing.md
  - docs/roadmap-v1.md
  - docs/initiation.md
---

# GitHub Workspace Configuration

**Related issues:** [#44](https://github.com/Luis85/specorator/issues/44)  
**Admin instructions:** Settings that cannot be configured through the codebase are marked **[admin action required]** with exact values.

This document specifies which GitHub repository features to enable, the GitHub Project board structure, project views and fields, and how issues, milestones, labels, PRs, releases, and views work together.

---

## 1. Repository Features

Apply these settings in **Settings → General** and **Settings → Features**.

| Feature | Setting | Rationale |
|---|---|---|
| Issues | **Enabled** | Primary work tracking mechanism |
| Pull requests | **Enabled** | All changes land via PR |
| Projects | **Enabled** | Phase-level and cross-cutting views |
| Discussions | **Disabled for now** | No community yet; re-evaluate post v1 alpha |
| Wiki | **Disabled** | Documentation lives in `docs/` under version control |
| GitHub Pages | **Enabled** | Product page (issue #22) will be hosted here |
| Sponsorships | Owner's preference | No requirement either way |
| Preserve this repository | Owner's preference | — |

**[admin action required]** Apply the above in Settings → General → Features.

### Security and dependency features

| Feature | Setting |
|---|---|
| Dependency graph | Enabled (auto) |
| Dependabot alerts | Enabled |
| Dependabot security updates | Enabled |
| Dependabot version updates | Configured via `.github/dependabot.yml` |
| Secret scanning | Enabled |
| Push protection | Enabled |
| Code scanning | Evaluate after Phase 4 — not required for v1 alpha |

**[admin action required]** Verify in Settings → Security → Code security and analysis.

---

## 2. Branch Protection

Full specification is in [docs/contributing.md §8](./contributing.md#8-branch-protection-for-main). Summary:

**[admin action required]** In **Settings → Branches → Add branch ruleset**, apply:

| Setting | Value |
|---|---|
| Target branch | `main` |
| Require a pull request before merging | ✓ |
| Required status check | `Install, typecheck, lint, test, and build` |
| Require branches to be up to date | ✓ |
| Block force pushes | ✓ |
| Restrict deletions | ✓ |

---

## 3. Labels

Verify the following labels exist in **Issues → Labels**. Create any that are missing.

**[admin action required]** Create missing labels with the colours below. Exact hex values can be adjusted for accessibility; the names and descriptions must match.

### Type labels

| Label | Colour | Description |
|---|---|---|
| `enhancement` | `#a2eeef` | New capability or improvement |
| `bug` | `#d73a4a` | Defect or unexpected behavior |
| `documentation` | `#0075ca` | Documentation-only work |
| `architecture` | `#e4e669` | Architecture decision or constraint |

### Intake labels

These labels are auto-applied by the issue form templates (`01-design-intake.yml`, `02-requirement-intake.yml`) and must exist for the intake flow to work correctly.

| Label | Colour | Description |
|---|---|---|
| `requirements` | `#d4c5f9` | Requirement intake item |
| `design` | `#fef2c0` | Design intake item |
| `intake` | `#c5def5` | New item in the intake queue |
| `needs-triage` | `#e4e669` | Awaiting triage and milestone assignment |

### Domain labels

| Label | Colour | Description |
|---|---|---|
| `setup` | `#bfd4f2` | Repository, tooling, or CI configuration |
| `github` | `#0e8a16` | GitHub-specific setup |
| `product` | `#c2e0c6` | Product direction, PRDs, use cases |
| `planning` | `#f9d0c4` | Project or milestone planning |
| `pages` | `#1d76db` | GitHub Pages product page |
| `ux-research` | `#fbca04` | UX research, personas, or design inputs |
| `testing` | `#b60205` | Test harness, coverage, or verification |
| `traceability` | `#5319e7` | Requirements traceability or ID conventions |

### Process labels

| Label | Colour | Description |
|---|---|---|
| `p3-express` | `#e99695` | P3.express governance activities |
| `project-management` | `#c5def5` | Cross-cutting project management |
| `governance` | `#eeeeee` | Policies, decisions, and approval gates |

### Standard GitHub labels

Keep the defaults: `good first issue`, `help wanted`, `wontfix`, `duplicate`, `invalid`.

---

## 4. Milestones

Verify the following milestones exist in **Issues → Milestones**. Create any that are missing.

**[admin action required]** Create missing milestones:

| Milestone | Description |
|---|---|
| Phase 0 — Initiation | P3.express governance, go/no-go gate, project setup |
| Phase 1 — Repo Foundation | README, license, CI, release, branch protection, contributing guide |
| Phase 2 — Product Setup | PRDs, use cases, design, traceability, glossary |
| Phase 3 — Plugin Shell | Vue scaffold, bridge API, test harness, TypeDoc |
| v1 Alpha | Feature delivery: template install, navigator, artifact creation |

No due dates required at this stage. Add dates when Phase 4 planning is complete.

---

## 5. GitHub Project Board

### Decision

**Use one GitHub Project board** named **Specorator** to provide cross-cutting views that the flat issue list cannot. A single board with multiple views is simpler to maintain than several boards for a solo project.

**[admin action required]** Create the project in **github.com/users/Luis85/projects → New project → Board** or **Table** layout. Link it to the `Luis85/specorator` repository.

### Project Fields

Define these custom fields on the project:

| Field | Type | Values / Notes |
|---|---|---|
| Status | Single select | `No status`, `Backlog`, `Ready`, `In progress`, `In review`, `Done`, `Deferred` |
| Priority | Single select | `P0 — Critical`, `P1 — High`, `P2 — Normal`, `P3 — Low` |
| Phase / milestone | Single select | mirrors the five milestones above |
| Product perspective | Single select | `Product`, `Engineering`, `Design`, `QA`, `Release`, `Documentation`, `Governance` |
| Risk level | Single select | `Low`, `Medium`, `High` |
| Blocked | Checkbox | True when waiting on an external dependency or decision |

The built-in `Milestone` and `Assignee` fields from the repository can be reused; create the above as additional custom fields.

### Project Views

Create the following views as **Table** or **Board** layout:

| View | Filter / group | Purpose |
|---|---|---|
| **All active** | Status ≠ Done, Status ≠ Deferred | Default entry point — everything in flight |
| **Phase 0 — Initiation** | Phase = Phase 0 | Governance and go/no-go checklist |
| **Phase 1 — Repo Foundation** | Phase = Phase 1 | Repo and tooling setup progress |
| **Phase 2 — Product Setup** | Phase = Phase 2 | PRDs, use cases, and product artifacts |
| **Phase 3 — Plugin Shell** | Phase = Phase 3 | Plugin architecture and toolchain |
| **v1 Alpha delivery** | Phase = v1 Alpha | Feature delivery — primary execution view |
| **v2.0 planning** | Label = `enhancement`, `architecture` | Long-horizon planning for companion app |
| **Risks and follow-up** | Risk level = High OR Medium | Standing risks from the initiation register |
| **Decision gates** | Label = `governance`, `architecture` | Decisions and approval gates to resolve |
| **By perspective** | Group by: Product perspective | Multi-role view for product, engineering, QA, etc. |

---

## 6. How the Pieces Fit Together

This section summarises how issues, milestones, labels, PRs, releases, and project views compose into a coherent workflow.

### Issues

- Every piece of work has an issue.
- Issues use a template; blank issues are disabled.
- Labels express type + domain; milestone expresses phase.
- New requirements and design decisions go through the intake process before implementation (see [docs/process/requirements-intake.md](./process/requirements-intake.md)).
- Objective / tracking issues (#1, #2, #11, #24, #47) stay open until all child issues are resolved.

### Pull Requests

- Every change lands via a PR that closes at least one issue (`Closes #NNN`).
- CI must pass before merge.
- Squash merge keeps `main` history linear.
- The PR template prompts for verification steps and screenshots for UI changes.

### Milestones

- Each issue belongs to exactly one milestone.
- A milestone is "complete" when all its issues are closed or explicitly deferred.
- Phase 4 (v1 Alpha milestone) is the active execution milestone.

### Releases

- Releases are created from `main` after all v1 Alpha milestone issues are closed.
- The release workflow (`.github/workflows/release.yml`) packages `main.js` and `manifest.json` as release assets.
- Release tags follow `v{major}.{minor}.{patch}` (e.g., `v0.1.0` for first alpha).
- Pre-release tags (`v0.1.0-alpha.1`) trigger pre-release packaging.
- See `docs/marketplace-readiness.md` for the Obsidian marketplace submission checklist.

### Project Views as the Planning Surface

The GitHub Project board is the primary planning surface, not the issue list:
- **All active** view is the daily driver.
- **v1 Alpha delivery** view tracks Phase 4 progress.
- **Risks and follow-up** view surfaces blockers and risks from the initiation register.
- **Decision gates** view tracks open architecture and governance decisions.

---

## 7. GitHub Pages Setup

**[admin action required]** When the product page (issue #22) is implemented:

1. Go to **Settings → Pages**.
2. Set Source to **Deploy from a branch** or **GitHub Actions** (preferred for a Vite-built site).
3. If branch-based: set branch to `gh-pages`, folder to `/ (root)`.
4. If Actions-based: the deploy workflow handles publishing; no manual branch selection needed.
5. The product page URL will be `https://luis85.github.io/specorator/`.
6. Link the URL from the README once live.

---

## 8. Manual Admin Actions Summary

All items requiring admin access to the GitHub repository settings:

| # | Action | Location |
|---|---|---|
| 1 | Enable/disable repository features per §1 | Settings → General → Features |
| 2 | Verify security features per §1 | Settings → Security |
| 3 | Add branch ruleset for `main` per §2 | Settings → Branches |
| 4 | Create missing labels per §3 | Issues → Labels |
| 5 | Create missing milestones per §4 | Issues → Milestones |
| 6 | Create GitHub Project board per §5 | github.com/users/Luis85/projects |
| 7 | Add custom fields and views to the board | Project settings |
| 8 | Link project to `Luis85/specorator` repository | Project settings → Linked repositories |
| 9 | Configure GitHub Pages when product page is ready | Settings → Pages |
