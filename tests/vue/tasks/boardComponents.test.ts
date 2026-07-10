import { fireEvent, render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type { ResolvedBoardLayout, ResolvedLane } from '@/features/tasks/config/boardConfigTypes';
import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import type { AgentBoardRenderCallbacks } from '@/features/tasks/ui/AgentBoardRenderer';
import AgentBoardRoot from '@/features/tasks/ui/vue/AgentBoardRoot.vue';
import { CALLBACKS_KEY, PLUGIN_KEY } from '@/features/tasks/ui/vue/boardKeys';
import { useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';

// ---- fixtures -------------------------------------------------------------

function makeTask(id: string, status: TaskStatus, overrides: Partial<TaskSpec['frontmatter']> = {}): TaskSpec {
  return {
    path: `Agent Board/tasks/${id}.md`,
    frontmatter: {
      type: 'specorator-work-order',
      schema_version: 1,
      id,
      title: `Title ${id}`,
      status,
      priority: '2 - normal',
      created: '',
      updated: '',
      attempts: 1,
      ...overrides,
    },
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger: '', handoff: '' },
    body: '',
    raw: '',
  } as TaskSpec;
}

function makeLane(id: string, title: string, tasks: TaskSpec[], overrides: Partial<ResolvedLane> = {}): ResolvedLane {
  return {
    id,
    title,
    tasks,
    hostsNewWorkOrders: false,
    definitionOfReady: [],
    definitionOfDone: [],
    isCatchAll: false,
    collapsible: false,
    collapsed: false,
    ...overrides,
  };
}

function makePlugin() {
  // events.on returns a disposer, vault.on returns an opaque EventRef — the
  // exact contract useBoardEventRouting subscribes on mount.
  return {
    settings: { agentBoardWorkOrderFolder: 'Agent Board/tasks' },
    app: { vault: { on: vi.fn(() => ({})), offref: vi.fn() } },
    events: { on: vi.fn(() => vi.fn()) },
  } as never;
}

function makeCallbacks(): AgentBoardRenderCallbacks {
  // Only the callbacks the structural components invoke this task (the action
  // cluster / reply surface are Task 4); the rest are absent (cast-through).
  return {
    onOpenDetail: vi.fn(),
    onContextMenu: vi.fn(),
    onAddWorkOrder: vi.fn(),
    onRunNextReady: vi.fn(),
    onToggleLaneCollapse: vi.fn(),
  } as unknown as AgentBoardRenderCallbacks;
}

interface RenderEntry {
  name: string;
  id?: string;
}

/** Global mixin: logs every component instance that re-renders (updated hook),
 *  tagged with its SFC name + the task/lane id it renders. The perf-isolation
 *  test reads it to prove a heartbeat touches ONLY the affected LiveStrip. */
function renderTracker(log: RenderEntry[]) {
  return {
    updated(this: unknown) {
      const inst = this as { $: { type: { __name?: string; name?: string } }; $props?: Record<string, unknown> };
      const props = inst.$props ?? {};
      const task = props.task as TaskSpec | undefined;
      const lane = props.lane as ResolvedLane | undefined;
      log.push({ name: inst.$.type.__name ?? inst.$.type.name ?? 'unknown', id: task?.frontmatter.id ?? lane?.id });
    },
  };
}

function mountBoard(layout: ResolvedBoardLayout, callbacks: AgentBoardRenderCallbacks, log?: RenderEntry[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAgentBoardStore();
  store.layout = layout;
  const utils = render(AgentBoardRoot, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: makePlugin(), [CALLBACKS_KEY as symbol]: callbacks },
      mixins: log ? [renderTracker(log)] : [],
    },
  });
  return { store, ...utils };
}

function structuralLayout(): ResolvedBoardLayout {
  return {
    lanes: [
      makeLane(
        'inbox',
        'Inbox',
        [makeTask('c-inbox', 'inbox'), makeTask('c-ready', 'ready'), makeTask('c-running', 'running')],
        { hostsNewWorkOrders: true, collapsible: true },
      ),
      makeLane('archive', 'Archive', [makeTask('c-done', 'done')], { collapsible: true, collapsed: true }),
    ],
    errors: [],
  };
}

// ---- tests ----------------------------------------------------------------

describe('Agent Board Vue components', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the board shell: root, toolbar, lanes, and one lane per layout lane', () => {
    const { container } = mountBoard(structuralLayout(), makeCallbacks());
    expect(container.querySelector('.specorator-agent-board')).toBeTruthy();
    expect(container.querySelector('.specorator-agent-board-toolbar')).toBeTruthy();
    expect(container.querySelector('.specorator-agent-board-toolbar-info')).toBeTruthy();
    expect(container.querySelector('.specorator-agent-board-lanes')).toBeTruthy();
    // The expanded Inbox lane + the collapsed Archive lane both carry the base class.
    expect(container.querySelectorAll('.specorator-agent-board-lane').length).toBe(2);
  });

  it('renders lane title + count and hosts the add-work-order row only on the hosting lane', () => {
    const { container } = mountBoard(structuralLayout(), makeCallbacks());
    const inbox = container.querySelector('.specorator-agent-board-lane:not(.specorator-agent-board-lane--collapsed)');
    expect(inbox?.querySelector('.specorator-agent-board-lane-title')?.textContent).toBe('Inbox');
    expect(inbox?.querySelector('.specorator-agent-board-lane-count')?.textContent).toBe('3');
    // Exactly one add row across the board, and it lives on the hosting Inbox lane.
    const addRows = container.querySelectorAll('.specorator-agent-board-lane-add');
    expect(addRows.length).toBe(1);
    expect(inbox?.querySelector('.specorator-agent-board-lane-add')).toBeTruthy();
  });

  it('renders a collapsed lane as a role=button strip (aria-expanded=false, tabindex=0)', () => {
    const { container } = mountBoard(structuralLayout(), makeCallbacks());
    const collapsed = container.querySelector('.specorator-agent-board-lane--collapsed');
    expect(collapsed).toBeTruthy();
    expect(collapsed?.getAttribute('role')).toBe('button');
    expect(collapsed?.getAttribute('aria-expanded')).toBe('false');
    expect(collapsed?.getAttribute('tabindex')).toBe('0');
    expect(collapsed?.querySelector('.specorator-agent-board-lane-title-vertical')?.textContent).toBe('Archive');
    expect(collapsed?.querySelector('.specorator-agent-board-lane-count')?.textContent).toBe('1');
    expect(collapsed?.querySelector('.specorator-agent-board-lane-collapsed-chevron')?.getAttribute('data-icon'))
      .toBe('chevron-right');
  });

  it('renders a ready (non-live) card: status modifier + non-live dot, no action-persistence, no live strip', () => {
    const { container } = mountBoard(structuralLayout(), makeCallbacks());
    const card = container.querySelector('.specorator-agent-board-card--ready');
    expect(card).toBeTruthy();
    expect(card?.classList.contains('specorator-agent-board-card--live-actions')).toBe(false);
    const dot = card?.querySelector('.specorator-agent-board-card-status-dot');
    expect(dot?.classList.contains('specorator-agent-board-card-status-dot--ready')).toBe(true);
    expect(dot?.classList.contains('specorator-agent-board-card-status-dot--live')).toBe(false);
    expect(dot?.getAttribute('aria-label')).toBe('Ready');
    expect(dot?.getAttribute('title')).toBe('Ready');
    expect(card?.querySelector('.specorator-agent-board-card-live-strip')).toBeNull();
    // The action cluster placeholder exists but is empty and NOT persistent.
    const actions = card?.querySelector('.specorator-agent-board-card-actions');
    expect(actions).toBeTruthy();
    expect(actions?.classList.contains('specorator-agent-board-card-actions--persistent')).toBe(false);
    expect(actions?.childElementCount).toBe(0);
    expect(card?.querySelector('.specorator-agent-board-card-title')?.textContent).toBe('Title c-ready');
  });

  it('renders a running (live) card: live-actions, live dot, persistent empty cluster, and a live strip', () => {
    const { container } = mountBoard(structuralLayout(), makeCallbacks());
    const card = container.querySelector('.specorator-agent-board-card--running');
    expect(card?.classList.contains('specorator-agent-board-card--live-actions')).toBe(true);
    const dot = card?.querySelector('.specorator-agent-board-card-status-dot');
    expect(dot?.classList.contains('specorator-agent-board-card-status-dot--running')).toBe(true);
    expect(dot?.classList.contains('specorator-agent-board-card-status-dot--live')).toBe(true);
    const actions = card?.querySelector('.specorator-agent-board-card-actions');
    expect(actions?.classList.contains('specorator-agent-board-card-actions--persistent')).toBe(true);
    expect(actions?.childElementCount).toBe(0);
    const strip = card?.querySelector('.specorator-agent-board-card-live-strip');
    expect(strip).toBeTruthy();
    expect(strip?.querySelector('.specorator-agent-board-card-live-strip--dot')).toBeTruthy();
    expect(strip?.querySelector('.specorator-agent-board-card-live-strip--caption')).toBeTruthy();
    expect(strip?.querySelector('.specorator-agent-board-card-live-strip--ledger')).toBeTruthy();
  });

  it('renders the meta row (engine + priority bars) and footer (progress + assignee)', async () => {
    const layout: ResolvedBoardLayout = {
      lanes: [
        makeLane('inbox', 'Inbox', [
          makeTask('c-ready', 'ready', {
            provider: 'claude',
            model: 'opus',
            priority: '0 - urgent',
          }),
        ]),
      ],
      errors: [],
    };
    // Two of two acceptance items done → the footer shows a complete progress bar.
    layout.lanes[0].tasks[0].sections.acceptanceCriteria = '- [x] one\n- [x] two';
    const { container } = mountBoard(layout, makeCallbacks());
    const card = container.querySelector('.specorator-agent-board-card--ready');
    expect(card?.querySelector('.specorator-agent-board-card-meta-engine')?.textContent).toBe('claude / opus');
    const priority = card?.querySelector('.specorator-agent-board-card-priority');
    expect(priority?.classList.contains('specorator-agent-board-card-priority--urgent')).toBe(true);
    expect(priority?.querySelectorAll('.specorator-agent-board-card-priority-bar').length).toBe(3);
    expect(priority?.querySelectorAll('.specorator-agent-board-card-priority-bar.is-filled').length).toBe(3);
    expect(priority?.querySelector('.specorator-agent-board-card-priority-label')?.textContent).toBe('0 - urgent');
    const progress = card?.querySelector('.specorator-agent-board-card-progress');
    expect(progress?.classList.contains('is-complete')).toBe(true);
    expect(progress?.querySelector('.specorator-agent-board-card-progress-count')?.textContent).toBe('2/2');
    // Assignee avatar host + the mounted persona avatar inside it (the imperative
    // renderAgentAvatar mounts via a watchEffect that flushes post-mount).
    await nextTick();
    const assignee = card?.querySelector('.specorator-agent-board-card-assignee');
    expect(assignee?.querySelector('.specorator-agent-avatar')).toBeTruthy();
  });

  it('renders the footer spacer (no progress bar) when there are no acceptance items', () => {
    const layout: ResolvedBoardLayout = {
      lanes: [makeLane('inbox', 'Inbox', [makeTask('c-ready', 'ready')])],
      errors: [],
    };
    const { container } = mountBoard(layout, makeCallbacks());
    const card = container.querySelector('.specorator-agent-board-card--ready');
    expect(card?.querySelector('.specorator-agent-board-card-progress')).toBeNull();
    expect(card?.querySelector('.specorator-agent-board-card-footer-spacer')).toBeTruthy();
  });

  it('shows Run-next-ready only when a runnable card exists', () => {
    const runnable = mountBoard(structuralLayout(), makeCallbacks());
    expect(runnable.container.querySelector('.specorator-agent-board-toolbar-btn--tool')).toBeTruthy();

    const noRunnable = mountBoard(
      { lanes: [makeLane('running', 'Running', [makeTask('c-running', 'running')])], errors: [] },
      makeCallbacks(),
    );
    expect(noRunnable.container.querySelector('.specorator-agent-board-toolbar-btn--tool')).toBeNull();
    expect(noRunnable.container.querySelector('.specorator-agent-board-toolbar-btn.mod-cta')).toBeTruthy();
  });

  it('renders the board-notices errors block (truncated + full title) only when the layout has errors', () => {
    const long = 'x'.repeat(400);
    const { container } = mountBoard(
      { lanes: [], errors: [long] },
      makeCallbacks(),
    );
    const errors = container.querySelector('.specorator-agent-board-errors');
    expect(errors).toBeTruthy();
    expect(errors?.querySelector('h4')?.textContent).toBe('Board notices');
    const line = errors?.querySelector('div');
    expect(line?.getAttribute('title')).toBe(long);
    expect(line?.textContent?.length).toBe(300);
    expect(line?.textContent?.endsWith('…')).toBe(true);
  });

  it('wires card click → onOpenDetail(task), toolbar/inbox add → onAddWorkOrder, run-next → onRunNextReady', async () => {
    const callbacks = makeCallbacks();
    const { container } = mountBoard(structuralLayout(), callbacks);

    await fireEvent.click(container.querySelector('.specorator-agent-board-card--ready') as Element);
    expect(callbacks.onOpenDetail).toHaveBeenCalledTimes(1);
    expect((callbacks.onOpenDetail as ReturnType<typeof vi.fn>).mock.calls[0][0].frontmatter.id).toBe('c-ready');

    await fireEvent.click(container.querySelector('.specorator-agent-board-toolbar-btn.mod-cta') as Element);
    expect(callbacks.onAddWorkOrder).toHaveBeenCalledTimes(1);
    await fireEvent.click(container.querySelector('.specorator-agent-board-lane-add') as Element);
    expect(callbacks.onAddWorkOrder).toHaveBeenCalledTimes(2);

    await fireEvent.click(container.querySelector('.specorator-agent-board-toolbar-btn--tool') as Element);
    expect(callbacks.onRunNextReady).toHaveBeenCalledTimes(1);
  });

  it('wires the collapsed strip and the header toggle to onToggleLaneCollapse(laneId)', async () => {
    const callbacks = makeCallbacks();
    const { container } = mountBoard(structuralLayout(), callbacks);
    const toggle = callbacks.onToggleLaneCollapse as ReturnType<typeof vi.fn>;

    await fireEvent.click(container.querySelector('.specorator-agent-board-lane--collapsed') as Element);
    expect(toggle).toHaveBeenLastCalledWith('archive');

    await fireEvent.click(container.querySelector('.specorator-agent-board-lane-collapse-toggle') as Element);
    expect(toggle).toHaveBeenLastCalledWith('inbox');
  });

  it('activates the collapsed strip on Enter and Space (keyboard parity)', async () => {
    const callbacks = makeCallbacks();
    const { container } = mountBoard(structuralLayout(), callbacks);
    const strip = container.querySelector('.specorator-agent-board-lane--collapsed') as Element;
    await fireEvent.keyDown(strip, { key: 'Enter' });
    await fireEvent.keyDown(strip, { key: ' ' });
    expect((callbacks.onToggleLaneCollapse as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]))
      .toEqual(['archive', 'archive']);
  });

  it('PERF: a heartbeat re-renders only that card\'s LiveStrip — not the peer strip, card, lane, or root', async () => {
    // Fake timers so the 1s board clock can't auto-fire mid-assertion (a tick is
    // a separate axis that re-renders ALL live strips — asserted below).
    vi.useFakeTimers();
    try {
      const log: RenderEntry[] = [];
      const layout: ResolvedBoardLayout = {
        lanes: [makeLane('running', 'Running', [makeTask('c-a', 'running'), makeTask('c-b', 'running')])],
        errors: [],
      };
      const { store, container } = mountBoard(layout, makeCallbacks(), log);
      await nextTick();
      // Two live strips mounted.
      expect(container.querySelectorAll('.specorator-agent-board-card-live-strip').length).toBe(2);

      log.length = 0;
      // An old heartbeat forces c-a's strip from fresh (green) to very stale (red),
      // guaranteeing a visible re-render if — and only if — c-a's strip recomputed.
      store.recordHeartbeat('c-a', '2020-01-01T00:00:00.000Z');
      await nextTick();

      expect(log.length).toBeGreaterThan(0);
      // Every re-render was c-a's LiveStrip; nothing else in the tree re-rendered.
      expect(log.every((entry) => entry.name === 'LiveStrip' && entry.id === 'c-a')).toBe(true);
      expect(log.some((entry) => entry.id === 'c-b')).toBe(false);
      for (const structural of ['WorkOrderCard', 'BoardLane', 'BoardToolbar', 'AgentBoardRoot']) {
        expect(log.some((entry) => entry.name === structural)).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('CLOCK: a store.tick() escalates the freshness dot (green→red) on a hung run with no new heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const base = Date.parse('2026-06-06T00:00:00.000Z');
      vi.setSystemTime(base);
      const iso = new Date(base).toISOString();
      const layout: ResolvedBoardLayout = {
        lanes: [makeLane('running', 'Running', [makeTask('c-a', 'running', { heartbeat: iso, started: iso })])],
        errors: [],
      };
      const { store, container } = mountBoard(layout, makeCallbacks());
      await nextTick();
      const dot = () => container.querySelector('.specorator-agent-board-card-live-strip--dot');
      expect(dot()?.classList.contains('specorator-stale-green')).toBe(true);

      // Advance the wall clock 6 minutes and tick — NO new heartbeat recorded.
      vi.setSystemTime(base + 360_000);
      store.tick();
      await nextTick();
      expect(dot()?.classList.contains('specorator-stale-red')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CLOCK: the root owns a 1s tick interval that stops on unmount (no leak)', () => {
    vi.useFakeTimers();
    try {
      const layout: ResolvedBoardLayout = {
        lanes: [makeLane('running', 'Running', [makeTask('c-a', 'running')])],
        errors: [],
      };
      const { store, unmount } = mountBoard(layout, makeCallbacks());
      const tick = vi.spyOn(store, 'tick');
      vi.advanceTimersByTime(1000);
      expect(tick).toHaveBeenCalledTimes(1); // one tick while mounted
      unmount();
      vi.advanceTimersByTime(5000);
      expect(tick).toHaveBeenCalledTimes(1); // interval cleared — no further ticks
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the "Skipped notes" block from store.invalidNotes (parity with renderErrors)', async () => {
    const { store, container } = mountBoard({ lanes: [], errors: [] }, makeCallbacks());
    store.invalidNotes = [{ path: 'Agent Board/tasks/broken.md', error: 'bad frontmatter' }];
    await nextTick();
    const errors = container.querySelector('.specorator-agent-board-errors');
    // The errors host renders once invalidNotes is non-empty even with no board notices.
    expect(container.querySelectorAll('.specorator-agent-board-errors h4').length).toBe(1);
    const heading = errors?.querySelector('h4');
    expect(heading?.textContent).toBe('Skipped notes');
    const line = errors?.querySelector('div');
    expect(line?.getAttribute('title')).toBe('Agent Board/tasks/broken.md: bad frontmatter');
    expect(line?.textContent).toBe('Agent Board/tasks/broken.md: bad frontmatter');
  });
});
