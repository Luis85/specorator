---
id: PRD-AY-001
title: Accessibility — a11y stylesheet + WCAG 2.2 AA sweep + final parity sign-off
stage: requirements
feature: accessibility
area: AY
epic: claudian-reboot
phase: P12
status: accepted
owner: pm
integration_branch: next
inputs:
  - CHARTER-CLAUDIAN-REBOOT §1 (WCAG 2.2 AA bar; keyboard nav / focus management / forced-colors / reduced-motion — "meet or beat" claudian accessibility.css; lines 50-51)
  - CHARTER-CLAUDIAN-REBOOT §3.9 (a11y stylesheet + behaviours) + §3.10 (accessibility.css in the 45-module visual system) + §4 P12 row (line 195) + §5.5 (program-done = P12 sign-off screenshots approved)
  - specs/claudian-reboot/claudian-audit-frontend.md §"Motion/animation inventory" line 358 (claudian accessibility.css is minimal — focus-visible rings only; Specorator must beat it with reduced-motion + forced-colors) + §"Keyboard-shortcut map" (the parity interaction contract) + the per-surface ARIA/keyboard notes
  - D:\Projects\claudian-main accessibility.css (the reference a11y layer to meet/beat — charter §3.10) + the a11y behaviours
  - src/ui/styles/tokens.css (the --sp-* token layer + per-section prefers-reduced-motion overrides §4.6/§4.9/§4.10/§4.11) + src/ui/styles/animations.css (the five named keyframes + the existing spin reduced-motion guard CQ-AUX-14)
  - src/plugin/main.ts + src/ui/main.ts (the CSS import pipeline — accessibility.css joins tokens.css/animations.css at both entry points) + vite.config.ts scopeBuiltCss() (auto-scopes selectors under .specorator-root :where(...), skips @keyframes)
  - src/plugin/AgentSidebarView.ts (the .specorator-root host) + the P5/P7/P8/P10 modal seams (ProviderConsentModal/DeleteConfirmModal/ForkTargetModal/InstructionConfirmModal/InlineEditModal/ImagePreviewModal/McpServerModal/McpTestModal) + the P1-P11 components for the behaviour sweep
created: 2026-05-27
updated: 2026-05-27
---

# PRD — Accessibility (P12, final phase)

## Summary

P12 is the **final** phase of the claudian-reboot epic. P0–P11 are merged to `next`; every
user-facing surface — chat, rich rendering, threads, composer, attachments, toolbar, approvals,
MCP, providers, settings, ten locales — now exists. This phase adds the global **accessibility
layer** and closes the accessibility gaps the per-phase work could not see in isolation.

Two deliverables. First, a new `src/ui/styles/accessibility.css` stylesheet — the third CSS layer
alongside `tokens.css` and `animations.css`, registered at both CSS import sites (`src/plugin/main.ts`
and `src/ui/main.ts`) — that **meets or beats** Claudian's `accessibility.css` (charter §1, §3.10).
The frontend audit (line 358) establishes the baseline: Claudian's layer is *minimal* — focus-visible
rings only. Specorator beats it by adding the `prefers-reduced-motion` global guard, `forced-colors`
/ high-contrast system-color mapping, a complete `:focus-visible` ring across every interactive
`--sp-*` control, and an `.sr-only` screen-reader-only utility. Second, a **WCAG 2.2 AA behaviour
sweep** across the P1–P11 surfaces: filling ARIA-role/label gaps, verifying modal focus trap +
restore at the P5/P7/P8/P10 modal seams, adding live regions for streaming/notices where missing,
and confirming the toolbar/settings/chat surfaces are keyboard-operable and labelled. The bar is
**WCAG 2.2 AA** (charter §1).

The automatable part — the stylesheet, the behaviour fixes, and the a11y tests — ships under the
verify gate. The **final parity screenshot sign-off across all surfaces, light + dark, at the charter
widths (320 / 520 / 720 px)** is a **human-owned** acceptance leg. The accumulated manual-Obsidian
and parity-screenshot legs from P5–P11 converge here as the single final epic gate (charter §5.5,
workflow-state line 64). After P12 merges to `next` with a green gate, opening the `next` → `develop`
PR is the human's call.

## Goals

- G1 — Ship `src/ui/styles/accessibility.css` as a third global a11y CSS layer that meets-or-beats
  claudian's `accessibility.css` and is registered in the build CSS pipeline at both entry points.
- G2 — Add a global `prefers-reduced-motion: reduce` guard that disables or softens every animation
  in `animations.css` (the five named keyframes) and every motion-carrying transition, covering the
  gaps the per-section token overrides do not reach.
- G3 — Add `forced-colors` / high-contrast handling: map surfaces to system colors with
  `forced-color-adjust`, and guarantee a visible border on every interactive control so it stays
  perceivable when the token palette is replaced.
- G4 — Provide a `:focus-visible` keyboard-focus ring on every interactive `--sp-*` control across
  all surfaces, and an `.sr-only` screen-reader-only utility for visually-hidden labels.
- G5 — Sweep the P1–P11 surfaces for WCAG 2.2 AA behaviour gaps: ARIA roles/labels, modal focus
  trap + restore (P5/P7/P8/P10 seams), live regions for streaming/notices, keyboard operability and
  labelling of the toolbar / settings / chat surfaces — filling only the gaps, not re-building.
- G6 — Keep the layer strictly **additive**: no surface regresses; en/de + all ten locales and the
  P0–P11 behaviour stay unchanged except for the a11y improvements.
- G7 — Surface the **human-owned** final parity screenshot sign-off (all surfaces, light + dark, the
  charter widths) as the single final epic acceptance gate — never self-claimed.

## Non-goals

- NG1 — New visual design, layout, or microcopy. P12 polishes accessibility; it does not restyle or
  re-word any surface. Forced-colors/high-contrast appearance is a system-driven fallback, not a new
  theme.
- NG2 — New `--sp-*` tokens or palette changes. The a11y layer consumes the existing token layer; the
  only deliberate exception is the documented `forced-colors` system-color mapping (charter §3.10).
- NG3 — WCAG levels beyond 2.2 AA (no AAA), and platform AT certification (e.g. formal NVDA/VoiceOver
  conformance audit) beyond the automatable checks plus the human screenshot/manual sweep.
- NG4 — New keyboard shortcuts or interaction patterns beyond the parity contract already built in
  P1–P11 (audit "Keyboard-shortcut map"). P12 fills *gaps* in that contract; it does not extend it.
- NG5 — Backwards compatibility / migration of any kind (CHARTER-REQ-FRESH).
- NG6 — Changing the `next` → `develop` merge decision: that is the human's call after P12's gate is
  green (workflow-state line 69-71).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Keyboard-only Specorator user | Operate chat, composer, toolbar, settings, and every modal without a pointer | WCAG 2.2 AA (charter §1) requires full keyboard operability; the per-phase work built keyboard nav but P12 must prove no surface is a keyboard trap and every focus is visible. |
| Screen-reader user (NVDA/VoiceOver) | Roles, labels, and live announcements for streaming text, tool calls, and notices | Imperative-DOM Claudian had ad-hoc ARIA; the Vue rebuild needs a deliberate sweep so the structure is announced and streaming output is announced via live regions. |
| High-contrast / forced-colors user (Windows HCM) | Surfaces remain perceivable when the OS replaces the colour palette | The `--sp-*` token layer resolves to Obsidian theme colours; under forced-colors those are overridden, so borders/state cues must survive — a gap Claudian's minimal layer does not cover. |
| Reduced-motion user | Streaming pulses, glows, spinners, and dropdown transitions calmed | The five named keyframes + transitions are motion sources; the token overrides cover most but P12 must guarantee a global guard so nothing animates against the user's stated preference. |
| Maintainer / reviewer | Confidence the a11y layer is additive and token-disciplined | An a11y layer that leaks raw colour outside the documented forced-colors exception, or regresses a surface, would violate the epic constraints; deterministic guards make that a red build. |
| Human acceptance owner | A complete, side-by-side parity screenshot set at the charter widths to approve | Charter §5.5 makes the P12 sign-off screenshots the program-done gate; this is human judgment that no automatable test replaces. |

## Jobs to be done

- When **I navigate Specorator with only the keyboard**, I want **a visible focus ring on every
  control and no surface that traps or loses my focus**, so I can **reach and operate every feature
  without a mouse**.
- When **I use a screen reader**, I want **each surface's roles/labels announced and streaming
  assistant output announced as it arrives**, so I can **follow the conversation and operate controls
  without sighted feedback**.
- When **I run Windows High Contrast / forced-colors**, I want **every control to keep a visible
  border and state cue**, so I can **tell controls apart when the colour palette is replaced**.
- When **I have set "reduce motion" in my OS**, I want **the thinking pulse, glows, spinners, and
  dropdown transitions disabled or softened**, so I can **use the plugin without motion discomfort**.
- When **the epic is feature-complete on `next`**, I want **a side-by-side parity screenshot set of
  every surface at 320/520/720 px in light + dark to review**, so I can **approve the reboot as 1:1
  before it merges to `develop`**.

## Functional requirements (EARS)

> Use [EARS notation](../../docs/ears-notation.md). One requirement per entry. Stable IDs. The 1:1
> claudian reference is `accessibility.css` (charter §3.10), characterised by the frontend audit
> (line 358) as a minimal focus-visible-rings layer that Specorator must *meet or beat*. Where the
> requirement beats claudian (reduced-motion, forced-colors, sr-only, live regions), the path is
> noted as `beat: claudian accessibility.css (minimal)`. Surface scope = the `.specorator-root`
> subtree (the agent sidebar + every mounted modal seam).

### Group A — accessibility.css layer & pipeline registration

#### REQ-AY-001 — accessibility.css exists as the third global a11y layer

- **Pattern:** ubiquitous
- **Statement:** *The plugin shall provide a stylesheet `src/ui/styles/accessibility.css` containing
  the global accessibility rules (reduced-motion guard, forced-colors mapping, focus-visible rings,
  and the `.sr-only` utility), scoped to the `.specorator-root` subtree consistently with `tokens.css`
  and `animations.css`.*
- **Acceptance:**
  - Given the source tree
  - When `src/ui/styles/accessibility.css` is inspected
  - Then it exists, declares the reduced-motion / forced-colors / focus-visible / `.sr-only` rule
    groups, and contains no rule that targets outside the `.specorator-root` subtree (the build's
    `scopeBuiltCss()` auto-scoping is honoured, not fought)
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9, §3.10, §1 — 1:1 path `accessibility.css` (meet/beat)
- **Verified by:** TEST-AY-001

#### REQ-AY-002 — accessibility.css registered at both CSS import sites

- **Pattern:** ubiquitous
- **Statement:** *The build CSS pipeline shall import `accessibility.css` at both entry points —
  `src/plugin/main.ts` (the bundled `styles.css`) and `src/ui/main.ts` (the standalone build) —
  alongside `tokens.css` and `animations.css`.*
- **Acceptance:**
  - Given the plugin build and the standalone build
  - When each entry point's CSS imports are enumerated and the produced `styles.css` (plugin) /
    standalone bundle is inspected
  - Then `accessibility.css` is imported at both `src/plugin/main.ts` and `src/ui/main.ts`, and its
    rules appear in both built outputs
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.10 (accessibility.css in the visual system); workflow-state
  scope "registered in the build's CSS pipeline" — 1:1 path `accessibility.css`
- **Verified by:** TEST-AY-002

### Group B — Reduced motion

#### REQ-AY-003 — Reduced motion disables or softens every animation

- **Pattern:** event-driven
- **Statement:** *When the user agent reports `prefers-reduced-motion: reduce`, the accessibility layer
  shall disable or reduce to a non-moving fallback every animation defined in `animations.css` (the
  `thinking-pulse`, `streaming-cursor-blink`, `spin`, `mcp-glow`, and `external-context-glow`
  keyframes) and every motion-carrying transition within `.specorator-root`.*
- **Acceptance:**
  - Given `prefers-reduced-motion: reduce` is active
  - When any surface that would animate (live thinking pulse, streaming cursor, indeterminate spinner,
    MCP/external-context glow, dropdown open, toggle knob, usage-meter fill) renders
  - Then no element runs a perceptible looping or transitional animation (animation/transition
    collapsed to `none`/`0s` or a static fallback), complementing — not duplicating-and-conflicting
    with — the existing per-section token overrides in `tokens.css`
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (reduced-motion); audit line 358 — `beat: claudian
  accessibility.css (minimal)`
- **Verified by:** TEST-AY-003

#### REQ-AY-004 — Indeterminate spinners are explicitly halted under reduced motion

- **Pattern:** event-driven
- **Statement:** *When `prefers-reduced-motion: reduce` is active, the accessibility layer shall set
  `animation: none` on any element running the `spin` keyframe (title-gen loader, inline-edit spinner,
  instruction-modal spinner), because an indeterminate loop is not stopped by zeroing a duration token
  alone (CQ-AUX-14).*
- **Acceptance:**
  - Given `prefers-reduced-motion: reduce` is active and an element marked as a spinner
  - When it renders
  - Then its `spin` animation is `none` (not merely `0s`), so no spinner rotates
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1; animations.css CQ-AUX-14 (the existing spin guard,
  consolidated/confirmed here) — `beat: claudian accessibility.css (minimal)`
- **Verified by:** TEST-AY-004

### Group C — Forced colors & contrast

#### REQ-AY-005 — Forced-colors maps surfaces to system colors

- **Pattern:** event-driven
- **Statement:** *When the user agent reports `forced-colors: active`, the accessibility layer shall
  apply `forced-color-adjust` and the documented system-color keywords (e.g. `CanvasText`, `Canvas`,
  `Highlight`, `ButtonText`, `ButtonFace`) to the `.specorator-root` surfaces so the plugin remains
  legible when the user's colour palette is replaced.*
- **Acceptance:**
  - Given `forced-colors: active`
  - When any P1–P11 surface renders
  - Then text, backgrounds, and interactive controls resolve to system colours (the documented
    forced-colors/system-colors exception to the token-only rule), and no surface becomes invisible or
    unreadable
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (forced-colors), §3.10 — `beat: claudian accessibility.css
  (minimal)`
- **Verified by:** TEST-AY-005

#### REQ-AY-006 — Interactive controls keep a visible border under forced-colors

- **Pattern:** event-driven
- **Statement:** *When `forced-colors: active`, the accessibility layer shall guarantee a visible
  (non-transparent, non-`currentColor`-collapsing) border on every interactive `--sp-*` control whose
  normal affordance is conveyed only by a background fill or wash (toggles, pills, chips, tabs,
  dropdown options, buttons).*
- **Acceptance:**
  - Given `forced-colors: active`
  - When a control that normally relies on a background-only cue renders (e.g. a `SpToggleSwitch`, a
    tab badge, a selected dropdown option, a context chip)
  - Then the control shows a perceivable border so it is distinguishable from its surroundings and from
    its sibling controls
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (forced-colors / non-colour cue); audit §"Composer power"
  NFR-CP-008 (non-colour cue for forced-colors) — `beat: claudian accessibility.css (minimal)`
- **Verified by:** TEST-AY-006

### Group D — Focus-visible & keyboard operability

#### REQ-AY-007 — Focus-visible ring on every interactive control

- **Pattern:** event-driven
- **Statement:** *When an interactive `--sp-*` control receives keyboard focus (`:focus-visible`), the
  accessibility layer shall render a visible focus ring (using `--sp-focus-ring` / `--sp-shadow-focus-ring`)
  on that control across every P1–P11 surface — buttons, toggles, tab badges, dropdown options, chips,
  textarea, collapsible headers, and modal controls.*
- **Acceptance:**
  - Given keyboard focus moves to an interactive control via Tab / arrow navigation
  - When the control is focused
  - Then a visible focus ring is present (and it is not suppressed for mouse-only `:focus`, i.e.
    `:focus-visible` is used so pointer interaction does not show a stray ring), matching or exceeding
    claudian's focus-visible rings
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (focus management) — 1:1 path `accessibility.css`
  (focus-visible rings, the part claudian *does* ship) — meet
- **Verified by:** TEST-AY-007

#### REQ-AY-008 — Toolbar, settings, and chat surfaces are keyboard-operable and labelled

- **Pattern:** ubiquitous
- **Statement:** *Every interactive control in the toolbar strip, the settings shell, and the chat
  surface (composer, message actions, dropdowns) shall be reachable and operable by keyboard and shall
  expose an accessible name (visible label, `aria-label`, or an associated `.sr-only` label).*
- **Acceptance:**
  - Given a surface rendered with no pointer device
  - When the user tabs/arrows through its controls and activates them via Enter/Space (per the audit
    keyboard contract)
  - Then every control is focusable in a sensible order, is operable from the keyboard, and reports a
    non-empty accessible name to the accessibility tree
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (keyboard nav); audit §"Keyboard-shortcut map"
- **Verified by:** TEST-AY-008

### Group E — ARIA & screen-reader support

#### REQ-AY-009 — `.sr-only` utility for screen-reader-only labels

- **Pattern:** ubiquitous
- **Statement:** *The accessibility layer shall provide an `.sr-only` utility class that visually hides
  its element while keeping it in the accessibility tree (the standard clip/size technique), for
  labelling icon-only controls and providing screen-reader-only context.*
- **Acceptance:**
  - Given an element with the `.sr-only` class
  - When the surface is rendered
  - Then the element is not visually perceivable (zero visible footprint) yet remains exposed to the
    accessibility tree (not `display:none` / not `visibility:hidden`)
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §3.9 — `beat: claudian accessibility.css (minimal)`
- **Verified by:** TEST-AY-009

#### REQ-AY-010 — Streaming and notice output is announced via a live region

- **Pattern:** event-driven
- **Statement:** *When the assistant streams a turn or a non-blocking notice is shown, the chat surface
  shall announce the change through an ARIA live region (`aria-live` polite for streaming/notices,
  assertive only for errors) so a screen-reader user is informed without moving focus.*
- **Acceptance:**
  - Given a screen reader and an active surface
  - When the assistant begins/continues streaming or a notice appears
  - Then the new text is conveyed through an `aria-live` region (polite for streaming/info,
    assertive for errors), and focus is not stolen
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (WCAG 2.2 AA status messages, SC 4.1.3); audit §3.1
  (streaming) — `beat: claudian accessibility.css (minimal)`
- **Verified by:** TEST-AY-010

#### REQ-AY-011 — Collapsible and tool-call structure exposes ARIA state

- **Pattern:** event-driven
- **Statement:** *When a collapsible region (tool call, thinking block, subagent, write/edit) is
  rendered or toggled, its header control shall expose `aria-expanded` reflecting the open/closed
  state and an accessible name describing the region, filling any per-phase gap.*
- **Acceptance:**
  - Given a collapsible header
  - When it is rendered and when it is toggled by Enter/Space/click
  - Then `aria-expanded` is present and updates to match the visible state, and the control reports an
    accessible name
- **Priority:** should
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1; audit cross-cutting "Collapsible" (`aria-expanded` +
  dynamic `aria-label`)
- **Verified by:** TEST-AY-011

### Group F — Modal focus management (P5/P7/P8/P10 seams)

#### REQ-AY-012 — Modals trap focus while open

- **Pattern:** state-driven
- **Statement:** *While a Specorator-launched modal is open (ProviderConsent, DeleteConfirm,
  ForkTarget, InstructionConfirm, InlineEdit, ImagePreview, McpServer, McpTest), keyboard focus shall
  remain within that modal — Tab/Shift+Tab cycle through the modal's controls and do not escape to the
  surface behind it.*
- **Acceptance:**
  - Given a modal launched through a P5/P7/P8/P10 modal seam is open
  - When the user tabs forward past the last control or shift-tabs before the first
  - Then focus wraps within the modal and never lands on a control in the obscured surface behind it
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (focus management); WCAG 2.2 AA SC 2.4.3 / 2.1.2 —
  verify the P5/P7/P8/P10 modal seams
- **Verified by:** TEST-AY-012

#### REQ-AY-013 — Modals restore focus on close

- **Pattern:** event-driven
- **Statement:** *When a Specorator-launched modal closes (confirm, cancel, or Esc), focus shall return
  to the control that opened it (or a sensible fallback within the originating surface).*
- **Acceptance:**
  - Given a modal was opened from a known trigger control
  - When the modal closes by any path (accept / reject / Esc / overlay dismiss)
  - Then focus returns to the originating trigger (or its nearest still-present sibling), not to the
    document body
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (focus management); WCAG 2.2 AA SC 2.4.3 — verify the
  P5/P7/P8/P10 modal seams
- **Verified by:** TEST-AY-013

### Group G — Additivity guard

#### REQ-AY-014 — The a11y layer is additive — no surface regresses

- **Pattern:** unwanted behaviour
- **Statement:** *The accessibility layer shall not alter the default (no-media-query) appearance,
  layout, microcopy, locale output, or behaviour of any P0–P11 surface; its rules shall take effect
  only inside `:focus-visible`, `prefers-reduced-motion`, `forced-colors`, `.sr-only`, or additive
  ARIA — never the base render.*
- **Acceptance:**
  - Given the `next` baseline at branch cut with no a11y media query active and no `.sr-only` applied
  - When a surface is rendered after the P12 change
  - Then its default visual output and behaviour are unchanged from baseline (the a11y rules are inert
    until a focus-visible / reduced-motion / forced-colors / sr-only condition applies)
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT (additive phase); constitution Art. III; workflow-state
  "additivity"
- **Verified by:** TEST-AY-014

#### REQ-AY-015 — No raw HTML injection and no token-discipline leak in the a11y layer

- **Pattern:** unwanted behaviour
- **Statement:** *The P12 change shall introduce no `innerHTML` / `outerHTML` / `insertAdjacentHTML`
  assignment and no `v-html`, and `accessibility.css` shall carry no hex or raw Obsidian colour var
  outside the single documented `forced-colors` system-color exception.*
- **Acceptance:**
  - Given the P12 diff and `accessibility.css`
  - When scanned for raw-HTML sinks and for colour literals / raw Obsidian vars
  - Then no raw-HTML sink is added, and the only colour keywords in `accessibility.css` are CSS
    system-color keywords inside a `forced-colors` block (no hex, no `var(--text-*)` etc. outside the
    `--sp-*` token consumption)
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT epic constraints (no innerHTML/v-html; token discipline +
  documented forced-colors exception); CLAUDE.md DOM/security rules
- **Verified by:** TEST-AY-015

### Group H — Final parity sign-off (human-owned)

#### REQ-AY-016 — Final cross-surface parity screenshot set captured

- **Pattern:** ubiquitous
- **Statement:** *The phase shall produce a side-by-side parity screenshot set covering every P1–P11
  surface at the charter widths (320 / 520 / 720 px) in both light and dark theme, stored under
  `specs/accessibility/parity-screenshots.md`.*
- **Acceptance:**
  - Given the feature-complete `next` build with the a11y layer applied
  - When the screenshot set is assembled
  - Then every charter §3 surface appears at all three widths in both themes, side by side with its
    claudian reference, in `specs/accessibility/parity-screenshots.md`
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §4 P12 row (line 195), §5.1, §5.5
- **Verified by:** TEST-AY-016 (artifact-completeness check; the visual judgment is REQ-AY-017)

#### REQ-AY-017 — Human sign-off is the final epic acceptance gate

- **Pattern:** state-driven
- **Statement:** *While the P12 automatable gate is green, the program shall remain unaccepted until a
  **human** reviewer approves the final parity screenshot set and the accumulated P5–P11 manual-Obsidian
  legs; the agent shall surface this gate and shall not self-claim the sign-off.*
- **Acceptance:**
  - Given the verify gate is green and the screenshot set (REQ-AY-016) is complete
  - When acceptance is evaluated
  - Then the phase status records the human approval as the outstanding final gate, the agent presents
    (does not merge) the `next` → `develop` PR, and program-done is asserted only after the human's
    approval (owner: human — charter §5.5, workflow-state line 64-71)
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §5.5 (program-done = sign-off approved); constitution Art. VII
  (human owns acceptance) — owner: **human**
- **Verified by:** human review (not an automatable test); evidenced by the approved
  `parity-screenshots.md` + the maintainer's recorded acceptance

## Non-functional requirements

> Targets inherit from the epic constraints (`specs/accessibility/workflow-state.md`) and the parity
> charter; none introduces a new threshold beyond what those documents fix. The single deliberate new
> CSS allowance — system-color keywords inside a `forced-colors` block — is documented in NFR-AY-002.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-AY-001 | accessibility | WCAG conformance level across all P1–P11 surfaces | 2.2 AA |
| NFR-AY-002 | maintainability | a11y layer consumes `--sp-*` tokens + standard a11y media queries; colour literals only as system-color keywords inside a `forced-colors` block | 0 hex / 0 raw Obsidian var outside the documented forced-colors exception |
| NFR-AY-003 | security | No raw-HTML sink introduced | 0 added `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html` |
| NFR-AY-004 | maintainability | Additivity — no surface's default render/behaviour/locale output regresses; en/de + all ten locales and P0–P11 behaviour unchanged except a11y improvements | 0 default-state regression; locale output byte-identical |
| NFR-AY-005 | build | lightningcss-safe CSS (ASCII comment markers; minifier-accepted at-rules) in `accessibility.css` | `npm run build` + `npm run build:web` green; no CSS minify error |
| NFR-AY-006 | build | accessibility.css registered + present in both built outputs | rule group present in plugin `styles.css` and standalone bundle |
| NFR-AY-007 | quality | Test-coverage gate holds | 80 / 70 / 80 / 80 statements/branches/functions/lines |
| NFR-AY-008 | release | `manifest.json` untouched | identical `id` / `version` / `minAppVersion` to baseline |
| NFR-AY-009 | reliability | Reduced-motion / forced-colors handling never breaks a surface (no layout collapse, no invisible control) | every surface remains operable + perceivable under each media query |
| NFR-AY-010 | gate | Full verify gate + storybook/unit suite | `npm run verify` + `npm run test:all` zero failures on `next` |

## Success metrics

- **North star:** WCAG 2.2 AA met across every P1–P11 surface with `accessibility.css` shipped and
  registered, the automatable a11y tests (TEST-AY-001..016) green, and the full verify gate green on
  `next` — followed by the **human** final parity screenshot sign-off (REQ-AY-017) that closes the
  epic.
- **Supporting:** reduced-motion guard verified across all five keyframes + transitions;
  forced-colors mapping verified with a visible border on every background-cue-only control;
  focus-visible ring present on every interactive control; modal focus trap + restore verified at the
  P5/P7/P8/P10 seams; live regions announce streaming + notices.
- **Counter-metric:** number of P0–P11 surfaces whose **default** (no-a11y-media-query) appearance or
  behaviour regresses, or whose locale output changes, because of the a11y layer — target **0** (a
  non-zero value means the layer stopped being additive, the cardinal P12 failure). Secondary watch:
  controls that gain a focus ring under mouse-only `:focus` (stray rings from using `:focus` instead
  of `:focus-visible`) — target 0.

## Release criteria

What must be true to ship P12 (and thereby the epic).

- [ ] All `must` requirements (REQ-AY-001..010, 012..017) pass acceptance.
- [ ] REQ-AY-011 (collapsible ARIA `should`) addressed or explicitly deferred with a note.
- [ ] NFR-AY-001..010 met (or explicitly waived with an ADR/note).
- [ ] `accessibility.css` shipped, registered at both entry points, and present in both built outputs.
- [ ] The automatable a11y tests (TEST-AY-001..016) green; reduced-motion / forced-colors /
      focus-visible / sr-only / live-region / modal-focus behaviours verified.
- [ ] `npm run verify` + `npm run test:all` zero failures on `next`; `manifest.json` byte-identical to
      baseline; en/de + all ten locales unchanged.
- [ ] The final parity screenshot set (REQ-AY-016) captured under
      `specs/accessibility/parity-screenshots.md` at 320/520/720 px, light + dark, all surfaces.
- [ ] **Human** final parity screenshot sign-off + the accumulated P5–P11 manual-Obsidian legs
      approved (REQ-AY-017 — the single final epic gate; owner: human). The agent presents, does not
      self-claim, this gate.
- [ ] After the gate is green, the `next` → `develop` PR is **opened (not merged)** — the merge is the
      human's call (workflow-state line 69-71).

## Open questions / clarifications

- See CLAR-AY-001 and CLAR-AY-002 below — both resolved with a recommended resolution recorded for the
  design stage. None blocks acceptance of these requirements.

### CLAR-AY-001 — Reference accessibility.css not directly readable from the worktree

- **Question:** The exact `D:\Projects\claudian-main` `accessibility.css` file was not directly
  readable from this worktree's working directory during requirements authoring. What is the
  authoritative 1:1 reference for the "meet or beat" bar?
- **Recommended resolution (PM):** Use the frontend audit's authoritative characterisation as the
  reference until the design stage reads the file directly: `claudian-audit-frontend.md` line 358
  states claudian's `accessibility.css` is **minimal — focus-visible rings only** — and explicitly
  mandates that Specorator *beat* it by adding `prefers-reduced-motion` + `forced-colors` handling.
  REQ-AY-007 (focus-visible) is the *meet* leg (the part claudian ships); REQ-AY-003..006, 009, 010
  are the *beat* legs. The design stage must open the actual `accessibility.css` (charter §3.10 lists
  it in the visual system) to confirm no claudian rule is missed; if it carries more than focus-visible
  rings, the design stage adds the corresponding `--sp-*` mapping. This is a design-input note, not a
  scope change.

### CLAR-AY-002 — Reduced-motion: per-section token overrides vs a single global guard

- **Question:** `tokens.css` already zeroes several `--sp-duration-*` tokens per section under
  `prefers-reduced-motion` (§4.6/§4.9/§4.10/§4.11), and `animations.css` already halts `spin`
  (CQ-AUX-14). Should `accessibility.css` *replace* those, or *complement* them?
- **Recommended resolution (PM):** Complement, not replace. REQ-AY-003/004 require a single global
  reduced-motion guard that catches every animation/transition (including any a per-section override
  missed), while leaving the existing token overrides in place so no surface double-defines a conflict.
  The design stage decides the exact selector strategy (e.g. a broad `animation/transition: none` guard
  scoped to `.specorator-root` with explicit `spin` halting), keeping the existing token-driven
  collapse as the primary path and the global guard as the safety net. Recorded so the design stage
  does not silently drop the existing per-section overrides.

## Out of scope

- New visual design, layout, microcopy, or `--sp-*` tokens (forced-colors system-color mapping is the
  only deliberate colour exception).
- WCAG AAA, and formal third-party AT-conformance certification beyond the automatable checks + the
  human screenshot/manual sweep.
- New keyboard shortcuts or interaction patterns beyond the P1–P11 parity contract (audit
  "Keyboard-shortcut map").
- Backwards compatibility / migration (CHARTER-REQ-FRESH).
- The `next` → `develop` merge itself — opened (not merged) after a green gate; the merge is the
  human's call.

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable.
- [x] NFRs listed with targets.
- [x] Success metrics defined (including a counter-metric).
- [x] Release criteria stated.
- [x] `/spec:clarify` self-check complete — CLAR-AY-001 and CLAR-AY-002 resolved (recommended
      resolutions recorded for the design stage); no blocking open question.
