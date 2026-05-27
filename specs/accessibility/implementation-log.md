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

## Chunk 2 — Behaviour-fix sweep (additive ARIA / label / live-region fills) (T-AY-006..013)

### T-AY-006 — forced-colors RG-4 controls mount leg + real-selector correction (🧪 qa)

- **Spec/req:** SPEC-AY-006, SPEC-AY-001 (RG-4); TEST-AY-006; REQ-AY-006, NFR-AY-009, EC-AY-003.
- **Files:**
  - `tests/ui/a11y/forcedColorsControls.test.ts` + `forcedColorsControls.po.ts` (new) — mounts the
    RG-4-listed background-cue-only controls (tab badge `.sp-tab` + `[data-state]`, service-tier
    `role="switch"`, file chip, image thumb, selected permission `[role="option"][aria-selected]`)
    and asserts each exists in the rendered DOM, and that RG-4 enumerates a selector matching each.
  - `src/ui/styles/accessibility.css` (RG-4 block) — **corrected** the RG-4 enumeration: the T-AY-005
    placeholders `.sp-toggle-switch` / `.sp-chip` matched NO real component. Replaced with the real
    swept-component selectors: `[role="switch"]` (ServiceTier/Mode/Permission toggles),
    `.sp-file-chips__chip` + `.sp-image-thumb` (the chips), `[data-state]` (state pills), `.sp-tab`
    (tab badges), `[role="option"][aria-selected="true"]` (selected option).
  - `tests/ui/styles/accessibility.test.ts` (TEST-AY-006 file-read leg) — updated to the real selectors.
- **Commit:** `46869990`
- **Outcome:** done. 5 mount legs verify-only (controls already present); the RG-4 enumeration leg was
  RED (dead selectors) -> green after the correction.
- **Typecheck:** 0. **Lint:** whole-project 0 errors (22 pre-existing warnings).
- **Deviation:** the T-AY-005 RG-4 selectors `.sp-toggle-switch` / `.sp-chip` were dead (no real
  control). The mount leg surfaced this (its stated purpose: "the RG-4 selectors target real controls,
  not dead selectors"). Corrected RG-4 to the real swept-component selectors — additive,
  forced-colors-only, no default-render change. SPEC-AY-006 says T-AY-005's concrete selectors "come
  from the Chunk-2 component sweep", so this is the designed convergence, not a spec divergence.

### T-AY-007 — focus-visible reachability + keyboard operability + accessible names (🧪 qa)

- **Spec/req:** SPEC-AY-007/008; TEST-AY-007/008; REQ-AY-007/008; NFR-AY-001; EC-AY-005/006.
- **Files:** `tests/ui/a11y/keyboardAndLabels.test.ts` + `keyboardAndLabels.po.ts` (new) — mounts the
  audited toolbar/composer/chat controls (tab badge/close/new, composer textarea/attach/send, file chip
  link/remove, image thumb preview/remove, service-tier + permission toggles), asserts each matches the
  RG-5 focus-visible target selector + exposes a non-empty accessible name.
- **Commit:** `8eb7c8da`
- **Outcome:** done, **verify-only** — every audited control already carries an `aria-label` / role /
  tabindex; no gap. Typecheck 0; lint 0 errors.
- **Deviation:** none. The no-stray-mouse-ring counter-metric (EC-AY-006) is the RG-5 `:focus-visible`
  discipline asserted structurally in T-AY-003 (no bare `:focus`); JSDOM cannot compute `:focus-visible`.

### T-AY-008 — RED live-region presence + severity (busy + notice host) (🧪 qa)

- **Spec/req:** SPEC-AY-004; TEST-AY-010; REQ-AY-010; NFR-AY-001; EC-AY-011/012.
- **Files:** `tests/ui/a11y/liveRegions.test.ts` + `NoticeLiveRegion.po.ts` (new); `tests/ui/chat/
  ChatSurface.po.ts` (added `busyRole()` accessor). Asserts the ChatSurface busy region has
  `aria-live="polite"` + `role="status"` (verify-only, green) and a `NoticeLiveRegion` announces
  error=assertive(role=alert) / info=polite(role=status) mirroring the text declaratively without focus
  theft (RED until T-AY-011).
- **Commit:** `2b59482c`
- **Outcome:** done (RED on the notice-host leg — `NoticeLiveRegion.vue` absent; busy-region leg green).
- **Deviation:** none.

### T-AY-009 — collapsible aria-expanded flips + icon-only sr-only/label (🧪 qa)

- **Spec/req:** SPEC-AY-005/007; TEST-AY-011/009; REQ-AY-009/011; EC-AY-007.
- **Files:** `tests/ui/a11y/collapsibleAndSrOnly.test.ts` + `collapsibleAndSrOnly.po.ts` (new) — asserts
  the `SpCollapsible` header (reused by tool-call/thinking/subagent/write-edit) exposes `aria-expanded`
  flipping on Enter/Space/click + an accessible name (direct mount + via ToolCallBlock), and icon-only
  controls (file-chip-remove, image-thumb-remove) carry an `aria-label` with an `aria-hidden` glyph.
- **Commit:** `7603abf2`
- **Outcome:** done, **verify-only** — every collapsible uses `SpCollapsible` (already conforms) and
  every icon-only control already labels itself. Typecheck 0; lint 0 errors.
- **Deviation:** none.

### T-AY-010 — icon-only accessible-name fill (🔨 dev) — VERIFY-ONLY (no code change)

- **Spec/req:** SPEC-AY-007; REQ-AY-008/009; NFR-AY-003/004.
- **Outcome:** **verify-only / no fill needed.** The T-AY-007 + T-AY-009 audit found NO unlabelled
  icon-only control: the composer paperclip/send, file-chip remove, image-thumb remove, and the
  TabBar close/new already carry an `aria-label` + an `aria-hidden="true"` decorative glyph (the
  per-phase a11y sweep was thorough). The RED legs (TEST-AY-008 / TEST-AY-009 mount) are green against
  the current code. No source edit. Closes against T-AY-007 (`8eb7c8da`) + T-AY-009 (`7603abf2`).
- **Deviation:** the task anticipated a fill; the audit found none required (the design predicted most
  items verify-only). Recorded as verify-only per DESIGN-AY-001 B.2.

### T-AY-011 — standalone notice-host live region (🔨 dev)

- **Spec/req:** SPEC-AY-004; REQ-AY-010; NFR-AY-003; EC-AY-011/012.
- **Files:**
  - `src/ui/components/NoticeLiveRegion.vue` (new) — a `.sr-only` ARIA live region (RG-6 clip, zero
    visible footprint) that subscribes to the existing `sp:notice` window `CustomEvent`
    `LocalStorageBridge` already dispatches (no new port/channel). error -> `aria-live="assertive"` +
    `role="alert"`; info/success/warning -> `polite` + `role="status"`. Text bound declaratively as
    `{{ }}` (no `innerHTML`/`v-html`); passive (never `.focus()`), so no focus theft; listener cleaned
    up `onBeforeUnmount`.
  - `src/ui/main.ts` (render fn) — mounts `NoticeLiveRegion` alongside `ChatSurface` inside
    `ErrorBoundary` (additive — `.sr-only`, default render byte-identical).
- **Commit:** `5fcc472e`
- **Outcome:** done. T-AY-008 (6 legs) GREEN. The busy region was verify-only (already conforming).
- **Typecheck:** 0. **Lint:** whole-project 0 errors. **Regression:** `tests/ui/main*.test.ts` (9) green.
- **Deviation:** none. The standalone genuinely had no notice host with a live region (MockBridge only
  logs; LocalStorageBridge dispatched `sp:notice` with no Vue listener) — the genuine SPEC-AY-004 gap.

### T-AY-012 — collapsible aria-expanded fill (🔨 dev) — VERIFY-ONLY (no code change)

- **Spec/req:** SPEC-AY-005; REQ-AY-011; NFR-AY-003/004.
- **Outcome:** **verify-only / no fill needed.** Every rich-render collapsible (tool-call, thinking,
  subagent, write-edit) wraps the single `SpCollapsible` primitive, which already binds `aria-expanded`
  to its open state (flips on Enter/Space/click) + a dynamic `aria-label`. The T-AY-009 RED leg
  (TEST-AY-011) is green against the current code. No source edit. Closes against T-AY-009 (`7603abf2`).
- **Deviation:** the task anticipated a fill; the audit found `SpCollapsible` already conformant
  (DESIGN-AY-001 B.2 / SpCollapsible.vue). Recorded as verify-only.

### T-AY-013 — modal focus trap + restore verify (8 modal seams) (🧪 qa)

- **Spec/req:** SPEC-AY-009; TEST-AY-012/013; REQ-AY-012/013; EC-AY-008/009.
- **Files:** `tests/ui/a11y/modalFocusTrap.test.ts` (new) — structural verify that all 8 modal seams
  (ProviderConsent, DeleteConfirm, ForkTarget, InstructionConfirm, InlineEdit, ImagePreview,
  McpServerHost, McpTestHost) extend Obsidian `Modal` (native trap/restore, D-AY-3). `tests/__fakes__/
  obsidian.stub.ts` — added a minimal `Modal` export (additive) so the `extends` chain forms.
- **Commit:** `39121ad5`
- **Outcome:** done, **verify-only** — all 8 extend `Modal`; no hand-rolled trap. Typecheck 0; lint 0.
- **Deviation:** none. Defect-escalation note recorded in the test: a modal NOT extending `Modal` would
  be ADR-AY-001 + a new task; that does not arise.

## Chunk 3 — Tests + additivity gate (T-AY-014..016)

### T-AY-014 — additivity invariant (🧪 qa)

- **Spec/req:** SPEC-AY-010; TEST-AY-014; REQ-AY-014; NFR-AY-004; EC-AY-010.
- **Files:** `tests/ui/a11y/additivity.test.ts` (new) — `git diff next` shows locale + `manifest.json`
  byte-identical; the entire `src/` diff vs `next` touches ONLY the P12 allow-list (`accessibility.css`,
  the two CSS-import entry edits, the new `.sr-only` `NoticeLiveRegion`) -> NO swept component template
  changed; representative swept components (TabBar/FileChips/ImageThumb/ChatComposer) keep their visible
  default render.
- **Commit:** `7ead8bb6`
- **Outcome:** done. 6 legs green. The cardinal counter-metric = 0 default-state regressions.
- **Deviation:** none.

### T-AY-015 — discipline scan (no added raw-HTML sink) (🧪 qa)

- **Spec/req:** SPEC-AY-011; TEST-AY-015 (diff leg); REQ-AY-015; NFR-AY-003.
- **Files:** `tests/ui/a11y/disciplineScan.test.ts` (new) — scans the added (`+`) lines of the P12
  `src/` diff vs `next`; asserts no `innerHTML`/`outerHTML` assignment, no `insertAdjacentHTML`, no
  `v-html` directive, no new eslint-disable of the raw-HTML/v-html guards.
- **Commit:** `07c1fb7f`
- **Outcome:** done. 3 legs green (the fills are declarative).
- **Deviation:** the `v-html` scan matches the directive form (`v-html=`), not a prose mention in a
  comment, so the NoticeLiveRegion comment that names the banned sinks does not false-positive.

### T-AY-016 — parity-screenshots.md completeness + complete the matrix (🧪 qa + 📐 dev)

- **Spec/req:** REQ-AY-016; TEST-AY-016.
- **Files:** `tests/ui/a11y/parityScreenshots.test.ts` (new) — asserts the matrix lists every charter §3
  surface (§3.1..§3.9) at 320/520/720 px in light + dark, each with a claudian baseline + Specorator
  leg + the two a11y-condition columns. `specs/accessibility/parity-screenshots.md` — marked
  `status: complete` (structure fully populated, baseline column filled); the Specorator +
  a11y-condition cells left for the human reviewer (T-AY-017).
- **Commit:** `3f103ef2`
- **Outcome:** done. 6 completeness legs green (artifact-completeness only; the visual judgment is the
  human TEST-AY-017 leg).
- **Deviation:** none.

## Stage-7 close-out (Chunk 2 + 3, T-AY-006..016)

- **Verification:** whole-project `npm run lint` -> 0 errors (22 pre-existing warnings, none new);
  `npx vue-tsc -p tsconfig.lint.json --noEmit` -> 0; the a11y + styles suite (`tests/ui/a11y/` +
  `tests/ui/styles/`) -> 80 tests green; a P5-P11 regression on the touched/related surfaces
  (TabBar / ChatComposer / FileChips / ImageThumb / SpCollapsible / ToolCallBlock / ChatSurface /
  ServiceTierToggle / PermissionToggle / ui/main / modalSeam) -> 102 tests green (additivity confirmed).
- **Additivity:** the `src/` diff vs `next` is exactly `accessibility.css` (new layer) + `plugin/main.ts`
  + `ui/main.ts` (the 2 import edits + the NoticeLiveRegion render wiring) + `NoticeLiveRegion.vue` (new
  `.sr-only` host). NO swept component template, NO locale, NO `manifest.json` changed.
- **VERIFY-ONLY vs FILLS:** verify-only = T-AY-006 mount existence (5 legs), T-AY-007 (focus/labels),
  T-AY-009 (collapsible/icon-only), T-AY-010, T-AY-012, T-AY-013 (8 modal seams), the busy region.
  Genuine FILLS = (a) T-AY-011 `NoticeLiveRegion.vue` (the standalone notice live region — the real
  SPEC-AY-004 gap); (b) the RG-4 selector correction folded into T-AY-006 (`.sp-toggle-switch`/`.sp-chip`
  -> the real `[role="switch"]`/`.sp-file-chips__chip`/`.sp-image-thumb` selectors).
- **Remaining (parent-owned):** T-AY-017 (HUMAN final parity sign-off, 👤) + T-AY-018 (the gate: full
  verify + lightningcss `build:web` + draft `next` PR). NOT executed here per scope.
