---
feature: settings-shell
area: SS
current_stage: design
status: active
last_updated: 2026-05-26
last_agent: architect (/spec:design)
epic: claudian-reboot
phase: P10
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.8/§4 P10 + audits + claudian-main stand in, mirrors P1-P9)
  research.md: skipped
  requirements.md: accepted (PRD-SS-001; REQ-SS-001..095, NFR-SS-001..012; 6 CLAR-SS resolved-by-recommendation, CLAR-SS-001 ADR-needed)
  design.md: complete (DESIGN-SS-001; Parts A UX / B UI / C Architecture; ADR-SS-001 + ADR-SS-002 accepted + filed; CLAR-SS-001/004 ratified by ADR-SS-001, CLAR-SS-002 by ADR-SS-002)
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
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
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
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
```
