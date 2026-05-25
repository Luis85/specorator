---
id: REVIEW-TC-001
title: Toolbar & Controls (P6) — Stage-9 review
stage: review
feature: toolbar-controls
area: TC
epic: claudian-reboot
phase: P6
owner: reviewer
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
verdict: approve-with-nits
inputs:
  - PRD-TC-001         # requirements.md
  - DESIGN-TC-001      # design.md
  - SPEC-TC-001        # spec.md
  - TASKS-TC-001       # tasks.md
  - IMPL-LOG-TC-001    # implementation-log.md
  - TESTPLAN-TC-001    # test-plan.md
  - diff: git diff next..HEAD (next @ 6d6b1a6, branch feature/toolbar-controls)
  - parity reference: D:\Projects\claudian-main (read-only)
---

# Review — Toolbar & Controls (P6)

## Verdict

**APPROVE WITH NITS.** P6 ships all eight §3.5 control-strip widgets on the rebuilt
composer, threads the three backed widgets (model/mode/thinking) additively into the
next turn, surfaces the 240° usage arc, and defers the four seams honestly. The
P5-review lesson (built-but-unwired) is **not** repeated here: the live path is fully
connected end-to-end and the production provide is wired in both entry points
(verified below). No P1 blocking findings. No P2 major findings. Findings are P3/P4
quality nits that may be scheduled, not merge-blockers.

**Finding counts:** P1 = 0 · P2 = 0 · P3 = 3 · P4 = 3.

## Method

- Resolved the diff as `git diff next..HEAD` (next has not advanced; this is the whole
  P6 feature — 44 commits, 95 files, +10653/−51).
- Read every production file in `src/{domain,application,infrastructure,ui,plugin}/**`
  touched by the diff plus the four ADRs.
- Ran (read-only) focused `npx vitest run` over every toolbar test file:
  - domain + ports + infra: 24 files / 77 tests green
  - application transforms + store + surface + composer: 5 files / 51 tests green
  - UI widgets + mount + composable: 11 files / 45 tests green
  - additivity (`ChatTurn.ts.test.ts`) 6/6; no-provider-branch grep leg 1/1
  - P5 regression (`ChatSurface.context`/`.inline`, `ChatComposer`): 29/29 green
  - standalone mount smoke (`main.ts.test.ts`, `--testTimeout=30000`): 4/4 green
- Ran `specorator quality:metrics --feature toolbar-controls --json` (0 blockers, 0
  open clarifications; scanner traceability under-counts — see traceability.md note).
- Cross-checked the eight widgets perceptually against `D:\Projects\claudian-main`
  `features/chat/ui/InputToolbar.ts` + the `toolbar/**` selectors/toggles + the
  `ContextUsageMeter`.

## 1. Correctness vs spec

**Satisfied.** SPEC-TC-001..030, the EARS REQ-TC acceptances, and EC-TC-1..14 are
honoured (full chain in `traceability.md`). Spot-checks:

- `foldControlOptions` (`src/application/chat/toolbar/foldControlOptions.ts:19-40`) is
  pure/total, writes only non-defaults, and `{}` → `{}` (EC-TC-1/6). The return type is
  tightened to `Partial<Pick<ChatRuntimeQueryOptions,'model'|'mode'|'reasoning'|'serviceTier'>>`
  — a type-enforced guarantee it can never write `forceColdStart`/`appendSystemPrompt`
  (a sound improvement over the spec's looser `Partial<ChatRuntimeQueryOptions>`).
- `buildToolbarViewModel` (`buildToolbarViewModel.ts:93-201`) has **no `providerId`
  branch** (grep-asserted + manually confirmed); each per-widget rule matches the
  SPEC-TC-011 decision table verbatim; `USAGE_WARNING_THRESHOLD = 80`, warning strictly
  above (`:199`).
- `ChatRuntimeQueryOptions` (`ChatTurn.ts:49-77`) appends exactly the three optional
  fields after `appendSystemPrompt`; `enabledMcpServers?`/`externalContextPaths?` stay
  excluded (NG2/NG3).

## 2. Live wiring (the P5 lesson) — VERIFIED CONNECTED

This is the lesson from R-CA-001/002 (display existed, end-to-end interaction missing).
For P6 the full live path is connected and exercised:

- **(a) selection → per-tab state:** `ToolbarStrip` re-emits `pick-model`/`set-mode`/
  `set-reasoning`/`toggle-service-tier` (`ToolbarStrip.vue:28-33,42-62`) → `ChatComposer`
  re-emits (`ChatComposer.vue:404-407`) → `ChatSurface.onPickModel/...` →
  `tabs.setControl(field,value)` (`ChatSurface.vue:402-425`) → `active.controls[field]`
  (`tabsStore.ts:578-581`).
- **(b) fold into the submitted turn:** `sendMessage` (`tabsStore.ts:639`) calls
  `_turnQueryOptions()` (`:598-607`) which calls `foldControlOptions(this.activeTab.controls)`
  and merges the result into `queryOptions`, passed to `deps.runner.run(input, ...)`
  (`:643-645`). **`foldControlOptions` is invoked on the real submit path — not dead
  code.** Confirmed by `ChatSurface.toolbar.test.ts` (fold-on-submit) and the
  additivity test (a no-interaction turn yields `undefined`, byte-identical to P5).
- **(c) reset on conversation change:** `freshTab()` seeds `controls: {}` (`:264-268`);
  `loadIntoTab` resets `controls = {}` (`:423-429`) on resume/fork (REQ-TC-042 parity).
- **strip provided + mounted:** `TOOLBAR_CATALOG_PORT` is provided in BOTH entry points
  — `AgentSidebarView.ts:158` (`bridge.toolbarCatalog`, the real `ObsidianBridge` Claude
  catalog) and `src/ui/main.ts:106` (`MockBridge` scriptable catalog for the demo).
  `ChatSurface` injects it OPTIONALLY (`ChatSurface.vue:387`) and derives `toolbarVm`
  reactively from `getCatalog('claude')` + `activeRuntime().getToolbarCapabilities()` +
  `activeTab.controls` + `activeTab.usage` (`:389-399`); absent port OR absent caps →
  `undefined` → no `toolbar` prop → pure P5 (EC-TC-14). The mount test
  (`toolbarMount.ts.test.ts`) asserts the strip mounts in both paths and the
  `MockBridge.toolbarCatalog` getter is read during mount.

**No built-but-unwired gap.** This is the headline difference vs P5.

## 3. Additivity / no-regression — VERIFIED

- `RuntimeCapabilities` is byte-identical; only `getToolbarCapabilities()` is appended to
  `ChatRuntimePort` (`ChatRuntimePort.ts:103-113`). `EnqueueRuntime` forwards it verbatim
  (`EnqueueRuntime.ts:94-96`); all three bridge runtimes + the two test doubles carry an
  impl (the P5 `readBinary` fan-out lesson applied correctly).
- The P6 control fold targets `queryOptions` (`_turnQueryOptions`); the P5 context fold
  targets `request` (`buildTurnRequest`). They are written in different members of
  `RunChatTurnInput` and **coexist by construction** — confirmed at `tabsStore.ts:642-643`
  (`request` from `buildTurnRequest`, `queryOptions` from `_turnQueryOptions`). Both the
  P4 `appendSystemPrompt` seam and the P6 control fold run inside `_turnQueryOptions`,
  each guarded; both empty → `undefined` (byte-identical to P5).
- P5 regression suite green (29/29); standalone mount green (4/4).

## 4. Seam honesty — VERIFIED (counter-metric clean)

| Seam | Posture | Code |
|---|---|---|
| Service-tier | capability-hidden on Claude (`!hasServiceTier`/no descriptor → slot collapses) | `buildToolbarViewModel.ts:157-171`; `ServiceTierToggle.vue:21-23` |
| MCP | capability-hidden when `!supportsMcpTools`; else visible-empty "coming later" panel, connects nothing | `buildToolbarViewModel.ts:181-186`; `McpSelector.vue:40-42` |
| Permission | always visible-disabled (`enabled:false`); activating → `showInfo` notice only, persists no rule, no `data.json` write | `buildToolbarViewModel.ts:173-179`; `PermissionToggle.vue:24-26,44-47` |
| External-context | always visible-disabled; activating → `showInfo` notice, opens no picker, writes no `externalContextPaths` | `ExternalContextControl.vue:20-22,26-35` |

No seam is live-but-inert. No `providerId` branch anywhere (grep-confirmed in
`src/application/chat/toolbar/**` — zero matches). `serviceTier` is declared-now/
emitted-later: the fold writes it but the Claude runtime ignores it (honest, ADR-TC-002).

`_persistTab` (`tabsStore.ts:884-914`) constructs the `ConversationRecord` field-by-field
and **excludes `controls`** — nothing toolbar-related reaches `data.json` (NFR-TC-011,
SPEC-TC-030).

## 5. Architecture — VERIFIED

- DDD inward layering holds: `Reasoning.ts`/`ToolbarCatalog.ts`/`TabControls.ts` are pure
  domain (no `obsidian`/`node:*`/Vue/class); transforms are pure application; `obsidian`
  appears only in `src/infrastructure/obsidian/**` + `src/plugin/**`
  (`ObsidianToolbarCatalog.ts` imports only domain types).
- Narrow-port discipline: `ToolbarCatalogPort` is a NEW one-consumer port with its own
  `TOOLBAR_CATALOG_PORT` key + `useToolbarCatalogPort` composable (ADR-008, no aggregate);
  capability flags ride the existing `ChatRuntimePort` seam (no new port for flags).
- No `v-html`; data-testid PageObjects co-located for every mounted widget.

## 6. Parity (per widget group, vs claudian-main)

- **Model selector:** parity — grouped listbox, current marked, button shows label.
  Specorator ADDS the keyboard/focus open path (Claudian is hover-only) — a deliberate
  WCAG 2.2 AA improvement (REQ-TC-040), not a divergence.
- **Mode selector:** parity — descriptor-driven two-option `role="switch"`.
- **Permission toggle:** parity layout incl. PLAN special-case label; honest-disabled
  (backing P7).
- **Thinking selector:** parity — effort/budget listbox, auto-hide on none/single.
- **Service-tier toggle:** parity — `⚡` zap, capability-hidden on Claude (P9 backing).
- **MCP selector:** parity — icon + count-0 badge shell, visible-empty panel (P8).
- **External-context:** parity — visible-disabled folder affordance (later phase).
- **Usage meter:** parity — 240° arc gauge (`UsageMeter.vue:28,45-51`), >80% warning +
  `/compact` tooltip, hidden when null. Matches `ContextUsageMeter`.

One-line: **all eight widget groups read as the same product**; the only intentional
divergences are the a11y keyboard open path and the `--sp-*` token palette (both required).

## Findings

### P3 (minor — schedule, not merge-blocking)

- **R-TC-001 (P3, reliability/visual) — `UsageMeter` SVG geometry vs token mismatch.**
  `src/ui/chat/toolbar/UsageMeter.vue:25-29` hard-codes `SIZE = 36` / `STROKE = 4` as
  JS constants for the SVG box, while the minted tokens `--sp-usage-arc-size: 16px` and
  `--sp-usage-arc-stroke: 2px` (`tokens.css §4.13`) describe a different geometry and are
  applied only to the container `inline-size` (`:107`). The arc renders at 36px inside a
  16px-wide flex item, so the gauge can overflow/clip its slot at tight widths. The
  implementation-log already flags the tokens as "minted for parity/future reuse" but
  unused for geometry. Recommendation: either drive `SIZE`/`STROKE` from the tokens (CSS
  custom-property → SVG attr) or set the token values to match the constants and size the
  container from `--sp-usage-arc-size`. Owner: dev. Not blocking — the meter renders and
  tests pass; this is a polish/parity item for the M2 screenshot gate.

- **R-TC-002 (P3, scanner/traceability) — `quality:metrics` reports zero spec/test
  coverage.** `specorator quality:metrics --feature toolbar-controls` returns
  `requirementsWithSpec: 0` and `requirementsWithTests: 0` despite the spec §9 + this
  review's traceability matrix being complete and the tests green. This is a
  heuristic-scanner limitation (it does not parse the table-based coverage format used
  here), but it means the deterministic KPI cannot be relied on as the traceability
  gate for this feature. Recommendation: note in the retro / consider a scanner-parseable
  per-item marker convention (out of P6 scope). Owner: reviewer/retro. Does not affect
  the actual chains, which are verified manually.

- **R-TC-003 (P3, testing) — Stage-8 `test-report.md` absent.** The feature is at
  `current_stage: implementation` with `test-plan.md` `in-progress`; no `test-report.md`
  exists. The automated proof is real (verified by my own test run) and per-task RED→green
  outcomes are in the implementation-log, but the formal Stage-8 report that records the
  coverage-gate result (NFR-TC-007, 80/70/80/80) and the consolidated pass status is not
  yet produced. Recommendation: produce `test-report.md` (or run `npm run verify` and
  capture the coverage numbers) before the epic-merge gate. Owner: qa. Not merge-blocking
  for P6-into-next given the autonomous-drive accumulation toward a single epic gate, but
  it is an open Stage-8 artifact.

### P4 (nit)

- **R-TC-004 (P4, brand) — emoji glyphs in three P6 widgets.** `McpSelector.vue:37` (`🔌`),
  `ServiceTierToggle.vue:45` (`⚡`), `ExternalContextControl.vue:34` (`📁`) use emoji as
  icons (each `aria-hidden="true"`, so AT is unaffected). This follows established P5
  precedent (`ChatComposer.vue:419` `📎`) and the design layout sketch sanctions them for
  parity, so it is not a regression. Flagged for the `brand-reviewer` subagent (dispatched
  in parallel by `/spec:review`) to rule on against the no-emoji guideline; if blocking
  there, it would flip the verdict. Owner: ux/ui-designer (pending brand-reviewer).

- **R-TC-005 (P4, a11y) — MCP empty panel is `role="note"` without focus management.**
  `McpSelector.vue:40` opens the empty panel on click but does not move focus into it or
  trap/restore on Escape (unlike the model/thinking listboxes). Low impact (the panel is
  informational, lists nothing), but for consistency with the keyboard contract it could
  expose an `aria-controls`/`aria-describedby` link from the shell button. Owner: dev.

- **R-TC-006 (P4, parity) — `permissionMode` is a constant `'default'` in production.**
  `ClaudeCliChatRuntime.getToolbarCapabilities` returns `permissionMode: 'default'`
  because the live P4 plan state is not plumbed into this runtime at P6 (NG6, documented
  deviation in the impl-log). Honest and correct for P6, but it means the PLAN-label
  branch (REQ-TC-015) is exercised only by the Mock/unit path, never in the real plugin
  until a later phase wires plan state through. No action needed in P6; noted so the
  retro tracks the deferred plumbing. Owner: architect (future phase).

## Risks (from design / spec)

- All three CLARs (CLAR-TC-001..003) resolved by accepted ADR-TC-001..004. No new risks.
- The declared-now/emitted-later `serviceTier` (P9) and the deferred external-context
  picker (`FilePickerPort`, later phase) are honest seams, correctly excluded — no scope
  leakage into NG1–NG9 detected.

## Brand review

UI surfaces touched (`src/ui/chat/toolbar/**`, `ChatComposer.vue`, `tokens.css`,
`styles.css`). The `brand-reviewer` subagent is dispatched in parallel by `/spec:review`;
fold its findings here. From this reviewer's pass: tokens are `--sp-*`/token-layer only
(no hex, no raw Obsidian var, no physical property — TEST-TC-026 green); no gradient/
texture; no icon-library import. The one brand-relevant item is the emoji glyphs
(**R-TC-004**) — these match P5 precedent and the spec layout, so this reviewer treats
them as a non-blocking nit pending the brand-reviewer's explicit call. If the
brand-reviewer rules the emoji blocking, the verdict flips to `Approved with conditions`.

## Quality metrics evidence

`specorator quality:metrics --feature toolbar-controls --json`: maturity normal,
`blockers: 0`, `openClarifications: 0`, `requirements: 39`, `tests: 28`,
`requirementsWithSpec: 0`/`requirementsWithTests: 0` (scanner under-count — R-TC-002).
The KPI does not override the findings; the actual chains are verified manually and the
toolbar test run is green.

## Recommendation to release-manager

Approve P6 to merge into `next`. The four P4/P6-scoped manual legs (TEST-TC-M1/M2/M3 +
the T-TC-032 live-dev-server leg) and the coverage-gate (NFR-TC-007) accumulate for the
single final epic-review human gate per the autonomous-drive directive — they are
honestly scheduled, not skipped. R-TC-001/003 should be addressed before the epic gate;
R-TC-002/004/005/006 are scheduled nits.
