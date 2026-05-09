---
id: IDEA-ARCH-001
title: "Plugin architecture and framework — living baseline"
stage: idea
feature: plugin-architecture
status: accepted
owner: pm
created: 2026-05-09
updated: 2026-05-09
---

## Problem statement

Plugin architecture is not a one-time decision — it is a continuously refined framework that underpins every feature added over the plugin's lifespan. Without a tracked spec, architectural improvements happen ad hoc, quality gates drift, and new contributors (human or agent) have no authoritative source for "what the baseline looks like and why."

This spec entry exists so that the plugin's architecture and development framework are themselves treated as a first-class feature: specced, versioned, reviewed, and incrementally improved just like any product feature.

## Primary users

- **Solo contributor / engineering owner** — needs a single place to track decisions about DDD layers, port granularity, test conventions, CI gates, and quality thresholds as they evolve.
- **Agentic contributors** — need an authoritative baseline spec to derive implementation discipline from. Without it, agents invent their own conventions.
- **Future contributors** — need to onboard to a stable, documented architectural baseline rather than reverse-engineering it from code.

## Success criteria

- Any new Obsidian plugin on this stack can be scaffolded to a passing `npm run verify` baseline by following the design and tasks artifacts in this spec.
- Architectural decisions are recorded in this spec's artifacts (design, requirements) before they are implemented.
- Quality gates (coverage thresholds, bundle budget, complexity limits) are updated here before being changed in CI or tooling.
- When the baseline evolves (e.g., a new port is standardised, a new ESLint rule is adopted, a threshold is raised), this spec is updated and the change is traceable to an explicit decision.

## Scope

**In scope:**
- Pre-feature scaffold spec: ports, bridges, error system, test harness, CI, quality metrics.
- Conventions for test layout, PageObject pattern, fake factory.
- ESLint rules governing import direction and code quality.
- `npm run verify` gate composition and CI workflow.
- Quality metric baselines (coverage floors, bundle budget, complexity limits).

**Out of scope:**
- Business logic or product features (tracked in their own spec entries).
- Obsidian marketplace release process (tracked separately in release workflow docs).
- Agent runtime boundary for v2 (tracked in its own ADR and spec once required).

## Research questions

- At what point should the port layer be split further (e.g., `FileSystemPort` vs `FrontmatterPort`)?
- Should `size-limit` budget be enforced per-module once the module system matures?
- Should type coverage be tracked via a dedicated tool (`ts-coverage`) in addition to `strict: true`?
- What is the right complexity ceiling for composables that orchestrate multiple ports?

## Preliminary scope for baseline increment (current)

The first increment implements the full pre-feature harness for a new plugin from scratch. See `design.md` (capability spec) and `tasks.md` (implementation plan). Subsequent increments will be tracked as additional task sets or requirement updates in this same spec entry.
