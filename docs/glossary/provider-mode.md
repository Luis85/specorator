---
term: "provider mode"
aliases: ["mode", "transport mode"]
category: product
status: stable
version: "v1"
related:
  - provider.md
  - claude-cli-port.md
last_updated: 2026-05-22
---

# Provider mode

The **provider mode** is the execution surface used to reach a given [provider](./provider.md). In v1 every provider exposes the same closed set of modes (`api`, `cli`); see `src/domain/chat/ProviderSelection.ts` (`ProviderMode` type).

- `api` — the provider's hosted REST/HTTPS API. Auth comes from the secret store; no local binary is required.
- `cli` — a local subscription-bearing CLI binary (`claude-code` / `cursor-agent`). Requires the binary on the user's PATH.

Each `(provider, mode)` cell maps to one adapter implementation under `src/infrastructure/`. The `TransportSelector` (REQ-MPS-007) chooses a cell at runtime based on the user's `chatProviderStore.activeSelection` and the synchronous availability projection (`apiKeyPresent`, `cliResolved`).

A mode change does not interrupt an in-flight turn: the active stream finishes on its original adapter, and the next dispatched turn uses the new cell (spec §10 row 1).
