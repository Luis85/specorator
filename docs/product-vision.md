# Product Vision

## Vision

Specorator turns a spec-driven delivery workflow into an approachable Obsidian product. A user should be able to understand where work stands, choose the next valid workflow action, run the supporting tools, and keep the vault healthy from one interface.

LLM integrations can accelerate drafting and review, but they are not the product's foundation. The plugin should expose deterministic workflow tooling, validation scripts, templates, and quality checks directly so users are not dependent on an assistant to upkeep the vault.

## Product Promise

Specorator helps teams move from idea to release through visible, auditable workflow stages while preserving the vault as the durable source of truth.

## Target Users

- Solo builders who want a guided path from rough idea to implemented feature.
- Product-minded engineers who want requirements, design, tasks, tests, and release notes connected.
- Teams adopting agentic development who need workflow discipline without making an LLM the only operator.
- Maintainers who need vault quality checks, repair paths, and traceability signals available inside Obsidian.

## Principles

- **Workflow first.** The plugin models the full workflow, not just note editing shortcuts.
- **Local first.** Vault content, scripts, templates, and checks should work locally and remain useful outside hosted services.
- **LLM optional.** AI assistance is an accelerator, not a prerequisite for running or maintaining the workflow.
- **Inspectable state.** Users can see the active stage, required artifacts, quality gates, blockers, and next actions.
- **Deterministic upkeep.** Validation, linting, traceability checks, scaffolders, and repair helpers are exposed as normal plugin capabilities.
- **Human-owned decisions.** The interface surfaces choices and risks, but the user remains responsible for intent, priority, and acceptance.

## Core Experience

The first-class experience is a workflow cockpit inside Obsidian:

- Shows the current project, feature, workflow stage, and completion state.
- Presents the next valid actions for the active stage.
- Creates or updates workflow artifacts from templates.
- Runs local scripts and checks from plugin controls.
- Displays validation results with direct links to affected notes.
- Tracks requirements, tasks, tests, decisions, and release artifacts.
- Offers optional LLM-assisted drafting or critique when configured.

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

## Non-Goals

- Replacing Obsidian as the editing environment.
- Requiring a single LLM provider or hosted service.
- Hiding workflow artifacts behind opaque plugin state.
- Automating human approval gates.
- Turning the workflow into a generic project management board detached from specs.

## Success Signals

- A new user can create a project, start a feature, and find the next required action without reading the full methodology first.
- A maintainer can run vault quality checks from the plugin and understand every reported issue.
- The same workflow artifacts remain readable and usable as Markdown files.
- LLM-disabled usage remains productive for scaffolding, validation, upkeep, and review preparation.
- Advanced users can still use scripts and command-line tools directly when they prefer.

## Near-Term Product Questions

- Which workflow stages must be supported in the first usable plugin slice?
- Which existing scripts should become plugin commands first?
- What vault health checks are mandatory before any LLM-assisted workflow is added?
- How should plugin state be stored so Markdown remains the source of truth?
- What does a minimal but useful traceability dashboard need to show?
