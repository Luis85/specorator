---
id: ADR-001
title: DDD layered architecture with enforced import direction
status: accepted
date: 2026-05-01
---

# ADR-001 — DDD layered architecture with enforced import direction

## Decision

The plugin codebase is organised into four layers with a strict inward-only import direction:

```
domain ← application ← infrastructure ← ui
```

| Layer | Location | Allowed to import |
|---|---|---|
| Domain | `src/domain/` | Nothing outside domain |
| Application | `src/application/` | Domain only |
| Infrastructure | `src/infrastructure/` | Domain, application |
| UI | `src/ui/` | Application (via use cases), infrastructure (bridge key/types only) |
| Plugin | `src/plugin/` | All layers; owns Obsidian lifecycle |

## Rationale

Obsidian plugins are long-running processes that share a JavaScript runtime with other plugins. A clean layer boundary makes it possible to:

- unit-test domain and application logic without an Obsidian instance;
- run the UI in a normal browser via `MockBridge` (see ADR-002);
- replace the bridge implementation (Obsidian → localStorage → mock) without touching business logic;
- extend the bridge with `agentonomous` coworker services in v2.0 without coupling Vue components to the agent runtime.

## Consequences

- Vue components and Pinia stores must not import from `obsidian` directly. The ESLint `no-restricted-imports` rule enforces this.
- Pinia stores hold plain DTOs only; domain class instances must not cross the store boundary.
- Use cases are the only entry point from the UI into business logic.
