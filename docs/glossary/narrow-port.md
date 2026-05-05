---
term: "Narrow port"
aliases: ["port", "narrow ports", "ADR-008"]
category: technical
status: stable
version: "v1 and v2.0"
related:
  - mcp-server.md
  - claude-cli-port.md
  - runtime-port.md
issues:
  - "#99"
  - "#163"
last_updated: 2026-05-05
---

# Narrow port

A focused TypeScript interface in `src/domain/ports/` that exposes exactly the Obsidian API surface needed for one concern. Each port has one job; consumers depend on one port per dependency; there is no aggregate interface that bundles multiple concerns.

Specorator defines five narrow ports for Obsidian API access:

| Port | Concern |
|---|---|
| `SettingsPort` | `getSettings`, `saveSettings` |
| `VaultPort` | File read/write/delete/list/exists/createFolder |
| `WorkspacePort` | `openFile` |
| `NotificationPort` | `showError`, `showWarning`, `showSuccess`, `showInfo` |
| `LoggerPort` | `debug`, `info`, `warn`, `error` |

W13 (#163) adds `MetadataCachePort`, `CanvasPort`, and `ClaudeCliPort` as the Phase 4 feature set requires.

## Why narrow

A broad interface (`IBridge`) that exposes everything fails in two ways: components import more than they need (coupling), and mocking in tests requires implementing the entire surface even when only one method is used. Narrow ports make each dependency explicit and each mock minimal.

## Three implementations

Each port has three concrete implementations:

- `ObsidianBridge` — production, wraps `App` and `Vault`
- `MockBridge` — unit tests and `npm run dev`
- `LocalStorageBridge` — GitHub Pages demo

## ESLint enforcement

`no-restricted-imports` forbids re-introducing the deleted `IBridge`, `BridgeKey`, and `useBridge` symbols. Vue components may not import `obsidian` directly.

## Reference

ADR-008 (`docs/adr/ADR-008-narrow-ports-supersede-ibridge.md`).
