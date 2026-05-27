---
id: SPEC-AY-001
title: Accessibility — implementation-ready spec (accessibility.css + behaviour sweep + tests)
stage: spec
feature: accessibility
area: AY
epic: claudian-reboot
phase: P12
status: complete
owner: architect
integration_branch: next
reference: D:\Projects\claudian-main\src\style\accessibility.css
satisfies:
  - PRD-AY-001 (REQ-AY-001..017)
  - DESIGN-AY-001 (Parts A/B/C)
created: 2026-05-27
updated: 2026-05-27
---

# Specification — Accessibility (P12, final phase)

> Implementation-ready contracts for the P12 accessibility layer. Two independent teams building from
> this should produce the same `accessibility.css`, the same two import edits, the same additive
> behaviour fixes, and the same test set. The only colour literals permitted in `accessibility.css`
> are CSS **system-color keywords inside a `forced-colors` block** (NFR-AY-002). No new port, no new
> ADR (DESIGN-AY-001 §C.6).

## Conventions

- **Scoping.** Every selector in `accessibility.css` is authored prefixed with `.specorator-root` (so
  the build's `scopeBuiltCss()` leaves it as-is). `@keyframes` are never targeted.
- **Comments.** ASCII-only markers (`/* section B.x - ... */`), no non-ASCII glyphs, so the standalone
  lightningcss minifier accepts them (NFR-AY-005).
- **Tokens.** Consume the existing `--sp-focus-ring` (tokens.css:42) and `--sp-shadow-focus-ring`
  (tokens.css:140). Mint no new token (NG2).
- **Additivity.** Every rule is gated behind a media query, `:focus-visible`, `.sr-only`, or an
  additive ARIA attribute. Default (no-condition) render is the `next` baseline, unchanged.

---

## Chunk 1 — `accessibility.css` + pipeline registration

### SPEC-AY-001 — Create `src/ui/styles/accessibility.css` (the 6 rule groups)

- **Artifact:** new file `src/ui/styles/accessibility.css`.
- **Behaviour:** contains exactly the six rule groups below, in this order, scoped to
  `.specorator-root`, ASCII comments, no hex / no raw Obsidian var outside the `forced-colors` block.
- **Group RG-1 — reduced-motion global guard** (REQ-AY-003):
  ```
  @media (prefers-reduced-motion: reduce) {
    .specorator-root *,
    .specorator-root *::before,
    .specorator-root *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
- **Group RG-2 — spin halt** (REQ-AY-004):
  ```
  @media (prefers-reduced-motion: reduce) {
    .specorator-root [data-animation="spin"],
    .specorator-root .sp-spin {
      animation: none !important;
    }
  }
  ```
- **Group RG-3 — forced-colors surface mapping** (REQ-AY-005): inside `@media (forced-colors: active)`,
  set `.specorator-root { forced-color-adjust: auto; }` and map text→`CanvasText`, surfaces→`Canvas`,
  focus/selected→`Highlight`/`HighlightText`, button affordances→`ButtonText`/`ButtonFace`. (No layout
  change — colour mapping only.)
- **Group RG-4 — forced-colors border guarantee** (REQ-AY-006): inside the same `@media (forced-colors:
  active)`, set `border: 1px solid currentColor;` (or `outline` where the box-model must not shift) on
  the background-cue-only controls: the toggle switch, state pills, chips, tab badges, selected
  dropdown options. Enumerate the concrete selectors per the swept components (SPEC-AY-006).
- **Group RG-5 — focus-visible ring** (REQ-AY-007):
  ```
  .specorator-root :where(button, [role="tab"], [role="option"], [role="switch"],
    a[href], textarea, input, select, [tabindex]):focus-visible {
    outline: 2px solid var(--sp-focus-ring);
    outline-offset: 2px;
  }
  ```
  Plus a `box-shadow: var(--sp-shadow-focus-ring)` variant for controls whose `outline` is clipped by
  `overflow: hidden`. Uses `:focus-visible` (never bare `:focus`).
- **Group RG-6 — `.sr-only` utility** (REQ-AY-009):
  ```
  .specorator-root .sr-only {
    position: absolute;
    inline-size: 1px; block-size: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  ```
- **Pre-conditions:** tokens.css declares `--sp-focus-ring` + `--sp-shadow-focus-ring` (it does).
- **Side effects:** none at runtime beyond CSS; no JS, no DOM.
- **Errors:** a lightningcss minify error on the standalone build = NFR-AY-005 failure (fix the
  comment/at-rule, do not suppress).
- **Satisfies:** REQ-AY-001, REQ-AY-003, REQ-AY-004, REQ-AY-005, REQ-AY-006, REQ-AY-007, REQ-AY-009,
  REQ-AY-015.
- **Verified by:** TEST-AY-001, TEST-AY-003, TEST-AY-004, TEST-AY-005, TEST-AY-006, TEST-AY-007,
  TEST-AY-009, TEST-AY-015.

### SPEC-AY-002 — Register `accessibility.css` at the plugin entry

- **Signature:** add `import '@/ui/styles/accessibility.css';` to `src/plugin/main.ts` as the **third**
  CSS import, immediately after `import '@/ui/styles/animations.css';` (line 2).
- **Post-condition:** the produced plugin `styles.css` contains the RG-1..RG-6 rules.
- **Satisfies:** REQ-AY-002 (plugin leg). **Verified by:** TEST-AY-002.

### SPEC-AY-003 — Register `accessibility.css` at the standalone entry

- **Signature:** add `import './styles/accessibility.css';` to `src/ui/main.ts` as the **third** CSS
  import, immediately after `import './styles/animations.css';` (line 14).
- **Post-condition:** the standalone bundle contains the RG-1..RG-6 rules.
- **Satisfies:** REQ-AY-002 (standalone leg). **Verified by:** TEST-AY-002.

---

## Chunk 2 — Behaviour-fix sweep (additive edits to existing components)

> Each item is **additive**: it adds an ARIA attribute, an `.sr-only` label, or asserts an existing
> affordance. No default render, layout, microcopy, or locale string changes (REQ-AY-014). Where the
> audit found the affordance already present, the item is **verify-only** (a test, not a code edit).

### SPEC-AY-004 — Streaming + notice live regions

- **Behaviour:** the streaming busy region in `src/ui/chat/ChatSurface.vue` already carries
  `aria-live="polite"` + `role="status"` (lines 856-857) — **verify-only**. The notice host must
  announce: error notices assertive, info/success polite. In the standalone, if the notice host has no
  live region, add an `aria-live` region (polite default, assertive for error) that mirrors the notice
  text — declaratively (no `innerHTML`/`v-html`).
- **Pre/post:** focus is never stolen by the announcement.
- **Satisfies:** REQ-AY-010. **Verified by:** TEST-AY-010.

### SPEC-AY-005 — Collapsible `aria-expanded` + accessible name

- **Behaviour:** each collapsible header (tool call / thinking / subagent / write-edit) under
  `src/ui/chat/rich/**` exposes `aria-expanded` bound to its open state and an accessible name
  (visible text or `aria-label`). If a header already has it, verify-only; otherwise add it.
- **State transition:**
  ```mermaid
  stateDiagram-v2
    [*] --> Collapsed
    Collapsed --> Expanded: Enter/Space/click (aria-expanded=true)
    Expanded --> Collapsed: Enter/Space/click (aria-expanded=false)
  ```
- **Satisfies:** REQ-AY-011. **Verified by:** TEST-AY-011.

### SPEC-AY-006 — Forced-colors borders on the enumerated background-cue-only controls

- **Behaviour:** the RG-4 selector list (SPEC-AY-001) must enumerate the concrete classes of every
  control whose normal affordance is a background fill/wash only. Audit the toolbar toggle switch, the
  state pills, the file/image chips, the tab badges (`.sp-tab`), and the selected dropdown option, and
  list each in RG-4 so each gains a visible border under forced-colors.
- **Pre/post:** under `forced-colors: active`, each listed control has a perceivable border; default
  render unchanged.
- **Satisfies:** REQ-AY-006. **Verified by:** TEST-AY-006.

### SPEC-AY-007 — Icon-only controls carry an accessible name; keyboard operability + labelling sweep

- **Behaviour:** audit every interactive control in the toolbar strip, settings shell, and chat surface
  (composer, message actions, dropdowns, tab close `×`, new-tab `+`, paperclip, chip remove, image
  remove). Each must (a) be keyboard-reachable + operable via Enter/Space per the audit contract, and
  (b) expose a non-empty accessible name (visible label, `aria-label`, or an `.sr-only` label). Add
  `aria-label`/`.sr-only` where missing; keep decorative glyphs `aria-hidden="true"` (TabBar already
  does — verify-only there).
- **Satisfies:** REQ-AY-008, REQ-AY-009. **Verified by:** TEST-AY-008, TEST-AY-009.

### SPEC-AY-008 — Focus-visible ring reaches every interactive control

- **Behaviour:** RG-5 (SPEC-AY-001) covers the standard interactive elements via the `:where(...)`
  selector. Verify across surfaces that no interactive control is excluded (e.g. a custom `div[role]`
  control gets `tabindex` so it matches `[tabindex]`). No control shows a stray ring on mouse `:focus`
  (the counter-metric).
- **Satisfies:** REQ-AY-007, REQ-AY-008. **Verified by:** TEST-AY-007.

### SPEC-AY-009 — Modal focus trap + restore via the platform

- **Behaviour:** the eight Specorator modals (ProviderConsent, DeleteConfirm, ForkTarget,
  InstructionConfirm, InlineEdit, ImagePreview, McpServer, McpTest) extend Obsidian `Modal`, which
  natively traps Tab/Shift+Tab within the modal and restores `document.activeElement` on close. **Do
  not hand-roll a trap.** The spec requires each launcher to open a `Modal` subclass; the test asserts
  that property + (where the harness allows) a Tab-cycle staying inside + focus returning to the opener.
- **Pre-condition:** the opener control is focusable + present when the modal opens.
- **Post-condition:** on any close path (accept/reject/Esc/overlay), focus returns to the opener (or
  its nearest still-present sibling), not `document.body`.
- **Satisfies:** REQ-AY-012, REQ-AY-013. **Verified by:** TEST-AY-012, TEST-AY-013.

### SPEC-AY-010 — Additivity invariant

- **Behaviour:** no swept component's default (no-media-query, no-`.sr-only`) render, layout,
  microcopy, locale output, or behaviour changes. The a11y rules take effect only inside
  `:focus-visible`, `prefers-reduced-motion`, `forced-colors`, `.sr-only`, or additive ARIA.
- **Satisfies:** REQ-AY-014, NFR-AY-004. **Verified by:** TEST-AY-014.

### SPEC-AY-011 — Discipline invariant (no raw-HTML sink, no token leak)

- **Behaviour:** the P12 diff adds no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html`;
  `accessibility.css` carries no hex / no raw Obsidian var outside the single `forced-colors`
  system-color block.
- **Satisfies:** REQ-AY-015, NFR-AY-002, NFR-AY-003. **Verified by:** TEST-AY-015.

---

## Chunk 3 — Tests (TEST-AY-001..016 automatable; TEST-AY-017 human)

> Tests mirror `src/` path-for-path (ADR-009); component mounts use co-located class-based PageObjects
> querying by `data-testid` only. CSS-rule-presence tests read `src/ui/styles/accessibility.css` as
> text; registration tests read the entry files as text.

| TEST | Kind | Asserts | Verifies SPEC / REQ |
|---|---|---|---|
| TEST-AY-001 | file read | `accessibility.css` exists + declares RG-1..RG-6 (reduced-motion, spin, forced-colors, focus-visible, `.sr-only`); every selector is `.specorator-root`-scoped | SPEC-AY-001 / REQ-AY-001 |
| TEST-AY-002 | file read | both `src/plugin/main.ts` + `src/ui/main.ts` import `accessibility.css` after tokens + animations | SPEC-AY-002/003 / REQ-AY-002 |
| TEST-AY-003 | file read | RG-1 reduced-motion guard present (`prefers-reduced-motion: reduce` collapsing animation/transition duration) | SPEC-AY-001 / REQ-AY-003 |
| TEST-AY-004 | file read | RG-2 sets `animation: none` (not a duration) for `[data-animation="spin"]`/`.sp-spin` under reduced-motion | SPEC-AY-001 / REQ-AY-004 |
| TEST-AY-005 | file read | RG-3 `@media (forced-colors: active)` present with `forced-color-adjust` + system-color keywords | SPEC-AY-001 / REQ-AY-005 |
| TEST-AY-006 | file read + mount | RG-4 enumerates the background-cue-only controls (toggle/pill/chip/`.sp-tab`/selected option) with a forced-colors border; the listed `data-testid` controls exist in the mounted surfaces | SPEC-AY-001/006 / REQ-AY-006 |
| TEST-AY-007 | file read + mount | RG-5 uses `:focus-visible` + `--sp-focus-ring`; a keyboard-focused control (PageObject Tab) exposes the ring; mouse `:focus` shows none | SPEC-AY-001/008 / REQ-AY-007 |
| TEST-AY-008 | mount | every audited control in toolbar/settings/chat is focusable + has a non-empty accessible name | SPEC-AY-007 / REQ-AY-008 |
| TEST-AY-009 | file read + mount | RG-6 `.sr-only` clip technique present (not `display:none`/`visibility:hidden`); icon-only controls carry an `.sr-only`/`aria-label` | SPEC-AY-001/007 / REQ-AY-009 |
| TEST-AY-010 | mount | the busy region has `aria-live="polite"` + `role="status"`; the notice host announces (error assertive, info polite) without focus theft | SPEC-AY-004 / REQ-AY-010 |
| TEST-AY-011 | mount | a collapsible header exposes `aria-expanded` that flips on Enter/Space/click + has an accessible name | SPEC-AY-005 / REQ-AY-011 |
| TEST-AY-012 | mount | each launcher opens a `Modal` subclass; a PageObject Tab-cycle stays within the modal (or, where JSDOM cannot, the structural `Modal`-subclass assertion) | SPEC-AY-009 / REQ-AY-012 |
| TEST-AY-013 | mount | closing a modal (accept/reject/Esc) returns focus to the recorded opener, not `document.body` | SPEC-AY-009 / REQ-AY-013 |
| TEST-AY-014 | mount/snapshot | no swept component's default render or locale output differs from baseline (additivity diff) | SPEC-AY-010 / REQ-AY-014 |
| TEST-AY-015 | scan | no added `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html` in the P12 diff; `accessibility.css` has no hex / no raw Obsidian var outside the `forced-colors` block; ASCII-only comments | SPEC-AY-011 / REQ-AY-015 |
| TEST-AY-016 | artifact check | `specs/accessibility/parity-screenshots.md` exists and lists every charter §3 surface at 320/520/720 px in light + dark (artifact-completeness only; not the visual judgment) | REQ-AY-016 |
| **TEST-AY-017** | **HUMAN** | **the final cross-surface parity screenshot sign-off — all P1–P11 surfaces, light + dark, 320/520/720 px, plus the accumulated P5–P11 manual-Obsidian legs. The single final epic gate. The agent PRESENTS it (and opens, does not merge, the `next`→`develop` PR); it is NEVER agent-claimed (constitution Art. VII).** | **REQ-AY-017** |

---

## Edge cases (EC-AY-NNN)

| ID | Scenario | Required behaviour | REQ |
|---|---|---|---|
| EC-AY-001 | Reduced-motion + an active indeterminate spinner (title-gen / inline-edit / instruction) | RG-2 sets `animation: none` — the spinner does not rotate (a near-zero duration alone would not stop an indeterminate loop, CQ-AUX-14) | REQ-AY-004 |
| EC-AY-002 | Reduced-motion + a transition the per-section tokens did not collapse (a future component) | RG-1 safety-net collapses it to ~0; no perceptible motion | REQ-AY-003 |
| EC-AY-003 | Forced-colors + a control signalled only by a background wash (toggle/pill/chip/selected option) | RG-4 adds a visible `currentColor` border so the control stays distinguishable | REQ-AY-006 |
| EC-AY-004 | Forced-colors + a focused control | the focus state resolves to `Highlight` (RG-3) and the ring stays perceivable | REQ-AY-005, REQ-AY-007 |
| EC-AY-005 | Keyboard focus lands on a control reached by Tab | RG-5 `:focus-visible` ring shows | REQ-AY-007 |
| EC-AY-006 | Mouse click on the same control | no ring (`:focus-visible` excludes pointer focus) — the counter-metric | REQ-AY-007 |
| EC-AY-007 | An `.sr-only`-labelled icon-only control | the label is in the accessibility tree but has zero visible footprint (clip technique, not `display:none`) | REQ-AY-009 |
| EC-AY-008 | A modal opens, user Tabs past the last control | focus wraps within the modal (Obsidian `Modal` native trap); never lands behind the modal | REQ-AY-012 |
| EC-AY-009 | A modal closes via Esc / overlay / accept / reject | focus returns to the opener control (native restore); if the opener was removed, to its nearest sibling, never `document.body` | REQ-AY-013 |
| EC-AY-010 | No a11y media query active, no `.sr-only` applied | default render byte-identical to the `next` baseline (additivity) | REQ-AY-014 |
| EC-AY-011 | Assistant streams while the user reads earlier output | the polite live region announces the new text without moving focus | REQ-AY-010 |
| EC-AY-012 | An error notice fires | announced assertive (interrupts) while info/success stay polite | REQ-AY-010 |
| EC-AY-013 | Standalone lightningcss minify of `accessibility.css` | green — ASCII comments + standard at-rules; no minify error (NFR-AY-005) | REQ-AY-015 |
| EC-AY-014 | A user theme overrides `--interactive-accent` | the focus ring follows it (RG-5 consumes `--sp-focus-ring` → `--interactive-accent`); no hardcoded colour | REQ-AY-007 |

---

## Observability

P12 adds no new logs/metrics/traces — it is presentation + accessibility-tree only. The existing
`LoggerPort`/`NotificationPort`/`FeedbackService` paths are unchanged; the notice-announcement change
(SPEC-AY-004) routes through the existing `NotificationPort` severity (error→assertive,
info/success→polite), not a new channel.

## Performance budget

Inherits the PRD NFRs; no new threshold. The reduced-motion guard uses `!important` on a universal
selector inside a media query that is inert unless `prefers-reduced-motion` is set — no default-path
cost. `npm run build` + `npm run build:web` stay green (NFR-AY-005); `npm run verify` +
`npm run test:all` zero failures on `next` (NFR-AY-010); coverage 80/70/80/80 holds (NFR-AY-007).

## Compatibility

No backward-compat / migration (CHARTER-REQ-FRESH, NG5). `manifest.json` byte-identical (NFR-AY-008).
en/de + all ten locales byte-identical (NFR-AY-004). The layer is strictly additive — no surface
regresses (REQ-AY-014).

---

## Requirements coverage table (REQ-AY ↔ SPEC-AY ↔ TEST-AY)

| REQ | SPEC | TEST | Leg |
|---|---|---|---|
| REQ-AY-001 | SPEC-AY-001 | TEST-AY-001 | auto |
| REQ-AY-002 | SPEC-AY-002, SPEC-AY-003 | TEST-AY-002 | auto |
| REQ-AY-003 | SPEC-AY-001 (RG-1) | TEST-AY-003 | auto |
| REQ-AY-004 | SPEC-AY-001 (RG-2) | TEST-AY-004 | auto |
| REQ-AY-005 | SPEC-AY-001 (RG-3) | TEST-AY-005 | auto |
| REQ-AY-006 | SPEC-AY-001 (RG-4), SPEC-AY-006 | TEST-AY-006 | auto |
| REQ-AY-007 | SPEC-AY-001 (RG-5), SPEC-AY-008 | TEST-AY-007 | auto |
| REQ-AY-008 | SPEC-AY-007, SPEC-AY-008 | TEST-AY-008 | auto |
| REQ-AY-009 | SPEC-AY-001 (RG-6), SPEC-AY-007 | TEST-AY-009 | auto |
| REQ-AY-010 | SPEC-AY-004 | TEST-AY-010 | auto |
| REQ-AY-011 | SPEC-AY-005 | TEST-AY-011 | auto |
| REQ-AY-012 | SPEC-AY-009 | TEST-AY-012 | auto |
| REQ-AY-013 | SPEC-AY-009 | TEST-AY-013 | auto |
| REQ-AY-014 | SPEC-AY-010 | TEST-AY-014 | auto |
| REQ-AY-015 | SPEC-AY-001, SPEC-AY-011 | TEST-AY-015 | auto |
| REQ-AY-016 | (artifact: parity-screenshots.md) | TEST-AY-016 | auto (completeness) |
| REQ-AY-017 | (human acceptance) | **TEST-AY-017** | **HUMAN — final epic gate** |

**NFR coverage:** NFR-AY-001 (TEST-AY-006/007/008/010/011/012/013 across surfaces) · NFR-AY-002
(TEST-AY-015) · NFR-AY-003 (TEST-AY-015) · NFR-AY-004 (TEST-AY-014) · NFR-AY-005 (build green,
EC-AY-013) · NFR-AY-006 (TEST-AY-002) · NFR-AY-007 (coverage gate) · NFR-AY-008 (manifest unchanged)
· NFR-AY-009 (TEST-AY-005/006 + EC-AY-002/003) · NFR-AY-010 (verify + test:all green).

## Planner chunk boundaries

1. **Chunk 1 — accessibility.css + registration** (SPEC-AY-001/002/003): one new file + two one-line
   import edits. Self-contained; lands first. Tests TEST-AY-001..005, 015 (file-read leg) + TEST-AY-002.
2. **Chunk 2 — behaviour-fix sweep** (SPEC-AY-004..011): additive ARIA/label/live-region edits across
   the swept components; mostly verify-only (busy region, TabBar, modals) + targeted fills
   (collapsible `aria-expanded`, icon-only labels, RG-4 selector enumeration). Tests TEST-AY-006..014.
3. **Chunk 3 — tests + the human gate artifact** (TEST-AY-001..016 + the `parity-screenshots.md`
   artifact for TEST-AY-016): the automatable suite under the verify gate. TEST-AY-017 (human sign-off)
   is presented, not built — the agent opens (does not merge) the `next`→`develop` PR after the gate is
   green.
