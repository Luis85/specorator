import { fireEvent, render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import type { TaskSpec, TaskStatus } from '@/features/tasks/model/taskTypes';
import type { AgentBoardRenderCallbacks } from '@/features/tasks/ui/AgentBoardRenderer';
import { CALLBACKS_KEY } from '@/features/tasks/ui/vue/boardKeys';
import CardActionCluster from '@/features/tasks/ui/vue/components/CardActionCluster.vue';

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

function makeCallbacks(): AgentBoardRenderCallbacks {
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
    onSendToReview: vi.fn(),
    onMarkFailed: vi.fn(),
    canOpenConversation: vi.fn(() => true),
  };
}

/**
 * Mount a single CardActionCluster inside a `.specorator-agent-board-card`
 * ancestor whose click routes to a `cardClick` spy — the minimum context the
 * cluster needs: the card element for `closest()`/`is-menu-open`, and a
 * card-body handler to prove the cluster's `@click.stop` shields it.
 */
function mountCluster(status: TaskStatus, overrides: Partial<TaskSpec['frontmatter']> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const task = makeTask('c1', status, overrides);
  const callbacks = makeCallbacks();
  const cardClick = vi.fn();
  const Harness = defineComponent({
    setup() {
      return () =>
        h('div', { class: 'specorator-agent-board-card', onClick: () => cardClick(task) }, [
          h(CardActionCluster, { task, status }),
        ]);
    },
  });
  const utils = render(Harness, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: callbacks } },
  });
  return { task, callbacks, cardClick, ...utils };
}

type Container = ReturnType<typeof mountCluster>['container'];

function cardOf(container: Container): HTMLElement | null {
  return container.querySelector('.specorator-agent-board-card');
}
function moreButton(container: Container): Element {
  return container.querySelector('.specorator-agent-board-card-action-more') as Element;
}
function bodyMenus(): NodeListOf<Element> {
  return document.body.querySelectorAll('.specorator-agent-board-card-menu');
}
function menuItemLabels(): Array<string | undefined> {
  return [...document.body.querySelectorAll('.specorator-agent-board-card-menu-item')].map((b) =>
    b.textContent?.trim(),
  );
}
function primaryLabel(container: Container): string | undefined {
  return container
    .querySelector('.specorator-agent-board-card-action-primary .specorator-agent-board-card-action-label')
    ?.textContent ?? undefined;
}
function secondaryLabel(container: Container): string | undefined {
  return container
    .querySelector('.specorator-agent-board-card-action-secondary .specorator-agent-board-card-action-label')
    ?.textContent ?? undefined;
}
async function openMenu(container: Container): Promise<void> {
  await fireEvent.click(moreButton(container));
  await nextTick();
}

// ---- tests ----------------------------------------------------------------

describe('CardActionCluster', () => {
  beforeEach(() => vi.clearAllMocks());

  // 1. Per-status parity with the CARD_ACTIONS spec table.
  const STATUS_CASES: Array<{
    status: TaskStatus;
    primary: { label: string; variant: 'cta' | 'danger' | 'ghost' } | null;
    secondary?: string;
    menu: string[];
  }> = [
    { status: 'inbox', primary: { label: 'Mark ready', variant: 'cta' }, menu: ['Open note', 'Archive'] },
    { status: 'ready', primary: { label: 'Run', variant: 'cta' }, menu: ['Open note', 'Back to inbox'] },
    // needs_fix mirrors ready (both restored from the pre-cluster recovery actions).
    { status: 'needs_fix', primary: { label: 'Run', variant: 'cta' }, menu: ['Open note', 'Back to inbox'] },
    {
      status: 'running',
      primary: { label: 'Stop', variant: 'danger' },
      secondary: 'Go to conversation',
      menu: ['Open note'],
    },
    { status: 'needs_input', primary: null, menu: ['Open note', 'Open conversation', 'Stop'] },
    // needs_approval mirrors needs_input.
    { status: 'needs_approval', primary: null, menu: ['Open note', 'Open conversation', 'Stop'] },
    {
      status: 'review',
      primary: { label: 'Accept', variant: 'cta' },
      menu: ['Rework', 'Open note', 'Open conversation', 'Back to inbox'],
    },
    { status: 'needs_handoff', primary: { label: 'Send to review', variant: 'cta' }, menu: ['Mark failed', 'Open note'] },
    { status: 'done', primary: { label: 'Reopen', variant: 'ghost' }, menu: ['Open note', 'Archive'] },
    { status: 'failed', primary: { label: 'Retry', variant: 'cta' }, menu: ['Open note', 'Archive'] },
    // canceled mirrors failed.
    { status: 'canceled', primary: { label: 'Retry', variant: 'cta' }, menu: ['Open note', 'Archive'] },
  ];

  it.each(STATUS_CASES)(
    'renders the $status primary + secondary + ⋯ menu from CARD_ACTIONS',
    async ({ status, primary, secondary, menu }) => {
      // conversation_id present so the conversation-gated actions surface.
      const { container } = mountCluster(status, { conversation_id: 'conv-1' });
      const primaryBtn = container.querySelector('.specorator-agent-board-card-action-primary');
      if (primary) {
        expect(primaryBtn).toBeTruthy();
        expect(
          primaryBtn?.classList.contains(`specorator-agent-board-card-action-primary--${primary.variant}`),
        ).toBe(true);
        expect(primaryLabel(container)).toBe(primary.label);
      } else {
        expect(primaryBtn).toBeNull();
      }

      if (secondary) expect(secondaryLabel(container)).toBe(secondary);
      else expect(container.querySelector('.specorator-agent-board-card-action-secondary')).toBeNull();

      await openMenu(container);
      expect(menuItemLabels()).toEqual(menu);
    },
  );

  it('marks the cluster persistent only for live statuses', () => {
    expect(
      cardOf(mountCluster('ready').container)
        ?.querySelector('.specorator-agent-board-card-actions')
        ?.classList.contains('specorator-agent-board-card-actions--persistent'),
    ).toBe(false);
    expect(
      cardOf(mountCluster('running').container)
        ?.querySelector('.specorator-agent-board-card-actions')
        ?.classList.contains('specorator-agent-board-card-actions--persistent'),
    ).toBe(true);
  });

  // 2. `available` gating — secondary at render time, menu item at open time.
  it('gates the secondary "Go to conversation" on a resolvable conversation_id (render time)', () => {
    expect(mountCluster('running').container.querySelector('.specorator-agent-board-card-action-secondary')).toBeNull();
    expect(secondaryLabel(mountCluster('running', { conversation_id: 'conv-1' }).container)).toBe('Go to conversation');
  });

  it('gates the menu "Open conversation" on a resolvable conversation_id (open time)', async () => {
    const without = mountCluster('needs_input');
    await openMenu(without.container);
    expect(menuItemLabels()).toEqual(['Open note', 'Stop']);

    // Opening B's menu closes A's (singleton), so only B's items remain in body.
    const withConv = mountCluster('needs_input', { conversation_id: 'conv-1' });
    await openMenu(withConv.container);
    expect(menuItemLabels()).toEqual(['Open note', 'Open conversation', 'Stop']);
  });

  // 3. Late-bound callbacks + the cluster's @click.stop shielding the card body.
  it('routes a primary click to the injected callback with the task and does not open the card', async () => {
    const { container, callbacks, cardClick, task } = mountCluster('running', { conversation_id: 'conv-1' });
    await fireEvent.click(container.querySelector('.specorator-agent-board-card-action-primary') as Element);
    expect(callbacks.onStop).toHaveBeenCalledTimes(1);
    expect(callbacks.onStop).toHaveBeenCalledWith(task);
    expect(cardClick).not.toHaveBeenCalled();
  });

  it('routes a secondary click to the injected callback and does not open the card', async () => {
    const { container, callbacks, cardClick, task } = mountCluster('running', { conversation_id: 'conv-1' });
    await fireEvent.click(container.querySelector('.specorator-agent-board-card-action-secondary') as Element);
    expect(callbacks.onOpenConversation).toHaveBeenCalledWith(task);
    expect(cardClick).not.toHaveBeenCalled();
  });

  it('routes a menu-item click to the injected callback with the task', async () => {
    const { container, callbacks, task } = mountCluster('inbox');
    await openMenu(container);
    const openNote = [...document.body.querySelectorAll('.specorator-agent-board-card-menu-item')].find(
      (b) => b.textContent?.trim() === 'Open note',
    );
    await fireEvent.click(openNote as Element);
    expect(callbacks.onOpenNote).toHaveBeenCalledWith(task);
  });

  // 4. Teleport leak safety: one node on open, zero + no listener on every close.
  it('opens exactly one body-portaled menu and marks the card is-menu-open', async () => {
    const { container } = mountCluster('inbox');
    await openMenu(container);
    expect(bodyMenus().length).toBe(1);
    expect(cardOf(container)?.classList.contains('is-menu-open')).toBe(true);
  });

  it('tears the menu down on item-select — no leaked node, listener, or is-menu-open', async () => {
    const { container } = mountCluster('inbox');
    await openMenu(container);
    await fireEvent.click(document.body.querySelector('.specorator-agent-board-card-menu-item') as Element);
    await nextTick();
    expect(bodyMenus().length).toBe(0);
    expect(cardOf(container)?.classList.contains('is-menu-open')).toBe(false);
    // The document mousedown listener is gone: a later mousedown neither throws nor revives.
    expect(() => fireEvent.mouseDown(document.body)).not.toThrow();
    expect(bodyMenus().length).toBe(0);
  });

  it('tears the menu down on an outside mousedown', async () => {
    const { container } = mountCluster('inbox');
    await openMenu(container);
    await fireEvent.mouseDown(document.body);
    await nextTick();
    expect(bodyMenus().length).toBe(0);
    expect(cardOf(container)?.classList.contains('is-menu-open')).toBe(false);
  });

  it('tears the menu down on Escape', async () => {
    const { container } = mountCluster('inbox');
    await openMenu(container);
    await fireEvent.keyDown(document.body.querySelector('.specorator-agent-board-card-menu') as Element, {
      key: 'Escape',
    });
    await nextTick();
    expect(bodyMenus().length).toBe(0);
    expect(cardOf(container)?.classList.contains('is-menu-open')).toBe(false);
  });

  it('tears the menu down when the card unmounts — no leaked node or listener', async () => {
    const { container, unmount } = mountCluster('inbox');
    await openMenu(container);
    expect(bodyMenus().length).toBe(1);
    unmount();
    await nextTick();
    expect(bodyMenus().length).toBe(0);
    expect(() => fireEvent.mouseDown(document.body)).not.toThrow();
    expect(bodyMenus().length).toBe(0);
  });

  it('removes on close every listener it added on open (add/remove balanced — no leak)', async () => {
    const { container } = mountCluster('inbox');
    // Spy AFTER mount but BEFORE open: OverflowMenu attaches its listeners in
    // onMounted (which runs on open), so this window captures exactly the menu's
    // own adds/removes — not testing-library or jsdom noise. spyOn calls through,
    // so the listeners still really attach and detach.
    const docAdd = vi.spyOn(document, 'addEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');
    const winAdd = vi.spyOn(window, 'addEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    try {
      // Count listener (un)registrations matching an (event, capture) signature.
      // resize is registered without a capture flag, so its call has no 3rd arg.
      const count = (calls: unknown[][], name: string, capture: boolean | undefined): number =>
        calls.filter((c) => c[0] === name && (capture === undefined ? c[2] !== true : c[2] === capture)).length;

      await openMenu(container);
      // The three listeners portalPopover registers: doc mousedown (capture),
      // window scroll (capture), window resize (bubble).
      expect(count(docAdd.mock.calls, 'mousedown', true)).toBe(1);
      expect(count(winAdd.mock.calls, 'scroll', true)).toBe(1);
      expect(count(winAdd.mock.calls, 'resize', undefined)).toBe(1);

      await fireEvent.keyDown(document.body.querySelector('.specorator-agent-board-card-menu') as Element, {
        key: 'Escape',
      });
      await nextTick();

      // Every add is matched by a remove of the same (event, capture) signature.
      expect(count(docRemove.mock.calls, 'mousedown', true)).toBe(count(docAdd.mock.calls, 'mousedown', true));
      expect(count(winRemove.mock.calls, 'scroll', true)).toBe(count(winAdd.mock.calls, 'scroll', true));
      expect(count(winRemove.mock.calls, 'resize', undefined)).toBe(count(winAdd.mock.calls, 'resize', undefined));
    } finally {
      docAdd.mockRestore();
      docRemove.mockRestore();
      winAdd.mockRestore();
      winRemove.mockRestore();
    }
  });

  it('exercises the drop-up + horizontal-clamp branch of position() (stubbed rect + viewport)', async () => {
    const { container } = mountCluster('inbox'); // 2-item menu → estimatedHeight 76
    const trigger = moreButton(container) as HTMLElement;
    const origHeight = window.innerHeight;
    const origWidth = window.innerWidth;
    // A trigger near the viewport bottom with room above → flip up; a right edge
    // past the (narrow) viewport → left clamps to viewportWidth - 180 - 8. Mirrors
    // the imperative AgentBoardRenderer popover geometry test's stubbing pattern.
    trigger.getBoundingClientRect = (() => ({
      top: 80,
      bottom: 90,
      left: 480,
      right: 500,
      width: 20,
      height: 10,
      x: 480,
      y: 80,
      toJSON: () => ({}),
    })) as () => DOMRect;
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true });
    try {
      await openMenu(container);
      await nextTick();
      const menu = document.body.querySelector('.specorator-agent-board-card-menu') as HTMLElement;
      expect(menu.classList.contains('specorator-agent-board-card-menu--up')).toBe(true);
      // dropUp top = rect.top - estimatedHeight - OFFSET = 80 - 76 - 4 = 0.
      expect(menu.style.top).toBe('0px');
      // left = max(8, min(right - 180, innerWidth - 180 - 8)) = max(8, min(320, 112)) = 112.
      expect(menu.style.left).toBe('112px');
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: origHeight, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: origWidth, configurable: true });
    }
  });

  // 5. One overflow menu open at a time across the whole board.
  it('keeps only one menu open board-wide — opening B tears down A', async () => {
    const a = mountCluster('inbox');
    const b = mountCluster('ready');
    await openMenu(a.container);
    expect(bodyMenus().length).toBe(1);
    expect(cardOf(a.container)?.classList.contains('is-menu-open')).toBe(true);

    await openMenu(b.container);
    await nextTick();
    expect(bodyMenus().length).toBe(1);
    expect(cardOf(a.container)?.classList.contains('is-menu-open')).toBe(false);
    expect(cardOf(b.container)?.classList.contains('is-menu-open')).toBe(true);
  });

  // 6. Menu items are filtered at OPEN time, not cached at mount.
  it('re-filters menu items on each open — a conversation_id set after mount surfaces "Open conversation"', async () => {
    const { container, task } = mountCluster('needs_input');
    await openMenu(container);
    expect(menuItemLabels()).toEqual(['Open note', 'Stop']);

    // Toggle-close, then grant a conversation after mount.
    await fireEvent.click(moreButton(container));
    await nextTick();
    expect(bodyMenus().length).toBe(0);

    task.frontmatter.conversation_id = 'conv-late';
    await openMenu(container);
    expect(menuItemLabels()).toEqual(['Open note', 'Open conversation', 'Stop']);
  });
});
