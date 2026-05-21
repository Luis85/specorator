---
id: REL-MPS-001
title: "Multi-provider agent sidepanel — Release notes"
stage: release-notes
feature: multi-provider-agent-sidepanel
status: draft
owner: sre
inputs:
  - SPEC-MPS-001
  - TASKS-MPS-001
  - IMPL-MPS-001
created: 2026-05-22
updated: 2026-05-22
---

# Release notes — Multi-provider agent sidepanel

## Summary

The Specorator agent sidepanel can now talk to **multiple AI providers**, not just Claude. Pick from Claude (API or CLI) and Cursor (API or CLI) in the agent header. Each turn carries the chosen `(provider, mode)` across the orchestrator, the session log, and the resume metadata.

## What changed for users

- **Provider switcher in the agent header.** Drop-down + badge. Switch any time; an in-flight turn finishes on the original provider; the next turn dispatches against the new selection.
- **Cursor support (preview).** Cursor API + Cursor CLI adapters land alongside the existing Claude transports. The Cursor key lives in the secret store (Obsidian ≥ 1.11.4); on older builds the field becomes a degraded notice.
- **Per-provider model selector.** Each provider exposes its own model list. The selected id is forwarded as `ChatTransportStreamOptions.model`.
- **Plan mode, bang-bash, instruction prefixes.** `Shift+Tab` toggles plan mode; a `#`-prefixed draft becomes a one-turn system instruction (the body after `#`); `!` keeps the draft verbatim for shell-style turns.
- **Attachments.** Drop files into the chat input; the per-turn attachments are forwarded to the adapter and cleared after the send.
- **Multi-thread switcher.** A tab strip on the agent header carries up to `chatTabCap` threads. The first user message derives the default title; a right-click confirms delete.
- **Inline approvals.** Tool-call approval cards render inline in the message stream; per-rule persistence lives in `Settings → Approvals`.

## URI handler additions

`obsidian://specorator?action=open-chat&provider=cursor:cli` (or `claude:api`, `auto`, `degraded`, etc.) opens the agent panel with the requested selection. Invalid values fall through silently and the panel still opens.

## Command palette

- `specorator:switch-provider` — cycles through the six selections (auto → claude:api → claude:cli → cursor:api → cursor:cli → degraded).
- `specorator:open-agent-sidepanel` — opens the panel without changing provider.

## Migration

Existing settings on `transportKind` + string `transport` migrate to the new `providerSelection` + `{ provider, mode }` discriminator at boot. The migration is idempotent (NFR-MPS-006); the legacy keys never re-enter the boot path after the first successful write.

## ADRs

- **[ADR-MPS-001](../../decisions/ADR-MPS-001-rename-claude-cli-port.md)** — rename `ClaudeCliPort` → `ChatTransportPort`.
- **[ADR-MPS-002](../../decisions/ADR-MPS-002-provider-selection-discriminator.md)** — discriminated `ProviderSelection` union.
- **[ADR-MPS-003](../../decisions/ADR-MPS-003-cursor-binary-resolver.md)** — Cursor CLI binary resolver and PATH discipline.

## Workstream history

| WS | PR | Headline |
|---|---|---|
| WS-1 | #417 | Rename `ClaudeCliPort` → `ChatTransportPort` |
| WS-2 | #418 | Provider selection discriminator + migration |
| WS-3 | #419 | TransportSelector reshape + ProviderRegistry wiring |
| WS-4 | #424 | `CursorApiAdapter` + secret storage |
| WS-5 | #423 | `CursorCliAdapter` + binary resolver |
| WS-6 | #422 | Multi-thread switcher UI |
| WS-7 | #425 | Per-message actions |
| WS-8 | #420 | Status panel + modes + model selector + attachments |
| WS-9 | #421 | Inline approvals + rule persistence |
| WS-10 | _this PR_ | Final integration + verify gate |

## Risks & known issues

- Cursor preview gate (`cursorApiPreview`) defaults to `false`. Enable in Settings to unlock the Cursor API cell — the CLI cell is always available when the binary resolves.
- The Cursor REST base URL (`https://api.cursor.sh/v1`) is the RES-MPS-001 placeholder and will be swapped once CQ-MPS-01 closes upstream.
- Legacy `/chat` route remains routed to the agent sidepanel via the URI handler; the legacy embed will be removed under CQ-MPS-02 in a follow-up.

## Verify gate

`npm run verify` green at the integration tip (see PR description for SHA).
