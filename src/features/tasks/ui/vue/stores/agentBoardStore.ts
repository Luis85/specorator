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
import type { TaskSpec } from '../../../model/taskTypes';
import { TaskNoteStore } from '../../../storage/TaskNoteStore';

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
  const { loading, run } = useGuardedLoad();
  // Captured (not thrown) so callers can fire `void store.load()` without
  // guarding a rejection: the fetch path awaits vault reads on files that can
  // vanish mid delete/rename burst — exactly the vault events driving reloads.
  const error = ref<string | null>(null);

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
    await run(
      async () => {
        const model = await d.indexVaultFolder(p.app.vault, folder());
        const { config } = d.loadBoardConfig(p.settings);
        return d.resolveBoardLayout(config, model as never);
      },
      (next) => {
        const merged = next.lanes.map((lane) => ({
          ...lane,
          tasks: mergeById(currentTasks(lane.id), lane.tasks, (t) => t.frontmatter.id),
        }));
        layout.value = { lanes: merged, errors: next.errors };
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

  return { layout, liveHeartbeats, liveLedger, loading, error, init, load, recordHeartbeat, recordLedger, evictLive };
});
