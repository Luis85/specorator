---
id: PRD-AUX-001
title: Agent Sidepanel UX Parity
stage: requirements
feature: agent-ux-parity
area: AUX
status: draft
owner: pm
inputs:
  - specs/agent-ux-parity/idea.md
created: 2026-05-22
updated: 2026-05-22
last_updated: 2026-05-22
---

# PRD — Agent Sidepanel UX Parity

## Summary

The Multi-Provider Agent Sidepanel (MPS, WS-1..WS-10) reached feature parity with the Claudian plugin, but the surface still looks and feels prototype-y. This PRD specifies the visual, interaction, and accessibility work required to bring the Specorator agent sidepanel to **experience parity** with Claudian while keeping our Vue / DDD architecture, narrow ports, and ESLint guardrails intact. The scope is UI polish, design tokens, iconography, message-role differentiation, composer toolbar consolidation, a11y, and Storybook coverage — not architecture, not new providers.

## Goals

- G1 — A first-time user opens the sidepanel and perceives a finished, branded surface, not a wireframe.
- G2 — Every interactive affordance is icon-driven (Lucide via `obsidian.setIcon`) with accessible labels.
- G3 — Provider, mode, permission, thinking, mcp, context-meter, and send all live on a single composer toolbar row.
- G4 — User and assistant messages are visually distinct using asymmetric corner radii and alignment.
- G5 — A `--sp-*` design-token CSS layer is the only contract between MPS components and Obsidian's theme.
- G6 — Storybook covers every MPS surface component so visual regressions are caught at PR time.
- G7 — RTL safety achieved by replacing physical CSS properties with logical properties throughout MPS scoped styles.

## Non-goals

- NG1 — Re-architecting the `ChatSidebar` ↔ `AgentSidepanelRoot` coupling (deferred to a separate ADR).
- NG2 — Adding new provider adapters (Cursor remains gated by CQ-MPS-01).
- NG3 — Translation work beyond updating the copy table affected by the parity refresh.
- NG4 — Changing domain models, use cases, ports, or repository contracts.
- NG5 — Replacing Obsidian-native theme variables; the token layer maps to them, it does not replace them.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Plugin end-user (Obsidian power-user) | A sidepanel that feels native and finished | Trust and adoption depend on perceived quality |
| Plugin contributor | Stable design-token contract + Storybook | Lowers onboarding cost and prevents visual drift |
| A11y user (keyboard / screen reader) | Icon-only controls with labels, focus-visible rings, announcements | Compliance with WCAG 2.2 AA and Obsidian a11y norms |
| Maintainer | Verify-gate stays green; no new ESLint exceptions | Predictable merges, no regressions in supply-chain hygiene |

## Jobs to be done

- When I open the agent sidepanel for the first time, I want to see a calm, branded welcome surface, so I can understand what to do next without reading the README.
- When I send messages back and forth, I want my own messages visually separated from the assistant's, so I can scan the transcript at a glance.
- When I need to copy, edit, or regenerate a message, I want those actions to appear only on hover or focus, so the transcript stays uncluttered.
- When I switch providers, I want the surface to re-skin to that provider's brand color, so I know which engine I am talking to.
- When I use Specorator with a screen reader or keyboard only, I want every icon-only control to be reachable and announced, so I can operate the sidepanel without a mouse.

## Functional requirements (EARS)

> Pattern legend — **U** ubiquitous · **EV** event-driven · **ST** state-driven · **OPT** optional-feature · **UNW** unwanted-behaviour.

### REQ-AUX-001 — Lucide icon system via `setIcon`

- **Pattern:** ubiquitous
- **Statement:** The agent sidepanel SHALL render every interactive affordance (send, copy, regenerate, edit, fork, delete, new-thread, history, context-menu, attach, status-toggle) as a Lucide icon resolved through `obsidian.setIcon`.
- **Acceptance:**
  - Given the agent sidepanel is open
  - When the user inspects any interactive button (excluding text-only menu items)
  - Then the button contains a Lucide icon mounted via `setIcon` and carries an `aria-label` matching its function.
- **Priority:** must
- **Satisfies:** idea.md §A.1, §B (Lucide), Delta-Icons

### REQ-AUX-002 — Hover/focus-reveal per-message actions

- **Pattern:** event-driven
- **Statement:** WHEN a transcript message receives hover or keyboard focus, the system SHALL reveal its per-message action row (copy, edit, regenerate, fork, delete) and SHALL hide that row otherwise.
- **Acceptance:**
  - Given a transcript with at least one message
  - When the pointer is not over and focus is not within a message
  - Then the per-message action row is not visible and does not occupy layout space affecting siblings.
  - When the pointer enters the message or any descendant receives focus
  - Then the action row becomes visible without shifting message content.
- **Priority:** must
- **Satisfies:** idea.md §A.2, §B (per-message actions)

### REQ-AUX-003 — Header consolidation

- **Pattern:** ubiquitous
- **Statement:** The agent sidepanel SHALL render its header as a single compact band containing only feature scope and primary controls (new-thread, history, settings).
- **Acceptance:**
  - Given the sidepanel is mounted at any breakpoint
  - When the user inspects the header
  - Then no more than one horizontal band sits above the message list.
  - And the provider/model row is not present in the header.
- **Priority:** must
- **Satisfies:** idea.md §A.3, Delta-Header

### REQ-AUX-004 — Composer toolbar parity

- **Pattern:** ubiquitous
- **Statement:** The composer SHALL render a single toolbar row directly below the textarea containing controls in this order: model · mode · permission · thinking · mcp · context-meter · send.
- **Acceptance:**
  - Given the composer is visible
  - When the user inspects the toolbar
  - Then all seven controls are present, aligned on one row, with send at the inline-end.
  - And selecting any control updates its state without leaving the composer.
- **Priority:** must
- **Satisfies:** idea.md §B (Toolbar), Delta-Composer

### REQ-AUX-005 — Message role differentiation

- **Pattern:** state-driven
- **Statement:** WHILE rendering a transcript, the system SHALL render user messages as a right-aligned bubble with `max-width: 95%` and an asymmetric corner radius (square on the inline-end-bottom), and SHALL render assistant messages as transparent full-width blocks without a bubble.
- **Acceptance:**
  - Given a transcript with at least one user message and one assistant message
  - When the user inspects the DOM
  - Then user messages carry a distinct role attribute / class and a right-aligned bubble.
  - And assistant messages have no bubble background and span the available inline size.
- **Priority:** must
- **Satisfies:** idea.md §B (User vs assistant), Delta-Bubbles

### REQ-AUX-006 — Brand-color theming via `[data-provider]`

- **Pattern:** event-driven
- **Statement:** WHEN the active provider changes, the system SHALL set a `data-provider` attribute on the sidepanel root and SHALL re-resolve the `--sp-brand` token to that provider's brand color.
- **Acceptance:**
  - Given two providers configured (e.g. `claude` and `codex`)
  - When the user switches provider via the composer model selector
  - Then `[data-provider]` on the sidepanel root reflects the new provider id.
  - And `getComputedStyle(...).getPropertyValue('--sp-brand')` returns the new provider's brand color without a full re-mount.
- **Priority:** must
- **Satisfies:** idea.md §B (per-provider brand)

### REQ-AUX-007 — Welcome / empty state

- **Pattern:** state-driven
- **Statement:** WHILE the current thread has zero messages, the system SHALL render a centered welcome greeting using the serif token stack and SHALL NOT render the dashed empty-state tile grid.
- **Acceptance:**
  - Given a freshly created thread
  - When the user views the message list region
  - Then a centered greeting renders using `var(--sp-font-serif)` at the serif size token.
  - And no `2×2` dashed tile grid is present in the DOM.
- **Priority:** must
- **Satisfies:** idea.md §A.7, §B (Welcome state)

### REQ-AUX-008 — Streaming indicator element

- **Pattern:** event-driven
- **Statement:** WHEN an assistant response is streaming, the system SHALL render a styled streaming indicator element (animated via a CSS keyframe) at the tail of the in-progress message and SHALL NOT render the literal `▍` character.
- **Acceptance:**
  - Given an assistant message is currently streaming
  - When the user inspects the DOM at the message tail
  - Then a non-text element with a documented class / data attribute is present and animated.
  - And the rendered transcript contains no literal `▍` glyph.
- **Priority:** must
- **Satisfies:** idea.md §A.6, §B (Animations)

### REQ-AUX-009 — Design-token CSS layer

- **Pattern:** ubiquitous
- **Statement:** The plugin SHALL ship a single `--sp-*` design-token layer (radii, spacing, typography, brand, surfaces, motion) and every MPS component SHALL consume only `--sp-*` tokens in its scoped styles.
- **Acceptance:**
  - Given the codebase at any commit on the parity branch
  - When a reviewer inspects scoped `<style>` blocks under `src/ui/agent/**` and `src/ui/components/agent/**`
  - Then no scoped style references `--text-*`, `--background-*`, `--interactive-*`, or other Obsidian variables directly.
  - And the token layer file maps `--sp-*` tokens to the underlying Obsidian variables.
- **Priority:** must
- **Satisfies:** idea.md §A.12, §B (Design tokens)

### REQ-AUX-010 — Logical-property layout

- **Pattern:** ubiquitous
- **Statement:** All MPS-component scoped styles SHALL use CSS logical properties (`inset-inline-*`, `margin-inline-*`, `padding-block-*`, `border-end-end-radius`, etc.) instead of their physical counterparts.
- **Acceptance:**
  - Given the MPS component tree
  - When a reviewer greps scoped styles for `left:`, `right:`, `margin-left:`, `margin-right:`, `border-top-left-radius`, `border-bottom-right-radius` (and similar)
  - Then no matches occur inside `src/ui/agent/**` or `src/ui/components/agent/**` scoped styles.
- **Priority:** must
- **Satisfies:** idea.md §B (Logical properties), Delta-RTL

### REQ-AUX-011 — Status panel visual grouping with composer

- **Pattern:** state-driven
- **Statement:** WHILE the status panel has content, the system SHALL render it visually grouped with the composer (shared surface, same inline padding, single bordered container) above the textarea.
- **Acceptance:**
  - Given the status panel has at least one todo or one bash tail line
  - When the user inspects the layout
  - Then the status panel and the composer share a single visible surface boundary.
  - And the status panel's `max-height` does not exceed `min(40vh, 320px)` and it scrolls internally.
- **Priority:** must
- **Satisfies:** idea.md §A.8, §B (Status panel)

### REQ-AUX-012 — Backdrop-blur dropdowns

- **Pattern:** event-driven
- **Statement:** WHEN any composer or header dropdown opens (slash menu, thread history, model selector), the system SHALL render it with a backdrop-blur surface using the `--sp-surface-overlay` and `--sp-blur` tokens.
- **Acceptance:**
  - Given a dropdown trigger is activated
  - When the dropdown is mounted
  - Then its container's computed style applies `backdrop-filter: blur(...)` via the token.
  - And the dropdown closes on `Escape` and outside-click.
- **Priority:** must
- **Satisfies:** idea.md §B (Backdrop blur)

### REQ-AUX-013 — Unified thinking / tool / subagent idiom

- **Pattern:** ubiquitous
- **Statement:** The system SHALL render thinking blocks, tool-call blocks, and subagent nested blocks with a shared visual idiom: a 2px inline-start border (`border-inline-start: 2px solid var(--sp-accent-muted)`) and a uniform indent.
- **Acceptance:**
  - Given a transcript with at least one thinking block, one tool block, and one subagent block
  - When the user inspects each
  - Then all three carry the same 2px inline-start border and the same indent token.
- **Priority:** must
- **Satisfies:** idea.md §B (2px left-border indent)

### REQ-AUX-014 — Avatars, model name, optional timestamps

- **Pattern:** ubiquitous
- **Statement:** Each transcript message SHALL render a role avatar (icon) and, for assistant messages, the model name; the system SHALL render the message timestamp when the user setting `showMessageTimestamps` is enabled.
- **Acceptance:**
  - Given a transcript with mixed user/assistant messages
  - When the user inspects each
  - Then the user message carries a user-role avatar and no model name.
  - And the assistant message carries an assistant-role avatar and the resolved model display name.
  - And timestamps render iff `showMessageTimestamps === true`.
- **Priority:** must
- **Satisfies:** idea.md §A.5

### REQ-AUX-015 — Compact-boundary divider upgrade

- **Pattern:** state-driven
- **Statement:** WHILE rendering a context-compaction boundary, the system SHALL render a divider that is visually distinct from body copy (token-driven rule line + label chip) and SHALL NOT rely solely on italic faint text.
- **Acceptance:**
  - Given the transcript contains at least one compaction boundary
  - When the user inspects the boundary
  - Then a rule line and a label chip render using `--sp-*` tokens.
  - And the boundary is identifiable at a glance from a thumbnail-sized screenshot.
- **Priority:** must
- **Satisfies:** idea.md §A.11

### REQ-AUX-016 — Provider badge copy table

- **Pattern:** ubiquitous
- **Statement:** The system SHALL resolve provider badge text through a copy table (e.g. `claude/cli → "Claude · CLI"`) and SHALL NOT render raw machine identifiers in the badge.
- **Acceptance:**
  - Given a provider with id `claude/cli` (or any machine id present in the copy table)
  - When the badge renders
  - Then the displayed text matches the copy-table entry, not the raw id.
  - And providers absent from the copy table fall back to a documented humanised form (title-case, separator-normalised).
- **Priority:** must
- **Satisfies:** idea.md §A.4

### REQ-AUX-017 — Storybook coverage for MPS surface components

- **Pattern:** ubiquitous
- **Statement:** Every MPS surface component (header, message list, message bubble, composer, toolbar, status panel, dropdowns, approval widget, welcome state, streaming indicator, tab badge, help popover) SHALL have at least one Storybook story covering its default state, and additional stories for each documented variant.
- **Acceptance:**
  - Given the Storybook build at HEAD
  - When a reviewer enumerates the MPS surface components
  - Then each component has a story file under `src/**/__stories__/` (or co-located `*.stories.ts`) registered in the Storybook index.
  - And `npm run test:storybook` passes against those stories.
- **Priority:** must
- **Satisfies:** idea.md §A.13

### REQ-AUX-018 — Accessibility

- **Pattern:** ubiquitous
- **Statement:** Every icon-only control in the agent sidepanel SHALL carry a meaningful `aria-label`; every focusable element SHALL render a visible focus-visible ring driven by `--sp-focus-ring`; streaming start / streaming end / errors / approval requests SHALL be announced via an `aria-live="polite"` region; and tab order SHALL follow visual order through header, transcript, status panel, composer.
- **Acceptance:**
  - Given the sidepanel is operated by keyboard only
  - When the user tabs from the top
  - Then focus moves through header controls, then transcript actionable elements, then status panel, then composer in that order.
  - And every focus stop renders a visible ring using `--sp-focus-ring`.
  - And streaming start, streaming end, errors, and approval prompts emit text into an `aria-live="polite"` region.
  - And every icon-only button has a non-empty `aria-label`.
- **Priority:** must
- **Satisfies:** idea.md §A (gaps), §B (Lucide + setIcon), WCAG 2.2 AA

### REQ-AUX-019 — Tab badge states

- **Pattern:** state-driven
- **Statement:** WHILE a thread tab is in one of the states {active, streaming, attention, idle}, the system SHALL render the tab badge with the corresponding visual treatment (active = accent fill, streaming = brand fill + pulse, attention = error outline, idle = muted border).
- **Acceptance:**
  - Given a thread switcher with at least four tabs each in a distinct state
  - When the user inspects each badge
  - Then the four visual treatments are distinguishable and consistent with the token layer.
  - And the streaming state animates via the documented keyframe.
- **Priority:** must
- **Satisfies:** idea.md §B (Tab badges)

### REQ-AUX-020 — Help popover upgrade

- **Pattern:** event-driven
- **Statement:** WHEN the user opens the `/help` popover, the system SHALL render a search input and SHALL support keyboard navigation (`ArrowUp` / `ArrowDown` move selection, `Enter` activates, `Escape` closes).
- **Acceptance:**
  - Given the help popover is open
  - When the user types into the search input
  - Then the visible items filter by substring match against item label and description.
  - When the user presses `ArrowDown`
  - Then selection moves to the next visible item and is announced.
  - When the user presses `Enter`
  - Then the selected item activates and the popover closes.
- **Priority:** must
- **Satisfies:** idea.md §A.9

### REQ-AUX-021 — Approval / ask-user widget visual parity

- **Pattern:** event-driven
- **Statement:** WHEN the agent emits an approval or ask-user prompt, the system SHALL render an inline tabbed widget in the transcript using the monospace token, with a leading `▌` cursor on each item, single-select via radio-style check, and multi-select via `[ ]` / `[✓]` toggles.
- **Acceptance:**
  - Given the agent emits a single-select approval prompt
  - When the widget renders
  - Then it shows tabs at the top, items prefixed with `▌`, exactly one selection allowed.
  - Given the agent emits a multi-select prompt
  - When the widget renders
  - Then items show `[ ]` / `[✓]` and multiple selections persist until submit.
- **Priority:** must
- **Satisfies:** idea.md §B (Approval widget)

## Non-functional requirements

> Baseline-relative targets: the bundle-size baseline is captured on the integration branch at the commit immediately preceding the first parity workstream merge. A baseline-capture task lives in `tasks.md`.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-AUX-001 | performance | Plugin bundle size growth (gzipped `main.js` + `styles.css`) vs baseline | ≤ baseline + 5% |
| NFR-AUX-002 | security | No `v-html` directives in any Vue template touched by this feature | 0 occurrences |
| NFR-AUX-003 | security | No `innerHTML` / `outerHTML` / `insertAdjacentHTML` assignments introduced | 0 occurrences |
| NFR-AUX-004 | usability | No `window.confirm` / `window.alert` / `window.prompt` introduced | 0 occurrences |
| NFR-AUX-005 | architecture | No new direct `obsidian` imports under `src/ui/**` (ESLint `no-restricted-imports` stays green) | 0 violations |
| NFR-AUX-006 | architecture | MPS scoped styles consume only `--sp-*` tokens, not Obsidian vars directly | 0 direct-var references in scoped MPS styles |
| NFR-AUX-007 | reliability | `npm run verify` exit code 0 at every workstream tip and at branch HEAD | green |
| NFR-AUX-008 | accessibility | WCAG conformance for agent sidepanel surface | 2.2 AA |
| NFR-AUX-009 | maintainability | Storybook coverage of MPS surface components | 100% |
| NFR-AUX-010 | i18n | MPS scoped styles use logical properties only | 0 physical-property violations |
| NFR-AUX-011 | privacy | No new telemetry, no new outbound network calls, no new persisted user data introduced by this feature | 0 additions |
| NFR-AUX-012 | testing | Unit + Storybook coverage thresholds (80/70/80/80) hold after merge | thresholds met |

## Success metrics

- **North star:** Side-by-side screenshots of the Specorator sidepanel and Claudian show feature-equivalent visual layouts at three breakpoints (narrow ≈ 320px, mid ≈ 480px, wide ≈ 720px), confirmed by reviewer sign-off.
- **Supporting:**
  - 100% of MPS surface components have at least one Storybook story registered.
  - User-test "feels finished" rating ≥ 4 / 5 on a 5-point Likert scale across at least three reviewers.
  - 0 ESLint violations and 0 verify-gate failures across all workstream tips.
- **Counter-metric:** Bundle-size growth must not exceed 5% over the captured baseline; if it does, the parity work is reviewed for excess weight before merging to `develop`.

## Release criteria

What must be true to ship.

- [ ] All `must` functional requirements (REQ-AUX-001 .. REQ-AUX-021) pass acceptance.
- [ ] All NFR-AUX-* targets hold (or are explicitly waived with an ADR).
- [ ] `npm run verify` is green at branch HEAD.
- [ ] Storybook build green; `npm run test:storybook` passes.
- [ ] Side-by-side parity screenshots captured at three breakpoints and attached to the review.
- [ ] `review.md` verdict is **ACCEPT**.
- [ ] `workflow-state.md` advanced to the appropriate post-review stage.
- [ ] No critical or high-severity bugs open against this feature.

## Open questions / clarifications

> None expected at requirements acceptance. Use this section if `/spec:clarify` surfaces ambiguity that PM cannot resolve without input from architect, UX, or maintainer.

- *(none open)*

## Out of scope

This PRD inherits the out-of-scope list from `specs/agent-ux-parity/idea.md` §Out of scope. In summary:

- Architectural rewrite of `ChatSidebar` ↔ `AgentSidepanelRoot` coupling — separate ADR follow-up.
- New provider adapters (Cursor remains gated by CQ-MPS-01).
- Translation work beyond updating the provider copy table touched by REQ-AUX-016.
- Changes to domain models, application use cases, narrow ports, or repository contracts.

See `idea.md` for full rationale.

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
- [ ] `/spec:clarify` returned no open questions. *(to be confirmed)*
