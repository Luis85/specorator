---
title: Agent Board Vue 3 + Pinia migration — reactive board over the imperative run engine
date: 2026-07-05
status: approved
scope: features/tasks/ui (board view, cards, modals), features/tasks store projection, src/style/vue
---

# Agent Board — Vue 3 + Pinia Migration

## Problem

The Agent Board (`features/tasks/ui/`, ~6k LOC) is the last big imperative
view after the Library shipped Vue. `AgentBoardRenderer` (764 LOC) builds
lanes/cards by hand and keeps them live during runs through manual
`patchCard`/`patchLiveStrip` DOM surgery driven by ~14 EventBus subscriptions.
The detail/lane/template modals are likewise imperative. This is the natural
next migration: it reuses the shipped harness (esbuild/unplugin-vue, Vitest
lane, `--sp-*` style baseline, atoms, `useRowActionPending`, `mergeById`,
`useGuardedLoad`) and replaces the hand-rolled patch machinery with reactive
rendering.

## Decisions (user-approved)

| Question | Decision |
|----------|----------|
| Scope | **Full board surface**: board shell + lanes + cards + the card action cluster, AND the three modals (`WorkOrderDetailModal`, `AgentBoardLaneEditor`, `WorkOrderTemplateEditorModal`) migrate to Vue. |
| Live-run boundary | **View is Vue; engine is untouched.** `TaskRunCoordinator`, `RunSession`, `RunSidecarStore` writes, `sharedRunRegistry`, orphan recovery, and the heartbeat/ledger sidecar model keep running imperatively and emitting the same EventBus events. |
| Rollout | **Direct parity replacement, no flag.** Accrete-then-swap: new Vue code lands unwired while the board keeps running on the imperative renderer; a single cutover task swaps `AgentBoardView` to the Vue root and deletes the old renderer. No `useVueAgentBoard` flag, no user-facing half-state. |

### The no-flag trade-off (accepted)

Without a flag there is no early look: the board is QA'd only after the
cutover commit. A live-run rendering regression that escapes the parity +
perf tests is briefly in the working board until caught. Mitigation: the
cutover is gated by (a) characterization tests asserting the Vue components
reproduce the current renderer's DOM/class structure, and (b) a rewritten
`agentBoard.perf` spec.

## Architecture — four units

### 1. `useAgentBoardStore` (Pinia, reactive projection)

Wraps the existing services; I/O stays in them, the store is a reactive view
(same contract as the Library stores — init-guard, `useGuardedLoad`,
`mergeById` for stable card identity across reloads).

State:
- `layout` — the resolved board layout (`ResolvedBoardLayout`: lanes, each
  `ResolvedLane` with its `tasks`), from `TaskNoteStore` + board config.
- `liveHeartbeats: Map<taskId, isoString>` — mirrors the renderer's live map.
- per-card live ledger message + run status refs.

The store owns the EventBus→reactive mapping. Two tiers, mirroring the
renderer's own split so perf is preserved:

- **Full-refresh events** → `load()` (guarded): `task:board-config-changed`,
  `roster:changed`, `chat:tabs-changed`, `task:queue-*`, `task:run-finished`
  (→ runner tick + refresh).
- **Granular events** → targeted ref updates (the O(1) live path that
  replaces `patchCard`/`patchLiveStrip`): `task:heartbeat` →
  `liveHeartbeats.set`; `task:ledger-appended` → that card's live message;
  `task:attempt-started`/`task:status-changed`/`task:resumed`/
  `task:needs-input`/`task:needs-approval` → that card's status ref (which
  re-keys it into the right lane).

Subscription lifecycle is owned by the **board root** (subscribe on mount,
unsubscribe on unmount), routing each event to a store setter — the same
ownership model the Library's vault-event refresh uses. The store exposes
setters, not raw bus access.

### 2. Board components

`AgentBoardRoot.vue` (toolbar + lanes container + the Inbox add-work-order
row) → `BoardLane.vue` (a keyed column over `lane.tasks`) → `WorkOrderCard.vue`
(title row + status dot + `LiveStrip.vue` + hover action cluster).

- **`LiveStrip.vue`** is a separate sub-component so a `task:heartbeat` /
  `task:ledger-appended` update touches one strip's reactive deps, not the
  board — this is the perf-critical boundary that keeps a heartbeat O(1).
- Cards reuse shipped atoms: the new `IconButton` (from the merged follow-up),
  `useRowActionPending` for async card actions, `--sp-*` chip/status styling.
- The **card action cluster** (per-status primary button + ⋯ overflow
  popover) becomes a Vue component driven by the existing `CARD_ACTIONS` spec
  table + `AgentBoardRenderCallbacks` contract — the table stays the source of
  truth; only its rendering moves to Vue. The body-portaled overflow popover
  (`portalPopover.ts`) is reused or reimplemented as a Vue teleport.

### 3. Modals → Vue

Each mounts a Vue app in an Obsidian `Modal` shell (the Library's
imperative-modal-stays-imperative lesson is respected only for *editors the
board doesn't own*; here the board owns these three, so they migrate):

- `WorkOrderDetailModal` decomposes along its existing seams —
  `workOrderPropertiesPanel` (status pill + editable chips), the
  `workOrderActivitySection` (handoff/salvage/ledger cards, `MarkdownRenderer`
  via `:deep()`), `workOrderFooterActions` (status CTAs + inline edit
  toggle), and `workOrderEditForm` (section textareas → `TaskNoteStore.writeSections`).
  One migration task.
- `AgentBoardLaneEditor` and `WorkOrderTemplateEditorModal` — one task each.

### 4. Cutover

`AgentBoardView.onOpen` mounts `AgentBoardRoot` (adds `.specorator-vue` +
`.specorator-agent-board-vue-root`), wires the EventBus subscription, and
deletes `AgentBoardRenderer`, `agentBoardCardActions`, and the `patch*`
functions. `WorkOrderActivityProvider` (the chat-header work-order dropdown, a
separate consumer of `TaskNoteStore`) is **out of scope** and unchanged.

## Task sequence (accrete-then-swap; every task leaves the board green)

1. **Store** — `useAgentBoardStore` projection + EventBus-routing plumbing,
   *unwired*. Tests: layout projection, full-refresh vs granular event
   handling, `mergeById` identity, guarded-load.
2. **Board components** — `AgentBoardRoot`/`BoardLane`/`WorkOrderCard`/
   `LiveStrip`, *unwired*; characterization tests assert DOM/class parity with
   the current renderer output (lanes, status dot, live-pulse class, Inbox row).
3. **Card action cluster** — per-status primary + ⋯ overflow as Vue over
   `CARD_ACTIONS`, *unwired*; tests: each status → correct actions; busy-gate;
   overflow teleport open/close + cleanup.
4. **Board cutover** *(the one live-run swap)* — `AgentBoardView` mounts the
   Vue root, wires events, deletes the imperative renderer/card-actions/patch
   fns, rewrites `agentBoard.perf` for the Vue surface (mounted DOM/listeners
   O(rendered cards); one heartbeat updates one `LiveStrip`, not the board).
   **Cards still open the existing imperative detail/lane/template modals
   unchanged** — the cutover swaps only the board, reusing proven modals as a
   safety net.
5. **`WorkOrderDetailModal` → Vue** — swap the open-call; parity tests per
   sub-panel (properties/activity/footer/edit-form).
6. **`AgentBoardLaneEditor` → Vue** — swap the open-call; parity tests.
7. **`WorkOrderTemplateEditorModal` → Vue** — swap the open-call; parity tests.
8. **Docs + final gate sweep** — architecture docs (`features/tasks/CLAUDE.md`,
   root `CLAUDE.md` board row), ADR note, ratchet re-locks, full sweep.

## Perf contract

`agentBoard.perf` is rewritten for the Vue surface and remains the blocking
gate it is today: (a) mounted DOM/listeners stay O(rendered cards) as the
work-order count scales; (b) a single `task:heartbeat` mutates one card's
`LiveStrip` reactive dep — assert the board root and sibling cards do not
re-render. `taskRunCoordinator.perf` and `multiTabStreaming.perf` are engine
specs (unchanged). The Library's `mergeById` is load-bearing here: during an
active run, a sibling card's reload must not churn the running card's identity
(avatar/strip repaint = visible flicker on a live board).

## Guards & style

`.specorator-vue-*` namespace + `is-*` (namespace guard); `--sp-*` tokens only
in SFC/atoms styles (token guard); no `!important` (css ratchet); Vitest
coverage floors extend to `src/features/tasks/ui/**/*.{ts,vue}` for the new
Vue surface; LOC/quality ratchets re-locked as the imperative renderer deletes
(net improvement expected, like the Library consolidation).

## Testing

- **Vitest (component lane)**: store event-mapping + projection specs; board
  component characterization + parity specs; card-action-cluster specs; per-
  modal parity specs. Reuse the obsidian fake + `tests/vue/` harness.
- **Characterization before cutover**: snapshot/structure tests of the current
  imperative renderer output become the parity target the Vue components must
  match (captured in Task 2 before Task 4 swaps).
- **Perf**: rewritten `agentBoard.perf` (Task 4).
- **Jest**: the engine specs (`TaskRunCoordinator`, `RunSession`, sidecar,
  orphan recovery) are untouched and must stay green — proof the seam held.

## Risks

1. **Live-run regression post-cutover** (no flag) — mitigated by
   characterization + perf gates; the imperative modals stay as a safety net
   through the board cutover.
2. **Perf regression from over-reactive rendering** — a naive board where a
   heartbeat re-renders every card. Mitigated by the `LiveStrip` sub-component
   boundary + the rewritten perf spec asserting single-strip updates.
3. **Overflow popover / teleport lifecycle** — the body-portaled menu must
   clean up on card unmount/board close (a leak the Library's leak-test
   pattern already guards; extend it to the board).
4. **Drag/interaction parity** — the plan task must read the current renderer
   for any drag-between-lanes or keyboard interaction and preserve it; not
   assumed here.

## Out of scope

- The run execution engine (coordinator/session/sidecar/registry).
- `WorkOrderActivityProvider` (chat-header dropdown).
- The chat sidepanel migration (a separate, larger future spec).
- Any change to work-order note format or the sidecar model.
