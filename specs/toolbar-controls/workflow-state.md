---
feature: toolbar-controls
area: TC
current_stage: spec
status: active
last_updated: 2026-05-25
last_agent: architect
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
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
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
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
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
```
