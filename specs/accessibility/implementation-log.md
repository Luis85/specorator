---
id: IMPL-LOG-AY-001
title: Accessibility (P12, FINAL phase) — Implementation Log
stage: implementation
feature: accessibility
area: AY
epic: claudian-reboot
phase: P12
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-27
updated: 2026-05-27
---

# Implementation Log — Accessibility (P12, the FINAL phase)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec reference, outcome,
deviations. P12 is additive + presentation-only: one new CSS file
(`src/ui/styles/accessibility.css`, RG-1..RG-6), two one-line import edits, and targeted additive
ARIA / `.sr-only` / live-region fills. Chunk 1 (T-AY-001..005) is the `accessibility.css` layer +
registration + its RED-before-green file-read/registration tests.

## Chunk 1 — `accessibility.css` + pipeline registration (T-AY-001..005)

### T-AY-001 — Baseline + guard-verify + scaffold `parity-screenshots.md` (📐 dev)

- **Spec/req:** SPEC-AY-001 (RG inventory), SPEC-AY-002/003 (import sites), SPEC-AY-006 (RG-4
  selector enumeration), REQ-AY-016 (parity-screenshots.md scaffold), NFR-AY-002 (token reference),
  NFR-AY-004/008 (additivity baseline).
- **Files:**
  - `specs/accessibility/test-plan.md` (new) — token reference (`--sp-focus-ring` tokens.css:42 /
    `--sp-shadow-focus-ring` tokens.css:140), import-site reference (main.ts head + ui/main.ts head,
    the 3rd-import insertion points), the five-keyframe reduced-motion source inventory, the RG-4
    background-cue-only control enumeration (`.sp-toggle-switch` / `[data-state]` / `.sp-chip` /
    `.sp-tab` / `[role="option"][aria-selected="true"]`), the claudian minimal-focus-visible-only
    reference (meet = RG-5; beat = RG-1..4 + RG-6), and the guard verdict.
  - `specs/accessibility/parity-screenshots.md` (new) — the all-surfaces × {320/520/720} ×
    {light/dark} matrix with a claudian-baseline column + the two a11y-condition columns
    (reduced-motion / forced-colors) + the accumulated P5-P11 manual-leg note (the human TEST-AY-017
    sign-off artifact; TEST-AY-016 completeness structure).
  - `specs/accessibility/implementation-log.md` (new, this file).
- **Commit:** `6b9bf9204501bd92fbc83f0c7730976b3da103ec`
- **Outcome:** done.
- **Token reference verified:** `--sp-focus-ring` present at `tokens.css:42` (`var(--interactive-accent)`);
  `--sp-shadow-focus-ring` present at `tokens.css:140` (`0 0 0 2px var(--sp-focus-ring)`). No new token
  (D-AY-2 / NG2).
- **Import-site reference verified:** `src/plugin/main.ts` L1 `@/ui/styles/tokens.css` + L2
  `@/ui/styles/animations.css` (insertion after L2); `src/ui/main.ts` L13 `./styles/tokens.css` + L14
  `./styles/animations.css` (insertion after L14).
- **Guard verdict (lint leg):** `npx eslint src/plugin/main.ts src/ui/main.ts` → **0** violations (no
  "deleted in the P0 reboot" `no-restricted-imports` message). The new `accessibility.css` file path,
  the two side-effect CSS import lines, and the additive ARIA edits trip no `DELETED_SUBSYSTEM_BAN` /
  `DELETED_INJECTION_KEYS` rule. **NO guard-relax task in P12; NO new InjectionKey/port/composable/
  component/ADR; `manifest.json` + en/de + all ten locales untouched** (NFR-AY-004/008).
- **Deviation:** none. No file under `src/` changed.

### T-AY-003/004 — RED rule-group + registration tests (🧪 qa)

- **Spec/req:** TEST-AY-001/002/003/004/005/007(file)/009(file)/015(css); SPEC-AY-001/002/003/011;
  REQ-AY-001/002/003/004/005/007/009/015; NFR-AY-002/006; EC-AY-001.
- **Files:**
  - `tests/ui/styles/accessibility.test.ts` (new) — reads `accessibility.css` as text; asserts
    RG-1..RG-6 present + ordered, every selector `.specorator-root`-scoped, RG-1 reduced-motion
    collapse, RG-2 `animation: none`, RG-3 forced-colors + system colours, RG-5 `:focus-visible` +
    `var(--sp-focus-ring)` + no bare `:focus`, RG-6 `.sr-only` clip technique (no `display:none`/
    `visibility:hidden`), discipline scan (no hex / no raw non-`--sp-*` var outside `forced-colors`,
    ASCII-only).
  - `tests/ui/styles/accessibility-registration.test.ts` (new) — reads both entry files; asserts
    `accessibility.css` imported after tokens + animations (3rd CSS import, line-order contract).
- **Commit:** `46dc389691c6608c1e571c23ccf1df800f1e685f`
- **Outcome:** done (RED). All 14 tests failed before T-AY-002 (file ENOENT + imports absent).
- **Deviation:** the file-read test helpers (`mediaBlock` collecting all matching `@media` blocks;
  the group-order marker scan keying off `RG-N -` section markers; the scoped-selector tokeniser)
  were corrected when greening T-AY-002 — the **assertions were not weakened** (a missing group,
  bare `:focus`, `display:none` `.sr-only`, or out-of-`forced-colors` hex still fails). Folded into
  the T-AY-002 commit and recorded there.

### T-AY-002 — `accessibility.css` (RG-1..RG-6) + register at both CSS import sites (🔨 dev)

- **Spec/req:** SPEC-AY-001/002/003; REQ-AY-001/002/003/004/005/006/007/009/015; NFR-AY-002/005/006.
- **Files:**
  - `src/ui/styles/accessibility.css` (new, 1-130) — RG-1 reduced-motion guard (`!important` only
    here), RG-2 spin halt (`animation: none !important`), RG-3 forced-colors surface mapping
    (`forced-color-adjust` + `CanvasText`/`Canvas`/`Highlight`/`HighlightText`/`ButtonText`/
    `ButtonFace`), RG-4 forced-colors border (`.sp-toggle-switch` placeholder, enumerated by
    T-AY-005), RG-5 `:focus-visible` ring consuming `var(--sp-focus-ring)` + the
    `var(--sp-shadow-focus-ring)` clipped-control variant, RG-6 `.sr-only` clip utility. Every
    selector `.specorator-root`-prefixed; ASCII-only comments (no `/`/backtick/`{}` in comments); no
    hex / no raw non-`--sp-*` var outside `forced-colors`.
  - `src/plugin/main.ts` (line 3) — `import '@/ui/styles/accessibility.css';` as the 3rd CSS import
    after `animations.css`.
  - `src/ui/main.ts` (line 15) — `import './styles/accessibility.css';` as the 3rd CSS import after
    `animations.css`. `vite.config.ts` unchanged (the file is authored scope-safe).
  - `tests/ui/styles/accessibility.test.ts` (helper corrections — see the T-AY-003/004 deviation).
- **Commit:** `191443997dcad399778063d4809ca9b442071a55`
- **Outcome:** done. T-AY-003/004 (14 tests) GREEN.
- **Typecheck:** `npx vue-tsc -p tsconfig.lint.json --noEmit` -> **0**.
- **Lint:** whole-project `npm run lint` -> **0 errors** (22 pre-existing warnings, none new).
- **lightningcss:** `npm run build:web` -> **green** (no CSS minify error, EC-AY-013); the RG rules
  (`prefers-reduced-motion`, `forced-colors`, `focus-visible`, `.sr-only`) are present in the
  standalone bundle. `styles.css` not hand-edited.
- **Deviation:** none on the impl. RG-4 carries a single placeholder selector (`.sp-toggle-switch`);
  T-AY-005 completes the concrete enumeration per SPEC-AY-006.

### T-AY-005 — RG-4 forced-colors-border selector enumeration (🔨 dev)

- **Spec/req:** SPEC-AY-006, SPEC-AY-001 (RG-4); REQ-AY-006; NFR-AY-009; EC-AY-003.
- **Files:**
  - `src/ui/styles/accessibility.css` (RG-4 block) — enumerates the concrete background-cue-only
    control selectors per SPEC-AY-006: `.sp-toggle-switch` (toggle switch), `[data-state]` (state
    pills), `.sp-chip` (file/image chips), `.sp-tab` (tab badges),
    `[role="option"][aria-selected="true"]` (selected dropdown option), each given
    `border: 1px solid currentColor` inside the existing `@media (forced-colors: active)` block.
  - `tests/ui/styles/accessibility.test.ts` — adds the TEST-AY-006 file-read leg asserting RG-4
    lists each enumerated control with a `currentColor` border (the coverage-table `006->T-AY-003(file)`
    leg; the mount leg is T-AY-006, Chunk 2).
- **Commit:** `e2a1c53d3c2db31e4e3f2fc2941c913d8d01c1c2`
- **Outcome:** done. The TEST-AY-006 file-read leg passes (15 accessibility-css tests GREEN).
- **Typecheck:** `npx vue-tsc -p tsconfig.lint.json --noEmit` -> **0**.
- **Lint:** whole-project `npm run lint` -> **0 errors** (22 pre-existing warnings, none new).
- **Default render:** unchanged outside `forced-colors` (the rule is inert unless the system palette
  is replaced).
- **Deviation:** none.
