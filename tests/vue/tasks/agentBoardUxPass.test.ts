import { fireEvent, render, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedBoardLayout, ResolvedLane } from '@/features/tasks/config/boardConfigTypes';
import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import type { AgentBoardRenderCallbacks } from '@/features/tasks/ui/cardActions';
import AgentBoardRoot from '@/features/tasks/ui/vue/AgentBoardRoot.vue';
import { CALLBACKS_KEY, PLUGIN_KEY } from '@/features/tasks/ui/vue/boardKeys';
import { type BoardLoaderDeps, useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';

// UX-pass surface tests (2026-07-16 spec): card keyboard access + list
// semantics, settled-card age stamps, the toolbar attention chip + focusCard
// jump, lane criteria toggle, empty states, and overflow-menu arrow keys.

// ---- fixtures ---------------------------------------------------------------

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
  return {
    settings: { agentBoardWorkOrderFolder: 'Agent Board/tasks' },
    app: { vault: { on: vi.fn(() => ({})), offref: vi.fn() } },
    events: { on: vi.fn(() => vi.fn()) },
    // Toolbar-chrome singletons load()'s refreshToolbar() reads — required on
    // the loaded-path harness (a missing getTabSlotUsage throws load() out
    // before the layout lands).
    getTabSlotUsage: () => ({ used: 0, max: 3 }),
    queueControl: { paused: true, halted: false, haltReason: null, consecutiveFailures: 0 },
    queueSlotTracker: { occupied: () => 0, capacity: () => 3 },
  } as never;
}

function makeCallbacks(): AgentBoardRenderCallbacks {
  return {
    onOpenDetail: vi.fn(),
    onContextMenu: vi.fn(),
    onAddWorkOrder: vi.fn(),
    onRunNextReady: vi.fn(),
    onToggleLaneCollapse: vi.fn(),
    onMarkReady: vi.fn(),
    onRun: vi.fn(),
    onMoveToInbox: vi.fn(),
    onOpenNote: vi.fn(),
    onArchive: vi.fn(),
    onOpenConversation: vi.fn(),
    canOpenConversation: vi.fn(() => true),
  } as unknown as AgentBoardRenderCallbacks;
}

/** Mount with the layout pre-assigned (the shared board-harness pattern). */
function mountBoard(layout: ResolvedBoardLayout, callbacks = makeCallbacks()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAgentBoardStore();
  store.layout = layout;
  const utils = render(AgentBoardRoot, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: makePlugin(), [CALLBACKS_KEY as symbol]: callbacks },
    },
  });
  return { store, callbacks, ...utils };
}

/** Mount with a scripted loader so the on-mount load() RESOLVES — the empty-
 *  board hero requires a loaded (error-free) layout, which the direct-assign
 *  harness can't produce (its load() rejects against the fake vault). */
function mountBoardLoaded(layout: ResolvedBoardLayout, callbacks = makeCallbacks()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAgentBoardStore();
  const deps: BoardLoaderDeps = {
    indexVaultFolder: () => Promise.resolve({ tasks: [], invalidNotes: [] }),
    loadBoardConfig: vi.fn(() => ({ config: {}, errors: [] })) as unknown as BoardLoaderDeps['loadBoardConfig'],
    resolveBoardLayout: vi.fn(() => layout) as unknown as BoardLoaderDeps['resolveBoardLayout'],
  };
  store.init(makePlugin(), deps);
  const utils = render(AgentBoardRoot, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: makePlugin(), [CALLBACKS_KEY as symbol]: callbacks },
    },
  });
  return { store, callbacks, ...utils };
}

function card(container: HTMLElement, id: string): HTMLElement {
  return container.querySelector(`.specorator-agent-board-card[data-task-id="${id}"]`) as HTMLElement;
}

// ---- tests ------------------------------------------------------------------

describe('card keyboard access + list semantics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the card focusable with listitem semantics and an accessible name', () => {
    const { container } = mountBoard({ lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])], errors: [] });

    const el = card(container as HTMLElement, 'c1');
    expect(el).toBeTruthy();
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('role')).toBe('listitem');
    expect(el.getAttribute('aria-label')).toBe('Title c1 — Ready');

    const list = container.querySelector('.specorator-agent-board-lane-cards');
    expect(list?.getAttribute('role')).toBe('list');
    expect(list?.getAttribute('aria-label')).toBe('Ready');
    expect(list?.contains(el)).toBe(true);
  });

  it('opens the detail on Enter and Space when the card itself is focused', async () => {
    const { container, callbacks } = mountBoard({ lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])], errors: [] });
    const el = card(container as HTMLElement, 'c1');

    await fireEvent.keyDown(el, { key: 'Enter' });
    expect(callbacks.onOpenDetail).toHaveBeenCalledTimes(1);

    await fireEvent.keyDown(el, { key: ' ' });
    expect(callbacks.onOpenDetail).toHaveBeenCalledTimes(2);
  });

  it('does NOT open the detail when Enter bubbles from an inner control', async () => {
    const { container, callbacks } = mountBoard({ lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])], errors: [] });
    const inner = (container as HTMLElement).querySelector('.specorator-agent-board-card-action-more') as HTMLElement;

    await fireEvent.keyDown(inner, { key: 'Enter' });

    expect(callbacks.onOpenDetail).not.toHaveBeenCalled();
  });

  it('opens the context menu on the ContextMenu key and Shift+F10, positioned via a MouseEvent', async () => {
    const { container, callbacks } = mountBoard({ lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])], errors: [] });
    const el = card(container as HTMLElement, 'c1');

    await fireEvent.keyDown(el, { key: 'ContextMenu' });
    expect(callbacks.onContextMenu).toHaveBeenCalledTimes(1);
    const [task, event] = (callbacks.onContextMenu as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(task.frontmatter.id).toBe('c1');
    expect(event).toBeInstanceOf(MouseEvent);

    await fireEvent.keyDown(el, { key: 'F10', shiftKey: true });
    expect(callbacks.onContextMenu).toHaveBeenCalledTimes(2);
    const [, shiftF10Event] = (callbacks.onContextMenu as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(shiftF10Event.type).toBe('contextmenu');
  });
});

describe('settled-card age stamp', () => {
  it('shows "{ago} ago" from frontmatter.updated on a settled card, absolute time on title', () => {
    const updated = new Date(Date.now() - 2 * 3_600_000).toISOString(); // ~2h ago
    const { container } = mountBoard({
      lanes: [makeLane('review', 'Review', [makeTask('c1', 'review', { updated })])],
      errors: [],
    });

    const age = container.querySelector('.specorator-agent-board-card-meta-age');
    expect(age?.textContent?.trim()).toBe('2h ago');
    expect(age?.getAttribute('title')).toBe(new Date(Date.parse(updated)).toLocaleString());
  });

  it('omits the stamp on live cards (the live strip already shows elapsed) and on missing timestamps', () => {
    const updated = new Date(Date.now() - 3_600_000).toISOString();
    const { container } = mountBoard({
      lanes: [
        makeLane('running', 'Running', [makeTask('live', 'running', { updated })]),
        makeLane('inbox', 'Inbox', [makeTask('blank', 'inbox')]), // updated: ''
      ],
      errors: [],
    });

    expect(card(container as HTMLElement, 'live').querySelector('.specorator-agent-board-card-meta-age')).toBeNull();
    expect(card(container as HTMLElement, 'blank').querySelector('.specorator-agent-board-card-meta-age')).toBeNull();
  });
});

describe('toolbar attention chip + focusCard jump', () => {
  beforeEach(() => vi.clearAllMocks());

  const waitingLayout = (): ResolvedBoardLayout => ({
    lanes: [
      makeLane('running', 'Running', [makeTask('r1', 'running')]),
      makeLane('paused', 'Paused', [makeTask('w1', 'needs_input'), makeTask('w2', 'needs_approval')]),
    ],
    errors: [],
  });

  it('renders no chip when nothing waits on the user', () => {
    const { container } = mountBoard({ lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])], errors: [] });
    expect(container.querySelector('.specorator-agent-board-toolbar-attention')).toBeNull();
  });

  it('counts the paused cards (plural label) and cycles focus through them on click', async () => {
    const { container } = mountBoard(waitingLayout());
    const chip = container.querySelector('.specorator-agent-board-toolbar-attention') as HTMLElement;
    expect(chip.textContent).toContain('2 waiting on you');

    await fireEvent.click(chip);
    const first = card(container as HTMLElement, 'w1');
    expect(first.classList.contains('is-attention-target')).toBe(true);
    expect(first.ownerDocument.activeElement).toBe(first);

    await fireEvent.click(chip);
    const second = card(container as HTMLElement, 'w2');
    expect(second.classList.contains('is-attention-target')).toBe(true);
    expect(second.ownerDocument.activeElement).toBe(second);

    // Round-robin wraps back to the first card.
    await fireEvent.click(chip);
    expect(first.ownerDocument.activeElement).toBe(first);
  });

  it('uses the singular label for one waiting card', () => {
    const { container } = mountBoard({
      lanes: [makeLane('paused', 'Paused', [makeTask('w1', 'needs_input')])],
      errors: [],
    });
    const chip = container.querySelector('.specorator-agent-board-toolbar-attention');
    expect(chip?.textContent).toContain('1 waiting on you');
  });

  it('clears the attention flash class after the flash window', async () => {
    vi.useFakeTimers();
    try {
      const { container } = mountBoard(waitingLayout());
      const chip = container.querySelector('.specorator-agent-board-toolbar-attention') as HTMLElement;
      await fireEvent.click(chip);
      const first = card(container as HTMLElement, 'w1');
      expect(first.classList.contains('is-attention-target')).toBe(true);

      vi.advanceTimersByTime(1400);
      expect(first.classList.contains('is-attention-target')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('lane criteria toggle', () => {
  const criteriaLane = (): ResolvedLane =>
    makeLane('ready', 'Ready', [makeTask('c1', 'ready')], {
      definitionOfReady: ['objective written'],
      definitionOfDone: ['tests green'],
    });

  it('starts collapsed: no criteria block, an ⓘ toggle with aria-expanded=false', () => {
    const { container } = mountBoard({ lanes: [criteriaLane()], errors: [] });

    expect(container.querySelector('.specorator-agent-board-lane-criteria')).toBeNull();
    const toggle = container.querySelector('.specorator-agent-board-lane-criteria-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands on click (aria-expanded flips, aria-controls matches the block id) and collapses again', async () => {
    const { container } = mountBoard({ lanes: [criteriaLane()], errors: [] });
    const toggle = container.querySelector('.specorator-agent-board-lane-criteria-toggle') as HTMLElement;

    await fireEvent.click(toggle);
    const block = container.querySelector('.specorator-agent-board-lane-criteria');
    expect(block).toBeTruthy();
    expect(block?.textContent).toContain('objective written');
    expect(block?.textContent).toContain('tests green');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(block?.getAttribute('id'));

    await fireEvent.click(toggle);
    expect(container.querySelector('.specorator-agent-board-lane-criteria')).toBeNull();
  });

  it('renders no toggle on a lane without criteria', () => {
    const { container } = mountBoard({ lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])], errors: [] });
    expect(container.querySelector('.specorator-agent-board-lane-criteria-toggle')).toBeNull();
  });
});

describe('empty states', () => {
  it('shows the empty-lane ghost only on an empty non-host lane of a non-empty board', () => {
    const { container } = mountBoard({
      lanes: [
        makeLane('inbox', 'Inbox', [], { hostsNewWorkOrders: true }),
        makeLane('ready', 'Ready', [makeTask('c1', 'ready')]),
        makeLane('done', 'Done', []),
      ],
      errors: [],
    });

    const ghosts = [...container.querySelectorAll('.specorator-agent-board-lane-empty')];
    expect(ghosts).toHaveLength(1); // Done only: Inbox hosts the add row, Ready has a card
    expect(ghosts[0].textContent?.trim()).toBe('No work orders');
  });

  it('renders the first-run hero on a loaded, error-free board with zero tasks (and no lane ghosts)', async () => {
    const { container, callbacks } = mountBoardLoaded({
      lanes: [makeLane('inbox', 'Inbox', [], { hostsNewWorkOrders: true }), makeLane('done', 'Done', [])],
      errors: [],
    });
    // The on-mount load() resolves asynchronously; the hero appears once it lands.
    const hero = await waitFor(() => {
      const el = container.querySelector('.specorator-agent-board-empty');
      expect(el).toBeTruthy();
      return el;
    });
    expect(hero?.textContent).toContain('No work orders yet');
    expect(hero?.textContent).toContain('Agent Board/tasks'); // the configured folder
    expect(container.querySelector('.specorator-agent-board-lane-empty')).toBeNull();

    await fireEvent.click(hero?.querySelector('.specorator-agent-board-empty-cta') as Element);
    expect(callbacks.onAddWorkOrder).toHaveBeenCalledTimes(1);
  });

  it('hides the hero once any card exists', async () => {
    const { container } = mountBoardLoaded({
      lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])],
      errors: [],
    });
    // Wait for the loaded layout to paint (a card), then assert no hero.
    await waitFor(() => expect(container.querySelector('.specorator-agent-board-card')).toBeTruthy());

    expect(container.querySelector('.specorator-agent-board-empty')).toBeNull();
  });

  it('hides the hero before the first load completes (pre-load EMPTY_LAYOUT has no lanes)', () => {
    const { container } = mountBoard({ lanes: [], errors: [] });
    expect(container.querySelector('.specorator-agent-board-empty')).toBeNull();
  });
});

describe('overflow menu arrow-key navigation', () => {
  function menuItems(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.specorator-agent-board-card-menu-item')];
  }

  async function openMenu(container: HTMLElement): Promise<HTMLElement> {
    await fireEvent.click(container.querySelector('.specorator-agent-board-card-action-more') as Element);
    return document.querySelector('.specorator-agent-board-card-menu') as HTMLElement;
  }

  it('ArrowDown/ArrowUp rove focus across items (wrapping); Home/End jump', async () => {
    const { container } = mountBoard({ lanes: [makeLane('ready', 'Ready', [makeTask('c1', 'ready')])], errors: [] });
    const menu = await openMenu(container as HTMLElement);
    const items = menuItems();
    expect(items.length).toBeGreaterThanOrEqual(2);

    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);

    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    await fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);

    await fireEvent.keyDown(menu, { key: 'ArrowUp' }); // wraps to the end
    expect(document.activeElement).toBe(items[items.length - 1]);

    await fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);

    await fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});
