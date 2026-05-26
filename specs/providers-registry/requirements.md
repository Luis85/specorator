---
id: PRD-PV-001
title: Providers registry — Codex (app-server JSON-RPC) + Opencode (ACP) + the provider registry / routing / capabilities / secret-storage / home-fs seams
stage: requirements
feature: providers-registry
area: PV
epic: claudian-reboot
phase: P9
status: accepted
owner: pm
integration_branch: next
inputs:
  - specs/claudian-reboot/parity-charter.md#3.6 (Providers)
  - specs/claudian-reboot/parity-charter.md#4 (P9 row)
  - specs/claudian-reboot/parity-charter.md#6a (HomeFsPort + SecretStore ADR notes + the confirmed capability-gate posture, line 249-252)
  - specs/claudian-reboot/parity-charter.md#6b (scope in/out)
  - specs/claudian-reboot/parity-charter.md#3.10 (opencode-model-picker css)
  - specs/claudian-reboot/parity-charter.md#1 (CHARTER-REQ-SEC secrets, CHARTER-REQ-SET device-local, CHARTER-REQ-FRESH no migration)
  - specs/claudian-reboot/claudian-audit-backend.md (provider runtime / registry / model-routing / capabilities / history / HomeFsPort / SecretStorePort / ACP+JSON-RPC transports)
  - specs/claudian-reboot/claudian-audit-frontend.md#3.5 (toolbar selectors — model/thinking/service-tier; provider-brand tab border §3.2)
  - D:\Projects\claudian-main src/core/providers/{ProviderRegistry,modelRouting,ProviderSettingsCoordinator,providerConfig,types}.ts
  - D:\Projects\claudian-main src/providers/{claude,codex,opencode}/capabilities.ts + registration.ts
  - D:\Projects\claudian-main src/providers/codex/runtime/{CodexAppServerProcess,CodexRpcTransport}.ts + providers/codex/history/CodexHistoryStore.ts
  - D:\Projects\claudian-main src/providers/acp/{AcpSubprocess,AcpJsonRpcTransport}.ts + providers/opencode/*
  - D:\Projects\claudian-main src/core/storage/HomeFileAdapter.ts (beyond-vault FS)
  - specs/providers-registry/workflow-state.md (P9 scope + the BINDING capability-gate posture + the heavy ADR set + epic constraints)
  - What P1–P8 give (additive base): ChatRuntimePort + RuntimeCapabilities + getToolbarCapabilities (P1); ToolbarCatalogPort + model/mode/thinking/service-tier selectors (P6); ProviderHistoryPort (P3); ProviderId = 'claude' (src/domain/chat/ProviderId.ts); device-local settings (ADR-PSR-002)
created: 2026-05-26
updated: 2026-05-26
---

# PRD — Providers registry (P9, the LARGEST phase)

## Summary

P9 turns the single-provider (Claude) chat surface that P1–P8 built into a **multi-provider
surface** by growing four seams on top of the already provider-agnostic `ChatRuntimePort`:
(1) a **provider registry** that lists, selects, and activates a provider and routes a chat
turn to the active provider's `ChatRuntimePort` implementation; (2) a **Codex** provider
runtime over the app-server **JSON-RPC-over-stdio** transport with **JSONL** history reads;
(3) an **Opencode** provider runtime over the shared **ACP** (Agent Client Protocol)
JSON-RPC transport; (4) the **`SecretStorePort`** (provider API keys / auth in Obsidian
**native secret storage**, never `data.json`) and the **`HomeFsPort`** (read-scoped,
consented, beyond-vault reads of `~/.codex` / `~/.claude` transcripts) the non-Claude
providers need. It is built for the Claudian user who runs more than one agent CLI and wants
to pick Codex or Opencode from the same chat surface as Claude.

**This PRD encodes a BINDING posture (charter §6a, confirmed 2026-05-24):** **Claude stays
the COMPLETE default**; **Codex and Opencode ship CAPABILITY-GATED, and feature-incomplete is
ACCEPTABLE** (this matches Claudian's own posture — Claudian itself flags Codex/Opencode "may
be incomplete"). Every Codex/Opencode requirement below states which capabilities are
**P9-backed** vs **honestly gated off** (the established honest-defer pattern). P9 does **NOT**
require full Codex/Opencode parity; it requires that a non-Claude provider either works at a
functional-but-partial level or **honestly reports a reduced capability and degrades without
crashing**. Grounded 1:1 in `claudian-main`'s two registries (`ProviderRegistry` +
`ProviderWorkspaceRegistry`), the frozen per-provider capability bags, the Codex
`CodexAppServerProcess`/`CodexRpcTransport`, the shared `providers/acp` transport, the
`HomeFileAdapter`, and the secret-handling posture. **Additive:** with only Claude configured,
the P0–P8 surface is byte-identical — Claude continues to route through the same
`ChatRuntimePort` it used in P1, the registry simply has one entry.

## Goals

- **G1 — Registry + selection + routing.** List the configured providers, let the user select
  and activate one, and route the active turn to the selected provider's `ChatRuntimePort`
  implementation — provider selection is **data, not branch logic** (mirroring Claudian's
  registry discipline; no `if (provider === 'claude')` scattered through use cases).
- **G2 — Honest per-provider capability matrix.** Each provider reports a frozen capability
  bag; the toolbar/composer/history UI shows or gates each feature strictly from those flags,
  so a non-Claude provider's reduced surface is **honest** rather than broken.
- **G3 — Codex provider (capability-gated).** Connect Codex via the app-server JSON-RPC
  transport and read its JSONL session history, at a functional-but-partial level — backing
  streaming, sessions/history, models, modes, thinking (effort), turn-steer; **gating off**
  rewind, provider slash-commands, and in-app MCP (Codex MCP is CLI-managed).
- **G4 — Opencode provider (capability-gated).** Connect Opencode via the shared ACP
  transport with its modes/models/agents, at a functional-but-partial level — backing
  streaming, sessions/history, models, modes, provider-commands; **gating off** rewind, fork,
  turn-steer, and in-app MCP.
- **G5 — Secret storage (lands this phase).** Store a provider API key / auth secret in
  Obsidian **native secret storage** behind a `SecretStorePort`, **never** in `data.json` or
  plain settings (CHARTER-REQ-SEC); capability-gate the secret surface when native secret
  storage is unavailable.
- **G6 — Beyond-vault reads, scoped + safe.** Read `~/.codex` / `~/.claude` transcripts behind
  a read-scoped, user-consented `HomeFsPort` that **never writes outside the vault
  unexpectedly** and is inert on the non-desktop bridges.
- **G7 — Degrade, never crash.** Selecting a provider with no key, an unavailable transport,
  or a missing CLI surfaces an honest message and leaves the host responsive — never an
  uncaught throw, never a silent failure.
- **G8 — Additivity + every epic constraint.** Claude-only = P0–P8 byte-identical; narrow
  ports + three bridges; Vue never imports `obsidian`/`node:*`; no `v-html`/`window.confirm`;
  `Result<T,E>`; coverage 80/70/80/80 with real transports coverage-excluded; `--sp-*` parity;
  WCAG 2.2 AA; manifest identity unchanged (pending the `secretStorage` `minAppVersion` check).

## Non-goals

- **NG1 — Full Codex/Opencode feature parity.** The BINDING posture (charter §6a) is
  Claude-complete + Codex/Opencode capability-gated. The capabilities each provider **gates
  off** in P9 (Codex: rewind, provider-commands, in-app MCP; Opencode: rewind, fork,
  turn-steer, in-app MCP) are explicitly out of scope and must be honestly reported, not built.
- **NG2 — Per-provider settings UX shell.** Per-provider settings tabs (CLI path, safe-mode,
  custom-model config, agent/skill/subagent settings, env snippets, keyboard nav) are **P10**.
  P9 ships only the minimal provider-selection surface + the secret-entry seam, not the full
  settings shell.
- **NG3 — In-app MCP for Codex/Opencode.** Both report `supportsMcpTools:false`. Codex MCP is
  CLI-managed (charter §6b line 258); P8 already scoped non-Claude MCP out. No MCP UI appears
  for a non-Claude provider.
- **NG4 — Codex skills/subagents + Opencode agents as authored surfaces.** Claudian's Codex
  skills/subagents and Opencode agents are P10 settings surfaces. P9 may *surface* a
  provider's discovered commands/agents read-only through the existing seams where the
  transport returns them, but does not build authoring/CRUD.
- **NG5 — Provider auth beyond CLI/env + native-secret key.** OpenRouter / Kimi compatibility
  and any non-CLI/non-env auth flow are out (charter §6b line 259; CLAR-PV-006 recommends defer).
- **NG6 — Auxiliary services routed per provider.** Routed title-gen / inline-edit /
  instruction-refine per non-Claude provider (Claudian's `RoutedTitleGenerationService`) is
  out; aux services stay Claude-backed in P9 (they are P3/P5 Claude seams). The registry
  exposes the routing hook but P9 does not wire non-Claude aux models.
- **NG7 — i18n sweep (P11) + a11y polish beyond WCAG 2.2 AA (P12).** Only the en (+ de where a
  surface needs it) keys for the new selection/secret surfaces.
- **NG8 — Migration of any legacy provider state** (CHARTER-REQ-FRESH — load-or-default; no
  `.claude/`→`.claudian/` migration; a fresh install starts clean).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Multi-CLI power user (Obsidian, desktop) | Pick Codex or Opencode in the same chat surface as Claude, and have the turn run on the chosen agent | The primary P9 audience; the registry + routing is the whole point |
| Claudian migrant | The provider menu, blank-tab ordering, model-routing, and per-provider toolbar shape read as Claudian | Charter §1 "a Claudian user would recognise immediately" |
| Cautious user | A provider API key never lands in `data.json` (git-shared); a beyond-vault read is consented and read-only | CHARTER-REQ-SEC + the home-dir read is a new security surface (charter §6a ADR) |
| Claude-only user | Adding multi-provider support changes nothing about their experience | Additivity: Claude stays the complete default; their surface is byte-identical to P8 |
| Specorator maintainer | The registry + transports live behind narrow ports; real transports are coverage-excluded infra; additivity holds; the verify gate stays green | Keeps the DDD architecture intact; the real-transport + real-secret legs accumulate for the final epic gate |

## Jobs to be done

- When I run more than one agent CLI, I want to **pick a provider from the chat surface**, so
  I can use Codex or Opencode without leaving Specorator.
- When I select a provider, I want **my turn to run on that provider's runtime**, so the
  agent I picked is the one that answers.
- When a provider can't do something Claude can (e.g. rewind), I want the UI to **honestly
  hide or disable that feature**, so I'm never misled by a control that silently does nothing.
- When I configure a provider, I want to **store its API key securely**, so my key is never
  committed to the git-shared `data.json`.
- When a provider has no key, no CLI, or a dead transport, I want **a clear message and a
  working host**, so one misconfigured provider never breaks my chat.
- When a provider reads its transcript history from my home directory, I want that read to be
  **scoped, consented, and read-only**, so the plugin never touches files I didn't authorise.
- As a Claude-only user, I want **nothing about my experience to change**, so multi-provider
  support costs me nothing.

## Functional requirements (EARS)

> EARS notation per `docs/ears-notation.md` (five patterns: ubiquitous · event-driven (WHEN) ·
> state-driven (WHILE) · optional-feature (WHERE) · unwanted-behaviour (IF/THEN)). One
> requirement per entry, stable ID, a Given/When/Then acceptance criterion, a MoSCoW priority,
> an upstream link + a 1:1 `claudian-main` path, and a future `TEST-PV-*` id. Grouped:
> registry/selection · provider routing · capabilities matrix · Codex provider · Opencode
> provider · ACP transport · model routing · secret storage · home-fs / history · settings &
> selector UI · security · a11y & additivity.

### Registry, selection, activation

#### REQ-PV-001 — List the registered providers
- **Pattern:** event-driven
- **Statement:** *When the chat surface loads, the system SHALL produce the list of registered providers (id, display name, capability bag, blank-tab order) from a single registry — not from branch logic.*
- **Acceptance:**
  - Given the three providers registered (claude, codex, opencode)
  - When the chat surface queries the registry
  - Then it returns each provider's id, display name, capabilities, and order, sourced from the registry data structure (no `if (provider === …)` in the consuming code)
- **Priority:** must
- **Satisfies:** charter §3.6; `ProviderRegistry.getRegisteredProviderIds`/`getProviderDisplayName`/`getCapabilities` (`core/providers/ProviderRegistry.ts:113-127`)
- **Test:** TEST-PV-001

#### REQ-PV-002 — List only the enabled providers, in blank-tab order
- **Pattern:** event-driven
- **Statement:** *When the system lists providers for selection, it SHALL include only providers whose `isEnabled(settings)` is true and SHALL order them by `blankTabOrder` (opencode 10, codex 15, claude 20).*
- **Acceptance:**
  - Given claude + codex enabled and opencode disabled
  - When the system lists selectable providers
  - Then it returns [codex, claude] in that order (opencode omitted), matching the `blankTabOrder` sort
- **Priority:** must
- **Satisfies:** charter §3.6; `getEnabledProviderIds` filter+sort (`ProviderRegistry.ts:117-123`)
- **Test:** TEST-PV-002

#### REQ-PV-003 — Claude is the default provider
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL treat Claude as the default provider — the active provider when no explicit selection is recorded and the resolution fallback when a recorded selection is invalid or disabled.*
- **Acceptance:**
  - Given no recorded provider selection (a fresh session)
  - When the system resolves the active provider
  - Then it resolves to claude (`DEFAULT_CHAT_PROVIDER_ID`); and given a recorded selection that is unknown/disabled it falls back to claude
- **Priority:** must
- **Satisfies:** charter §6a posture (Claude complete default); `resolveSettingsProviderId` (`ProviderRegistry.ts:133-150`); `ProviderId` (`src/domain/chat/ProviderId.ts`)
- **Test:** TEST-PV-003

#### REQ-PV-004 — Select and activate a provider
- **Pattern:** event-driven
- **Statement:** *When the user selects a provider from the selection surface, the system SHALL set it as the active provider for the current thread and persist the selection to device-local settings (never `data.json`).*
- **Acceptance:**
  - Given claude active and codex enabled
  - When the user selects codex
  - Then codex becomes the active provider, the selection persists to the device-local store (CHARTER-REQ-SET), and a subsequent turn routes to codex (REQ-PV-010)
- **Priority:** must
- **Satisfies:** charter §3.6; `settingsProvider`/`resolveSettingsProviderId` (`ProviderRegistry.ts:133`); ADR-PSR-002 device-local settings
- **Test:** TEST-PV-004

#### REQ-PV-005 — Extend `ProviderId` additively to the three providers
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL widen `ProviderId` from `'claude'` to the union `'claude' | 'codex' | 'opencode'`, an additive change that leaves every existing `'claude'` use site valid.*
- **Acceptance:**
  - Given the P1–P8 code that types provider ids as `'claude'`
  - When `ProviderId` is widened
  - Then all existing call sites type-check unchanged and the two new ids become assignable
- **Priority:** must
- **Satisfies:** charter §3.6; `src/domain/chat/ProviderId.ts:5` ("Codex/Opencode = P9"); additivity
- **Test:** TEST-PV-005

#### REQ-PV-006 — A registry with one enabled provider behaves exactly as P8
- **Pattern:** unwanted-behaviour
- **Statement:** *If only Claude is enabled, then the registry, selection surface, and routing SHALL behave byte-identically to P8 — the registry has one entry, no provider menu need be shown, and Claude routes through the same `ChatRuntimePort` path as P1–P8.*
- **Acceptance:**
  - Given only claude enabled
  - When the user chats
  - Then the surface, toolbar, and runtime query diff against P8 is empty (REQ-PV-090) and no multi-provider affordance appears
- **Priority:** must
- **Satisfies:** charter §4 (additive slices); charter §6a (Claude complete default); ADR-CC additivity
- **Test:** TEST-PV-006

### Provider routing

#### REQ-PV-010 — Route the active turn to the active provider's runtime
- **Pattern:** event-driven
- **Statement:** *When the user sends a turn, the system SHALL obtain the active provider's `ChatRuntimePort` implementation from the registry and run the turn through it — the existing P1 chat turn flow, parameterised by provider.*
- **Acceptance:**
  - Given codex is the active provider
  - When the user sends a turn
  - Then the registry yields codex's `ChatRuntimePort` implementation and the turn streams through it via the unchanged P1 turn flow
- **Priority:** must
- **Satisfies:** charter §3.6; `ProviderRegistry.createChatRuntime({providerId})` (`ProviderRegistry.ts:45-48`); P1 `ChatRuntimePort.query`
- **Test:** TEST-PV-010

#### REQ-PV-011 — Constructing a provider runtime returns a Result
- **Pattern:** unwanted-behaviour
- **Statement:** *If constructing the active provider's runtime fails (provider not registered, workspace not initialised, transport unavailable), then the system SHALL return a `Result.err` and SHALL NOT throw across the port boundary.*
- **Acceptance:**
  - Given an unregistered or uninitialised provider
  - When the system constructs its runtime
  - Then it returns `Result.err` with a human-readable reason and no exception escapes
- **Priority:** must
- **Satisfies:** charter §6a; `createChatRuntime` throw path (`ProviderRegistry.ts:37-43`) → `Result` per audit (`claudian-audit-backend.md:159-163`); ADR-004
- **Test:** TEST-PV-011

#### REQ-PV-012 — Switching the active provider rebuilds the runtime seam
- **Pattern:** event-driven
- **Statement:** *When the active provider changes, the system SHALL tear down the prior provider's runtime session and construct the newly active provider's runtime before the next turn, so a turn never runs on a stale provider.*
- **Acceptance:**
  - Given an in-progress claude session and the user switches to codex
  - When the next turn is sent
  - Then the claude runtime is reset and the turn runs on a freshly constructed codex runtime (no cross-provider session leakage)
- **Priority:** must
- **Satisfies:** charter §3.6; provider warmup on tab/provider change (`tabs/TabManager.ts` provider resolution); P1 `ChatRuntimePort.resetSession`
- **Test:** TEST-PV-012

#### REQ-PV-013 — Routing branches on capability flags, not provider id
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL gate provider-varying behaviour (toolbar widgets, rewind/fork/steer affordances, MCP UI, history) on the active provider's capability flags, not on its id, so adding a provider needs no new `switch (id)`.*
- **Acceptance:**
  - Given any active provider
  - When the system decides whether to show rewind / fork / MCP / steer
  - Then the decision reads the capability bag (REQ-PV-020) and there is no provider-id branch in the consuming use case
- **Priority:** must
- **Satisfies:** charter §3.6; the registry "selection is data not branch logic" discipline (`claudian-audit-backend.md:49-52`); P1 `RuntimeCapabilities`/`getToolbarCapabilities`
- **Test:** TEST-PV-013

### Per-provider capability matrix

#### REQ-PV-020 — Each provider exposes a frozen capability bag
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL expose, per provider, a frozen capability bag carrying at least `supportsPersistentRuntime`, `supportsNativeHistory`, `supportsPlanMode`, `supportsRewind`, `supportsFork`, `supportsProviderCommands`, `supportsImageAttachments`, `supportsInstructionMode`, `supportsMcpTools`, `supportsTurnSteer`, and `reasoningControl` — surfaced through the registry as plain data.*
- **Acceptance:**
  - Given the registry
  - When a consumer reads a provider's capabilities
  - Then it gets the frozen flag bag matching the claudian per-provider values (REQ-PV-021/022/023)
- **Priority:** must
- **Satisfies:** charter §3.6; `ProviderCapabilities` + per-provider `capabilities.ts`; `ProviderRegistry.getCapabilities` (`ProviderRegistry.ts:97`)
- **Test:** TEST-PV-020

#### REQ-PV-021 — Claude capability flags (the complete default)
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL report Claude's capabilities as all-supported: persistent runtime, native history, plan mode, rewind, fork, provider commands, image attachments, instruction mode, MCP tools, reasoning `effort`; turn-steer false.*
- **Acceptance:**
  - Given the claude provider
  - When its capability bag is read
  - Then it matches `{ supportsRewind:true, supportsFork:true, supportsProviderCommands:true, supportsMcpTools:true, supportsTurnSteer:false, reasoningControl:'effort', … all-true }`
- **Priority:** must
- **Satisfies:** charter §6a (Claude complete); `CLAUDE_PROVIDER_CAPABILITIES` (`providers/claude/capabilities.ts:3-17`)
- **Test:** TEST-PV-021

#### REQ-PV-022 — Codex capability flags (backed vs gated)
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL report Codex's capabilities as: BACKED — persistent runtime, native history, plan mode, fork, image attachments, instruction mode, turn-steer, reasoning `effort`; GATED OFF — rewind (false), provider commands (false), MCP tools (false).*
- **Acceptance:**
  - Given the codex provider
  - When its capability bag is read
  - Then it matches `{ supportsRewind:false, supportsProviderCommands:false, supportsMcpTools:false, supportsTurnSteer:true, supportsFork:true, reasoningControl:'effort', … }` and the gated-off features are hidden/disabled in the UI (REQ-PV-024)
- **Priority:** must
- **Satisfies:** charter §6a posture; `CODEX_PROVIDER_CAPABILITIES` (`providers/codex/capabilities.ts:3-16`)
- **Test:** TEST-PV-022

#### REQ-PV-023 — Opencode capability flags (backed vs gated)
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL report Opencode's capabilities as: BACKED — persistent runtime, native history, plan mode, provider commands, image attachments, instruction mode, reasoning `effort`; GATED OFF — rewind (false), fork (false), turn-steer (false), MCP tools (false).*
- **Acceptance:**
  - Given the opencode provider
  - When its capability bag is read
  - Then it matches `{ supportsRewind:false, supportsFork:false, supportsTurnSteer:false, supportsProviderCommands:true, supportsMcpTools:false, reasoningControl:'effort', … }` and the gated-off features are hidden/disabled (REQ-PV-024)
- **Priority:** must
- **Satisfies:** charter §6a posture; `OPENCODE_PROVIDER_CAPABILITIES` (`providers/opencode/capabilities.ts:3-16`)
- **Test:** TEST-PV-023

#### REQ-PV-024 — A capability-gated control is hidden or disabled, never silently inert
- **Pattern:** state-driven
- **Statement:** *While the active provider reports a capability as false, the system SHALL hide (or visibly disable with an accessible reason) the affordance for that capability — a rewind/fork/steer/MCP control SHALL NOT appear clickable-but-dead.*
- **Acceptance:**
  - Given codex active (rewind:false, MCP:false)
  - When the chat surface and toolbar render
  - Then the rewind affordance and the MCP selector are absent (or disabled with a reason), matching the capability-driven discipline; no control silently does nothing
- **Priority:** must
- **Satisfies:** charter §3.6 honest-defer; `claudian-audit-backend.md:124-129` (capabilities drive UI); P6 `getToolbarCapabilities`; `claudian-audit-frontend.md:149` (fork capability-gated)
- **Test:** TEST-PV-024

#### REQ-PV-025 — A provider with a missing/partial capability degrades honestly mid-turn
- **Pattern:** unwanted-behaviour
- **Statement:** *If the active provider lacks a capability the user attempts to invoke through a still-visible path (e.g. a slash command targeting an unsupported feature), then the system SHALL surface an honest "not supported by <provider>" notice and continue, rather than crash or pretend success.*
- **Acceptance:**
  - Given opencode active (fork:false) and a `/fork` attempt
  - When the user invokes it
  - Then a non-blocking notice reports fork is unsupported for opencode and the session continues unchanged
- **Priority:** should
- **Satisfies:** charter §3.6 honest-defer; capability-gated discipline; `FeedbackService`/NotificationPort
- **Test:** TEST-PV-025

### Codex provider (capability-gated)

#### REQ-PV-030 — Connect Codex via the app-server JSON-RPC transport
- **Pattern:** event-driven
- **Statement:** *When Codex is the active provider and a session is needed, the system SHALL start the Codex app-server as a Node subprocess and communicate with it over the line-delimited JSON-RPC-over-stdio transport.*
- **Acceptance:**
  - Given codex active and a turn to send
  - When the system ensures the runtime is ready
  - Then it spawns the Codex app-server and establishes the JSON-RPC stdio channel before streaming the turn
- **Priority:** must
- **Satisfies:** charter §3.6; `CodexAppServerProcess.ts` (app-server JSON-RPC over stdio) + `CodexRpcTransport.ts` (`claudian-audit-backend.md:564-570`)
- **Test:** TEST-PV-030 (manual real-transport leg TEST-PV-M1)

#### REQ-PV-031 — Codex spawns safely on Windows (.cmd shell-quoting)
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL spawn the Codex app-server with correct Windows `.cmd` handling (`cmd.exe /d /s /c`, `windowsVerbatimArguments`, `windowsHide`), so a Windows host launches Codex without a shell-quoting failure.*
- **Acceptance:**
  - Given a Windows host with a `.cmd` Codex launcher
  - When the system spawns it
  - Then the spawn uses the documented Windows quoting and the process starts without an arg-mangling error
- **Priority:** must
- **Satisfies:** charter §1 desktop-only; `CodexAppServerProcess` Windows `.cmd` quoting (`claudian-audit-backend.md:565-566`)
- **Test:** TEST-PV-031 (manual real-transport leg TEST-PV-M1)

#### REQ-PV-032 — Codex reads its JSONL session history (capability-gated)
- **Pattern:** event-driven
- **Statement:** *When Codex history is requested for a conversation, the system SHALL read and parse the Codex JSONL session file(s) from the Codex sessions root (via `HomeFsPort`) into the provider-neutral history shape the P3 `ProviderHistoryPort` consumes.*
- **Acceptance:**
  - Given a Codex session with a JSONL session file under the Codex sessions root
  - When history is hydrated
  - Then the JSONL turns parse into the P3 history shape and resume picks up the exact session
- **Priority:** must
- **Satisfies:** charter §3.6; `CodexHistoryStore.ts` (`parseCodexSessionFile/Turns`, `deriveCodexSessionsRoot`, `findCodexSessionFile`) (`claudian-audit-backend.md:200-202`); P3 `ProviderHistoryPort`
- **Test:** TEST-PV-032 (manual real-transport leg TEST-PV-M1)

#### REQ-PV-033 — Codex turn-steer mid-turn (backed)
- **Pattern:** optional-feature
- **Statement:** *Where the active provider is Codex (which reports `supportsTurnSteer:true`), the system SHALL allow steering an in-progress turn through the runtime's steer path, so the queued/steer composer affordance is functional for Codex.*
- **Acceptance:**
  - Given codex active and an in-progress turn
  - When the user steers
  - Then the steer message is injected via the Codex runtime's steer path and the steer composer affordance is enabled
- **Priority:** should
- **Satisfies:** charter §3.6; `supportsTurnSteer:true` (`providers/codex/capabilities.ts:14`); P1 `ChatRuntimePort.steer?`; `claudian-audit-frontend.md:181`
- **Test:** TEST-PV-033 (manual real-transport leg TEST-PV-M1)

#### REQ-PV-034 — Codex rewind / provider-commands / MCP are gated off (honest defer)
- **Pattern:** unwanted-behaviour
- **Statement:** *If a user is on Codex, then the system SHALL NOT present rewind, provider slash-commands, or an in-app MCP surface — these are honestly reported unsupported (capability flags false), not built in P9.*
- **Acceptance:**
  - Given codex active
  - When the chat surface and toolbar render
  - Then no rewind affordance, no provider-command palette entries, and no MCP selector appear (per REQ-PV-022/024)
- **Priority:** must
- **Satisfies:** charter §6a posture (feature-incomplete acceptable); `supportsRewind:false`/`supportsProviderCommands:false`/`supportsMcpTools:false` (`providers/codex/capabilities.ts:8,10,13`)
- **Test:** TEST-PV-034

#### REQ-PV-035 — A Codex subprocess shuts down gracefully and is cancelable
- **Pattern:** event-driven
- **Statement:** *When a Codex turn is cancelled or the session is reset, the system SHALL stop the in-flight RPC request and shut the subprocess down gracefully (terminate, escalating to kill on timeout) without leaking a process or crashing the host.*
- **Acceptance:**
  - Given a streaming Codex turn
  - When the user cancels
  - Then the RPC request aborts, the subprocess is terminated (kill on timeout), and the host stays responsive
- **Priority:** should
- **Satisfies:** charter §3.6; `CodexAppServerProcess` lifecycle + `AcpSubprocess` SIGTERM→SIGKILL pattern (`claudian-audit-backend.md:567-570`); P1 `ChatRuntimePort.cancel`
- **Test:** TEST-PV-035 (manual real-transport leg TEST-PV-M1)

### Opencode provider (capability-gated)

#### REQ-PV-040 — Connect Opencode via the shared ACP transport
- **Pattern:** event-driven
- **Statement:** *When Opencode is the active provider and a session is needed, the system SHALL start the Opencode agent as a Node subprocess and communicate over the shared ACP (Agent Client Protocol) line-delimited JSON-RPC-over-stdio transport.*
- **Acceptance:**
  - Given opencode active and a turn to send
  - When the system ensures the runtime is ready
  - Then it spawns the Opencode agent and establishes the ACP JSON-RPC stdio channel before streaming
- **Priority:** must
- **Satisfies:** charter §3.6; `providers/acp/AcpSubprocess.ts` + `AcpJsonRpcTransport.ts` (`claudian-audit-backend.md:567-570`); opencode registration
- **Test:** TEST-PV-040 (manual real-transport leg TEST-PV-M2)

#### REQ-PV-041 — Opencode modes + models + agents (backed)
- **Pattern:** event-driven
- **Statement:** *When Opencode is active, the system SHALL surface its ACP-reported modes, models, and agents so the P6 mode/model selectors and the provider-commands palette show real Opencode options.*
- **Acceptance:**
  - Given opencode active with ACP-reported modes/models
  - When the user opens the mode and model selectors
  - Then they list Opencode's modes and models, and provider commands (agents) are available (`supportsProviderCommands:true`)
- **Priority:** should
- **Satisfies:** charter §3.6; opencode modes/models/agents via ACP (`claudian-audit-backend.md:202,212`); `supportsProviderCommands:true` (`providers/opencode/capabilities.ts:10`); P6 `ToolbarCatalogPort`
- **Test:** TEST-PV-041 (manual real-transport leg TEST-PV-M2)

#### REQ-PV-042 — Opencode history via ACP loadSession/listSessions (capability-gated)
- **Pattern:** event-driven
- **Statement:** *When Opencode history is requested, the system SHALL hydrate it via the ACP `loadSession`/`listSessions` calls into the provider-neutral P3 history shape.*
- **Acceptance:**
  - Given an Opencode session
  - When history is hydrated
  - Then ACP `loadSession` returns the turns mapped into the P3 history shape and resume works
- **Priority:** should
- **Satisfies:** charter §3.6; `OpencodeConversationHistoryService` via ACP `loadSession`/`listSessions` (`claudian-audit-backend.md:202,212`); P3 `ProviderHistoryPort`
- **Test:** TEST-PV-042 (manual real-transport leg TEST-PV-M2)

#### REQ-PV-043 — Opencode rewind / fork / steer / MCP are gated off (honest defer)
- **Pattern:** unwanted-behaviour
- **Statement:** *If a user is on Opencode, then the system SHALL NOT present rewind, fork, turn-steer, or an in-app MCP surface — these are honestly reported unsupported (capability flags false), not built in P9.*
- **Acceptance:**
  - Given opencode active
  - When the chat surface and toolbar render
  - Then no rewind, no fork button, no steer affordance, and no MCP selector appear (per REQ-PV-023/024)
- **Priority:** must
- **Satisfies:** charter §6a posture; `supportsRewind:false`/`supportsFork:false`/`supportsTurnSteer:false`/`supportsMcpTools:false` (`providers/opencode/capabilities.ts:8,9,14,13`)
- **Test:** TEST-PV-043

#### REQ-PV-044 — An Opencode ACP subprocess shuts down gracefully and is cancelable
- **Pattern:** event-driven
- **Statement:** *When an Opencode turn is cancelled or the session is reset, the system SHALL abort the in-flight ACP request and shut the subprocess down gracefully (SIGTERM, escalating to SIGKILL after a bounded grace period) without leaking a process.*
- **Acceptance:**
  - Given a streaming Opencode turn
  - When the user cancels
  - Then the ACP request aborts and the subprocess terminates (SIGTERM→SIGKILL on a 3s timeout) with the host responsive
- **Priority:** should
- **Satisfies:** charter §3.6; `AcpSubprocess` SIGTERM→SIGKILL(3s) + stderr ring-buffer (`claudian-audit-backend.md:567-569`); P1 `ChatRuntimePort.cancel`
- **Test:** TEST-PV-044 (manual real-transport leg TEST-PV-M2)

### ACP transport (shared)

#### REQ-PV-050 — Line-delimited JSON-RPC 2.0 over stdio
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL implement the shared ACP transport as line-delimited JSON-RPC 2.0 over stdio supporting client→server requests (with timeout + abort), notifications, and server→client request handlers.*
- **Acceptance:**
  - Given the ACP transport and a connected agent
  - When the system issues a request, a notification, and receives a server→client request
  - Then each frame is a single newline-delimited JSON-RPC 2.0 message, requests carry a timeout + abort, and server requests are dispatched to a registered handler
- **Priority:** must
- **Satisfies:** charter §3.6; `AcpJsonRpcTransport.ts` (line-delimited JSON-RPC 2.0 over stdio) (`claudian-audit-backend.md:568-570`)
- **Test:** TEST-PV-050 (Mock-scriptable; manual real leg TEST-PV-M2)

#### REQ-PV-051 — A transport request that times out aborts and returns a Result
- **Pattern:** unwanted-behaviour
- **Statement:** *If an ACP (or Codex RPC) request does not resolve within its timeout, then the system SHALL abort the request and return a `Result.err` carrying a timeout reason, without leaving a dangling promise or crashing the transport.*
- **Acceptance:**
  - Given a request to an unresponsive agent
  - When the timeout elapses
  - Then the request aborts and resolves to `Result.err` with a timeout message; the transport stays usable for subsequent requests
- **Priority:** must
- **Satisfies:** charter §3.6; `AcpJsonRpcTransport` request timeout+abort (`claudian-audit-backend.md:568`); ADR-004
- **Test:** TEST-PV-051

#### REQ-PV-052 — A transport that dies mid-stream surfaces an error chunk, not a crash
- **Pattern:** unwanted-behaviour
- **Statement:** *If the agent subprocess exits or the stdio pipe breaks during a streaming turn, then the system SHALL yield a terminal error `StreamChunk` (the P1 error-chunk variant) and end the stream cleanly rather than throwing out of the generator.*
- **Acceptance:**
  - Given a streaming turn whose subprocess dies
  - When the pipe breaks
  - Then the stream emits an error chunk (with the captured stderr ring-buffer detail) and completes; the host stays responsive
- **Priority:** must
- **Satisfies:** charter §3.6; `AcpSubprocess` stderr ring-buffer + close/exit listeners (`claudian-audit-backend.md:567-569`); P1 `StreamChunk` error variant (`claudian-audit-backend.md:90-96`)
- **Test:** TEST-PV-052

#### REQ-PV-053 — A scriptable Mock transport carries the automated coverage
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL provide a scriptable Mock implementation of the ACP/Codex transports on the Mock bridge (canned request/response + scripted stream), so the registry, routing, capability, and history logic are unit-testable without a real subprocess.*
- **Acceptance:**
  - Given the Mock bridge
  - When a test drives a Codex/Opencode turn
  - Then a scripted transport yields the canned stream and the logic under test runs without spawning a process
- **Priority:** must
- **Satisfies:** charter §6c; ADR-008 3-bridge discipline; `MockBridge` scripted-runtime pattern (`claudian-audit-backend.md:97-100`)
- **Test:** TEST-PV-053

### Model routing

#### REQ-PV-060 — A model id routes to its owning provider
- **Pattern:** event-driven
- **Statement:** *When a model is selected or set, the system SHALL resolve the owning provider by asking each provider whether it owns the model (`ownsModel`), so choosing a model auto-selects its provider.*
- **Acceptance:**
  - Given a Codex-owned model id and claude currently active
  - When the model is selected
  - Then `resolveProviderForModel` returns codex and the active provider switches to codex (REQ-PV-004)
- **Priority:** must
- **Satisfies:** charter §3.6; `resolveProviderForModel` + `ownsModel` (`ProviderRegistry.ts:152-183`); `core/providers/modelRouting.ts`
- **Test:** TEST-PV-060

#### REQ-PV-061 — An unowned model falls back to the active/default provider
- **Pattern:** unwanted-behaviour
- **Statement:** *If no provider claims a given model, then the system SHALL fall back to the configured fallback provider (the active settings provider, else Claude) rather than failing.*
- **Acceptance:**
  - Given a model id no provider owns
  - When the system resolves its provider
  - Then it returns the fallback (active settings provider, else claude) with no error
- **Priority:** must
- **Satisfies:** charter §3.6; `resolveProviderForModel` fallback (`ProviderRegistry.ts:163-182`)
- **Test:** TEST-PV-061

#### REQ-PV-062 — The model selector lists the active provider's models
- **Pattern:** state-driven
- **Statement:** *While a provider is active, the P6 model selector SHALL list that provider's model options (with group headers and the provider icon), replacing the P6 Claude-only seam with the active provider's real catalog.*
- **Acceptance:**
  - Given codex active
  - When the user opens the model selector
  - Then it lists codex's models (grouped, with the codex provider icon) sourced from codex's chat-UI config; switching to claude lists claude's models
- **Priority:** must
- **Satisfies:** charter §3.5/§3.6; `ProviderChatUIConfig` model list (`claudian-audit-backend.md:166-186`); P6 `ToolbarCatalogPort`; `claudian-audit-frontend.md:283-289`; charter §3.10 `opencode-model-picker` css
- **Test:** TEST-PV-062

#### REQ-PV-063 — The reasoning (thinking) selector reflects the provider's reasoning control
- **Pattern:** state-driven
- **Statement:** *While a provider is active, the P6 thinking selector SHALL present that provider's reasoning options per its `reasoningControl` (`effort` for all three providers in P9) and SHALL auto-hide when reasoning control is `none` or a single option.*
- **Acceptance:**
  - Given codex active (`reasoningControl:'effort'`)
  - When the user opens the thinking selector
  - Then it shows codex's effort options; given a provider/model with `reasoningControl:'none'` the selector is hidden
- **Priority:** should
- **Satisfies:** charter §3.5; `reasoningControl` (per-provider `capabilities.ts:15`); `claudian-audit-frontend.md:299-305`; P6 thinking selector
- **Test:** TEST-PV-063

#### REQ-PV-064 — The service-tier toggle is provider-gated (Codex-only in P9)
- **Pattern:** optional-feature
- **Statement:** *Where the active provider configures a service-tier toggle (Codex fast-mode), the system SHALL show the service-tier control; otherwise it SHALL hide it.*
- **Acceptance:**
  - Given codex active with a service-tier toggle config
  - When the toolbar renders
  - Then the `zap` service-tier toggle appears; given claude/opencode (no toggle config) it is absent
- **Priority:** could
- **Satisfies:** charter §3.5; `ServiceTierToggle` Codex fast-mode (`claudian-audit-frontend.md:307-313`)
- **Test:** TEST-PV-064

### Secret storage (lands this phase)

#### REQ-PV-070 — Store a provider secret in native secret storage, never data.json
- **Pattern:** event-driven
- **Statement:** *When the user enters a provider API key / auth secret, the system SHALL persist it through a `SecretStorePort` backed by Obsidian native secret storage (`app.secretStorage`) and SHALL NOT write it to `data.json` or any plain settings store.*
- **Acceptance:**
  - Given the secret-entry surface and a typed key
  - When the user saves
  - Then the key is written via `SecretStorePort.setSecret` into native secret storage and a read of `data.json` (and the device-local settings) contains no secret value
- **Priority:** must
- **Satisfies:** charter §1 CHARTER-REQ-SEC + §6a (secrets RESOLVED → `SecretStorePort` + `app.secretStorage`); audit secret-handling decision (`claudian-audit-backend.md:606,629-631`)
- **Test:** TEST-PV-070 (manual real-secret leg TEST-PV-M3)

#### REQ-PV-071 — Read a provider secret for the runtime env without exposing it to the UI
- **Pattern:** event-driven
- **Statement:** *When a provider runtime needs a secret (API key) for its environment, the system SHALL fetch it through `SecretStorePort.getSecret` at the infrastructure boundary and inject it into the subprocess env, and SHALL NOT pass the secret value into the Vue/UI layer or a Pinia store.*
- **Acceptance:**
  - Given a stored provider key and a turn
  - When the runtime spawns
  - Then the key is read at the infrastructure boundary and placed in the child env; no store/DTO/notice/log carries the value
- **Priority:** must
- **Satisfies:** charter §1; `SecretStorePort.getSecret` (audit ports table `claudian-audit-backend.md:606`); ADR-003 (no domain/secret across the store boundary)
- **Test:** TEST-PV-071

#### REQ-PV-072 — Capability-gate the secret surface when native secret storage is unavailable
- **Pattern:** unwanted-behaviour
- **Statement:** *If Obsidian native secret storage (`app.secretStorage`) is unavailable at runtime, then the system SHALL disable the secret-entry surface with an honest message and SHALL NOT fall back to writing the secret into `data.json` or plain settings.*
- **Acceptance:**
  - Given a runtime where `app.secretStorage` is unavailable
  - When the user opens the secret surface
  - Then it is disabled with a clear "secret storage unavailable" message and no plain-store fallback occurs
- **Priority:** must
- **Satisfies:** charter §1/§6a (capability-gate when unavailable); CHARTER-REQ-SEC; the `minAppVersion` check (CLAR-PV-004)
- **Test:** TEST-PV-072

#### REQ-PV-073 — No secret crosses the bridge boundary into the demo bridges
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL implement `SecretStorePort` with an in-memory (non-persistent) stub on the Mock and LocalStorage bridges, so the GitHub Pages demo and unit tests never read or write a real secret.*
- **Acceptance:**
  - Given the Mock or LocalStorage bridge
  - When `SecretStorePort` is exercised
  - Then it uses an in-memory map (cleared per session), and no real OS/native secret is touched
- **Priority:** must
- **Satisfies:** charter §6c; ADR-008 3-bridge discipline; `SecretStorePort` Mock/LocalStorage = in-memory (`claudian-audit-backend.md:606`)
- **Test:** TEST-PV-073

### Home-fs + beyond-vault history

#### REQ-PV-080 — Read beyond-vault transcripts through a read-scoped HomeFsPort
- **Pattern:** event-driven
- **Statement:** *When a provider needs to read its home-directory transcripts (`~/.codex`, `~/.claude`), the system SHALL do so through a `HomeFsPort` rooted at the user's home directory, exposing read operations (`readFile`, `exists`, `listFolders`) for the provider history paths.*
- **Acceptance:**
  - Given codex active with sessions under `~/.codex`
  - When history hydrates
  - Then the read goes through `HomeFsPort` (rooted at `os.homedir()`), not through `VaultPort`, and returns the JSONL content (REQ-PV-032)
- **Priority:** must
- **Satisfies:** charter §6a (`HomeFsPort` needs an ADR); `HomeFileAdapter` (`core/storage/HomeFileAdapter.ts`); audit `HomeFsPort` (`claudian-audit-backend.md:602,626-628`)
- **Test:** TEST-PV-080 (manual real-fs leg TEST-PV-M1/M2)

#### REQ-PV-081 — HomeFsPort never writes outside the vault unexpectedly
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL restrict `HomeFsPort` to the specific provider transcript/config roots required for P9 (`~/.codex`, `~/.claude`) for reads, and SHALL NOT use it to write or delete files outside the vault unless an explicit, user-consented provider operation requires it.*
- **Acceptance:**
  - Given P9's beyond-vault needs
  - When the home-fs surface is exercised
  - Then only the declared provider roots are read; no write/delete to an arbitrary home-dir path occurs, and any write that a provider genuinely needs is scoped + consented (REQ-PV-082)
- **Priority:** must
- **Satisfies:** charter §6a (security surface: reads outside the vault); audit "reads outside the vault" (`claudian-audit-backend.md:234,628`)
- **Test:** TEST-PV-081

#### REQ-PV-082 — Beyond-vault access is user-consented
- **Pattern:** event-driven
- **Statement:** *When a provider first requires beyond-vault home-directory access, the system SHALL obtain the user's consent (a one-time acknowledgement) before reading, and SHALL record the consent so the prompt is not repeated.*
- **Acceptance:**
  - Given a first-time codex/opencode activation requiring home-dir reads
  - When access is needed
  - Then the user is asked to consent to beyond-vault reads once; declining disables that provider's history with an honest message; consent persists (device-local)
- **Priority:** should
- **Satisfies:** charter §6a (user-consented beyond-vault reads); workflow-state P9 security requirement (`workflow-state.md:74-76`)
- **Test:** TEST-PV-082

#### REQ-PV-083 — HomeFsPort is inert on the non-desktop bridges
- **Pattern:** state-driven
- **Statement:** *While running on the Mock or LocalStorage bridge, the system SHALL implement `HomeFsPort` as an in-memory/no-op stub returning empty/absent results, so `npm run dev` and the GitHub Pages demo never touch the real filesystem.*
- **Acceptance:**
  - Given the Mock or LocalStorage bridge
  - When `HomeFsPort` is read
  - Then it returns in-memory fixtures or empty/absent, with no `node:fs` call
- **Priority:** must
- **Satisfies:** charter §6c; ADR-008 3-bridge discipline; `HomeFsPort` Mock/LocalStorage = in-memory/no-op (`claudian-audit-backend.md:602,628-230`)
- **Test:** TEST-PV-083

#### REQ-PV-084 — Provider history plugs into the P3 ProviderHistoryPort
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL route Codex and Opencode history through the existing P3 `ProviderHistoryPort` contract (`hydrate`, `delete`, `resolveSessionId`, `listSessions`, `buildForkState`), so resume/history/fork work the same across providers (subject to each provider's capabilities).*
- **Acceptance:**
  - Given a Codex or Opencode conversation
  - When history/resume runs
  - Then it goes through the P3 `ProviderHistoryPort` with the provider-native store behind it (Codex JSONL / Opencode ACP); fork is offered only where `supportsFork` is true
- **Priority:** must
- **Satisfies:** charter §3.6; P3 `ProviderHistoryPort` (`claudian-audit-backend.md:219-226`); `ProviderConversationHistoryService` (`claudian-audit-backend.md:204-213`)
- **Test:** TEST-PV-084

### Settings + selector UI

#### REQ-PV-090 — A minimal provider-selection surface (not the full settings shell)
- **Pattern:** event-driven
- **Statement:** *When more than one provider is enabled, the system SHALL present a minimal provider-selection affordance (a provider menu / blank-tab provider chooser) listing the enabled providers in blank-tab order with their display names and icons — deferring the full per-provider settings shell to P10.*
- **Acceptance:**
  - Given claude + codex + opencode enabled
  - When the user opens the new-thread / provider chooser
  - Then it lists the three providers in blank-tab order with display name + provider icon; selecting one activates it (REQ-PV-004); the full settings tabs are absent (NG2)
- **Priority:** must
- **Satisfies:** charter §4 (P9 ships the seams + a minimal selection surface; P10 = settings shell) (`workflow-state.md:82-83`); `getEnabledProviderIds`/`getProviderDisplayName`; charter §3.2 provider-brand tab border
- **Test:** TEST-PV-090

#### REQ-PV-091 — The provider/model surfaces render through `--sp-*` tokens
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL render the provider-selection surface and the per-provider model picker through `--sp-*` design tokens — mapping Claudian's `opencode-model-picker` and provider-icon/brand styling — with no raw Obsidian variable or physical-direction CSS leaking into the components.*
- **Acceptance:**
  - Given the provider/model picker components
  - When the token guard runs
  - Then every Claudian `opencode-model-picker` and provider-brand value resolves to a `--sp-*` token and `lint-style-tokens` passes
- **Priority:** must
- **Satisfies:** charter §3.10 (`opencode-model-picker` css), §5.4; the AUX `lint-style-tokens` guard
- **Test:** TEST-PV-091

#### REQ-PV-092 — A minimal secret-entry field for an enabled provider's key
- **Pattern:** event-driven
- **Statement:** *When a provider that needs an API key is enabled, the system SHALL present a minimal secret-entry field (masked input, no value echoed) wired to `SecretStorePort` (REQ-PV-070), without building the full P10 provider settings shell.*
- **Acceptance:**
  - Given an enabled provider requiring a key
  - When the user opens the secret field
  - Then a masked input persists the key to native secret storage on save and never renders the stored value back into the DOM
- **Priority:** should
- **Satisfies:** charter §1 CHARTER-REQ-SEC; Obsidian `SecretComponent` (charter §1 line 60); REQ-PV-070
- **Test:** TEST-PV-092

### Security

#### REQ-PV-100 — A provider with no key / dead transport degrades, never crashes
- **Pattern:** unwanted-behaviour
- **Statement:** *If the user activates a provider that has no stored key, no resolvable CLI, or an unavailable transport, then the system SHALL surface a clear, actionable message and leave the host responsive — never an uncaught throw and never a silent no-op.*
- **Acceptance:**
  - Given codex selected with no Codex CLI on PATH (or no key)
  - When the user sends a turn
  - Then a clear notice explains what is missing (e.g. "Codex CLI not found" / "API key required"), the turn does not start, and the chat surface stays usable
- **Priority:** must
- **Satisfies:** charter §6a posture (degrade honestly, never crash); `getMissingNodeError`/CLI resolver (`claudian-audit-backend.md:574-576`); `Result`-returning ports
- **Test:** TEST-PV-100 (manual real-transport leg TEST-PV-M1/M2)

#### REQ-PV-101 — A subprocess spawns with a bounded, explicit environment
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL spawn a provider subprocess (Codex app-server, Opencode ACP agent) with an explicit environment — process env merged with the provider's resolved secret/env and an enhanced `PATH` — and SHALL NOT shell-evaluate user input.*
- **Acceptance:**
  - Given a provider spawn
  - When the subprocess starts
  - Then its env is `{ ...process.env, <provider secret/env>, PATH: enhancedPath }`, the command/args are explicitly resolved (no `shell:true` string-eval), and `windowsHide` is set
- **Priority:** must
- **Satisfies:** charter §1 security; `getEnhancedPath`/`customSpawn`/`CodexAppServerProcess` (`claudian-audit-backend.md:558-576`)
- **Test:** TEST-PV-101 (manual real-transport leg TEST-PV-M1/M2)

#### REQ-PV-102 — A secret never appears in a notice, log, or DTO
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL keep provider secret values out of every `NotificationPort` message, `LoggerPort` line, Pinia store, and DTO — a failure that involves a key SHALL report the failure without echoing the key.*
- **Acceptance:**
  - Given a runtime failure while a key is configured
  - When the failure surfaces
  - Then the notice/log states the failure (e.g. "authentication failed") with no key/secret substring; no store/DTO carries the value
- **Priority:** must
- **Satisfies:** charter §1 CHARTER-REQ-SEC; `FeedbackService`/LoggerPort split (CLAUDE.md ports); REQ-PV-071
- **Test:** TEST-PV-102

#### REQ-PV-103 — The user explicitly enables and selects every non-default provider
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL NOT auto-enable, auto-select, auto-spawn, or auto-authenticate a non-Claude provider — Codex/Opencode are used only after the user explicitly enables and selects them.*
- **Acceptance:**
  - Given a fresh install (Claude default, no provider config)
  - When the chat surface loads
  - Then no Codex/Opencode subprocess is spawned, no key is read, and no beyond-vault read occurs until the user enables + selects the provider
- **Priority:** must
- **Satisfies:** charter §6a (Claude complete default); trust posture; REQ-PV-003
- **Test:** TEST-PV-103

### Accessibility + additivity

#### REQ-PV-110 — The provider/model/secret surfaces are keyboard-operable
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL make the provider-selection menu, the per-provider model/thinking/service-tier selectors, and the secret-entry field reachable and operable by keyboard (focus, Enter/Space/arrow activation, Escape to close a menu) with accessible names and expanded/selected state, meeting WCAG 2.2 AA.*
- **Acceptance:**
  - Given keyboard-only navigation
  - When the user opens the provider menu, switches model/thinking, and enters a secret
  - Then every control is reachable and operable, menus report `aria-expanded`, the active provider is announced, and the secret field has an accessible name
- **Priority:** must
- **Satisfies:** charter §1/§3.9 a11y; WCAG 2.2 AA; P6 selector `aria-expanded` pattern; `claudian-audit-frontend.md:289` (keyboard-open for hover menus)
- **Test:** TEST-PV-110

#### REQ-PV-111 — Real transports + secret store live in coverage-excluded infrastructure
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL place the real Codex JSON-RPC + ACP transports, the real `HomeFsPort` (`node:fs`), and the real `SecretStorePort` (`app.secretStorage`) in `src/infrastructure/obsidian/**` (coverage-excluded), with Mock scriptable/in-memory and LocalStorage inert, so the automated suite carries the logic and the real legs are manual.*
- **Acceptance:**
  - Given the three bridges
  - When the test suite runs
  - Then the Obsidian transport/home-fs/secret code is coverage-excluded (manual legs only), while Mock/LocalStorage carry the automated coverage and the suite meets 80/70/80/80
- **Priority:** must
- **Satisfies:** charter §6c; ADR-008 3-bridge discipline; the coverage exclusion (`src/infrastructure/obsidian/**`); audit port-placement (`claudian-audit-backend.md:580-588`)
- **Test:** TEST-PV-111 (manual legs TEST-PV-M1/M2/M3)

#### REQ-PV-112 — The registry + transports live behind narrow ports; Vue never imports obsidian/node
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL expose the registry, the secret store, and the home-fs surface behind narrow ports (`ProviderRegistryPort`, `SecretStorePort`, `HomeFsPort`) consumed one-per-dependency, and Vue components SHALL NOT import `obsidian` or `node:*`.*
- **Acceptance:**
  - Given the P9 UI + application code
  - When ESLint runs
  - Then no Vue component imports `obsidian`/`node:*`, each port has its own InjectionKey + composable, and there is no aggregate `usePorts` / re-introduced `IBridge`
- **Priority:** must
- **Satisfies:** charter §6a/§6c; ADR-008 narrow ports; CLAUDE.md import rules; the P9 ports (`ProviderRegistryPort`/`HomeFsPort`/`SecretStorePort`) (`claudian-audit-backend.md:600-607`)
- **Test:** TEST-PV-112

#### REQ-PV-113 — A turn with no v-html / window.confirm
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL build all P9 DOM via Obsidian helpers / Vue templates without `innerHTML`/`outerHTML`/`insertAdjacentHTML`, without `v-html`, and without `window.confirm`/`alert`/`prompt` — the consent prompt (REQ-PV-082) and any blocking flow use an Obsidian `Modal` subclass.*
- **Acceptance:**
  - Given the P9 components and the consent flow
  - When ESLint + the template lint run
  - Then zero banned-DOM errors are reported and the consent flow uses a Modal, not `window.confirm`
- **Priority:** must
- **Satisfies:** charter §1; CLAUDE.md DOM rules
- **Test:** TEST-PV-113

#### REQ-PV-114 — Additivity: with only Claude configured, P0–P8 is byte-identical
- **Pattern:** unwanted-behaviour
- **Statement:** *If only Claude is configured, then the chat surface, the toolbar, the routing, and the runtime query SHALL be byte-identical to P0–P8 — no provider menu, no secret surface, no home-fs read, and Claude routes through the same `ChatRuntimePort` path as P1–P8.*
- **Acceptance:**
  - Given a Claude-only configuration
  - When the user chats and inspects the surface, toolbar, and runtime query
  - Then a regression diff against P8 is empty: no multi-provider affordance appears, no secret/home-fs port is touched, and Claude's behaviour is unchanged
- **Priority:** must
- **Satisfies:** charter §4 (additive slices) + §6a (Claude complete default); ADR-CC additivity; REQ-PV-006
- **Test:** TEST-PV-114

## Non-functional requirements

> Targets inherited from the epic constraints (charter §1, §6a/§6c) + CLAUDE.md + the P8
> PRD-MC NFR pattern. New thresholds documented inline.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-PV-001 | additivity | With only Claude configured, the chat surface, toolbar, routing, and runtime query serialise byte-identically to P0–P8 | Byte-identical; regression diff empty (REQ-PV-114) |
| NFR-PV-002 | security (secrets) | A provider secret persists only to Obsidian native secret storage via `SecretStorePort`; never `data.json`/plain settings; never in a notice/log/store/DTO | 0 secrets in `data.json`/device-local; 0 secret leaks in notices/logs (REQ-PV-070/071/102) |
| NFR-PV-003 | security (beyond-vault) | `HomeFsPort` is read-scoped to the declared provider roots (`~/.codex`,`~/.claude`), user-consented, and never writes/deletes outside the vault unexpectedly | Only declared roots read; consent recorded; 0 unexpected beyond-vault writes (REQ-PV-080/081/082) |
| NFR-PV-004 | security (spawn) | Provider subprocesses spawn with explicit cmd+args + bounded merged env + enhanced PATH; no shell-eval of user input; `windowsHide` set | No `shell:true`/string-eval; spawn args asserted (REQ-PV-101) |
| NFR-PV-005 | reliability | A missing key / dead transport / dying subprocess degrades to an honest message + error chunk and never crashes the host; transport requests carry a timeout | 0 uncaught throws across the port boundary; request timeout enforced (REQ-PV-051/052/100) |
| NFR-PV-006 | architecture (DDD) | DDD inward imports; narrow ports (`ProviderRegistryPort`,`SecretStorePort`,`HomeFsPort`) one-per-dependency, no aggregate; Vue never imports `obsidian`/`node:*`; capabilities/registry are plain data | ESLint green; no `IBridge`/`usePorts` (REQ-PV-112) |
| NFR-PV-007 | architecture (coverage) | Real Codex/ACP transports + real `HomeFsPort` + real `SecretStorePort` live in `src/infrastructure/obsidian/**` (coverage-excluded); Mock scriptable/in-memory + LS inert carry automated weight | Coverage 80/70/80/80; obsidian transport/home-fs/secret excluded (REQ-PV-111) |
| NFR-PV-008 | security (DOM) | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`, no `v-html`, no `window.confirm`/`alert`/`prompt`; blocking flows (consent) via Obsidian `Modal` | 0 banned-DOM lint errors (REQ-PV-113) |
| NFR-PV-009 | accessibility | The provider menu, per-provider selectors, secret field, and consent modal meet WCAG 2.2 AA — keyboard-operable, focus-managed, accessible names, `aria-expanded`/state | WCAG 2.2 AA (REQ-PV-110) |
| NFR-PV-010 | visual parity | The provider-selection + per-provider model picker (`opencode-model-picker`) + provider-brand styling render through `--sp-*` tokens; no raw Obsidian var or physical-direction CSS leaks | `lint-style-tokens` green (REQ-PV-091); perceptual parity at 320/520/720, light+dark |
| NFR-PV-011 | compatibility (manifest) | `manifest.json` identity (`id`,`version`,`isDesktopOnly`) unchanged; `minAppVersion` stays `1.12.7` UNLESS `app.secretStorage` requires a newer Obsidian — in which case escalate, do not silently bump | Manifest untouched OR `minAppVersion` bump escalated with evidence (CLAR-PV-004) |
| NFR-PV-012 | desktop-only | The Codex/Opencode providers are desktop-only (subprocess + Node) — on non-Node bridges they degrade to "unavailable" rather than erroring | Clean degrade on Mock/LocalStorage (REQ-PV-083) |
| NFR-PV-013 | privacy | P9 introduces no telemetry; a provider secret/transcript is sent nowhere except the provider CLI the user configured; beyond-vault reads stay local | 0 new network egress beyond the configured provider |
| NFR-PV-014 | maintainability (registry) | Provider-varying behaviour gates on capability flags, not provider id; adding a provider needs registry data + a runtime impl, no new `switch (id)` in use cases | 0 `switch (providerId)`/`if (provider===)` in consuming use cases (REQ-PV-013) |

## Success metrics

- **North star:** A multi-CLI Claudian-migrant user enables Codex and Opencode, picks one from
  the chat surface, runs a turn on it, sees its real models/modes, and resumes its history —
  while the gated-off features (rewind/fork/steer/MCP per provider) are honestly hidden — and
  the surface reads as "the same product" (charter §1).
- **Supporting:** All `must` REQ-PV pass automated acceptance (the non-real legs) on the verify
  gate; the real-transport / real-fs / real-secret manual legs (TEST-PV-M1 Codex, TEST-PV-M2
  Opencode, TEST-PV-M3 secret) pass on the manual Obsidian run accumulated for the **single
  final epic gate**; parity screenshots of the provider menu + per-provider model picker read
  as Claudian at 320/520/720 (light+dark).
- **Counter-metric:** No regression in the P0–P8 surface — the Claude-only additivity diff is
  empty (NFR-PV-001), coverage stays ≥ 80/70/80/80, and zero new banned-DOM / token-leak / secret-leak
  lint or audit findings. A configured-but-broken non-Claude provider must not raise the chat
  crash rate above the P8 baseline (zero), and no provider secret may appear anywhere outside
  native secret storage.

## Release criteria

What must be true to ship P9 and merge `feature/providers-registry` → `next`.

- [ ] All `must` REQ-PV pass acceptance (automated legs green; real-transport/fs/secret legs
      TEST-PV-M1/M2/M3 recorded for the final epic gate).
- [ ] All NFR-PV met, or explicitly waived with an ADR.
- [ ] The P9 ADRs filed + accepted (architect): `ProviderRegistryPort` + the provider-routing
      seam; `HomeFsPort` (beyond-vault security surface); `SecretStorePort` (native secret
      storage binding + `minAppVersion` verdict). CLAR-PV-001..006 ratified.
- [ ] Additivity proven: Claude-only leaves P0–P8 byte-identical (NFR-PV-001 / REQ-PV-114).
- [ ] The registry lists/selects/activates a provider (REQ-PV-001..004); the active provider
      routes the turn (REQ-PV-010..013) and capabilities gate the UI honestly (REQ-PV-020..025).
- [ ] Codex connects via JSON-RPC + reads JSONL history at the capability-gated level
      (REQ-PV-030..035); Opencode connects via ACP at the capability-gated level (REQ-PV-040..044).
- [ ] The shared ACP transport carries timeout/abort/error-chunk semantics + a scriptable Mock
      (REQ-PV-050..053).
- [ ] Model selection routes to the owning provider; the model/thinking selectors list the
      active provider's options (REQ-PV-060..064).
- [ ] A provider key is stored in native secret storage, never `data.json`; the surface
      capability-gates when unavailable (REQ-PV-070..073, REQ-PV-092).
- [ ] Beyond-vault reads are scoped, consented, read-only, and inert on demo bridges
      (REQ-PV-080..084); history plugs into the P3 `ProviderHistoryPort`.
- [ ] Security posture met: degrade-never-crash, bounded explicit spawn, no secret leak,
      explicit-enable-only (REQ-PV-100..103).
- [ ] `lint-style-tokens` + token-mapping review green; parity screenshots captured.
- [ ] Verify gate green (`npm run verify` + `npm run test:all` exit zero); CI green on `next`.
- [ ] `manifest.json` untouched OR a `minAppVersion` bump escalated with the `app.secretStorage`
      availability evidence (CLAR-PV-004) — not silently bumped.

## Open questions / clarifications

All resolved by recommendation (autonomous mode — the architect's P9 ADRs ratify). None block
`/spec:design`.

- **CLAR-PV-001 — `ProviderRegistryPort` shape + where the registry lives.** *Recommendation: a
  narrow `ProviderRegistryPort` (`listEnabledProviders(settings)`, `getCapabilities(id)`,
  `resolveProviderForModel(model,settings)`, `getDisplayName(id)`, `getModelOptions(id,settings)`,
  `getReasoningOptions/getToggles`) at the domain port boundary; the registry object itself is
  infrastructure (it constructs subprocess runtimes), and runtime construction stays behind the
  existing P1 `ChatRuntimePort` (the registry hands back a runtime the port wraps).* Grounding:
  Claudian's two-registry split — chat-facing `ProviderRegistry` + workspace `ProviderWorkspaceRegistry`
  (`claudian-audit-backend.md:36-52`). The architect files the `ProviderRegistryPort` + routing-seam
  ADR (additive: Claude stays default; P0–P8 byte-identical when only Claude is present). *Owner: architect (P9 ADR).*
- **CLAR-PV-002 — `HomeFsPort` contract + the beyond-vault security boundary.** *Recommendation: a
  read-first `HomeFsPort` (`readFile`/`exists`/`listFolders` rooted at `os.homedir()`), restricted
  to the declared provider roots, user-consented (REQ-PV-082), real only on `ObsidianBridge`
  (`node:fs`), in-memory/no-op on Mock/LocalStorage.* This is the one genuine Obsidian-surface
  widening (beyond the vault) and needs an ADR (charter §6a; `claudian-audit-backend.md:602,626-628`).
  *Owner: architect (P9 ADR).*
- **CLAR-PV-003 — `SecretStorePort` contract + binding.** *Recommendation: a narrow `SecretStorePort`
  (`getSecret(key)`/`setSecret(key,val)`/`deleteSecret(key)`/`listKeys()`) bound to Obsidian
  `app.secretStorage` on `ObsidianBridge`, in-memory on Mock/LocalStorage; secrets never touch
  `data.json` (CHARTER-REQ-SEC).* Grounding: charter §1/§6a (RESOLVED to native secret storage);
  audit ports table (`claudian-audit-backend.md:606`). The architect files the `SecretStorePort` ADR.
  *Owner: architect (P9 ADR).*
- **CLAR-PV-004 — `minAppVersion` verdict for `app.secretStorage`.** *Recommendation: verify
  `app.secretStorage` availability at the current `minAppVersion 1.12.7` (the user-confirmed
  intentional policy). If `1.12.7` exposes `app.secretStorage`, KEEP the manifest untouched.
  If it requires a newer Obsidian, ESCALATE to the human with the evidence and the proposed bump —
  do NOT silently raise `minAppVersion` (charter §1 line 62-63 mandates escalation; `manifest.json:5`).*
  **Verdict pending the API check; default posture = keep 1.12.7 + capability-gate (REQ-PV-072) so a
  host without secret storage degrades rather than forcing a bump.** *Owner: architect/dev (P9 ADR + the API check).*
- **CLAR-PV-005 — Codex/Opencode capability completeness for P9.** *Recommendation: ship exactly the
  BACKED-vs-GATED split in REQ-PV-022/023, honoring the BINDING charter §6a posture (Claude complete;
  Codex/Opencode capability-gated, feature-incomplete acceptable). Do NOT pursue full Codex/Opencode
  parity; the gated-off capabilities (Codex rewind/provider-commands/MCP; Opencode rewind/fork/steer/MCP)
  are honestly reported, not built.* Grounding: charter §6a line 249-252; audit OOS decision 1
  (`claudian-audit-backend.md:619-622`). *Owner: architect (confirms the matrix in the P9 ADR).*
- **CLAR-PV-006 — Provider auth beyond CLI/env (OpenRouter / Kimi).** *Recommendation: OUT of P9
  (NG5). P9 supports CLI/env auth + a native-secret API key per provider; non-CLI/non-env auth flows
  (OpenRouter / Kimi compatibility) defer to a later phase.* Grounding: charter §6b line 259; audit
  OOS decision 9 (`claudian-audit-backend.md:641`). *Owner: architect (defer).*
- **CLAR-PV-007 — Routed auxiliary services per non-Claude provider.** *Recommendation: OUT of P9
  (NG6). Title-gen / inline-edit / instruction-refine stay Claude-backed; the registry exposes the
  routing hook (`RoutedTitleGenerationService` shape) but P9 does not wire non-Claude aux models —
  they ride the per-provider settings work in P10.* Grounding: `ProviderRegistry` routed-aux
  (`ProviderRegistry.ts:50-77`); charter §4 P10. *Owner: architect (defer).*

## Out of scope

- Full Codex/Opencode feature parity / the gated-off capabilities (NG1; charter §6a posture).
- The per-provider settings UX shell (NG2; P10).
- In-app MCP for Codex/Opencode (NG3; charter §6b line 258).
- Codex skills/subagents + Opencode agents as authored CRUD surfaces (NG4; P10).
- Provider auth beyond CLI/env + a native-secret key — OpenRouter / Kimi (NG5; CLAR-PV-006).
- Routed auxiliary services per non-Claude provider (NG6; CLAR-PV-007).
- The i18n sweep (P11) + a11y polish beyond WCAG 2.2 AA (P12) (NG7).
- Any legacy provider-state migration (NG8; CHARTER-REQ-FRESH).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable (Given/When/Then) + 1:1 claudian path + future TEST-PV id.
- [x] NFRs listed with targets (inherited epic constraints restated; new thresholds documented).
- [x] Success metrics defined (including a counter-metric).
- [x] Release criteria stated.
- [x] `/spec:clarify` self-check: CLAR-PV-001..007 resolved-by-recommendation (autonomous; architect P9 ADRs ratify) — none block design.
