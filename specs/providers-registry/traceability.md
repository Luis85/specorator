---
id: TRACE-PV-001
title: Providers registry (P9) — traceability matrix
stage: review
feature: providers-registry
area: PV
epic: claudian-reboot
phase: P9
owner: reviewer
integration_branch: next
created: 2026-05-26
updated: 2026-05-26
---

# Traceability — Providers registry (P9)

REQ-PV ↔ SPEC-PV ↔ TEST-PV ↔ code (`file:line`) ↔ manual leg. Regenerated from
the artifacts + the `git diff next..HEAD` at review. Every `must`/`should` REQ
has a downstream chain. Coverage-excluded real-transport / real-secret / real-fs
legs are recorded as **pending-manual** (TEST-PV-M1/M2/M3/M4), never green.

## Registry, selection, activation

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-001 list registered | SPEC-PV-002/004/008 | TEST-PV-001 | `src/domain/chat/providers/ProviderDescriptor.ts:171` (`PROVIDER_DESCRIPTORS`); `src/infrastructure/providers/ProviderRegistry.ts:33` | ✅ automated |
| REQ-PV-002 enabled in order | SPEC-PV-003 | TEST-PV-002 | `src/domain/chat/providers/resolveProvider.ts` (`listEnabledProviders`); `ProviderDescriptor.ts:101/125/149` (blankTabOrder 20/15/10) | ✅ automated |
| REQ-PV-003 Claude default | SPEC-PV-002/003 | TEST-PV-003 | `ProviderDescriptor.ts:65` (`DEFAULT_CHAT_PROVIDER_ID`), `:89` (`claudeIsEnabled`); `resolveProvider.ts` (`resolveActiveProvider`) | ✅ automated |
| REQ-PV-004 select + activate | SPEC-PV-013/023 | TEST-PV-004 | `src/application/chat/providers/SelectProviderUseCase.ts:48`; `src/ui/chat/ChatSurface.vue:227` (`onSelectProvider`) | ✅ automated |
| REQ-PV-005 widen ProviderId | SPEC-PV-001 | TEST-PV-005 | `src/domain/chat/ProviderId.ts` (`'claude'\|'codex'\|'opencode'`) | ✅ automated |
| REQ-PV-006 one-enabled = P8 | SPEC-PV-027 | TEST-PV-006 | `ChatSurface.vue:833` (`v-if providerVm`/`showChooser`); `resolveProvider.ts` (single-Claude → `[claude]`) | ✅ automated (+ dev leg) |

## Provider routing

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-010 route active turn | SPEC-PV-005/009 | TEST-PV-010 | `src/ui/chat/modalSeam.ts` (widened factory); `ChatSurface.vue:139` (`createRuntime`); `AgentSidebarView.ts:134` | ✅ automated |
| REQ-PV-011 construct → Result | SPEC-PV-005/013 | TEST-PV-011 | `src/infrastructure/obsidian/ObsidianProviderRuntimeRegistry.ts:73`; `SelectProviderUseCase.ts:62` | ✅ automated |
| REQ-PV-012 rebuild on switch | SPEC-PV-013/023 | TEST-PV-012 | `SelectProviderUseCase.ts:52-53` (resetSession+cancel); `tabsStore.ts:464` (`rebindActiveRuntime`) | ✅ automated |
| REQ-PV-013 gate on caps not id | SPEC-PV-015/029 | TEST-PV-013 | `src/application/chat/providers/buildProviderViewModel.ts`; `tests/ui/chat/providers/no-provider-switch.test.ts` (source guard, 6/6) | ✅ automated |

## Per-provider capability matrix

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-020 frozen bag | SPEC-PV-002/022 | TEST-PV-020 | `ProviderDescriptor.ts:25-48` + `Object.freeze` `:98/102/122/126/146/150` | ✅ automated |
| REQ-PV-021 Claude all-true | SPEC-PV-022 | TEST-PV-021 | `ProviderDescriptor.ts:98-120` (parity claudian `claude/capabilities.ts`) | ✅ automated |
| REQ-PV-022 Codex backed/gated | SPEC-PV-022 | TEST-PV-022 | `ProviderDescriptor.ts:122-144` (rewind/cmds/MCP false; steer/fork true) | ✅ automated |
| REQ-PV-023 Opencode backed/gated | SPEC-PV-022 | TEST-PV-023 | `ProviderDescriptor.ts:146-168` (rewind/fork/steer/MCP false; cmds true) | ✅ automated |
| REQ-PV-024 gated = hidden/disabled | SPEC-PV-015/017 | TEST-PV-024 | `buildProviderViewModel.ts`; `tests/application/chat/providers/buildProviderViewModel.test.ts` | ✅ automated |
| REQ-PV-025 mid-turn honest notice | SPEC-PV-025 | TEST-PV-025 | en/de `providers.notice.unsupported`; `CodexRuntime.ts:92` (`keyRequired` chunk) | ⚠️ partial — notice copy present; mid-turn invocation path is dev-leg |

## Codex provider (capability-gated)

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-030 JSON-RPC over stdio | SPEC-PV-009/010 | TEST-PV-030 | `src/infrastructure/obsidian/CodexRpcTransport.ts`; `JsonRpcStdioChannel.ts` | ⏳ pending-manual TEST-PV-M1 |
| REQ-PV-031 Windows .cmd quoting | SPEC-PV-010 | TEST-PV-031 | `JsonRpcStdioChannel.ts:337-347` (`cmd.exe /d /s /c`, `windowsVerbatimArguments`) | ⏳ pending-manual TEST-PV-M1 |
| REQ-PV-032 JSONL history | SPEC-PV-009/034 | TEST-PV-032 | `CodexRuntime.ts` (`HomeFsPort` read); `HomeFileSystem.ts` | ⏳ pending-manual TEST-PV-M1 |
| REQ-PV-033 turn-steer | SPEC-PV-010 | TEST-PV-033 | `CodexRuntime.ts:171` (`steer`); `CodexRpcTransport.ts:102` (`turn/steer`) | ⏳ pending-manual TEST-PV-M1 |
| REQ-PV-034 rewind/cmds/MCP gated | SPEC-PV-022 | TEST-PV-034 | `ProviderDescriptor.ts:131/133/136` (false) | ✅ automated (flags) |
| REQ-PV-035 graceful shutdown | SPEC-PV-010/026 | TEST-PV-035 | `JsonRpcStdioChannel.ts:151-177` (SIGTERM→SIGKILL 3s) | ⏳ pending-manual TEST-PV-M1 |

## Opencode provider (capability-gated)

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-040 ACP transport | SPEC-PV-009/010 | TEST-PV-040 | `src/infrastructure/obsidian/AcpTransport.ts`; `OpencodeRuntime.ts:96` | ⏳ pending-manual TEST-PV-M2 |
| REQ-PV-041 modes/models/agents | SPEC-PV-009 | TEST-PV-041 | `OpencodeRuntime.ts` + `AcpTransport.ts` | ⏳ pending-manual TEST-PV-M2 |
| REQ-PV-042 ACP history | SPEC-PV-034 | TEST-PV-042 | `OpencodeRuntime.ts` (`loadSession` via HomeFsPort) | ⏳ pending-manual TEST-PV-M2 |
| REQ-PV-043 rewind/fork/steer/MCP gated | SPEC-PV-022 | TEST-PV-043 | `ProviderDescriptor.ts:155/156/161/160` (false) | ✅ automated (flags) |
| REQ-PV-044 graceful shutdown | SPEC-PV-010/026 | TEST-PV-044 | `OpencodeRuntime.ts:115` (`cancel`); `JsonRpcStdioChannel.ts:151` | ⏳ pending-manual TEST-PV-M2 |

## ACP transport (shared)

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-050 line-delimited JSON-RPC 2.0 | SPEC-PV-010/026 | TEST-PV-050 | `JsonRpcStdioChannel.ts:210-237` (`_drainLines`/`_handleLine`) | ⚠️ Mock-scriptable automated; real = TEST-PV-M2 |
| REQ-PV-051 timeout → Result.err | SPEC-PV-010/026 | TEST-PV-051 | `JsonRpcStdioChannel.ts:116-137` (timer + abort → `err`) | ⚠️ Mock automated; real = TEST-PV-M1/M2 |
| REQ-PV-052 dying proc → error chunk | SPEC-PV-010/026 | TEST-PV-052 | `JsonRpcStdioChannel.ts:195-208` (`onGone`/`onClose`); `CodexRpcTransport.ts:124` | ⚠️ Mock automated; real = TEST-PV-M1/M2 |
| REQ-PV-053 scriptable Mock transport | SPEC-PV-011 | TEST-PV-053 | `src/infrastructure/mock/MockProviderRuntime.ts`; `tests/infrastructure/mock/MockProviderRuntime.test.ts` | ✅ automated |

## Model routing

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-060 model → owning provider | SPEC-PV-003 | TEST-PV-060 | `resolveProvider.ts` (`resolveProviderForModel`); `ProviderDescriptor.ts:72-86` (ownsModel) | ✅ automated |
| REQ-PV-061 unowned → fallback | SPEC-PV-003 | TEST-PV-061 | `resolveProvider.ts` (fallback to active/claude); `SelectProviderUseCase.ts:74` (`selectForModel`) | ✅ automated |
| REQ-PV-062 selector lists active models | SPEC-PV-017 | TEST-PV-062 | `ChatSurface.vue:704` (`getCatalog(activeProviderId.value)` — un-hardcoded); `ModelSelector.vue:35` | ✅ automated (+ dev leg) |
| REQ-PV-063 thinking reflects control | SPEC-PV-017 | TEST-PV-063 | `ThinkingSelector.vue` (caps `reasoningControl`); `CodexRuntime.ts:162` | ✅ automated |
| REQ-PV-064 service-tier gated (Codex) | SPEC-PV-017 | TEST-PV-064 | `ServiceTierToggle.vue`; `CodexRuntime.ts:164` (`hasServiceTier`) | ⚠️ gating present (`could`); live emission = capable-runtime, manual |

## Secret storage

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-070 native store, never data.json | SPEC-PV-006/009 | TEST-PV-070 | `src/infrastructure/obsidian/SecretStorage.ts:54-63` (`app.secretStorage` only) | ⏳ pending-manual TEST-PV-M3 (real); Mock automated |
| REQ-PV-071 runtime env read, not UI | SPEC-PV-006/009 | TEST-PV-071 | `CodexRuntime.ts:90-102`; `OpencodeRuntime.ts:90-101` (key into env at turn boundary) | ✅ automated (Mock); real = M3 |
| REQ-PV-072 gate when unavailable | SPEC-PV-006/025 | TEST-PV-072 | `SecretStorage.ts:38` (`isAvailable`); `ProviderSecretField.vue:51/64` (disabled+message); `ObsidianProviderRuntimeRegistry.ts:91` | ✅ automated (+ dev leg) |
| REQ-PV-073 in-memory on demo bridges | SPEC-PV-011/012 | TEST-PV-073 | `src/infrastructure/mock/MockSecretStore.ts`; `localstorage/LocalStorageSecretStore.ts` | ✅ automated |

## Home-fs + beyond-vault history

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-080 read via HomeFsPort | SPEC-PV-007/009 | TEST-PV-080 | `src/infrastructure/obsidian/HomeFileSystem.ts:33-65` (rooted at `os.homedir()`) | ⏳ pending-manual TEST-PV-M1/M2; pure check automated |
| REQ-PV-081 no write outside vault | SPEC-PV-007/028 | TEST-PV-081 | `HomeFileSystem.ts:73-87` (path-escape → err, read-only); `homeFsPath.ts` (`isInsideHomeRoot`) | ✅ automated (pure guard); real = M1/M2 |
| REQ-PV-082 user-consented | SPEC-PV-014/024 | TEST-PV-082 | `ProviderConsentGate.ts:41`; `ChatSurface.vue:230`; `src/plugin/modals/ProviderConsentModal.ts` | ✅ automated |
| REQ-PV-083 inert on demo bridges | SPEC-PV-011/012 | TEST-PV-083 | `mock/MockHomeFs.ts`; `localstorage/LocalStorageHomeFs.ts` (`isAvailable → false`) | ✅ automated |
| REQ-PV-084 plug P3 ProviderHistoryPort | SPEC-PV-034 | TEST-PV-084 | `AgentSidebarView.ts:120` (`createProviderHistoryPort`); Codex/Opencode runtimes | ⚠️ contract unchanged; provider-native legs = M1/M2 |

## Settings + selector UI

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-090 minimal chooser | SPEC-PV-016 | TEST-PV-090 | `src/ui/chat/providers/ProviderChooser.vue`; `ProviderOption.vue` | ✅ automated (+ dev leg) |
| REQ-PV-091 --sp-* tokens | SPEC-PV-021 | TEST-PV-091 | `src/ui/styles/tokens.css` (provider-brand + model-picker-group-gap); `tests/ui/styles/tokens.test.ts` | ✅ automated |
| REQ-PV-092 masked secret field | SPEC-PV-018 | TEST-PV-092 | `ProviderSecretField.vue:43-53` (`type="password"`, cleared on save) | ✅ automated |

## Security

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-100 degrade never crash | SPEC-PV-025 | TEST-PV-100 | `SelectProviderUseCase.ts:62-66`; `LocalStorageProviderRuntime.ts:23` (`err('unavailable')`) | ✅ automated (+ dev leg) |
| REQ-PV-101 bounded explicit spawn | SPEC-PV-010/028 | TEST-PV-101 | `JsonRpcStdioChannel.ts:311-329` (`shell:false`, merged env, `windowsHide`) | ⏳ pending-manual TEST-PV-M1/M2; code asserted by read |
| REQ-PV-102 no secret in notice/log/DTO | SPEC-PV-006/030 | TEST-PV-102 | `SecretStorage.ts` (no value logged); `ProviderSecretField.vue:22-37`; `SelectProviderUseCase.ts:28-33` (copy keys only) | ✅ automated |
| REQ-PV-103 explicit enable only | SPEC-PV-028 | TEST-PV-103 | `ProviderDescriptor.ts:94` (`nonClaudeIsEnabled`); `PluginSettings.ts:65` (`enabledProviders: []`) | ✅ automated |

## Accessibility + additivity

| REQ | SPEC | TEST | Code (`file:line`) | Status |
|---|---|---|---|---|
| REQ-PV-110 keyboard-operable | SPEC-PV-016/018 | TEST-PV-110 | `ProviderChooser.vue`/`ProviderOption.vue`/`ProviderSecretField.vue` (aria + keyboard) | ✅ automated (component); WCAG sweep = P12 |
| REQ-PV-111 real legs coverage-excluded | SPEC-PV-033 | TEST-PV-111 | `src/infrastructure/obsidian/**` (coverage-excluded per vitest config) | ✅ automated (Mock weight) + M1/M2/M3 |
| REQ-PV-112 narrow ports, no Vue obsidian | SPEC-PV-004/006/007/019 | TEST-PV-112 | `composables/use{ProviderRegistry,SecretStore,HomeFs}Port.ts`; `eslint.config.js` (UI bans) | ✅ automated |
| REQ-PV-113 no v-html/window.confirm | SPEC-PV-005/016/018/024 | TEST-PV-113 | `ProviderConsentModal.ts` (Obsidian Modal); `eslint.config.js:355` (`vue/no-v-html`) | ✅ automated (lint) |
| REQ-PV-114 Claude-only byte-identical | SPEC-PV-027/031 | TEST-PV-114 | `ChatSurface.vue:138/213`; `core-settings.ts:64` (homeFsConsent absent); `PluginSettings.ts:58-66` | ✅ automated (+ dev leg) |

## NFR coverage

| NFR | Covered by | Status |
|---|---|---|
| NFR-PV-001 additivity | REQ-PV-006/114; `ChatSurface.vue` no-registry path; `PluginSettings` additive | ✅ |
| NFR-PV-002 secrets native-only | REQ-PV-070/071/102; `SecretStorage.ts`; no secret in DTO/log | ✅ (real = M3) |
| NFR-PV-003 beyond-vault scoped/consented | REQ-PV-080/081/082; `HomeFileSystem.ts` + `homeFsPath.ts` | ✅ (real = M1/M2) |
| NFR-PV-004 bounded spawn | REQ-PV-101; `JsonRpcStdioChannel._spawnOptions` | ⏳ real = M1/M2 |
| NFR-PV-005 reliability/Result | REQ-PV-011/051/052/100; Result at every port + StreamChunk error | ✅ (Mock) |
| NFR-PV-006 DDD/narrow ports | REQ-PV-112; eslint layer bans green | ✅ |
| NFR-PV-007 coverage exclusion | REQ-PV-111; `obsidian/**` excluded; 80/70/80/80 | ✅ (parent runs gate) |
| NFR-PV-008 DOM safety | REQ-PV-113; `vue/no-v-html` error; Modal seam | ✅ |
| NFR-PV-009 a11y WCAG 2.2 AA | REQ-PV-110; component aria/keyboard | ✅ (full sweep P12) |
| NFR-PV-010 visual parity tokens | REQ-PV-091; `tokens.test.ts` | ✅ (screenshots = M4) |
| NFR-PV-011 manifest/minAppVersion | SPEC-PV-032; manifest untouched; `SecretStorage.isAvailable` gates | ⚠️ minAppVersion API check = M3 |
| NFR-PV-012 desktop-only degrade | REQ-PV-083; LS `err('unavailable')` | ✅ |
| NFR-PV-013 privacy | C.8; no telemetry; env-only secret | ✅ (real = M1/M2/M3) |
| NFR-PV-014 no switch(providerId) | REQ-PV-013; `no-provider-switch.test.ts`; Map dispatch tables | ✅ |

## Orphan check

- **Orphan tests:** none — every TEST-PV maps to a REQ-PV.
- **Orphan tasks:** none — T-PV-001..037 each trace to a SPEC-PV item (close-out batches in implementation-log).
- **Orphan ADRs:** none — ADR-PV-001/002/003 each ratified by ≥1 REQ chain and cited in design C.10.
- **REQ with no chain:** none. All `must`/`should` REQ-PV have a downstream code+test cell.

## Manual-leg ledger (pending-manual — NOT green)

| Leg | Surface | Status |
|---|---|---|
| TEST-PV-M1 | real Codex JSON-RPC + JSONL history + steer + shutdown + real key | ⏳ pending (final epic gate) |
| TEST-PV-M2 | real Opencode ACP + modes/models/agents + ACP history + shutdown | ⏳ pending (final epic gate) |
| TEST-PV-M3 | real `app.secretStorage` round-trip + minAppVersion check + no-`data.json` proof | ⏳ pending (final epic gate) |
| TEST-PV-M4 | parity screenshots 320/520/720 light+dark | ⏳ pending (review gate) |
