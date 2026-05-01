---
title: "Specorator product vision"
doc_type: vision
status: draft
owner: product
last_updated: 2026-05-01
references:
  - docs/prd.md
  - docs/roadmap-v1.md
---

# Product Vision

## Vision

Specorator turns a spec-driven delivery workflow into an approachable Obsidian product. A user should be able to understand where work stands, choose the next valid workflow action, run the supporting tools, and keep the vault healthy from one interface.

LLM integrations can accelerate drafting and review, but they are not the product's foundation. The plugin should expose deterministic workflow tooling, validation scripts, templates, and quality checks directly so users are not dependent on an assistant to upkeep the vault.

## Product Promise

Specorator helps teams move from idea to release through visible, auditable workflow stages while preserving the vault as the durable source of truth.

## v1 Alpha — Foundation

The v1 alpha establishes the plugin foundation and proves the end-to-end loop:

1. Select or use a supported released [`agentic-workflow`](https://github.com/Luis85/agentic-workflow) template version.
2. Install the required workflow files into an Obsidian vault with overwrite protection.
3. Show the current workflow state, active project or feature, and available process steps.
4. Let the user create or open workflow artifacts in Obsidian.
5. Preserve all outputs as plain Markdown files that remain useful without the plugin.
6. Leave a documented, clean extension point for the v2.0 agent coworker experience.

v1 does not implement agent orchestration. It is the stable scaffold on which v2.0 is built.

## v2.0 — Companion App with Agentic Coworkers

v2.0 turns Specorator into an Obsidian companion app that gives the user a team of agentic coworkers through an easy-to-use interface, powered by [`agentonomous`](https://github.com/Luis85/agentonomous).

The user stays focused on their vault and the work within it. Specorator guides them through the workflow, understands their input, helps formulate and improve outputs, and coordinates agentic coworkers that can assist with analysis, planning, drafting, review, and workflow-state progression.

The plugin goes out of its way to reduce process friction, but it must not take control away from the user. The user decides:

- where assistance is wanted;
- what vault context is shared with agents;
- which agent suggestions are accepted;
- what gets edited;
- when outputs become durable workflow artifacts.

Agent outputs are always proposed, never silently applied.

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
- **User-controlled agents.** In v2.0, agents propose; the user decides. Context shared with agents is explicit and revocable.

## Core Experience

The first-class experience is a workflow cockpit inside Obsidian:

- Shows the current project, feature, workflow stage, and completion state.
- Presents the next valid actions for the active stage.
- Creates or updates workflow artifacts from templates.
- Runs local scripts and checks from plugin controls.
- Displays validation results with direct links to affected notes.
- Tracks requirements, tasks, tests, decisions, and release artifacts.
- In v2.0: offers agentic coworkers that assist with drafting, review, and stage progression under explicit user control.

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

## Relationship to Upstream Projects

| Project | Role |
|---------|------|
| [`agentic-workflow`](https://github.com/Luis85/agentic-workflow) | Workflow methodology, stage model, templates, traceability conventions, and quality gates. Released versions are the source of truth for what high-quality workflow outputs look like. |
| [`agentonomous`](https://github.com/Luis85/agentonomous) | Agent orchestration engine for v2.0. Provides agent definitions, coworker concepts, routing, handoffs, run state, and tool abstractions. |
| Specorator | Obsidian plugin lifecycle, user interface, vault access, permission boundaries, and the bridge between the user's vault and upstream capabilities. |

## Non-Goals

- Replacing Obsidian as the editing environment.
- Requiring a single LLM provider or hosted service.
- Hiding workflow artifacts behind opaque plugin state.
- Automating human approval gates.
- Turning the workflow into a generic project management board detached from specs.
- Giving agents unrestricted vault access by default.
- Automatically accepting or applying agent outputs without user approval.
- Implementing a separate orchestration engine inside Specorator (agentonomous owns that).

## Success Signals

- A new user can create a project, start a feature, and find the next required action without reading the full methodology first.
- A maintainer can run vault quality checks from the plugin and understand every reported issue.
- The same workflow artifacts remain readable and usable as Markdown files.
- LLM-disabled usage remains productive for scaffolding, validation, upkeep, and review preparation.
- Advanced users can still use scripts and command-line tools directly when they prefer.
- In v2.0: a user can ask a coworker for help at a workflow stage, review the proposed output, and accept or reject it — without leaving Obsidian or losing control of their vault.

## Open Questions

- Which workflow stages must be supported in the first usable plugin slice?
- Which existing scripts should become plugin commands first?
- What vault health checks are mandatory before any LLM-assisted workflow is added?
- How should plugin state be stored so Markdown remains the source of truth?
- What does a minimal but useful traceability dashboard need to show?
- What is the right runtime boundary for agentonomous inside an Obsidian plugin — direct import, local service process, or CLI bridge?
- Which agentic coworkers should be available first in v2.0?
- How should long-running or interrupted agent runs be resumed?
