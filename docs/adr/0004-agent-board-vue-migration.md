---
title: Migrate the Agent Board to a Vue 3 + Pinia island over the untouched run engine
date: 2026-07-11
status: accepted
scope: src/features/tasks/ui, src/features/tasks/ui/vue
supersedes: none
relates-to: docs/superpowers/plans/2026-07-05-agent-board-vue-migration.md, docs/adr/0003-retire-legacy-library-views.md, docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md
method: accrete-then-swap (unwired Vue behind characterization/parity tests, one live cutover), engine seam held green throughout, post-cutover manual QA in Obsidian
---

# ADR 0004 — Agent Board Vue 3 + Pinia migration

## Status

**Accepted and implemented** (2026-07-11, across commits `c329dbb`..`b9b2156`
plus this Task 8 sweep).

## Context

The Agent Board was an imperative `ItemView` that hand-built card/lane/toolbar
DOM and kept it in sync with `patchCard` / `patchLiveStrip` patch-in-place
machinery, a body-portaled overflow popover (`portalPopover`), a card-actions
DOM class (`AgentBoardCardActions`), and a live-heartbeat tracker class. That
patch machinery was the board's most defect-prone surface — every live signal
(heartbeat, ledger line, pause prompt, queue skip, status change) had its own
imperative repaint path, and the live-run flicker fixes accreted there.

The Library had already shipped the reactive substrate this board wanted (Vue 3
SFCs, Pinia setup stores, the `--sp-*` style baseline, `useGuardedLoad` /
`mergeById` / `useFolderVaultRefresh`, the Vitest `tests/vue/` lane) and ADR
0003 had retired the "big-bang version milestone" framing for such cutovers.

## Decision

1. **View → Vue; engine untouched.** The board *view* becomes a Vue 3 + Pinia
   island (`ui/vue/AgentBoardRoot.vue` mounted by `AgentBoardView`). The run
   *engine* — `TaskRunCoordinator`, `RunSession`, `RunSidecarStore`,
   `sharedRunRegistry`, `queueControl` / `queueSlotTracker`, orphan recovery —
   is not touched and keeps emitting the same `task:*` EventBus events. The
   engine's Jest specs are the proof the seam held; they stayed green across the
   cutover.
2. **No feature flag — direct cutover.** Unlike the Library's flagged rollout,
   the board swapped in one commit with no `useVue*` flag. The old imperative
   detail/lane/template modals were the safety net during the board cutover
   (they were migrated in the following commits), and QA ran post-swap. Keeping
   a flag would have meant maintaining two board renderers against the same live
   engine — the exact double-maintenance ADR 0003 rejected.
3. **The reactive seam.** `ui/vue/stores/agentBoardStore.ts`
   (`useAgentBoardStore`) is a projection: `load()` re-derives the resolved
   layout from disk (`TaskIndexer` + `loadBoardConfig` + `resolveBoardLayout`,
   merged by task id so a running card keeps its object reference and does not
   flicker) plus the toolbar chrome, and holds the event-sourced overlays a note
   cannot carry — `liveHeartbeats` / `liveLedger` (O(1) per-task setters),
   `pauseState`, `skipReasons`, `invalidNotes`, and a 1s `nowMs` board clock.
   `ui/vue/useBoardEventRouting.ts` subscribes the board's EventBus + 4 vault
   events and routes them in two tiers: granular setters for the hot
   heartbeat/ledger path, and a guarded `store.load()` for anything that
   re-buckets a card into a different lane. The view still builds the
   `AgentBoardRenderCallbacks` object and provides it to Vue — that callback
   contract is the unchanged view↔card seam.
4. **Shared island helper.** `ui/vue/vueIsland.ts` (`VueIsland`) consolidates the
   create/provide/mount + unmount lifecycle for all three editor islands (detail
   + template editor modals and the lane-editor settings render-fn), each of
   which kept its existing entry-point signature so no call site changed.
5. **Data module renamed.** The per-status card-action spec table and shared
   board contracts moved from `agentBoardCardActions.ts` to the data-only
   `ui/cardActions.ts` (the DOM class it used to sit beside is gone).

## Consequences / accepted trade-offs

- **No-flag cutover was QA'd post-swap.** The risk of a direct replacement was
  bounded by (a) characterization/parity tests written against exact DOM class
  parity before the swap, (b) the untouched engine + its green Jest specs, and
  (c) the still-imperative modals as the interaction safety net during the board
  swap. Accepted: a regression could only reach a user after the swap, not
  behind a flag.
- **Double vault-index on coarse events.** The imperative engine model and the
  store projection both re-index the work-order folder on coarse events
  (config/roster/queue/vault change). This is a deliberate, accepted duplication:
  the two indexes serve different consumers (the runner's model vs. the board's
  read-model), the reads are cheap relative to a human-scale board, and the
  hot path that actually matters — a heartbeat — stays O(1) per `LiveStrip`
  (granular setter, never a reload). Collapsing to a single shared index would
  couple the engine to the view store; not worth it now.
- **Module-global one-open-menu singleton.** `ui/vue/useOpenMenu.ts` enforces
  "one ⋯ overflow menu open at a time" with a module-global closer, so the
  invariant spans ALL board leaves/windows rather than per-leaf (the imperative
  popover was per-board-instance). Deliberate and benign: a transient popover is
  only ever open under the pointer, and "close any stray popover anywhere" is at
  worst equivalent UX. Per-view scoping, if ever needed, threads the closer
  through provide/inject instead.
- **Lane-editor teardown via MutationObserver.** `renderAgentBoardLaneEditor`
  keeps its frozen `(container, plugin): void` settings signature, and neither
  settings host offers a disposer to return. Rather than change those frozen
  call sites, the render-fn unmounts its Vue island when a MutationObserver sees
  the container detach (on `SpecoratorSettingTab.display()` / `hide()`), so Vue
  `onUnmounted` hooks always run and no listeners leak. Accepted as the least
  invasive lifecycle hook given the fixed signature.
- **Board scaling guard moved lanes.** The old `agentBoard.perf` Jest spec was
  deleted; the equivalent guard is now `tests/vue/tasks/agentBoardScaling.test.ts`
  in the Vitest component lane (mounted DOM/listeners O(rendered cards); one
  heartbeat updates one `LiveStrip`). The engine's own scaling stays in
  `tests/perf/taskRunCoordinator.perf.test.ts`.
- **Coverage lane accounting.** The deleted imperative code was heavily
  Jest-covered; its Vue replacements live in the Vitest lane. `ui/vue/**` is
  therefore excluded from Jest `collectCoverageFrom` and added to the Vitest
  `coverage.include`, mirroring the existing `src/features/library/**` exception,
  so neither lane's global floor is distorted by code the other lane tests.

## Deferred / known items

- The live async subagent lifecycle and any ACP-transport decisions for other
  providers are unrelated and unaffected.
- A shared vault-index between engine model and store projection remains
  possible future work (see the double-index trade-off) but is not planned.
- Cursor/Opencode boards are not in scope — this ADR covers the Agent Board only.

## References

- Plan: `docs/superpowers/plans/2026-07-05-agent-board-vue-migration.md`
- Style baseline that preceded the Vue surfaces: `docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md`
- Prior reactive-cutover precedent: `docs/adr/0003-retire-legacy-library-views.md`
