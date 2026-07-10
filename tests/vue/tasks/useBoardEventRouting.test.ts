import { render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import { useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';
import { useBoardEventRouting } from '@/features/tasks/ui/vue/useBoardEventRouting';

type EventHandler = (payload?: unknown) => void;
type VaultHandler = (file: { path?: string }, oldPath?: string) => void;

/** EventBus fake: captures every handler (arrays — an event can be subscribed
 *  more than once, e.g. task:run-finished) and hands back a fresh disposer spy
 *  per subscription so unmount can be asserted per-disposer. */
function makeEventsFake() {
  const handlers: Record<string, EventHandler[]> = {};
  const disposers: Array<ReturnType<typeof vi.fn>> = [];
  const on = vi.fn((name: string, handler: EventHandler) => {
    (handlers[name] ??= []).push(handler);
    const dispose = vi.fn();
    disposers.push(dispose);
    return dispose;
  });
  const fire = (name: string, payload?: unknown): void => {
    for (const handler of handlers[name] ?? []) handler(payload);
  };
  return { handlers, disposers, on, fire };
}

/** Vault fake mirroring tests/vue/panels/loopsPanel.test.ts: capture the four
 *  handlers, return an opaque EventRef token asserted against offref. */
function makeVaultFake() {
  const handlers: Record<string, VaultHandler> = {};
  return {
    handlers,
    vault: {
      on: vi.fn((name: string, handler: VaultHandler) => {
        handlers[name] = handler;
        return { event: name };
      }),
      offref: vi.fn(),
    },
  };
}

function makeDeps() {
  return {
    indexVaultFolder: vi.fn().mockResolvedValue({ tasks: [], invalidNotes: [] }),
    loadBoardConfig: vi.fn().mockReturnValue({ config: {}, errors: [] }),
    resolveBoardLayout: vi.fn().mockReturnValue({ lanes: [], errors: [] }),
  };
}

function setup(settings: Record<string, unknown> = { agentBoardWorkOrderFolder: 'Agent Board/tasks' }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const events = makeEventsFake();
  const { vault, handlers: vaultHandlers } = makeVaultFake();
  const plugin = {
    app: { vault },
    settings,
    events: { on: events.on },
  } as never;
  const store = useAgentBoardStore();
  store.init(plugin, makeDeps() as never);
  const utils = render(
    defineComponent({
      setup() {
        useBoardEventRouting(plugin);
        return () => null;
      },
    }),
    { global: { plugins: [pinia] } },
  );
  return { store, plugin, events, vault, vaultHandlers, ...utils };
}

describe('useBoardEventRouting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('subscribes to the board events and the four vault events on mount', () => {
    const { events, vault } = setup();
    const subscribed = events.on.mock.calls.map((call) => call[0]);
    for (const event of [
      'task:heartbeat',
      'task:ledger-appended',
      'task:status-changed',
      'task:board-config-changed',
      'roster:changed',
      'task:queue-paused',
      'task:run-finished',
    ]) {
      expect(subscribed).toContain(event);
    }
    expect(vault.on.mock.calls.map((call) => call[0]).sort()).toEqual(['create', 'delete', 'modify', 'rename']);
  });

  it('routes task:heartbeat to recordHeartbeat and never to load', () => {
    const { store, events } = setup();
    const recordHeartbeat = vi.spyOn(store, 'recordHeartbeat');
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    events.fire('task:heartbeat', { taskId: 'a', at: 'T' });
    expect(recordHeartbeat).toHaveBeenCalledWith('a', 'T');
    expect(load).not.toHaveBeenCalled();
  });

  it('routes task:ledger-appended to recordLedger (entry.message) and never to load', () => {
    const { store, events } = setup();
    const recordLedger = vi.spyOn(store, 'recordLedger');
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    events.fire('task:ledger-appended', { taskId: 'a', entry: { message: 'm' } });
    expect(recordLedger).toHaveBeenCalledWith('a', 'm');
    expect(load).not.toHaveBeenCalled();
  });

  it('routes a full-refresh event (task:board-config-changed) to a guarded load', () => {
    const { store, events } = setup();
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    events.fire('task:board-config-changed');
    expect(load).toHaveBeenCalled();
  });

  it('routes task:run-finished to evictLive, clearPause, AND load (terminal clears the pause overlay)', () => {
    const { store, events } = setup();
    const evictLive = vi.spyOn(store, 'evictLive');
    const clearPause = vi.spyOn(store, 'clearPause');
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    events.fire('task:run-finished', { taskId: 'a' });
    expect(evictLive).toHaveBeenCalledWith('a');
    expect(clearPause).toHaveBeenCalledWith('a');
    expect(load).toHaveBeenCalled();
  });

  it('routes task:needs-input to setPause (question + default seed) AND load', () => {
    const { store, events } = setup();
    const setPause = vi.spyOn(store, 'setPause');
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    events.fire('task:needs-input', { taskId: 'a', path: 'p', question: 'Q?', why: 'because', default: 'seed', runId: 'r1' });
    expect(setPause).toHaveBeenCalledWith('a', { question: 'Q?', defaultValue: 'seed', runId: 'r1' });
    expect(load).toHaveBeenCalled();
  });

  it('routes task:needs-approval to setPause (action + risk + reversible) AND load', () => {
    const { store, events } = setup();
    const setPause = vi.spyOn(store, 'setPause');
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    events.fire('task:needs-approval', { taskId: 'a', path: 'p', action: 'Delete files', risk: 'high', reversible: false, runId: 'r1' });
    expect(setPause).toHaveBeenCalledWith('a', { action: 'Delete files', risk: 'high', reversible: false, runId: 'r1' });
    expect(load).toHaveBeenCalled();
  });

  it('routes task:resumed to clearPause AND load (drops the reply surface on resume)', () => {
    const { store, events } = setup();
    const clearPause = vi.spyOn(store, 'clearPause');
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    events.fire('task:resumed', { taskId: 'a', path: 'p' });
    expect(clearPause).toHaveBeenCalledWith('a');
    expect(load).toHaveBeenCalled();
  });

  it('routes task:status-changed OFF a pause status to clearPause; a change TO a pause status keeps it', () => {
    const { store, events } = setup();
    const clearPause = vi.spyOn(store, 'clearPause');
    events.fire('task:status-changed', { taskId: 'a', path: 'p', status: 'running' });
    expect(clearPause).toHaveBeenCalledWith('a');

    clearPause.mockClear();
    // RunSession emits status-changed(needs_input) BEFORE the needs-input event
    // that sets the pause, so this branch must NOT clear it.
    events.fire('task:status-changed', { taskId: 'a', path: 'p', status: 'needs_input' });
    events.fire('task:status-changed', { taskId: 'a', path: 'p', status: 'needs_approval' });
    expect(clearPause).not.toHaveBeenCalled();
  });

  it('coalesces a burst of in-folder vault writes into one debounced load', async () => {
    const { store, vaultHandlers } = setup();
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    vi.useFakeTimers();
    try {
      vaultHandlers.create({ path: 'Agent Board/tasks/wo-1.md' });
      vaultHandlers.modify({ path: 'Agent Board/tasks/wo-1.md' });
      // Debounce window still open — no reload yet.
      expect(load).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
    } finally {
      vi.useRealTimers();
    }
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ignores vault writes outside the work-order folder', async () => {
    const { store, vaultHandlers } = setup();
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    vi.useFakeTimers();
    try {
      vaultHandlers.modify({ path: 'Notes/unrelated.md' });
      // Segment-aware prefix: a sibling folder sharing the prefix is OUTSIDE.
      vaultHandlers.create({ path: 'Agent Board/tasksish/nope.md' });
      await vi.advanceTimersByTimeAsync(200);
    } finally {
      vi.useRealTimers();
    }
    expect(load).not.toHaveBeenCalled();
  });

  it('disposes every EventBus subscription, offrefs all vault refs, and drops a pending vault reload on unmount', async () => {
    const { store, events, vault, vaultHandlers, unmount } = setup();
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    vi.useFakeTimers();
    try {
      vaultHandlers.create({ path: 'Agent Board/tasks/wo-1.md' });
      unmount();
      await vi.advanceTimersByTimeAsync(400);
    } finally {
      vi.useRealTimers();
    }
    // Every EventBus disposer ran exactly once.
    expect(events.disposers.length).toBe(events.on.mock.calls.length);
    for (const dispose of events.disposers) expect(dispose).toHaveBeenCalledTimes(1);
    // All four vault refs were offref'd.
    expect(vault.offref).toHaveBeenCalledTimes(4);
    // The queued reload died with the component.
    expect(load).not.toHaveBeenCalled();
  });
});
