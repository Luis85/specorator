---
feature: toolbar-controls
area: TC
current_stage: implementation
status: active
last_updated: 2026-05-25
last_agent: dev
epic: claudian-reboot
phase: P6
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.5/§4 P6 + audits + claudian-main stand in, mirrors P1-P5)
  research.md: skipped
  requirements.md: accepted (PRD-TC-001; 27 EARS reqs; per-widget backed-vs-seam classified; CLAR-TC-001..003 resolved-by-recommendation)
  design.md: complete (DESIGN-TC-001; Parts A/B/C; ADR-TC-001..004 accepted; CLAR-TC-001..003 ratified)
  spec.md: complete (SPEC-TC-001..030; 6 layer groups; EC-TC-1..14; TEST-TC-001..043 + M1/M2/M3; full REQ↔SPEC↔TEST coverage)
  tasks.md: complete (TASKS-TC-001; 35 tasks T-TC-001..035; DDD batches DOMAIN→INFRA→APP→UI→STYLES→WIRE-IN→GATE; RED-before-green; 2 manual legs T-TC-033/034; NO guard-relax)
  implementation-log.md: in-progress (DOMAIN T-TC-001..008 + INFRA T-TC-009..012 + APPLICATION T-TC-013..016 + UI T-TC-017..028 + STYLES T-TC-029 + WIRE-IN T-TC-030..032 done; GATE T-TC-033/034 human-manual + T-TC-035 parent final-DoD remain)
  test-plan.md: in-progress (guard-verification note + TEST-TC-M1/M2/M3 manual legs + DOMAIN/INFRA/WIRE-IN-batch automated status + the deferred T-TC-032 live-dev-server leg; test-report at Stage 8)
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — toolbar-controls (P6)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted |
| 4. Design | `design.md` | complete (ADR-TC-001..004 accepted) |
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | complete (TASKS-TC-001) |
| 7. Implementation | `implementation-log.md` + code | in-progress (DOMAIN T-TC-001..008 + INFRA T-TC-009..012 + APPLICATION T-TC-013..016 + UI T-TC-017..028 + STYLES T-TC-029 + WIRE-IN T-TC-030..032 done; GATE T-TC-033/034 human-manual + T-TC-035 parent final-DoD remain) |
| 8. Testing | `test-plan.md`, `test-report.md` | in-progress (`test-plan.md` scaffolded; report at Stage 8) |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P6 (toolbar & controls)

P0-P5 merged to `next` (P5 context-attachments #446 / squash 6d6b1a6). P6 = the **input
toolbar control strip** on the P1-P5 composer.

**Scope (charter §4 P6 row + §3.5 "Input toolbar widgets"):** the control strip above/beside
the composer — model selector, mode selector, permission toggle, thinking selector,
service-tier toggle, MCP selector, external-context control, usage/context meter. Plus the
`toolbar/*` CSS (charter §3.10): external-context, mcp/model/mode/thinking selectors,
permission + service-tier toggles → `--sp-*` tokens.

**Cross-phase dependency scoping (a key requirements/design decision — ground in claudian +
what P1-P5 actually back):**
- **Model selector** — `ChatRuntimeQueryOptions.model` already exists (P1); likely fully
  backable in P6 (the provider's available models — Claude first).
- **Mode / thinking / service-tier selectors** — these set per-turn query options; check
  what `ChatRuntimeQueryOptions` carries vs needs additive fields (additive only, like P3/P4/P5).
- **Permission toggle** — approvals/permissions are **P7**; P6 likely ships a capability-gated
  seam / honest-defer (pattern: `supportsBrowserSelection`-style), backing lands P7.
- **MCP selector** — MCP is **P8**; P6 ships the seam / capability-gated placeholder, backing P8.
- **External-context control** — `externalContextPaths` was NG3-EXCLUDED through P5; decide if
  P6 introduces it additively or defers the control.
- **Usage / context meter** — `UsageInfo` exists (P2). Surface accumulated usage + context-window
  meter from the stream.

**Out of P6 (later phases):** approval RULES (P7); MCP client + server management (P8);
Codex/Opencode providers + their model/mode catalogs (P9 — P6 builds Claude + the SEAMS);
settings UX (P10).

**Likely P6 ADR decisions (autonomous — record each):**
- The toolbar widget model: how the control strip mounts on the composer (additive prop/slot like
  the P5 context bar); per-tab vs global control state; where the selected values thread into
  `ChatRuntimeQueryOptions` (additive fields only).
- Which selectors are fully-backed in P6 vs capability-gated seams pending P7/P8 (permission, MCP,
  external-context) — honest-defer pattern, never silently dropped.
- Provider-capability source for the selector option lists (Claude first; a capability/catalog port
  or reuse of an existing seam).

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user settings→device-local; NO backwards compat; DDD inward imports + narrow ports
+ 3 bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/`window.confirm`; `<script setup>`;
`Result<T,E>`; tests mirror `src/` + `data-testid` PageObjects; coverage 80/70/80/80; perceptual `--sp-*`
parity; identity stays Specorator; WCAG 2.2 AA; manifest untouched; CI SHA-pinned + actionlint. VERIFY
GATE (`npm run verify` + `npm run test:all` exit zero).

**Operating mode (human directive 2026-05-25):** AUTONOMOUS DRIVE — no per-phase human checkpoint;
self-parity-review vs claudian after the big implemented chunk; merge P6 to `next` autonomously after a
green gate + green CI; manual-Obsidian + parity-screenshot legs accumulate for the SINGLE FINAL human
review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.5/§3.10/§4 P6 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (§3.5 sources: the
`InputToolbar`/`InputController` + `features/chat/ui/toolbar/**` selectors/toggles, the usage/context
meter, and the `toolbar/*` CSS modules).

## Hand-off notes

```
2026-05-25 (orchestrator): P6 bootstrapped on feature/toolbar-controls (off next; P0-P5 merged).
                          Scope = charter §3.5 toolbar control strip + the usage/context meter.
                          Autonomous drive. Next: /spec:requirements (pm) grounded in charter
                          §3.5/§4 P6 + audits + the claudian InputToolbar/toolbar sources. EARS
                          reqs each mapped to a claudian toolbar path + a test. KEY scoping call
                          for the pm/architect: which selectors are fully-backed in P6 (model,
                          mode, thinking, service-tier, usage meter) vs capability-gated seams
                          pending P7 (permission) / P8 (MCP) / external-context (NG3). Additive-only
                          ChatRuntimeQueryOptions fields for the per-turn controls.
2026-05-25 (pm): Stage-3 ACCEPTED. PRD-TC-001 written — 27 EARS reqs (REQ-TC-001..004 cross-cutting,
                 010..027 per-widget, 040..042 a11y/state), each mapped to a claudian InputToolbar
                 source path + a TEST-TC-NNN. Per-widget classification: BACKED = model (model? exists),
                 mode (+mode?), thinking (+reasoning?), usage meter (UsageInfo, read-only); SEAM =
                 service-tier (capability-gated, +serviceTier? declared-now/emitted-P9), permission
                 (honest-defer → P7), MCP (honest-defer → P8), external-context (deferred control,
                 externalContextPaths stays excluded → later phase). All P0-P5 ChatRuntimeQueryOptions
                 members byte-identical (NFR-TC-001). CLAR-TC-001 (additive field shapes), CLAR-TC-002
                 (external-context visible-disabled vs omit), CLAR-TC-003 (per-tab vs global state) —
                 resolved-by-recommendation (autonomous drive); P6 architect ADRs ratify. NEXT:
                 /spec:design (architect) — bless the additive ChatRuntimeQueryOptions fields, the
                 toolbar mount/slot on ChatComposer (P5 context-bar slot pattern), the capability-gate
                 seam wiring, and the provider-UI-config source for the option lists.
2026-05-25 (architect): Stage-4 COMPLETE. DESIGN-TC-001 written (Parts A UX / B UI / C Architecture).
                 CLAR-TC-001..003 RATIFIED by ADR-TC-001..004 (all accepted, autonomous-drive):
                 · ADR-TC-001 (CLAR-TC-003) — toolbar mounts as an additive ChatComposer region
                   (mirrors the P5 context bar); control state PER-TAB via an additive TabControls bag
                   on TabState; fold on submit in buildTurnRequest. Composer byte-identical without it.
                 · ADR-TC-002 (CLAR-TC-001) — additive ChatRuntimeQueryOptions: `mode?: string`,
                   `reasoning?: ReasoningChoice` (discriminated `{kind:'effort';value} | {kind:'budget';tokens}`,
                   new src/domain/chat/Reasoning.ts), `serviceTier?: string` (declared-now/emitted-P9).
                   `model?` already exists; P0–P5 members byte-identical (NFR-TC-001). Pure guarded
                   foldControlOptions writes ONLY non-default values (resolves the default-vs-explicit
                   under-spec). `enabledMcpServers?`/`externalContextPaths?` stay EXCLUDED (NG2/NG3).
                 · ADR-TC-003 (REQ-TC-003 + honest-defer counter-metric) — visibility reads capability
                   flags (additive `getToolbarCapabilities` on the EXISTING ChatRuntimePort seam — no
                   new port for flags) + catalog descriptors, NEVER a providerId branch. Seam matrix:
                   service-tier + MCP capability-HIDDEN (Claude / !supportsMcpTools); permission +
                   external + MCP-empty VISIBLE-DISABLED "coming later" (no rule/picker/server/turn-field).
                   Mirrors P5 supportsBrowserSelection (ADR-CA-003 §2).
                 · ADR-TC-004 (CLAR-TC-002) — option lists from a NEW narrow ToolbarCatalogPort
                   (getCatalog(providerId), Claude static-for-now, 3 bridges + scriptable Mock,
                   TOOLBAR_CATALOG_PORT key + useToolbarCatalogPort). External-context = VISIBLE-DISABLED
                   seam (full 8-widget parity); externalContextPaths excluded; no electron in Vue;
                   FilePickerPort deferred (charter §6c).
                 Component inventory (Part B): ToolbarStrip + 8 widgets (Model/Mode/Permission/Thinking/
                 ServiceTier/Mcp/External/UsageMeter), each <script setup> + co-located data-testid .po.ts;
                 additive ChatComposer toolbar region; toolbar/* --sp-* token slice (charter §3.10);
                 i18n agent.chat.toolbar.* en+de. Usage meter = declarative SVG 240° arc over TabState.usage
                 (P2), warning >80% + /compact tooltip, hidden when null. NO new runtime dep.
                 Under-specified flag (resolved in design, pin in spec): PRD did not state default-vs-explicit
                 fold — design folds only non-default (ADR-TC-002 §4). Spec-level detail to pin: the effort
                 vocabulary ('high'|'medium'|'low'), token-budget defaults, the >80% warning constant.
                 NEXT: /spec:specify (architect) — implementation-ready contracts for the additive
                 ChatRuntimeQueryOptions fields + ReasoningChoice + ToolbarCatalog DTOs + ToolbarCatalogPort
                 + getToolbarCapabilities + the per-widget component contracts + TabControls/setControl +
                 foldControlOptions. Sequence the query-option grow + fold first, the catalog port + bridges
                 next, the 9 widgets + view-model last.
2026-05-25 (architect): Stage-5 COMPLETE. SPEC-TC-001..030 written (6 layer groups: domain 001-006,
                 infra 007-009, application 010-011, ui 012-025, styles 026, cross-cutting 027-030).
                 Pins the accepted ADR-TC-001..004 into implementation-ready contracts:
                 · DOMAIN — appended ChatRuntimeQueryOptions fields `mode?`/`reasoning?: ReasoningChoice`/
                   `serviceTier?` AFTER appendSystemPrompt (model?/forceColdStart?/appendSystemPrompt?
                   byte-identical); new src/domain/chat/Reasoning.ts (ReasoningEffort 'high'|'medium'|'low'
                   + discriminated ReasoningChoice effort|budget); ToolbarCatalog DTOs (Model/Mode/Reasoning/
                   ServiceTier descriptors) + ToolbarCatalogPort.getCatalog(providerId) (total, no throw) +
                   TOOLBAR_CATALOG_PORT key; getToolbarCapabilities(): ToolbarCapabilities appended to the
                   EXISTING ChatRuntimePort seam (supportsMcpTools/reasoningControl/hasServiceTier/
                   hasModeToggle/permissionMode); TabControls bag.
                 · PURE TRANSFORMS — foldControlOptions(controls) writes ONLY controls-present (non-default)
                   values → {} for an untouched toolbar; buildToolbarViewModel(catalog, capabilities,
                   controls, usage) decides per-widget visible/enabled/hidden, NO providerId branch.
                 · INFRA — 3-bridge ToolbarCatalogPort (Obsidian Claude-static / Mock scriptable / LS inert)
                   + getToolbarCapabilities on the 3 runtimes; real Claude capability/catalog = manual legs.
                 · UI — ToolbarStrip + 8 leaf widgets + UsageMeter (declarative 240° SVG arc), additive
                   ChatComposer toolbar region + ChatSurface VM wiring + tabsStore controls/setControl/fold.
                 PINNED-OPEN-ITEMS (the 3 design field-level under-specs, resolved in §0): effort vocab
                 'high'|'medium'|'low' (lower-case stored); token-budget = descriptor-driven, NO hard-coded
                 default in P6; USAGE_WARNING_THRESHOLD = 80, warning STRICTLY ABOVE (`percentage > 80`).
                 14 edge cases (EC-TC-1..14); 27 TEST-TC + 3 manual legs (TEST-TC-M1 real Claude capability/
                 catalog wiring, M2 parity screenshots, M3 real-CLI folded-options turn). Every REQ-TC +
                 NFR-TC has a SPEC+TEST chain (§9 coverage table). NO new ADR needed (ADR-TC-001..004 cover
                 the irreversible choices; spec only refines delegated field detail). NO open clarifications
                 block the planner. NEXT: /spec:tasks (planner) — decompose SPEC-TC-001..030 into T-TC-NNN.
                 Suggested sequence (carried from design + this spec): (1) the additive ChatRuntimeQueryOptions
                 grow + Reasoning.ts + foldControlOptions + tabsStore controls/setControl/fold (freeze the
                 fold early); (2) ToolbarCatalog DTOs + ToolbarCatalogPort + TOOLBAR_CATALOG_PORT key +
                 getToolbarCapabilities + the 3 bridges + fake-ports `toolbarCatalog`; (3) buildToolbarViewModel
                 + the 9 widgets + ChatComposer region + ChatSurface wiring + composable + tokens + i18n.
2026-05-25 (planner): Stage-6 COMPLETE. TASKS-TC-001 written — 35 tasks T-TC-001..035, mirroring the P5
                 TASKS-CA-001 shape (baseline+guard-verify first; DDD batches DOMAIN->INFRA->APPLICATION->
                 UI->STYLES->WIRE-IN->GATE; strict RED qa-task before impl dev-task; every dev task's first
                 DoD line = "prior RED passes"; coverage-excluded Obsidian real catalog/caps -> human manual
                 legs). Batches: DOMAIN T-TC-002..008 (Reasoning.ts + 3 additive ChatRuntimeQueryOptions
                 fields + ToolbarCatalog DTOs + TabControls + ToolbarCatalogPort/TOOLBAR_CATALOG_PORT +
                 getToolbarCapabilities); INFRA T-TC-009..012 (Mock scriptable / LS inert / Obsidian real
                 catalog+caps + fake-ports.toolbarCatalog); APPLICATION T-TC-013..016 (foldControlOptions +
                 buildToolbarViewModel, pure/total, no providerId branch); UI T-TC-017..028 (useToolbarCatalogPort
                 + ToolbarStrip + 8 leaf widgets + UsageMeter, each + co-located .po.ts; tabsStore controls/
                 setControl/fold + ChatComposer region + ChatSurface wiring); STYLES T-TC-029 (toolbar/* --sp-*
                 slice + tokens contract); WIRE-IN T-TC-030..032 (provide TOOLBAR_CATALOG_PORT + mount + dev
                 smoke); GATE T-TC-033 (MANUAL real caps/catalog + CLI folded turn, TEST-TC-M1/M3), T-TC-034
                 (MANUAL parity screenshots, TEST-TC-M2), T-TC-035 (feature DoD + grep gate + additivity +
                 draft PR into next). NOTE: the getToolbarCapabilities interface-member addition lands its
                 3-runtime stub in the SAME task (T-TC-008 — the P5 T-CA-006 readBinary lesson) to keep the
                 build green; the additive ChatRuntimeQueryOptions optional fields carry NO implements-break.
                 NO guard-relax task needed (verified eslint.config.js DELETED_SUBSYSTEM_BAN/
                 DELETED_INJECTION_KEYS — TOOLBAR_CATALOG_PORT / ToolbarCatalogPort / getToolbarCapabilities /
                 the toolbar paths are NOT banned). Full REQ<->SPEC<->TEST->task coverage table; critical path
                 14 tasks. NEXT: /spec:implement (dev/qa) — first ready task = T-TC-001 (baseline-capture +
                 guard verification, owner dev, no deps), in parallel with T-TC-002 (domain RED, owner qa) and
                 T-TC-029 (tokens, owner dev). The dev/qa pair then walks the DDD batches in the
                 dependency-graph order.
2026-05-25 (dev): Stage-7 DOMAIN batch (T-TC-001..008) COMPLETE on feature/toolbar-controls.
                 Commits: ca037ac (T-TC-001 baseline+guard, doc), f12f14c (T-TC-002 RED),
                 293809c (T-TC-003 Reasoning.ts + the 3 additive ChatRuntimeQueryOptions fields),
                 2dc706e (T-TC-004 ToolbarCatalog DTOs + TabControls + barrel), a747ce9 (T-TC-005
                 RED port), 6310b17 (T-TC-006 ToolbarCatalogPort + TOOLBAR_CATALOG_PORT key +
                 barrel), 17a3e95 (T-TC-007 RED caps), 3c9974a (T-TC-008 ToolbarCapabilities +
                 getToolbarCapabilities + the build-green companion on all SIX classes that
                 implements ChatRuntimePort — the 3 bridge runtimes + the EnqueueRuntime decorator
                 + the 2 ScriptedRuntime test doubles, the P5 readBinary lesson). Verification:
                 `npx vue-tsc -p tsconfig.lint.json --noEmit` 0 errors (whole project);
                 `npm run lint` 0 errors (12 pre-existing warnings); `vitest run` 16/16 across the
                 6 DOMAIN-batch test files (Reasoning + toolbar DTOs + TabControls + ChatTurn
                 additivity + ToolbarCatalogPort + ChatRuntimePort caps), plus 48/48 on the
                 runtime+use-case regression set. Additivity proven: a P5-shaped ChatRuntimeQueryOptions
                 + a `{text}`-only ChatTurnRequest serialise byte-identically to P5 (TEST-TC-002/027).
                 Deviations logged in implementation-log.md (the implements-ChatRuntimePort fan-out
                 beyond the 3 bridges; the RuntimeCapabilities four-vs-"five" wording). DID NOT run
                 build/build:web/docs:api/verify or the dev server; DID NOT push. Stayed on
                 feature/toolbar-controls; touched no application transform / UI / infra catalog impl
                 beyond the T-TC-008 capability stub. NEXT: the INFRA batch (T-TC-009..012, owner
                 qa→dev) — the scriptable MockBridge ToolbarCatalogPort + scriptable
                 getToolbarCapabilities + the inert LocalStorage impls + fake-ports.toolbarCatalog,
                 then the real Obsidian Claude catalog/caps (coverage-excluded, manual leg).
2026-05-25 (dev): Stage-7 INFRA batch (T-TC-009..012) COMPLETE on feature/toolbar-controls.
                 Commits: 2acc196 (T-TC-009 RED — scriptable Mock catalog/caps + inert LS +
                 fake-ports toolbarCatalog tests), 2d0c248 (T-TC-010 — MockToolbarCatalog
                 scriptable via setToolbarCatalog + MockBridge.toolbarCatalog accessor +
                 MockChatRuntime.getToolbarCapabilities scriptable via setToolbarCapabilities +
                 fake-ports.toolbarCatalog member), f5e5acf (T-TC-011 — LocalStorageToolbarCatalog
                 inert Claude catalog no service-tier + LocalStorageBridge.toolbarCatalog; the
                 FixtureChatRuntime inert caps from T-TC-008 confirmed by the RED leg), a7f6409
                 (T-TC-012 — ObsidianToolbarCatalog real static-for-now Claude catalog +
                 ObsidianBridge.toolbarCatalog + ClaudeCliChatRuntime.getToolbarCapabilities real
                 flags, coverage-excluded; test-plan.md INFRA-batch table + scheduled manual leg
                 TEST-TC-M1). EXPOSURE: Mock = scriptable `MockBridge.toolbarCatalog` (get) +
                 scriptable `MockChatRuntime.setToolbarCapabilities`; LS = inert
                 `LocalStorageBridge.toolbarCatalog` (get) + inert FixtureChatRuntime caps; Obsidian
                 = real `ObsidianBridge.toolbarCatalog` (get, lazy) + real
                 ClaudeCliChatRuntime.getToolbarCapabilities (coverage-excluded behind manual leg
                 TEST-TC-M1, NOT self-claimed green). fake-ports gains the `toolbarCatalog` member.
                 Verification: `npx vue-tsc -p tsconfig.lint.json --noEmit` 0 errors (whole project);
                 `npm run lint` 0 errors (12 pre-existing warnings); `vitest run` 33/33 across the 4
                 INFRA-batch test files (MockToolbarCatalog + MockToolbarCapabilities +
                 LocalStorageToolbar + fake-ports). No `node:*`/`obsidian` in Mock or LocalStorage;
                 no `obsidian`/`node:*` symbol leaks past ObsidianToolbarCatalog.ts; getCatalog +
                 capabilities total — never throw. DID NOT run build/build:web/docs:api/verify or the
                 dev server; DID NOT push; styles.css untouched. Stayed on feature/toolbar-controls;
                 touched no application transform / UI. Deviation: ClaudeCliChatRuntime permissionMode
                 is the constant 'default' (no live plan-state field plumbed at P6; --print reports
                 supportsPlanMode:false, NG6 — documented in ClaudeCliChatRuntime + implementation-log).
                 NEXT: the APPLICATION batch (T-TC-013..016, owner qa→dev) — the pure foldControlOptions
                 + buildToolbarViewModel (pure/total, no providerId branch), each RED→green.
2026-05-25 (dev): Stage-7 APPLICATION batch (T-TC-013..016) COMPLETE on feature/toolbar-controls.
                 Commits: e2d498a (T-TC-013 RED — foldControlOptions: empty {}→{} + each present-field
                 fold + empty-string/descriptor-default-never-folded EC-TC-6 + never-throws),
                 12c6a90 (T-TC-014 — foldControlOptions.ts: Partial<Pick<ChatRuntimeQueryOptions,
                 'model'|'mode'|'reasoning'|'serviceTier'>>; writes model/mode/serviceTier only when
                 present+non-empty, reasoning only when present; {} → {} byte-identical to P5),
                 fadeeee (T-TC-015 RED — buildToolbarViewModel full per-widget matrix + EC-TC-2/3/4/5/7
                 + USAGE_WARNING_THRESHOLD===80 strictly-above boundary + source-grep no-providerId leg),
                 e4940e2 (T-TC-016 — buildToolbarViewModel.ts: WidgetVisibility union + 8 per-widget VM
                 interfaces + ToolbarViewModel + USAGE_WARNING_THRESHOLD=80; eight per-widget builders;
                 seam widgets decided from capabilities+catalog descriptors alone — mcp on
                 supportsMcpTools, permission visible-disabled+plan flag, external unconditional
                 visible-disabled; NO providerId branch). Verification: `npx vue-tsc -p
                 tsconfig.lint.json --noEmit` 0 errors (whole project); `npm run lint` 0 errors (12
                 pre-existing warnings, none in toolbar files); `vitest run` 39/39 across the 2
                 APPLICATION-batch test files (foldControlOptions 11 + buildToolbarViewModel 28). Both
                 transforms pure/total — never throw; no `obsidian`/`node:*`/Vue import; no providerId
                 branch (the source-grep leg enforces zero `providerId` / quoted-`claude`). DID NOT run
                 build/build:web/docs:api/verify or the dev server; DID NOT push; styles.css untouched.
                 Stayed on feature/toolbar-controls; touched no domain/infra/UI. Deviations: (1)
                 foldControlOptions return narrowed to Partial<Pick<...>> (a tighter assignable subtype
                 of the spec's Partial<ChatRuntimeQueryOptions> — type-enforces additive-only). (2) the
                 T-TC-015 source-grep path-resolution was fixed in the T-TC-016 commit
                 (fileURLToPath(import.meta.url) is not a file: URL under the vitest config → resolve
                 from process.cwd(); assertions unchanged). NEXT: the UI batch (T-TC-017..025, owner
                 qa→dev) — useToolbarCatalogPort + ToolbarStrip + the 8 leaf widgets + UsageMeter +
                 ChatComposer/ChatSurface/tabsStore wiring, each with a co-located data-testid PageObject.
2026-05-25 (dev): Stage-7 UI batch (T-TC-017..028) COMPLETE on feature/toolbar-controls.
                 RED-before-green, one RED + one green commit per task. Commits: a7eafbe/a93043a
                 (T-TC-017/018 — useToolbarCatalogPort inject-or-throw, mirrors useVaultPort),
                 17cb21b6/695a5503 (T-TC-019/020 — ModelSelector grouped keyboard listbox +
                 ModeSelector role=switch toggle + the full agent.chat.toolbar.* en+de i18n key set),
                 62a054fe/83e70acd (T-TC-021/022 — ThinkingSelector effort/budget listbox +
                 ServiceTierToggle zap toggle), e8cbe25a/9f9f6ccf (T-TC-023/024 — the three honest-defer
                 seams PermissionToggle/McpSelector/ExternalContextControl), de11dc69/25b9b128
                 (T-TC-025/026 — UsageMeter declarative 240-degree SVG arc + ToolbarStrip container),
                 49b966bf/e421574f (T-TC-027/028 — tabsStore controls/setControl/fold + ChatComposer
                 toolbar region + ChatSurface VM wiring). Every .vue has a co-located data-testid
                 PageObject (ADR-009). Verification: vue-tsc 0 (whole project); npm run lint 0 errors
                 (12 pre-existing warnings, none in toolbar files); the batch (useToolbarCatalogPort +
                 tests/ui/chat/toolbar/**) 43/43 green + the three P6 wiring files 12/12 green; the P5
                 regression (tabsStore / ChatComposer{,.ts} / ChatSurface{,.ts,.context,.inline})
                 95/95 green — ADDITIVITY HOLDS (no P0–P5 member renamed/removed; composer + the P5
                 context fold + composer-mode behaviour byte-identical when no toolbar present). The P6
                 control fold COEXISTS with the P5 context fold: _turnQueryOptions runs the P4
                 appendSystemPrompt fold AND foldControlOptions(controls) into the SAME query options
                 (both additive+guarded → undefined when both empty); the P5 context fold lives
                 independently in buildTurnRequest (the request shape). ChatSurface sources caps/usage/
                 controls via OPTIONAL inject(TOOLBAR_CATALOG_PORT, undefined) + tabs.activeRuntime()?.
                 getToolbarCapabilities() — absent port OR absent caps → toolbarVm undefined → pure P5.
                 No providerId branch (grep clean); no obsidian/v-html in src/ui/chat/toolbar/**.
                 Deviations: (1) the seam-widget RED assertions check specific persist/connect/add
                 events are undefined (not emitted()==={}) since test-utils records the native button
                 click; the widgets declare no custom emits. (2) UsageMeter large-arc flag inlined as 1
                 (constant 240-degree sweep) to satisfy no-unnecessary-condition. (3) ChatSurface
                 onToggleServiceTier resolves the descriptor active/inactive token from the VM. NEXT:
                 STYLES T-TC-029 (the toolbar/* --sp-* token slice — the widget styles already reference
                 the spec-named tokens --sp-toolbar-widget-h/--sp-toggle-*/--sp-usage-arc-*/
                 --sp-toolbar-gap/--sp-toolbar-disabled-opacity/--sp-service-tier-glow which T-TC-029
                 mints), then WIRE-IN T-TC-030..032 (provide TOOLBAR_CATALOG_PORT in AgentSidebarView +
                 ui/main.ts; mount + dev smoke), then GATE T-TC-033..035 (the human-run manual legs
                 TEST-TC-M1/M2/M3 + the feature DoD verify chain).
2026-05-25 (dev): Stage-7 STYLES + WIRE-IN batches (T-TC-029..032) COMPLETE on
                 feature/toolbar-controls. Commits: eb8fc96a (T-TC-029 — the toolbar/* --sp-*
                 token slice: §4.13 in tokens.css mints the twelve spec-named tokens
                 --sp-toolbar-gap/-widget-h/-disabled-opacity, --sp-toggle-track/-thumb/-active,
                 --sp-usage-arc-track/-fill/-warn/-size/-stroke, --sp-service-tier-glow, each a
                 token-layer var lookup or bare dimension/shadow; tokens.test §4.13 presence +
                 no-leak guard, TEST-TC-026), 778ceaad (T-TC-030 RED — toolbarMount.ts.test.ts:
                 TOOLBAR_CATALOG_PORT must be provided in BOTH entry points + the strip mounts;
                 RED confirmed), d0ffa0a7 (T-TC-031 — AgentSidebarView.onOpen +
                 src/ui/main.ts each app.provide(TOOLBAR_CATALOG_PORT, bridge.toolbarCatalog);
                 greens T-TC-030; additive — absent port → no strip, the optional inject; no
                 obsidian symbol enters src/ui/**; no router), fc114830 (T-TC-032 — standalone
                 toolbar smoke dev leg in tests/ui/main.ts.test.ts: strip in Claudian order +
                 backed widgets + honest seams + fresh-tab usage-hidden + tab-switch re-derive
                 against MockBridge; the live-dev-server interactive feel deferred-manual in
                 test-plan.md). Verification: `npx vue-tsc -p tsconfig.lint.json --noEmit` 0
                 errors (whole project); full `npm run lint` 0 errors (12 pre-existing warnings,
                 none in touched files); `vitest run` (threads, no-file-parallelism) —
                 toolbarMount.ts 3/3 + the standalone-mount regression main.ts/main/main.rr 7/7
                 (the additive provide; mounts still render) + ChatSurface.toolbar/
                 ChatComposer.toolbar/activateAgentSidebar 8/8 + tokens 15/15 all green. DID NOT
                 run build/build:web/docs:api/verify or the dev server; DID NOT push; styles.css
                 untouched. Stayed on feature/toolbar-controls; did NOT touch the GATE tasks
                 T-TC-033..035. VERIFICATION PERFORMED: vue-tsc 0, full lint 0, the wire-in +
                 standalone-mount + surface/composer + tokens suites green. REMAINING OWNER:
                 human (T-TC-033 real Claude caps/catalog + CLI folded turn TEST-TC-M1/M3; T-TC-034
                 parity screenshots TEST-TC-M2; the deferred T-TC-032 live-dev-server leg) +
                 parent/orchestrator (T-TC-035 final feature DoD + verify chain + draft PR into
                 next + the styles.css regenerate at the gate). NEXT AGENT: the parent orchestrator
                 (T-TC-035 gate) / the human (the manual legs at the single final epic-review gate).
```
