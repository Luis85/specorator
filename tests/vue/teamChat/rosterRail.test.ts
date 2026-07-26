import { fireEvent, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { useTeamChatStore } from '@/features/teamChat/ui/vue/stores/teamChatStore';
import { t } from '@/i18n/i18n';

import { agent, awaitRoster, makeCallbacks, makePlugin, mountRoot, rosterRow, thread, within } from './fixtures';

// Avatar rendering is imperative (setIcon/createSpan); stub it so these assertions are
// about the rail's behavior, not avatar internals.
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

// The row/top-bar menus are Obsidian Menus; capture the built items so the tests can
// assert WHAT is offered without rendering a real menu.
const { menuItems, showAtMouseEvent } = vi.hoisted(() => ({
  menuItems: [] as string[],
  showAtMouseEvent: vi.fn(),
}));
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Menu: class {
      addItem(build: (item: unknown) => void) {
        const item = {
          setTitle(title: string) { menuItems.push(title); return item; },
          setIcon() { return item; },
          onClick() { return item; },
        };
        build(item);
        return this;
      }

      showAtMouseEvent = showAtMouseEvent;
    },
  };
});

function names(list: HTMLElement): string[] {
  return [...list.querySelectorAll('.specorator-team-roster-name')].map((el) => el.textContent ?? '');
}

const TEAM = [
  agent('roster:a', 'Ada', { description: 'router' }),
  agent('roster:b', 'Bo', { description: 'verifier' }),
  agent('roster:c', 'Cy', { description: 'writer' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  menuItems.length = 0;
  setActivePinia(createPinia());
});

describe('roster row content', () => {
  it('shows the DM preview instead of the description once a thread has history', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();
    const store = useTeamChatStore();

    store.setThreads({ 'roster:a': thread(1000, 'the last thing said') });
    await nextTick();

    expect(within(list).getByText('the last thing said')).toBeTruthy();
    // Ada's description is replaced; Bo (no thread) still falls back to its description.
    expect(within(list).queryByText('router')).toBeNull();
    expect(within(list).getByText('verifier')).toBeTruthy();
  });

  it('falls back to an em-dash when an agent has neither a preview nor a description', async () => {
    mountRoot(makePlugin([agent('roster:x', 'Xi', { description: '' })]), makeCallbacks());
    const list = await awaitRoster();

    expect(within(list).getByText('—')).toBeTruthy();
  });

  it('renders a machine-readable timestamp with the absolute time on hover', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();
    const store = useTeamChatStore();

    // A second past the boundary, not exactly on it: the shared clock stamps on subscribe
    // and then ticks, so it can trail `Date.now()` by a moment — an exactly-12-minute delta
    // would flip between the 11m and 12m buckets depending on sub-second timing.
    store.setThreads({ 'roster:a': thread(Date.now() - (12 * 60_000 + 1_000), 'hi') });
    await nextTick();

    const time = (await rosterRow('Ada')).querySelector('time');
    expect(time?.textContent).toBe('12m');
    expect(time?.getAttribute('datetime')).toBeTruthy();
    expect(time?.getAttribute('title')).toBeTruthy();
  });
});

describe('roster search and sort', () => {
  // Below the threshold a search field over a handful of rows is noise.
  it('hides the search box for a small roster', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();

    expect(screen.queryByPlaceholderText(t('teamChat.rosterSearchPlaceholder'))).toBeNull();
  });

  it('shows the search box once the team passes the threshold', async () => {
    const big = Array.from({ length: 6 }, (_, i) => agent(`roster:${i}`, `Agent ${i}`));
    mountRoot(makePlugin(big), makeCallbacks());
    await awaitRoster();

    expect(screen.getByPlaceholderText(t('teamChat.rosterSearchPlaceholder'))).toBeTruthy();
  });

  it('filters rows by the search query', async () => {
    const big = [...TEAM, ...Array.from({ length: 4 }, (_, i) => agent(`roster:${i}`, `Filler ${i}`))];
    mountRoot(makePlugin(big), makeCallbacks());
    const list = await awaitRoster();

    await fireEvent.update(screen.getByPlaceholderText(t('teamChat.rosterSearchPlaceholder')), 'Ada');

    expect(names(list)).toEqual(['Ada']);
  });

  it('shows a no-matches message rather than an empty rail', async () => {
    const big = [...TEAM, ...Array.from({ length: 4 }, (_, i) => agent(`roster:${i}`, `Filler ${i}`))];
    mountRoot(makePlugin(big), makeCallbacks());
    await awaitRoster();

    await fireEvent.update(screen.getByPlaceholderText(t('teamChat.rosterSearchPlaceholder')), 'zzzz');

    expect(screen.getByText(t('teamChat.rosterNoMatches'))).toBeTruthy();
  });

  it('sorts by DM activity by default, newest first', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();
    const store = useTeamChatStore();

    store.setThreads({ 'roster:c': thread(900, 'newest'), 'roster:a': thread(100, 'oldest') });
    await nextTick();

    // Cy (900) then Ada (100), then threadless Bo in name order at the bottom.
    expect(names(list)).toEqual(['Cy', 'Ada', 'Bo']);
  });

  it('switches to alphabetical order when the sort control selects Name', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();
    const store = useTeamChatStore();
    store.setThreads({ 'roster:c': thread(900, 'newest') });
    await nextTick();

    await fireEvent.update(screen.getByLabelText(t('teamChat.rosterSortLabel')), 'name');

    expect(names(list)).toEqual(['Ada', 'Bo', 'Cy']);
  });
});

describe('unread signal', () => {
  it('marks a row unread and outranks it with busy when the agent is streaming', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();
    const store = useTeamChatStore();

    store.setUnread({ 'roster:a': true });
    await nextTick();
    let dot = (await rosterRow('Ada')).querySelector('.specorator-team-presence-dot');
    expect(dot?.classList.contains('specorator-team-presence-dot--unread')).toBe(true);

    // busy outranks unread: a streaming agent is the more urgent signal.
    store.setPresence({ 'roster:a': 'busy' });
    await nextTick();
    dot = (await rosterRow('Ada')).querySelector('.specorator-team-presence-dot');
    expect(dot?.classList.contains('specorator-team-presence-dot--busy')).toBe(true);
  });
});

describe('roving-tabindex keyboard navigation', () => {
  // Browse-then-commit: each open resolves a thread, spawns a runtime, and consumes an
  // LRU slot, so select-follows-focus would be actively destructive here.
  it('moves focus on arrow keys WITHOUT opening any DM', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    const list = await awaitRoster();

    await fireEvent.keyDown(list, { key: 'ArrowDown' });
    await fireEvent.keyDown(list, { key: 'ArrowDown' });

    expect(callbacks.onSelectAgent).not.toHaveBeenCalled();
    expect((await rosterRow('Cy')).getAttribute('tabindex')).toBe('0');
  });

  it('opens the FOCUSED agent on Enter, not the first one', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    const list = await awaitRoster();

    await fireEvent.keyDown(list, { key: 'ArrowDown' });
    await fireEvent.keyDown(list, { key: 'Enter' });

    expect(callbacks.onSelectAgent).toHaveBeenCalledWith('roster:b');
  });

  it('jumps to the ends with Home and End', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();

    await fireEvent.keyDown(list, { key: 'End' });
    expect((await rosterRow('Cy')).getAttribute('tabindex')).toBe('0');

    await fireEvent.keyDown(list, { key: 'Home' });
    expect((await rosterRow('Ada')).getAttribute('tabindex')).toBe('0');
  });

  // Otherwise the pane underneath scrolls while the focus ring moves — two things at once.
  it('prevents default on the keys it handles', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();

    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    list.dispatchEvent(arrow);

    expect(arrow.defaultPrevented).toBe(true);
  });

  it('lets unhandled keys through so typing in the search box still works', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();

    const letter = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    list.dispatchEvent(letter);

    expect(letter.defaultPrevented).toBe(false);
  });
});

describe('row context menu', () => {
  it('offers open / edit / close for an idle DM', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();

    await fireEvent.contextMenu(await rosterRow('Ada'));

    expect(menuItems).toEqual([
      t('teamChat.menuOpenChat'),
      t('teamChat.menuEditAgent'),
      t('teamChat.menuCloseChat'),
    ]);
    expect(showAtMouseEvent).toHaveBeenCalled();
  });

  // Force-closing a live turn truncates the response — exactly what pickLruDmEviction
  // refuses to do. The menu must not offer what the engine will refuse.
  it('hides Close chat while that DM is streaming', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    await awaitRoster();
    const store = useTeamChatStore();
    store.setPresence({ 'roster:a': 'busy' });
    await nextTick();

    await fireEvent.contextMenu(await rosterRow('Ada'));

    expect(menuItems).not.toContain(t('teamChat.menuCloseChat'));
  });
});

describe('rail collapse', () => {
  it('collapses to the icon rail and persists the choice through the host', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    const list = await awaitRoster();

    await fireEvent.click(screen.getByLabelText(t('teamChat.railCollapse')));

    // Names are gone (the row keeps the identity in its accessible label + title).
    expect(names(list)).toEqual([]);
    expect(callbacks.onRailGeometryChange).toHaveBeenCalledWith(
      expect.objectContaining({ collapsed: true }),
    );
    // The toggle stays reachable, so the rail is never a one-way door.
    expect(screen.getByLabelText(t('teamChat.railExpand'))).toBeTruthy();
  });

  it('seeds the collapsed state from the leaf s persisted geometry', async () => {
    const callbacks = makeCallbacks();
    callbacks.getRailGeometry = vi.fn(() => ({ collapsed: true, width: 300 }));
    mountRoot(makePlugin(TEAM), callbacks);
    const list = await awaitRoster();

    expect(names(list)).toEqual([]);
  });
});

describe('rail resize', () => {
  it('exposes a keyboard-operable separator that clamps to the allowed range', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    await awaitRoster();
    const separator = screen.getByRole('separator');

    expect(separator.getAttribute('aria-valuemin')).toBe('200');
    expect(separator.getAttribute('aria-valuemax')).toBe('420');

    await fireEvent.keyDown(separator, { key: 'ArrowLeft' });

    expect(callbacks.onRailGeometryChange).toHaveBeenCalledWith(
      expect.objectContaining({ width: 244 }),
    );
  });

  it('clamps at the floor rather than letting the rail shrink away', async () => {
    const callbacks = makeCallbacks();
    callbacks.getRailGeometry = vi.fn(() => ({ collapsed: false, width: 205 }));
    mountRoot(makePlugin(TEAM), callbacks);
    await awaitRoster();

    await fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' });

    expect(callbacks.onRailGeometryChange).toHaveBeenCalledWith(
      expect.objectContaining({ width: 200 }),
    );
  });

  // Resize is meaningless on a fixed-width icon rail.
  it('removes the separator while collapsed', async () => {
    const callbacks = makeCallbacks();
    callbacks.getRailGeometry = vi.fn(() => ({ collapsed: true, width: 260 }));
    mountRoot(makePlugin(TEAM), callbacks);
    await awaitRoster();

    expect(screen.queryByRole('separator')).toBeNull();
  });
});

// --- Review round: defects the automated reviewer caught on the first commit ----------

describe('narrow-leaf auto-collapse (effective vs preferred state)', () => {
  // The root sizes the grid track from the EFFECTIVE state while the roster decides what to
  // render. When those disagreed, a narrow leaf shrank the track to 56px while the roster
  // kept rendering expanded rows — names, previews, toolbar and menus merely clipped.
  it('renders the icon rail when the leaf is narrow, even with the preference expanded', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();
    const store = useTeamChatStore();
    expect(names(list)).toEqual(['Ada', 'Bo', 'Cy']);

    store.setRailNarrow(true);
    await nextTick();

    expect(names(list)).toEqual([]);
    expect(store.railCollapsed).toBe(false); // the PREFERENCE is untouched
  });

  it('restores the expanded rail when the leaf widens again', async () => {
    mountRoot(makePlugin(TEAM), makeCallbacks());
    const list = await awaitRoster();
    const store = useTeamChatStore();
    store.setRailNarrow(true);
    await nextTick();

    store.setRailNarrow(false);
    await nextTick();

    expect(names(list)).toEqual(['Ada', 'Bo', 'Cy']);
  });

  // The toggle must derive the requested preference from the EFFECTIVE state. While narrow
  // the button reads "Expand"; inverting the stored preference (still false) would persist
  // `collapsed: true`, so widening the pane would leave the rail collapsed — the opposite of
  // the action just taken.
  it('persists EXPANDED when "Expand" is clicked on an auto-collapsed rail', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    await awaitRoster();
    const store = useTeamChatStore();
    store.setRailNarrow(true);
    await nextTick();

    await fireEvent.click(screen.getByLabelText(t('teamChat.railExpand')));

    expect(callbacks.onRailGeometryChange).toHaveBeenCalledWith(
      expect.objectContaining({ collapsed: false }),
    );
    expect(store.railCollapsed).toBe(false);
  });
});

describe('row menu button keyboard access', () => {
  // Enter/Space on the focused `⋯` button bubbles to the listbox handler. Without an
  // interactive-descendant guard the handler preventDefault'd it and opened the DM, making
  // the advertised keyboard-reachable action menu unreachable by keyboard.
  it('does not open the DM when Enter is pressed on the row menu button', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    await awaitRoster();
    const button = (await rosterRow('Ada')).querySelector('.specorator-team-roster-row-menu');

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    button?.dispatchEvent(event);

    expect(callbacks.onSelectAgent).not.toHaveBeenCalled();
    // Not consumed, so the button's own native activation still fires.
    expect(event.defaultPrevented).toBe(false);
  });

  it('still handles Enter when the ROW itself has focus', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    await awaitRoster();

    await fireEvent.keyDown(await rosterRow('Ada'), { key: 'Enter' });

    expect(callbacks.onSelectAgent).toHaveBeenCalledWith('roster:a');
  });
});

describe('relative timestamps advance with the clock', () => {
  // `Date.now()` read inside a computed is not reactive: without a shared clock a row
  // labelled `now` stays `now` indefinitely unless an unrelated snapshot re-renders it.
  it('re-labels a row as time passes without any new thread event', async () => {
    vi.useFakeTimers();
    try {
      const mountedAt = Date.now();
      mountRoot(makePlugin(TEAM), makeCallbacks());
      const list = await awaitRoster();
      const store = useTeamChatStore();
      store.setThreads({ 'roster:a': thread(mountedAt, 'hi') });
      await nextTick();
      expect(within(list).getByText('now')).toBeTruthy();

      // No store mutation here — only the wall clock moves.
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      await nextTick();

      expect(within(list).getByText('5m')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('roving focus survives reordering', () => {
  // The default `recent` order re-sorts whenever a thread saves — which the
  // `conversation:saved` re-projection makes routine. A numeric focus index would then
  // re-point at whichever agent slid into that slot: the focused row loses `tabindex="0"`
  // and Enter opens the wrong DM.
  it('keeps focus on the same AGENT when the sort order changes', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    const list = await awaitRoster();
    const store = useTeamChatStore();
    // Order starts alphabetical (no threads): Ada, Bo, Cy. Focus Bo.
    await fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect((await rosterRow('Bo')).getAttribute('tabindex')).toBe('0');

    // A save re-sorts the rail so Cy leads and Bo moves.
    store.setThreads({ 'roster:c': thread(900, 'newest'), 'roster:b': thread(100, 'older') });
    await nextTick();
    expect(names(list)).toEqual(['Cy', 'Bo', 'Ada']);

    // Focus is still on Bo — not on whatever now occupies index 1.
    expect((await rosterRow('Bo')).getAttribute('tabindex')).toBe('0');
    await fireEvent.keyDown(list, { key: 'Enter' });
    expect(callbacks.onSelectAgent).toHaveBeenCalledWith('roster:b');
  });

  // A focused agent that disappears must not leave the list untabbable.
  it('falls back to the first row when the focused agent is filtered out', async () => {
    const big = [...TEAM, ...Array.from({ length: 4 }, (_, i) => agent(`roster:${i}`, `Filler ${i}`))];
    mountRoot(makePlugin(big), makeCallbacks());
    const list = await awaitRoster();
    await fireEvent.keyDown(list, { key: 'End' });

    await fireEvent.update(screen.getByPlaceholderText(t('teamChat.rosterSearchPlaceholder')), 'Ada');

    const tabbable = list.querySelectorAll('[role="option"][tabindex="0"]');
    expect(tabbable).toHaveLength(1);
  });
});

describe('row-menu key guard is realm-neutral', () => {
  // An Obsidian POPOUT leaf builds its nodes from another window's constructors, so an
  // `instanceof Element` guard would fail there and let the menu button's Enter fall
  // through to the listbox — opening the DM instead of the menu.
  it('ignores menu-button keys from a foreign realm (no instanceof dependency)', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin(TEAM), callbacks);
    const list = await awaitRoster();
    const button = (await rosterRow('Ada')).querySelector('.specorator-team-roster-row-menu');

    // Simulate a cross-realm target: same duck-typed shape, but not `instanceof Element`
    // in this realm.
    const foreign = {
      nodeType: 1,
      closest: (sel: string) => (sel.includes('button') ? button : null),
    };
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: foreign });
    list.dispatchEvent(event);

    expect(callbacks.onSelectAgent).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
