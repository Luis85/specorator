---
id: IDEA-ACS-001
title: "Artifact creation and project scaffolding"
stage: idea
feature: artifact-creation-scaffolding
status: accepted
owner: pm
created: 2026-05-02
updated: 2026-05-02
---

## Problem statement

Users who want to start a new feature or project through Specorator must currently create the folder structure and starter files manually. The plugin can read existing vault content but provides no guided creation path. Without a scaffolding command, the plugin is a viewer rather than a workflow entry point — users cannot start a new workflow run from inside Obsidian.

## Primary users

- **New project starters** who want to create a new feature spec from inside the plugin without touching the vault directly.
- **Power users** who create multiple features per session and want a fast, consistent scaffolding path.
- **Contributors** who want to verify that the plugin creates correct, agentic-workflow-compatible artifacts from the start.

## Success criteria

- A user can create a new feature (name, slug) from the plugin UI or command palette.
- The plugin creates `specs/{slug}/workflow-state.md` and `specs/{slug}/idea.md` with correct frontmatter.
- Stage artifact files for later stages are created lazily only when the user advances to that stage.
- If the feature folder or `workflow-state.md` already exists, the plugin shows a notice and does not overwrite.
- All created files are plain Markdown readable and editable without the plugin.

## Constraints

- Must use `IBridge.writeFile` and `IBridge.createFolder`; no direct Obsidian calls.
- `workflow-state.md` frontmatter must conform to the ADR-005 canonical schema.
- Slug must pass `Slug` value object validation (kebab-case, no leading/trailing hyphens).
- Must work in both the Obsidian embedded view and the standalone browser UI (MockBridge / LocalStorageBridge).

## Research questions

- Should the creation UI be a modal dialog, a command palette flow, or a form within the navigator panel?
- How should the plugin handle slug collisions (a feature with that slug already exists)?
- Should `idea.md` be pre-populated with a template or left as a blank file?

## Preliminary scope

**In scope:** New feature creation UI (modal or panel form); `workflow-state.md` + `idea.md` creation via IBridge; slug validation; duplicate detection with notice; navigation to new feature after creation.

**Out of scope:** Bulk feature import; template-sourced starter content for `idea.md` (deferred to template-installation-service); stage artifact creation beyond `idea.md` at creation time.
