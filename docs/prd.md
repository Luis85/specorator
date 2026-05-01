---
title: "Specorator product requirements"
doc_type: prd
status: draft
owner: product
last_updated: 2026-05-01
references:
  - docs/product-vision.md
  - docs/roadmap-v1.md
  - docs/design/USE_CASES.md
---

# Product Requirements Document — Specorator

**Status:** Draft  
**Date:** 2026-05-01  
**Related issues:** [#1](https://github.com/Luis85/specorator/issues/1), [#23](https://github.com/Luis85/specorator/issues/23), [#26](https://github.com/Luis85/specorator/issues/26), [#27](https://github.com/Luis85/specorator/issues/27), [#24](https://github.com/Luis85/specorator/issues/24)  
**Product vision:** [Product Vision](./product-vision.md)  
**Roadmap:** [Roadmap v1](./roadmap-v1.md)  
**Design use cases:** [Use Case Catalogue](./design/USE_CASES.md)

---

## Contents

1. [v1 Alpha PRD — Plugin Foundation](#v1-alpha-prd--plugin-foundation)
2. [v2.0 PRD — Companion App with Agentic Coworkers](#v20-prd--companion-app-with-agentic-coworkers)

---

# v1 Alpha PRD — Plugin Foundation

## 1. Problem Statement

Practitioners using the `agentic-workflow` methodology today must manage their workflow entirely through the file system and command-line scripts. There is no interface inside Obsidian for installing the workflow template, navigating active workflow state, or creating the next required artifact. The gap between the methodology and an approachable daily tool means adoption friction is high, especially for users who are new to spec-driven or agentic workflows.

Specorator v1 closes this gap by providing an Obsidian plugin that installs the workflow template, exposes workflow state, and lets users take valid next actions from inside the vault — without requiring command-line operation for common tasks.

---

## 2. Target Users and Scenarios

### 2.1 Target Users

| User type | Description |
|-----------|-------------|
| Solo builder | An individual contributor who wants a guided path from rough idea to implemented and documented feature, with workflow discipline but without a heavy PM tool. |
| Product-minded engineer | An engineer who wants requirements, design decisions, tasks, tests, and release notes connected and traceable inside one tool. |
| Team early adopter | A small team beginning to adopt agentic or spec-driven development who needs shared workflow discipline without making an LLM the only operator. |
| Vault maintainer | A user or contributor who needs to run quality checks, fix traceability gaps, and keep the vault healthy from inside Obsidian. |

### 2.2 Key Scenarios

| ID | Scenario |
|----|----------|
| SC-V1-01 | A new user installs the plugin, opens a fresh vault, and initializes it with the `agentic-workflow` template to start their first project. |
| SC-V1-02 | A returning user opens Obsidian and immediately sees the active project, current workflow stage, and the next required artifact. |
| SC-V1-03 | A user creates a new project scaffold through the plugin UI without touching the file system directly. |
| SC-V1-04 | A user opens an existing workflow artifact (spec, decision, task) directly from the plugin's navigation view. |
| SC-V1-05 | A user who already has workflow files in their vault installs the plugin and is warned before any existing files would be overwritten. |
| SC-V1-06 | A contributor clones the repo, follows the local development docs, and runs the plugin against a test vault within minutes. |

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Provide a usable, installable Obsidian plugin that proves the end-to-end loop: template install → workflow navigation → artifact creation.
- Install a supported release of the `agentic-workflow` template into an Obsidian vault with overwrite protection.
- Display the active project, workflow stage, required artifacts, and available next actions.
- Allow users to open and create workflow artifacts from the plugin UI.
- Keep all generated content as plain, editable Markdown files that remain useful without the plugin.
- Leave a clean, documented extension point for the v2.0 agentic coworker experience.
- Provide enough local development documentation for external contributors.

### 3.2 Non-Goals

- Full multi-version migration engine for installed templates.
- Agent runtime orchestration of any kind (deferred to v2.0).
- Deep merge of user-customised template files.
- Support for every `agentic-workflow` track simultaneously in v1.
- Obsidian community marketplace submission unless alpha stability warrants it.
- Mobile Obsidian support (desktop-first for v1).
- Hosting, cloud sync, or any external service dependency.

---

## 4. Functional Requirements

Stable IDs use the pattern `V1-FR-NNN`.

### 4.1 Plugin Installation and Bootstrapping

| ID | Requirement |
|----|-------------|
| V1-FR-001 | The plugin SHALL be installable via Obsidian community plugin sideloading (manifest + main.js in the vault's `.obsidian/plugins/specorator/` directory). |
| V1-FR-002 | The plugin SHALL load without error in a fresh Obsidian vault that has no prior `agentic-workflow` content. |
| V1-FR-003 | The plugin SHALL register at least one Obsidian command for opening the workflow navigator view. |
| V1-FR-004 | The plugin SHALL store its settings using Obsidian's `loadData`/`saveData` API so settings persist across restarts. |
| V1-FR-005 | The plugin SHALL record the installed `agentic-workflow` template version in its persisted settings after a successful installation. |

### 4.2 Template Installation

| ID | Requirement |
|----|-------------|
| V1-FR-010 | The plugin SHALL allow the user to select a supported `agentic-workflow` release version or default to the latest supported version. |
| V1-FR-011 | The plugin SHALL install the selected template's required files and folder structure into the active Obsidian vault. |
| V1-FR-012 | Before writing any file, the plugin SHALL detect whether an existing file at the target path is present in the vault. |
| V1-FR-013 | If an existing file would be overwritten, the plugin SHALL present an explicit confirmation prompt to the user listing the affected files before proceeding. |
| V1-FR-014 | The plugin SHALL NOT overwrite any file without receiving explicit user confirmation for that specific file or the entire set of conflicting files. |
| V1-FR-015 | The plugin SHALL surface a clear success or failure state after the installation completes, including any files that were skipped or not written. |
| V1-FR-016 | The plugin SHALL use released `agentic-workflow` versions as the source of truth for template content, not unpublished repository state. |

### 4.3 Workflow Navigation UI

| ID | Requirement |
|----|-------------|
| V1-FR-020 | The plugin SHALL provide a sidebar or panel view (implemented with Vue 3 in a browser runtime) showing the workflow navigator. |
| V1-FR-021 | The workflow navigator SHALL display the installed `agentic-workflow` template version. |
| V1-FR-022 | The workflow navigator SHALL display the active project or feature name when one can be detected from vault content. |
| V1-FR-023 | The workflow navigator SHALL display the current workflow stage when it can be determined from vault state. |
| V1-FR-024 | The workflow navigator SHALL list expected next artifacts or actions for the active stage. |
| V1-FR-025 | The plugin SHALL provide commands or UI controls to open key workflow files (workflow state, specs, decisions, tasks, generated outputs) directly in Obsidian. |
| V1-FR-026 | Navigation controls SHALL use product language and interaction patterns that can naturally grow into a v2.0 agentic coworker companion experience without requiring a redesign. |

### 4.4 Artifact Creation

| ID | Requirement |
|----|-------------|
| V1-FR-030 | The plugin SHALL allow the user to create a new project or workflow scaffold from within the plugin UI or command palette. |
| V1-FR-031 | Scaffolded artifacts SHALL follow the template conventions defined by the installed `agentic-workflow` version. |
| V1-FR-032 | All generated artifacts SHALL be written as plain Markdown files in the vault. |
| V1-FR-033 | Generated artifacts SHALL be editable in Obsidian without the plugin after creation. |
| V1-FR-034 | The plugin SHALL NOT store workflow content in plugin-private state inaccessible outside the plugin. |

### 4.5 Agent Interaction Placeholder

| ID | Requirement |
|----|-------------|
| V1-FR-040 | The plugin SHALL reserve a documented UI area or extension point for future agent coworker interactions. |
| V1-FR-041 | The placeholder interface SHALL define the data shapes that a v2.0 integration would populate (coworker identity, proposed output, accept/reject controls) without implementing live agent execution. |
| V1-FR-042 | Documentation in the repository SHALL clearly identify which agent-related capabilities are deferred to v2.0. |
| V1-FR-043 | The plugin architecture SHALL not make design choices that would block adding the `agentonomous` integration described in the v2.0 PRD. |

### 4.6 Update Model Placeholder

| ID | Requirement |
|----|-------------|
| V1-FR-050 | The plugin SHALL record the installed template version in plugin settings (see V1-FR-005). |
| V1-FR-051 | The plugin's repository SHALL include documentation describing how template updates are expected to work in a future release. |
| V1-FR-052 | Full multi-version migration support is explicitly deferred; only version recording and documentation are required for v1. |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| V1-NFR-001 | Performance | The plugin UI SHALL render the workflow navigator view within 500 ms of the panel opening in a vault with up to 500 Markdown files. |
| V1-NFR-002 | Reliability | The plugin SHALL not crash or corrupt vault files when template installation fails partway through; partial writes must be surfaced to the user. |
| V1-NFR-003 | Compatibility | The plugin SHALL be compatible with Obsidian desktop (Windows, macOS, Linux) using the minimum API version declared in `manifest.json`. |
| V1-NFR-004 | Build size | The compiled plugin bundle SHALL remain within Obsidian community plugin size guidance to remain viable for marketplace submission. |
| V1-NFR-005 | Browser runtime | The Vue 3 UI SHALL run in an isolated browser runtime inside the plugin and SHALL also be runnable standalone in a desktop browser for development and testing. |
| V1-NFR-006 | Test coverage | Business logic in the bridge API and plugin-safe utilities SHALL have Vitest unit test coverage for all acceptance-critical paths. |
| V1-NFR-007 | Type safety | The plugin, bridge API, and UI SHALL be written in TypeScript with strict mode enabled; no untyped `any` in public API surfaces. |
| V1-NFR-008 | Local-first | The plugin SHALL function fully offline and SHALL NOT require an internet connection for template installation (assuming locally cached template data) or vault navigation. |

---

## 6. UX Requirements

| ID | Requirement |
|----|-------------|
| V1-UX-001 | A first-time user SHALL be able to reach the template installation flow within two interactions after enabling the plugin. |
| V1-UX-002 | Every destructive or irreversible action (overwriting files, resetting settings) SHALL require an explicit user confirmation step with a clear description of the impact. |
| V1-UX-003 | The workflow navigator SHALL display a helpful empty state when no workflow template is installed, with a direct action to begin installation. |
| V1-UX-004 | Error messages SHALL describe what failed and what the user can do next; generic error codes without context are not acceptable. |
| V1-UX-005 | The UI language SHALL not require prior knowledge of `agentic-workflow` terminology to understand basic actions; tooltips or inline help MAY supplement unfamiliar terms. |
| V1-UX-006 | The plugin SHALL use Obsidian's native UI conventions (modals, notices, command palette) for interactions that fall outside the Vue panel. |
| V1-UX-007 | The workflow navigator panel SHALL be dismissable and re-openable without losing navigation context for the current session. |

---

## 7. Data and Artifact Requirements

| ID | Requirement |
|----|-------------|
| V1-DA-001 | All workflow artifacts created or installed by the plugin SHALL be stored as Markdown files in the vault's standard file system. |
| V1-DA-002 | Plugin settings (installed template version, user preferences) SHALL be stored using Obsidian's plugin data API (`data.json`). |
| V1-DA-003 | The plugin SHALL NOT create a secondary database, hidden index, or non-Markdown artifact store as the primary representation of workflow state. |
| V1-DA-004 | Workflow state (active project, current stage) SHALL be derived from vault Markdown content, not exclusively from plugin-private settings. |
| V1-DA-005 | The installed template version SHALL be recorded in a format that supports future comparison for update detection. |

---

## 8. Acceptance Criteria

The v1 alpha is done when all of the following are true:

| ID | Criterion |
|----|-----------|
| V1-AC-001 | A user can install or sideload the plugin in Obsidian desktop. |
| V1-AC-002 | A user can initialize a vault with the supported `agentic-workflow` template content through the plugin. |
| V1-AC-003 | Existing vault files are detected before installation; none are overwritten without explicit user confirmation. |
| V1-AC-004 | The installed workflow template version is recorded in plugin settings. |
| V1-AC-005 | A user can open the main workflow files from the plugin UI or command palette. |
| V1-AC-006 | A user can create at least one new project scaffold through the plugin UI. |
| V1-AC-007 | All generated artifacts are plain Markdown files visible and editable in the vault. |
| V1-AC-008 | The plugin shell documents how it prepares for the v2.0 `agentonomous` companion-app direction. |
| V1-AC-009 | The repository includes enough setup documentation for an external contributor to run and test the plugin locally. |
| V1-AC-010 | All CI checks (install, lint, typecheck, test, build) pass on the `main` branch. |

---

## 9. Success Signals

| Signal | Measure |
|--------|---------|
| Onboarding self-sufficiency | A new user can create a project, start a feature, and find the next required action without reading the full methodology first. |
| Vault safety | Zero reported cases of unexpected file overwrites in the alpha testing period. |
| Plain-Markdown guarantee | All alpha testers confirm workflow artifacts are readable and useful outside Obsidian. |
| Contributor ramp | An external contributor can run the plugin locally following README instructions without assistance. |
| LLM-disabled utility | Common scaffolding, navigation, and quality-check tasks complete without any LLM provider configured. |

---

## 10. Dependencies and Risks

### 10.1 Dependencies

| Dependency | Nature | Notes |
|------------|--------|-------|
| `agentic-workflow` releases | Hard | v1 consumes released template versions. Release cadence and package format affect installation design (V1-FR-016). |
| Obsidian plugin API | Hard | Plugin lifecycle, vault access, settings, and UI surface depend on the published Obsidian API and its stability. |
| Vue 3 + Vite + TypeScript 6 | Hard | Core UI and build toolchain. Versions locked in scaffold (#5, #14). |
| Phase 1 completion (#2) | Hard | Plugin scaffold, CI, and repository conventions must be in place before Phase 2 feature development begins. |
| Phase 2 product baseline (#24) | Soft | Use case catalog (#28) and architecture brief (#30) inform Phase 3 and Phase 4 design decisions. |

### 10.2 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| V1-RISK-001 | `agentic-workflow` release format or package structure is not defined before Phase 4 begins | Medium | High | Resolve package format in Phase 2 (#26, #28); block template installation work on that decision. |
| V1-RISK-002 | Obsidian API changes break the isolated browser runtime or Vue bridge | Low | High | Pin Obsidian API version; isolate bridge contract so changes are localised. |
| V1-RISK-003 | Plugin bundle size exceeds Obsidian marketplace limits | Low | Medium | Monitor bundle size in CI from Phase 3 onward. |
| V1-RISK-004 | Workflow state detection from Markdown is ambiguous for complex vault layouts | Medium | Medium | Define minimum required vault structure in installation docs; handle ambiguous state gracefully in UI. |

---

## 11. Open Questions

| ID | Question |
|----|----------|
| V1-OQ-001 | Which `agentic-workflow` release or package format should v1 consume — a Git tag, an npm package, or a downloadable archive? |
| V1-OQ-002 | Should v1 install the entire template or a minimal project-bootstrapping subset? |
| V1-OQ-003 | What is the smallest workflow path that demonstrates clear value inside Obsidian? |
| V1-OQ-004 | Should v1 focus on one workflow track (e.g., the Specorator stage model) before supporting discovery, project, roadmap, portfolio, or QA tracks? |
| V1-OQ-005 | What plugin ID should be used in `manifest.json` — `specorator`, `agentic-workflow`, or another identifier? |
| V1-OQ-006 | How should the plugin represent active project or feature selection in a vault that contains multiple concurrent workflows? |
| V1-OQ-007 | What is the right agent interaction placeholder that prepares for v2.0 without implying v1 has any live orchestration? |

---

---

# v2.0 PRD — Companion App with Agentic Coworkers

## 1. Problem Statement and Product Opportunity

Users who adopt spec-driven and agentic development workflows today face a disconnect between the richness of the `agentic-workflow` methodology and the manual effort required to apply it. Even with v1 in place — template installation, workflow navigation, and artifact creation — users must still compose, draft, review, and improve complex outputs by themselves, context-switching between Obsidian, external chat tools, and the command line.

The opportunity in v2.0 is to bring a team of purpose-built agentic coworkers directly into the vault. Instead of a user copying vault content into an external chat session and manually pasting results back, Specorator v2.0 offers coworkers that understand the active workflow context, assist at specific stages, propose high-quality Markdown outputs, and wait for the user's review and acceptance before anything becomes a durable artifact.

This keeps the vault as the primary workspace and the user as the final decision-maker — while dramatically reducing the effort required to produce well-structured, traceable workflow outputs.

---

## 2. User Personas and Jobs to Be Done

| Persona | Job to Be Done |
|---------|---------------|
| **Solo builder** | *When I start a new feature, I need help turning a rough idea into a well-formed spec with requirements, acceptance criteria, and traceability IDs — without spending hours writing boilerplate.* |
| **Product-minded engineer** | *When I reach a decision point in the workflow, I need a coworker to draft a decision record, summarise the options, and populate the tradeoff section so I can review and finalise it quickly.* |
| **Team early adopter** | *When my team adopts this methodology, I need coworkers that enforce workflow consistency, propose missing artifacts, and flag quality gaps — so we stay disciplined without a full-time process manager.* |
| **Vault maintainer** | *When the vault accumulates inconsistencies, I need an automated reviewer to scan for traceability gaps, missing IDs, and broken links, and propose targeted repairs.* |

---

## 3. Coworker and Team Model

Specorator v2.0 presents agentic coworkers as first-class UI elements — not a chat window, but a contextually aware assistant panel that understands the active workflow stage and offers the right kind of help.

### 3.1 Coworker Roles (initial candidates)

| Coworker | Primary responsibility |
|----------|----------------------|
| **Spec Writer** | Assists with drafting requirements, acceptance criteria, and traceability IDs for features and epics. |
| **Design Reviewer** | Reviews design briefs and architecture inputs; proposes gaps, risks, and clarifying questions. |
| **Decision Recorder** | Drafts Architecture Decision Records (ADRs) and decision documents from the user's stated rationale. |
| **Task Planner** | Decomposes accepted requirements into actionable engineering tasks with estimates and dependencies. |
| **QA Advisor** | Proposes test cases, coverage gaps, and quality gate criteria derived from the active spec. |
| **Vault Inspector** | Scans vault for traceability gaps, missing artifacts, broken links, and inconsistent frontmatter. |

Coworker definitions live in `agentonomous` and are consumed by Specorator. The specific set of available coworkers in the first v2.0 release is subject to the open questions in section 13.

### 3.2 Interaction Model

1. The user works in Obsidian with the Specorator companion panel open.
2. The panel shows the active workflow stage, the active project or feature, and available coworkers for that stage.
3. The user selects a coworker and describes what they need (or accepts a stage-suggested default).
4. The user reviews and approves the vault context that the coworker may read.
5. `agentonomous` orchestrates the coworker run using the approved context and the user's instructions.
6. The coworker produces a proposed output (draft artifact, patch, suggestions, or guidance).
7. Specorator presents the proposed output in a review interface.
8. The user accepts, edits, rejects, or sends the output back for refinement.
9. Accepted outputs are written to the vault as Markdown artifacts aligned with `agentic-workflow` conventions.

Agent outputs are always proposed. Nothing is silently applied to the vault.

---

## 4. Goals and Non-Goals

### 4.1 Goals

- Deliver a user-controlled agentic coworker experience inside Obsidian using `agentonomous` as the orchestration engine.
- Keep the vault and the user's focus on workflow artifacts — not on orchestration mechanics.
- Give users explicit control over which vault context each agent run may read and what it may write.
- Present all agent-generated outputs as proposals that require user review before application.
- Support at least one complete end-to-end coworker workflow (from user prompt to accepted vault artifact) in the first v2.0 release.
- Define and implement the typed Specorator-to-agentonomous integration contract.
- Keep the plugin runnable in a browser for UI development using `agentonomous` mocks.

### 4.2 Non-Goals

- Replacing Obsidian as the editing and review surface.
- Locking workflow artifacts into plugin-private state.
- Giving agents unrestricted or implicit vault access.
- Implementing a separate orchestration engine inside Specorator (agentonomous owns that).
- Requiring users to understand `agentonomous` internals to get useful coworker assistance.
- Automatically accepting or silently applying any agent output to the vault.
- Supporting cloud or hosted agent execution in v2.0 unless explicitly added.

---

## 5. Functional Requirements

Stable IDs use the pattern `V2-FR-NNN`.

### 5.1 Companion Panel and Coworker Presence

| ID | Requirement |
|----|-------------|
| V2-FR-001 | The plugin SHALL provide a companion panel (extending the v1 navigator) that displays available agentic coworkers for the active workflow stage. |
| V2-FR-002 | Each coworker entry SHALL display a name, a short capability description, and an indication of which workflow stage or artifact type it assists with. |
| V2-FR-003 | The companion panel SHALL show the active project, feature, and workflow stage so the user understands the context before invoking a coworker. |
| V2-FR-004 | The user SHALL be able to invoke a coworker from the panel, the command palette, or a contextual menu on a specific vault file. |

### 5.2 Vault Context Selection and Permissions

| ID | Requirement |
|----|-------------|
| V2-FR-010 | Before each coworker run, the plugin SHALL present the user with a vault context selection step showing which files or folders the coworker proposes to read. |
| V2-FR-011 | The user SHALL be able to add, remove, or narrow the proposed context before approving the run. |
| V2-FR-012 | The plugin SHALL NOT allow any agent run to read vault files beyond the set explicitly approved by the user for that run. |
| V2-FR-013 | The plugin SHALL NOT initiate a coworker run without receiving explicit user approval of the proposed context and action. |
| V2-FR-014 | Context selections SHALL NOT persist across sessions by default; users MAY opt in to saved context profiles per coworker. |

### 5.3 Agent Run Lifecycle

| ID | Requirement |
|----|-------------|
| V2-FR-020 | The plugin SHALL display agent run status (pending, running, completed, failed) in the companion panel in real time. |
| V2-FR-021 | The user SHALL be able to cancel a running coworker job from the UI. |
| V2-FR-022 | The plugin SHALL handle `agentonomous` run failures gracefully, surfacing a human-readable error and any partial outputs. |
| V2-FR-023 | Where `agentonomous` supports resumable runs, the plugin SHALL expose a resume action for interrupted jobs. |
| V2-FR-024 | The plugin SHALL store enough run metadata to allow the user to understand what happened in a previous run after restarting Obsidian. |

### 5.4 Agent Output Review and Artifact Application

| ID | Requirement |
|----|-------------|
| V2-FR-030 | Coworker outputs SHALL be presented as proposed Markdown artifacts, patches, or suggestions in a dedicated review interface before any vault write. |
| V2-FR-031 | The user SHALL be able to accept, edit, reject, or send a proposed output back to the coworker for refinement. |
| V2-FR-032 | Accepted outputs SHALL be written to the vault through a safe, explicit write path using Obsidian's vault API. |
| V2-FR-033 | The plugin SHALL NOT write any agent-generated content to the vault without the user first reviewing and explicitly accepting it. |
| V2-FR-034 | After acceptance, the user SHALL be able to continue editing the applied artifact in Obsidian without plugin intervention. |
| V2-FR-035 | Where applicable, accepted outputs SHALL record run provenance (coworker name, run ID, date) in the artifact's frontmatter or a designated metadata section. |

### 5.5 agentonomous Integration Bridge

| ID | Requirement |
|----|-------------|
| V2-FR-040 | The plugin SHALL integrate with `agentonomous` through a typed service interface; the Vue UI SHALL NOT import `agentonomous` directly. |
| V2-FR-041 | All orchestration calls SHALL be routed through the Obsidian-to-UI bridge API established in Phase 3 (#16). |
| V2-FR-042 | The bridge interface SHALL represent: coworker capabilities, context bundles, run invocation, run state, proposed outputs, review decisions, and diagnostics. |
| V2-FR-043 | The bridge SHALL support a browser-mode mock implementation so the UI remains runnable without Obsidian or a live `agentonomous` instance. |
| V2-FR-044 | The integration layer SHALL be the primary runtime boundary decision surface; whether `agentonomous` runs as a direct import, local process, or CLI bridge SHALL be resolved here (see V2-OQ-001). |

### 5.6 Observability and Diagnostics

| ID | Requirement |
|----|-------------|
| V2-FR-050 | The plugin SHALL provide a run log view showing agent steps, status messages, and errors for the current and recent runs. |
| V2-FR-051 | The run log SHALL be viewable without losing the review interface for the current proposed output. |
| V2-FR-052 | The plugin SHALL provide a diagnostic export path that allows sharing run logs with a developer without including vault file contents by default. |
| V2-FR-053 | Long-running coworker jobs SHALL provide incremental progress feedback, not just a spinner until completion. |

### 5.7 Credential and Provider Settings

| ID | Requirement |
|----|-------------|
| V2-FR-060 | The plugin SHALL provide a settings interface for configuring LLM provider credentials used by `agentonomous`. |
| V2-FR-061 | Credentials SHALL be stored using Obsidian's secure settings mechanism and SHALL NOT be written to vault Markdown files. |
| V2-FR-062 | The plugin SHALL make it easy to test that configured credentials are valid before a coworker run begins. |
| V2-FR-063 | Removing or disabling provider credentials SHALL not affect non-agentic plugin capabilities (template installation, navigation, artifact scaffolding). |

---

## 6. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| V2-NFR-001 | User control | Every agent action that could modify vault content SHALL require explicit user approval; there SHALL be no automatic application path. |
| V2-NFR-002 | Performance | The companion panel SHALL remain responsive (< 200 ms for UI interactions) during a running agent job; agent execution SHALL not block the Obsidian UI thread. |
| V2-NFR-003 | Reliability | A failed or cancelled agent run SHALL leave the vault in its pre-run state unless the user has explicitly accepted and applied an output. |
| V2-NFR-004 | Offline resilience | Non-agentic plugin capabilities (v1 features) SHALL continue to function when no LLM provider is configured or reachable. |
| V2-NFR-005 | Privacy | Vault content sent to an agent run SHALL be scoped strictly to the user-approved context; no background or ambient vault reads are permitted. |
| V2-NFR-006 | Testability | The `agentonomous` bridge mock SHALL be sufficient to test all UI states — pending, running, completed, failed, partial, resumable — without a live agent. |
| V2-NFR-007 | Extensibility | Adding a new coworker type SHALL require changes only in `agentonomous` and bridge contract configuration; it SHALL NOT require changes to the core review or artifact-write flows. |

---

## 7. Privacy, Security, and Permission Requirements

| ID | Requirement |
|----|-------------|
| V2-SEC-001 | No vault content SHALL be transmitted to an external service without the user first reviewing and approving the context selection for that specific run. |
| V2-SEC-002 | LLM provider API keys and credentials SHALL be stored using Obsidian's settings data store and SHALL NOT appear in vault files, logs, or diagnostic exports. |
| V2-SEC-003 | The diagnostic export function SHALL strip or mask any vault file paths, content, or credential references from exported logs before the user reviews and shares the export. |
| V2-SEC-004 | The plugin SHALL document its network access surface in the repository: which external endpoints may be contacted, under what conditions, and with what data. |
| V2-SEC-005 | Agent runs that fail authentication or receive an unexpected response from `agentonomous` SHALL surface the error to the user and terminate cleanly without retrying silently. |
| V2-SEC-006 | The plugin SHALL request only the Obsidian API permissions it requires; broad vault permissions SHALL NOT be requested to simplify future feature development. |

---

## 8. UX and Interaction Requirements

| ID | Requirement |
|----|-------------|
| V2-UX-001 | The companion panel SHALL make the agent coworker interaction model understandable to a user who has never used an orchestration tool; no knowledge of `agentonomous` internals is required. |
| V2-UX-002 | The transition from workflow navigation (v1 features) to coworker assistance (v2.0 features) SHALL feel like a natural extension of the same panel, not a mode switch. |
| V2-UX-003 | Every step in the coworker invocation flow (context selection → approval → run → review → accept/reject) SHALL be clearly signposted so the user always knows where they are. |
| V2-UX-004 | The review interface for proposed outputs SHALL support side-by-side or inline diff presentation so the user can compare proposed content with any existing artifact. |
| V2-UX-005 | Rejection and refinement SHALL be first-class actions — as visually prominent as acceptance — to reinforce that the user's judgment is the authority. |
| V2-UX-006 | The panel SHALL degrade gracefully when no provider is configured: coworkers SHALL be visible but clearly inactive, with a direct path to the settings interface. |
| V2-UX-007 | Run progress updates SHALL use plain language that describes what the coworker is doing at each step, not internal orchestration state names. |

---

## 9. Agent Orchestration Requirements

| ID | Requirement |
|----|-------------|
| V2-AO-001 | Agent orchestration SHALL be provided exclusively by `agentonomous`; Specorator SHALL NOT implement a competing orchestration engine. |
| V2-AO-002 | The runtime boundary for `agentonomous` (direct import, local service process, CLI bridge, or other) SHALL be decided and documented before implementation begins (see V2-OQ-001). |
| V2-AO-003 | Each coworker SHALL be invoked with a structured input that includes: workflow stage, user instruction, approved vault context, and plugin version metadata. |
| V2-AO-004 | Each coworker run SHALL produce a structured output that includes: proposed artifact content, output type (new file, patch, suggestion, guidance), run ID, and status. |
| V2-AO-005 | The plugin SHALL support at least the following run states from `agentonomous`: pending, running, completed, failed, cancelled, and (if supported) resumable. |
| V2-AO-006 | Where `agentonomous` supports handoffs between agents, the plugin's run status display SHALL reflect multi-step progress without exposing internal routing to the user. |

---

## 10. Artifact and Traceability Requirements

| ID | Requirement |
|----|-------------|
| V2-AT-001 | All accepted coworker outputs SHALL be stored as Markdown files in the vault consistent with `agentic-workflow` artifact conventions. |
| V2-AT-002 | Accepted artifacts SHALL include traceability frontmatter (e.g., `source`, `coworker`, `run-id`, `date`) in a format compatible with `agentic-workflow` conventions. |
| V2-AT-003 | The plugin SHALL NOT create additional proprietary artifact stores alongside `agentic-workflow` Markdown artifacts. |
| V2-AT-004 | Coworker-generated artifacts SHALL be indistinguishable in structure from manually authored artifacts to external tools and scripts. |
| V2-AT-005 | Traceability IDs assigned in coworker-generated content SHALL follow the same ID scheme as the installed `agentic-workflow` template. |

---

## 11. Acceptance Criteria

The v2.0 release is ready when all of the following are true:

| ID | Criterion |
|----|-----------|
| V2-AC-001 | A user can invoke at least one agentic coworker from the companion panel for an active workflow stage. |
| V2-AC-002 | The vault context selection step is presented and enforced before every coworker run. |
| V2-AC-003 | No vault content is modified without the user explicitly reviewing and accepting the proposed output. |
| V2-AC-004 | At least one complete end-to-end coworker workflow (user prompt → agent run → proposed output → accepted artifact in vault) works against a live `agentonomous` instance. |
| V2-AC-005 | All UI states (no provider configured, running, completed, failed, partial, resumable) are reachable using the browser-mode mock. |
| V2-AC-006 | Credentials are stored in Obsidian settings and do not appear in vault files, logs, or diagnostic exports. |
| V2-AC-007 | The companion panel extends the v1 navigator without breaking any v1 acceptance criteria. |
| V2-AC-008 | The typed Specorator-to-agentonomous bridge contract is documented and stable. |
| V2-AC-009 | The `agentonomous` runtime boundary decision is documented in the repository architecture decisions. |
| V2-AC-010 | All CI checks pass, including tests exercising coworker invocation, output review, and vault write paths using the bridge mock. |

---

## 12. Dependencies on agentonomous and agentic-workflow

| Dependency | Nature | Notes |
|------------|--------|-------|
| `agentonomous` coworker/agent model | Hard | Coworker definitions, invocation contracts, run lifecycle, and output structures are defined in `agentonomous`. |
| `agentonomous` runtime boundary | Hard | Must resolve V2-OQ-001 before integration implementation begins. |
| `agentonomous` structured I/O contracts | Hard | Bridge API (V2-FR-042) cannot be finalised until `agentonomous` input and output schemas are stable. |
| `agentic-workflow` artifact conventions | Hard | Coworker outputs must conform to `agentic-workflow` Markdown and frontmatter conventions to remain compatible with workflow tooling. |
| Obsidian bridge API from Phase 3 (#16) | Hard | The typed Obsidian-to-UI bridge is the integration surface for all orchestration calls. V2.0 extends it; it cannot be redesigned during v2.0 delivery. |
| v1 alpha acceptance criteria | Hard | v2.0 development begins only once the v1 plugin shell is stable and all v1 acceptance criteria are met. |
| Browser-mode mock for `agentonomous` | Soft | Required for UI development and testing (V2-FR-043); can be built incrementally but must cover all run states before v2.0 ships. |

---

## 13. Open Questions and Architectural Decisions Needed

| ID | Question |
|----|----------|
| V2-OQ-001 | What is the correct runtime boundary for `agentonomous` inside an Obsidian plugin — direct library import, a local companion process/service, a CLI bridge, or another model? This decision affects security, performance, mobile viability, and packaging constraints. |
| V2-OQ-002 | Can `agentonomous` run safely within the Obsidian plugin renderer process, or does it require isolation in a companion process? |
| V2-OQ-003 | Which agentic coworker should be the first implemented end-to-end target for v2.0, given the goal of proving the loop with minimal scope? |
| V2-OQ-004 | Which `agentic-workflow` stage or artifact type should the first coworker integration target? |
| V2-OQ-005 | How should long-running or interrupted agent runs be resumed — through `agentonomous` run state, vault-persisted metadata, or a combination? |
| V2-OQ-006 | How should generated file changes be represented in the review interface — full proposed files, diffs/patches, inline suggestions, or a configurable combination? |
| V2-OQ-007 | What permission model governs vault reads and writes for agent runs beyond the per-run context selection described in this PRD? |
| V2-OQ-008 | How should API keys and LLM provider credentials be stored — Obsidian's `loadData` store, OS keychain, or a dedicated secure store? |
| V2-OQ-009 | How much of a run log should be persisted in vault files vs. kept in plugin-only storage? |
| V2-OQ-010 | How should the UI guide users strongly through the coworker interaction model while keeping control boundaries obvious and non-patronising? |
