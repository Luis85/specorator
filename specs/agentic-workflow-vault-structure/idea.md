---
id: IDEA-AVS-001
title: Align plugin vault structure with agentic-workflow conventions
stage: idea
feature: agentic-workflow-vault-structure
status: accepted
owner: analyst
created: 2026-05-01
updated: 2026-05-01
---

## Problem statement

The current Specorator plugin stores feature artifacts in `features/{slug}/` with numbered step files (`01-vision.md`, `02-problem-scope.md`, etc.). This structure diverges from the upstream [agentic-workflow](https://github.com/luis85/agentic-workflow) template that Specorator is designed to support. The agentic-workflow template uses `specs/{slug}/` with role-named stage files (`idea.md`, `research.md`, `requirements.md`, …) and a `workflow-state.md` tracking file. As a result, vaults managed by Specorator are incompatible with the agentic-workflow conventions, ADR format, and agent prompts that users of that template rely on.

## Primary users

- Developers using the agentic-workflow template alongside Specorator (need consistent vault layout).
- Agents and skills defined in agentic-workflow that resolve artifact paths by name (need predictable file locations).
- Plugin contributors who need the plugin's own development tracked in the same structure (eat our own dog food).

## Success criteria

- The vault folder the plugin creates and manages is `specs/{slug}/` by default.
- Each feature folder contains a `workflow-state.md` file as the primary tracking artifact with agentic-workflow-compatible YAML frontmatter.
- Stage artifacts are named following the agentic-workflow 11-stage lifecycle: `idea.md`, `research.md`, `requirements.md`, `design.md`, `spec.md`, `tasks.md`, `implementation-log.md`, `test-plan.md`, `test-report.md`, `review.md`, `release-notes.md`, `retrospective.md`.
- The specorator repo itself uses `specs/` to track its own feature development.

## Constraints

- Must not silently corrupt existing vaults that use the old `features/` structure; migration must be explicit and opt-in.
- The `workflow-state.md` frontmatter schema must be a strict subset of (or extension compatible with) the agentic-workflow `workflow-state-template.md`.
- Stage file creation must remain lazy (files created only when the user advances to that stage).

## Research questions

- What is the exact required frontmatter schema for `workflow-state.md` in the agentic-workflow template?
- Should ADRs be stored per-feature in `specs/{slug}/adr/` or globally in `docs/adr/`?
- How should the plugin handle vaults that already have a `features/` structure?

## Preliminary scope

**In scope:** Rename default root folder from `features` to `specs`; rename `_meta.md` to `workflow-state.md`; update stage slug list to match agentic-workflow names; update `FeatureRepository` serialisation to write agentic-workflow-compatible `workflow-state.md` frontmatter; update all translations, default settings, and dev fixtures.

**Out of scope:** Automated migration of existing `features/` vaults; ADR scaffolding; traceability index generation; integration with agentic-workflow agent prompts.
