---
id: IDEA-TIS-001
title: "Template installation service with overwrite protection"
stage: idea
feature: template-installation-service
status: accepted
owner: pm
created: 2026-05-02
updated: 2026-05-02
---

## Problem statement

A new Specorator user has no workflow files in their vault. Before they can run the agentic-workflow process, the plugin must install the required folder structure and starter files. The installation must be idempotent: running it a second time must not silently overwrite files the user has already customised. Without a safe, guided install service, users face a blank vault with no scaffolding and risk losing work if they accidentally reinstall.

## Primary users

- **New users** setting up the agentic-workflow for the first time in a clean vault.
- **Existing users** who want to install a newer workflow template version alongside their current work.
- **Developers** testing the plugin in a fresh vault who need repeatable setup.

## Success criteria

- The plugin can install the complete agentic-workflow template structure into the active vault from a single command.
- If a file already exists at an installation path, the plugin shows a notice and skips that file without overwriting.
- The plugin records the installed template version in `workflow-state` metadata so update checks can compare it later.
- The install operation is atomic enough that a partial failure leaves the vault in a usable state rather than a broken one.

## Constraints

- Must go through the `IBridge` interface; no direct Obsidian API calls in the service layer.
- Must honour the overwrite protection requirement REQ-AVS-005 from the vault structure spec.
- The template source (bundled files vs. fetched from a release) must be decided in the requirements or design stage.
- Must not modify any file the user has manually edited since install.

## Research questions

- Should template files be bundled with the plugin at build time or fetched from a GitHub release at runtime?
- How should the plugin represent the installed template version (manifest field, separate metadata file, or `workflow-state.md` frontmatter)?
- What is the minimal set of files needed for an initial install to be useful?

## Preliminary scope

**In scope:** Install command; folder and file creation via `IBridge`; skip-with-notice on existing files; installed-version recording; user-facing progress or summary notice.

**Out of scope:** Full multi-version migration; deep merge of user-customised files; runtime fetch from unpublished repo state; automatic update without user confirmation.
