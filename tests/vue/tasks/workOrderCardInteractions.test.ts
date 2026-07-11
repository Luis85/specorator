import { fireEvent, render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { resolvePersona as realResolvePersona } from '@/features/agents/personaRegistry';
import type { ResolvedBoardLayout, ResolvedLane } from '@/features/tasks/config/boardConfigTypes';
import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import type { AgentBoardRenderCallbacks } from '@/features/tasks/ui/cardActions';
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

function makeLane(id: string, tasks: TaskSpec[]): ResolvedLane {
  return {
    id, title: id, tasks,
    hostsNewWorkOrders: false, definitionOfReady: [], definitionOfDone: [],
    isCatchAll: false, collapsible: false, collapsed: false,
  };
}

function makePlugin() {
  return {
    settings: { agentBoardWorkOrderFolder: 'Agent Board/tasks' },
    app: { vault: { on: vi.fn(() => ({})), offref: vi.fn() } },
    events: { on: vi.fn(() => vi.fn()) },
  } as never;
}

function makeCallbacks(overrides: Partial<AgentBoardRenderCallbacks> = {}): AgentBoardRenderCallbacks {
  return {
    onOpenDetail: vi.fn(),
    onRun: vi.fn(),
    onStop: vi.fn(),
    onAccept: vi.fn(),
    onRework: vi.fn(),
    onMarkReady: vi.fn(),
    onReopen: vi.fn(),
    onMoveToInbox: vi.fn(),
    onAddWorkOrder: vi.fn(),
    onRunNextReady: vi.fn(),
    onContextMenu: vi.fn(),
    onToggleLaneCollapse: vi.fn(),
    onArchive: vi.fn(),
    onOpenNote: vi.fn(),
    onOpenConversation: vi.fn(),
    onReply: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onCancelPaused: vi.fn(),
    onAckSkip: vi.fn(),
    canOpenConversation: vi.fn(() => true),
    ...overrides,
  } as unknown as AgentBoardRenderCallbacks;
}

/** Mount the whole board so a card renders through its real lane/card path.
 *  `seed` mutates the store (pause overlay) before the first render. */
function mountBoard(
  layout: ResolvedBoardLayout,
  callbacks: AgentBoardRenderCallbacks,
  seed?: (store: ReturnType<typeof useAgentBoardStore>) => void,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAgentBoardStore();
  store.layout = layout;
  seed?.(store);
  const utils = render(AgentBoardRoot, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: makePlugin(), [CALLBACKS_KEY as symbol]: callbacks },
    },
  });
  return { store, ...utils };
}

type Container = ReturnType<typeof mountBoard>['container'];

function reply(container: Container): HTMLElement | null {
  return container.querySelector('.specorator-agent-board-card-reply');
}
function footer(container: Container): HTMLElement | null {
  return container.querySelector('.specorator-agent-board-card-footer');
}
function replyField(container: Container): HTMLInputElement {
  return container.querySelector('.specorator-agent-board-card-reply--field') as HTMLInputElement;
}
function replyButtons(container: Container): HTMLButtonElement[] {
  return [...container.querySelectorAll('.specorator-agent-board-card-reply--actions button')] as HTMLButtonElement[];
}

// ---- tests ----------------------------------------------------------------

describe('WorkOrderCard reply surface + skip chip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs_input: renders prompt + input + Send/Stop, wires Send/Enter → onReply and Stop → onCancelPaused, hides the footer, shields the card', async () => {
    const callbacks = makeCallbacks();
    const layout: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('c-ni', 'needs_input')])], errors: [] };
    const { container } = mountBoard(layout, callbacks, (store) =>
      store.setPause('c-ni', { question: 'Q?', runId: 'r1' }),
    );

    const surface = reply(container);
    expect(surface).toBeTruthy();
    expect(surface?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent).toBe('Q?');
    // Prompt renders with the single-paragraph pre-wrap class (parity renderPromptText).
    expect(
      surface?.querySelector('.specorator-agent-board-card-reply-prompt')
        ?.classList.contains('specorator-agent-board-card-reply-prompt--prewrap'),
    ).toBe(true);
    const buttons = replyButtons(container);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Send', 'Stop']);
    // The footer is hidden while the reply surface shows (parity: is-hidden).
    expect(footer(container)?.classList.contains('is-hidden')).toBe(true);

    // Typing + Send → onReply(task, value).
    await fireEvent.update(replyField(container), 'my answer');
    await fireEvent.click(buttons[0]);
    expect(callbacks.onReply).toHaveBeenCalledTimes(1);
    expect((callbacks.onReply as ReturnType<typeof vi.fn>).mock.calls[0][0].frontmatter.id).toBe('c-ni');
    expect((callbacks.onReply as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('my answer');

    // Enter in the field submits (preventDefault).
    await fireEvent.keyDown(replyField(container), { key: 'Enter' });
    expect(callbacks.onReply).toHaveBeenCalledTimes(2);

    // Stop → onCancelPaused (the same callback the imperative reply Stop uses).
    await fireEvent.click(buttons[1]);
    expect(callbacks.onCancelPaused).toHaveBeenCalledTimes(1);
    expect((callbacks.onCancelPaused as ReturnType<typeof vi.fn>).mock.calls[0][0].frontmatter.id).toBe('c-ni');

    // @click.stop: a click inside the reply must not open the card detail.
    await fireEvent.click(surface?.querySelector('.specorator-agent-board-card-reply-prompt') as Element);
    expect(callbacks.onOpenDetail).not.toHaveBeenCalled();
  });

  it('needs_input: re-seeds the input from a pause default that arrives AFTER the surface mounts (status-changed precedes needs-input)', async () => {
    // RunSession emits task:status-changed (which mounts this surface via the
    // status gate, keyed on status not pause) BEFORE task:needs-input, so the
    // surface mounts with pause=null and the default lands a beat later. Without
    // the resync watch the once-seeded ref would miss it and Enter would send an
    // empty reply.
    const layout: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('c-ni', 'needs_input')])], errors: [] };
    const { store, container } = mountBoard(layout, makeCallbacks());
    expect(replyField(container).value).toBe(''); // pause default not yet delivered

    store.setPause('c-ni', { question: 'Q?', defaultValue: 'seed answer', runId: 'r1' });
    await nextTick();

    expect(replyField(container).value).toBe('seed answer');
  });

  it('needs_input: a late pause default does NOT clobber text the user already typed', async () => {
    const layout: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('c-ni', 'needs_input')])], errors: [] };
    const { store, container } = mountBoard(layout, makeCallbacks());

    await fireEvent.update(replyField(container), 'my own words');
    store.setPause('c-ni', { question: 'Q?', defaultValue: 'seed answer', runId: 'r1' });
    await nextTick();

    expect(replyField(container).value).toBe('my own words');
  });

  it('needs_approval: renders prompt + risk + Approve/Reject, wires Approve → onApprove and Reject → onReject(task, reason)', async () => {
    const callbacks = makeCallbacks();
    const layout: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('c-na', 'needs_approval')])], errors: [] };
    const { container } = mountBoard(layout, callbacks, (store) =>
      store.setPause('c-na', { action: 'Delete files', risk: 'irreversible', runId: 'r1' }),
    );

    const surface = reply(container);
    expect(surface?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent).toBe('Delete files');
    expect(surface?.querySelector('.specorator-agent-board-card-reply-risk')?.textContent).toBe('Risk: irreversible');
    const buttons = replyButtons(container);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Approve', 'Reject']);

    await fireEvent.click(buttons[0]);
    expect(callbacks.onApprove).toHaveBeenCalledTimes(1);
    expect((callbacks.onApprove as ReturnType<typeof vi.fn>).mock.calls[0][0].frontmatter.id).toBe('c-na');

    await fireEvent.update(replyField(container), 'not safe');
    await fireEvent.click(buttons[1]);
    expect(callbacks.onReject).toHaveBeenCalledWith(
      expect.objectContaining({ frontmatter: expect.objectContaining({ id: 'c-na' }) }),
      'not safe',
    );
  });

  it('needs_approval: an empty reject reason falls back to the default-reject i18n string', async () => {
    const callbacks = makeCallbacks();
    const layout: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('c-na', 'needs_approval')])], errors: [] };
    const { container } = mountBoard(layout, callbacks, (store) =>
      store.setPause('c-na', { action: 'A', runId: 'r1' }),
    );
    // No risk payload → no risk row.
    expect(reply(container)?.querySelector('.specorator-agent-board-card-reply-risk')).toBeNull();
    await fireEvent.click(replyButtons(container)[1]);
    expect((callbacks.onReject as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('rejected');
  });

  it('reloaded paused card (no live overlay) still renders the reply surface seeded from frontmatter.pause_reason, footer hidden', () => {
    // Parity with renderCard's status-based `showReply`: a needs_input card with
    // no re-fired pause event (e.g. after a reload) must stay ANSWERABLE. The
    // prompt falls back to the note's pause_reason (renderReplySurface:621).
    const layout: ResolvedBoardLayout = {
      lanes: [makeLane('running', [makeTask('c-ni', 'needs_input', { pause_reason: 'Reloaded question?' })])],
      errors: [],
    };
    const { container } = mountBoard(layout, makeCallbacks());
    expect(reply(container)?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent)
      .toBe('Reloaded question?');
    expect(footer(container)?.classList.contains('is-hidden')).toBe(true);
  });

  it('needs_input card with neither a live overlay nor pause_reason shows the generic waiting-for-input fallback', () => {
    const layout: ResolvedBoardLayout = { lanes: [makeLane('running', [makeTask('c-ni', 'needs_input')])], errors: [] };
    const { container } = mountBoard(layout, makeCallbacks());
    expect(reply(container)?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent)
      .toBe('The agent is waiting for your input.');
    expect(footer(container)?.classList.contains('is-hidden')).toBe(true);
  });

  it('reloaded needs_approval card (no live overlay) renders the reply surface seeded from frontmatter.pause_reason', () => {
    const layout: ResolvedBoardLayout = {
      lanes: [makeLane('running', [makeTask('c-na', 'needs_approval', { pause_reason: 'Approve the deploy?' })])],
      errors: [],
    };
    const { container } = mountBoard(layout, makeCallbacks());
    expect(reply(container)?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent)
      .toBe('Approve the deploy?');
    expect(replyButtons(container).map((b) => b.textContent?.trim())).toEqual(['Approve', 'Reject']);
    expect(footer(container)?.classList.contains('is-hidden')).toBe(true);
  });

  it('a live pause overlay set after mount OVERRIDES the seeded prompt (surface already present, status-gated)', async () => {
    const layout: ResolvedBoardLayout = {
      lanes: [makeLane('running', [makeTask('c-ni', 'needs_input', { pause_reason: 'Seeded from note' })])],
      errors: [],
    };
    const { container, store } = mountBoard(layout, makeCallbacks());
    // The surface renders from the start (status-gated), seeded from pause_reason.
    expect(reply(container)?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent)
      .toBe('Seeded from note');
    expect(footer(container)?.classList.contains('is-hidden')).toBe(true);
    // A live overlay then enriches/overrides the prompt in place.
    store.setPause('c-ni', { question: 'Late?', runId: 'r1' });
    await nextTick();
    expect(reply(container)?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent).toBe('Late?');
  });

  it('remounts + re-seeds the reply field on a direct needs_input→needs_approval flip', async () => {
    const layout: ResolvedBoardLayout = {
      lanes: [makeLane('running', [makeTask('c-x', 'needs_input', { pause_reason: 'Question?' })])],
      errors: [],
    };
    const { container, store } = mountBoard(layout, makeCallbacks(), (s) =>
      s.setPause('c-x', { question: 'Question?', defaultValue: 'seed', runId: 'r1' }),
    );
    // needs_input branch, field seeded from the pause default.
    expect(replyButtons(container).map((b) => b.textContent?.trim())).toEqual(['Send', 'Stop']);
    expect(replyField(container).value).toBe('seed');

    // Type into the field, then flip the card straight to needs_approval (same id,
    // both statuses keep showReply true → no v-if remount; only the :key change does).
    await fireEvent.update(replyField(container), 'typed but abandoned');
    store.layout = {
      lanes: [makeLane('running', [makeTask('c-x', 'needs_approval', { pause_reason: 'Approve?' })])],
      errors: [],
    };
    store.setPause('c-x', { action: 'Approve?', runId: 'r1' });
    await nextTick();

    // The surface remounted into the needs_approval branch with a FRESH (empty)
    // field — the typed needs_input text did not carry across the status change.
    expect(replyButtons(container).map((b) => b.textContent?.trim())).toEqual(['Approve', 'Reject']);
    expect(replyField(container).value).toBe('');
    expect(reply(container)?.querySelector('.specorator-agent-board-card-reply-prompt')?.textContent).toBe('Approve?');
  });

  it('skip chip: a store skip overlay renders the host + chip; ack clears the overlay AND calls onAckSkip', async () => {
    const callbacks = makeCallbacks();
    const layout: ResolvedBoardLayout = { lanes: [makeLane('ready', [makeTask('c-r', 'ready')])], errors: [] };
    const { store, container } = mountBoard(layout, callbacks, (s) => s.setSkip('c-r', 'skipped: cap'));

    const host = container.querySelector('.specorator-agent-board-card-skip-host');
    expect(host).toBeTruthy();
    const chip = host?.querySelector('.specorator-agent-board-card-skip-chip');
    expect(chip?.textContent?.trim()).toBe('⊘ Queue skipped: skipped: cap');

    await fireEvent.click(chip as Element);
    // Ack clears the runner's shared skip map via the callback...
    expect(callbacks.onAckSkip).toHaveBeenCalledTimes(1);
    expect((callbacks.onAckSkip as ReturnType<typeof vi.fn>).mock.calls[0][0].frontmatter.id).toBe('c-r');
    // ...AND the reactive overlay, so the chip disappears with NO note change —
    // this is the regression the pre-fix (task-only computed) could not do.
    expect(store.skipReasons.has('c-r')).toBe(false);
    await nextTick();
    expect(container.querySelector('.specorator-agent-board-card-skip-host')).toBeNull();
    // @click.stop: acking the chip must not open the card detail.
    expect(callbacks.onOpenDetail).not.toHaveBeenCalled();
  });

  it('skip chip: an in-session store.setSkip paints the chip (no note change); clearSkip removes it', async () => {
    const layout: ResolvedBoardLayout = { lanes: [makeLane('ready', [makeTask('c-r', 'ready')])], errors: [] };
    const { store, container } = mountBoard(layout, makeCallbacks());
    // No overlay yet → no chip.
    expect(container.querySelector('.specorator-agent-board-card-skip-host')).toBeNull();

    // A skip while the board is mounted (task:queue-skipped → setSkip) paints the
    // chip WITHOUT any change to the work-order note.
    store.setSkip('c-r', 'no free slot');
    await nextTick();
    const chip = container.querySelector('.specorator-agent-board-card-skip-chip');
    expect(chip?.textContent?.trim()).toBe('⊘ Queue skipped: no free slot');

    // The card starting (attempt-started → clearSkip) removes the chip.
    store.clearSkip('c-r');
    await nextTick();
    expect(container.querySelector('.specorator-agent-board-card-skip-host')).toBeNull();
  });

  it('skip chip: no store overlay → no skip host', () => {
    const layout: ResolvedBoardLayout = { lanes: [makeLane('ready', [makeTask('c-r', 'ready')])], errors: [] };
    const { container } = mountBoard(layout, makeCallbacks());
    expect(container.querySelector('.specorator-agent-board-card-skip-host')).toBeNull();
  });
});

describe('WorkOrderCard assignee persona', () => {
  it('re-resolves the persona when the roster version bumps (roster:changed repaint)', async () => {
    // The resolver reads the view's non-reactive roster cache; a rename/recolor
    // fires roster:changed → store.bumpRoster(), which must invalidate this
    // card's persona even though mergeById kept the unchanged task ref.
    const resolvePersona = vi.fn((id?: string) => realResolvePersona(id));
    const callbacks = makeCallbacks({ resolvePersona });
    const layout: ResolvedBoardLayout = {
      lanes: [makeLane('ready', [makeTask('c-a', 'ready', { agent: 'roster:alice' })])],
      errors: [],
    };
    const { store } = mountBoard(layout, callbacks);
    const before = resolvePersona.mock.calls.length;
    expect(before).toBeGreaterThan(0); // resolved on first render
    store.bumpRoster();
    await nextTick();
    expect(resolvePersona.mock.calls.length).toBeGreaterThan(before);
  });
});
