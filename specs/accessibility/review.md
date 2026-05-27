---
id: REVIEW-AY-001
title: Accessibility (P12, FINAL phase) — Stage-9 review
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
verdict: approve-with-nits
inputs:
  - PRD-AY-001, DESIGN-AY-001, SPEC-AY-001, TASKS-AY-001, IMPL-LOG-AY-001, TEST-PLAN-AY-001
  - git diff next..HEAD (base next @ d4733464, not advanced — the diff is the whole P12 feature)
  - D:\Projects\claudian-main\src\style\accessibility.css (the 41-line focus-ring reference)
  - memory/constitution.md; CLAUDE.md DOM/security + architecture rules
---

# Stage-9 review — Accessibility (P12, the FINAL phase)

## Verdict: APPROVE WITH NITS

P12 is a genuinely additive, presentation-only CSS-layer + ARIA-sweep phase that meets-and-beats the
claudian reference and the WCAG 2.2 AA bar at the automatable level. The cardinal P12 constraint —
additivity — holds: the `src/` diff is exactly the four files the design authorised, `manifest.json`
and all ten locales are byte-identical, and every a11y rule is gated behind a media query,
`:focus-visible`, `.sr-only`, or an additive ARIA attribute. No P1/P2 findings. The single remaining
gate is the **human** final parity sign-off (REQ-AY-017 / TEST-AY-017), recorded as pending — which is
correct and intended, not a defect.

The verdict is `approve-with-nits` (not bare `approve`) because of two low-severity documentation/scope
nits (R-AY-001, R-AY-002) that do not block merge to `next` and do not affect the shipped behaviour.

## What I verified (read-only, this turn)

- Read all P12 spec artifacts + the full `git diff --stat next..HEAD` + `git log next..HEAD`.
- Read `src/ui/styles/accessibility.css`, `src/plugin/main.ts`, `src/ui/main.ts`,
  `src/ui/components/NoticeLiveRegion.vue`, and `tests/ui/a11y/modalFocusTrap.test.ts` +
  `additivity.test.ts` in full.
- Ran `npx vitest run tests/ui/styles/accessibility.test.ts tests/ui/styles/accessibility-registration.test.ts`
  → **15 passed**.
- Ran `npx vitest run tests/ui/a11y/` → **40 passed (8 files)**.
- Confirmed `git diff next..HEAD -- src/` = exactly 4 files; `git diff next -- manifest.json src/ui/i18n/locales` = empty.
- Grepped `ChatSurface.vue` / `TabBar.vue` for the verify-only ARIA seams; grepped the P12 diff for raw-HTML sinks and `obsidian` imports.

## 1. Requirements compliance

All 16 automatable REQ-AY satisfied with evidence (see `traceability.md` for the full matrix). Highlights:

- **REQ-AY-001/002 (layer + registration):** `accessibility.css` exists with all six rule groups in
  order; imported as the 3rd CSS import after `tokens.css`/`animations.css` at both `src/plugin/main.ts:3`
  and `src/ui/main.ts:15`. Verified by the two file-read suites (15 green) and by direct read.
- **REQ-AY-003/004 (reduced motion):** RG-1 universal `!important` safety-net (`accessibility.css:28-37`)
  + RG-2 explicit `animation: none` spin halt (`42-47`) — `none`, not a near-zero duration, correctly
  honouring CQ-AUX-14.
- **REQ-AY-005/006 (forced colors):** RG-3 maps text/surface/focus/button to system colours (`53-71`);
  RG-4 (`82-91`) gives a `currentColor` border to the real swept-component selectors (`[role="switch"]`,
  `[data-state]`, `.sp-file-chips__chip`, `.sp-image-thumb`, `.sp-tab`, `[role="option"][aria-selected="true"]`).
- **REQ-AY-007 (focus-visible):** RG-5 (`98-110`) uses `:focus-visible` (never bare `:focus`), consumes
  the existing `--sp-focus-ring` (tokens.css:42) + `--sp-shadow-focus-ring` (tokens.css:140) — no new token.
- **REQ-AY-009 (`.sr-only`):** RG-6 (`116-127`) is the standard clip technique, not `display:none`.
- **REQ-AY-010 (live region):** `ChatSurface.vue:856-857` carries `aria-live="polite"` + `role="status"`
  (verify-only, confirmed); the genuine fill `NoticeLiveRegion.vue` announces severity-mapped
  (error→assertive/alert, else polite/status) declaratively over the existing `sp:notice` window event.
- **REQ-AY-011/012/013 (collapsible + modals):** `SpCollapsible` already binds `aria-expanded`
  (verify-only); the modal test asserts all 8 seams inherit `Modal.prototype` via a real prototype-chain
  walk — a discriminating structural assertion, not a tautology.
- **REQ-AY-014/015 (additivity + discipline):** confirmed below.

REQ-AY-017 (human sign-off) is correctly recorded as the outstanding final gate (owner: human).

## 2. Design compliance

Implementation honours DESIGN-AY-001 with no material drift. The 6 rule groups RG-1..RG-6 match the B.1
inventory; D-AY-1 (complement, not replace, the token overrides), D-AY-2 (reuse existing tokens), D-AY-3
(native `Modal` trap — verify, don't re-implement), D-AY-4 (`.specorator-root`-prefixed, `!important`
only on RG-1), and D-AY-5 (forced-colors system colours as the single colour exception) are all observed
in the shipped file. One designed convergence (not drift): the RG-4 selector list moved from the
placeholder `.sp-toggle-switch`/`.sp-chip` to the real swept-component selectors — see R-AY-002.

## 3. Spec compliance & deviations

Two deviations are logged in the implementation log, both correctly classified as non-divergences:

- **RG-4 selector correction** (T-AY-006, commit 46869990): the T-AY-005 placeholders matched no real
  control; the mount-leg test surfaced this (its stated purpose) and the selectors were corrected to the
  real components. SPEC-AY-006 explicitly says the concrete selectors "come from the Chunk-2 component
  sweep", so this is designed convergence. Logged. ADR-tracking not required (no architectural decision).
- **T-AY-010 / T-AY-012 verify-only** (no code change): the audit found the per-phase a11y sweep already
  labelled icon-only controls and bound `aria-expanded` on `SpCollapsible`. Logged as verify-only per
  DESIGN-AY-001 B.2. Correct.

No deviation rises to ADR weight; DESIGN-AY-001 §C.6's "no new ADR" verdict holds.

## 4. Constitution check

No violations.
- **Art. I/II (spec-driven, separation):** every code artifact traces to a SPEC-AY; the RG-4 dead-selector
  issue was escalated through the test rather than silently patched.
- **Art. III (incremental):** RED-before-green ordering observed (T-AY-003/004 RED before T-AY-002).
- **Art. V (traceability):** full chain regenerated in `traceability.md`; no orphans.
- **Art. VII (human oversight):** REQ-AY-017 is presented, not self-claimed — exactly as the article requires.
- **Art. IX (reversibility):** a CSS layer + additive ARIA is fully reversible; no irreversible action taken.

## 5. Architecture & risk

- **No new port / InjectionKey / composable / component-pattern / ADR** — confirmed. `NoticeLiveRegion.vue`
  is a pure Vue `<script setup>` component on the existing `sp:notice` window CustomEvent channel; it
  contains **no `obsidian` import** (grep-confirmed), honouring the `no-restricted-imports` UI rule.
- **No `v-html` / `innerHTML` / `outerHTML` / `insertAdjacentHTML`** added — the only diff match is inside
  a NoticeLiveRegion comment that *names* the banned sinks; the template binds text via `{{ }}`.
- **Token discipline** holds: the only colour keywords are CSS system colours inside the `forced-colors`
  block (the documented NFR-AY-002 exception).
- **Risk — JSDOM cannot exercise `:focus-visible` / live Tab-cycle / forced-colors rendering.** Correctly
  acknowledged: those become the human visual leg (REQ-AY-017). The automatable suite asserts the
  structural property (selector matching, prototype chain, attribute presence) instead. Acceptable and
  honestly scoped.

## 6. WCAG 2.2 AA assessment

The layer + per-surface behaviours meet the AA bar at the automatable level:
- **SC 2.4.7 Focus Visible** — RG-5 `:focus-visible` ring across all interactive controls (meets + extends
  claudian's 3 focus-visible groups).
- **SC 2.1.2 / 2.4.3 No Keyboard Trap / Focus Order** — native Obsidian `Modal` trap + restore, verified
  structurally across all 8 seams.
- **SC 1.4.3 / 1.4.11 contrast under forced-colors** — RG-3/RG-4 system-colour mapping + guaranteed borders.
- **SC 2.3.3 Animation from Interactions / reduced-motion** — RG-1 global guard + RG-2 spin halt.
- **SC 4.1.3 Status Messages** — `ChatSurface` busy region (polite/status) + `NoticeLiveRegion`
  (severity-mapped) announce without stealing focus.
- **SC 1.1.1 / 4.1.2 Name, Role, Value** — `.sr-only` + icon-only labels + `aria-expanded` on collapsibles.

This is "meet + beat claudian" (claudian ships focus-visible rings only; P12 adds reduced-motion,
forced-colors, `.sr-only`, and live regions). The visual conformance judgment remains the human leg.

## Brand review

Not applicable. The diff touches no `sites/`, no `specorator-design` skill, no user-visible HTML/CSS
producing a *new* brand surface, and no `templates/` HTML emitter. `accessibility.css` is a system-driven
a11y layer (focus ring + system-colour fallback + clip utility) consuming existing `--sp-*` tokens — it
introduces no token literal, no emoji, no icon-library import, no gradient/texture, no page background.
`NoticeLiveRegion.vue` is `.sr-only` (zero visible footprint). `Brand review: not-applicable`.

## Findings

| ID | Severity | Category | Location | Finding | Recommendation | Owner |
|---|---|---|---|---|---|---|
| R-AY-001 | low | docs/process | `specs/accessibility/{implementation-log.md,test-plan.md,workflow-state.md}` | Stage frontmatter is stale relative to actual progress: implementation-log + test-plan say `in-progress` and workflow-state says `current_stage: tasks` / `review.md: pending`, but Chunks 1–3 are complete and review is now produced. The remaining open items (T-AY-017 human gate, T-AY-018 parent gate) are correctly open, but the stage pointers lag. | Release-manager/orchestrator to advance `workflow-state.md` (`current_stage: review`, mark review.md + traceability.md complete) and flip impl-log/test-plan status to `complete` once T-AY-018 runs. Non-blocking. | release-manager |
| R-AY-002 | low | spec-hygiene | `accessibility.css:82-91` vs `test-plan.md §4` | The RG-4 selector enumeration in `test-plan.md §4` still lists the original placeholder selectors (`.sp-toggle-switch`, `.sp-chip`) that were corrected in the shipped CSS to `[role="switch"]` / `.sp-file-chips__chip` / `.sp-image-thumb` (logged in impl-log T-AY-006). The shipped code and tests are correct and consistent; only the test-plan reference table is stale. | Planner/dev to refresh `test-plan.md §4` to the real selectors so the baseline doc matches the shipped RG-4. Cosmetic; does not affect behaviour or any test. | planner |

No critical/high/medium findings. A clean P12 by design (additive, mostly verify-only), so a short
findings list is expected here — the two nits are genuine doc-sync gaps I confirmed against the diff,
not filler.

## Quality-metrics evidence

`specorator quality:metrics` was not invoked (Stage-9 read-only scope; parent owns the full suite/build
run at T-AY-018). Deterministic evidence used instead: the two targeted CSS suites (15 green) + the full
`tests/ui/a11y/` suite (40 green) ran clean this turn; the `git diff` scope + manifest/locale byte-identity
were confirmed directly. The coverage gate (NFR-AY-007) and full verify chain (NFR-AY-010) are confirmed
by the parent at T-AY-018 — recorded as pending in `traceability.md`, not asserted here.

## Conditions on the verdict

`approve-with-nits` is conditional only on the parent's closing gate (T-AY-018: full `npm run verify` +
`npm run test:all` + `build:web` lightningcss leg + both-output presence + coverage 80/70/80/80) coming
back green — which is the parent's scope, not this reviewer's. The two nits (R-AY-001, R-AY-002) are
non-blocking and may be folded into the release/retro step. The epic remains **unaccepted** until the
**human** approves the final parity screenshot set + the accumulated P5–P11 manual-Obsidian legs
(REQ-AY-017 / TEST-AY-017) — the agent presents and opens (does not merge) the `next` → `develop` PR.

## Hand-off

- → **release-manager / orchestrator:** run the T-AY-018 closing gate; fix R-AY-001 (stage pointers) as
  part of the release step; then **present** (do not merge) the `next` → `develop` PR and surface the
  REQ-AY-017 human sign-off as the single final epic gate.
- → **planner:** R-AY-002 (refresh `test-plan.md §4` RG-4 selector list to the shipped selectors).
- → **human:** the final parity screenshot sign-off (all P1–P11 surfaces, light + dark, 320/520/720 px)
  + the accumulated manual-Obsidian legs — the program-done gate.
