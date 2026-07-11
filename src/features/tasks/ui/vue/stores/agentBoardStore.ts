import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import { mergeById } from '../../../../library/vue/mergeById';
import { useGuardedLoad } from '../../../../library/vue/useGuardedLoad';
import { loadBoardConfig } from '../../../config/BoardConfigStore';
import type { ResolvedBoardLayout } from '../../../config/boardConfigTypes';
import { boardWorkOrderFolder } from '../../../config/boardWorkOrderFolder';
import { resolveBoardLayout } from '../../../config/resolveBoardLayout';
import { TaskIndexer } from '../../../indexing/TaskIndexer';
import type { InvalidTaskNote, TaskSpec } from '../../../model/taskTypes';
import { TaskNoteStore } from '../../../storage/TaskNoteStore';
import type { AgentBoardPauseState } from '../../cardActions';

/**
 * Loader seam over the vault-reading services the view drives in `refresh()`.
 * Production wires `TaskIndexer` + `loadBoardConfig` + `resolveBoardLayout`;
 * tests inject a fake so the store stays a pure projection with no real I/O.
 */
export interface BoardLoaderDeps {
  indexVaultFolder(vault: unknown, folder: string): Promise<{ tasks: TaskSpec[]; invalidNotes: unknown[] }>;
  loadBoardConfig: typeof loadBoardConfig;
  resolveBoardLayout: typeof resolveBoardLayout;
}

// Shared module-level initial value for every store's `layout`. Frozen so an
// accidental reassignment of a field on this shared constant can't leak across
// leaves; `load()` always replaces `layout.value` wholesale rather than mutating.
const EMPTY_LAYOUT: ResolvedBoardLayout = Object.freeze({ lanes: [], errors: [] });

/** Chat-tab usage the toolbar's "Work-order tabs N/M · K free" badge reads,
 *  mirroring the imperative `AgentBoardRenderState.slots` (`plugin.getTabSlotUsage()`). */
export interface BoardSlotUsage {
  used: number;
  max: number;
}

/**
 * Value-only projection of the toolbar's queue chrome — the imperative
 * `QueueToolbarState` MINUS its `onToggle` callback (the Vue toolbar routes that
 * action through the callbacks contract like every other button, not the store).
 * Sourced live from the plugin-level shared queue control + slot tracker, the
 * same singletons the imperative `getQueueToolbarState()` reads.
 */
export interface BoardToolbarQueueState {
  paused: boolean;
  halted: boolean;
  haltReason: string | null;
  slotOccupied: number;
  slotCapacity: number;
  consecutiveFailures: number;
}

/**
 * Snapshot the toolbar's queue chrome off the plugin's shared singletons. The
 * imperative view reads `runner.isPaused()/isHalted()/…`, which all delegate to
 * `plugin.queueControl`; reading the control directly is the identical value
 * without needing a runner (the queue engine stays imperative and out of scope).
 * `queueControl` is eagerly seeded `paused: true`, matching the imperative's
 * `runner?.isPaused() ?? true` fallback before a runner exists.
 */
function readQueueToolbarState(p: SpecoratorPlugin): BoardToolbarQueueState {
  const control = p.queueControl;
  const tracker = p.queueSlotTracker;
  return {
    paused: control.paused,
    halted: control.halted,
    haltReason: control.haltReason,
    slotOccupied: tracker.occupied(),
    slotCapacity: tracker.capacity(),
    consecutiveFailures: control.consecutiveFailures,
  };
}

/**
 * Reactive read-model over the Agent Board layout plus the two live overlays the
 * imperative view keeps (heartbeat `at` per task, last ledger line per task).
 * I/O stays in the wrapped services; every `load()` re-derives from disk and
 * merges by task id so untouched cards keep their reference (no live-board
 * flicker), mirroring the Library stores' projection contract.
 */
export const useAgentBoardStore = defineStore('agent-board', () => {
  const layout = shallowRef<ResolvedBoardLayout>(EMPTY_LAYOUT);
  // shallowRef: reactivity is driven purely by whole-Map reference replacement
  // in the setters below, so the deep-proxy overhead of `ref` would go unused.
  const liveHeartbeats = shallowRef<Map<string, string>>(new Map());
  const liveLedger = shallowRef<Map<string, string>>(new Map());
  // Event-sourced pause overlay: the imperative view's `pauseState` Map keyed by
  // task id, populated from task:needs-input/needs-approval and consumed by the
  // reply surface. The prompt (question / approval action + risk) lives in the
  // run events, NOT the note, so it can't be re-derived by load() — this overlay
  // carries it. shallowRef for the same whole-Map replacement reactivity contract
  // as liveHeartbeats/liveLedger.
  const pauseState = shallowRef<Map<string, AgentBoardPauseState>>(new Map());
  // Event-sourced skip overlay: the runner's shared `control.lastSkipReasonByTask`
  // is a plain (non-reactive) Map, so the imperative renderer re-read it on every
  // render to paint the queue skip chip. The Vue card can't watch that map — and a
  // skip/ack never changes the note, so load()'s mergeById keeps the identical task
  // ref and a task-only computed would never invalidate. This overlay is the
  // reactive mirror: set from task:queue-skipped, cleared wherever the runner clears
  // its own entry (launch → task:attempt-started, the ack, and any status change /
  // run-finished off the runnable state). shallowRef for the same whole-Map
  // replacement contract as pauseState/liveHeartbeats.
  const skipReasons = shallowRef<Map<string, string>>(new Map());
  // Work-order notes that failed to parse — the imperative renderErrors' "Skipped
  // notes" surface. Sourced from the loader's model, not the resolved layout.
  const invalidNotes = shallowRef<InvalidTaskNote[]>([]);
  // Toolbar chrome projections (Part 5a). Both mirror LIVE plugin singletons the
  // imperative view re-reads every render — NOT the vault index — so `load()`
  // refreshes them unconditionally (see below). shallowRef: reactivity is the
  // whole-value replacement in `load()`, so deep tracking would be unused.
  // `slots` = chat-tab usage (getTabSlotUsage); `queueState` = the shared queue
  // control snapshot, null until the first load (no divider/switch/counters —
  // the imperative renderer gates that whole block on `state.queue`).
  const slots = shallowRef<BoardSlotUsage>({ used: 0, max: 0 });
  const queueState = shallowRef<BoardToolbarQueueState | null>(null);
  const { loading, run } = useGuardedLoad();
  // Captured (not thrown) so callers can fire `void store.load()` without
  // guarding a rejection: the fetch path awaits vault reads on files that can
  // vanish mid delete/rename burst — exactly the vault events driving reloads.
  const error = ref<string | null>(null);

  // Reactive board clock: the O(1)-per-second freshness tick that replaces the
  // imperative view's `tickElapsed` interval. Live strips read it so the dot
  // escalates (green→amber→red) and elapsed advances on a hung run even when NO
  // heartbeat arrives. Kept OFF the heartbeat path — a heartbeat never ticks it,
  // preserving the per-strip O(1) heartbeat boundary; the 1s tick re-renders the
  // (bounded) set of live strips, which is the correct, separate axis.
  const nowMs = ref(Date.now());
  function tick(): void {
    nowMs.value = Date.now();
  }

  let plugin: SpecoratorPlugin | null = null;
  let deps: BoardLoaderDeps | null = null;

  function init(p: SpecoratorPlugin, override?: BoardLoaderDeps): void {
    if (plugin) return;
    plugin = p;
    const indexer = new TaskIndexer(new TaskNoteStore());
    deps = override ?? {
      indexVaultFolder: (vault, folder) => indexer.indexVaultFolder(vault as never, folder),
      loadBoardConfig,
      resolveBoardLayout,
    };
  }

  function folder(): string {
    // Shared with the Vue event-routing composable's vault filter (see
    // boardWorkOrderFolder) so the folder the loader indexes and the folder the
    // filter accepts can never drift apart.
    return plugin ? boardWorkOrderFolder(plugin.settings) : 'Agent Board/tasks';
  }

  async function load(): Promise<void> {
    if (!plugin || !deps) return;
    const p = plugin;
    const d = deps;
    // Toolbar chrome reads live plugin singletons (chat-tab usage + the shared
    // queue control/slot tracker), independent of the vault index. Set BEFORE
    // (and outside) `run()` so a transient index rejection can't stall the badge
    // — the imperative view's refreshSlots()/getQueueToolbarState() likewise
    // never gate on the index. Every event that changes these (chat:tabs-changed,
    // task:queue-*) already routes to load() in useBoardEventRouting.
    slots.value = p.getTabSlotUsage();
    queueState.value = readQueueToolbarState(p);
    await run(
      async () => {
        const model = await d.indexVaultFolder(p.app.vault, folder());
        // Keep loadBoardConfig's parse warnings (duplicate lane ids / status
        // mappings) — the imperative view merged them into layout.errors so the
        // Board notices section explained the fallback lane behavior; dropping
        // them leaves users with ambiguous lanes and no diagnostic.
        const { config, errors: configErrors } = d.loadBoardConfig(p.settings);
        const resolved = d.resolveBoardLayout(config, model as never);
        return {
          layout: { ...resolved, errors: [...configErrors, ...resolved.errors] },
          invalidNotes: model.invalidNotes as InvalidTaskNote[],
        };
      },
      ({ layout: next, invalidNotes: notes }) => {
        const merged = next.lanes.map((lane) => ({
          ...lane,
          tasks: mergeById(currentTasks(lane.id), lane.tasks, (t) => t.frontmatter.id),
        }));
        layout.value = { lanes: merged, errors: next.errors };
        invalidNotes.value = notes;
        error.value = null;
      },
      (e) => { error.value = e instanceof Error ? e.message : String(e); },
    );
  }

  function currentTasks(laneId: string): TaskSpec[] {
    return layout.value.lanes.find((l) => l.id === laneId)?.tasks ?? [];
  }

  function recordHeartbeat(taskId: string, at: string): void {
    const next = new Map(liveHeartbeats.value);
    next.set(taskId, at);
    liveHeartbeats.value = next;
  }

  function recordLedger(taskId: string, message: string): void {
    const next = new Map(liveLedger.value);
    next.set(taskId, message);
    liveLedger.value = next;
  }

  function evictLive(taskId: string): void {
    if (liveHeartbeats.value.has(taskId)) {
      const h = new Map(liveHeartbeats.value);
      h.delete(taskId);
      liveHeartbeats.value = h;
    }
    if (liveLedger.value.has(taskId)) {
      const l = new Map(liveLedger.value);
      l.delete(taskId);
      liveLedger.value = l;
    }
  }

  // New-reference-on-mutation like the live setters, so a shallowRef watch fires.
  // Mirrors the imperative onPauseRequested `pauseState.set`.
  function setPause(taskId: string, payload: AgentBoardPauseState): void {
    const next = new Map(pauseState.value);
    next.set(taskId, payload);
    pauseState.value = next;
  }

  // Mirrors every imperative `pauseState.delete` (resume / terminal / status
  // change off a pause status). Clearing an absent key is a no-op that leaves the
  // reference untouched (no needless churn), matching evictLive's has-guard.
  function clearPause(taskId: string): void {
    if (!pauseState.value.has(taskId)) return;
    const next = new Map(pauseState.value);
    next.delete(taskId);
    pauseState.value = next;
  }

  // Mirrors the runner's `recordSkip` set (task:queue-skipped). New-reference so a
  // shallowRef watch fires and the card's skip chip paints without a note change.
  function setSkip(taskId: string, reason: string): void {
    const next = new Map(skipReasons.value);
    next.set(taskId, reason);
    skipReasons.value = next;
  }

  // Mirrors every point the runner clears `lastSkipReasonByTask` (launch/ack) plus
  // the defensive status-change/finish clears. Absent-key clear is a no-reference
  // no-op, matching clearPause/evictLive.
  function clearSkip(taskId: string): void {
    if (!skipReasons.value.has(taskId)) return;
    const next = new Map(skipReasons.value);
    next.delete(taskId);
    skipReasons.value = next;
  }

  return {
    layout, liveHeartbeats, liveLedger, pauseState, skipReasons, invalidNotes, slots, queueState, nowMs, loading, error,
    init, load, tick, recordHeartbeat, recordLedger, evictLive, setPause, clearPause, setSkip, clearSkip,
  };
});
