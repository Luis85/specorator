---
title: "Specorator product glossary"
doc_type: glossary
status: draft
owner: product
last_updated: 2026-05-01
references:
  - docs/product-vision.md
  - docs/prd.md
  - docs/design/USE_CASES.md
  - docs/design/DESIGN_BRIEF.md
---

# Product Glossary

**Related issues:** [#32](https://github.com/Luis85/specorator/issues/32)  
**Source documents:** [Product Vision](./product-vision.md) · [PRD](./prd.md) · [Use Case Catalogue](./design/USE_CASES.md) · [Design Brief](./design/DESIGN_BRIEF.md)

This glossary defines terms used across product, design, engineering, documentation, and user-facing communication for Specorator. Terms distinguish v1 current capabilities from v2.0 planned direction. Ambiguous terms are flagged.

---

## Core Product Terms

### Specorator

The Obsidian plugin described in this repository. In v1, Specorator installs the `agentic-workflow` template into a vault, provides workflow navigation, and enables artifact creation from inside Obsidian. In v2.0, Specorator becomes a companion app offering a team of agentic coworkers powered by `agentonomous`.

The name is a portmanteau of *spec* and *decorator* — it layers workflow structure onto a vault without owning the underlying content.

### companion app

v2.0 framing. A Specorator instance with active `agentonomous` integration that gives the user a team of agentic coworkers inside Obsidian. The companion app assists with producing, reviewing, and improving workflow outputs while the user stays focused on the vault. **Not available in v1.**

### agentic coworker

v2.0 framing. A purpose-built agent (defined in `agentonomous`) that appears as a named, role-specific helper in the Specorator UI. Examples: Spec Writer, Design Reviewer, Decision Recorder, Task Planner. Coworkers propose outputs; the user reviews, edits, and accepts or rejects them. **Not available in v1.**

---

## Workflow Terms

### workflow stage

A named phase in the `agentic-workflow` methodology through which a feature or project progresses (e.g., Define, Design, Build, Verify). The plugin surfaces the active stage in the navigator and shows expected next artifacts for that stage.

### artifact

A Markdown file produced or managed through the workflow. Artifacts are stored in the vault as plain files that remain useful and editable without the plugin. Examples: feature specs, decision notes, open questions, task lists, gate check records.

### workflow state

The current status of a feature or project as derived from vault Markdown content — which stage the feature is in, which artifacts are present, which gates have been crossed. Workflow state is read from the vault, not from plugin-private storage.

### template installation

The process of writing the `agentic-workflow` template's required files and folder structure into an Obsidian vault. The plugin checks for existing files before writing and requires explicit user confirmation before overwriting any file.

### gate

A quality checkpoint between workflow stages. The plugin can check whether required artifacts are present and surface the result before the user crosses to the next stage. Gates are enforced with configurable strictness (see `UC-09`–`UC-13`).

### gate check

A specific check performed at a gate — for example, verifying that a spec file exists and has the required frontmatter fields. Gate checks can pass, fail, or be overridden.

### scaffold / project scaffold

The initial set of folders and template files created when a user starts a new feature or project through the plugin. The scaffold follows `agentic-workflow` conventions and produces plain Markdown artifacts.

### feature

A unit of work tracked through the workflow. A feature has a name, a slug-based folder, a set of step files, and a `_meta.md` state file. Features can be active, archived, or abandoned.

### step file

One of the 11 structured Markdown files within a feature folder, each corresponding to a workflow stage. Step files are created from templates at feature creation and are editable at any time.

### open question (OQ)

A documented uncertainty or decision point logged during a feature's workflow. Open questions can be resolved by the builder or a peer, or escalated to a decision note. They are tracked as Markdown artifacts in the vault.

### decision note

A structured Markdown record of a decision made during the workflow, including the options considered, rationale, and outcome. Decision notes are the primary form of ADR (Architecture Decision Record) in the Specorator workflow.

### house rule / constitution

A set of team- or project-specific rules written in Markdown and referenced at gate checks. A constitution violation surfaces during a gate review and must be resolved or overridden before the user can advance.

---

## UI Terms

### cockpit

The primary Specorator panel inside Obsidian. In v1, the cockpit shows the active feature, current stage, expected artifacts, and available next actions. In v2.0, the cockpit is extended with an agentic coworker assistance area. **The cockpit is the navigator view referenced in the PRD.**

### workflow navigator

The v1 sidebar or panel view that exposes workflow state: active project, current stage, next required artifacts, and controls for opening or creating workflow files. Implemented with Vue 3 in an isolated browser runtime.

### empty state

The cockpit display when no template is installed or no features exist in the vault. The empty state provides a clear call-to-action to begin template installation or create a first feature.

### coach

v1 UX term for inline contextual guidance shown in the cockpit to orient the user at each step (e.g., "Start with the vision — what are you building and why?"). Not a live AI; static guidance text.

### re-entry context

An optional cockpit mode that shows a summary of recent vault activity when the user returns after a configurable absence threshold (default 24 h). Helps restore context without manual navigation.

### feature switcher

A UI control in the cockpit that lets the user move between multiple active features without leaving the navigator.

---

## Technical Terms

### bridge API

The typed interface between the Obsidian plugin host and the Vue 3 UI, implemented in v1 as `src/bridge/`. The bridge decouples the UI from direct Obsidian API calls so the Vue panel can run both inside Obsidian and standalone in a browser. See [issue #16](https://github.com/Luis85/specorator/issues/16).

### browser mode

A development and testing mode in which the Vue 3 UI runs directly in a desktop browser without Obsidian. Browser mode uses mock implementations of the bridge API. See `V1-NFR-005`.

### Obsidian mode

Production mode in which the plugin runs inside Obsidian's desktop app, using the real vault file system, Obsidian API, and bridge implementation.

### isolated browser runtime

The technical approach used to host the Vue 3 UI inside the Obsidian plugin without giving it direct access to Node.js or Obsidian internals. The runtime provides a controlled environment where the UI communicates with the plugin host exclusively through the bridge API.

### plugin settings / data.json

Obsidian's mechanism for persisting plugin state (`loadData`/`saveData`). Specorator stores the installed template version, user preferences, and other per-vault settings here. Not the primary representation of workflow state — that is derived from vault Markdown.

### sideloading

Installing the plugin manually by placing compiled `main.js` and `manifest.json` in the vault's `.obsidian/plugins/specorator/` directory, without going through the Obsidian community marketplace. v1 alpha is distributed via sideloading.

---

## Ecosystem Terms

### agentic-workflow

The upstream methodology repository (`Luis85/agentic-workflow`) that defines the workflow stages, artifacts, templates, traceability conventions, and quality gates that Specorator implements. Specorator consumes released versions of `agentic-workflow` template packages as the source of truth for template content.

### agentonomous

The upstream agent orchestration library (`Luis85/agentonomous`) that will power v2.0 agentic coworker interactions. In v1, the plugin is designed to leave clean extension points for `agentonomous` without depending on it. **Not integrated in v1.**

### agent run

v2.0 term. A single execution of an agentic coworker flow in `agentonomous`, triggered by a user action in the Specorator UI. Agent runs produce proposed outputs that the user reviews before acceptance. **Not available in v1.**

### proposed output

v2.0 term. A coworker-generated artifact, patch, or suggestion presented to the user in the Specorator UI for review, editing, acceptance, or rejection. Proposed outputs do not become durable vault artifacts until the user accepts them. **Not available in v1.**

### accepted output

v2.0 term. A proposed output that the user has reviewed and accepted, after which it is written to the vault as a standard Markdown artifact. **Not available in v1.**

### vault context

The set of vault files or folders that the user explicitly permits an agentic coworker to read during an agent run. Users select vault context; coworkers do not have unrestricted vault access. **v2.0 concept; not applicable in v1.**

---

## Scope Boundaries

These terms flag areas where v1 and v2.0 differ significantly. Use precise language to avoid misleading users or contributors.

| Term | v1 status | v2.0 status |
|------|-----------|-------------|
| companion app | Not applicable | Core product framing |
| agentic coworker | Placeholder UI area only | Active coworker interactions |
| agent run | Not implemented | Orchestrated via `agentonomous` |
| proposed output | Not implemented | Generated by coworkers |
| accepted output | Not implemented | Applied to vault after user review |
| vault context | Not applicable | User-selected per agent run |
| `agentonomous` integration | Extension point only | Full integration |

---

## Ambiguous or Overloaded Terms

These terms have multiple possible meanings in the Specorator context and should be used carefully.

| Term | Ambiguity | Resolution |
|------|-----------|------------|
| **workflow** | Can refer to the `agentic-workflow` methodology, a specific feature's workflow path, or a GitHub Actions workflow. | Use "the workflow methodology" (methodology), "feature workflow" (per-feature path), or "CI workflow" (GitHub Actions). |
| **template** | Can mean the `agentic-workflow` template package or an individual step-file template. | Use "`agentic-workflow` template" (the full package) or "step template" / "artifact template" (individual file). |
| **plugin** | Can mean the Specorator Obsidian plugin specifically or Obsidian plugins generally. | Use "the Specorator plugin" or "the plugin" (Specorator context); "an Obsidian plugin" (generic). |
| **stage** | Sometimes used interchangeably with "step". | Prefer "stage" for workflow phases (Define, Design, Build, Verify) and "step" for the 11 numbered step files within a feature. |
| **state** | Can mean workflow state (derived from vault) or plugin settings state. | Use "workflow state" (vault-derived) and "plugin settings" or "plugin data" (stored config). |
| **agent** | Overloaded across engineering (agents as processes), `agentonomous` (agents as coworker definitions), and general AI usage. | Use "agentic coworker" for user-facing references to v2.0 assistants; "agent" alone is ambiguous. |
