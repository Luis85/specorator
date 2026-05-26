---
id: REVIEW-SS-001
title: Settings shell (P10) — Stage-9 review
stage: review
feature: settings-shell
area: SS
epic: claudian-reboot
phase: P10
status: complete
owner: reviewer
integration_branch: next
verdict: approve-with-conditions
created: 2026-05-27
updated: 2026-05-27
---

# Review — Settings shell (P10)

Stage-9 review of `feature/settings-shell` against `next` (@ `4cc65597`, which has
not advanced — `git diff next..HEAD` is the entire P10 feature). Reviewed: the full
diff (58 files, +10088 / −29), the P10 artifacts (requirements/design/spec/tasks/
implementation-log/test-plan), the two accepted ADRs (ADR-SS-001/002), and the
claudian-main parity reference. Targeted tests were re-run by the reviewer (the parent
runs the full suite + builds).

## Verdict

**Approve with conditions.** The P10 settings shell is genuinely wired (not built-but-
dead), the security surface is sound, additivity holds, and the env→subprocess merge
is wired into all three P9 runtimes. One **medium** content defect (R-SS-001) and two
**low** items are scheduled, none blocking the merge. The four coverage-excluded manual
legs (TEST-SS-M1/M2/M3/M4) remain **pending** and ride the single final epic human gate
— they are NOT self-claimed and the verdict does not assume them green.

| Severity | Count |
|---|---|
| critical (P1) | 0 |
| high (P2) | 0 |
| medium | 1 (R-SS-001) |
| low | 2 (R-SS-002, R-SS-003) |

**There are no P1/P2 findings — nothing blocks merge before the final epic gate.**

## Live-wiring confirmation (the P5 lesson)

- **Tab constructed with the bridge ports + `EnvSnippetService`** — `src/plugin/main.ts:94`
  calls `new SpecoratorSettingTab(this.app, this, this.buildSettingsTabDeps(bridge))`;
  `buildSettingsTabDeps` (main.ts:104) assembles the six ports + a real
  `createEnvSnippetService({ settings: bridge, secretStore: bridge.secretStore, descriptors: PROVIDER_DESCRIPTORS })`
  + `createSnippetEditLauncher(...)`. Not a stub — the tab is no longer `deps = null`.
- **Tab walks the view-model + renders + wires onChange** — `settings.ts:113` `renderShell`
  calls `buildSettingsViewModel(...)` with the live `secretKeysSet`/`secretStorageAvailable`,
  and the `switch (control.kind)` renderer wires each control's `onChange` to its real port
  (`setSecret`/`deleteSecret`, `providerDefaultModel`, `applyScopeText`, `removeRule`/`clear`,
  `defaultPermissionMode`, `keyboardNav`).
- **Env→subprocess merge wired into all 3 P9 runtimes** — `buildScopeEnv` (which calls the
  pure `mergeScopeEnvs`/`resolveEnvScope`) is invoked in `CodexRuntime.ts:112`,
  `OpencodeRuntime.ts:112`, and `ClaudeCliChatRuntime.ts:517`; the registry threads
  `settings: this` (ObsidianBridge) per `ObsidianProviderRuntimeRegistry.ts:44/63`.
- **P0 core loop still renders (additive)** — `settings.ts:96` `renderCoreModules` is the
  unchanged module-schema loop; the shell only renders when `deps !== null`.
- **Standalone `src/ui/main.ts` unaffected** — it mounts `AgentPanelRoot` with `MockBridge`
  and never imports the settings tab (confirmed in impl-log T-SS-030; no settings import in
  the standalone path). No regression to the P0 module-schema core loop.

## Security review (load-bearing P10 concern) — CONFIRMED

- **(a) No secret in `data.json` / device-local.** The provider API-key value goes only to
  `SecretStorePort.setSecret` (`settings.ts:273`); the field is masked `type='password'`
  (`settings.ts:251`) and the value is never read back. Env-secret values route through
  `EnvSnippetService.splitEntries` (`EnvSnippetService.ts:120`) to `setSecret(envSecretKey(scope,key), value)`,
  with the device-local struct keeping only `{kind:'secretRef'}`. `coerceEnvEntry`
  (`PluginSettings.ts:211`) accepts only `inline`/`secretRef` shapes — a plaintext secret
  cannot round-trip into device-local. `secretLeak.test.ts` asserts zero secret bytes across
  the key + snippet + applyScopeText flows.
- **(b) Secret resolved only at the subprocess-env spawn boundary.** `resolveEnvScope`
  (`resolveEnvScope.ts:25`) is the one place `getSecret` is called; `buildScopeEnv.ts`
  documents and enforces "the ONE place the env-scope secret value is read." `readScope`
  (`EnvSnippetService.ts:308`) returns `secretRef` entries AS-IS — never resolved into the
  service/UI; the VM carries only the tri-state (`buildSettingsViewModel.ts:25/55`).
- **(c) No `innerHTML`/`v-html`/`window.confirm`.** Grep over `src/` finds only comments
  asserting their absence. The settings tab + modals build DOM via `Setting`/`createEl`/
  `setText`; the delete-confirm is an Obsidian `Modal` subclass (`EnvSnippetModalHost.ts:184`),
  never `window.confirm`. ESLint `no-restricted-properties`/`no-restricted-globals` enforce it.
- **(d) No `switch(providerId)`.** The only `switch` is on `control.kind` in the renderer
  (`settings.ts`, the SPEC-SS-021 exhaustiveness switch). The VM gates on the capability bag
  + the descriptor's `isEnabled`/`environmentKeyPatterns` (`buildSettingsViewModel.ts:147-189`);
  the classifier iterates descriptor patterns (`classifyEnvKey.ts:53`). `noProviderSwitch.test.ts`
  greps `src/application/settings/**` + `src/domain/chat/environment/**` clean.

## `_coerceSettings` round-trip + additivity — CONFIRMED

- The six additive fields round-trip device-local in **both** write-path twins:
  `ObsidianBridge._coerceSettings` spreads `...coerceOptionalSettingsFields(obj)`
  (`ObsidianBridge.ts:593`) **and** `core-settings.ts:73` spreads the same helper. Each field
  is conditionally spread (`...(x !== undefined ? { x } : {})`) inside `coerceOptionalSettingsFields`
  (`PluginSettings.ts:362-379`), so absent stays absent — byte-identical to P9 (NFR-SS-001).
- `DEFAULT_SETTINGS` (`PluginSettings.ts:82`) gains no key; the six fields + `homeFsConsent`
  are all OPTIONAL. `coerceSettings.test.ts` + `ObsidianBridge.settings.test.ts` are green
  (39/39 + 55/55 across the reviewer's targeted runs).
- The additive `ProviderDescriptor.environmentKeyPatterns?` (`ProviderDescriptor.ts:68`) is
  OPTIONAL — the P9 frozen-matrix tests stay green (impl-log T-SS-005).
- `manifest.json` is **not** in the `next..HEAD` diff (identity untouched, NFR-SS-012).
- **Read-only agent/skill/subagent (NG1).** `discoverDefinitions.ts` maps the P4 catalog to
  read-only rows with no write affordance; `buildSettingsViewModel.test.ts:262` asserts
  `agentList`/`slashList`/`mcpDocNote` expose no `onChange`. No CRUD added. **Confirmed.**

## Findings

### R-SS-001 — medium — `agentList`/`slashList` render with empty content (REQ-SS-030/040, SPEC-SS-007/008)

`buildSettingsViewModel` emits the `agentList` and `slashList` controls with
`entries: []` hardcoded (`src/application/settings/buildSettingsViewModel.ts:172,176`).
The VM receives only the boolean `hasProviderDefinitions` predicate
(`makeHasProviderDefinitions`, `discoverDefinitions.ts:73`) — never the actual
`DiscoveredDefinitions` (the mapped command/skill names from
`discoverDefinitions.ts:45`). The settings tab then renders `control.entries` directly
(`src/plugin/settings.ts:178,181` → `renderDefinitionList`), which shows the
`{prefix}.empty` microcopy because `entries.length === 0` is always true
(`settings.ts:442`).

Net effect: the section is correctly gated in/out (omitted when no definitions exist,
REQ-SS-031 holds), and the read-only posture holds (no write affordance), but when a
provider DOES expose slash/skill definitions the list renders the "empty" note instead
of the discovered names. REQ-SS-030 ("display that provider's discovered ... definitions
as a read-only list") is structurally present but content-empty.

This passes the automated tests because `buildSettingsViewModel.test.ts` asserts only the
presence/absence of the control `kind`, never the `.entries` payload (verified
`buildSettingsViewModel.test.ts:188-214`), and the DOM render is the coverage-excluded
TEST-SS-M1 leg. It would surface as a visible defect on the manual real-Obsidian leg.

- **Category:** correctness / requirements gap
- **Location:** `src/application/settings/buildSettingsViewModel.ts:172,176`; `discoverDefinitions.ts:73`; `src/plugin/settings.ts:178-181`
- **Recommendation:** thread the real `DiscoveredDefinitions` into the VM — either pass a
  `getDefinitions(id) => DiscoveredDefinitions` into `BuildSettingsViewModelInput` and
  populate `slashList.entries`/`agentList.entries`, or have the tab call `discoverDefinitions`
  and fill the rows at render time. Add a VM test asserting `agentList.entries` is non-empty
  when the catalog has skills (the current TEST-SS-030 only checks `kind` presence).
- **Owner:** dev (with a qa test extension). REQ-SS-030 is `must`; REQ-SS-040/041 are `should`.
  Given the must-tier surface (key, model, env, MCP, approvals) is fully functional and the
  read-only definition list is a surfacing-only nice-to-have whose section gating is correct,
  this is a scheduled medium, not a merge blocker — but it should be fixed before the manual
  TEST-SS-M1 leg is signed off, since it is a visible empty-state where content is expected.

### R-SS-002 — low — `mcpManager` is a lightweight re-implementation, not the P8 manager (REQ-SS-080, SPEC-SS-007)

The `mcpManager` control renders a server list + enable toggles via `McpConfigStorePort.load`/`save`
directly in the tab (impl-log T-SS-025 deviation) rather than re-hosting the full P8 Vue
`McpServerModal` seam (which needs an `McpClientPort` test-probe not present in the
`mcpManager` row). This satisfies REQ-SS-080's load/save contract but is a reduced surface
vs the P8 manager (no test-probe / add-edit modal flow from settings).

- **Category:** scope / parity
- **Location:** `src/plugin/settings.ts` `renderMcpManager`
- **Recommendation:** accept for P10 (the row honours the load/save contract and is coverage-
  excluded), but record it so the final epic gate / a later phase decides whether settings-MCP
  should reach full P8 parity. Capture on the parity-screenshot leg (TEST-SS-M4).
- **Owner:** pm / architect (decision), dev (if expanded later). Non-blocking.

### R-SS-003 — low — `apply` scope inference reconstructs `KEY=x` lines (REQ-SS-064)

`EnvSnippetService.apply` (`EnvSnippetService.ts:271-277`) infers an undeclared scope by
reconstructing `${entry.key}=x` lines and feeding them to `resolveEnvironmentSnippetScope`,
because the classifier reads only the key (a bare key list has no `=`). This is behaviourally
equivalent (the value is irrelevant to key classification) but is a slightly indirect idiom
that a future reader could misread as value-bearing.

- **Category:** maintainability
- **Location:** `src/application/settings/EnvSnippetService.ts:271-277`
- **Recommendation:** consider a key-only scope-inference helper (`inferScopeFromKeys(keys, descriptors)`)
  so the `=x` reconstruction is not needed; the impl-log already flags this as a deviation.
  Cosmetic; no behavioural change required.
- **Owner:** dev (optional cleanup). Non-blocking.

## Requirements compliance

All 37 REQ-SS + 12 NFR-SS have a downstream chain (see `traceability.md`). Every `must`
REQ is satisfied with automated evidence **except**:
- REQ-SS-030 — structurally satisfied (control gated + read-only) but content-empty (R-SS-001, medium).
- REQ-SS-065/066/090 — automated leg green (Mock capture / secretLeak), real-Obsidian legs
  pending-manual (TEST-SS-M2/M3) — recorded pending, not greened.
- REQ-SS-072 — keyboard-nav reachability is the manual TEST-SS-M1 leg (native focusable
  controls give it by construction, but not yet verified in a real vault).

## Design / spec / constitution / risk

- **Design compliance:** the implementation honours DESIGN-SS-001 — pure `buildSettingsViewModel`
  + `Setting`-API DOM (no Vue, ADR-SS-002), the env-snippet secret split + no new port
  (ADR-SS-001). No drift from the C.2 component table.
- **Spec compliance:** the 14-member `SettingsControl` union, the six coercers, `envSecretKey`,
  the classifier descriptor-data approach all match SPEC-SS-001..028. R-SS-001 is the one place
  the spec's intent (display discovered definitions) is under-delivered; it is logged here rather
  than silently shipped. Deviations are logged in the implementation-log (T-SS-013/017/019/025/026).
- **Constitution:** Article V (traceability) satisfied via `traceability.md`; Article II/IV
  (separation, quality gates) honoured (TDD RED-first per task); Article IX (reversibility) — no
  irreversible action taken. No violations.
- **Risks:** the secret-leak risk (the load-bearing P10 concern) is mitigated by the split +
  the resolve-only-at-spawn boundary + `secretLeak.test.ts`; no new risk introduced. The residual
  risk is the four pending manual legs, which is the designed coverage-exclusion posture.

## Brand review

Not-applicable. The diff touches no `sites/`, no `.claude/skills/specorator-design/`, no
user-facing `*.html`/`*.jsx`, and no `templates/` HTML/CSS. The only style change is
`src/ui/styles/tokens.css` (a `--sp-*` token slice, NFR-SS-009), which is plugin-internal
Obsidian-theme tokens — not a brand surface. `tokens.test.ts` confirms the §4.17 no-leak guard.

## Quality-metrics evidence

`specorator quality:metrics -- --feature settings-shell --json` ran clean (overall 60.3,
maturity level 1 "Documented"). The low `requirementCoverage` (15.8) reflects mechanical
frontmatter-tag scanning, NOT the actual traceability — the rich REQ↔SPEC↔TEST chain lives
in spec §8 + this review's `traceability.md`. Per procedure, the KPI does not override the
findings: the deterministic value here is the maturity gaps (review.md / traceability.md were
absent), which this review closes. The score will rise once these two artifacts are scanned.

## Conditions to satisfy before the final epic gate (not before merge to `next`)

1. **R-SS-001** — thread the discovered slash/skill entries into the VM so `agentList`/`slashList`
   render content, and add a VM test on `.entries`. Fix before TEST-SS-M1 sign-off.
2. **Manual legs** — TEST-SS-M1 (DOM render + keyboard nav + modals), TEST-SS-M2 (real subprocess
   env injection), TEST-SS-M3 (real `app.secretStorage` round-trip + no-`data.json` proof),
   TEST-SS-M4 (parity screenshots) accumulate for the single final human review gate.
3. **R-SS-002 / R-SS-003** — scheduled, non-blocking.
