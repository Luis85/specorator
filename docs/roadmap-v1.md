# First Increment Roadmap — Specorator v1 Alpha

This document organizes the existing GitHub issues into a sequenced delivery plan for the Specorator v1 alpha release. It is derived from the planning issues and the product vision, and is maintained alongside the issue tracker.

---

## Overview

| Phase | Name | Tracking issue | Prerequisite |
|-------|------|----------------|--------------|
| 0 | Project Initiation | — | None |
| 1 | Repository Foundation | #2 | Phase 0 gate (#41) |
| 2 | Product Setup Baseline | #24 | Phase 0 gate (#41) |
| 3 | Plugin Shell | #11 | Phases 1 + 2 |
| 4 | v1 Alpha Feature Delivery | #1 | Phase 3 |

Phases 1 and 2 can run in parallel after the go/no-go gate (#41 resolved).
Phase 3 begins once Phases 1 and 2 are at sufficient completion.
Phase 4 builds product features on top of the completed plugin shell.

```
#41 (go / no-go)
    ├── Phase 1 — Repository Foundation
    │       └── #2 closed
    └── Phase 2 — Product Setup Baseline
            └── #24 closed
                    │
            Phase 3 — Plugin Shell
                    └── #11 closed
                            │
                    Phase 4 — v1 Alpha Features
                            └── #1 closed  →  v1 alpha release
```

---

## Phase 0 — Project Initiation (P3.express A01–A10)

*Governance and planning foundation. Must reach a go/no-go decision before execution begins.*

| # | Title | Notes |
|---|-------|-------|
| #34 | Appoint project sponsor | A01 — first step; establishes decision authority |
| #35 | Appoint project manager | A02 — coordination model and GitHub PM workflow |
| #36 | Appoint key team roles | A03 — product, design, engineering, QA, release |
| #37 | Create project description | A04 — scope, purpose, stakeholders, quality expectations |
| #38 | Create deliverables map and milestone structure | A05 — hierarchy of deliverables mapped to milestones |
| #39 | Create follow-up register | A06 — risks, issues, assumptions, decisions, change requests |
| #40 | Peer review initiation readiness | A07 — independent review before go/no-go |
| **#41** | **Go / no-go decision** | **A08 — gate. Phases 1 and 2 start only after this.** |
| #42 | Run project kickoff | A09 — align contributors, confirm workflow and roles |
| #43 | Prepare focused communication | A10 — external announcement of project start |
| #44 | Configure GitHub Projects, repository features, and management views | Enables traceability and backlog management |

**Gate:** Issues #34–#40 and #44 must be resolved or explicitly accepted with named conditions before #41 is decided. Kickoff (#42) follows immediately after go/conditional-go.

---

## Phase 1 — Repository Foundation

*Make the GitHub environment and plugin scaffold ready for sustained development.*

**Tracking issue:** [#2 — Objective: make the GitHub work environment ready for plugin development](https://github.com/Luis85/specorator/issues/2)

| # | Title | Priority |
|---|-------|----------|
| #3 | Add repository identity, README, license, and baseline documentation | P1 |
| #4 | Set up GitHub issue templates, PR template, labels, and milestone conventions | P1 |
| #7 | Define branch protection and merge policy for main | P1 |
| #5 | Scaffold the Obsidian plugin development project | P1 |
| #6 | Add CI verification for install, lint, typecheck, test, and build | P1 |
| #8 | Add release and packaging workflow for Obsidian plugin artifacts | P2 |
| #9 | Configure dependency, security, and maintenance automation | P2 |
| #10 | Document local development and Obsidian test vault workflow | P2 |

**Within-phase sequencing:**
- #3 and #4 establish conventions before other contributors open PRs.
- #7 should follow immediately after #4 (labels and merge policy go together).
- #5 (plugin scaffold) can proceed independently in parallel.
- #6 (CI) should follow #5 so the first build is verifiable.

**Done when:** All acceptance criteria in #2 are met.

---

## Phase 2 — Product Setup Baseline

*Establish the product artifacts that drive engineering, design, architecture, QA, and release decisions.*

**Tracking issue:** [#24 — Objective: establish the Specorator product setup baseline](https://github.com/Luis85/specorator/issues/24)

| # | Title | Priority |
|---|-------|----------|
| #25 | Create PRODUCT_VISION.md | P1 — input for every other artifact |
| #26 | Create v1 PRD | P1 — drives use cases, architecture, and acceptance criteria |
| #27 | Create v2.0 PRD | P1 — direction guard for shell and bridge design |
| #28 | Extract and catalog use cases from the v1 and v2.0 PRDs | P1 — input for architecture and UX |
| #29 | Create UX and design brief for the companion-app interface | P1 |
| #30 | Create architecture input brief from product requirements and use cases | P1 — Phase 3 prerequisite |
| #31 | Create requirements traceability index | P2 |
| #32 | Create product glossary and terminology baseline | P2 |
| #33 | Create product page content brief | P2 — input for #22 |

**Within-phase sequencing:**
1. #25 (PRODUCT_VISION.md) first — all other artifacts reference it.
2. #26 and #27 (PRDs) follow; v2.0 PRD (#27) informs guard-rails for the shell.
3. #28 (use cases) requires both PRDs.
4. #29 (UX brief) and #30 (architecture input) require #28; they can proceed in parallel.
5. #31, #32, #33 can follow once the PRDs and use cases are stable.

**Done when:** All acceptance criteria in #24 are met.

---

## Phase 3 — Plugin Shell

*Prepare a marketplace-ready Obsidian plugin shell so v1 feature work can begin immediately.*

**Tracking issue:** [#11 — Objective: prepare a marketplace-ready Obsidian plugin shell](https://github.com/Luis85/specorator/issues/11)

| # | Title | Priority |
|---|-------|----------|
| #12 | Codify Obsidian plugin best practices and architecture decisions | P1 |
| #13 | Create repository layout for plugin core, UI app, bridge API, tests, and docs | P1 |
| #14 | Scaffold Vue 3 + Vue Router + Pinia 2 UI shell with TypeScript 6 and Vite | P1 |
| #15 | Implement isolated browser runtime for the plugin UI | P1 |
| #16 | Design and implement the typed Obsidian-to-UI bridge API | P1 — critical path |
| #17 | Configure ESLint, formatting, and Obsidian-aware code quality rules | P1 |
| #18 | Add Vitest test harness for UI, bridge contracts, and plugin-safe logic | P1 |
| #19 | Add TypeDoc generation for public plugin shell APIs | P2 |
| #20 | Prepare Obsidian marketplace readiness checklist and packaging constraints | P2 |
| #21 | Wire plugin shell checks into CI and local verification scripts | P1 |

**Within-phase sequencing:**
1. #12 and #13 establish conventions and layout before code is placed.
2. #14 (UI shell) and #17 (ESLint) proceed in parallel after conventions are set.
3. #15 (browser runtime) depends on #14.
4. #16 (bridge API) depends on #14 and #15; it is the critical path for feature work.
5. #18 (Vitest) depends on #14 and #16.
6. #21 (CI wiring) closes the phase by connecting all checks.

**Done when:** All acceptance criteria in #11 are met — the plugin loads in Obsidian, the UI runs in a browser, and all checks pass in CI.

---

## Phase 4 — v1 Alpha Feature Delivery

*Build v1 product features on top of the plugin shell.*

**Tracking issue:** [#1 — v1 alpha: Obsidian plugin for installing and running the Specorator workflow](https://github.com/Luis85/specorator/issues/1)

| Feature area | Description | Key dependencies |
|---|---|---|
| Template installation | Install `agentic-workflow` content into the active vault with overwrite protection | #16, #26, #28 |
| Workflow navigation UI | Show active project, stage, artifacts, and next actions | #14, #15, #16 |
| Artifact creation | Scaffold new workflow/project from plugin commands | #16, #28 |
| Agent interaction placeholder | Extension point and documented handoff for v2.0 coworkers | #16, #23, #27 |
| Update model placeholder | Record installed template version; document upgrade path | #5, #8 |
| Product page | Public GitHub Pages site with fast-start and contributor paths | #22, #33, #25 |

**v2.0 direction:** Issue #23 defines the companion-app and `agentonomous` integration vision. No v2.0 orchestration features are in scope for v1 alpha, but the shell (#11) and bridge API (#16) must leave clean, documented extension points for them.

**Done when:** All acceptance criteria in #1 are met — a user can sideload the plugin, initialize a vault, open workflow artifacts, and create a project scaffold through the plugin UI.

---

## Issue Index

| # | Title | Phase | Status |
|---|-------|-------|--------|
| #1 | v1 alpha planning | 4 | open |
| #2 | Objective: GitHub environment ready | 1 | open |
| #3 | README, license, baseline docs | 1 | open |
| #4 | Issue templates, PR template, labels, milestones | 1 | open |
| #5 | Scaffold Obsidian plugin project | 1 | open |
| #6 | CI verification | 1 | open |
| #7 | Branch protection and merge policy | 1 | open |
| #8 | Release and packaging workflow | 1 | open |
| #9 | Dependency and security automation | 1 | open |
| #10 | Local development and test vault docs | 1 | open |
| #11 | Objective: marketplace-ready plugin shell | 3 | open |
| #12 | Obsidian plugin best practices and ADRs | 3 | open |
| #13 | Repository layout | 3 | open |
| #14 | Vue 3 + Pinia 2 + Vue Router UI shell | 3 | open |
| #15 | Isolated browser runtime | 3 | open |
| #16 | Typed Obsidian-to-UI bridge API | 3 | open |
| #17 | ESLint, formatting, code quality rules | 3 | open |
| #18 | Vitest test harness | 3 | open |
| #19 | TypeDoc generation | 3 | open |
| #20 | Marketplace readiness checklist | 3 | open |
| #21 | CI and local verification for plugin shell | 3 | open |
| #22 | GitHub Pages product page | 4 | open |
| #23 | v2.0 planning: agentonomous companion app | — | open |
| #24 | Objective: product setup baseline | 2 | open |
| #25 | PRODUCT_VISION.md | 2 | open |
| #26 | v1 PRD | 2 | open |
| #27 | v2.0 PRD | 2 | open |
| #28 | Use cases catalog | 2 | open |
| #29 | UX and design brief | 2 | open |
| #30 | Architecture input brief | 2 | open |
| #31 | Requirements traceability index | 2 | open |
| #32 | Product glossary | 2 | open |
| #33 | Product page content brief | 2 | open |
| #34 | P3 A01: appoint sponsor | 0 | open |
| #35 | P3 A02: appoint project manager | 0 | open |
| #36 | P3 A03: appoint key team roles | 0 | open |
| #37 | P3 A04: create project description | 0 | open |
| #38 | P3 A05: create deliverables map | 0 | open |
| #39 | P3 A06: create follow-up register | 0 | open |
| #40 | P3 A07: peer review initiation readiness | 0 | open |
| #41 | P3 A08: go/no-go decision | 0 | open |
| #42 | P3 A09: run project kickoff | 0 | open |
| #43 | P3 A10: prepare focused communication | 0 | open |
| #44 | Configure GitHub Projects and management views | 0 | open |
