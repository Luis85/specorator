import type { EventRef, TAbstractFile } from 'obsidian';
import { onMounted, onUnmounted } from 'vue';

import type { SpecoratorEventMap } from '../../../../app/events/specoratorEvents';
import type SpecoratorPlugin from '../../../../main';
import { boardWorkOrderFolder } from '../../config/boardWorkOrderFolder';
import { useAgentBoardStore } from './stores/agentBoardStore';

// Same 100ms window AgentBoardView.scheduleRefresh uses (schedule-once, not the
// trailing reset the Library's useFolderVaultRefresh uses).
const VAULT_REFRESH_DEBOUNCE_MS = 100;

/**
 * Board events that invalidate the whole layout. A guarded `store.load()`
 * re-derives from disk and coalesces concurrent fires, so it is the reactive
 * equivalent of two imperative drivers at once:
 *  - the full render()/refresh() calls (queue/config/roster/tabs events); and
 *  - the per-card patchCard — the last five (attempt-started, status-changed,
 *    resumed, needs-input, needs-approval) change a card's status/pause, which
 *    re-buckets it into a different lane, so the reactive model expresses that
 *    targeted repaint as a reload.
 * `task:run-finished` is also a full-refresh driver; it additionally evicts the
 * live overlay via its dedicated granular handler below.
 */
const FULL_REFRESH_EVENTS = [
  'task:board-config-changed',
  'roster:changed',
  'chat:tabs-changed',
  'task:queue-paused',
  'task:queue-resumed',
  'task:queue-halted',
  'task:queue-tick',
  'task:queue-skipped',
  'task:queue-state-changed',
  'task:queue-cap-changed',
  'task:run-finished',
  'task:attempt-started',
  'task:status-changed',
  'task:resumed',
  'task:needs-input',
  'task:needs-approval',
] as const satisfies readonly (keyof SpecoratorEventMap)[];

/**
 * Routes the Agent Board's EventBus + vault events into the Pinia store,
 * replacing the imperative view's patchCard/patchLiveStrip/render wiring. Two
 * tiers mirror the view's own split: granular O(1) live-overlay setters
 * (heartbeat/ledger) for the fast path, and a guarded `store.load()` for
 * everything that re-buckets or invalidates the board. Owns its own
 * onMounted/onUnmounted — call once from a component `setup`, like the
 * Library's `useFolderVaultRefresh`. On unmount it disposes every EventBus
 * subscription, offrefs all vault refs, and clears the pending debounce.
 */
export function useBoardEventRouting(plugin: SpecoratorPlugin): void {
  const store = useAgentBoardStore();
  const disposers: Array<() => void> = [];
  const vaultRefs: EventRef[] = [];
  let refreshTimer: number | null = null;

  function onVaultChange(file: TAbstractFile): void {
    // Folder-scoped exactly like AgentBoardView.onVaultChange: writes outside
    // the work-order folder never reload the board. Re-read live (so a settings
    // change takes effect without a remount) via the SAME helper the store's
    // loader uses, so the filter can't reject a path the loader would index.
    if (!file.path.startsWith(`${boardWorkOrderFolder(plugin.settings)}/`)) return;
    scheduleRefresh();
  }

  function scheduleRefresh(): void {
    // Schedule-once coalesce: a burst inside the window collapses to one reload.
    if (refreshTimer !== null) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void store.load();
    }, VAULT_REFRESH_DEBOUNCE_MS);
  }

  onMounted(() => {
    // Granular live-overlay setters — the O(1) replacement for patchLiveStrip.
    disposers.push(plugin.events.on('task:heartbeat', (p) => store.recordHeartbeat(p.taskId, p.at)));
    disposers.push(plugin.events.on('task:ledger-appended', (p) => store.recordLedger(p.taskId, p.entry.message)));
    // task:run-finished is in BOTH tiers: evict the stale live overlay (so no
    // dead heartbeat/ledger line lingers on the now-terminal card) AND clear any
    // pause overlay (terminal ends a pause) AND trigger the guarded reload below.
    // The three touch different refs (live-overlay maps / pause map / layout), so
    // their relative order does not matter.
    disposers.push(plugin.events.on('task:run-finished', (p) => {
      store.evictLive(p.taskId);
      store.clearPause(p.taskId);
    }));

    // Pause overlay (the O(1) replacement for the imperative view's `pauseState`
    // Map). setPause carries the event-sourced prompt the reply surface renders;
    // clearPause mirrors every imperative `pauseState.delete`. Each also stays in
    // FULL_REFRESH_EVENTS below so the reload still re-buckets the card's lane.
    // Payloads mirror onPauseRequested's field selection: needs-input carries the
    // question + default seed; needs-approval carries the action + risk +
    // reversible. (The needs-input event's `why` is not surfaced by the reply
    // surface, so — like the imperative — it is not stored.)
    disposers.push(plugin.events.on('task:needs-input', (p) =>
      store.setPause(p.taskId, { question: p.question, defaultValue: p.default, runId: p.runId })));
    disposers.push(plugin.events.on('task:needs-approval', (p) =>
      store.setPause(p.taskId, { action: p.action, risk: p.risk, reversible: p.reversible, runId: p.runId })));
    // task:resumed → back to running: drop the pause overlay so the reply surface
    // disappears (imperative `pauseState.delete` on resume).
    disposers.push(plugin.events.on('task:resumed', (p) => store.clearPause(p.taskId)));
    // Any status change OFF a pause status clears the overlay, mirroring the
    // imperative onStatusChanged. A change TO needs_input/needs_approval keeps it:
    // RunSession emits status-changed(pause) BEFORE the needs-input/approval event
    // that sets it, so this guard never wipes a freshly-set pause.
    disposers.push(plugin.events.on('task:status-changed', (p) => {
      if (p.status !== 'needs_input' && p.status !== 'needs_approval') store.clearPause(p.taskId);
    }));
    // NB: vault `delete` intentionally does NOT clear the pause overlay. The
    // imperative evictInMemoryStateForPath maps path→taskId, but this overlay is
    // keyed by taskId which a path-only delete event can't resolve. load()
    // re-derives the layout so the deleted card leaves the board, and its orphaned
    // pause entry — keyed by a taskId no longer in any lane — never renders. Same
    // deferral already accepted for liveHeartbeats/liveLedger.

    for (const event of FULL_REFRESH_EVENTS) {
      disposers.push(plugin.events.on(event, () => void store.load()));
    }

    const { vault } = plugin.app;
    vaultRefs.push(vault.on('create', onVaultChange));
    vaultRefs.push(vault.on('modify', onVaultChange));
    vaultRefs.push(vault.on('delete', onVaultChange));
    vaultRefs.push(vault.on('rename', onVaultChange));
  });

  onUnmounted(() => {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    for (const dispose of disposers) dispose();
    disposers.length = 0;
    const { vault } = plugin.app;
    for (const ref of vaultRefs) vault.offref(ref);
    vaultRefs.length = 0;
  });
}
