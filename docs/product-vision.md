---
title: "Specorator product vision"
doc_type: vision
status: draft
owner: product
last_updated: 2026-05-04
references:
  - docs/prd.md
  - docs/roadmap-v1.md
---

# Product Vision

## Ecosystem Architecture

Specorator is one component in a four-part ecosystem. The plugin is the **user-facing layer** — the cockpit through which a user interacts with everything else.

```
┌─────────────────────────────────────────────────────────┐
│                   specorator-plugin                      │
│         (UI cockpit — Obsidian, standalone browser)      │
│   triggers sessions · subscribes to events · review UI   │
└────────────────────┬────────────────────────────────────┘
          commands / session triggers ↓ ↑ event stream
┌────────────────────▼────────────────────────────────────┐
│                  specorator-runtime                      │
│     execution engine · session model · event bus         │
│     workflow interpreter · agent executor · scheduler    │
└──────────┬──────────────────────────┬───────────────────┘
           │ workflow definitions      │ agent invocations
┌──────────▼──────────┐    ┌──────────▼───────────────────┐
│   agentic-workflow  │    │        agentonomous           │
│  stage model        │    │  agent implementations        │
│  templates          │    │  cognition · capabilities     │
│  quality gates      │    │  structured I/O contracts     │
└─────────────────────┘    └──────────────────────────────┘
```

| Component | Role |
|---|---|
| [`specorator-plugin`](https://github.com/Luis85/specorator) | UI layer. Obsidian plugin and standalone browser app. In v1: surfaces workflow state, scaffolds artifacts, and runs quality checks without a runtime dependency. In v2.0: triggers runtime sessions, subscribes to runtime events, presents execution state, and gives users the review and accept surface for agent outputs. |
| [`specorator-runtime`](https://github.com/Luis85/specorator-runtime) | Execution engine. Interprets workflow definitions, manages session lifecycle, invokes agents, emits typed events, and exposes queryable state. Published as an npm library consumed by the plugin. |
| [`agentic-workflow`](https://github.com/Luis85/agentic-workflow) | Methodology and definitions. Stage model, templates, quality gates, and traceability conventions. Released versions are the source of truth for workflow structure. |
| [`agentonomous`](https://github.com/Luis85/agentonomous) | Agent capabilities. TypeScript autonomous-agent library. Provides the agent implementations the runtime invokes — structured input/output contracts, cognition models. |

---

## Vision

Specorator is the user interface for the Specorator ecosystem. It gives users a single, approachable cockpit inside Obsidian — or a standalone browser — to understand workflow state, take the next valid action, trigger agentic execution, and review outputs, without needing to touch the runtime, agents, or methodology files directly.

The plugin surfaces deterministic workflow tooling (validation, templates, quality gates, scaffolding) in v1. In v2.0, it connects to `specorator-runtime` to run agentic workflows end-to-end — executing tasks, invoking agents from `agentonomous`, and streaming live session state back to the user.

LLM-assisted execution is a v2.0 capability, not a prerequisite for v1 utility.

## Product Promise

Specorator helps individuals and teams move from idea to release through visible, auditable workflow stages. In v1, the vault stays the durable source of truth and all tooling works offline. In v2.0, the runtime executes the workflow while the user retains full control over what runs, what context agents receive, and what outputs get accepted.

## v1 Alpha — Foundation

The v1 alpha establishes the plugin foundation and proves the end-to-end loop without a live runtime:

1. Select or use a supported released [`agentic-workflow`](https://github.com/Luis85/agentic-workflow) template version.
2. Install the required workflow files into an Obsidian vault with overwrite protection.
3. Show the current workflow state, active project or feature, and available process steps.
4. Let the user create or open workflow artifacts in Obsidian.
5. Preserve all outputs as plain Markdown files that remain useful without the plugin.
6. Leave a clean, documented extension point for the v2.0 runtime integration.

v1 has no runtime dependency. It is the stable UI scaffold on which v2.0 is built.

## v2.0 — Runtime-Connected Agentic Cockpit

v2.0 connects the plugin to [`specorator-runtime`](https://github.com/Luis85/specorator-runtime), turning it into a live agentic cockpit.

The user triggers a workflow session from the plugin. The runtime interprets the active workflow definition, resolves the task graph, and invokes agents from [`agentonomous`](https://github.com/Luis85/agentonomous) at each task. The plugin subscribes to the runtime's event stream and renders execution state in real time — which tasks are running, which agents are active, what outputs have been produced.

All agent outputs arrive as proposals. The user reviews, edits, accepts, or rejects each one before it becomes a vault artifact. Nothing is silently applied.

The user stays in Obsidian. The runtime and agents operate behind the plugin's UI surface. The vault remains the durable output store.

## Target Users

- Solo builders who want a guided path from rough idea to implemented feature.
- Product-minded engineers who want requirements, design, tasks, tests, and release notes connected.
- Teams adopting agentic development who need workflow discipline without making an LLM the only operator.
- Maintainers who need vault quality checks, repair paths, and traceability signals available inside Obsidian.

## Principles

- **Workflow first.** The plugin models the full workflow, not just note editing shortcuts.
- **Local first.** v1 tooling works offline. The runtime itself runs locally and requires no hosted Specorator service. LLM provider access for agents is user-configured and optional per the "LLM optional" principle.
- **LLM optional.** v1 is fully productive without any LLM provider configured. v2.0 degrades gracefully when no provider is available.
- **Inspectable state.** Users see the active stage, required artifacts, quality gates, blockers, and next actions — and in v2.0, live session state from the runtime.
- **Deterministic upkeep.** Validation, linting, traceability checks, scaffolders, and repair helpers are exposed as normal plugin capabilities.
- **Human-owned decisions.** The interface surfaces choices and risks, but the user remains responsible for intent, priority, and acceptance.
- **Runtime transparency.** In v2.0, the plugin shows what the runtime is doing — which tasks are executing, which agents are active, what events have fired — so users are never left guessing about the state of a running session.
- **User-controlled agents.** Agents propose; the user decides. Context shared with agents is explicit and revocable per run.

## Core Experience

The first-class experience is a workflow cockpit inside Obsidian:

- Shows the current project, feature, workflow stage, and completion state.
- Presents the next valid actions for the active stage.
- Creates or updates workflow artifacts from templates.
- Runs local scripts and checks from plugin controls.
- Displays validation results with direct links to affected notes.
- Tracks requirements, tasks, tests, decisions, and release artifacts.
- **v2.0:** Triggers runtime sessions and streams live execution state — task graph, agent activity, event log — directly in the panel.
- **v2.0:** Presents agent-proposed outputs in a review interface; user accepts, edits, or rejects before any vault write.

## Required Tooling Surface

The plugin should make these capabilities available without requiring chat-based operation:

- Project and feature scaffolding.
- Stage transition checks.
- Template-driven artifact creation.
- Requirement and traceability validation.
- Vault linting and consistency checks.
- Quality gate execution and result display.
- Issue, decision, and clarification tracking.
- Repair guidance for missing or inconsistent artifacts.
- Export or handoff summaries for pull requests, releases, and reviews.
- **v2.0:** Runtime session management — start, monitor, cancel, inspect.
- **v2.0:** Agent output review — accept, edit, reject, or request refinement.

## Non-Goals

- Replacing Obsidian as the editing environment.
- Requiring any specific LLM provider or any hosted Specorator service.
- Hiding workflow artifacts behind opaque plugin state.
- Automating human approval gates.
- Turning the workflow into a generic project management board detached from specs.
- Giving agents unrestricted vault access by default.
- Automatically accepting or applying agent outputs without user review.
- Implementing execution, scheduling, or session management inside the plugin — `specorator-runtime` owns that.
- Implementing agent cognition or capabilities inside the plugin — `agentonomous` owns that.

## Success Signals

- A new user can create a project, start a feature, and find the next required action without reading the full methodology first.
- A maintainer can run vault quality checks from the plugin and understand every reported issue.
- The same workflow artifacts remain readable and usable as Markdown files.
- LLM-disabled usage remains productive for scaffolding, validation, upkeep, and review preparation.
- Advanced users can still use scripts and command-line tools directly when they prefer.
- **v2.0:** A user can trigger a runtime session, watch execution progress in the panel, review a proposed agent output, and accept or reject it — without leaving Obsidian or losing control of their vault.

## Open Questions

| # | Question |
|---|---|
| OQ-01 | Which workflow stages must be supported in the first usable v1 slice? |
| OQ-02 | Which `agentic-workflow` scripts should become plugin commands first? |
| OQ-03 | What vault health checks are mandatory before any agentic session is triggered? |
| OQ-04 | Given the runtime is consumed as an npm library, does the Obsidian plugin require an IPC or worker-thread boundary to avoid blocking the UI thread during execution? |
| OQ-05 | What is the minimum runtime event set the plugin must handle to render useful session state in v2.0? |
| OQ-06 | Which `agentonomous` agents should be available in the first v2.0 session? |
| OQ-07 | How should interrupted or failed runtime sessions be surfaced and recovered from in the UI? |
| OQ-08 | How should run provenance (agent, session ID, date) be stored in accepted vault artifacts? |
