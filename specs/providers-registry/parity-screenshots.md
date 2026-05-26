---
id: PARITY-PV-001
title: Providers registry (P9) — parity screenshot matrix
stage: implementation
feature: providers-registry
area: PV
epic: claudian-reboot
phase: P9
owner: dev (baseline scaffold) / human (capture + Specorator column)
reference: D:\Projects\claudian-main
created: 2026-05-26
updated: 2026-05-26
---

# Parity screenshots — Providers registry (P9)

Per T-PV-001 (NFR-PV-009 baseline leg) this is the per-surface × width × theme
matrix the single final epic-review human gate (TEST-PV-M4) fills in. The
**baseline** column captures `D:\Projects\claudian-main`; the **Specorator**
column is filled at the final review (autonomous-drive — no per-phase human
checkpoint). Agents never self-claim a parity row.

Charter widths: **320 / 520 / 720 px**; themes: **light + dark**.

## Baseline reference (claudian-main)

The P9 provider surfaces map to `D:\Projects\claudian-main`:

- **Registry + resolve** — `src/core/providers/ProviderRegistry.ts`:
  - `getRegisteredProviderIds` (`:113-115`) — `Object.keys(this.registrations)`.
  - `getEnabledProviderIds` (`:117-123`) — filter by `isEnabled(settings)` then
    sort ascending by `blankTabOrder`.
  - `getCapabilities` (`:97-99`) / `getProviderDisplayName` (`:125-127`).
  - `createChatRuntime` (`:45-48`) — `providerId ?? DEFAULT_CHAT_PROVIDER_ID` →
    the registration's `createRuntime(options)`.
  - `resolveSettingsProviderId` (`:133-150`) — recorded `settingsProvider` when
    registered AND enabled, else `DEFAULT_CHAT_PROVIDER_ID`, else the first enabled.
  - `resolveProviderForModel` (`:152-183`) — the first registered provider whose
    `chatUIConfig.ownsModel(model, settings)` is true, else the fallback id.
- **Descriptors / capability matrix** — `src/core/providers/types.ts`:
  - `ProviderCapabilities` (`:24-38`) — the capability bag.
  - `DEFAULT_CHAT_PROVIDER_ID = 'claude'` (`:40`).
  - `ProviderRegistration` (`:55-70`) — `displayName` / `blankTabOrder` /
    `isEnabled` / `capabilities` / `createRuntime`.
  - The frozen flags: `src/providers/claude/capabilities.ts` (all-true,
    `supportsTurnSteer:false`), `src/providers/codex/capabilities.ts`
    (`supportsRewind:false` / `supportsProviderCommands:false` /
    `supportsMcpTools:false`, `supportsFork:true` / `supportsTurnSteer:true`),
    `src/providers/opencode/capabilities.ts` (`supportsRewind:false` /
    `supportsFork:false` / `supportsTurnSteer:false` / `supportsMcpTools:false`,
    `supportsProviderCommands:true`); `reasoningControl:'effort'` for all three.
- **Codex transport** — `src/providers/codex/runtime/CodexAppServerProcess.ts` +
  `CodexRpcTransport.ts` — the JSON-RPC-over-stdio, per-request timeout/abort, the
  stderr ring-buffer, SIGTERM→SIGKILL grace.
- **Shared ACP transport** — `src/providers/acp/AcpSubprocess.ts` +
  `AcpJsonRpcTransport.ts` — the line-delimited JSON-RPC 2.0 over stdio.
- **Beyond-vault FS** — `src/core/storage/HomeFileAdapter.ts` — rooted at
  `os.homedir()`.
- **Styling** — `opencode-model-picker.css` (the per-provider model picker) + the
  provider-brand border rules (the active provider colours the tab border).

The blank-tab provider chooser lists only enabled providers in blank-tab order
(opencode 10, codex 15, claude 20), absent when only one is enabled.

Each surface carries a stable `data-testid` in the Specorator port
(`provider-chooser`, `provider-option`, `provider-option-active`, `provider-icon`,
`provider-secret-field`, `toolbar-model`, `toolbar-thinking`,
`toolbar-service-tier`).

## Surface 1 — Provider chooser, > 1 enabled (claude + codex + opencode, blank-tab order)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — blank-tab provider chooser_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 2 — Claude-only, no-chooser seam (P8 byte-identical)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — single-provider composer, no chooser_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 3 — Per-provider model picker (incl. opencode-model-picker)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `opencode-model-picker.css` grouped list_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 4 — Codex toolbar (no rewind / no MCP / no provider-commands, service-tier shown)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — Codex capability-gated toolbar_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 5 — Opencode toolbar (no rewind / fork / steer / MCP, provider-commands shown)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — Opencode capability-gated toolbar_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 6 — Masked secret field + the unavailable-storage disabled state

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — masked field + disabled-with-reason_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 7 — Beyond-vault consent modal

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — beyond-vault consent dialog_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |
