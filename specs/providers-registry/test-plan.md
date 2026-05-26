---
id: TESTPLAN-PV-001
title: Providers registry (P9) — test plan
stage: testing
feature: providers-registry
area: PV
epic: claudian-reboot
phase: P9
owner: qa / dev
created: 2026-05-26
updated: 2026-05-26
---

# Test plan — Providers registry (P9)

Tracks the automated unit/component coverage plus the coverage-excluded manual
legs (TEST-PV-M1/M2/M3/M4 + the real-transport sub-legs) that ride the single
final epic-review human gate.

## Deleted-symbol guard verification (T-PV-001 / NFR-PV-007)

Confirmed against `eslint.config.js` (read 2026-05-26):

- **CLEAN (no relaxation):** the new InjectionKeys `PROVIDER_REGISTRY_PORT` and
  `HOME_FS_PORT` are **not** in `DELETED_INJECTION_KEYS.importNames`; the new
  domain/application/ui/infra paths `@/domain/chat/providers/**`,
  `@/application/chat/providers/**`, `@/ui/chat/providers/**`,
  `@/infrastructure/providers/**`, `@/domain/ports/ProviderRegistryPort`,
  `@/domain/ports/HomeFsPort` match **none** of the `DELETED_SUBSYSTEM_BAN.group`
  globs. (`@/domain/chat` regrew in P1, `@/application/chat` likewise; there is no
  `@/ui/chat` ban glob — only `@/domain/feature` / `@/application/feature` /
  `@/application/migration` are banned. `@/infrastructure/providers/**` is not
  banned — only `@/infrastructure/obsidian/providers`-style globs would be, and no
  such glob is present.)

- **COLLISION — guard-relax IS required for the secret store (P9 regrow,
  ICON_PORT precedent):** contrary to the planner's hand-off note, two stale
  **P0-deleted** symbols that P9 regrows verbatim per ADR-PV-002 §47 / SPEC-PV-006
  ARE still in the guard:
  - `DELETED_SUBSYSTEM_BAN.group` includes `@/domain/ports/SecretStorePort`
    (`eslint.config.js:152`).
  - `DELETED_INJECTION_KEYS.importNames` includes `SECRET_STORE_PORT`
    (`eslint.config.js:175`).
  These are the OLD pre-reboot secret-store domain port + key. SPEC-PV-006 pins the
  domain path `src/domain/ports/SecretStorePort.ts` and the `SECRET_STORE_PORT`
  InjectionKey verbatim — there is no alternative name. This is the documented
  per-phase regrow pattern: exactly as P2 dropped `@/domain/ports/IconPort` from the
  ban and `ICON_PORT` from `DELETED_INJECTION_KEYS` when the icon seam regrew
  (`eslint.config.js:121-122, 168`), **P9 drops these two stale secret-store
  entries** when the secret seam regrows. The narrow relax happens in T-PV-009 (the
  domain-port task that introduces `SecretStorePort` + `SECRET_STORE_PORT`); it
  removes ONLY those two entries and leaves every other P0-deleted symbol banned —
  in particular the **Obsidian-layer** glob `@/infrastructure/obsidian/
  ObsidianSecretStore*` (`eslint.config.js:142`) STAYS banned (the file-naming
  directive below depends on it).

## File-naming directive — Obsidian-infra batch (T-PV-009 / SPEC-PV-009/010)

The following OLD Obsidian-layer ban globs are **still active** in
`eslint.config.js` (each still matches a real P0-deleted path) and would catch a
new file that matched them:

- `@/infrastructure/obsidian/ObsidianSecretStore*` (`:142`) — **stays banned.**
- `@/infrastructure/obsidian/ObsidianMcp*` (`:138`), `@/infrastructure/obsidian/
  mcp/**` (`:145`) — unrelated to P9 but still active.
- `@/infrastructure/obsidian/Claude*` (`:136`) — still active; a new Claude-runtime
  reuse must NOT introduce a `Claude*`-prefixed Obsidian file (P1's runtime already
  lives under a non-matching name and is reused unchanged).

There is **no** `@/infrastructure/obsidian/providers/**`, `obsidian/codex/**`, or
`obsidian/acp/**` ban glob present. The P9 real-transport + real-secret + real-home-fs
infra (SPEC-PV-009/010, the INFRA batch — **out of this DOMAIN batch's scope**) MUST
be named so as **NOT** to match any banned glob:

- the real secret store → `src/infrastructure/obsidian/SecretStorage.ts`
  (**NEVER** `ObsidianSecretStore*`).
- the real home-fs → `src/infrastructure/obsidian/HomeFileSystem.ts`.
- the runtimes/transports → `src/infrastructure/obsidian/CodexRuntime.ts` /
  `OpencodeRuntime.ts` / `AcpTransport.ts` / `CodexRpcTransport.ts` at the
  `obsidian/` root, never under a banned subfolder (exactly as P8 did for
  `VaultMcpConfigStore.ts` / `SdkMcpClient.ts`).

The shared **coverage-included** registry lives at
`src/infrastructure/providers/ProviderRegistry.ts` (NOT `obsidian/**` — pure data).
Aside from the one narrow secret-store regrow (above), no other ban edit is needed —
the rest is a file-naming choice. T-PV-001 records this directive; the INFRA batch
carries it; the GATE batch re-confirms it.

## Coverage-excluded manual legs (human-run, final review gate)

| Leg | Surface | Scheduled by |
|---|---|---|
| TEST-PV-M1 | The **real** Codex app-server JSON-RPC transport + JSONL history + turn-steer + graceful shutdown + the real key in Obsidian | INFRA batch |
| TEST-PV-M2 | The **real** Opencode ACP transport + modes/models/agents + ACP history + graceful shutdown | INFRA batch |
| TEST-PV-M3 | The **real** `app.secretStorage` round-trip + the `minAppVersion` availability check at 1.12.7 + the no-`data.json` proof | INFRA batch |
| TEST-PV-M4 | Per-surface parity screenshots vs claudian-main at 320 / 520 / 720 px, light + dark (chooser > 1 enabled + Claude-only seam, per-provider model picker incl. opencode-model-picker, Codex + Opencode toolbars, masked + disabled secret field, beyond-vault consent modal) | GATE batch (review gate) |
| TEST-PV-030/031/032/033/035 | The **real** Codex transport sub-legs (JSON-RPC frames / timeout-abort / error-chunk / JSONL / SIGTERM→SIGKILL) | INFRA batch |
| TEST-PV-040/041/042/044 | The **real** Opencode ACP transport sub-legs | INFRA batch |
| TEST-PV-101 | The **real** bounded explicit spawn (cmd+args, merged env, `windowsHide`, no `shell:true`) | INFRA batch |

> The **real** Codex JSON-RPC + ACP transports + the real `SecretStorePort`
> (`app.secretStorage`) + the real `HomeFsPort` (`node:fs`) live under
> `src/infrastructure/obsidian/**` (coverage-excluded per `vitest.config`). Their
> behavioural gate is TEST-PV-M1/M2/M3 + the real sub-legs — never self-claimed by
> an agent. The PURE descriptor table / `resolveProvider` / `buildProviderViewModel`,
> the `SelectProviderUseCase` + `ProviderConsentGate` (over the scriptable Mock
> registry/secret/home-fs/runtime), the Mock scriptable runtime/transport
> (`scriptProviderStream` + `setProviderConstructMode` + `setTransportMode` +
> `seedSecret`/`setSecretStoreAvailable` + `seedHomeFile`), and the LocalStorage
> inert impls carry the unit/component weight + the 80/70/80/80 coverage gate
> (NFR-PV-007).

## DOMAIN batch (T-PV-002..010) — automated structural/type/behaviour legs

| Leg | Status | Where |
|---|---|---|
| TEST-PV-005 (widened-union) — `ProviderId` widens to `'claude' \| 'codex' \| 'opencode'`; every P1–P8 `'claude'` site type-checks unchanged | RED→green (T-PV-002→003) | `tests/domain/chat/ProviderId.test.ts` |
| TEST-PV-114 (settings/additivity) — `PluginSettings.activeProvider` (default `'claude'`) + `enabledProviders` (default `[]`); a P8-shaped object resolves byte-identically | RED→green (T-PV-002→003) | `tests/domain/settings/PluginSettings.ts.test.ts` |
| TEST-PV-020/021/022/023 — the frozen `ProviderDescriptor` / `ProviderCapabilities` matrix (per-flag BACKED/GATED-OFF per provider, the freeze, distinct `blankTabOrder`, `isEnabled`, `ownsModel`, never-throws) | RED→green (T-PV-004→005) | `tests/domain/chat/providers/ProviderDescriptor.test.ts` |
| TEST-PV-002/003/060/061 + EC-PV-2/3/9 — the pure `resolveProvider` helpers (`listEnabledProviders` blank-tab order, `resolveActiveProvider` fallback, `resolveProviderForModel` ownership + fallback, fresh array, never-throws) | RED→green (T-PV-006→007) | `tests/domain/chat/providers/resolveProvider.test.ts` |
| TEST-PV-112 (port-shape) — `ProviderRegistryPort` (7 pure reads) + `SecretStorePort` (`isAvailable`/`getSecret`/`setSecret`/`deleteSecret`/`listKeys` + `providerSecretKey`) + `HomeFsPort` (`isAvailable`/`readFile`/`exists`/`listFolders` + `HOME_FS_ROOTS`, no write/delete) + the 3 own keys + the barrel re-exports | RED→green (T-PV-008→009) | `tests/domain/ports/ProviderRegistryPort.test.ts`, `tests/domain/ports/SecretStorePort.test.ts`, `tests/domain/ports/HomeFsPort.test.ts` |
| TEST-PV-010/011/082/113/114 (seam) — `ChatRuntimeFactory` widens to `(providerId) => Result<ChatRuntimePort>`; `OPEN_PROVIDER_CONSENT` + auto-decline fallback; the P3–P8 handles byte-identical; every call/provide-site compiles against the widened signature | RED→green (T-PV-010) | `tests/ui/chat/modalSeam.ts.test.ts` |

> **Build-green note (T-PV-010, the one INTERFACE change in P9):** unlike the P6/P7/P8
> purely-additive optional-field grows, P9 widens the `ChatRuntimeFactory` TYPE from
> `() => ChatRuntimePort` to `(providerId: ProviderId) => Result<ChatRuntimePort>`
> (SPEC-PV-005). T-PV-010 updates **every** factory call site + provide-site + the
> modal-seam handle in the SAME task so `vue-tsc` stays 0: the `useChatRuntimeFactory()`
> consumer in `ChatSurface.vue`, the per-tab provide in `AgentSidebarView` + `src/ui/main.ts`
> (each provides a `(providerId) => Result.ok(<existing Claude runtime>)` stand-in),
> the `tabsStore.bindTabDeps({ createRuntime })` binding, and the `TabDepsBinding.createRuntime`
> shape. The default `'claude'` is passed everywhere so the runtime is byte-identical;
> the resolved-provider routing finalises at the wire-in (INFRA/WIRE-IN batches). The
> three new ports (`ProviderRegistryPort`/`SecretStorePort`/`HomeFsPort`) are NEW
> interfaces with no prior impl, so adding them breaks nothing until a bridge declares
> `implements` (the bridge tasks add the impl + the `fake-ports` member in the same task).

## INFRA / APPLICATION / UI / STYLES / WIRE-IN / GATE batches

The shared descriptor-table `ProviderRegistry` (coverage-included), the scriptable
Mock runtime/transport + in-memory secret + inert/seedable home-fs + `fake-ports`
members, the LocalStorage inert impls, the `SelectProviderUseCase` /
`ProviderConsentGate` / pure `buildProviderViewModel`, the provider-aware widgets +
chooser/secret components, the `--sp-*` slice, and the wire-in carry the
unit/component weight + the 80/70/80/80 coverage gate. Tracked per RED test task
(qa-owned). These ride the INFRA, APPLICATION, UI, STYLES, WIRE-IN, and GATE
batches — out of the DOMAIN batch (T-PV-002..010) scope.
