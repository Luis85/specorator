---
id: IMPL-LOG-PV-001
title: Providers registry (P9) — Implementation Log
stage: implementation
feature: providers-registry
area: PV
epic: claudian-reboot
phase: P9
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-26
updated: 2026-05-26
---

# Implementation Log — Providers registry (P9)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green. The DOMAIN batch is T-PV-001..010; INFRA/APPLICATION/UI/STYLES/
WIRE-IN/GATE batches ride their own subagents.

## T-PV-001 — Baseline-capture + guard verification + file-naming directive (📐, doc-only)

- **Spec/req:** NFR-PV-009 (baseline leg), NFR-PV-007 (guard verification),
  SPEC-PV-002/008/009/010/016/017/018/021/022.
- **Files:** `specs/providers-registry/parity-screenshots.md` (new — baseline
  skeleton, seven surfaces × 320/520/720 × light/dark, baseline column keyed to
  `claudian-main` `ProviderRegistry` / `types.ts` / `providers/*/capabilities.ts` /
  `codex/runtime` / `acp` / `HomeFileAdapter` + the `opencode-model-picker.css` /
  provider-brand rules), `specs/providers-registry/test-plan.md` (new — the
  guard-verification note + the file-naming directive + the TEST-PV-M1/M2/M3/M4 +
  manual sub-legs + the DOMAIN-batch automated status), `specs/providers-registry/
  implementation-log.md` (new — this file).
- **Outcome:** done.
- **Guard verification:** the new `PROVIDER_REGISTRY_PORT` / `HOME_FS_PORT` keys +
  the new domain/application/ui/infra paths (`@/domain/chat/providers/**`,
  `@/application/chat/providers/**`, `@/ui/chat/providers/**`,
  `@/infrastructure/providers/**`, `@/domain/ports/ProviderRegistryPort`,
  `@/domain/ports/HomeFsPort`) match **no** `DELETED_SUBSYSTEM_BAN` /
  `DELETED_INJECTION_KEYS` glob — clean. **DEVIATION from the planner's hand-off
  note:** `@/domain/ports/SecretStorePort` (`eslint.config.js:152`) AND
  `SECRET_STORE_PORT` (`eslint.config.js:175`) ARE still banned — they are the OLD
  P0-deleted secret-store symbols that P9 regrows verbatim (ADR-PV-002 §47,
  SPEC-PV-006 pins the path + key, no alternative name). This is the documented
  per-phase regrow pattern (ICON_PORT precedent, `eslint.config.js:121-122,168`); a
  narrow guard-relax dropping ONLY those two stale entries is required and lands in
  T-PV-009. The Obsidian-layer glob `@/infrastructure/obsidian/ObsidianSecretStore*`
  (`:142`) STAYS banned. Recorded in `test-plan.md` + escalated in `workflow-state.md`.
- **Lint:** whole-project `npm run lint` over the pre-existing surface passes clean
  (no new key/port referenced yet).
- **Commit:** `33cf3225`.
- **Deviation:** the SecretStorePort/SECRET_STORE_PORT guard-relax (see above); no
  file under `src/` changed in this task.

## DOMAIN batch (T-PV-002..010)

### T-PV-002 — RED widened `ProviderId` union + settings provider fields (🧪 qa)

- **Spec/test:** TEST-PV-005 (widened-union), TEST-PV-114 (settings/additivity);
  SPEC-PV-001/027; REQ-PV-005/103/114; NFR-PV-001.
- **Files:** `tests/domain/chat/ProviderId.test.ts` (new — the exactly-three-member
  union + `'claude'` still-assignable type legs), `tests/domain/settings/
  PluginSettings.ts.test.ts` (new — `activeProvider` default `'claude'` +
  `enabledProviders` default `[]` + the P0–P8 byte-identical legs).
- **Outcome:** done — RED confirmed: `vue-tsc -p tsconfig.lint.json` fails on the
  `'codex'`/`'opencode'` not-assignable-to-`'claude'` + the missing
  `activeProvider`/`enabledProviders` `PluginSettings` keys; the runtime defaults
  also fail (`undefined`).
- **Commit:** `26e6e898`.

### T-PV-003 — `ProviderId.ts` widened + `PluginSettings` provider fields (🔨 dev)

- **Spec/req:** SPEC-PV-001/027; REQ-PV-005/103; NFR-PV-001.
- **Files:** `src/domain/chat/ProviderId.ts` (widened to
  `'claude' | 'codex' | 'opencode'`, additive), `src/domain/settings/PluginSettings.ts`
  (appended `activeProvider: ProviderId` default `'claude'` + `enabledProviders:
  readonly ProviderId[]` default `[]`; the P0–P8 fields byte-identical; added pure
  `coerceActiveProvider` + `coerceEnabledProviders` load-or-default helpers). Same-task
  additive fan-out (the two new required fields force every full-`PluginSettings`
  literal to load-or-default them): `src/core/core-settings.ts` (validateSettings
  coerces the two fields), `src/infrastructure/obsidian/ObsidianBridge.ts:_readDeviceLocalSettings`
  (same), `tests/infrastructure/obsidian/ObsidianBridge.settings.test.ts` (the
  round-trip fixture gains the two additive fields), `tests/core/core-settings.test.ts`
  (the exact-key additivity guard grows by the two keys — same pattern P4 used for
  `customSystemPrompt`).
- **Outcome:** done — TEST-PV-005 (type) + TEST-PV-114 (settings) now pass; every
  P0–P8 `'claude'` site type-checks unchanged.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 (whole project) + `npm run lint` 0
  errors (14 pre-existing warnings) + `npx vitest run` full suite 247 files / 1778
  tests pass.
- **Commit:** `9c949b37`.
- **Deviation:** none beyond the build-green additive fan-out (the two new
  `PluginSettings` fields are required, not optional, per SPEC-PV-001/027, so the
  three full-literal construction sites + two exact-key tests grow in the same task —
  the established P3/P4 additive-grow pattern). `@/domain/settings` now imports the
  pure type `ProviderId` from `@/domain/chat` — a domain-internal acyclic type dep
  (`ProviderId.ts` has no imports), not a layer violation (ADR-001 forbids only
  cross-layer imports).

### T-PV-004 — RED frozen `ProviderDescriptor` capability matrix (🧪 qa)

- **Spec/test:** TEST-PV-020/021/022/023; SPEC-PV-002/022;
  REQ-PV-001/020/021/022/023/103; NFR-PV-014.
- **Files:** `tests/domain/chat/providers/ProviderDescriptor.test.ts` (new — the
  `ProviderCapabilities`/`ProviderDescriptor` exact-key shape legs + the full
  SPEC-PV-022 per-flag truth table per provider + the `Object.freeze` invariant +
  the distinct `blankTabOrder` + the `isEnabled` claude-always / non-claude
  membership + the pure `ownsModel` predicate + the never-throws assertion).
- **Outcome:** done — RED confirmed: the test suite fails to import (no
  `@/domain/chat/providers/ProviderDescriptor` module).
- **Commit:** `ebde7ae4`.

### T-PV-005 — `ProviderDescriptor.ts` frozen matrix + barrel (🔨 dev)

- **Spec/req:** SPEC-PV-002/022; REQ-PV-001/020/021/022/023/103; NFR-PV-014.
- **Files:** `src/domain/chat/providers/ProviderDescriptor.ts` (new — the
  `ProviderCapabilities` + `ProviderDescriptor` interfaces; the three
  `Object.freeze`d descriptors + their frozen `capabilities` per the SPEC-PV-022
  matrix; `PROVIDER_DESCRIPTORS` frozen; `DEFAULT_CHAT_PROVIDER_ID`; the pure
  `isEnabled` predicates — claude-always-true / non-claude `enabledProviders`
  membership; the pure `ownsModel` predicates grounded verbatim in claudian:
  claude = the fixed model ids `[haiku, sonnet, sonnet[1m], opus, opus[1m]]`, codex
  = `/^(gpt-|o\d)/i`, opencode = the `opencode:` prefix), `src/domain/chat/providers/
  index.ts` (new — the barrel). BACKED caps wired, GATED-OFF literal `false` (NG1).
  No `switch (providerId)`.
- **Outcome:** done — TEST-PV-020/021/022/023 all pass (11 tests).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 (whole project) + `npm run lint` 0
  errors + `npx vitest run tests/domain/chat/providers/ProviderDescriptor.test.ts`
  11 pass. No `obsidian`/`node:*`/Vue import in `src/domain/chat/providers/**`.
- **Commit:** `c1b441d3`.
- **Deviation:** none.

### T-PV-006 — RED pure `resolveProvider` helpers (🧪 qa)

- **Spec/test:** TEST-PV-002/003/060/061 + EC-PV-2/3/9; SPEC-PV-003/029;
  REQ-PV-002/003/006/060/061; NFR-PV-014.
- **Files:** `tests/domain/chat/providers/resolveProvider.test.ts` (new — the
  blank-tab-ordered enabled filter (`[claude]` / `[codex, claude]` /
  `[opencode, codex, claude]`, fresh array), the active fallback
  (no-record/disabled → claude), the model-ownership resolve (codex/opencode/claude
  owned + unowned → fallback), the never-throws legs).
- **Outcome:** done — RED confirmed: the suite fails to import (no `resolveProvider`
  module).
- **Commit:** `5e62433e`.

### T-PV-007 — `resolveProvider.ts` pure helpers + barrel (🔨 dev)

- **Spec/req:** SPEC-PV-003/029; REQ-PV-002/003/006/060/061; NFR-PV-014.
- **Files:** `src/domain/chat/providers/resolveProvider.ts` (new — pure/total
  `listEnabledProviders` [filter `isEnabled` + sort `blankTabOrder`, fresh array],
  `resolveActiveProvider` [recorded-if-registered-and-enabled, else
  `DEFAULT_CHAT_PROVIDER_ID`], `resolveProviderForModel` [first `ownsModel`, else
  `resolveActiveProvider`]; no `switch (providerId)` — gates on the descriptor data;
  `recorded?.isEnabled(settings) === true` to satisfy strict-boolean +
  optional-chain), `src/domain/chat/providers/index.ts` (barrel grows the three
  re-exports).
- **Outcome:** done — TEST-PV-002/003/060/061 + EC-PV-2/3/9 all pass (13 tests).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 (whole project) + `npm run lint` 0
  errors + `npx vitest run` 13 pass. No `obsidian`/`node:*`/Vue import; no
  `switch (providerId)` (grep-clean).
- **Commit:** `645bff2d`.
- **Deviation:** none.

### T-PV-008 — RED the three port shapes (🧪 qa)

- **Spec/test:** TEST-PV-112 (port-shape leg); SPEC-PV-004/006/007;
  REQ-PV-001/070..073/080..083/112; NFR-PV-006.
- **Files:** `tests/domain/ports/ProviderRegistryPort.test.ts` (new — the 7
  pure-sync reads + own key + barrel), `tests/domain/ports/SecretStorePort.test.ts`
  (new — `isAvailable` sync + 4 `Result` async methods + `providerSecretKey` =
  `provider.<id>.apiKey` + own key + barrel), `tests/domain/ports/HomeFsPort.test.ts`
  (new — `isAvailable` sync + 3 read-only `Result` methods, no write/delete +
  `HOME_FS_ROOTS = ['.codex','.claude']` + own key + barrel).
- **Outcome:** done — RED confirmed: the three suites fail to import (the ports +
  keys do not yet exist).
- **Commit:** `1c9e464c`.

### T-PV-009 — the three ports + keys + barrel + the SecretStorePort guard-relax (🔨 dev)

- **Spec/req:** SPEC-PV-004/006/007; REQ-PV-001/070..073/080..083/112; NFR-PV-006.
- **Files:** `src/domain/ports/ProviderRegistryPort.ts` (new — 7 pure-sync total
  reads), `src/domain/ports/SecretStorePort.ts` (new — `isAvailable`/`getSecret`/
  `setSecret`/`deleteSecret`/`listKeys` `Result`-typed + the `providerSecretKey`
  helper), `src/domain/ports/HomeFsPort.ts` (new — read-first `isAvailable`/
  `readFile`/`exists`/`listFolders`, no write/delete, + `HOME_FS_ROOTS`),
  `src/infrastructure/bridge/ports.ts` (added `PROVIDER_REGISTRY_PORT` +
  `SECRET_STORE_PORT` + `HOME_FS_PORT` keys, no aggregate), `src/domain/ports/index.ts`
  (barrel re-exports the three port types + `providerSecretKey` + `HOME_FS_ROOTS` +
  the descriptor/capability DTOs), `eslint.config.js` (the **guard-relax** — see
  deviation).
- **Outcome:** done — TEST-PV-112 port-shape legs pass (10 tests).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 (whole project) + `npm run lint` 0
  errors (deleted-symbol guard green) + `npx vitest run` 10 pass. No
  `obsidian`/`node:*` import in `src/domain/**`.
- **DEVIATION (guard-relax — contradicts the planner's no-relax verdict):**
  `eslint.config.js` had `@/domain/ports/SecretStorePort` in `DELETED_SUBSYSTEM_BAN`
  (`:152`) and `SECRET_STORE_PORT` in `DELETED_INJECTION_KEYS` (`:175`) — the OLD
  P0-deleted secret symbols. SPEC-PV-006 / ADR-PV-002 §47 pin exactly that path +
  key with no alternative name, so P9 regrows them. This task drops ONLY those two
  stale entries (the documented per-phase regrow pattern — identical to P2's
  ICON_PORT drop), updating the guard comments to record the P9 regrow. The
  Obsidian-layer impl glob `@/infrastructure/obsidian/ObsidianSecretStore*` (`:142`)
  STAYS banned; every other P0-deleted symbol stays banned; `PROVIDER_REGISTRY_KEY`
  (a different name than the new `PROVIDER_REGISTRY_PORT`) stays banned. Recorded in
  `test-plan.md` + escalated in `workflow-state.md` (the planner's tasks.md
  guard-verification claim is a documented defect; resolution is unambiguous).
- **Commit:** `dfc50ad0`.

### T-PV-010 — widen `CHAT_RUNTIME_FACTORY` + `OPEN_PROVIDER_CONSENT` + fan-out (🔨 dev, 🪓)

- **Spec/test:** TEST-PV-010/011/082/113/114; SPEC-PV-005/031;
  REQ-PV-010/011/012/082/113/114; NFR-PV-001/008.
- **Slice (a) — RED seam extension (qa):** `tests/ui/chat/modalSeam.ts.test.ts`
  (extended — the widened `ChatRuntimeFactory` signature type leg, the `ok`/`err`
  construct legs, the still-throws-when-absent leg, the `OpenProviderConsentFn` +
  `OPEN_PROVIDER_CONSENT` + auto-decline-fallback legs). RED confirmed: type-level
  (no `OPEN_PROVIDER_CONSENT` export, old `()=>ChatRuntimePort` signature) + runtime
  (2 fail). **Commit:** `298b76ef`.
- **Slice (b) — GREEN widen + fan-out (dev):**
  - `src/ui/chat/modalSeam.ts` — `ChatRuntimeFactory` widened to
    `(providerId: ProviderId) => Result<ChatRuntimePort>`; appended
    `OpenProviderConsentFn` + `OPEN_PROVIDER_CONSENT` key + `useOpenProviderConsent()`
    (auto-decline `false` fallback). `useChatRuntimeFactory()` still throws-when-absent.
  - **Fan-out (same task, build-green — every call/provide-site):**
    `src/plugin/AgentSidebarView.ts` (provide `(providerId) => ok(bridge.createChatRuntime())`),
    `src/ui/main.ts` (same standalone provide + `import { ok }`),
    `src/ui/chat/ChatSurface.vue` (the injected widened factory adapted to the
    UNCHANGED P3 store binding `() => ChatRuntimePort` — pass default `'claude'`,
    unwrap the `Result`; the resolved-provider + honest construct-fail routing lands
    at the wire-in batch). The `tabsStore` `TabDepsBinding.createRuntime` contract is
    UNCHANGED (a P3 contract, not in the widen).
  - **Test-fixture fan-out (build-green, not assertion changes):** the seven
    ChatSurface mount fixtures (`ChatSurface{,.ts,.inline,.approvals,.mcp,.context,.toolbar}.test.ts`)
    provide the factory; updated `() => <runtime>` → `() => ok(<runtime>)` + the `ok`
    import so the adapter's `result.ok` unwrap works at runtime.
- **Outcome:** done — the RED seam legs pass; every call/provide-site compiles
  against the widened signature; the P3–P8 handles byte-identical; the default
  `'claude'` is byte-identical at runtime to P8 (the additivity invariant).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 (whole project — the interface-change
  fan-out is closed, no orphan call site) + `npm run lint` 0 errors (16 warnings — 2
  more than baseline: ChatSurface.vue `max-lines` soft warning from the adapter +
  one `one-component-per-file` from the added test probes, both pre-existing
  categories) + `npx vitest run tests/ui` 68 files / 418 pass + full suite (below).
  No `obsidian`/`node:*` import under `src/ui/**`; no `implements` break dangling.
  Full suite: 252 files / 1817 tests pass.
- **Commit:** `52b7dc54`.
- **Deviation:** none beyond the documented same-task interface-change fan-out
  (the one INTERFACE widen in P9, per the task's build-green directive). The store
  binding `TabDepsBinding.createRuntime` stays `() => ChatRuntimePort` (the
  ChatSurface adapter bridges the widened seam to it) — the resolved-provider
  routing is finalised at the wire-in batch (T-PV-031), out of this DOMAIN batch.

---

## INFRA batch (T-PV-011..018)

### T-PV-011/012 — the shared descriptor-table `ProviderRegistry` impl (🧪 qa → 🔨 dev)

- **Spec/test:** TEST-PV-001/002/003/013/020/060/061; SPEC-PV-008/029;
  REQ-PV-001/002/003/013/020..023/060/061; NFR-PV-014.
- **RED (T-PV-011):** `tests/infrastructure/providers/ProviderRegistry.test.ts`
  (new) — registered/enabled lists (claude-only default + blank-tab-ordered
  10/15/20), the descriptor/display-name/capability reads, the active/model
  resolve delegation, the never-throws assertion, and an AST/source guard that the
  reader has no `switch (provider…)` / `=== 'claude'|'codex'|'opencode'` branch.
  RED watched: `ProviderRegistry` did not resolve (transform error). 
- **GREEN (T-PV-012):** `src/infrastructure/providers/ProviderRegistry.ts` (new,
  ~70 lines) — a single `ProviderRegistry implements ProviderRegistryPort` over the
  frozen `PROVIDER_DESCRIPTORS` + the pure `resolveProvider` helpers. A
  `ReadonlyMap<ProviderId, ProviderDescriptor>` backs `getDescriptor`/
  `getDisplayNameKey`/`getCapabilities` (data-indexed, no id branch); the list +
  active + model reads delegate to the pure SPEC-PV-003 helpers. Coverage-included
  pure data — NOT under `obsidian/**`. No `obsidian`/`node:*`/Vue.
- **How the data-driven routing works:** the registry never branches on the id —
  reads index the frozen table by id through the map (total, closed union) and the
  resolve methods delegate to the pure helpers, which themselves filter/sort/`find`
  over the descriptor predicates. No `switch (providerId)` (NFR-PV-014).
- **Outcome:** done. 11/11 pass; vue-tsc 0; whole-project lint 0 errors (16
  pre-existing warnings).
- **Deviation:** the doc comment was reworded from the literal "No `switch
  (providerId)`" to "capability-gated, never branched on the provider id" so the
  source-guard test (which greps the file text) does not match the comment itself.
- **Commit:** `7af60ea7`.

### T-PV-013/014 — Mock scriptable registry/runtime/transport + in-memory secret + inert/seedable home-fs + fake-ports (🧪 qa → 🔨 dev)

- **Spec/test:** TEST-PV-011/050/051/052/053/070/072/073/080/081/083/100;
  SPEC-PV-011/025/026; REQ-PV-053/070..073/080..083/100; NFR-PV-007; EC-PV-7/11/12.
- **Files (new):**
  - `src/infrastructure/mock/MockProviderRuntime.ts` — `MockProviderRuntime`
    (scriptable per-provider `ChatRuntimePort`, exposes the frozen capability bag) +
    `MockProviderRuntimeRegistry` (the widened factory body: `setProviderConstructMode`
    drives the SPEC-PV-025 construct gate ok/keyRequired/cliNotFound/unavailable;
    `scriptProviderStream` + `setTransportMode` drive the SPEC-PV-026 stream/timeout/
    error-chunk matrix). A failed construct → `Result.err(<reason>)` (no key substring);
    an in-flight transport failure → a terminal `{type:'error'}` `StreamChunk` then
    `done`. No subprocess.
  - `src/infrastructure/mock/MockSecretStore.ts` — in-memory `SecretStorePort`
    (`seedSecret`/`getStoredKeys`/`setSecretStoreAvailable`; `isAvailable()` default
    true; round-trip set/get/delete/listKeys; the unavailable gate → `err`). No real
    OS secret; the value never leaves the in-memory map.
  - `src/infrastructure/mock/MockHomeFs.ts` — inert/seedable `HomeFsPort`
    (`isAvailable()→false` until `seedHomeFile` flips it; readFile/exists/listFolders;
    the path-escape rule). No `node:fs`.
  - `src/infrastructure/providers/homeFsPath.ts` — the PURE `isInsideHomeRoot`
    path-escape check (coverage-included; the single source of truth the Mock + the
    real `HomeFileSystem` share).
- **Files (edited):** `src/infrastructure/mock/MockBridge.ts` (added the
  `providerRegistry` / `providerRuntimeRegistry` / `secretStore` / `homeFs` getters
  backed by the shared `ProviderRegistry` + the three Mock impls);
  `tests/__fakes__/fake-ports.ts` (added the four members + a `DEFAULT_SETTINGS`-free
  factory wiring through the bridge).
- **Tests (new):** `tests/infrastructure/mock/MockProviderRuntime.test.ts`,
  `MockSecretStore.test.ts`, `MockHomeFs.test.ts`,
  `tests/infrastructure/providers/homeFsPath.test.ts`, + the extended
  `tests/__fakes__/fake-ports.test.ts` (the four provider members).
- **fake-ports members:** `providerRegistry` (the shared descriptor table),
  `providerRuntimeRegistry` (the scriptable construct/transport switches), `secretStore`
  (in-memory + availability switch), `homeFs` (inert/seedable). The P1 no-arg
  `bridge.createChatRuntime()` (Claude `MockChatRuntime` for the `CHAT_RUNTIME_PORT`
  provide) is UNCHANGED — the widened per-tab factory routes through
  `providerRuntimeRegistry.createChatRuntime(providerId)` at the wire-in batch.
- **Outcome:** done. 52 provider/secret/home-fs/fake-ports tests pass; the existing
  `createChatRuntime.test.ts` (P1 Claude factory) stays green; vue-tsc 0; whole-project
  lint 0 errors (16 pre-existing warnings).
- **Deviation:** the scriptable runtime registry is exposed as a separate
  `providerRuntimeRegistry` getter (its `createChatRuntime(providerId): Result`) rather
  than overloading the existing no-arg `bridge.createChatRuntime(): ChatRuntimePort`,
  which the P1 `CHAT_RUNTIME_PORT` provide + the existing test depend on. The spec
  method name `createChatRuntime(providerId)` lives on the registry object; the wire-in
  batch (T-PV-031) routes the per-tab factory through it. No behaviour change to the P1
  contract (additivity invariant, NFR-PV-001). The early `if (this.cancelled)` reads use
  a private `isCancelled()` opaque accessor (mirrors `MockChatRuntime`) to satisfy
  `no-unnecessary-condition`.
- **Commit:** `50a0fdd7`.

### T-PV-015/016 — LocalStorageBridge inert non-Claude runtime + in-memory secret + inert home-fs (🧪 qa → 🔨 dev)

- **Spec/test:** TEST-PV-073/083/100 (LS legs); SPEC-PV-012; REQ-PV-073/083/100;
  NFR-PV-012; EC-PV-8.
- **Files (new):**
  - `src/infrastructure/localstorage/LocalStorageProviderRuntime.ts` —
    `LocalStorageProviderRuntimeRegistry.createChatRuntime(providerId)`: `'claude'` →
    `ok(new FixtureChatRuntime())` (unchanged P1 demo runtime); non-Claude →
    `err('unavailable')` (no Node subprocess; degrades, never errors, EC-PV-8).
  - `src/infrastructure/localstorage/LocalStorageSecretStore.ts` — in-memory
    `SecretStorePort` (`isAvailable()→true`; round-trips in a `Map`, NOT localStorage —
    a secret must never persist device-local, NFR-PV-002).
  - `src/infrastructure/localstorage/LocalStorageHomeFs.ts` — inert `HomeFsPort`
    (`isAvailable()→false`; reads degrade to `ok(absent/empty)` / the path-escape `err`;
    no `node:fs`).
- **Files (edited):** `src/infrastructure/localstorage/LocalStorageBridge.ts` (added
  the four getters + `SecretStorePort`/`HomeFsPort` to the port-type import).
- **Tests (new):** `tests/infrastructure/localstorage/LocalStorageProviderRuntime.test.ts`,
  `LocalStorageSecretStore.test.ts`, `LocalStorageHomeFs.test.ts`.
- **Outcome:** done. 13 LS tests pass; vue-tsc 0; whole-project lint 0 errors (16
  pre-existing warnings).
- **Deviation:** the runtime registry distinguishes `providerId === 'claude'` (the one
  runnable demo runtime) from the rest. This is per-provider runtime CONSTRUCTION at the
  infra boundary (the same shape the ObsidianBridge uses), not the consuming-use-case /
  registry-reader branch the NFR-PV-014 grep gate targets. The shared `providerRegistry`
  remains data-driven (no id branch).
- **Commit:** `58f53787`.

### T-PV-018 — the Codex JSON-RPC + shared ACP transports (🔨 dev, coverage-excluded)

- **Spec/test:** SPEC-PV-010/026; REQ-PV-030..035/040..044/050..052/101;
  NFR-PV-004/005/007/011. Manual legs TEST-PV-M1/M2 + TEST-PV-030/031/033/035/040/044/101
  (scheduled in `test-plan.md`).
- **Files (new, coverage-excluded `src/infrastructure/obsidian/**`):**
  - `JsonRpcStdioChannel.ts` — the shared in-tree line-delimited JSON-RPC 2.0 channel
    over a child process's stdio (NO new runtime dep, ADR-PV-003 §5). Bounded explicit
    spawn (merged env + enhanced PATH + `windowsHide` + `shell:false`; Windows
    `.cmd`/`.bat` routed through `cmd.exe /d /s /c` + `windowsVerbatimArguments`,
    REQ-PV-031/101); `request` with a per-request timeout/`AbortController` → `Result.err`
    on timeout (the channel stays usable, REQ-PV-051); `notify`; server→client request
    handlers; a stderr ring-buffer; `onClose` so a dying subprocess surfaces; `shutdown`
    aborts in-flight + SIGTERM→SIGKILL(3s) (REQ-PV-035/044). `activeWindow` timers.
  - `CodexRpcTransport.ts` — the Codex app-server transport over the channel:
    `query(prompt)` streams `turn/delta`/`turn/thinking`/`turn/error` notifications as
    `StreamChunk`s, a start-request timeout → terminal error chunk (EC-PV-11), a dying
    subprocess → terminal `{type:'error'}` chunk with the stderr detail (EC-PV-12),
    `steer(message)` (turn-steer, REQ-PV-033), `shutdown()`.
  - `AcpTransport.ts` — the shared ACP transport over the channel: `initialize` +
    `prompt(text)` streaming `session/update` deltas as `StreamChunk`s; no steer
    (Opencode, REQ-PV-043); the same timeout/error-chunk/shutdown posture.
- **Transport approach (no new dep):** both transports are thin wrappers over the one
  shared `JsonRpcStdioChannel`; line-delimited JSON-RPC 2.0 over `node:child_process`
  stdio — no vendor SDK, mirrors `ClaudeCliChatRuntime`'s subprocess + `SdkMcpClient`'s
  bounded-spawn/enhanced-PATH posture. Externalize-only-if-genuinely-required is honoured
  (nothing reaches `build:web`).
- **Outcome:** done (coverage-excluded; behavioural gate = the manual legs). vue-tsc 0;
  whole-project lint 0 errors. No `obsidian` symbol leaks past these files (they use only
  `node:*` + `activeWindow`).
- **Deviation:** none. The transports are turn-time-owned inside each runtime
  (SPEC-PV-009 §5) — no separate app/UI turn-time transport call.
- **Commit:** `dcba7b99`.

### T-PV-017 — ObsidianBridge runtime registry + real SecretStorage + real HomeFileSystem (🔨 dev, coverage-excluded)

- **Spec/test:** SPEC-PV-009/031/034; REQ-PV-010..012/030..035/040..044/070/071/080/101/114;
  NFR-PV-004/007. Manual legs TEST-PV-M1/M2/M3 + TEST-PV-030..033/035/040..042/044/101
  (already scheduled in `test-plan.md`).
- **Files (new, coverage-excluded `src/infrastructure/obsidian/**`, names per the
  T-PV-001 directive — NOT `ObsidianSecretStore*` / no banned glob):**
  - `SecretStorage.ts` — the real `SecretStorePort` over `app.secretStorage`
    (sync `setSecret`/`getSecret`/`listSecrets`, wrapped in `trySync` → `Result`).
    `isAvailable()` probes whether `app.secretStorage` exists (the SPEC-PV-032 / 1.12.7
    availability check; older hosts gate the field off, no plain-store fallback,
    EC-PV-10). The `provider.<id>.apiKey` namespace key is normalised to the native
    store's lowercase-alphanumeric-dash id; `deleteSecret` clears to empty (the API has
    no delete) → a later `getSecret` is `ok(null)`. NEVER `data.json` (ADR-PV-002).
  - `HomeFileSystem.ts` — the real `HomeFsPort` over `node:fs/promises` rooted at
    `os.homedir()`. Read-first (no write/delete); every read runs the pure
    `isInsideHomeRoot` gate THEN a resolved-absolute-path containment re-check against
    `~/.codex`/`~/.claude` (defence in depth) → path-escape `err` (REQ-PV-081).
    `isAvailable()→true`.
  - `CodexRuntime.ts` — the Codex `ChatRuntimePort` owning `CodexRpcTransport`; reads
    the key via `SecretStorePort.getSecret(providerSecretKey('codex'))` into the
    subprocess env at the turn boundary; exposes the frozen `CODEX_DESCRIPTOR` caps
    (BACKED fork/turn-steer; GATED-OFF rewind/provider-commands/MCP = `false`); `steer`
    (REQ-PV-033). A missing key → terminal `error` chunk (honest, no key substring).
  - `OpencodeRuntime.ts` — the Opencode `ChatRuntimePort` owning `AcpTransport`; same
    key/error story; frozen `OPENCODE_DESCRIPTOR` caps (GATED-OFF rewind/fork/steer/MCP
    = `false`, provider-commands BACKED); no steer.
  - `ObsidianProviderRuntimeRegistry.ts` — the widened factory body: a **data-driven
    builder table** keyed by provider id (`Map<ProviderId, RuntimeBuilder>`) — `'claude'`
    reuses the P1 `ClaudeCliChatRuntime` UNCHANGED (`ok`, byte-identical P8); `'codex'`/
    `'opencode'` build their runtimes gated honestly on `secretStore.isAvailable()`
    (→ `err('keyRequired')`). **No `switch (providerId)`** (NFR-PV-014).
- **Files (edited):** `src/infrastructure/obsidian/ObsidianBridge.ts` — added the
  `providerRegistry` / `secretStore` / `homeFs` / `providerRuntimeRegistry` getters
  (lazy singletons; the registry is wired with `secretStore`/`homeFs`/vault-cwd/`this`
  logger) + the three port-type imports. The P1 no-arg `createChatRuntime()` (Claude
  `CHAT_RUNTIME_PORT` provide) is UNCHANGED.
- **How the registry constructs per-provider runtimes (data-driven, no switch):** the
  Obsidian registry holds a `Map<ProviderId, RuntimeBuilder>`; `createChatRuntime(id)`
  does `builders.get(id)?.(deps)`. Claude's builder returns the reused P1 runtime;
  Codex/Opencode builders gate on secret-store availability then construct the
  transport-owning runtime. No provider-id branch anywhere.
- **Which bridge backs what (+ coverage/manual):** ObsidianBridge backs the real
  `app.secretStorage` (`SecretStorage.ts`, coverage-excluded → TEST-PV-M3) + the real
  `node:fs` home-fs (`HomeFileSystem.ts`, coverage-excluded → TEST-PV-M1/M2) + the
  Claude/Codex/Opencode runtime registry (coverage-excluded → TEST-PV-M1/M2). The shared
  `ProviderRegistry` is coverage-included pure data (T-PV-012). MockBridge/LS back the
  in-memory/inert halves (T-PV-014/016) carrying the automated weight.
- **Outcome:** done (coverage-excluded; behavioural gate = the manual legs). vue-tsc 0;
  whole-project lint 0 errors (16 pre-existing warnings — incl. the long-standing
  ObsidianBridge `max-lines`); the existing 438 infra/fakes tests stay green.
- **Deviation:** the per-tab factory is NOT yet routed through the runtime registry
  (the provide-sites still pass the default-`'claude'` stand-in) — the resolved-provider
  wire-in is T-PV-031 (out of this INFRA batch). The key read happens async inside the
  runtime's turn boundary (not at the sync `createChatRuntime` construct), since the
  widened factory is synchronous; the construct gate uses the sync
  `secretStore.isAvailable()` probe + (at turn time) the async key read → honest terminal
  error chunk. `deleteSecret` clears-to-empty because `app.secretStorage` exposes no
  delete method (Obsidian 1.11.4 API).
- **Commit:** `988d7997`.

---

## APPLICATION batch (T-PV-019..024)

### T-PV-019/020 — `SelectProviderUseCase` (🧪 qa → 🔨 dev)

- **Spec/test:** TEST-PV-004/010/011/012/060/071/100; SPEC-PV-013/023/029;
  REQ-PV-004/010/011/012/060/061/071/100/102; NFR-PV-005/014; EC-PV-4/5/8/13.
- **RED (T-PV-019):** `tests/application/chat/providers/SelectProviderUseCase.test.ts`
  (new, 12 tests) over the scriptable Mock `providerRegistry` + `providerRuntimeRegistry`
  factory + the in-memory `settings`: select (persist device-local + construct-ok /
  construct-err honest-notice with the reason but NO seeded-secret substring /
  reset+cancel prior / null-prior no-op / no-throw / no-secret-in-store), selectForModel
  (auto-switch to a codex-owned `gpt-` model / no-op `ok(prior)` for a claude-owned model
  / unowned-model fallback), and a source guard that the use case has no `switch(provider…)`
  / `=== 'claude'|'codex'|'opencode'` branch. RED confirmed: the module did not resolve.
  **Commit:** `feaa6c0a`.
- **GREEN (T-PV-020):** `src/application/chat/providers/SelectProviderUseCase.ts` (new) +
  `src/application/chat/providers/index.ts` (new barrel). `constructor(registry, settings,
  runtimeFactory, feedback)`. `select(id, prior): Promise<Result<ChatRuntimePort>>` —
  `prior?.resetSession()` + `prior?.cancel()`; read-modify-write
  `saveSettings({ ...current, activeProvider: id })` (device-local, never `data.json`);
  `runtimeFactory(id)` → `ok` returns the runtime, `err` → `feedback.warn(<honest notice
  key>)` (the `providers.notice.{keyRequired,cliNotFound,unavailable}` copy, no secret) +
  returns the `err`. `selectForModel(model, prior)` — resolve owning vs active; no-op
  `ok(prior)` when they match and a live prior exists, else `select(owning, prior)`.
- **Signature:** `class SelectProviderUseCase { constructor(registry: ProviderRegistryPort,
  settings: SettingsPort, runtimeFactory: ChatRuntimeFactory, feedback: FeedbackService);
  select(id, prior): Promise<Result<ChatRuntimePort>>; selectForModel(model, prior):
  Promise<Result<ChatRuntimePort>> }`.
- **How no-switch + honest-gating are realised:** routing reads `registry.resolveProvider*`
  (data-driven over the descriptor predicates) + the widened factory; there is no
  `switch (providerId)` / per-id `===` branch (the source guard asserts it). The
  construct-fail reason (`keyRequired`/`cliNotFound`/`unavailable`, the Mock/real
  `Result.err` message) maps to a fixed notice-copy record → `feedback.warn` (logs +
  `showWarning`); the secret value is read only inside the runtime construction at the
  infra boundary, never in the use case, and never enters a notice/log (REQ-PV-071/102).
- **Outcome:** done — 12/12 pass; vue-tsc 0 (whole project); whole-project `npm run lint`
  0 errors (16 pre-existing warnings). No `obsidian`/`node:*`/Vue import.
- **Deviation:** the honest-notice path uses `FeedbackService.warn(message)` (logs +
  `NotificationPort.showWarning`) — `FeedbackService` has no literal `notify(...)` method;
  `warn` is the non-blocking severity that surfaces an honest reason without a secret
  (REQ-PV-102). The doc comment was worded "capability-gated routing, never branched on
  the provider id" (not the literal "No `switch (providerId)`") so the source-guard grep
  does not match the comment itself (same pattern as T-PV-012).
- **Commit (green):** `b7446528`.
- **Impl-log commit:** `f05c73b0` (this entry + the T-PV-017 commit-SHA fix).

### T-PV-023/024 — pure `buildProviderViewModel` (🧪 qa → 🔨 dev)

- **Spec/test:** TEST-PV-006/013/024/034/043/062/063/064/090; SPEC-PV-015/029;
  REQ-PV-002/006/013/024/034/043/062/063/064/090/114; NFR-PV-014; EC-PV-1/14/15.
- **RED (T-PV-023):** `tests/application/chat/providers/buildProviderViewModel.test.ts`
  (new, 12 tests): options (blank-tab-ordered rows + `isActive`/`isDefault` +
  `active`), `showChooser = enabled>1` (single-Claude → false byte-identical P8; empty
  list total), the per-flag widget VM from each provider's frozen bag (Claude all-but-
  steer/service-tier; Codex no rewind/commands/MCP, fork+steer+service-tier on; Opencode
  no rewind/fork/steer/MCP, commands on; field-for-field equality), the source guard +
  never-throws. RED confirmed: the module did not resolve. **Commit:** `b8a6e5cd`.
- **GREEN (T-PV-024):** `src/application/chat/providers/buildProviderViewModel.ts` (new) +
  the barrel grows the function + the three DTO type re-exports. The pure
  `buildProviderViewModel(enabled, active, activeCapabilities): ProviderViewModel` maps
  the enabled descriptors to `ProviderOptionVM` rows + sets `showChooser = enabled.length
  > 1` + reads `widgets` field-for-field from the active bag.
- **Signature:** `buildProviderViewModel(enabled: readonly ProviderDescriptor[], active:
  ProviderId, activeCapabilities: ProviderCapabilities): ProviderViewModel` with
  `ProviderOptionVM { id, displayNameKey, isActive, isDefault }`, `ProviderWidgetVM
  { showRewind, showFork, showTurnSteer, showProviderCommands, showMcp, showServiceTier,
  reasoningControl }`, `ProviderViewModel { options, showChooser, active, widgets }`.
- **How no-switch + honest-gating are realised:** every widget flag is a direct read of
  the matching `activeCapabilities` field — `showRewind = supportsRewind`, … — so a
  GATED-OFF `false` in the frozen bag hides the affordance through the EXISTING gated VM,
  with no provider-id branch (the source guard asserts no `switch (provider…)` / per-id
  `===`). `showServiceTier` derives from `supportsTurnSteer` (Codex-only, matching the
  Mock runtime's `hasServiceTier` convention, SPEC-PV-015 service-tier note).
- **Outcome:** done — 12/12 pass; vue-tsc 0 (whole project); whole-project `npm run lint`
  0 errors (16 pre-existing warnings). Pure/total, DTO-only, no `obsidian`/`node:*`/Vue.
- **Deviation:** `showServiceTier` is derived as `activeCapabilities.supportsTurnSteer`
  (the frozen `ProviderCapabilities` bag carries no dedicated service-tier flag; turn-
  steer is the Codex-only marker the matrix + the Mock `getToolbarCapabilities` already
  use). The doc comment is worded "never branched on the provider id" (not the literal
  switch phrase) for the source guard (same pattern as T-PV-012/020).
- **Commit (green):** `1c760ab3`.

### T-PV-021/022 — `ProviderConsentGate` (🧪 qa → 🔨 dev)

- **Spec/test:** TEST-PV-082; SPEC-PV-014/024; REQ-PV-082/113/114; NFR-PV-003/005; EC-PV-6.
- **RED (T-PV-021):** `tests/application/chat/providers/ProviderConsentGate.test.ts` (new,
  6 tests) over the in-memory Mock settings + a stubbed `openConsent`: recorded-true →
  `ok(true)` no prompt; no-record → `openConsent` once + record the accept + `ok(true)`;
  declining → `ok(false)` persisted + a second call honours it without re-prompting;
  the auto-decline launcher → `ok(false)` recorded; per-provider records don't clobber;
  never throws. RED confirmed: the gate module did not resolve. **Commit:** `6b4f72bf`.
- **GREEN (T-PV-022):** `src/application/chat/providers/ProviderConsentGate.ts` (new) +
  the barrel + the domain `homeFsConsent` field/helper (see DEVIATION). `constructor(
  settings: SettingsPort, openConsent: OpenProviderConsentFn)`; `ensureConsent(id):
  Promise<Result<boolean>>` reads `homeFsConsent[homeFsConsentKey(id)]` → returns a
  recorded accept/decline without a prompt; else `openConsent(id)` once, persists the
  outcome device-local via read-modify-write `saveSettings`, returns `ok(outcome)`.
- **Signature:** `class ProviderConsentGate { constructor(settings: SettingsPort,
  openConsent: OpenProviderConsentFn); ensureConsent(id: ProviderId):
  Promise<Result<boolean>> }`.
- **How honest-gating is realised:** the gate never throws — a decline is `ok(false)`
  (the caller disables that provider's history honestly), not an `err`. The prompt opens
  ONLY through the injected `OpenProviderConsentFn` modal seam (auto-declines `false`
  when its real Obsidian `Modal` is absent, REQ-PV-113), never `window.confirm`. The
  record is one device-local write keyed `provider.homeFsConsent.<id>`, never a secret. A
  Claude-only user never invokes the gate (`readsHomeDir:false`, REQ-PV-114).
- **Outcome:** done — 6/6 pass; vue-tsc 0 (whole project); whole-project `npm run lint`
  0 errors (16 pre-existing warnings); the full project suite passes (exit 0). No
  `obsidian`/`node:*`/Vue import.
- **DEVIATION / ESCALATION (domain touch — SPEC contradiction the DOMAIN batch missed):**
  SPEC-PV-014 mandates the consent persist **device-local** through `SettingsPort` keyed
  `provider.homeFsConsent.<id>`, but `SettingsPort` exposes only `getSettings`/
  `saveSettings(PluginSettings)` and the DOMAIN batch's ACCEPTED RED tests froze
  `PluginSettings` to EXACTLY `{locale, logLevel, sessionsFolder, maxTabs,
  customSystemPrompt, activeProvider, enabledProviders}` (TEST-PV-114 +
  `core-settings.test.ts:102` `Object.keys(DEFAULT_SETTINGS)` exact-key guard) — with no
  consent field and no arbitrary-key device-local store. There is no spec-faithful way to
  record consent through `SettingsPort` without a `PluginSettings` field. **Resolution
  (minimal, non-breaking):** added an OPTIONAL `homeFsConsent?: Readonly<Record<string,
  boolean>>` to `PluginSettings` + the pure `homeFsConsentKey(id)` helper, deliberately
  ABSENT from `DEFAULT_SETTINGS` so BOTH qa-owned guards stay green (verified: the 21
  settings/core/ObsidianBridge.settings tests pass unchanged — no qa assertion was
  modified). **Open follow-up for the WIRE-IN batch (T-PV-031, INFRA, NOT done here):**
  `ObsidianBridge._coerceSettings` reconstructs an explicit key list and currently DROPS
  `homeFsConsent`, so in production the consent would not round-trip across a reload (the
  gate would re-prompt). The Mock/LS bridges spread the full object, so the unit tests +
  the demo round-trip correctly. The real `ObsidianBridge` coercer must load-or-default
  `homeFsConsent` (a `coerceHomeFsConsent` helper) at wire-in to make the one-time consent
  durable on the production bridge. Escalated in `workflow-state.md`.
- **Commit (green):** `3758692f`.
