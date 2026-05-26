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
- **Commit:** _filled after commit_.
- **Deviation:** none.
