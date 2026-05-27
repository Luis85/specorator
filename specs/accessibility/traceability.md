---
id: TRACE-AY-001
title: Accessibility (P12, FINAL phase) — Traceability matrix
stage: review
feature: accessibility
area: AY
epic: claudian-reboot
phase: P12
status: complete
owner: reviewer
integration_branch: next
created: 2026-05-27
updated: 2026-05-27
inputs:
  - PRD-AY-001 (requirements.md — REQ-AY-001..017 + NFR-AY-001..010)
  - DESIGN-AY-001 (design.md — Parts A/B/C; RG-1..6; D-AY-1..5; §C.6 no new port/ADR)
  - SPEC-AY-001 (spec.md — SPEC-AY-001..011 + TEST-AY-001..017 + EC-AY-001..014)
  - TASKS-AY-001 (tasks.md — T-AY-001..018)
  - IMPL-LOG-AY-001 (implementation-log.md)
  - the diff: git diff next..HEAD (next @ d4733464, not advanced)
---

# Traceability matrix — Accessibility (P12)

Regenerated from the P12 artifacts + the `git diff next..HEAD` at Stage-9 review. Validates the
constitution Art. V chain REQ-AY → SPEC-AY → T-AY → code(file) → TEST-AY for every requirement, and
confirms there is no orphan test / task / ADR. REQ-AY-017 is the human-owned final epic gate, recorded
as the single pending downstream cell.

## REQ ↔ SPEC ↔ TASK ↔ CODE ↔ TEST

| REQ | Pri | SPEC | Task(s) | Code (file) | Test(s) | Leg | Status |
|---|---|---|---|---|---|---|---|
| REQ-AY-001 (accessibility.css 3rd layer) | must | SPEC-AY-001 | T-AY-002, T-AY-003 | `src/ui/styles/accessibility.css` | TEST-AY-001 | auto | ✅ satisfied |
| REQ-AY-002 (registered at both import sites) | must | SPEC-AY-002, SPEC-AY-003 | T-AY-002, T-AY-004 | `src/plugin/main.ts:3`, `src/ui/main.ts:15` | TEST-AY-002 | auto | ✅ satisfied |
| REQ-AY-003 (reduced-motion guard) | must | SPEC-AY-001 (RG-1) | T-AY-002, T-AY-003 | `accessibility.css:28-37` | TEST-AY-003 | auto | ✅ satisfied |
| REQ-AY-004 (spin halt `animation:none`) | must | SPEC-AY-001 (RG-2) | T-AY-002, T-AY-003 | `accessibility.css:42-47` | TEST-AY-004 | auto | ✅ satisfied |
| REQ-AY-005 (forced-colors surface mapping) | must | SPEC-AY-001 (RG-3) | T-AY-002, T-AY-003 | `accessibility.css:53-71` | TEST-AY-005 | auto | ✅ satisfied |
| REQ-AY-006 (forced-colors borders) | must | SPEC-AY-001 (RG-4), SPEC-AY-006 | T-AY-002, T-AY-005, T-AY-006 | `accessibility.css:82-91` | TEST-AY-006 (file + mount) | auto | ✅ satisfied |
| REQ-AY-007 (focus-visible ring) | must | SPEC-AY-001 (RG-5), SPEC-AY-008 | T-AY-002, T-AY-003, T-AY-007 | `accessibility.css:98-110` | TEST-AY-007 (file + mount) | auto | ✅ satisfied |
| REQ-AY-008 (keyboard-operable + labelled) | must | SPEC-AY-007, SPEC-AY-008 | T-AY-007, T-AY-010 | swept components (verify-only; no edit) | TEST-AY-008 | auto | ✅ satisfied |
| REQ-AY-009 (`.sr-only` utility) | must | SPEC-AY-001 (RG-6), SPEC-AY-007 | T-AY-002, T-AY-009, T-AY-010 | `accessibility.css:116-127`; `NoticeLiveRegion.vue:53` | TEST-AY-009 (file + mount) | auto | ✅ satisfied |
| REQ-AY-010 (streaming + notice live region) | must | SPEC-AY-004 | T-AY-008, T-AY-011 | `ChatSurface.vue:856-857` (verify); `src/ui/components/NoticeLiveRegion.vue` (fill) | TEST-AY-010 | auto | ✅ satisfied |
| REQ-AY-011 (collapsible `aria-expanded`) | should | SPEC-AY-005 | T-AY-009, T-AY-012 | `SpCollapsible.vue` (verify-only; already conforms) | TEST-AY-011 | auto | ✅ satisfied |
| REQ-AY-012 (modals trap focus) | must | SPEC-AY-009 | T-AY-013 | `src/plugin/modals/**` (8 seams extend Obsidian `Modal`; verify-only) | TEST-AY-012 | auto (structural) | ✅ satisfied |
| REQ-AY-013 (modals restore focus) | must | SPEC-AY-009 | T-AY-013 | `src/plugin/modals/**` (native `Modal` restore; verify-only) | TEST-AY-013 | auto (structural) | ✅ satisfied |
| REQ-AY-014 (additive — no regression) | must | SPEC-AY-010 | T-AY-014 | (allow-list diff: 4 `src/` files) | TEST-AY-014 | auto | ✅ satisfied |
| REQ-AY-015 (no raw-HTML, token discipline) | must | SPEC-AY-001, SPEC-AY-011 | T-AY-003, T-AY-015 | `accessibility.css` (no hex outside forced-colors); P12 diff (no sink) | TEST-AY-015 | auto | ✅ satisfied |
| REQ-AY-016 (parity screenshot set captured) | must | (artifact) | T-AY-016 | `specs/accessibility/parity-screenshots.md` | TEST-AY-016 (completeness) | auto | ✅ satisfied (artifact-complete) |
| REQ-AY-017 (human final sign-off) | must | (human acceptance) | T-AY-017 👤 | n/a (human review of parity set + manual legs) | **TEST-AY-017 (HUMAN)** | **human** | ⏳ **PENDING — final epic gate (owner: human)** |

## NFR coverage

| NFR | Category | Evidence | Status |
|---|---|---|---|
| NFR-AY-001 | accessibility (WCAG 2.2 AA) | TEST-AY-006/007/008/010/011/012/013 across surfaces + REQ-AY-017 human visual leg | ✅ automatable legs met; visual leg = human |
| NFR-AY-002 | maintainability (token discipline) | `accessibility.css` consumes `--sp-focus-ring`/`--sp-shadow-focus-ring`; only system colours inside forced-colors (TEST-AY-015) | ✅ met |
| NFR-AY-003 | security (no raw-HTML sink) | P12 diff adds no innerHTML/outerHTML/insertAdjacentHTML/v-html (TEST-AY-015; reviewer grep) | ✅ met |
| NFR-AY-004 | additivity (no regression; locale byte-identical) | TEST-AY-014; `git diff next -- src/ui/i18n/locales` empty (reviewer-confirmed) | ✅ met |
| NFR-AY-005 | build (lightningcss-safe CSS) | `build:web` green at C1 (impl-log T-AY-002); ASCII-only comments | ✅ met (parent re-confirms full gate at T-AY-018) |
| NFR-AY-006 | build (registered + in both outputs) | TEST-AY-002; import-order contract; parent T-AY-018 confirms both built outputs | ✅ met (registration); ⏳ both-output presence confirmed at T-AY-018 |
| NFR-AY-007 | quality (coverage 80/70/80/80) | parent T-AY-018 `npm run test:coverage` | ⏳ confirmed at T-AY-018 gate |
| NFR-AY-008 | release (`manifest.json` untouched) | `git diff next -- manifest.json` empty (reviewer-confirmed) | ✅ met |
| NFR-AY-009 | reliability (no surface breaks under a11y media) | RG-1..RG-4 inert until media query; forced-colors borders + focus ring perceivable | ✅ met (automatable); visual leg = human |
| NFR-AY-010 | gate (verify + test:all green) | parent T-AY-018 full chain | ⏳ confirmed at T-AY-018 gate |

## Edge-case coverage (EC-AY)

All 14 EC-AY map to a test or rule group: EC-AY-001→RG-2/TEST-AY-004; EC-AY-002→RG-1/TEST-AY-003;
EC-AY-003→RG-4/TEST-AY-006; EC-AY-004→RG-3+RG-5/TEST-AY-005/007; EC-AY-005/006→RG-5/TEST-AY-007;
EC-AY-007→RG-6/TEST-AY-009; EC-AY-008/009→modal/TEST-AY-012/013; EC-AY-010→additivity/TEST-AY-014;
EC-AY-011/012→live region/TEST-AY-010; EC-AY-013→lightningcss/T-AY-018; EC-AY-014→RG-5 token consume/TEST-AY-007.

## Source-diff scope (additivity evidence — REQ-AY-014)

`git diff next..HEAD` touches under `src/` exactly four files:

- `src/ui/styles/accessibility.css` (new — RG-1..RG-6)
- `src/plugin/main.ts` (+1 line — 3rd CSS import)
- `src/ui/main.ts` (import + NoticeLiveRegion render wiring)
- `src/ui/components/NoticeLiveRegion.vue` (new — `.sr-only` live region)

Plus a test-only `tests/__fakes__/obsidian.stub.ts` `Modal` export (additive). No swept component
template, no locale file, no `manifest.json` changed. Confirmed at review.

## Orphan / dangling check

- **Orphan tests:** none. Every TEST-AY-001..016 traces up to a REQ-AY and down to code/artifact.
  TEST-AY-017 is the human gate (intentionally has no automatable downstream).
- **Orphan tasks:** none. Every T-AY-001..018 names ≥ 1 SPEC-AY / TEST-AY / REQ-AY / NFR-AY.
  T-AY-017 (human) + T-AY-018 (parent gate) remain open by design.
- **Orphan ADRs:** none. P12 introduces no new ADR (DESIGN-AY-001 §C.6) and references no dangling ADR.
- **Requirements without a downstream chain:** none. All 17 REQ-AY have a SPEC + task + test cell;
  REQ-AY-017's downstream is the human sign-off (pending), which is correct for a final epic gate.

## Pending downstream cells (by design)

| Cell | Owner | Why pending |
|---|---|---|
| REQ-AY-017 / TEST-AY-017 / T-AY-017 | human | Final cross-surface parity screenshot sign-off + accumulated P5–P11 manual-Obsidian legs — the single final epic gate; never agent-self-claimed (constitution Art. VII). |
| T-AY-018 (verify + build:web + draft `next` PR) | dev/orchestrator (parent) | The closing automatable gate; runs the full verify chain + confirms both built outputs + coverage. Out of this reviewer's scope (parent runs the suite/builds). |
