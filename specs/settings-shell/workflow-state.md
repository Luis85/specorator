---
feature: settings-shell
area: SS
current_stage: implementation
status: active
last_updated: 2026-05-26
last_agent: dev (/spec:implement — INFRA batch T-SS-020..024)
epic: claudian-reboot
phase: P10
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.8/§4 P10 + audits + claudian-main stand in, mirrors P1-P9)
  research.md: skipped
  requirements.md: accepted (PRD-SS-001; REQ-SS-001..095, NFR-SS-001..012; 6 CLAR-SS resolved-by-recommendation, CLAR-SS-001 ADR-needed)
  design.md: complete (DESIGN-SS-001; Parts A UX / B UI / C Architecture; ADR-SS-001 + ADR-SS-002 accepted + filed; CLAR-SS-001/004 ratified by ADR-SS-001, CLAR-SS-002 by ADR-SS-002)
  spec.md: complete (SPEC-SS-001; 28 spec items SPEC-SS-001..028 across 6 layer groups; EC-SS-1..16; TEST-SS-001..095 + M1..M4; every REQ-SS chained to ≥1 SPEC + ≥1 TEST)
  tasks.md: complete (TASKS-SS-001; 35 tasks T-SS-001..035 across 6 batches + baseline; TDD-ordered RED-before-green; every SPEC-SS-001..028 covered; manual legs TEST-SS-M1..M4; NO guard-relax / NO new InjectionKey / NO new obsidian file)
  implementation-log.md: in-progress (DOMAIN T-SS-001..013 + APPLICATION T-SS-014..019 + INFRA T-SS-020..024 done + committed; PLUGIN T-SS-025..026 / STYLES T-SS-027..028 / WIRE-IN T-SS-029..030 / GATE T-SS-031..035 + manual legs TEST-SS-M1..M4 remain)
  test-plan.md: in-progress (TESTPLAN-SS-001; guard-verify note + Claude-only additivity baseline + DOMAIN automated status + manual legs TEST-SS-M1..M4)
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — settings-shell (P10)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted |
| 4. Design | `design.md` | complete (DESIGN-SS-001 + ADR-SS-001/002 accepted) |
| 5. Specification | `spec.md` | complete (SPEC-SS-001..028; EC-SS-1..16; TEST-SS-001..095 + M1..M4) |
| 6. Tasks | `tasks.md` | complete (TASKS-SS-001; 35 tasks T-SS-001..035) |
| 7. Implementation | `implementation-log.md` + code | in-progress (DOMAIN T-SS-001..013 + APPLICATION T-SS-014..019 + INFRA T-SS-020..024 complete + committed; PLUGIN T-SS-025..026 / STYLES T-SS-027..028 / WIRE-IN T-SS-029..030 / GATE T-SS-031..035 remain) |
| 8. Testing | `test-plan.md`, `test-report.md` | in-progress (test-plan scaffolded; report pending) |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P10 (settings shell)

P0-P9 merged to `next` (P9 providers-registry #450 / 4cc65597). P10 = the **settings shell** — the proper
Obsidian settings-tab surface that consolidates + exposes the P6-P9 seams as a per-provider settings UX.

**Scope (charter §4 P10 row + §3.8):** Provider tabs (Claude/Codex/Opencode each: settings tab, model
picker, agent/skill/subagent settings — surfaced read-only per the P9 capability matrix, slash-command
settings); Environment settings + env-snippet manager; keyboard navigation; approvals/permissions
surfaced in settings. CSS: `settings/*` (agent, base, env-snippets, mcp, opencode-model-picker, plugin,
slash) → `--sp-*`. **Mostly surfaces EXISTING P6-P9 machinery** (ProviderRegistryPort, SecretStorePort,
ToolbarCatalogPort, ApprovalRuleStorePort, McpConfigStorePort, the capability matrix) into the settings
tab — plus any genuinely-new bits (env settings / env-snippet store).

**Existing surface to expand:** `src/plugin/settings.ts` is the P0 slim `PluginSettingTab` (module-schema
DOM via the Obsidian `Setting` API — `coreSettingsModule` dropdowns, persists via `SettingsPort`). P10
grows it into the full provider-tabbed shell. The settings tab is `src/plugin/**` Obsidian DOM
(coverage-excluded) → the automated weight is a PURE settings view-model/builder + any new store/manager
(application/domain, tested); the Setting-API DOM rendering is coverage-excluded → manual legs.

**Likely P10 ADRs / decisions:**
- **Env-snippet store + environment settings** — where env snippets/env vars persist (device-local per
  CHARTER-REQ-SET? a new `EnvSnippetStorePort`?) + the shape; how they reach a provider's subprocess env
  (the P9 runtimes' env). May need an ADR (security: env vars can carry secrets → `SecretStorePort`?).
- The settings-shell composition: a pure `buildSettingsViewModel` (per-provider tabs + capability-gated
  sections) driving the coverage-excluded `PluginSettingTab` DOM; keyboard-nav; how agent/skill/subagent
  settings are surfaced (read-only — the providers expose them; full CRUD is out per the P9 posture).
- Whether the settings shell stays Obsidian-`Setting`-API DOM (the existing pattern) or mounts Vue
  (decide; the existing settings.ts is DOM — likely keep DOM, styled via `settings/*` --sp-* tokens).

**Out of P10 (later phases):** i18n 10-locale sweep (P11); a11y stylesheet + final parity (P12). P10
ships the settings shell consuming P6-P9; full agent/skill/subagent CRUD authoring is beyond the
capability-gated posture (read-only surfacing only).

**Epic constraints (every phase):** secrets→`SecretStorePort`/`app.secretStorage` never `data.json`;
device/user state→device-local; NO backwards compat; DDD inward imports + narrow ports + 3 bridges; Vue
never imports `obsidian`; the settings tab is `src/plugin/**` (the ONE place a `PluginSettingTab` may use
the Obsidian `Setting` API DOM — no `innerHTML`/`v-html`, build DOM via `createEl`/`setText`); `Result`;
tests mirror `src/` + `data-testid` POs for any Vue; coverage 80/70/80/80; perceptual `--sp-*` parity;
identity stays Specorator; WCAG 2.2 AA (keyboard nav is in-scope this phase); manifest untouched; CI
SHA-pinned + actionlint. VERIFY GATE (`npm run verify` + `npm run test:all` zero).

**Operating mode (human directive, /goal 2026-05-26):** AUTONOMOUS DRIVE the FULL remaining epic
(P10→P12) via dedicated subagents in loops — no per-phase human checkpoint; self-parity-review vs
claudian; merge each phase to `next` after a green gate + green CI; deploy to `D:/TestVault` after each
merge. Manual-Obsidian + parity-screenshot legs accumulate for the SINGLE FINAL human review gate.
**Split big UI/plugin batches into ~6-task chunks (the P8/P9 subagent-timeout lesson).**

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.8/§3.10/§4 P10 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (the settings tabs, per-provider
settings, model picker, agent/skill/subagent + slash-command settings, env-snippet manager, the
`settings/*` css) + the existing `src/plugin/settings.ts` + the P6-P9 ports.

## Hand-off notes

```
2026-05-26 (orchestrator): P10 bootstrapped on feature/settings-shell (off next; P0-P9 merged).
                          Scope = charter §3.8 settings shell — provider tabs + per-provider settings UX
                          (model picker / agent-skill-subagent read-only / slash-command) + environment
                          settings + env-snippet manager + keyboard nav + approvals surfaced. Mostly
                          surfaces P6-P9 seams into src/plugin/settings.ts (Obsidian Setting-API DOM,
                          coverage-excluded → automated weight in a pure settings view-model + any new
                          env-snippet store). Autonomous full-epic drive; split big batches. Next:
                          /spec:requirements (pm) grounded in charter §3.8 + audits + the claudian
                          settings sources + the existing settings.ts + the P6-P9 ports. KEY: the
                          env-snippet/environment-settings store + shape (device-local? secret?); the
                          pure settings view-model driving the coverage-excluded DOM; read-only
                          agent/skill/subagent surfacing (no CRUD, per the P9 capability-gated posture).
2026-05-26 (pm): /spec:requirements ACCEPTED → PRD-SS-001 (specs/settings-shell/requirements.md).
                          37 functional reqs REQ-SS-001..095 (tagged NEW vs SURFACED) + 12 NFRs
                          NFR-SS-001..012 + success metrics (counter-metric: zero secret bytes in
                          data.json) + release criteria. SPLIT: ~30 SURFACED (render/wire the P6-P9
                          ports — provider tabs/enable/order via ProviderRegistryPort; per-provider
                          API key via SecretStorePort; default model via ToolbarCatalogPort; MCP via
                          McpConfigStorePort; approval rules via ApprovalRuleStorePort; keyboard-nav
                          keys; read-only agent/skill/subagent + slash) vs ~10+ NEW (the env settings +
                          env-snippet manager subsystem — create/edit/remove/apply/inject + the
                          shared/provider scope classifier + the secret-bearing-value split; the pure
                          settings view-model; the WCAG 2.2 AA keyboard-navigable shell; safe-DOM).
                          DECISIONS: (a) env-snippet STORE = device-local STRUCTURE (SettingsPort) +
                          secret-bearing VALUES via SecretStorePort (CLAR-SS-001, ADR-NEEDED, parallels
                          ADR-PV-002 — flagged for architect); (b) settings tab STAYS Obsidian
                          Setting-API DOM, NOT Vue (CLAR-SS-002, no ADR); (c) agent/skill/subagent +
                          slash = READ-ONLY surfacing, no CRUD (CLAR-SS-003/005, no ADR); (d) keyboard
                          nav IN SCOPE — full WCAG 2.2 AA reach/operate (REQ-SS-072). 6 CLAR-SS items,
                          all resolved-by-recommendation; CLAR-SS-001 (+ CLAR-SS-004) ADR-ratify at
                          /spec:design; none blocks Stage 4. HAND-OFF → /spec:design (ux/ui-designer +
                          architect): Part A UX (per-provider tab layout + env-snippet manager +
                          key-field set/not-set + capability-gated section visibility) + Part B UI
                          (settings/* → --sp-* parity) + the ADR for CLAR-SS-001 (EnvSnippetStorePort /
                          the secret-vs-non-secret split).
2026-05-26 (architect): /spec:design COMPLETE → DESIGN-SS-001 (specs/settings-shell/design.md) Parts
                          A UX / B UI / C Architecture. Two ADRs filed + accepted + indexed:
                          - ADR-SS-001 (env-snippet store split, CLAR-SS-001 + CLAR-SS-004): the
                            NON-SECRET snippet STRUCTURE (EnvSnippetStruct: id/name/description/scope/
                            non-secret EnvEntry[]/contextLimits) persists DEVICE-LOCAL via SettingsPort as
                            additive OPTIONAL PluginSettings fields (mirroring the P9 homeFsConsent pattern,
                            round-tripped through _coerceSettings); SECRET-bearing values persist via
                            SecretStorePort under env.<scope>.<KEY>, the struct holding only a secretRef;
                            a PURE classifier (regrown providerEnvironment.ts) decides secret-vs-non-secret;
                            injection reuses the P9 runtime env merge; NO NEW PORT — compose SettingsPort +
                            SecretStorePort behind a pure EnvSnippetService (ADR-008); NO plaintext secret in
                            data.json/device-local; no new consent gate (reuse isAvailable()).
                          - ADR-SS-002 (view-model + DOM, CLAR-SS-002): a PURE buildSettingsViewModel(
                            settings, registry, getCatalog, secretKeysSet, secretStorageAvailable) →
                            SettingsViewModel (ordered sections: shared/core first then enabled providers in
                            blank-tab order, each with only the SUPPORTED controls), capability-gated by the
                            frozen bag, NEVER switch(providerId) (extends ADR-PV-001 §4); the PluginSettingTab
                            STAYS Obsidian Setting-API DOM (NOT Vue, NG2), coverage-excluded src/plugin/**
                            with manual legs; sections surface the existing P6-P9 ports; safe-DOM; native
                            keyboard nav (WCAG 2.2 AA).
                          DECISIONS: settings DOM-not-Vue confirmed (CLAR-SS-002); coverage split = tested
                          view-model/env-service/classifier/coercers (application+domain) vs coverage-excluded
                          Setting-API DOM (plugin) + subprocess env injection (infra). Six additive OPTIONAL
                          PluginSettings fields (envSnippets/envScopes/keyboardNav/providerDefaultModel/
                          defaultPermissionMode/providerCliPath), each with a coerce* round-trip; exact-key
                          contract byte-identical P9 (NFR-SS-001). Flagged for the planner: read-only
                          agent/skill/subagent + slash DISCOVERY SOURCE is under-specified in the PRD — pin
                          the read source in spec.md (escalate to PM if no P9 seam exists; read-only either
                          way per NG1). REQ-SS-067 contextLimits is 'could' — sequence last, do not gate the
                          must-tier snippet round-trip. HAND-OFF → /spec:specify (architect): pin the
                          EnvSnippetStruct/EnvEntry shape + envSecretKey namespace + the additive field names
                          + their coerce* rules + the SettingsControl union members + the secret-classification
                          rule; capture the Claude-only baseline on `next` before implementation.
2026-05-26 (architect): /spec:specify COMPLETE → SPEC-SS-001 (specs/settings-shell/spec.md). 28 spec items
                          SPEC-SS-001..028 across 6 layer groups (DOMAIN SS-001..005 / APPLICATION SS-006..009 /
                          INFRA+PLUGIN SS-010..014 / STYLES SS-015 / CROSS-CUTTING SS-016..028). PINNED: the six
                          additive OPTIONAL PluginSettings fields (envSnippets/envScopes/keyboardNav/
                          providerDefaultModel/defaultPermissionMode/providerCliPath, each absent from
                          DEFAULT_SETTINGS) + their six coerce* rules; envSecretKey(scope,key)=env.<scope>.<KEY>;
                          the EnvSnippetStruct/EnvEntry(inline|secretRef) shape + the EnvSnippetCodec +
                          parseContextLimit (bounds 1_000..10_000_000); the PURE classifyEnvKey + the 13-key
                          SHARED_ENVIRONMENT_KEYS set (regrown verbatim) + isSecretEnvKey rule (provider-owned
                          auth suffix /_API_KEY|_AUTH_TOKEN|_TOKEN/i OR markSecret); the env-key patterns as an
                          ADDITIVE ProviderDescriptor.environmentKeyPatterns? field (NOT a switch(providerId)) —
                          claude ^ANTHROPIC_/^CLAUDE_, codex ^OPENAI_/^CODEX_, opencode ^OPENCODE_; the PURE
                          buildSettingsViewModel(settings, registry, getCatalog, secretKeysSet,
                          secretStorageAvailable, hasProviderDefinitions)→SettingsViewModel (ordered shared/
                          provider:<id> blank-tab-order/environment, capability-gated, no switch(providerId)); the
                          14-member SettingsControl discriminated union + per-member port wiring; the
                          EnvSnippetService (list/create/edit/remove/apply/applyScopeText/readScope, secret-split,
                          Result-typed, composes SettingsPort+SecretStorePort, NO new port); the parseNavMappings
                          validator. EC-SS-1..16; TEST-SS-001..095 (U≈38 hold the 80/70/80/80 gate) + M1..M4
                          (real PluginSettingTab DOM render + keyboard-nav + modals / real subprocess env
                          injection / real app.secretStorage env-secret round-trip + no-data.json proof / parity
                          screenshots) for the single final epic gate. RESOLVED the read-only discovery source =
                          the P4 ProviderCommandCatalogPort.getEntries('command'|'skill'); NO P9 agent/subagent
                          seam → agents omitted when absent (read-only either way, NG1) — flagged NON-BLOCKING to
                          the planner (escalate to PM only if a richer agent source is wanted). Every REQ-SS +
                          NFR-SS chained to ≥1 SPEC-SS + ≥1 TEST-SS (no TBD). No new ADR needed (ADR-SS-001/002
                          cover the load-bearing choices). HAND-OFF → /spec:tasks (planner): decompose SPEC-SS-*
                          into T-SS-NNN. SEQUENCE the pure domain FIRST (SPEC-SS-001..005 — the additive fields +
                          coerce* + classifier + codec + scope routing + nav), then the application
                          (SPEC-SS-006..009 — view-model + env service), then the DOM tab (SPEC-SS-010..011, SPLIT
                          into ~6-task chunks per the P8/P9 subagent-timeout lesson), then the coerce round-trip +
                          MockBridge (SPEC-SS-012/014), with the subprocess env injection (SPEC-SS-013,
                          coverage-excluded) as the FINAL manual-leg task. Capture the Claude-only baseline on
                          `next` BEFORE implementation (SPEC-SS-028, pairs with NFR-SS-001/REQ-SS-093). REQ-SS-067
                          contextLimits is 'could' — sequence last, must not gate the must-tier snippet round-trip.
2026-05-26 (planner): /spec:tasks COMPLETE → TASKS-SS-001 (specs/settings-shell/tasks.md). 35 tasks
                          T-SS-001..035 decomposing SPEC-SS-001..028 across 6 batches + a baseline, mirroring
                          the P9 TASKS-PV-001 shape (baseline/guard-verify → strict RED(qa,🧪)-before-green(dev,
                          🔨) → additive-field + coerce* + 3-bridge → coverage-exclusion → manual-leg → gate).
                          BATCHES: B0 baseline T-SS-001; DOMAIN T-SS-002..013 (the six additive OPTIONAL
                          PluginSettings fields + six coerce* + envSecretKey; the additive
                          ProviderDescriptor.environmentKeyPatterns? + classifyEnvKey + the 13-key
                          SHARED_ENVIRONMENT_KEYS + isSecretEnvKey; EnvSnippet codec + parseContextLimit;
                          envScope routing; keyboardNav parser); APPLICATION T-SS-014..019 (PURE
                          buildSettingsViewModel + the 14-member SettingsControl union; the read-only P4
                          discovery mapping; the EnvSnippetService secret-split, Result-typed, NO new port);
                          INFRA T-SS-020..024 (the _coerceSettings six-field round-trip + Mock/LS env-slot
                          SecretStore + Mock runtime env capture; the env→subprocess merge into the P9
                          runtimes; the no-secret/correct-store/Result-boundary guards); PLUGIN T-SS-025..026
                          (the Setting-API DOM tab + the snippet edit/delete modals, coverage-excluded →
                          manual legs); STYLES T-SS-027..028 (the settings/* --sp-* slice, lightningcss-safe
                          ASCII comments + the token+additivity gate); WIRE-IN T-SS-029..030 (the
                          no-switch(providerId)/safe-DOM grep gate + the main.ts wire-in + smoke); GATE
                          T-SS-031..035 (green the invariants + the four manual legs TEST-SS-M1/M2/M3/M4 +
                          the feature-DoD verify + draft PR into next). GUARD VERDICT: NO guard-relax in P10
                          (verified against eslint.config.js — DELETED_SUBSYSTEM_BAN lists none of
                          @/domain/chat/environment/** · @/domain/settings/keyboardNav · @/application/settings/**;
                          no EnvSnippet*/classifyEnvKey/EnvSnippetService ban glob; DELETED_INJECTION_KEYS
                          irrelevant — NO new InjectionKey (compose SETTINGS_PORT + SECRET_STORE_PORT,
                          ADR-SS-001); NO new obsidian/** file — the env-secret reuses the P9 SecretStorage.ts
                          and the env→subprocess merge extends the P9 runtimes, so the still-banned
                          @/infrastructure/obsidian/ObsidianSecretStore* glob is NOT tripped). BUILD-GREEN
                          DISCIPLINE: both grows are PURELY ADDITIVE (no implements break) — the additive
                          ProviderDescriptor.environmentKeyPatterns? (T-SS-005) keeps the P9 frozen-matrix
                          tests green; the six OPTIONAL PluginSettings fields (T-SS-003, absent from
                          DEFAULT_SETTINGS) keep the P9 settings round-trip + exact-key contract byte-identical.
                          The ONE allowed switch is on SettingsControl.kind in the renderer, NEVER providerId.
                          ~6-task CHUNK boundaries for the implementer: C1 T-SS-001 / C2 T-SS-002..011 / C3
                          T-SS-012..017 / C4 T-SS-018..024 / C5 T-SS-025..030 / C6 T-SS-031..035. HAND-OFF →
                          /spec:implement (dev/qa): the FIRST ready task is T-SS-001 (📐 dev, baseline +
                          guard, no deps); then the domain RED legs T-SS-002/004/006/008/010 (qa) run in
                          parallel. Manual-Obsidian + parity-screenshot legs (T-SS-032/033/034, human) and the
                          subprocess env injection (T-SS-023 real obsidian/** coverage-excluded) accumulate for
                          the single final epic review gate.
2026-05-26 (dev): /spec:implement — DOMAIN batch T-SS-001..013 COMPLETE on feature/settings-shell
                          (off next). 13 tasks, one commit each (incremental). SHAs:
                          T-SS-001 docs 99c62687 · T-SS-002 RED 16624177 · T-SS-004 RED 2300b58a ·
                          T-SS-005 b805ef30 · T-SS-006 RED 448dec0f · T-SS-007 cf65a124 ·
                          T-SS-008 RED b482f1f9 · T-SS-009 4ef021a8 · T-SS-010 RED 4b1b04bf ·
                          T-SS-011 b6695e14 · T-SS-012 RED 2bb109c2 · T-SS-013 419e21b7 · T-SS-003 a1e14da6.
                          LANDED: the six additive OPTIONAL PluginSettings fields (envSnippets/envScopes/
                          keyboardNav/providerDefaultModel/defaultPermissionMode/providerCliPath, each ABSENT
                          from DEFAULT_SETTINGS) + envSecretKey + six pure/total coerce* helpers; the additive
                          ProviderDescriptor.environmentKeyPatterns? field + the three pinned frozen pattern
                          arrays; src/domain/chat/environment/{EnvSnippet,classifyEnvKey,envScope}.ts + barrel
                          (parseEnvironmentVariables / serializeEnvEntries-masked / parseContextLimit / the
                          13-key SHARED_ENVIRONMENT_KEYS / classifyEnvKey / isSecretEnvKey / the four scope-
                          routing fns); src/domain/settings/keyboardNav.ts + barrel (parseNavMappings /
                          buildNavMappingText). ADDITIVITY PROVEN: the P9 frozen-matrix (TEST-PV-020..023) +
                          settings round-trip + core-settings + ObsidianBridge.settings stay green (37 tests);
                          DEFAULT_SETTINGS exact-key byte-identical. VERIFY: whole-project vue-tsc 0 +
                          whole-project npm run lint 0 errors (16 pre-existing warnings) + the DOMAIN suites
                          106/106 green. Full vitest = 1833 passed / 4 FLAKY in src/ui/main standalone-mount
                          smoke (tests/ui/main.ts.test.ts, mount.rr.test.ts, toolbarMount.ts.test.ts) — all 4
                          PASS in isolation (11/11), unrelated to this pure-domain batch (no src/ui touched);
                          the prior post-T-SS-003 full run was exit 0. NO guard-relax / NO new InjectionKey /
                          NO new obsidian/** file (verdict recorded T-SS-001). DEVIATIONS: (a) reworded the
                          classifyEnvKey/envScope doc comments so the no-switch source-guard grep does not
                          match the comment (P9 T-PV-012 precedent); (b) parseNavMappings returns the
                          SPEC-SS-005 NavMappings shape (keyed scrollUp/Down/focusInput) not claudian's
                          Record<NavAction,string>; (c) getEnvironmentScopeUpdates fires the fallback bucket
                          only on meaningful-but-unsplittable content (empty/comment-only → []), per the
                          SPEC-SS-004 "only when nothing classified" wording + the RED test. NEXT: the
                          APPLICATION batch T-SS-014..019 (buildSettingsViewModel + SettingsControl union +
                          discoverDefinitions + EnvSnippetService) — owner dev/qa; depends on this batch's
                          frozen domain types. Then INFRA/PLUGIN T-SS-020..026, STYLES, WIRE-IN, GATE.
2026-05-26 (dev): /spec:implement — APPLICATION batch T-SS-014..019 COMPLETE on feature/settings-shell
                          (off next). RED-first then green per task, one commit each. SHAs:
                          T-SS-014 RED ba392060 · T-SS-015 3c142be3 · T-SS-016 RED b149c730 ·
                          T-SS-017 2d423fc8 · T-SS-018 RED d9f483ed · T-SS-019 (EnvSnippetService) 20e5295f ·
                          T-SS-019 (resolveEnvScope RED) 7717db43 · T-SS-019 (resolveEnvScope green) 5ae9541f.
                          LANDED under src/application/settings/ (+ barrel index.ts): buildSettingsViewModel.ts
                          (PURE total ordered capability-gated VM + the 14-member SettingsControl discriminated
                          union — sections [shared, enabled providers blank-tab-order, environment]; apiKeyField
                          tri-state from secretKeysSet/availability; modelPicker empty + preselect; mcpManager
                          else mcpDocNote; slash/agent definition gate; unconditional approvals/permissionMode/
                          keyboardNav; NO member carries a secret; NO switch(providerId)); discoverDefinitions.ts
                          (read-only P4 command→slash + skill→agent mapping + makeHasProviderDefinitions
                          predicate, agent:false, load-or-default via tryAsync); EnvSnippetService.ts
                          (createEnvSnippetService composing SettingsPort + SecretStorePort + the injected
                          ProviderDescriptor[]; list/create/edit/remove/apply/applyScopeText/readScope; the
                          secret-split — provider auth + markSecretKeys → setSecret(envSecretKey) + secretRef,
                          ZERO secret bytes in data.json; name guard; remove-both idempotent; apply
                          scope-inference; applyScopeText split + out-of-scope review keys; readScope masked;
                          every method Result-typed, no throw, no secret substring in err); resolveEnvScope.ts
                          (the env→subprocess-env helper the P9 runtimes consume — resolveEnvScope reads inline
                          verbatim + secretRef via getSecret AT THE BOUNDARY (the ONE place a secret is read),
                          mergeScopeEnvs composes {...base,...shared,...provider}). SECRET-SPLIT REALISED:
                          plaintext secrets never reach data.json/device-local/a DTO/notice/log — only the
                          struct's secretRef + the SecretStorePort slot; readScope keeps secretRefs masked; the
                          value is resolved only at the subprocess boundary (resolveEnvScope). NO-SWITCH
                          REALISED: gating reads the registry's enabled list + the descriptor enablement
                          predicate + the frozen capability bag + the descriptor environmentKeyPatterns
                          (classifier) — a source-guard test (comment-stripped) asserts no
                          switch(providerId)/=== 'claude'… in buildSettingsViewModel + EnvSnippetService.
                          VERIFY: whole-project vue-tsc 0 + whole-project npm run lint 0 errors (16 pre-existing
                          warnings: ChatSurface/chatStore/tabsStore max-lines + modalSeam/ErrorBoundary
                          one-component-per-file — none mine) + the P10 surface 173/173 (application/settings +
                          domain/settings + domain/chat/environment + domain/chat/providers); the new
                          application/settings suites = 54/54 (VM 25 + discovery 8 + EnvSnippetService 14 +
                          resolveEnvScope 7). NO new port / InjectionKey / obsidian file (composes the existing
                          SETTINGS_PORT + SECRET_STORE_PORT, ADR-SS-001 §5). DEVIATIONS: (a) per-enabled-provider
                          env-scope editors render in blank-tab order (spec does not pin the editor order); (b)
                          discoverDefinitions reworked from raw try/catch to tryAsync for the Result-discipline
                          lint rule; (c) apply infers an undeclared scope over reconstructed KEY=x lines
                          (behaviour-equivalent); (d) resolveEnvScope/mergeScopeEnvs placed in
                          src/application/settings/ (pure + unit-tested) — the infra runtime wiring (T-SS-023,
                          real obsidian/** coverage-excluded) imports + calls it at the boundary. NEXT: the
                          INFRA batch T-SS-020..024 (the _coerceSettings six-field round-trip + Mock/LS env-slot
                          SecretStore + Mock runtime env-capture; wire resolveEnvScope/mergeScopeEnvs into the P9
                          runtimes via T-SS-023; the no-secret/correct-store/Result-boundary guards) — owner
                          dev/qa; then PLUGIN T-SS-025..026 (DOM tab + modals), STYLES, WIRE-IN, GATE.
2026-05-26 (dev): /spec:implement — INFRA batch T-SS-020..024 COMPLETE on feature/settings-shell.
                          Per-task RED-before-green, one commit per task. SHAs: T-SS-020 RED 877b58be ·
                          T-SS-021 green 03deb4bd · T-SS-022 merge-leg 079ac3b5 · T-SS-023 green efb38745 ·
                          T-SS-024 guards 8a2daecd. VERIFY each task: vue-tsc 0 + WHOLE-project npm run lint 0
                          errors (16 pre-existing warnings — none mine) + targeted vitest green. (1) _coerceSettings
                          six-field round-trip: a shared PURE coerceOptionalSettingsFields(raw) helper (PluginSettings.ts)
                          coerces the six OPTIONAL fields each present-only-when-present; BOTH write-path twins
                          (ObsidianBridge._coerceSettings + core-settings.validateSettings) spread it after homeFsConsent
                          — byte-identical-absent P9 (the exact homeFsConsent pattern), garbage->absent, no migration.
                          (2) Mock/LS SettingsPort + SecretStore env.<scope>.<KEY> slots round-trip UNCHANGED (plain
                          spread + generic key/value map — SPEC-SS-014 "unchanged surface" confirmed). (3) The Mock runtime
                          env-capture = MockProviderEnvCapture (in MockProviderRuntime.ts) records the merged subprocess env
                          via the application mergeScopeEnvs. (4) env->subprocess merge wired into the 3 P9 runtimes via a
                          shared coverage-excluded obsidian/buildScopeEnv.ts: ClaudeCliChatRuntime/CodexRuntime/OpencodeRuntime
                          each gain an optional settings?: SettingsPort dep + call buildScopeEnv at the spawn boundary;
                          ObsidianProviderRuntimeRegistry threads deps.settings; ObsidianBridge wires settings: this. The
                          env-scope secret is read ONLY at the spawn boundary (secretRef -> getSecret), never logged/DTO/UI
                          (NFR-SS-002); optional deps -> P9 env byte-identical when absent. (5) the no-secret-leak +
                          correct-store + Result-boundary guards (secretLeak.test.ts + resultBoundary.test.ts) pass-as-guard.
                          DEVIATIONS: (a) extracted coerceOptionalSettingsFields to dodge the complexity lint cap (12/15 vs
                          10) in both write-path twins (behaviour identical); (b) buildScopeEnv is one shared obsidian/**
                          helper for the 3 runtimes (delegates to the unit-tested pure mergeScopeEnvs); (c) the Claude CLI
                          runtime (reads no provider key) still gets settings/secretStore so a user's OWN applied env-scope
                          vars reach the spawned CLI (REQ-SS-065). NEXT: PLUGIN T-SS-025..026 (the Setting-API DOM tab +
                          the env-snippet edit/delete modals, coverage-excluded -> manual leg TEST-SS-M1), then STYLES
                          T-SS-027..028, WIRE-IN T-SS-029..030 (register the expanded tab in main.ts + provide the
                          EnvSnippetService), GATE T-SS-031..035. MANUAL legs accumulating for the epic gate: TEST-SS-M2
                          (the real obsidian/** subprocess env injection — an applied env scope reaches the active
                          provider's real subprocess at a turn, secretRef resolved via getSecret at the infra boundary).
```
