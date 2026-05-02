---
id: IDEA-WNU-001
title: "Workflow navigation UI — active stage, artifacts, and next actions"
stage: idea
feature: workflow-navigation-ui
status: accepted
owner: pm
created: 2026-05-02
updated: 2026-05-02
---

## Problem statement

Once a user has installed the workflow and created a feature, they have no guided way to understand where they are in the process, which artifacts are expected next, or how to advance their work. They must navigate the vault manually and remember the 12-stage lifecycle from memory. This is a barrier for new adopters and a source of process errors even for experienced users.

## Primary users

- **New workflow users** who are unfamiliar with the 12-stage agentic-workflow lifecycle.
- **Active feature owners** who want to see their current stage and next required artifact at a glance.
- **Project managers** who need to check progress across multiple features without opening every folder.

## Success criteria

- The plugin sidebar or modal shows: the active feature (or a selection UI if multiple features exist), the current workflow stage, and the list of expected artifacts for that stage.
- The user can open any existing stage artifact directly from the navigator.
- The navigator shows which next actions are available (advance to next stage, open a file, create a missing artifact).
- The navigator reflects live vault state — it updates when the user makes changes and returns to the plugin view.

## Constraints

- Must use only `IBridge` for vault reads; no direct Obsidian API calls.
- Must work in both the Obsidian embedded view and the standalone browser UI.
- Must not assume a single active feature; the plugin should support vaults with multiple features in flight.
- The UI must use existing Vue components and design tokens; no new design system dependencies.

## Research questions

- How should the UI handle vaults with zero features vs. one feature vs. many features?
- Should "next actions" be prescribed by the spec or inferred dynamically from artifact state?
- What is the right Obsidian surface: sidebar leaf, modal, or status bar?

## Preliminary scope

**In scope:** Feature selector (single + multi-feature); active stage display with lifecycle progress indicator; artifact list with open/create actions; next-stage advance button; navigator updates on vault change events.

**Out of scope:** Full project portfolio view; agent coworker handoff (v2.0); template version indicator (separate feature); bulk operations across multiple features.
