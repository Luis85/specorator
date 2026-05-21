---
id: IDEA-MPS-001
title: "Multi-provider agent sidepanel — Claudian parity + Cursor provider"
stage: idea
feature: multi-provider-agent-sidepanel
status: accepted
owner: architect
inputs:
  - IDEA-CCS-001
  - PRD-CCS-001
  - DES-CCS-001
created: 2026-05-21
updated: 2026-05-21
---

## Problem statement

Specorator's chat sidepanel is a single-thread, Claude-only surface. The upstream Claudian Obsidian plugin demonstrates the experience users expect: multi-tab threads, per-message actions, inline approval cards, status-panel transparency, mode toggles (plan / bang-bash / instruction), model selection, attachments, and a switcher between Claude and other agentic providers. Users that want to evaluate or migrate from Cursor cannot do so today without leaving Obsidian. The Anthropic API key in `PluginSettings` also ships across devices via Obsidian Sync — a known security gap we have already mitigated with `SecretStorePort` (REQ-CCS-001 patch) for Anthropic, but never used as the storage policy for any second provider.

## Primary users

- **Specorator daily users** who currently bounce between the sidepanel for Claude and a separate Cursor window for code work.
- **Evaluators** trialling Cursor vs Claude on the same vault — they need a side-by-side switcher, not a configuration change.
- **Operators** who want a transparent view of agent actions (todos, bash output, tool calls) without opening the dev console.

## Success criteria

- Users can switch between **Claude** and **Cursor** as a chat provider from the sidepanel header without changing global settings or restarting Obsidian.
- Cursor API key is stored exclusively in Obsidian's first-party Secret Storage (`app.secretStorage`); it never appears in `data.json`, never syncs across devices, and is unreadable from any vault file.
- Multi-thread switcher: ≥3 concurrent threads with rename, delete, and fork; persisted across reloads.
- Per-message actions: copy, regenerate-last, edit-and-resend.
- Status panel: persistent todo list + recent bash output (capped, collapsible) visible from the chat sidepanel.
- Mode toggles work: slash `/`, mention `@`, plan-mode (Shift+Tab), bang-bash `!`, instruction `#`.
- Inline approval cards (Deny / Allow once / Always allow) replace the legacy `InlinePlanApprovalCard` blocking modal pattern with per-rule persistence.
- Provider parity NFR: every existing claude-cli-chat-sidebar feature must work with `provider='claude'` after the rename, with no behavioural regression (test traceability REQ-CCS-001..028 → REQ-MPS-equivalent).

## Constraints

- All Obsidian API access through narrow ports (ADR-008). No new aggregate `usePorts()`; each new capability gets its own port if necessary.
- `Result<T, E>` for fallible application-layer operations (ADR-004).
- Vault layout unchanged — features under `specs/{slug}/` only (ADR-005).
- No `window.confirm` / `window.alert` / `window.prompt`. No `innerHTML` / `v-html`.
- The existing `ClaudeCliPort` is the canonical transport seam, but its name has become a lie — it serves both Claude SDK and Claude CLI subprocess. Rename to `ChatTransportPort` is a precondition for the Cursor provider work.
- Cursor API key MUST go through `SecretStorePort` (existing port, `available === false` on mobile and pre-1.11.4 desktop). No keytar fallback; degraded state is the alternative.
- Reuse the existing `ChatTurnOrchestrator` — turn lifecycle is provider-agnostic by construction.
- All UI copy plain-language; no AI / SDK jargon (consistent with NFR-CCS-012).

## Research questions

These are deliberately listed for the planner's spike-task carve-out — not blockers for spec acceptance.

- Q1 — Does Cursor expose a stable HTTP/SSE API for agentic chat with tool-use, or is the `cursor-agent` CLI the only public surface today? If CLI-only, the Cursor API adapter is a research spike behind a feature flag (`cursor.apiPreview`).
- Q2 — Cursor's tool-use shape: does it map cleanly onto our existing `StreamDelta` `tool-use-start / tool-use-input-delta / tool-use-stop` union, or does it need a new variant (e.g. citation deltas)?
- Q3 — Cursor model identifiers — should the model selector be a free-text field, a curated whitelist, or a runtime-fetched list per provider?
- Q4 — Multi-thread tab limit: Claudian caps at 10. Should we adopt the same cap or stay open-ended?

## Preliminary scope

### In scope

- Rename `ClaudeCliPort` → `ChatTransportPort` (and `ClaudeCliError` / `ClaudeCliErrorCode` → `ChatTransportError` / `ChatTransportErrorCode`); ESLint rule + codemod.
- Reshape `TransportKind` (currently `'auto' | 'api-key' | 'subscription' | 'degraded'`) to a discriminated `ProviderSelection = { provider: 'claude' | 'cursor', mode: 'api' | 'cli' } | { forced: 'auto' | 'degraded' }`.
- `ProviderRegistry` (new domain module) — runtime metadata: id, label, modes, capabilities, model list source.
- `CursorApiAdapter` (new infrastructure module) — fetch-based, no new `HttpPort`, behind feature flag if API surface unstable (Q1).
- `CursorCliAdapter` (new infrastructure module) — subprocess via `CursorBinaryResolver` (sibling of `ClaudeBinaryResolver`).
- New `SECRET_ID_CURSOR` constant in `SecretStorePort`; settings panel surface with secret-store-gated input.
- Multi-thread switcher UI: tab strip in `AgentSidepanelHeader`, per-thread title, rename, delete, fork; persisted via existing `chatThreadsStore`.
- Per-message actions in `MessageList`: copy, regenerate-last, edit-and-resend (the last two interact with `ChatTurnOrchestrator`).
- Status panel: persistent todo list + recent bash output (cap 50 entries, collapsible per entry); new `statusPanelStore` (Pinia, ephemeral).
- Modeline modes: plan (Shift+Tab toggle), bang-bash (`!` prefix), instruction (`#` prefix). Slash and mention dropdowns already exist; this work extends `ChatInput` parsing.
- Model selector — capability-gated per provider; mounted in `AgentSidepanelHeader`.
- Inline file/image attachments — paste, drag-drop, file picker; vault-relative path or transient blob.
- Inline approval cards (Deny / Allow once / Always allow) — replaces the v1 modal-style proposal flow; per-rule persistence in `_storedData.specorator.approvalRules`.
- Settings UX updates: provider selector, Cursor secret-input, Cursor CLI path field, migration banner for legacy `transportKind`.
- Persisted `ChatThreadRecord` migration: `transport: 'api-key' | 'subscription'` → `{ provider, mode }`.
- Removal of any direct `'api-key' | 'subscription'` references in UI components in favour of `ProviderSelection`.

### Out of scope (deferred)

- **Codex / Opencode / ACP providers** — Claudian's other three providers. Single-Cursor scope keeps this feature shippable; the abstraction (`ProviderRegistry`) leaves the door open for v3.
- **Full Vim-key keyboard navigation** — defer to a follow-up a11y feature (issue gate: REQ-MPS-NAV-XX).
- **10-locale i18n** — English only at this stage; existing `src/ui/i18n/locales/en.ts` is extended, no new locales required for this feature.
- **Floating navigation sidebar** (Claudian's section-jumper) — deferred to a follow-up UX increment.
- **Math delimiter escaping during streaming** — defer; existing markdown renderer handles math at message-stable time, which is acceptable for v1.
- **Word-level diffs for Write/Edit tool calls** — defer; current `ToolCallBlock` renders raw payloads, sufficient for v1.
- **Vault-side sidecars under `.specorator/sessions/*.meta.json`** — current implementation uses `_storedData.specorator.chatThreads`; vault-side sidecars are a Claudian artefact, not required for our parity story.
- **Inline-edit modal** (Claudian's selection-cursor editor) — defer; not a sidepanel-parity feature.
- **Removal of legacy `/chat` route in `SpecoratorView`** — flagged in design but not a blocker; tracked as CQ-MPS-02.
- **Multi-agent orchestration** — already out of scope per the predecessor feature (NG7 in PRD-CCS-001).
- **Streaming math / LaTeX preview** — defer.
- **Bang-bash live shell execution** — `!` prefix is recognised as a mode, but actual command execution is gated behind a future ADR; v1 surfaces the mode in UI without dispatching to the OS.

## Why now

The Claudian plugin demonstrates a clearly-superior chat surface, and Specorator users now ask explicitly for Cursor support (issue queue). Doing the rename + provider abstraction once, before adding a third provider, keeps the migration cost linear instead of compounding. The `SecretStorePort` work in REQ-CCS-001's late patch already proved out the storage policy; this feature applies it to a second secret without revisiting the keychain shape.
