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

---

# APPLICATION batch (T-SS-014..019)

The PURE `buildSettingsViewModel` + the read-only discovery mapping + the
`EnvSnippetService` (secret-split) + the env→subprocess-env resolution helper.
All under `src/application/settings/**` — pure / port-driven, no
`obsidian`/`node:*`/Vue (NFR-SS-003); `Result`-typed, never throws; no
`switch(providerId)` (NFR-SS-008). Each task RED-first then green.

### T-SS-014 — RED buildSettingsViewModel ordered capability-gated VM (🧪)

- **Spec/test:** TEST-SS-001/002/004/005/007/010/011/015/020/022/080/081/082/083/093;
  SPEC-SS-006/007; SPEC-SS-016/020/021; NFR-SS-008; EC-SS-1/2/8/9/10.
- **Files:** `tests/application/settings/buildSettingsViewModel.test.ts` (new, 25
  cases — section ordering, shared P0 core + permission/keyboardNav, Claude no
  toggle, non-Claude toggle-first, environment editors + snippet list, determinism,
  apiKeyField tri-state, modelPicker empty + preselect, mcpManager/mcpDocNote,
  slash/agent definition gate, approvals + permissionMode, Claude-only baseline,
  union no-secret + read-only no-onChange, no-switch source guard over the
  comment-stripped source).
- **Outcome:** done — RED confirmed (module missing).
- **Commit:** `ba392060`.

### T-SS-015 — buildSettingsViewModel.ts + SettingsControl union (🔨)

- **Spec/req:** SPEC-SS-006/007; SPEC-SS-016/020/021; REQ-SS-001/002/004/005/010/011/
  015/020/022/080/081/082/083/093; NFR-SS-008; EC-SS-1/2/8/9/10.
- **Files:** `src/application/settings/buildSettingsViewModel.ts:1-220` (new — the
  PURE total `buildSettingsViewModel` + the 14-member `SettingsControl` discriminated
  union + the `SettingsViewModel`/`SettingsSection` DTOs; the shared/provider/
  environment section builders; `resolveApiKeyState`/`buildModelPicker` helpers),
  `src/application/settings/index.ts:1-16` (new barrel).
- **Outcome:** done — TEST-SS ids pass (25/25). Sections ordered
  `[shared, …enabled blank-tab-order, environment]`; each provider section gates on
  the capability bag (apiKeyField iff needsApiKey + tri-state from secretKeysSet/
  availability; modelPicker preselect providerDefaultModel[id] else defaultModelId,
  empty flag; mcpManager iff supportsMcpTools else mcpDocNote; slashList iff
  supportsProviderCommands && definitions.slash; agentList iff agent||skill; approvals
  unconditional). No member carries a secret value (apiKeyField = `{kind,providerId,
  state}` only).
- **Verify:** whole-project vue-tsc 0 + whole-project lint 0 errors (16 pre-existing
  warnings only) + 25/25; no `obsidian`/`node:*`/Vue import in
  `src/application/settings/**`; no `switch(providerId)`/`=== 'claude'…` (gates on the
  registry's enabled list + the descriptor enablement predicate + the capability bag).
- **Commit:** `3c142be3`.
- **Deviation:** the per-enabled-provider env-scope editors render in blank-tab order
  (mirrors the section order) rather than a Claude-first order — the spec does not pin
  the per-provider editor order; blank-tab order keeps it consistent with the section
  ordering. Provider-section control order follows the UX layout (A.0): toggle →
  apiKeyField → modelPicker → slashList → agentList → mcp(manager|docNote) → approvals.

### T-SS-016 — RED read-only agent/skill + slash discovery mapping (🧪)

- **Spec/test:** TEST-SS-030/031/040/041; SPEC-SS-008; EC-SS-9.
- **Files:** `tests/application/settings/discoverDefinitions.test.ts` (new, 8 cases —
  command→slash + skill→agent mapping, no write affordance on rows, load-or-default
  `[]` on a rejected `getEntries` / empty catalog, the `hasProviderDefinitions`
  predicate: agent always false, slash/skill from the non-empty catalogs, omit when
  both empty; over an inline stub catalog).
- **Outcome:** done — RED confirmed (module missing).
- **Commit:** `b149c730`.

### T-SS-017 — discoverDefinitions.ts + hasProviderDefinitions (🔨)

- **Spec/req:** SPEC-SS-008; REQ-SS-030/031/040/041; EC-SS-9.
- **Files:** `src/application/settings/discoverDefinitions.ts:1-86` (new —
  `discoverDefinitions(catalog)` mapping `getEntries('command'|'skill')` to the
  read-only `slash {name,description}` + `agent {name,description,kind}` shapes via
  `tryAsync` load-or-default; `makeHasProviderDefinitions(catalog)` building the
  `(id) => {slash,skill,agent}` predicate, agent:false), barrel grows.
- **Outcome:** done — TEST-SS-030/031/040/041 pass (8/8). Read-only; agent list
  sourced from skills, omitted when both catalogs empty; never throws.
- **Verify:** whole-project vue-tsc 0 + whole-project lint 0 errors + 8/8; no raw
  try/catch (uses `tryAsync`); no `obsidian`/`node:*`/Vue.
- **Commit:** `2d423fc8`.
- **Deviation:** the catalog is provider-agnostic in P4 (no per-provider source), so
  `hasProviderDefinitions` returns the same presence for every id — matches SPEC-SS-008
  ("the catalog is provider-agnostic in P4; P10 reads it for the active provider's
  section read-only"). Initial impl used raw try/catch; reworked to `tryAsync` to clear
  the Result-discipline `no-restricted-syntax` lint rule.

### T-SS-018 — RED EnvSnippetService (🧪)

- **Spec/test:** TEST-SS-052/053/060/061/062/063/064/066/067/090/094; SPEC-SS-009;
  SPEC-SS-018/019/022; NFR-SS-002/006/008; EC-SS-5/6/11/12/13/14.
- **Files:** `tests/application/settings/EnvSnippetService.test.ts` (new, 14 cases over
  `fake-ports` secretStore+settings — list load-or-default + round-trip, name guard
  (nothing persisted), secret split (provider auth → secretRef + secret store;
  non-secret → inline; markSecretKeys), zero-secret-bytes in data.json, invalid
  context-limit drop-but-save, edit secret-slot reconcile + id preserve, remove-both +
  idempotence, apply scope-inference, applyScopeText split + review keys, masked
  readScope, Result.err with no secret substring on unavailable storage, no-switch
  source guard).
- **Outcome:** done — RED confirmed (module missing).
- **Commit:** `d9f483ed`.

### T-SS-019 — EnvSnippetService.ts (secret-split, Result-typed) (🔨)

- **Spec/req:** SPEC-SS-009; SPEC-SS-018/019/022; REQ-SS-050..053/060..064/066/067/090/
  094; NFR-SS-002/006/008; EC-SS-5/6/11/12/13/14.
- **Files:** `src/application/settings/EnvSnippetService.ts:1-300` (new —
  `createEnvSnippetService(deps)` factory composing `SettingsPort` + `SecretStorePort`
  + the injected `ProviderDescriptor[]`; `EnvSnippetService` interface +
  `EnvSnippetInput`; `splitEntries`/`writeSecrets`/`deleteSecretsFor`/`saveSnippets`/
  `buildStruct`/`mergeScopeEntries` helpers; list/create/edit/remove/apply/
  applyScopeText/readScope), barrel grows.
- **Outcome:** done — all listed TEST-SS ids pass (14/14). The secret split routes
  provider-owned auth keys (`isSecretEnvKey`) + caller `markSecretKeys` to
  `setSecret(envSecretKey(scope,key), value)` + a `{kind:'secretRef'}` entry — the
  struct/data.json carry ZERO secret bytes; non-secret → `{kind:'inline'}`. Name guard
  errs `settings.envSnippets.nameRequired` (nothing persisted); edit reconciles secret
  slots (delete orphaned refs, set new) preserving the id; remove clears both stores
  idempotently; apply infers an undeclared scope (over `KEY=x` lines); applyScopeText
  splits via `getEnvironmentScopeUpdates` + returns the out-of-scope review keys;
  readScope returns secretRefs MASKED (never resolved). Every method returns `Result`
  (no throw, no secret substring in err).
- **Verify:** whole-project vue-tsc 0 + whole-project lint 0 errors + 14/14; no raw
  try/catch (uses `tryAsync`); no `switch(providerId)`; no `obsidian`/`node:*`/Vue.
- **Commit:** `20e5295f`.
- **Deviation:** `apply` infers an undeclared scope over reconstructed `KEY=x` lines
  (the classifier reads only the key, and a bare key list has no `=` for
  `extractEnvironmentKey`) — behaviour-equivalent to inferring from the entry keys.
  `mergeScopeEntries` replaces by key (not append) so re-applying is idempotent. The
  secret-namespace scope for create/edit is `input.scope ?? inferred ?? 'shared'`.

### T-SS-019 (cont.) — resolveEnvScope/mergeScopeEnvs env→subprocess-env helper (🧪+🔨)

- **Spec/req:** TEST-SS-065; SPEC-SS-013; REQ-SS-065; NFR-SS-002; EC-SS-15.
- **Files:** `tests/application/settings/resolveEnvScope.test.ts` (new, 7 cases),
  `src/application/settings/resolveEnvScope.ts:1-65` (new — `resolveEnvScope(entries,
  secretStore)` resolves inline verbatim + a secretRef via `getSecret` at the boundary
  (absent → omitted; failure → err); `mergeScopeEnvs(base, shared, provider,
  secretStore)` composes `{...base, ...shared, ...provider}`), barrel grows.
- **Outcome:** done — TEST-SS-065 passes (7/7). This is the application-layer pure
  composition the P9 runtimes (SPEC-SS-013, infra batch T-SS-023) call at the
  subprocess boundary; it is the ONE place a secret value is read, and the resolved
  value is returned only for the subprocess-env merge — never into a DTO/notice/log.
- **Verify:** whole-project vue-tsc 0 + whole-project lint 0 errors + 7/7; no
  `obsidian`/`node:*`/Vue.
- **Commit:** RED `7717db43`, green `5ae9541f`.
- **Deviation:** placed in `src/application/settings/` (not `src/infrastructure/
  obsidian/**`) so the secret-resolving composition is pure + unit-tested; the infra
  runtime wiring (T-SS-023, outside this batch) imports and calls it at the boundary.
  This keeps the coverage on the composition while the real subprocess injection stays
  the coverage-excluded manual leg (TEST-SS-M2).

## INFRA batch (T-SS-020..024)

### T-SS-020 — RED _coerceSettings six-field round-trip + Mock/LS env-slot SecretStore + Mock runtime env-capture (qa)

- **Spec/test:** SPEC-SS-012/014/019; TEST-SS-065/066/091/092; REQ-SS-015/065/066/091/092; NFR-SS-001/002/004/007.
- **Files:** `tests/infrastructure/mock/MockBridge.settings.test.ts` (new — the six additive fields round-trip a save->getSettings on MockBridge; the `env.<scope>.<KEY>` slot round-trips through the generic key/value SecretStore + the availability switch; byte-identical-absent default), `tests/infrastructure/mock/MockRuntimeEnvCapture.test.ts` (new — the `MockProviderEnvCapture` merged-env capture hook: inline as-is + secretRef resolved at the boundary; precedence; store-fail -> err + nothing recorded), `tests/infrastructure/obsidian/ObsidianBridge.settings.test.ts` (extended — the `_coerceSettings` six-field save->fresh-bridge reload round-trip; garbage -> absent; P9-shaped byte-identical), `tests/__fakes__/fake-ports.test.ts` (extended — the each-setting-in-its-correct-store routing leg).
- **Outcome:** done (RED) — the env-capture import + the `_coerceSettings` six-field wiring failed as expected; the Mock SettingsPort/SecretStore env-slot legs passed pre-impl (the Mock SettingsPort is a plain spread + the SecretStore is a generic key/value map, so the six OPTIONAL fields + the `env.<scope>.<KEY>` slot round-trip with no Mock change — confirming SPEC-SS-014 "unchanged surface").
- **Commit:** `877b58be`.
- **Deviation:** none.

### T-SS-021 — _coerceSettings six-field round-trip + Mock runtime env-capture (dev)

- **Spec/req:** SPEC-SS-012/014; REQ-SS-015/065/066/091/092; NFR-SS-001/002/004/007.
- **Files:** `src/domain/settings/PluginSettings.ts` (added the shared pure `coerceOptionalSettingsFields(raw)` assembly — coerces the six OPTIONAL fields, each present only when present), `src/infrastructure/obsidian/ObsidianBridge.ts` (`_coerceSettings` spreads `...coerceOptionalSettingsFields(obj)` after `homeFsConsent`), `src/core/core-settings.ts` (the write-path twin `validateSettings` spreads `...coerceOptionalSettingsFields(r)`), `src/infrastructure/mock/MockProviderRuntime.ts` (added the `MockProviderEnvCapture` class — `captureEnv(base, shared, provider, secretStore)` via the application `mergeScopeEnvs`, records `lastEnv` on success only), `tests/domain/settings/coerceSettings.test.ts` (extended — the `coerceOptionalSettingsFields` unit leg).
- **Outcome:** done — all target files green. The six fields round-trip a save->fresh-bridge reload; each OPTIONAL member present only when present (the exact homeFsConsent pattern); absent/garbage -> absent (no migration, NG8); a P9-shaped blob stays byte-identical. `MockProviderEnvCapture` records the merged subprocess env (inline as-is + secretRef resolved at the boundary, never logged).
- **Verify:** vue-tsc 0 + whole-project lint 0 errors + targeted vitest green.
- **Commit:** `03deb4bd`.
- **Deviation:** extracted the six conditional spreads into the shared pure `coerceOptionalSettingsFields` helper (PluginSettings.ts) rather than inlining them twice — inlining tripped the `complexity` lint cap (12/15 vs 10) in both write-path twins. The helper dedupes the assembly + keeps each method under budget; behaviour is identical (each field present only when present).

### T-SS-022 — RED env->subprocess merge leg over MockProviderEnvCapture (qa)

- **Spec/test:** TEST-SS-065 (merge leg); SPEC-SS-013; REQ-SS-065; NFR-SS-002; EC-SS-15.
- **Files:** `tests/infrastructure/mock/MockProviderRuntime.envMerge.test.ts` (new — the runtime turn-start composition `{ ...process.env, ...resolve(envScopes.shared), ...resolve(envScopes[provider:<id>]) }` over a settings-shaped envScopes record + the in-memory SecretStore: the precedence order, the inline-as-is + secretRef-resolved-at-boundary merge, the no-leak of the resolved value into the settings record).
- **Outcome:** done — pass-as-guard for the established merge composition (`MockProviderEnvCapture` landed in T-SS-021; this documents the runtime-perspective composition). The real subprocess injection is the coverage-excluded manual leg TEST-SS-M2.
- **Commit:** `079ac3b5`.
- **Deviation:** the merge composition was already proven by `MockProviderEnvCapture` (T-SS-021), so this leg passes immediately (a guard, not a fresh RED) — recorded as the automated baseline for TEST-SS-065. A dot-notation/no-unnecessary-condition lint fix to this file rode the T-SS-023 commit (the gate must pass whole-project).

### T-SS-023 — env->subprocess merge wired into the P9 runtimes (dev, coverage-excluded obsidian/**)

- **Spec/req:** SPEC-SS-013; REQ-SS-065; NFR-SS-002; EC-SS-15.
- **Files:** `src/infrastructure/obsidian/buildScopeEnv.ts` (new, coverage-excluded — reads `envScopes` off the SettingsPort + merges `{ ...base, ...resolve(shared), ...resolve(provider:<id>) }` over the runtime spawn env via the application `mergeScopeEnvs`; total — a settings/secret read failure degrades to the unmodified base, never throws), `src/infrastructure/obsidian/CodexRuntime.ts` + `OpencodeRuntime.ts` (each gains an optional `settings?: SettingsPort` dep + calls `buildScopeEnv` at the spawn boundary over the bare key env), `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (constructor gains optional `settings?`/`secretStore?` positional args; `_buildEnv` is now async + merges the scope env over the PATH-augmented base when both deps are present), `src/infrastructure/obsidian/ObsidianProviderRuntimeRegistry.ts` (the deps gain optional `settings?`; threaded to each builder), `src/infrastructure/obsidian/ObsidianBridge.ts` (the runtime-registry getter wires `settings: this`), `tests/infrastructure/mock/MockProviderRuntime.envMerge.test.ts` (lint fix).
- **Outcome:** done — TEST-SS-065 (the auto merge leg) green via `MockProviderEnvCapture`; 333 passed across infra/obsidian + mock + application settings. The env-scope secret is read ONLY at the spawn boundary (secretRef -> `getSecret`), never logged/returned to the UI/DTO. The optional deps keep the P9 env byte-identical when absent (NFR-SS-001). The real subprocess injection (the three `obsidian/**` runtimes) is coverage-excluded -> the manual leg TEST-SS-M2.
- **Verify:** vue-tsc 0 + whole-project lint 0 errors + 333 passed (infra/mock/app settings); no new `obsidian/**` banned-glob file (extends the P9 runtimes); no `shell:true`/eval — a bounded explicit env merge.
- **Commit:** `efb38745`.
- **Deviation:** added a shared `buildScopeEnv` helper under `obsidian/**` (rather than duplicating the read-settings + merge logic in each runtime) so the three runtimes share one coverage-excluded boundary that delegates to the unit-tested pure `mergeScopeEnvs`. The Claude CLI runtime — which reads no provider key (NFR-CC-006) — still receives the optional `settings`/`secretStore` so a user's OWN applied env-scope vars (incl. user-marked secretRefs) reach the spawned CLI (REQ-SS-065); absent deps leave the P1 PATH-augmented env unchanged.

### T-SS-024 — RED no-secret-leak + correct-store + Result-boundary guards (qa)

- **Spec/test:** SPEC-SS-019/022/026; TEST-SS-014/090/091/094; REQ-SS-014/090/091/094; NFR-SS-002/004/006.
- **Files:** `tests/application/settings/secretLeak.test.ts` (new — the zero-secret-bytes counter-metric across the provider-key + snippet-create + applyScopeText flows; the correct-store routing (secrets -> SecretStore `provider.<id>.apiKey` + `env.<scope>.<KEY>`; device prefs -> Settings); the masked-readScope no-echo), `tests/application/settings/resultBoundary.test.ts` (new — a failed secret write -> Result.err with no secret substring + no throw across a port; the service stays operable after a failure; every method returns a Result on a degraded store).
- **Outcome:** done — 10 pass-as-guard for the established invariants (the EnvSnippetService secret-split + the coerce* round-trip + the `tryAsync`+`Result` discipline); recorded as the gate baseline.
- **Verify:** vue-tsc 0 + whole-project lint 0 errors + 10 passed.
- **Commit:** `8a2daecd`.
- **Deviation:** none — the guards hold pass-as-guard (the invariants were established by T-SS-019/021); they are the recorded baseline the GATE batch (T-SS-031) re-confirms.
