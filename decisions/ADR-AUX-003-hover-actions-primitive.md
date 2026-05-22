---
id: ADR-AUX-003
title: Adopt a canonical HoverActions primitive for hover/focus-reveal affordances
status: proposed
date: 2026-05-22
deciders:
  - architect
consulted:
  - ui-designer
  - ux-designer
informed:
  - planner
  - dev
supersedes: []
superseded-by: []
tags: [ui, accessibility, design-system]
---

# ADR-AUX-003 — Adopt a canonical `<HoverActions>` primitive for hover/focus-reveal affordances

## Status

Proposed.

## Context

The UX-parity work (`requirements.md` REQ-AUX-002 + Part A §A.4) calls for several surfaces to hide their action affordances until the user hovers or focuses the parent row:

- Per-message actions (Copy, Edit, Regenerate, Fork, Delete) on each transcript message.
- Context-menu trigger on each thread-history row.
- Copy button on each code block.
- Remove button on each attachment chip when chips are in a long row.

Each of these could be implemented ad-hoc with a `:hover` / `:focus-within` CSS rule in the consuming component, but doing so loses several invariants we care about:

1. **Accessibility-tree invariant.** Hidden actions must remain in the accessibility tree at all times — only `opacity` may change, never `display` or `visibility`. A per-component rule cannot enforce this; a primitive can ship a test against the contract.
2. **Reduced-motion invariant.** Hover/focus reveal snaps to instant under `prefers-reduced-motion`. Repeating the media query in every consumer is a regression-prone pattern.
3. **Coarse-pointer invariant.** Touch / pen devices have no hover concept; the actions should be always visible. The `(pointer: coarse)` media query branch is the same everywhere.
4. **Placement parity.** Claudian uses three placements (block-end-inline-end for messages, inline-end-centred for history, block-start-inline-end for code blocks). A primitive with a prop is simpler than copy-pasting absolute positioning.
5. **A11y label & role.** The wrapping element should be a `role="toolbar"` whenever it groups ≥2 actions; ad-hoc implementations often omit this.

## Decision

We introduce a primitive component `src/ui/components/primitives/HoverActions.vue` and use it as the single implementation point for the hover/focus-reveal pattern across the agent surface.

**Surface:**

```ts
defineProps<{
  placement?:
    | 'block-end-inline-end'
    | 'block-end-inline-start'
    | 'block-start-inline-end';
  alwaysVisible?: boolean;
}>();
```

**Contract:**

1. The root element is a `<div class="sp-hover-actions" role="toolbar">`.
2. Reveal is driven by CSS selectors on a *parent* class (`.sp-hover-host`) — consumers add the parent class to the row that should drive the reveal. This keeps the primitive flat and avoids JS listeners.
3. The scoped style declares: `opacity: 0; transition: opacity var(--sp-duration-fast) var(--sp-ease)` by default. `.sp-hover-host:hover .sp-hover-actions`, `.sp-hover-host:focus-within .sp-hover-actions`, and `.sp-hover-actions:focus-within` set `opacity: 1`.
4. `@media (prefers-reduced-motion: reduce)` overrides `transition` to none.
5. `@media (pointer: coarse)` overrides `opacity` to `1` unconditionally.
6. `alwaysVisible` prop forces opacity 1 regardless of hover state (used by surfaces where the row is short and persistent visibility is acceptable).
7. Children are placed via slot; the primitive does no slot-content shaping beyond layout.

**Consumers:**

- `MessageActions.vue` wraps its action buttons in `<HoverActions placement="block-end-inline-end">`; its parent `MessageItem.vue` adds `.sp-hover-host`.
- `ThreadHistoryMenu.vue` per-row context-menu uses `<HoverActions placement="block-end-inline-start">`.
- `CodeBlock.vue` copy button uses `<HoverActions placement="block-start-inline-end">`.
- `AttachmentStrip.vue` chip remove button uses `<HoverActions placement="block-end-inline-end" alwaysVisible>` only when the chip count exceeds 3.

## Considered options

### Option A — `HoverActions` primitive component (chosen)

- Pros: single source of truth; one accessibility test covers all consumers; reduced-motion / coarse-pointer handling lives in one place; placement is declarative.
- Cons: yet another primitive; consumers must remember to add `.sp-hover-host` to the parent.

### Option B — CSS-only mixin / utility class

- Pros: no JS / component.
- Cons: cannot test the accessibility-tree invariant (opacity-only); cannot enforce `role="toolbar"`; the `.sp-hover-host` requirement still has to be documented.

### Option C — JS-driven `pointerenter` / `focusin` listeners on each parent

- Pros: full programmatic control.
- Cons: more code; touch devices need manual branch; loses CSS-driven simplicity.

### Option D — Render actions inside a `<details>` element with `hover` styling

- Pros: native semantics.
- Cons: `<details>` collapses on `Escape` and accepts `Enter` — those bindings conflict with the rest of the agent surface (Esc closes dropdowns; Enter sends turn).

## Consequences

### Positive

- One test (`tests/ui/components/primitives/HoverActions.test.ts`) asserts the accessibility-tree contract (children always present, only opacity flips) and the reduced-motion + coarse-pointer overrides; every consumer inherits the assurance.
- New surfaces that need hover-reveal pick up the primitive instead of writing fresh `:hover` rules.
- Removes a class of accessibility bugs (hidden-but-focused buttons disappearing from SR; lost focus rings).

### Negative

- Consumers must add `.sp-hover-host` to the row driving the reveal. Documented in the primitive's JSDoc; flagged in PR review if missed.
- One more primitive in the design system to track.

### Neutral

- Naming `sp-hover-host` / `sp-hover-actions` ties the contract to Specorator; renaming requires a search-and-replace.

## Compliance

- `tests/ui/components/primitives/HoverActions.test.ts` asserts: children are in the DOM regardless of hover state; reduced-motion media-query branch removes the transition; `alwaysVisible` keeps opacity 1.
- Storybook story renders all three placements + a reduced-motion variant.
- Code review enforces consumer adoption (no fresh `:hover` rules introduced under `src/ui/components/agent/**` outside the primitive).

## References

- `specs/agent-ux-parity/idea.md` §A.2 (persistent per-message actions), §B (per-message actions hover-reveal)
- `specs/agent-ux-parity/requirements.md` REQ-AUX-002
- `specs/agent-ux-parity/design.md` §C.2.4
- `specs/agent-ux-parity/design-part-a-ux.md` §A.4 (hover/focus reveal contract)
- WCAG 2.4.7 (focus-visible), 4.1.2 (name role value)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
