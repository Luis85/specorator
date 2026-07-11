import { fireEvent, render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedBoardLayout, ResolvedLane } from '@/features/tasks/config/boardConfigTypes';
import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import type { AgentBoardRenderCallbacks } from '@/features/tasks/ui/cardActions';
import { CALLBACKS_KEY } from '@/features/tasks/ui/vue/boardKeys';
import BoardToolbar from '@/features/tasks/ui/vue/components/BoardToolbar.vue';
import type { BoardSlotUsage, BoardToolbarQueueState } from '@/features/tasks/ui/vue/stores/agentBoardStore';
import { useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';
import { t } from '@/i18n/i18n';

// ---- fixtures -------------------------------------------------------------

function makeTask(id: string, status: TaskStatus): TaskSpec {
  return {
    path: `Agent Board/tasks/${id}.md`,
    frontmatter: {
      type: 'specorator-work-order', schema_version: 1, id, title: id, status,
      priority: '2 - normal', created: '', updated: '', attempts: 0,
    },
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger: '', handoff: '' },
    body: '', raw: '',
  } as TaskSpec;
}

function makeLane(id: string, tasks: TaskSpec[]): ResolvedLane {
  return {
    id, title: id, tasks,
    hostsNewWorkOrders: false, definitionOfReady: [], definitionOfDone: [],
    isCatchAll: false, collapsible: false, collapsed: false,
  };
}

function makeCallbacks(): AgentBoardRenderCallbacks {
  return {
    onAddWorkOrder: vi.fn(),
    onRunNextReady: vi.fn(),
    onToggleAutoRun: vi.fn(),
  } as unknown as AgentBoardRenderCallbacks;
}

function makeQueue(overrides: Partial<BoardToolbarQueueState> = {}): BoardToolbarQueueState {
  return {
    paused: false, halted: false, haltReason: null,
    slotOccupied: 1, slotCapacity: 3, consecutiveFailures: 0,
    ...overrides,
  };
}

function mountToolbar(opts: {
  layout?: ResolvedBoardLayout;
  slots?: BoardSlotUsage;
  queueState?: BoardToolbarQueueState | null;
  callbacks?: AgentBoardRenderCallbacks;
} = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAgentBoardStore();
  if (opts.layout) store.layout = opts.layout;
  if (opts.slots) store.slots = opts.slots;
  if (opts.queueState !== undefined) store.queueState = opts.queueState;
  const callbacks = opts.callbacks ?? makeCallbacks();
  const utils = render(BoardToolbar, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: callbacks } },
  });
  return { store, callbacks, ...utils };
}

// ---- tests ----------------------------------------------------------------

describe('BoardToolbar chrome (parity with renderBoardToolbar)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the auto-run switch ON (divider, track/thumb--on, label, aria-checked) when the queue runs', () => {
    const { container } = mountToolbar({
      slots: { used: 1, max: 3 },
      queueState: makeQueue({ paused: false, halted: false }),
    });
    // Divider only exists once a queue is projected.
    expect(container.querySelector('.specorator-agent-board-toolbar-divider')).toBeTruthy();
    const sw = container.querySelector('.specorator-agent-board-toolbar-autorun');
    expect(sw?.tagName).toBe('BUTTON');
    expect(sw?.getAttribute('type')).toBe('button');
    expect(sw?.getAttribute('role')).toBe('switch');
    expect(sw?.getAttribute('aria-checked')).toBe('true');
    expect(sw?.classList.contains('specorator-agent-board-toolbar-autorun--on')).toBe(true);
    expect(sw?.classList.contains('specorator-agent-board-toolbar-autorun--off')).toBe(false);
    expect(sw?.getAttribute('title')).toBe(t('tasks.board.autoRun.tooltip'));
    expect(sw?.getAttribute('aria-label')).toBe(t('tasks.board.autoRun.tooltip'));
    const thumb = sw?.querySelector('.specorator-agent-board-toolbar-autorun-track .specorator-agent-board-toolbar-autorun-thumb');
    expect(thumb?.classList.contains('specorator-agent-board-toolbar-autorun-thumb--on')).toBe(true);
    expect(sw?.querySelector('.specorator-agent-board-toolbar-autorun-label')?.textContent).toBe('Auto-run');
  });

  it('renders the auto-run switch OFF (aria-checked=false, thumb not --on) when paused', () => {
    const { container } = mountToolbar({
      slots: { used: 0, max: 3 },
      queueState: makeQueue({ paused: true }),
    });
    const sw = container.querySelector('.specorator-agent-board-toolbar-autorun');
    expect(sw?.getAttribute('aria-checked')).toBe('false');
    expect(sw?.classList.contains('specorator-agent-board-toolbar-autorun--off')).toBe(true);
    expect(sw?.classList.contains('specorator-agent-board-toolbar-autorun--on')).toBe(false);
    expect(
      sw?.querySelector('.specorator-agent-board-toolbar-autorun-thumb')
        ?.classList.contains('specorator-agent-board-toolbar-autorun-thumb--on'),
    ).toBe(false);
  });

  it('forces the switch OFF while halted even if not paused, and the halt caption suppresses the failure streak', () => {
    const { container } = mountToolbar({
      slots: { used: 1, max: 3 },
      queueState: makeQueue({ paused: false, halted: true, haltReason: 'boom', consecutiveFailures: 2 }),
    });
    const sw = container.querySelector('.specorator-agent-board-toolbar-autorun');
    expect(sw?.getAttribute('aria-checked')).toBe('false');
    expect(sw?.classList.contains('specorator-agent-board-toolbar-autorun--off')).toBe(true);
    // Exactly one failure-count span, carrying the HALT caption (not the streak).
    const failures = container.querySelectorAll('.specorator-agent-board-toolbar--queue-failure-count');
    expect(failures.length).toBe(1);
    expect(failures[0].textContent).toBe(t('tasks.board.queueHalted', { reason: 'boom' }));
  });

  it('renders the active-count with its soft-ring dot', () => {
    const { container } = mountToolbar({
      slots: { used: 1, max: 3 },
      queueState: makeQueue({ slotOccupied: 2, slotCapacity: 4 }),
    });
    const active = container.querySelector('.specorator-agent-board-toolbar--queue-active-count');
    expect(active?.querySelector('.specorator-agent-board-toolbar-active-dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(active?.textContent).toContain(t('tasks.board.activeCount', { n: 2, m: 4 }));
    expect(active?.textContent).toContain('2/4 active');
  });

  it('renders the singular failure caption when a streak exists without a halt', () => {
    const { container } = mountToolbar({
      slots: { used: 1, max: 3 },
      queueState: makeQueue({ consecutiveFailures: 1 }),
    });
    const failure = container.querySelector('.specorator-agent-board-toolbar--queue-failure-count');
    expect(failure?.textContent).toBe('1 failure');
  });

  it('renders the plural failure caption for a multi-failure streak', () => {
    const { container } = mountToolbar({
      slots: { used: 1, max: 3 },
      queueState: makeQueue({ consecutiveFailures: 3 }),
    });
    const failure = container.querySelector('.specorator-agent-board-toolbar--queue-failure-count');
    expect(failure?.textContent).toBe('3 failures');
  });

  it('renders no failure caption when the queue is idle (no halt, zero streak)', () => {
    const { container } = mountToolbar({
      slots: { used: 1, max: 3 },
      queueState: makeQueue({ consecutiveFailures: 0 }),
    });
    expect(container.querySelector('.specorator-agent-board-toolbar--queue-failure-count')).toBeNull();
  });

  it('renders the slot badge with free capacity (no --full) and the tab-count text', () => {
    const { container } = mountToolbar({
      slots: { used: 1, max: 3 },
      queueState: makeQueue(),
    });
    const slots = container.querySelector('.specorator-agent-board-slots');
    expect(slots).toBeTruthy();
    expect(slots?.classList.contains('specorator-agent-board-slots--full')).toBe(false);
    expect(slots?.textContent).toBe(t('tasks.board.tabCount', { n: 1, m: 3, k: 2 }));
  });

  it('marks the slot badge --full when there is no free capacity', () => {
    const { container } = mountToolbar({
      slots: { used: 3, max: 3 },
      queueState: makeQueue(),
    });
    const slots = container.querySelector('.specorator-agent-board-slots');
    expect(slots?.classList.contains('specorator-agent-board-slots--full')).toBe(true);
    expect(slots?.textContent).toBe(t('tasks.board.tabCount', { n: 3, m: 3, k: 0 }));
  });

  it('omits the divider, switch, and queue counters when no queue is projected (parity with the renderer gate)', () => {
    const { container } = mountToolbar({ slots: { used: 0, max: 2 }, queueState: null });
    expect(container.querySelector('.specorator-agent-board-toolbar-divider')).toBeNull();
    expect(container.querySelector('.specorator-agent-board-toolbar-autorun')).toBeNull();
    expect(container.querySelector('.specorator-agent-board-toolbar--queue-active-count')).toBeNull();
    // The slot badge always renders (the imperative creates it unconditionally).
    expect(container.querySelector('.specorator-agent-board-slots')).toBeTruthy();
  });

  it('invokes onToggleAutoRun when the switch is clicked', async () => {
    const callbacks = makeCallbacks();
    const { container } = mountToolbar({ slots: { used: 0, max: 3 }, queueState: makeQueue(), callbacks });
    await fireEvent.click(container.querySelector('.specorator-agent-board-toolbar-autorun') as Element);
    expect(callbacks.onToggleAutoRun).toHaveBeenCalledTimes(1);
  });

  it('wires Add → onAddWorkOrder and shows/clicks Run-next-ready only with a runnable card', async () => {
    const callbacks = makeCallbacks();
    const withRunnable = mountToolbar({
      layout: { lanes: [makeLane('ready', [makeTask('r', 'ready')])], errors: [] },
      slots: { used: 0, max: 3 },
      queueState: makeQueue(),
      callbacks,
    });
    await fireEvent.click(withRunnable.container.querySelector('.specorator-agent-board-toolbar-btn.mod-cta') as Element);
    expect(callbacks.onAddWorkOrder).toHaveBeenCalledTimes(1);
    const runNext = withRunnable.container.querySelector('.specorator-agent-board-toolbar-btn--tool');
    expect(runNext).toBeTruthy();
    await fireEvent.click(runNext as Element);
    expect(callbacks.onRunNextReady).toHaveBeenCalledTimes(1);
  });

  it('hides Run-next-ready when no runnable card exists', () => {
    const { container } = mountToolbar({
      layout: { lanes: [makeLane('running', [makeTask('x', 'running')])], errors: [] },
      slots: { used: 0, max: 3 },
      queueState: makeQueue(),
    });
    expect(container.querySelector('.specorator-agent-board-toolbar-btn--tool')).toBeNull();
    expect(container.querySelector('.specorator-agent-board-toolbar-btn.mod-cta')).toBeTruthy();
  });
});
