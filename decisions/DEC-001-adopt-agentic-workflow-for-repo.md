---
id: DEC-001
title: Adopt agentic-workflow methodology for this repository's own development
date: 2026-05-02
status: accepted
deciders: [Luis85]
area: process
---

# DEC-001 — Adopt agentic-workflow for repo development

## Context

Specorator is built to help users run the agentic-workflow methodology in their Obsidian vault. Before shipping Phase 4 features, the repository itself should be a live, consistent example of the methodology in practice.

The repository had partial adoption: three features already had `specs/` entries (`agentic-workflow-vault-structure`, `github-pages-ui`, `standalone-ui-multilang`), but the `workflow-state.md` format was inconsistent, no spec entries existed for the five remaining Phase 4 features, `CONSTITUTION.md` and `decisions/` were missing, and `docs/contributing.md` had not been updated to enforce the spec-first gate.

## Decision

1. **All Phase 4 features must have a `specs/` entry** (at minimum `idea.md` + `workflow-state.md` at the idea stage) before implementation begins.
2. **`workflow-state.md` files follow the canonical ADR-005 schema** including `id`, `slug`, `createdAt`, `updatedAt`, and `feature` as a human-readable title (not slug).
3. **`CONSTITUTION.md`** serves as the repository working agreement and the source of truth for non-negotiable constraints.
4. **`decisions/`** captures day-to-day decisions and rationale that don't rise to the level of a formal ADR but should be durable and discoverable.
5. **`docs/contributing.md`** documents the spec-first gate explicitly.

## Rationale

Eating our own dog food has two benefits: it validates the workflow for real complex software development, and it makes the repo a reference implementation that users can inspect to understand how to apply the methodology themselves.

The spec-first gate prevents implementation from outrunning design, which is the most common source of rework in iterative plugin development.

## Consequences

- Phase 4 implementation branches may not open until #76 is closed.
- All three existing `workflow-state.md` files were updated to the canonical schema as part of this decision (issue #76).
- Five new `specs/` entries were created for the remaining Phase 4 features.
- `CONSTITUTION.md` and `decisions/DEC-001` are now committed to the repository.
