---
title: Agent Board UX pass — attention routing, keyboard access, empty states, motion
date: 2026-07-16
status: approved
scope: features/tasks/ui/vue (board island), src/style/features/agent-board.css, i18n locales
---

# Agent Board UX pass

## Problem

The board migrated to Vue (ADR 0004) as a parity replacement, which deliberately
carried over the imperative surface's UX gaps:

- **Attention routing** — `needs_input` / `needs_approval` cards are the only
  ones blocking a live run on a human, yet nothing rolls them up; on a wide
  board they can sit outside the horizontal scroll viewport. Settled cards
  carry no age, so a stale Review/Inbox pile is invisible. Terminal cards
  (`done`) render at full visual weight next to active work.
- **Keyboard & accessibility** — cards are plain `div`s with `@click`: not
  focusable, not operable by keyboard, no accessible name; lanes have no list
  semantics. (The collapsed-lane strip and the overflow menu already do this
  right.) The overflow menu lacks arrow-key navigation despite `role="menu"`.
- **Empty states** — an empty lane renders only its header; a brand-new board
  is a blank strip of columns with no explanation of what a work order is or
  where it lives.
- **Motion & polish** — a status change teleports a card between lanes with no
  transition; card hover snaps; the queue-skip chip looks static though it is
  clickable; the "no free slots" hint and board notices all shout in
  error-red even when they are warnings; always-expanded DoR/DoD criteria eat
  lane height.

## Decisions (user-approved)

| Question | Decision |
|----------|----------|
| Scope | All four areas above, in one pass. |
| Drag & drop | **Out of scope** (follow-up spec — transitions have side effects: Run launches a session, Accept can trigger commit-on-accept). |
| Validation | Straight to spec + build; no mockup round. |
| Lane criteria | Collapse DoR/DoD behind an ⓘ header toggle **by default** (the one behavior change). |

## Constraints

- The run engine, `AgentBoardRenderCallbacks` seam, `CARD_ACTIONS` table, and
  EventBus routing are untouched.
- All DOM changes are **additive** to the locked `.specorator-agent-board-*`
  class contract (`tests/vue/tasks/*`).
- Perf boundaries hold: a heartbeat re-renders exactly one `LiveStrip`; the 1s
  clock re-renders only live strips. New periodic work (age stamps) rides a
  **minute**-granularity axis.
- Every new user-visible string resolves through `t(...)`; all 10 locales stay
  structurally aligned (`tests/unit/i18n/locales.test.ts`).
- All motion is gated behind `@media (prefers-reduced-motion: no-preference)`.

## Design

### 1. Attention & triage

**Toolbar chip.** `BoardToolbar` gains a `specorator-agent-board-toolbar-attention`
button in the info block, rendered only when the store's new `attentionTasks`
projection (ids of `needs_input`/`needs_approval` cards, layout order) is
non-empty: amber dot + "{n} waiting on you". Clicking cycles through the
waiting cards round-robin via `focusCard(taskId)` — smooth-scroll into view
(`block/inline: 'nearest'`), programmatic focus, and a ~1.3s accent outline
flash (`is-attention-target`, timer-removed; pulse animation motion-gated,
static outline otherwise).

`AgentBoardRoot` owns `focusCard` (it owns the lanes DOM) and provides it via a
new `FOCUS_CARD_KEY` in `boardKeys.ts`; cards carry `data-task-id` so the root
can resolve the element. The chip injects it optionally (no-op when absent).

**Age stamps.** Non-live cards append a faint `{ago} ago` to the meta row
(grid becomes `1fr auto auto`), from `frontmatter.updated` through the existing
`utils/date.formatRelativeTime`; the absolute local timestamp rides the `title`
attribute. Freshness comes from a new store ref `nowMinuteMs`, assigned inside
the existing `tick()` only when the floored minute changes — so cards re-render
once per minute, and neither the heartbeat path nor the 1s strip axis grows.
Live cards skip the stamp (the live strip already shows elapsed).

**Terminal muting.** `done` cards render at 0.82 opacity, `canceled` keeps
0.65; both restore to full opacity on hover/focus-within. `failed` keeps its
red border.

### 2. Keyboard & accessibility

Cards become first-class keyboard citizens:

- `tabindex="0"`, `role="listitem"`, `aria-label` "{title} — {status}"
  (status label reuses `DEFAULT_LANE_TITLES`, the same source as the dot's
  tooltip).
- `Enter`/`Space` open the detail modal — only when the event target IS the
  card (inner buttons keep their own semantics); `Space` prevents scroll.
- `ContextMenu` key and `Shift+F10` dispatch `onContextMenu` with a synthetic
  MouseEvent positioned on the card's rect.
- The focus ring comes from the `.specorator-vue` reset's `:focus-visible`.

Cards move into a dedicated per-lane wrapper
`.specorator-agent-board-lane-cards` with `role="list"` +
`aria-label` = lane title — rendered as the `<TransitionGroup tag="div">` root
(see §4), a flex column that also serves as the positioning context for leave
animations. Header, criteria, and the add-row stay direct lane children.

`OverflowMenu` adds roving focus: `ArrowDown`/`ArrowUp` (wrapping), `Home`/
`End` move focus across menu items; `Escape`/outside-close/focus-return are
unchanged.

### 3. Empty states

**First-run hero.** When a **loaded** layout has lanes but zero tasks anywhere
(`lanes.length > 0` guards the pre-load `EMPTY_LAYOUT`; suppressed while
`loading` or on `error`), the root renders a compact centered
`specorator-agent-board-empty` block between toolbar and lanes: `clipboard-list`
icon, "No work orders yet" title, a one-liner naming the configured work-order
folder (`boardWorkOrderFolder(plugin.settings)`), and an Add CTA routed through
the same `onAddWorkOrder` callback (root now injects `CALLBACKS_KEY`). Lanes
keep rendering below so the pipeline stays visible.

**Per-lane placeholder.** An expanded, empty lane renders a faint dashed
`specorator-agent-board-lane-empty` ghost row ("No work orders") — only when
the board holds at least one card somewhere (else the hero owns the message)
and the lane does not host the add-row (the dashed add affordance already
fills that role).

### 4. Motion & visual polish

- **Lane transitions** — `<TransitionGroup name="specorator-board-card">`:
  enter = fade + 4px rise (160ms), leave = fade (120ms) with
  `position: absolute; left/right: 0` so siblings FLIP up smoothly, move =
  220ms transform. Transition durations live entirely inside the
  reduced-motion media block; without it Vue sees 0s durations and applies
  states instantly.
- **Card hover** — 150ms transition on border-color/background/box-shadow
  (motion-gated).
- **Skip chip** — becomes a real `<button>` (keyboard + focus for free) with a
  hover state, a trailing × glyph, and a "Dismiss" aria/tooltip.
- **Callout softening** — the "no free slots" hint and the Board notices /
  Skipped notes sections restyle from error-red to amber warning callouts
  (`--text-warning` + tinted border/wash; the hint gains an `alert-triangle`
  icon). A genuine `store.error` load failure stays red.
- **Lane criteria** — DoR/DoD collapse by default behind a bordered-less ⓘ
  icon-button in the lane header (rendered only when the lane has criteria),
  `aria-expanded` + `aria-controls` wired, per-lane session state (a `ref` in
  `BoardLane`).

## Out of scope

Drag & drop between lanes, board filtering/search, WIP limits, the detail
modal internals, `WorkOrderActivityProvider`.

## Testing

Extend the existing Vitest lane (`tests/vue/tasks/`):

- store: `nowMinuteMs` changes only across minute boundaries; `attentionTasks`
  contents + ordering.
- card: focusability/aria/data attrs; Enter/Space/ContextMenu handlers incl.
  the inner-control guard; age stamp on settled cards only; skip chip is a
  button and still acks.
- lane: list wrapper semantics; criteria hidden by default + toggle
  aria-expanded; placeholder gating.
- root/toolbar: hero gating (empty vs loading vs populated); attention chip
  gating, label, and focusCard cycling.
- overflow menu: arrow/Home/End roving focus.
- locales: parity picked up by the existing structural test.

Existing perf/scaling guards must stay green unmodified.
