import { render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type { ResolvedBoardLayout, ResolvedLane } from '@/features/tasks/config/boardConfigTypes';
import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import type { AgentBoardRenderCallbacks } from '@/features/tasks/ui/agentBoardCardActions';
import AgentBoardRoot from '@/features/tasks/ui/vue/AgentBoardRoot.vue';
import { CALLBACKS_KEY, PLUGIN_KEY } from '@/features/tasks/ui/vue/boardKeys';
import { useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';

/**
 * Agent Board Vue-surface scaling + isolation guard rails (the blocking perf
 * gate after the Task 5b cutover).
 *
 * The imperative renderer's Jest perf spec (`tests/perf/agentBoard.perf.test.ts`)
 * was deleted with the renderer: the Jest lane stubs `.vue` (jest.base.config.js
 * moduleNameMapper), so it can no longer mount the board. Only the Vitest lane
 * compiles SFCs, so the board's perf gate lives here — and `npm run test:vue`
 * (the CI `component` job) is a blocking gate, so the coverage is preserved.
 *
 * Like the deleted spec, these are SCALING / STRUCTURE assertions, never
 * wall-clock timings, so they stay stable on noisy shared runners:
 *
 *   (a) mounted DOM nodes + element listeners stay O(rendered cards): the
 *       per-card cost is flat, so a bigger board is linear, never super-linear.
 *   (b) a single `store.recordHeartbeat` re-renders ONLY the affected card's
 *       LiveStrip — the board root, sibling cards, lanes, and toolbar do not
 *       re-render (the O(1)-in-live-cards heartbeat boundary).
 */

function makeTask(id: string, status: TaskStatus): TaskSpec {
  return {
    path: `Agent Board/tasks/${id}.md`,
    frontmatter: {
      type: 'specorator-work-order',
      schema_version: 1,
      id,
      title: `Work order ${id}`,
      status,
      priority: '2 - normal',
      created: '2026-06-01T00:00:00Z',
      updated: '2026-06-01T00:00:00Z',
      provider: 'claude',
      model: 'claude-sonnet-4-5',
      attempts: 1,
      ...(status === 'running'
        ? { started: '2026-06-01T00:00:00Z', heartbeat: '2026-06-01T00:00:30Z', run_id: `run-${id}` }
        : {}),
    },
    sections: {
      objective: 'Do the thing',
      acceptanceCriteria: '- [x] first\n- [ ] second',
      context: '',
      constraints: '',
      ledger: status === 'running' ? '- 2026-06-01T00:00:30Z [running] working…' : '',
      handoff: '',
    },
    body: '',
    raw: '',
  } as TaskSpec;
}

const LANE_STATUSES: TaskStatus[] = ['inbox', 'ready', 'running', 'review', 'done'];

function makeLane(status: TaskStatus, tasks: TaskSpec[]): ResolvedLane {
  return {
    id: status,
    title: status,
    tasks,
    hostsNewWorkOrders: status === 'inbox',
    definitionOfReady: [],
    definitionOfDone: [],
    isCatchAll: false,
    collapsible: false,
    collapsed: false,
  };
}

/** N cards spread round-robin over the five standard lanes (status matches lane). */
function makeLayout(total: number): ResolvedBoardLayout {
  const byLane = new Map<TaskStatus, TaskSpec[]>(LANE_STATUSES.map((s) => [s, []]));
  for (let i = 0; i < total; i++) {
    const status = LANE_STATUSES[i % LANE_STATUSES.length];
    byLane.get(status)!.push(makeTask(`t${i}`, status));
  }
  return { lanes: LANE_STATUSES.map((s) => makeLane(s, byLane.get(s)!)), errors: [] };
}

function makePlugin() {
  // events.on returns a disposer, vault.on returns an opaque EventRef — the exact
  // contract useBoardEventRouting subscribes on mount. No getTabSlotUsage: the
  // on-mount load() throws early (caught by AgentBoardRoot's fire-and-forget
  // `.catch`), so the manually-seeded `store.layout` stands for the assertion.
  return {
    settings: { agentBoardWorkOrderFolder: 'Agent Board/tasks' },
    app: { vault: { on: vi.fn(() => ({})), offref: vi.fn() } },
    events: { on: vi.fn(() => vi.fn()) },
  } as never;
}

function makeCallbacks(): AgentBoardRenderCallbacks {
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
 *  tagged with its SFC name + the task/lane id it renders — the render-counter
 *  technique from boardComponents.test.ts. */
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

function mountBoard(layout: ResolvedBoardLayout, log?: RenderEntry[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAgentBoardStore();
  store.layout = layout;
  const utils = render(AgentBoardRoot, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: makePlugin(), [CALLBACKS_KEY as symbol]: makeCallbacks() },
      mixins: log ? [renderTracker(log)] : [],
    },
  });
  return { store, ...utils };
}

describe('Agent Board Vue scaling', () => {
  beforeEach(() => vi.clearAllMocks());

  // Explicit generous timeout: this is a BLOCKING gate that also runs under v8
  // coverage in CI (slower) and shares the full parallel Vitest lane — the default
  // 5000ms flaked there. The assertion is pure scaling/structure (never wall-clock),
  // so a large timeout can't mask a regression; it only removes the flake risk.
  it('keeps per-card DOM and element-listener cost flat as the board grows', () => {
    // Top scale trimmed 400 → 200 to bound the heaviest mount while keeping the
    // per-card-bound + ~linear assertions meaningful (factor 10 across [20, 200]).
    const SCALES = [20, 100, 200];
    const metrics = SCALES.map((n) => {
      // Count element listeners registered during THIS mount only. Menus are
      // closed on mount (OverflowMenu is v-if'd), the clock uses setInterval, and
      // the routing composable subscribes on plugin.events / the mocked vault —
      // none of which touch HTMLElement.addEventListener — so the spy captures the
      // card/lane/toolbar DOM handlers, the axis that must scale with cards.
      const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
      const { container } = mountBoard(makeLayout(n));
      const listeners = addSpy.mock.calls.length;
      addSpy.mockRestore();
      const cards = container.querySelectorAll('.specorator-agent-board-card').length;
      const nodes = container.querySelectorAll('*').length;
      return { n, cards, nodes, listeners };
    });

    // Every card mounts (the board has no render window today — this documents it).
    for (const m of metrics) expect(m.cards).toBe(m.n);

    const small = metrics[0];
    const large = metrics[metrics.length - 1];

    // Per-card cost must be flat: amortized nodes/listeners per card cannot grow
    // with board size (fixed toolbar/lane overhead only shrinks per-card as N grows).
    expect(large.nodes / large.cards).toBeLessThanOrEqual(small.nodes / small.cards + 1);
    expect(large.listeners / large.cards).toBeLessThanOrEqual(small.listeners / small.cards + 0.5);

    // Absolute totals stay ~linear — a 10x board must not cost super-linearly more.
    const factor = large.n / small.n;
    expect(large.nodes).toBeLessThan(small.nodes * factor * 1.25);
    expect(large.listeners).toBeLessThan(small.listeners * factor * 1.25);
  }, 30_000);

  it('PERF: a heartbeat re-renders only that card\'s LiveStrip — not the peer strip, card, lane, or root', async () => {
    // Fake timers so the 1s board clock can't auto-fire mid-assertion (a tick is a
    // separate axis that re-renders ALL live strips — its own gate elsewhere).
    vi.useFakeTimers();
    try {
      const log: RenderEntry[] = [];
      const layout: ResolvedBoardLayout = {
        lanes: [makeLane('running', [makeTask('c-a', 'running'), makeTask('c-b', 'running')])],
        errors: [],
      };
      const { store, container } = mountBoard(layout, log);
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
  }, 30_000);
});
