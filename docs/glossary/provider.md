---
term: "provider"
aliases: ["chat provider", "AI provider"]
category: product
status: stable
version: "v1"
related:
  - provider-mode.md
  - claude-cli-port.md
  - chat-sidebar.md
last_updated: 2026-05-22
---

# Provider

A **provider** is the upstream AI vendor whose model answers a chat turn. In v1 the closed set is `claude` and `cursor`; see `src/domain/chat/ProviderSelection.ts` (`ProviderId` type) for the canonical list.

Provider selection lives on `chatProviderStore.activeSelection`. The selection can be:

- explicit `{ provider, mode }` — pick a specific cell (one of four in v1);
- `{ forced: 'auto' }` — defer to `TransportSelector` (REQ-MPS-007 row-group `auto`);
- `{ forced: 'degraded' }` — force the no-op transport (REQ-MPS-007 row R15).

A provider is orthogonal to the [`provider mode`](./provider-mode.md). Switching providers mid-stream lets the active turn finish on the original provider and routes the next turn to the new selection (spec §10 row 1; TST-MPS-32).
