---
id: ADR-002
title: IBridge abstraction for all Obsidian API calls
status: accepted
date: 2026-05-01
---

# ADR-002 — IBridge abstraction for all Obsidian API calls

## Decision

All Obsidian API calls are routed through the `IBridge` interface (`src/infrastructure/bridge/IBridge.ts`). Three implementations exist:

| Implementation | Location | Use |
|---|---|---|
| `ObsidianBridge` | `src/infrastructure/obsidian/` | Production — wraps `App` and `Vault` |
| `MockBridge` | `src/infrastructure/mock/` | Unit tests and standalone dev mode |
| `LocalStorageBridge` | `src/infrastructure/localstorage/` | GitHub Pages demo |

The bridge is injected into the Vue app via `app.provide(BRIDGE_KEY, bridge)` and consumed with `useBridge()` composable. Components never hold a direct reference to a bridge implementation.

## Rationale

- Keeps the UI and domain layers completely free of Obsidian imports, making them runnable in any browser environment.
- Enables `npm run dev` to open the full UI in a browser with no Obsidian runtime.
- Provides a typed seam for the v2.0 `agentonomous` coworker services: agent capabilities will be added as new bridge methods or a parallel `IAgentBridge`, keeping the same injection pattern.
- `MockBridge` doubles as a test spy: `getNotices()` and `getAllFiles()` let tests assert on side effects without mocking individual methods.

## Consequences

- Every Obsidian capability needed by the UI must be explicitly declared on `IBridge`.
- `ObsidianBridge` must never be imported from `src/ui/` or `src/application/`. The ESLint adapter boundary rule enforces this.
- Bridge methods that have no meaningful browser equivalent (e.g. `openFile`) should dispatch a custom DOM event so the standalone harness can observe them.
