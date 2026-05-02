---
title: "Specorator requirements traceability index"
doc_type: traceability
status: draft
owner: product
last_updated: 2026-05-01
references:
  - docs/product-vision.md
  - docs/prd.md
  - docs/design/USE_CASES.md
  - docs/design/DESIGN_BRIEF.md
---

# Requirements Traceability Index

**Related issues:** [#31](https://github.com/Luis85/specorator/issues/31)  
**Source documents:** [Product Vision](./product-vision.md) · [PRD](./prd.md) · [Use Case Catalogue](./design/USE_CASES.md)

This index provides stable traceability from product vision themes through requirements, use cases, engineering tasks, and acceptance criteria. Add new rows as requirements, use cases, or engineering issues are created.

---

## ID Conventions

| Prefix | Domain | Example |
|--------|--------|---------|
| `V1-FR-NNN` | v1 functional requirement | `V1-FR-001` |
| `V1-NFR-NNN` | v1 non-functional requirement | `V1-NFR-001` |
| `V1-UX-NNN` | v1 UX requirement | `V1-UX-001` |
| `V1-DA-NNN` | v1 data / artifact requirement | `V1-DA-001` |
| `V1-AC-NNN` | v1 acceptance criterion | `V1-AC-001` |
| `V1-OQ-NNN` | v1 open question | `V1-OQ-001` |
| `REQ-V2-NNN` | v2.0 requirement | `REQ-V2-001` |
| `UC-NNN` | use case | `UC-01` |
| `SC-V1-NNN` | v1 scenario | `SC-V1-01` |
| `TEST-NNN` | verification / test scenario | `TEST-001` |
| `ARCH-NNN` | architecture concern | `ARCH-001` |

All IDs are stable once assigned. Retired IDs are marked `[retired]` rather than deleted.

---

## 1. Vision Themes → Requirements

These map the five product vision themes from [`docs/product-vision.md`](./product-vision.md) to the requirement groups that implement them.

| Vision theme | Requirements |
|---|---|
| Template installation — users can install the `agentic-workflow` template into their vault | V1-FR-010–016, V1-DA-001–005, V1-AC-002–004 |
| Workflow navigation — users can see and navigate active workflow state | V1-FR-020–026, V1-UX-003, V1-UX-007, V1-AC-005 |
| Artifact creation — users can create and open workflow artifacts | V1-FR-030–034, V1-DA-001–003, V1-AC-006–007 |
| Agent-ready extension point — v1 shell anticipates v2.0 agentic coworkers | V1-FR-040–043, V1-AC-008 |
| Developer and contributor experience — contributors can run and extend the plugin locally | V1-NFR-005–007, V1-AC-009–010 |

---

## 2. Requirements → Use Cases

### 2.1 Plugin Installation and Bootstrapping

| Requirement | Description | Use cases | Engineering issue |
|---|---|---|---|
| V1-FR-001 | Sideload installation path | — | Phase 1 (#5) |
| V1-FR-002 | Load without error in a fresh vault | UC-01, UC-02 | Phase 4 |
| V1-FR-003 | Register Obsidian command for navigator | UC-02 | Phase 4 |
| V1-FR-004 | Persist settings via `loadData`/`saveData` | UC-02, UC-32–34 | Phase 4 |
| V1-FR-005 | Record installed template version in settings | UC-02 | Phase 4 |

### 2.2 Template Installation

| Requirement | Description | Use cases | Engineering issue |
|---|---|---|---|
| V1-FR-010 | Select template version | — | Phase 4 |
| V1-FR-011 | Install template files and folder structure | UC-01 | Phase 4 |
| V1-FR-012 | Detect existing files before writing | SC-V1-05 | Phase 4 |
| V1-FR-013 | Prompt user before overwriting | SC-V1-05 | Phase 4 |
| V1-FR-014 | Never overwrite without explicit confirmation | SC-V1-05, UC-02 | Phase 4 |
| V1-FR-015 | Report success or failure with skipped files | — | Phase 4 |
| V1-FR-016 | Use released template versions, not unpublished state | — | Phase 4 |

### 2.3 Workflow Navigation UI

| Requirement | Description | Use cases | Engineering issue |
|---|---|---|---|
| V1-FR-020 | Sidebar/panel view (Vue 3) | UC-02 | #14, Phase 4 |
| V1-FR-021 | Display installed template version | UC-02 | Phase 4 |
| V1-FR-022 | Display active project or feature name | UC-02, UC-08 | Phase 4 |
| V1-FR-023 | Display current workflow stage | UC-02, UC-03 | Phase 4 |
| V1-FR-024 | List expected next artifacts or actions | UC-03, UC-09 | Phase 4 |
| V1-FR-025 | Commands to open key workflow files | UC-04, UC-19 | Phase 4 |
| V1-FR-026 | Language and patterns extensible for v2.0 | — | #16, Phase 4 |

### 2.4 Artifact Creation

| Requirement | Description | Use cases | Engineering issue |
|---|---|---|---|
| V1-FR-030 | Create project or workflow scaffold from plugin | UC-01 | Phase 4 |
| V1-FR-031 | Follow template conventions for scaffolded artifacts | UC-01 | Phase 4 |
| V1-FR-032 | All artifacts written as plain Markdown | UC-01, UC-14, UC-18 | Phase 4 |
| V1-FR-033 | Artifacts editable outside the plugin | UC-35 | Phase 4 |
| V1-FR-034 | No plugin-private artifact storage | — | Phase 4 |

### 2.5 Agent Interaction Placeholder

| Requirement | Description | Use cases | Engineering issue |
|---|---|---|---|
| V1-FR-040 | Reserved UI area for future agent coworkers | — | #16, Phase 4 |
| V1-FR-041 | Placeholder defines v2.0 data shapes | — | Phase 4 |
| V1-FR-042 | Documentation identifies agent capabilities deferred to v2.0 | — | #23 |
| V1-FR-043 | Architecture does not block `agentonomous` integration | — | #12, #16 |

### 2.6 Update Model Placeholder

| Requirement | Description | Use cases | Engineering issue |
|---|---|---|---|
| V1-FR-050 | Record installed template version (see V1-FR-005) | — | Phase 4 |
| V1-FR-051 | Document update model for future releases | — | Phase 4 |
| V1-FR-052 | Full migration support is deferred; version recording only | — | — |

### 2.7 Non-Functional Requirements

| Requirement | Category | Use cases | Engineering issue |
|---|---|---|---|
| V1-NFR-001 | Performance — navigator renders within 500 ms | UC-02 | Phase 4 |
| V1-NFR-002 | Reliability — partial installation failures surfaced | SC-V1-05 | Phase 4 |
| V1-NFR-003 | Compatibility — Obsidian desktop (Win/macOS/Linux) | — | #5 |
| V1-NFR-004 | Build size — within marketplace guidance | — | #6, #8 |
| V1-NFR-005 | Browser runtime — Vue UI runnable standalone | — | #14, #15 |
| V1-NFR-006 | Test coverage — Vitest for acceptance-critical paths | — | #18 |
| V1-NFR-007 | Type safety — TypeScript strict mode, no `any` in public API | — | #17 |
| V1-NFR-008 | Local-first — fully offline capable | — | Phase 4 |

### 2.8 UX Requirements

| Requirement | Description | Use cases | Engineering issue |
|---|---|---|---|
| V1-UX-001 | Reach installation in two interactions | UC-01 | Phase 4 |
| V1-UX-002 | Confirm before every destructive action | SC-V1-05, UC-23–25 | Phase 4 |
| V1-UX-003 | Helpful empty state when no template installed | UC-02 A1 | Phase 4 |
| V1-UX-004 | Error messages describe failure and next step | UC-10, UC-36 | Phase 4 |
| V1-UX-005 | UI language accessible without prior methodology knowledge | UC-39 | Phase 4 |
| V1-UX-006 | Obsidian native UI conventions for out-of-panel interactions | UC-01, UC-23 | Phase 4 |
| V1-UX-007 | Navigator dismissable and re-openable without losing context | UC-02, UC-26 | Phase 4 |

### 2.9 Data and Artifact Requirements

| Requirement | Description | Engineering issue |
|---|---|---|
| V1-DA-001 | All artifacts as Markdown in vault file system | Phase 4 |
| V1-DA-002 | Settings stored via Obsidian plugin data API | Phase 4 |
| V1-DA-003 | No secondary database or hidden index | Phase 4 |
| V1-DA-004 | Workflow state derived from vault Markdown | Phase 4 |
| V1-DA-005 | Template version recorded for future comparison | Phase 4 |

---

## 3. Use Cases → Requirements

| Use case | Domain | Requirements covered |
|---|---|---|
| UC-01 Create a new feature | Feature lifecycle | V1-FR-002, V1-FR-030–032, V1-UX-001 |
| UC-02 Open the cockpit and restore context | Feature lifecycle | V1-FR-003–005, V1-FR-020–024, V1-UX-003, V1-UX-007 |
| UC-03 Hand off a step | Feature lifecycle | V1-FR-023–025 |
| UC-04 Skip a step | Feature lifecycle | V1-FR-025 |
| UC-05 Close a feature | Feature lifecycle | V1-FR-004, V1-DA-001 |
| UC-06 Abandon a feature | Feature lifecycle | V1-UX-002 |
| UC-07 Re-open an archived feature | Feature lifecycle | V1-FR-004 |
| UC-08 Switch between features | Feature lifecycle | V1-FR-022 |
| UC-09 Approach and enter a gate | Gate review | V1-FR-024 |
| UC-10 Fix a failing gate check | Gate review | V1-UX-004 |
| UC-11 Cross a gate | Gate review | V1-FR-023 |
| UC-12 Override a failing gate check | Gate review | V1-UX-002 |
| UC-13 Re-run gate checks manually | Gate review | V1-FR-025 |
| UC-14 Write an open question | Open questions | V1-FR-032, V1-DA-001 |
| UC-15 View all open questions for a feature | Open questions | V1-FR-025 |
| UC-16 Resolve an open question | Open questions | V1-DA-001 |
| UC-17 Escalate an open question to a decision note | Open questions | V1-FR-025, V1-DA-001 |
| UC-18 Log a decision note | Decision notes | V1-FR-032, V1-DA-001 |
| UC-19 View decision notes linked to a feature | Decision notes | V1-FR-025 |
| UC-20 Write the first house rule | Constitution | V1-FR-032, V1-DA-001 |
| UC-21 Add a house rule mid-project | Constitution | V1-DA-001 |
| UC-22 Handle a constitution violation at the gate | Constitution | V1-FR-024, V1-UX-004 |
| UC-23 Undo the last action | Recovery | V1-UX-002 |
| UC-24 Revert a feature to an earlier snapshot | Recovery | V1-UX-002 |
| UC-25 Revert a single step file | Recovery | V1-UX-002 |
| UC-26 Recover from spatial disorientation | Recovery | V1-FR-022–024, V1-UX-007 |
| UC-27 Enable team mode on a vault | Team mode | V1-FR-004 |
| UC-28 Request peer gate sign-off | Team mode | V1-FR-024 |
| UC-29 Peer resolves an open question | Team mode | V1-DA-001 |
| UC-30 Peer escalates an open question | Team mode | V1-DA-001 |
| UC-31 Resolve a sync conflict | Team mode | V1-NFR-002 |
| UC-32 Configure gate strictness | Settings | V1-FR-004 |
| UC-33 Configure vault folder paths | Settings | V1-FR-004 |
| UC-34 Configure team mode and committers | Settings | V1-FR-004 |
| UC-35 Export a feature spec | Utility | V1-FR-033 |
| UC-36 Run vault diagnostics | Utility | V1-UX-004 |
| UC-37 Copy an error report | Utility | V1-UX-004 |
| UC-38 View the feature timeline | Utility | V1-FR-025 |
| UC-39 Access help for a jargon term | Utility | V1-UX-005 |

---

## 4. Acceptance Criteria → Requirements and Use Cases

| Criterion | Description | Requirements | Use cases |
|---|---|---|---|
| V1-AC-001 | User can install or sideload plugin | V1-FR-001 | SC-V1-01 |
| V1-AC-002 | User can initialize vault with template | V1-FR-010–016 | UC-01, SC-V1-01 |
| V1-AC-003 | Existing files detected and protected | V1-FR-012–014 | SC-V1-05 |
| V1-AC-004 | Installed template version recorded | V1-FR-005, V1-FR-050 | SC-V1-02 |
| V1-AC-005 | User can open workflow files from plugin | V1-FR-025 | SC-V1-04, UC-04 |
| V1-AC-006 | User can create at least one project scaffold | V1-FR-030–032 | SC-V1-03, UC-01 |
| V1-AC-007 | All generated artifacts are plain Markdown | V1-FR-032–033, V1-DA-001 | — |
| V1-AC-008 | Shell documents v2.0 extension point | V1-FR-042–043 | — |
| V1-AC-009 | External contributor can run locally | V1-NFR-005–006 | SC-V1-06 |
| V1-AC-010 | All CI checks pass on `main` | V1-NFR-004, V1-NFR-006–007 | — |

---

## 5. Architecture Concerns

| ID | Concern | Requirement link | Related issue |
|---|---|---|---|
| ARCH-001 | Isolated browser runtime boundary — Vue UI must run in both Obsidian and standalone browser | V1-NFR-005 | #15 |
| ARCH-002 | Obsidian-to-UI bridge API contract — typed, stable, mockable | V1-FR-026, V1-FR-041 | #16 |
| ARCH-003 | `agentonomous` integration extension point — no design choices that block v2.0 | V1-FR-043 | #23 |
| ARCH-004 | Vault-first state — workflow state derived from Markdown, not plugin-private storage | V1-DA-003–004 | — |
| ARCH-005 | Template source boundary — released versions only, not repo HEAD | V1-FR-016 | — |

---

## 6. Test and Verification Scenarios

These supplement the acceptance criteria with specific verification checkpoints. Expand as test harness matures.

| ID | Scenario | Requirement | Type |
|---|---|---|---|
| TEST-001 | Plugin loads without error in a fresh Obsidian vault | V1-FR-002, V1-AC-001 | Manual / integration |
| TEST-002 | Template installation creates all required files and folders | V1-FR-011, V1-AC-002 | Unit / integration |
| TEST-003 | Installation aborts without user confirmation when existing files detected | V1-FR-013–014, V1-AC-003 | Unit |
| TEST-004 | Installed template version recorded in plugin settings | V1-FR-005, V1-AC-004 | Unit |
| TEST-005 | Workflow navigator renders within 500 ms with 500 vault files | V1-NFR-001 | Performance |
| TEST-006 | Plugin bundle size within Obsidian marketplace limits | V1-NFR-004 | Build check (CI) |
| TEST-007 | Vue UI runs standalone in browser without Obsidian | V1-NFR-005 | Manual / integration |
| TEST-008 | All Vitest unit tests pass with no type errors | V1-NFR-006–007, V1-AC-010 | Automated (CI) |
| TEST-009 | User can create a new project scaffold through plugin UI | V1-FR-030, V1-AC-006 | Manual |
| TEST-010 | Generated artifacts are readable Markdown outside Obsidian | V1-FR-032–033, V1-AC-007 | Manual |
| TEST-011 | Navigator empty state shown when no template is installed | V1-UX-003 | Manual |
| TEST-012 | Navigator dismissable and reopens without losing session context | V1-UX-007 | Manual |

---

## 7. v2.0 Requirements Placeholder

v2.0 requirements are tracked in [issue #23](https://github.com/Luis85/specorator/issues/23) and the [v2.0 PRD section of docs/prd.md](./prd.md#v20-prd--companion-app-with-agentic-coworkers). Stable `REQ-V2-NNN` IDs will be assigned here as v2.0 planning matures.

| ID | Description | v2.0 PRD section |
|---|---|---|
| REQ-V2-001 | `agentonomous` integration runtime boundary decision | §1 Architecture and compatibility review |
| REQ-V2-002 | Agent coworker model and UI representation | §2 Agent coworker model |
| REQ-V2-003 | Typed Specorator-to-agentonomous service interface | §3 Agent runtime bridge |
| REQ-V2-004 | Workflow-stage assistance with pause/resume/refine | §4 Workflow-stage assistance |
| REQ-V2-005 | Vault context and permission model | §5 Vault context and permissions |
| REQ-V2-006 | Agent output review and artifact acceptance | §6 Agent output review |
| REQ-V2-007 | Observability and run diagnostics | §7 Observability and diagnostics |

---

## Maintenance Notes

- Add new requirements to the source PRD first, then cross-reference here.
- Use cases are the primary source for UC-NNN IDs; see [USE_CASES.md](./design/USE_CASES.md).
- ARCH-NNN concerns should be decided in ADRs under `docs/adr/`; link ADR file once created.
- TEST-NNN scenarios should map to Vitest test files once implementation begins.
- Close open questions (V1-OQ-NNN) in the PRD and record the decision in an ADR.
