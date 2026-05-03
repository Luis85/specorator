---
id: ADR-006
title: Centralize Obsidian API and vault write safety
status: accepted
date: 2026-05-03
references:
  - docs/pre-feature-architecture-readiness.md
  - docs/security/supply-chain.md
  - src/infrastructure/bridge/IBridge.ts
  - src/infrastructure/vault/VaultPath.ts
---

# ADR-006 - Centralize Obsidian API and vault write safety

## Decision

Production Obsidian APIs are allowed only in the plugin adapter boundary:

- `src/plugin/**` owns Obsidian plugin lifecycle, settings registration, and view registration.
- `src/infrastructure/obsidian/**` owns calls into Obsidian vault, workspace, file, folder, and notice APIs.
- Domain, application, and UI code use `IBridge` or narrower application abstractions instead of importing `obsidian` directly.

All plugin-owned vault paths must pass through a reviewed path utility before repository or workflow code writes, deletes, opens, lists, or creates files. The current utility rejects empty paths, absolute paths, parent traversal, and reserved roots such as `.obsidian`, while normalizing duplicate separators and Windows path separators.

Repository write paths must preserve user-authored files by default:

- Stage artifact creation is create-if-absent and skips existing files with a user notice.
- `workflow-state.md` updates are allowed only when the existing file parses as an owned workflow-state document.
- Malformed `workflow-state.md` blocks overwrite so the user can inspect or repair the file.

## Rationale

Specorator writes into a user's durable vault, not into disposable plugin cache. Path construction and overwrite behavior therefore need one obvious review point before template installation, artifact creation, diagnostics, and future repair flows add more write paths.

Keeping Obsidian APIs behind `IBridge` preserves the current testable architecture and prevents UI or use-case code from quietly growing direct vault permissions.

## Consequences

- New repository or workflow services must use `VaultPath` before touching vault paths.
- Direct Obsidian imports outside the plugin and Obsidian adapter layers remain an ESLint violation.
- Low-level bridge methods stay intentionally thin; higher-level repository and workflow services own path and overwrite policy.
- Any future exception must be documented in the ADR or in a follow-up ADR before implementation expands the write surface.
