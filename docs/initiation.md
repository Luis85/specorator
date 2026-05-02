---
title: "Specorator project initiation package"
doc_type: governance
status: complete
owner: product
last_updated: 2026-05-02
references:
  - docs/roadmap-v1.md
  - docs/product-vision.md
  - docs/prd.md
  - docs/contributing.md
---

# Project Initiation Package — Specorator

**Related issues:** [#50](https://github.com/Luis85/specorator/issues/50) (consolidated checklist) · #34–#43 (detailed P3.express activities, kept for reference)  
**Roadmap:** [docs/roadmap-v1.md](./roadmap-v1.md)  
**Format:** Lightweight P3.express initiation, adapted for a solo/small-team project context

This document records the initiation decisions that gate Phase 1 (Repository Foundation) and Phase 2 (Product Setup). Because Phases 1–3 were executed concurrently with initiation, several decisions are recorded retrospectively. All are now affirmed for the record.

---

## A01–A03: Roles

### Sponsor

**Luis Mendez** (`@Luis85`) — project owner, decision authority, and funder. Accountable for project justification, scope changes, and go/no-go authority.

*For a sole-contributor project the sponsor and project manager are the same person. This is recorded as a risk in §A06.*

### Project Manager / Coordinator

**Luis Mendez** (`@Luis85`) — responsible for issue hygiene, milestone health, risk follow-up, and release cadence.

### Key Role Mapping

| Role | Holder | Gap / risk |
|---|---|---|
| Product | Luis Mendez | Sole contributor; no independent product review |
| Engineering | Luis Mendez | Sole contributor |
| Design | Luis Mendez | Wireframes produced; no dedicated designer |
| QA | Luis Mendez | Automated CI + manual vault testing; no independent tester |
| Documentation | Luis Mendez | — |
| Release | Luis Mendez | Sideload only in v1; marketplace submission TBD |

**Open gaps treated as risks:** all roles held by one person. Mitigated by structured intake process, written requirements, and CI quality gates. Contributor recruitment is a Phase 4 consideration.

---

## A04: Project Description

**Purpose and expected benefits**

Specorator gives individual contributors and small teams an approachable way to follow a spec-driven, agentic development workflow inside Obsidian — the tool they are likely already using. It removes the friction of managing workflow artifacts, quality gates, and decision records through the file system alone.

Expected benefits:
- Faster onboarding to the `agentic-workflow` methodology.
- Consistent, auditable workflow artifacts stored as plain Markdown in the vault.
- A foundation for v2.0 agentic coworker assistance without depending on AI to make it useful.

**v1 scope summary**

Template installation, workflow navigation UI, artifact creation, and the agent-interaction placeholder. Full scope in [docs/prd.md § v1 Alpha PRD](./prd.md).

**v2.0 scope summary**

Companion app with `agentonomous`-powered agentic coworkers. Full scope in [docs/prd.md § v2.0 PRD](./prd.md) and [issue #23](https://github.com/Luis85/specorator/issues/23).

**Expected duration and cadence**

- v1 alpha: iterative, milestone-driven, no fixed deadline. Phases 1–3 substantially complete as of May 2026.
- Phase 4 (feature delivery) in active planning.
- No externally committed release date for v1 alpha.

**Requirements and quality expectations**

Requirements are maintained in [docs/prd.md](./prd.md) with stable IDs (`V1-FR-NNN`, `V1-NFR-NNN`, etc.) and traced in [docs/traceability.md](./traceability.md). Quality is enforced through CI (lint, typecheck, test, build) and vault acceptance testing.

**In-scope / out-of-scope**

In scope for v1: see PRD §3.1 Goals.  
Explicitly out of scope for v1: see PRD §3.2 Non-Goals.

**Stakeholder list**

| Stakeholder | Interest |
|---|---|
| Plugin users | Installable plugin that makes the agentic workflow accessible in Obsidian |
| `agentic-workflow` users | Seamless integration with the methodology they already follow |
| Contributors | Clear codebase, documented workflow, and a roadmap to contribute to |
| `agentonomous` project | v1 bridge API designed as a clean integration point for v2.0 |

---

## A05: Deliverables Map and Milestones

**Deliverables map** aligned with [docs/roadmap-v1.md](./roadmap-v1.md):

| Phase | Key deliverables | Status |
|---|---|---|
| 0 — Initiation | Initiation package (this doc), GitHub workspace config, go/no-go decision | Complete |
| 1 — Repo Foundation | README, license, CI, release workflow, branch policy, contributing guide | Complete |
| 2 — Product Setup | Product vision, PRDs, use cases, design brief, architecture input, traceability, glossary, product page brief | Complete |
| 3 — Plugin Shell | Vue scaffold, browser runtime, bridge API, test harness, TypeDoc, marketplace checklist | Complete |
| 4 — v1 Alpha | Template installation, workflow navigator, artifact creation, agent placeholder, update model | In progress |

**GitHub milestones** (all five required; verify existence in repository Settings → Milestones):

| Milestone | Scope |
|---|---|
| Phase 0 — Initiation | P3.express governance and project setup |
| Phase 1 — Repo Foundation | Repository and tooling foundation |
| Phase 2 — Product Setup | PRDs, use cases, and product artifacts |
| Phase 3 — Plugin Shell | Plugin architecture and Vue shell |
| v1 Alpha | Feature delivery and first usable release |

Issues are assigned to their milestone. The roadmap progress tracker is [issue #47](https://github.com/Luis85/specorator/issues/47).

---

## A06: Follow-up Register

**Register structure decision:** GitHub issues are the primary register for tracked risks and follow-up items. This section records standing risks and assumptions; create a dedicated issue for any that require active management.

### Standing Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RISK-001 | Sole-contributor risk — Luis Mendez is unavailable, ill, or changes focus | Medium | High | All decisions and requirements are documented; any contributor can pick up from the roadmap and docs |
| RISK-002 | `agentonomous` API instability — the v2.0 integration contract is not yet stable | Medium | Medium | v1 bridge API (#16) designed as an extension point, not a hard dependency; v2.0 integration is deferred |
| RISK-003 | Obsidian marketplace submission timeline — marketplace review may delay public release | Low | Medium | v1 alpha distributed via sideloading; marketplace submission is not on the critical path |
| RISK-004 | `agentic-workflow` release format undefined — template installation design blocked without a stable package format | Medium | High | Resolve via issue #26 / open question V1-OQ-001 before Phase 4 template installation work begins |
| RISK-005 | Plugin bundle size — Vite build may exceed Obsidian marketplace size guidance | Low | Medium | Monitor in CI from Phase 3 onward (V1-NFR-004) |

### Assumptions

- The `agentic-workflow` template will be available as a versioned release (Git tag, npm package, or downloadable archive) by the time Phase 4 template installation work begins.
- Obsidian's community plugin API will remain stable enough for the v1 alpha scope.
- v1 alpha does not require marketplace submission to be considered done; sideloading is acceptable.
- No external team members or contributors are expected until after v1 alpha ships.

### Open Decisions

Open questions are tracked in the PRD with IDs `V1-OQ-NNN`. See [docs/prd.md §11](./prd.md#11-open-questions). Resolve each before the relevant Phase 4 implementation task begins.

### Review Cadence

Solo project. Self-review at each phase boundary:
- Review risk register and open questions at the start of Phase 4.
- Update this document when risks are resolved or new ones are identified.
- No fixed meeting cadence; issue hygiene is the primary coordination mechanism.

---

## A07: Self-Review — Initiation Readiness Assessment

*Solo project self-review, conducted in lieu of peer review.*

**Assessment date:** May 2026

| Check | Status | Notes |
|---|---|---|
| Sponsor and PM identified | ✓ | Sole contributor fills both roles |
| Key roles mapped with gaps noted | ✓ | See §A01–A03 |
| Project description written | ✓ | See §A04 |
| Deliverables map aligned with roadmap | ✓ | See §A05 and roadmap-v1.md |
| GitHub milestones exist | ✓ | Verify via repository settings |
| Follow-up register seeded with initial risks | ✓ | See §A06 |
| Assumptions documented | ✓ | See §A06 |
| Critical unknowns tracked | ✓ | Open questions in PRD §11 |
| Phases 1–3 substantially complete | ✓ | Per roadmap issue #47 |

**Gaps / critical unknowns requiring resolution before Phase 4:**
- V1-OQ-001 — `agentic-workflow` package format must be decided before template installation begins.
- RISK-004 — same dependency; owner to resolve in coordination with `agentic-workflow` planning.

---

## A08: Go / No-Go Decision

**Decision: GO**

**Date:** May 2026  
**Decision owner:** Luis Mendez (`@Luis85`)

**Rationale:** Phases 1–3 are substantially complete. Product requirements, use cases, architecture, and design artifacts are documented. The plugin shell is verified by CI. Phase 4 feature delivery is the logical next step.

**Conditions:**
- V1-OQ-001 (`agentic-workflow` package format) must be resolved before Phase 4 template installation work begins. Owner: `@Luis85`.

**Phase 1 and Phase 2 execution status:** Authorised and substantially complete.  
**Phase 4 execution:** Authorised to begin, with the condition above named.

---

## A09: Kickoff

*Async kickoff, recorded in this document.*

**Date:** May 2026  
**Participants:** Luis Mendez (sole contributor)

**Summary confirmed:**

- **Scope:** v1 alpha as described in the PRD and roadmap.
- **Roles:** Owner fills all roles; see §A01–A03.
- **GitHub workflow:** PRs to `main`, squash merge, CI required. See [docs/contributing.md](./contributing.md).
- **Key risks:** See §A06.
- **Next actions:**
  1. Resolve V1-OQ-001 (template package format) — required before Phase 4 template installation.
  2. Configure GitHub Project board per [docs/github-workspace.md](./github-workspace.md) (issue #44).
  3. Begin Phase 4 feature delivery (issue #1).

---

## A10: Startup Communication

**Draft prepared:** The product page content brief ([docs/product-page-brief.md](./product-page-brief.md)) provides the structured content for the public startup communication.

**Publication channel decision:** GitHub Pages product page (issue #22) is the primary external communication channel. The README serves as the in-repo entry point.

**Communication covers:**
- Why Specorator exists and the problem it solves.
- v1 goal and current status.
- v2.0 direction with `agentonomous`.
- How to get started and how to contribute.

**Status:** Content brief complete; implementation pending issue #22.
