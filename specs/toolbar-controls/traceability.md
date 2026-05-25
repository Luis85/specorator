---
id: TRACE-TC-001
title: Toolbar & Controls (P6) — traceability matrix
stage: review
feature: toolbar-controls
area: TC
epic: claudian-reboot
phase: P6
owner: reviewer
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
inputs:
  - PRD-TC-001         # requirements.md (REQ-TC-001..004/010..027/040..042 + NFR-TC-001..014)
  - DESIGN-TC-001      # design.md
  - SPEC-TC-001        # spec.md (SPEC-TC-001..030 + TEST-TC-001..043 + EC-TC-1..14)
  - TASKS-TC-001       # tasks.md (T-TC-001..035)
  - IMPL-LOG-TC-001    # implementation-log.md
  - TESTPLAN-TC-001    # test-plan.md
---

# Traceability — Toolbar & Controls (P6)

Regenerable from the artifacts. Every REQ-TC has a downstream chain to SPEC-TC →
TEST-TC → code(`file:line`) → task → (manual-leg where coverage-excluded). Validated
by the reviewer against the diff `git diff next..HEAD` and a focused `npx vitest run`
over every toolbar test file (all green).

## Legend

- **U** = pure unit · **A** = component via `data-testid` PageObject · **M** = manual
  Obsidian leg (coverage-excluded; scheduled, NOT self-claimed green).
- `file:line` cites the production site that satisfies the requirement.

## REQ-TC ↔ SPEC-TC ↔ TEST-TC ↔ code ↔ task

| REQ-TC | SPEC-TC | TEST-TC (layer) | Code (file:line) | Task | Status |
|---|---|---|---|---|---|
| REQ-TC-001 (render strip) | SPEC-TC-012/021 | TEST-TC-001 (A) | `src/ui/chat/toolbar/ToolbarStrip.vue:36-72`; `src/ui/chat/ChatComposer.vue:400-409` | T-TC-025/026, T-TC-027/028 | satisfied |
| REQ-TC-002 (additive / unchanged without strip) | SPEC-TC-001/021/022/027 | TEST-TC-002 (U), TEST-TC-043 (A); EC-TC-1/14 | `src/ui/chat/ChatComposer.vue:76,400`; `src/application/chat/toolbar/foldControlOptions.ts:26-39`; `src/ui/stores/tabsStore.ts:598-606` | T-TC-013/014, T-TC-027/028 | satisfied |
| REQ-TC-003 (capability-driven, no provider branch) | SPEC-TC-004/005/011/022/029 | TEST-TC-003 (U grep+behaviour) | `src/application/chat/toolbar/buildToolbarViewModel.ts:93-201` (no `providerId` branch); `src/ui/chat/ChatSurface.vue:389-399` | T-TC-015/016 | satisfied |
| REQ-TC-004 (backed widgets fold into next turn) | SPEC-TC-001/010/023 | TEST-TC-004 (U), TEST-TC-M3 (M); EC-TC-1/6/11 | `src/application/chat/toolbar/foldControlOptions.ts:19-40`; `src/ui/stores/tabsStore.ts:598-607,639,643` | T-TC-013/014, T-TC-027/028 | satisfied (M3 pending-manual) |
| REQ-TC-010 (model current value) | SPEC-TC-003/011/013 | TEST-TC-010 (U/A); EC-TC-3 | `src/ui/chat/toolbar/ModelSelector.vue`; `buildToolbarViewModel.ts:111-118` | T-TC-019/020 | satisfied |
| REQ-TC-011 (model list, grouped, current marked) | SPEC-TC-003/013 | TEST-TC-011 (A) | `src/ui/chat/toolbar/ModelSelector.vue` (listbox + group separators) | T-TC-019/020 | satisfied |
| REQ-TC-012 (select model → next turn `model`) | SPEC-TC-006/010/013/022/023 | TEST-TC-012 (U/A) | `ChatSurface.vue:406-408`; `tabsStore.ts:578-581`; `foldControlOptions.ts:26-28` | T-TC-027/028 | satisfied |
| REQ-TC-013 (mode current / hidden w/o descriptor) | SPEC-TC-003/011/014 | TEST-TC-013 (U/A) | `src/ui/chat/toolbar/ModeSelector.vue:20-22`; `buildToolbarViewModel.ts:120-134` | T-TC-019/020 | satisfied |
| REQ-TC-014 (toggle mode → next turn `mode`) | SPEC-TC-001/010/014/023 | TEST-TC-014 (U/A) | `ModeSelector.vue:29-33`; `ChatSurface.vue:410-412`; `foldControlOptions.ts:29-31` | T-TC-019/020, T-TC-027/028 | satisfied |
| REQ-TC-015 (permission display + PLAN) | SPEC-TC-005/011/015 | TEST-TC-015 (A); EC-TC-5 | `src/ui/chat/toolbar/PermissionToggle.vue:30-50`; `buildToolbarViewModel.ts:173-179` | T-TC-023/024 | satisfied |
| REQ-TC-016 (permission honest seam, no persist) | SPEC-TC-015/029 | TEST-TC-016 (A); EC-TC-9 | `PermissionToggle.vue:24-26,44-47` (disabled, `showInfo` only) | T-TC-023/024 | satisfied |
| REQ-TC-017 (thinking per reasoning control) | SPEC-TC-002/003/011/016 | TEST-TC-017 (U/A); EC-TC-4 | `src/ui/chat/toolbar/ThinkingSelector.vue`; `buildToolbarViewModel.ts:136-155` | T-TC-021/022 | satisfied |
| REQ-TC-018 (select thinking → next turn `reasoning`) | SPEC-TC-001/002/010/016/023 | TEST-TC-018 (U/A) | `ThinkingSelector.vue` (`set` emit); `ChatSurface.vue:414-416`; `foldControlOptions.ts:32-34` | T-TC-021/022, T-TC-027/028 | satisfied |
| REQ-TC-019 (service-tier only where configured) | SPEC-TC-005/011/017 | TEST-TC-019 (U/A); EC-TC-2 | `src/ui/chat/toolbar/ServiceTierToggle.vue:21-23`; `buildToolbarViewModel.ts:157-171` (hidden for Claude) | T-TC-021/022 | satisfied |
| REQ-TC-020 (service-tier declared-now/emitted-later) | SPEC-TC-001/010/017/023 | TEST-TC-020 (U/A) | `ServiceTierToggle.vue:28-30`; `ChatSurface.vue:418-425`; `foldControlOptions.ts:35-37` | T-TC-021/022, T-TC-027/028 | satisfied (P9-emitted) |
| REQ-TC-021 (MCP only where supported) | SPEC-TC-005/011/018 | TEST-TC-021 (U/A) | `src/ui/chat/toolbar/McpSelector.vue:19`; `buildToolbarViewModel.ts:181-186` | T-TC-023/024 | satisfied |
| REQ-TC-022 (MCP honest empty seam) | SPEC-TC-018/029 | TEST-TC-022 (A); EC-TC-9 | `McpSelector.vue:40-42` (visible-empty panel, connects nothing) | T-TC-023/024 | satisfied |
| REQ-TC-023 (external visible-disabled seam) | SPEC-TC-019/029 | TEST-TC-023 (A); EC-TC-9 | `src/ui/chat/toolbar/ExternalContextControl.vue:20-22,26-35`; `buildToolbarViewModel.ts:188-190` | T-TC-023/024 | satisfied |
| REQ-TC-024 (usage meter from stream) | SPEC-TC-011/020 | TEST-TC-024 (A) | `src/ui/chat/toolbar/UsageMeter.vue:32-99`; `buildToolbarViewModel.ts:192-201` | T-TC-025/026 | satisfied |
| REQ-TC-025 (update meter on usage event) | SPEC-TC-020/022 | TEST-TC-025 (A) | `UsageMeter.vue` (reactive `vm`); `ChatSurface.vue:389-399` (`activeTab.usage`) | T-TC-025/026, T-TC-027/028 | satisfied |
| REQ-TC-026 (warning > 80% + /compact) | SPEC-TC-020/026 | TEST-TC-026 (U/A) | `buildToolbarViewModel.ts:22,199`; `UsageMeter.vue:57-59,123-134` | T-TC-025/026, T-TC-029 | satisfied |
| REQ-TC-027 (hide meter when no usage) | SPEC-TC-011/020 | TEST-TC-027 (U/A); EC-TC-7 | `buildToolbarViewModel.ts:192-195`; `UsageMeter.vue:32,64` | T-TC-025/026 | satisfied |
| REQ-TC-040 (keyboard-operable selectors) | SPEC-TC-013/016 | TEST-TC-040 (A); EC-TC-12 | `ModelSelector.vue` + `ThinkingSelector.vue` (combobox/listbox, Arrow/Home/End/Enter/Esc) | T-TC-019/020, T-TC-021/022 | satisfied |
| REQ-TC-041 (toggles expose AT state) | SPEC-TC-014/015/017 | TEST-TC-041 (A) | `ModeSelector.vue:43-45`; `PermissionToggle.vue:43-46`; `ServiceTierToggle.vue:40-42` (`role="switch"` + `aria-checked`/`aria-disabled`) | T-TC-019..024 | satisfied |
| REQ-TC-042 (per-tab control state on switch) | SPEC-TC-006/022/023 | TEST-TC-042 (U/A), TEST-TC-006 (U); EC-TC-8/10 | `tabsStore.ts:85,264-268,423-429,578-581`; `ChatSurface.vue:389-399` | T-TC-027/028 | satisfied |

## NFR-TC chain

| NFR-TC | SPEC-TC | Evidence (file:line / test) | Status |
|---|---|---|---|
| NFR-TC-001 (additivity, P0–P5 byte-identical) | SPEC-TC-001/006/010/023/027 | `ChatTurn.ts:49-77` (three optional fields appended; P0–P5 unchanged); `ChatRuntimePort.ts:33-46` (`RuntimeCapabilities` byte-identical); TEST-TC-002/027/043 green | satisfied |
| NFR-TC-002 (DDD/ports, 3 bridges) | SPEC-TC-004/005/007/008/009/024/025 | `ToolbarCatalogPort` on all 3 bridges; `TOOLBAR_CATALOG_PORT` own key (`ports.ts:70-73`); TEST-TC-003 + TEST-TC-M1 (M) | satisfied (M1 pending-manual) |
| NFR-TC-003 (no `obsidian` in `src/ui/**`) | SPEC-TC-012..022 | no `obsidian` import in `src/ui/chat/toolbar/**` (grep verified); ESLint green | satisfied |
| NFR-TC-004 (DOM safety) | SPEC-TC-020/030 | `UsageMeter.vue` declarative SVG `<path>`, no `v-html`; seams use `NotificationPort.showInfo`, no `window.confirm` | satisfied |
| NFR-TC-005 (`<script setup>`, Result, DTO store) | SPEC-TC-006/010/011/023 | all widgets `<script setup>`; `TabControls` plain DTO (`tabsStore.ts:85`); transforms total | satisfied |
| NFR-TC-006 (tests mirror src + PageObjects) | SPEC-TC-012..020 | every `.vue` has co-located `.po.ts` under `tests/ui/chat/toolbar/**` | satisfied |
| NFR-TC-007 (coverage 80/70/80/80) | SPEC-TC-010/011/023/030 | pure transforms + Mock/LS impls under coverage; gate runs at T-TC-035/verify | pending-gate (deferred to epic `npm run verify`) |
| NFR-TC-008 (token parity) | SPEC-TC-012/026 | `tokens.css §4.13`; TEST-TC-026 green; TEST-TC-M2 (M) screenshots | satisfied (M2 pending-manual) |
| NFR-TC-009 (a11y) | SPEC-TC-013..017/020 | `role`/`aria-*` on every widget; reduced-motion media queries; TEST-TC-040/041 green | satisfied (M2 visual pending-manual) |
| NFR-TC-010 (graceful degrade) | SPEC-TC-004/011/030 | `buildToolbarViewModel` total (empty catalog → empty notice / hidden); TEST-TC-010/030 green | satisfied |
| NFR-TC-011 (no secret, no `data.json`) | SPEC-TC-019/030 | `_persistTab` (`tabsStore.ts:884-914`) constructs the record field-by-field, EXCLUDES `controls`; TEST-TC-030 | satisfied |
| NFR-TC-012 (no new dep) | SPEC-TC-020 | `UsageMeter` arc computed in-repo; `package.json` runtime deps unchanged in diff | satisfied |
| NFR-TC-013 (manifest untouched) | cross-cutting | `manifest.json` not in `git diff next..HEAD` | satisfied |
| NFR-TC-014 (i18n en+de) | SPEC-TC-028 | `agent.chat.toolbar.*` keys in `en.ts`/`de.ts`; no hardcoded user-facing string in widgets | satisfied |

## Manual legs (coverage-excluded — scheduled, NOT marked green)

| Leg | Surface | Scheduled by | Status |
|---|---|---|---|
| TEST-TC-M1 | real Claude `getToolbarCapabilities` + `ToolbarCatalogPort` wire end-to-end in Obsidian | T-TC-012 | pending-manual (final epic-review gate) |
| TEST-TC-M2 | per-widget parity screenshots 320/520/720 px, light + dark | T-TC-031 | pending-manual (final epic-review gate) |
| TEST-TC-M3 | real-CLI turn carries folded `mode`/`reasoning` query options | T-TC-012 / wire-in | pending-manual (final epic-review gate) |
| T-TC-032 live-dev-server leg | `npm run dev` interactive feel (live pick → re-render, live usage arc, dropdown a11y) | T-TC-032 | pending-manual (final epic-review gate) |

## ADR coverage

| ADR-TC | Decision | Realised in |
|---|---|---|
| ADR-TC-001 | additive `ChatComposer` region + per-tab `TabControls` + fold on submit | `ChatComposer.vue:400`; `tabsStore.ts:85,578-607` |
| ADR-TC-002 | additive `mode?`/`reasoning?`/`serviceTier?` + `Reasoning.ts` + non-default guarded fold | `ChatTurn.ts:71-76`; `Reasoning.ts`; `foldControlOptions.ts` |
| ADR-TC-003 | capability-gate / honest-defer via `getToolbarCapabilities`, no `providerId` branch | `ChatRuntimePort.ts:36-46,110-113`; `buildToolbarViewModel.ts` |
| ADR-TC-004 | `ToolbarCatalogPort` option-list source + external-context visible-disabled seam | `ToolbarCatalogPort.ts`; 3 bridges; `ExternalContextControl.vue` |

## Orphan check

- **Orphan tests:** none — every TEST-TC maps to a REQ-TC / EC-TC.
- **Orphan tasks:** none — every T-TC-NNN maps to ≥ 1 SPEC-TC.
- **Orphan ADRs:** none — ADR-TC-001..004 each resolve a CLAR and trace to code.
- **REQ with no downstream chain:** none — all 27 REQ-TC + 14 NFR-TC have SPEC + TEST
  + code. Three `must`/`should` legs (TEST-TC-M1/M2/M3) are pending-manual (honest,
  coverage-excluded) — not a gap, a scheduled leg.

> **Scanner note:** `specorator quality:metrics` reports `requirementsWithSpec: 0` /
> `requirementsWithTests: 0` for this feature — a heuristic-scanner limitation (it does
> not parse the spec §9 / this matrix table format). The chains above are present and
> verified manually against the diff and the green test run.
