---
id: IMPL-LOG-SS-001
title: Settings shell (P10) — Implementation Log
stage: implementation
feature: settings-shell
area: SS
epic: claudian-reboot
phase: P10
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-26
updated: 2026-05-26
---

# Implementation Log — Settings shell (P10)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green. The DOMAIN batch is T-SS-001..013; APPLICATION / INFRA-PLUGIN /
STYLES / WIRE-IN / GATE batches ride their own subagents.

## T-SS-001 — Baseline-capture + guard verification (📐, doc-only)

- **Spec/req:** NFR-SS-009 (parity baseline leg), NFR-SS-001 (additivity baseline),
  SPEC-SS-015/020/028, NFR-SS-011 (guard verification).
- **Files:** `specs/settings-shell/parity-screenshots.md` (new — baseline skeleton,
  the per-provider settings surfaces × 320/520/720 × light/dark, baseline column
  keyed to `claudian-main` `ClaudianSettings` / `providerEnvironment.ts` /
  `utils/env.ts` / `keyboardNavigation.ts` / `EnvSnippetManager` / the
  `style/settings/*` modules), `specs/settings-shell/test-plan.md` (new — the
  guard-verification note + the Claude-only additivity baseline + the manual
  TEST-SS-M1/M2/M3/M4 legs + the DOMAIN-batch automated status),
  `specs/settings-shell/implementation-log.md` (new — this file).
- **Outcome:** done.
- **Guard verification (NO relaxation needed):** the new P10 paths
  `@/domain/chat/environment/**`, `@/domain/settings/keyboardNav`,
  `@/application/settings/**` and the `EnvSnippet*` / `classifyEnvKey` /
  `EnvSnippetService` symbols match **no** `DELETED_SUBSYSTEM_BAN.group` glob and
  **no** `DELETED_INJECTION_KEYS.importNames` entry (read `eslint.config.js`
  2026-05-26). `@/domain/chat` + `@/application` regrew in P1/P9 and are off the ban
  list; there is no `@/domain/settings` ban (only `@/domain/feature` /
  `@/application/feature` / `@/application/migration` are banned). **NO new
  InjectionKey** — the env subsystem composes the existing `SETTINGS_PORT` +
  `SECRET_STORE_PORT` (ADR-SS-001 §5). **NO new `obsidian/**` impl file** — the
  env-secret round-trip reuses the P9 `src/infrastructure/obsidian/SecretStorage.ts`
  (already named to avoid the still-banned `@/infrastructure/obsidian/
  ObsidianSecretStore*` glob); the env→subprocess merge extends the P9 runtime
  files. **Verdict: NO guard-relax task in P10.**
- **Lint:** whole-project `npm run lint` over the pre-existing surface passes clean
  (0 errors, 16 pre-existing warnings; no new path referenced yet).
- **Commit:** `99c62687`.
- **Deviation:** none; no file under `src/` changed in this task.

## DOMAIN batch (T-SS-002..013)

### T-SS-002 — RED six additive PluginSettings fields + coerce* + envSecretKey (🧪 qa)

- **Spec/test:** TEST-SS-092/093; SPEC-SS-001/020; NFR-SS-001.
- **Files:** `tests/domain/settings/PluginSettings.ts.test.ts` (extended — the
  six-field type-level Equals legs + the absent-from-DEFAULT_SETTINGS exact-key
  byte-identity + the fully-recorded-object leg), `tests/domain/settings/
  coerceSettings.test.ts` (new — the six coerce* load-or-default table + round-trip
  + never-throws + envSecretKey).
- **Outcome:** done — RED confirmed (16 fail / 6 pass): the six coerce* + envSecretKey
  do not yet exist.
- **Commit:** `16624177`.

### T-SS-004 — RED additive ProviderDescriptor.environmentKeyPatterns field (🧪 qa)

- **Spec/test:** TEST-SS-051 (descriptor-field leg); SPEC-SS-002/020; NFR-SS-008.
- **Files:** `tests/domain/chat/providers/ProviderDescriptor.test.ts` (extended — the
  OPTIONAL `environmentKeyPatterns?: readonly RegExp[]` field-shape Equals leg +
  the three pinned per-provider pattern arrays). The `_descKeys` exact-key Equals
  grew by the additive member; the P9 matrix assertions are untouched.
- **Outcome:** done — RED confirmed (3 patterns tests fail, 11 P9 matrix pass).
- **Commit:** `2300b58a`.

### T-SS-005 — ProviderDescriptor.environmentKeyPatterns additive field (🔨 dev)

- **Spec/req:** SPEC-SS-002/020; REQ-SS-051; NFR-SS-008.
- **Files:** `src/domain/chat/providers/ProviderDescriptor.ts` (appended the OPTIONAL
  `environmentKeyPatterns?: readonly RegExp[]` field + the three Object.freeze'd
  pinned arrays: claude `[/^ANTHROPIC_/i, /^CLAUDE_/i]`, codex `[/^OPENAI_/i,
  /^CODEX_/i]`, opencode `[/^OPENCODE_/i]`), `tests/domain/settings/coerceSettings.test.ts`
  (dropped three redundant `as unknown` casts to satisfy no-unnecessary-type-assertion).
- **Outcome:** done — TEST-SS-051 descriptor-field leg passes; the P9 frozen-matrix
  suite (TEST-PV-020..023) stays fully green (14/14).
- **Verify:** vue-tsc 0 (only the known T-SS-002 RED outstanding) + whole-project lint
  0 errors (16 warnings).
- **Commit:** `b805ef30`.
- **Deviation:** none (purely additive).

### T-SS-006 — RED EnvSnippet shape + codec + parseContextLimit (🧪 qa)

- **Spec/test:** TEST-SS-060/067; SPEC-SS-003; EC-SS-12.
- **Files:** `tests/domain/chat/environment/EnvSnippet.test.ts` (new — the shapes,
  parseEnvironmentVariables byte-parity, serializeEnvEntries inline+masked-secret,
  parseContextLimit k/m + bounds + null-on-invalid + never-throws).
- **Outcome:** done — RED confirmed (module fails to import).
- **Commit:** `448dec0f`.

### T-SS-007 — EnvSnippet.ts (shape + codec + parseContextLimit) + barrel (🔨 dev)

- **Spec/req:** SPEC-SS-003; REQ-SS-014/050/060/064/066/067; EC-SS-12.
- **Files:** `src/domain/chat/environment/EnvSnippet.ts` (new — EnvironmentScope/
  EnvEntry/EnvSnippetStruct; PURE parseEnvironmentVariables; serializeEnvEntries —
  inline verbatim, secretRef MASKED never resolved; parseContextLimit + the
  [1_000,10_000_000] bounds; all total), `src/domain/chat/environment/index.ts` (new
  barrel). Extracted `unquoteEnvValue` to keep parseEnvironmentVariables under the
  complexity-10 gate.
- **Outcome:** done — 17/17 pass.
- **Verify:** whole-project lint 0 errors; no `obsidian`/`node:*`/Vue import in
  `src/domain/chat/environment/**`.
- **Commit:** `cf65a124`.
- **Deviation:** none.

### T-SS-008 — RED classifyEnvKey + SHARED_ENVIRONMENT_KEYS + isSecretEnvKey (🧪 qa)

- **Spec/test:** TEST-SS-051 (classifier leg); SPEC-SS-002; REQ-SS-051/066;
  NFR-SS-008; EC-SS-3.
- **Files:** `tests/domain/chat/environment/classifyEnvKey.test.ts` (new — the 13-key
  shared set, descriptor-driven classify, the secret predicate, empty-key fallback,
  never-throws, and a `node:path` source-guard asserting no switch(providerId)/===).
- **Outcome:** done — RED confirmed.
- **Commit:** `b482f1f9`.

### T-SS-009 — classifyEnvKey.ts + barrel (🔨 dev)

- **Spec/req:** SPEC-SS-002; REQ-SS-051/066; NFR-SS-008; EC-SS-3.
- **Files:** `src/domain/chat/environment/classifyEnvKey.ts` (new — the 13-key
  SHARED_ENVIRONMENT_KEYS verbatim, EnvKeyOwnership union, PURE classifyEnvKey
  iterating descriptor `environmentKeyPatterns` (no provider-id branch), PURE
  isSecretEnvKey provider-owned-auth-suffix OR markSecret), barrel grows.
  `tests/domain/chat/environment/classifyEnvKey.test.ts` (fixed the source-guard to
  resolve via `node:path` rather than the non-file `import.meta.url`).
- **Outcome:** done — TEST-SS-051 classifier leg passes (12/12).
- **Verify:** whole-project lint 0 errors; no `obsidian`/`node:*`/Vue import.
- **Commit:** `4ef021a8`.
- **Deviation:** the doc comment was reworded ("capability-gated, never branched on
  the provider id") so the source-guard grep does not match the comment itself —
  the documented P9 T-PV-012/020 precedent.

### T-SS-010 — RED keyboardNav parseNavMappings/buildNavMappingText (🧪 qa)

- **Spec/test:** TEST-SS-070/071; SPEC-SS-005; REQ-SS-070/071; EC-SS-7.
- **Files:** `tests/domain/settings/keyboardNav.test.ts` (new — the canonical render,
  the w/s/i round-trip, each error class, never-throws).
- **Outcome:** done — RED confirmed.
- **Commit:** `4b1b04bf`.

### T-SS-011 — keyboardNav.ts + barrel (🔨 dev)

- **Spec/req:** SPEC-SS-005; REQ-SS-070/071; EC-SS-7.
- **Files:** `src/domain/settings/keyboardNav.ts` (new — NAV_ACTIONS/NavAction/
  NavMappings, NAV_MAPPING_INVALID_KEY, PURE buildNavMappingText, PURE
  parseNavMappings — single-char + unique + each error class → {error}; defaults
  w/s/i; total), `src/domain/settings/index.ts` (new barrel re-exporting it).
  Extracted `parseLine`; used explicit `!== undefined`/`=== undefined` +
  `! ` non-null assertions to satisfy strict-boolean / assertion-style.
- **Outcome:** done — 11/11 pass.
- **Verify:** whole-project lint 0 errors; no `obsidian`/`node:*`/Vue import in
  `src/domain/settings/**`.
- **Commit:** `b6695e14`.
- **Deviation:** parseNavMappings returns the spec's `NavMappings` shape (keyed
  scrollUpKey/scrollDownKey/focusInputKey) rather than claudian's
  `Record<NavAction,string>` — the SPEC-SS-005 contract, semantically identical.

### T-SS-003 — six additive PluginSettings fields + coerce* + envSecretKey (🔨 dev)

- **Spec/req:** SPEC-SS-001/020; REQ-SS-021/060/067/070/071/083/092; NFR-SS-001/004.
- **Files:** `src/domain/settings/PluginSettings.ts` (appended the six OPTIONAL
  device-local fields — each ABSENT from DEFAULT_SETTINGS; added envSecretKey + the
  six pure/total coerce* helpers per the SPEC-SS-001 table; coerceKeyboardNav
  composes parseNavMappings, coerceEnvSnippets composes the EnvEntry validators),
  `tests/domain/settings/coerceSettings.test.ts` (replaced the `as EnvSnippetStruct`
  cast with `!` non-null assertion now that the coercer is typed).
- **Outcome:** done — TEST-SS-092/093 settings/coerce legs pass (22/22 across the two
  settings test files). The P9 frozen-matrix + settings round-trip + core-settings +
  ObsidianBridge.settings stay green (37 tests).
- **Verify:** whole-project vue-tsc 0 + whole-project lint 0 errors + the full
  background suite (after this commit) exit 0; no `obsidian`/`node:*`/Vue import in
  `src/domain/settings/**`.
- **Commit:** `a1e14da6`.
- **Deviation:** none (purely additive — the six fields OPTIONAL + absent from
  DEFAULT_SETTINGS).

### T-SS-012 — RED envScope PURE scope routing (🧪 qa)

- **Spec/test:** TEST-SS-052/053/064; SPEC-SS-004; NFR-SS-008; EC-SS-4/14.
- **Files:** `tests/domain/chat/environment/envScope.test.ts` (new — the out-of-scope
  review keys, single-scope infer, resolve-with-fallback, multi-key blob split +
  decorator attach + fallback bucket, the classifier-reuse no-switch guard,
  never-throws).
- **Outcome:** done — RED confirmed (module fails to import).
- **Commit:** `2bb109c2`.

### T-SS-013 — envScope.ts (PURE scope routing) + barrel (🔨 dev)

- **Spec/req:** SPEC-SS-004; REQ-SS-050/052/053/064; NFR-SS-008; EC-SS-4/14.
- **Files:** `src/domain/chat/environment/envScope.ts` (new —
  EnvironmentScopeUpdate + the four routing functions, ported 1:1 from
  providerEnvironment.ts:273-364 with throw-paths converted to total returns and the
  per-provider branch replaced by classifyEnvKey), barrel grows.
- **Outcome:** done — TEST-SS-052/053/064 pass (14/14).
- **Verify:** whole-project vue-tsc 0 + whole-project lint 0 errors; no
  `obsidian`/`node:*`/Vue import.
- **Commit:** `419e21b7`.
- **Deviation:** the fallback-scope bucket fires only when the blob has
  meaningful-but-unsplittable content (empty/comment-only → no update). Claudian
  returned the fallback for empty input too; the SPEC-SS-004 "only when nothing
  classified" wording + the RED test (`'' → []`) pin the meaningful-content guard.
  Reused the classifier so the routing is branch-free; no provider-id branch.
