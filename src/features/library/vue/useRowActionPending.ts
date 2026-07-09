import { ref } from 'vue';

export interface RowActionPending {
  isBusy: (rowId: string) => boolean;
  run: (rowId: string, fn: () => Promise<void>) => Promise<void>;
}

/**
 * Per-row busy tracker for async card actions (clone/delete/start-chat run
 * vault I/O + store reload with no visible feedback otherwise). Deliberately
 * dumb: no queuing, no per-action granularity — ONE busy bit per row gates
 * ALL of that row's actions, which both closes the dead-click window and
 * kills double-fire races (two clones from a double-click, a delete racing a
 * clone on the same row). Rejections propagate; panels wrap actions in
 * withErrorNotice so in practice `run` never rejects.
 */
export function useRowActionPending(): RowActionPending {
  const busy = ref<Set<string>>(new Set());

  function isBusy(rowId: string): boolean {
    return busy.value.has(rowId);
  }

  async function run(rowId: string, fn: () => Promise<void>): Promise<void> {
    if (busy.value.has(rowId)) return; // re-entrant fire on a busy row: drop it
    busy.value.add(rowId);
    try {
      await fn();
    } finally {
      busy.value.delete(rowId);
    }
  }

  return { isBusy, run };
}
