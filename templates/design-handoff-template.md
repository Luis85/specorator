---
id: HANDOFF-<SLUG>
design: <design-slug>
status: draft            # draft | approved | parked
date: YYYY-MM-DD
owner: design-lead
consulted:
  - ui-designer
inputs:
  - designs/<slug>/design-brief.md
  - designs/<slug>/sketch.md
  - designs/<slug>/design-state.md   # token decisions from Mock phase
downstream: <feature-slug or "engineering direct">
---

# Design handoff — <Surface name>

> Gate artifact for the Design Track. Nothing ships before this is approved by the human.

## 1. Surface summary

<!-- One paragraph. What this surface is, who it's for, what it does. -->

## 2. Screen inventory

<!-- One section per screen from sketch.md. -->

### Screen 1 — <name>

**Purpose:** <!-- one sentence -->

**Component assignments:**

| Element | Component | Token references |
|---|---|---|
| Page background | — | `var(--paper)` |
| Heading | — | `var(--ink)`, `var(--fs-display)`, `var(--fw-x)` |
| | | |

**Interaction notes:**

| State | Trigger | Visual change | Copy change |
|---|---|---|---|
| Hover | | | |
| Focus | focus-visible | `outline: 3px solid var(--accent); outline-offset: 4px` | — |
| Error | | | |
| Loading | | | |
| Empty | | | |

---

<!-- Repeat for each screen. -->

## 3. Microcopy

<!-- Final copy for every text element. No "TBD". No "placeholder". -->

| Screen | Element | Copy |
|---|---|---|
| | Heading | |
| | CTA label | |
| | Error message | |
| | Empty state | |
| | Loading label | |

## 4. Asset list

<!-- SVGs, images, or other binary assets. Paths relative to repo root. "Placeholder" if asset does not yet exist. -->

| Asset | Path | Notes |
|---|---|---|
| Brand mark | `assets/specorator-mark.svg` | Use existing; do not modify. |
| | | |

## 5. Token summary

<!-- Every CSS custom property used in this surface. Flag any proposed new tokens. -->

| Token | Value (for reference) | Used for |
|---|---|---|
| `--paper` | #fbfcf8 | Page background |
| `--ink` | #17201b | Body text, headings |
| | | |

**Proposed new tokens (not yet in `colors_and_type.css`):**

| Token name | Proposed value | Justification |
|---|---|---|
| | | |

## 6. Accessibility checklist

- [ ] All color combinations meet WCAG 2.1 AA contrast (4.5:1 text, 3:1 large text and UI).
- [ ] No information conveyed by color alone.
- [ ] All interactive elements are keyboard-reachable and have a visible focus state.
- [ ] Focus order follows reading order.
- [ ] All non-text elements have an ARIA label or `alt` text.
- [ ] Screen-reader copy reviewed (see sketch.md §4).
- [ ] `prefers-reduced-motion` respected for any animation.

## 7. Brand checklist

- [ ] Page background is `var(--paper)`. No `#fff`, `white`, or `#ffffff` at page level.
- [ ] `--highlighter` used only for: brand mark, primary CTA, step-number circles, code chips on dark backgrounds.
- [ ] Zero emoji in copy or markup.
- [ ] Zero icon library imports.
- [ ] All headlines are sentence-case and end with a period.
- [ ] Em-dashes (`—`) used for asides; no en-dashes (`–`).
- [ ] Lane coding correct: Define = `--lane-define`, Build = `--lane-build`, Ship = `--lane-ship`.
- [ ] All token references are named custom properties; no hex literals outside `:root`.

## 8. Open questions

<!-- Questions the engineer or downstream agent must resolve. Not design gaps — those would block this handoff. -->

| # | Question | Owner |
|---|---|---|
| 1 | | |

## 9. Approvals

| Role | Name / agent | Date | Decision |
|---|---|---|---|
| Human | | | Approved / Changes requested |

## 10. Downstream

**Next step:** <!-- /spec:design <feature-slug> | direct engineering handoff | other -->  
**Inputs the engineer reads:** `design-brief.md`, `sketch.md`, this file, `mock.html` (if produced).  
**New token PRs needed:** <!-- list proposed new tokens from §5, or "none" -->
