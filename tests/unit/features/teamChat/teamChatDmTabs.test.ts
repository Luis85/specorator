import { Notice } from 'obsidian';

import {
  closeRotatedDmTab,
  closeTeamChatDmTab,
  evictLruDmIfNeeded,
  openResolvedTeamChatDm,
  pickLruDmEviction,
  reconcileRotation,
  restoreTeamChatDmTabs,
  touchDmRecency,
  trimRestorableDmsToBudget,
} from '@/features/teamChat/teamChatDmTabs';
import { t } from '@/i18n/i18n';

const mockNotice = Notice as jest.Mock;

const teamChatConv = { surface: 'team-chat', boundAgentId: 'roster:a', providerId: 'claude' };

function layout(conversationId: string, tabId = 't1') {
  return { openTabs: [{ tabId, conversationId, kind: 'chat' as const }], activeTabId: tabId };
}

describe('restoreTeamChatDmTabs — dedup + validate (:225)', () => {
  it('collapses two leaves restoring the SAME DM to exactly one createTab (Fix 1)', async () => {
    const created = new Set<string>();
    const createTab1 = jest.fn().mockImplementation(async () => { created.add('leaf1'); return { id: 't1' }; });
    const createTab2 = jest.fn().mockImplementation(async () => { created.add('leaf2'); return { id: 't1' }; });
    // ONE shared plugin object → both leaves resolve the SAME DM-open coordinator.
    const plugin = {
      getConversationSync: jest.fn(() => teamChatConv),
      getConversationById: jest.fn().mockResolvedValue(teamChatConv),
      findConversationAcrossViews: jest.fn(() => (created.size > 0 ? { view: {}, tabId: 't1' } : null)),
    } as never;
    const m1 = { createTab: createTab1, hasTab: jest.fn(() => created.has('leaf1')), switchToTab: jest.fn() } as never;
    const m2 = { createTab: createTab2, hasTab: jest.fn(() => created.has('leaf2')), switchToTab: jest.fn() } as never;

    await Promise.all([
      restoreTeamChatDmTabs(plugin, m1, layout('c1')),
      restoreTeamChatDmTabs(plugin, m2, layout('c1')),
    ]);

    // Exactly one controller across both leaves (coordinator + findConversationAcrossViews collapsed them).
    expect(createTab1.mock.calls.length + createTab2.mock.calls.length).toBe(1);
  });

  it('skips a DM already open in another view (Fix 1)', async () => {
    const createTab = jest.fn();
    const plugin = {
      getConversationSync: jest.fn(() => teamChatConv),
      getConversationById: jest.fn().mockResolvedValue(teamChatConv),
      findConversationAcrossViews: jest.fn(() => ({ view: {}, tabId: 't-existing' })), // already open elsewhere
    } as never;
    const m = { createTab, hasTab: jest.fn(() => false), switchToTab: jest.fn() } as never;

    await restoreTeamChatDmTabs(plugin, m, layout('c1'));

    expect(createTab).not.toHaveBeenCalled();
  });

  it('does not restore a DM whose conversation no longer exists (Fix 2)', async () => {
    const createTab = jest.fn();
    const plugin = {
      getConversationSync: jest.fn(() => null), // deleted / absent after sync
      getConversationById: jest.fn().mockResolvedValue(null),
      findConversationAcrossViews: jest.fn(() => null),
    } as never;
    const m = { createTab, hasTab: jest.fn(() => false), switchToTab: jest.fn() } as never;

    await restoreTeamChatDmTabs(plugin, m, layout('c-gone'));

    expect(createTab).not.toHaveBeenCalled();
  });

  it('does not restore a non-team-chat conversation (Fix 2)', async () => {
    const createTab = jest.fn();
    const plugin = {
      getConversationSync: jest.fn(() => ({ surface: 'chat' })), // ordinary chat, no boundAgentId
      getConversationById: jest.fn().mockResolvedValue({}),
      findConversationAcrossViews: jest.fn(() => null),
    } as never;
    const m = { createTab, hasTab: jest.fn(() => false), switchToTab: jest.fn() } as never;

    await restoreTeamChatDmTabs(plugin, m, layout('c-ordinary'));

    expect(createTab).not.toHaveBeenCalled();
  });

  // Round-38: an ordinary roster-agent chat has a boundAgentId but surface 'chat' (e.g. from
  // synced/hand-edited view state). Restoring it into the Team Chat leaf would escape the
  // surface-keyed DM protections (fork disable, $-resume suppression, DM mapping), so
  // surface === 'team-chat' is REQUIRED, not merely an alternative to boundAgentId.
  it('does not restore an ordinary chat that merely has a bound agent (surface !== team-chat) (Round-38)', async () => {
    const createTab = jest.fn();
    const boundChat = { surface: 'chat', boundAgentId: 'roster:a', providerId: 'claude' };
    const plugin = {
      getConversationSync: jest.fn(() => boundChat),
      getConversationById: jest.fn().mockResolvedValue(boundChat),
      findConversationAcrossViews: jest.fn(() => null),
    } as never;
    const m = { createTab, hasTab: jest.fn(() => false), switchToTab: jest.fn() } as never;

    await restoreTeamChatDmTabs(plugin, m, layout('c-bound-chat'));

    expect(createTab).not.toHaveBeenCalled();
  });

  it('restores a valid team-chat DM and switches to it (Fix 2)', async () => {
    const created = new Set<string>();
    const createTab = jest.fn().mockImplementation(async () => { created.add('t1'); return { id: 't1' }; });
    const switchToTab = jest.fn();
    const plugin = {
      getConversationSync: jest.fn(() => teamChatConv),
      getConversationById: jest.fn().mockResolvedValue(teamChatConv),
      findConversationAcrossViews: jest.fn(() => (created.size ? { view: {}, tabId: 't1' } : null)),
    } as never;
    const m = { createTab, hasTab: jest.fn((id: string) => created.has(id)), switchToTab } as never;

    await restoreTeamChatDmTabs(plugin, m, layout('c1'));

    // bypassTabLimit: restore honors Team Chat's own budget (maxTeamChatDms), not maxChatTabs (Round-40).
    expect(createTab).toHaveBeenCalledWith('c1', 't1', { activate: false, kind: 'chat', bypassTabLimit: true });
    expect(switchToTab).toHaveBeenCalledWith('t1');
  });

  it('creates no blank fallback tab when nothing is restorable', async () => {
    const createTab = jest.fn();
    const plugin = {
      getConversationSync: jest.fn(() => null),
      getConversationById: jest.fn().mockResolvedValue(null),
      findConversationAcrossViews: jest.fn(() => null),
    } as never;
    const m = { createTab, hasTab: jest.fn(() => false), switchToTab: jest.fn() } as never;

    await restoreTeamChatDmTabs(plugin, m, layout('c-gone'));

    expect(createTab).not.toHaveBeenCalled();
  });
});

describe('restoreTeamChatDmTabs — Team Chat cap governs restore (Round-40 Fix 1)', () => {
  /** A layout of `count` team-chat DMs (tab tN / conversation cN), active = `t${activeIndex}`. */
  function dmLayout(count: number, activeIndex: number) {
    return {
      openTabs: Array.from({ length: count }, (_v, i) => ({ tabId: `t${i}`, conversationId: `c${i}`, kind: 'chat' as const })),
      activeTabId: `t${activeIndex}`,
    };
  }

  it('restores every DM within maxTeamChatDms, not clipped at the smaller maxChatTabs', async () => {
    const created = new Set<string>();
    const createTab = jest.fn().mockImplementation(async (_cid: string, tabId: string) => { created.add(tabId); return { id: tabId }; });
    const plugin = {
      settings: { maxTeamChatDms: 5 }, // maxChatTabs (default 3) would otherwise clip to 3
      getConversationSync: jest.fn(() => teamChatConv),
      getConversationById: jest.fn().mockResolvedValue(teamChatConv),
      findConversationAcrossViews: jest.fn(() => null),
    } as never;
    const m = { createTab, hasTab: jest.fn((id: string) => created.has(id)), switchToTab: jest.fn() } as never;

    await restoreTeamChatDmTabs(plugin, m, dmLayout(4, 0));

    expect(createTab).toHaveBeenCalledTimes(4);
    for (const call of createTab.mock.calls) {
      expect(call[2]).toEqual({ activate: false, kind: 'chat', bypassTabLimit: true });
    }
  });

  it('trims a persisted set beyond maxTeamChatDms to the budget, keeping the persisted-active DM', async () => {
    const createdCids = new Set<string>();
    const createTab = jest.fn().mockImplementation(async (cid: string, tabId: string) => { createdCids.add(cid); return { id: tabId }; });
    const plugin = {
      settings: { maxTeamChatDms: 5 },
      getConversationSync: jest.fn(() => teamChatConv),
      getConversationById: jest.fn().mockResolvedValue(teamChatConv),
      findConversationAcrossViews: jest.fn(() => null),
    } as never;
    const m = { createTab, hasTab: jest.fn(() => true), switchToTab: jest.fn() } as never;

    // 6 DMs with the LAST (c5/t5) active → trim to 5, dropping the earliest non-active (c0).
    await restoreTeamChatDmTabs(plugin, m, dmLayout(6, 5));

    expect(createTab).toHaveBeenCalledTimes(5);
    expect(createdCids.has('c5')).toBe(true);  // persisted-active always kept
    expect(createdCids.has('c0')).toBe(false); // earliest (least-recent) trimmed
  });
});

describe('trimRestorableDmsToBudget', () => {
  const tabs = (ids: string[]) => ids.map((tabId) => ({ tabId }));

  it('returns the set unchanged when within budget', () => {
    const set = tabs(['a', 'b', 'c']);
    expect(trimRestorableDmsToBudget(set, 'b', 5)).toBe(set);
  });

  it('trims to the budget, keeping the active and dropping the earliest others', () => {
    expect(trimRestorableDmsToBudget(tabs(['a', 'b', 'c', 'd']), 'd', 2).map((t) => t.tabId)).toEqual(['c', 'd']);
  });

  it('keeps the active even when it is the earliest tab', () => {
    expect(trimRestorableDmsToBudget(tabs(['a', 'b', 'c', 'd']), 'a', 2).map((t) => t.tabId)).toEqual(['a', 'd']);
  });
});

describe('closeRotatedDmTab', () => {
  it('force-closes the old tab only when the new tab actually opened, and broadcasts presence', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const emit = jest.fn();
    const plugin = {
      events: { emit },
      findConversationAcrossViews: jest.fn((id: string) =>
        id === 'c-new'
          ? { view: {}, tabId: 't-new' }
          : { view: { getTabManager: () => ({ closeTab }) }, tabId: 't-old' }),
    } as never;

    await closeRotatedDmTab(plugin, 'c-old', 'c-new');

    expect(closeTab).toHaveBeenCalledWith('t-old', true);
    // Round-37/T7 (:168): a force-close skips the streaming callback, so surviving leaves
    // must be told to recompute presence or a still-streaming old DM stays busy forever.
    expect(emit).toHaveBeenCalledWith('teamChat:presence');
  });

  it('no-ops when the new tab did not open (cap-blocked rotation)', async () => {
    const closeTab = jest.fn();
    const emit = jest.fn();
    const plugin = {
      events: { emit },
      findConversationAcrossViews: jest.fn((id: string) =>
        id === 'c-new' ? null : { view: { getTabManager: () => ({ closeTab }) }, tabId: 't-old' }),
    } as never;

    await closeRotatedDmTab(plugin, 'c-old', 'c-new');

    expect(closeTab).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

// Round-48 Fix B: force-closing the displaced tab bypasses the streaming guard, so a mid-stream old
// DM has its partial transcript saved and its runtime killed — silently truncating the response. The
// cancel already happens; add the "communicate": surface an interrupted Notice BEFORE the close.
describe('closeRotatedDmTab — streaming interruption notice (Round-48 Fix B)', () => {
  beforeEach(() => mockNotice.mockClear());

  /** Stale old tab (t-old / c-old) with a configurable streaming flag; the new tab (c-new) is open. */
  function pluginWith(streaming: boolean, closeTab: jest.Mock) {
    return {
      events: { emit: jest.fn() },
      findConversationAcrossViews: jest.fn((id: string) =>
        id === 'c-new'
          ? { view: {}, tabId: 't-new' }
          : {
              view: {
                getTabManager: () => ({
                  closeTab,
                  getAllTabs: () => [{ conversationId: 'c-old', state: { isStreaming: streaming } }],
                }),
              },
              tabId: 't-old',
            }),
    } as never;
  }

  it('surfaces the rotationInterrupted notice BEFORE the force-close when the displaced tab is mid-stream', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);

    await closeRotatedDmTab(pluginWith(true, closeTab), 'c-old', 'c-new');

    expect(mockNotice).toHaveBeenCalledWith(t('teamChat.rotationInterrupted'));
    expect(closeTab).toHaveBeenCalledWith('t-old', true);
    // The user must be warned before the transcript is truncated, not after.
    expect(mockNotice.mock.invocationCallOrder[0]).toBeLessThan(closeTab.mock.invocationCallOrder[0]);
  });

  it('does not notice when the displaced tab is idle', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);

    await closeRotatedDmTab(pluginWith(false, closeTab), 'c-old', 'c-new');

    expect(mockNotice).not.toHaveBeenCalled();
    expect(closeTab).toHaveBeenCalledWith('t-old', true);
  });
});

describe('touchDmRecency', () => {
  it('appends a newly-activated conversation as most-recent', () => {
    const recency = ['a', 'b'];
    touchDmRecency(recency, 'c');
    expect(recency).toEqual(['a', 'b', 'c']);
  });

  it('moves an already-tracked conversation to the most-recent end (no duplicate)', () => {
    const recency = ['a', 'b', 'c'];
    touchDmRecency(recency, 'a');
    expect(recency).toEqual(['b', 'c', 'a']);
  });
});

describe('pickLruDmEviction', () => {
  const tabs = [
    { id: 't-a', conversationId: 'a' },
    { id: 't-b', conversationId: 'b' },
    { id: 't-c', conversationId: 'c' },
  ];

  it('evicts the least-recently-active tab (head of recency)', () => {
    // Recency oldest→newest: a, b, c. b is active, opening d. LRU non-active = a.
    expect(pickLruDmEviction(tabs, ['a', 'b', 'c'], 't-b', 'd')).toBe('t-a');
  });

  it('never evicts the active tab even when it is the least-recently-active', () => {
    // a is oldest but is the active tab → skip it; next-oldest candidate is b.
    expect(pickLruDmEviction(tabs, ['a', 'b', 'c'], 't-a', 'd')).toBe('t-b');
  });

  it('never evicts the conversation being opened', () => {
    // Opening 'a' (a re-select) — its tab is excluded; LRU of the rest is b.
    expect(pickLruDmEviction(tabs, ['a', 'b', 'c'], 't-c', 'a')).toBe('t-b');
  });

  it('treats a never-activated tab (absent from recency) as the oldest', () => {
    // 'c' was never activated (not in recency) → oldest → evicted first.
    expect(pickLruDmEviction(tabs, ['a', 'b'], 't-a', 'd')).toBe('t-c');
  });

  it('returns null when the only tab is the active one', () => {
    expect(pickLruDmEviction([{ id: 't-a', conversationId: 'a' }], ['a'], 't-a', 'd')).toBeNull();
  });

  // Round-41 (:451): the LRU victim must NEVER be a DM mid-turn — the eviction close is a
  // force-close that bypasses TabManager's streaming guard, destroying the runtime and
  // truncating the background response the spec promises. Skip streaming tabs; prefer an idle
  // least-recently-used one, and evict nothing (null) when no idle candidate remains.
  it('skips a streaming LRU tab and evicts the next idle one (Round-41)', () => {
    // a is the oldest (LRU) but is STREAMING → skip it; next-oldest idle candidate is b.
    const tabs = [
      { id: 't-a', conversationId: 'a', state: { isStreaming: true } },
      { id: 't-b', conversationId: 'b', state: { isStreaming: false } },
      { id: 't-c', conversationId: 'c', state: { isStreaming: false } },
    ];
    expect(pickLruDmEviction(tabs, ['a', 'b', 'c'], 't-c', 'd')).toBe('t-b');
  });

  it('evicts the idle LRU tab, ignoring a more-recent streaming tab (Round-41)', () => {
    // a is oldest + idle → evicted; the more-recent b streams but is never chosen anyway.
    const tabs = [
      { id: 't-a', conversationId: 'a', state: { isStreaming: false } },
      { id: 't-b', conversationId: 'b', state: { isStreaming: true } },
      { id: 't-c', conversationId: 'c', state: { isStreaming: false } },
    ];
    expect(pickLruDmEviction(tabs, ['a', 'b', 'c'], 't-c', 'd')).toBe('t-a');
  });

  it('returns null when every non-active DM is streaming (Round-41)', () => {
    // c is active; a and b are both mid-turn → no idle victim → no eviction (the open then
    // falls back to the cap Notice last-resort rather than truncating a live turn).
    const tabs = [
      { id: 't-a', conversationId: 'a', state: { isStreaming: true } },
      { id: 't-b', conversationId: 'b', state: { isStreaming: true } },
      { id: 't-c', conversationId: 'c', state: { isStreaming: false } },
    ];
    expect(pickLruDmEviction(tabs, ['a', 'b', 'c'], 't-c', 'd')).toBeNull();
  });
});

describe('closeTeamChatDmTab', () => {
  it('force-closes the tab and broadcasts presence', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const emit = jest.fn();
    const plugin = { events: { emit } } as never;

    const closed = await closeTeamChatDmTab(plugin, { closeTab }, 't-1');

    expect(closeTab).toHaveBeenCalledWith('t-1', true);
    expect(emit).toHaveBeenCalledWith('teamChat:presence');
    expect(closed).toBe(true);
  });
});

describe('evictLruDmIfNeeded', () => {
  function managerWith(tabs: { id: string; conversationId: string }[], activeTabId: string, closeTab = jest.fn().mockResolvedValue(true)) {
    return { getAllTabs: () => tabs, getActiveTabId: () => activeTabId, closeTab };
  }

  it('evicts the LRU DM when the manager is at the budget', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const emit = jest.fn();
    const plugin = { settings: { maxTeamChatDms: 2 }, events: { emit } } as never;
    const manager = managerWith([{ id: 't-a', conversationId: 'a' }, { id: 't-b', conversationId: 'b' }], 't-b', closeTab);

    await evictLruDmIfNeeded(plugin, manager, ['a', 'b'], 'c');

    // At budget (2) → evict the LRU non-active DM (a / t-a) to free a slot, and broadcast.
    expect(closeTab).toHaveBeenCalledWith('t-a', true);
    expect(emit).toHaveBeenCalledWith('teamChat:presence');
  });

  it('does not evict when under the budget', async () => {
    const closeTab = jest.fn();
    const plugin = { settings: { maxTeamChatDms: 5 }, events: { emit: jest.fn() } } as never;
    const manager = managerWith([{ id: 't-a', conversationId: 'a' }, { id: 't-b', conversationId: 'b' }], 't-b', closeTab);

    await evictLruDmIfNeeded(plugin, manager, ['a', 'b'], 'c');

    expect(closeTab).not.toHaveBeenCalled();
  });

  it('is a safe no-op when the manager cannot report its tabs', async () => {
    const closeTab = jest.fn();
    const plugin = { settings: { maxTeamChatDms: 1 }, events: { emit: jest.fn() } } as never;

    await evictLruDmIfNeeded(plugin, { closeTab }, ['a'], 'c');

    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does not evict when every non-active DM is still streaming (Round-41)', async () => {
    const closeTab = jest.fn();
    const plugin = { settings: { maxTeamChatDms: 2 }, events: { emit: jest.fn() } } as never;
    // At budget (2): t-a is mid-turn, t-b is active → no idle victim → pickLruDmEviction
    // returns null → nothing is force-closed (the open falls back to createTab's own cap
    // handling instead of truncating t-a's live turn).
    const manager = {
      getAllTabs: () => [
        { id: 't-a', conversationId: 'a', state: { isStreaming: true } },
        { id: 't-b', conversationId: 'b', state: { isStreaming: false } },
      ],
      getActiveTabId: () => 't-b',
      closeTab,
    } as never;

    await evictLruDmIfNeeded(plugin, manager, ['a', 'b'], 'c');

    expect(closeTab).not.toHaveBeenCalled();
  });

  // Round-45 Finding 2: a provider-change rotation displaces one open tab, closed by
  // reconcileRotation AFTER the replacement opens. Excluding that displaced slot from the
  // budget lets the rotation reuse it instead of force-closing an unrelated hot DM.
  it('reuses the displaced tab slot during a rotation and evicts nothing (Round-45)', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const plugin = { settings: { maxTeamChatDms: 2 }, events: { emit: jest.fn() } } as never;
    // At budget (2). The displaced old-provider DM 'a' will be closed once the replacement opens,
    // so its slot covers the new DM — nothing unrelated should be evicted (t-b is active anyway).
    const manager = managerWith([{ id: 't-a', conversationId: 'a' }, { id: 't-b', conversationId: 'b' }], 't-b', closeTab);

    const hasSlot = await evictLruDmIfNeeded(plugin, manager, ['a', 'b'], 'c', 'a');

    expect(hasSlot).toBe(true);
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('still evicts the LRU DM when the displaced conversation is not an open tab (Round-45)', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const plugin = { settings: { maxTeamChatDms: 2 }, events: { emit: jest.fn() } } as never;
    const manager = managerWith([{ id: 't-a', conversationId: 'a' }, { id: 't-b', conversationId: 'b' }], 't-b', closeTab);

    // 'not-open' is not among the tabs → no phantom slot → genuinely over budget → evict LRU idle 'a'.
    await evictLruDmIfNeeded(plugin, manager, ['a', 'b'], 'c', 'not-open');

    expect(closeTab).toHaveBeenCalledWith('t-a', true);
  });
});

// Round-43 (:451/:52): the open path must not create an over-budget DM when eviction frees
// no slot. `evictLruDmIfNeeded` now REPORTS slot availability; `openResolvedTeamChatDm` only
// bypasses the shared maxChatTabs once a Team Chat slot is confirmed, else it surfaces the
// same `tabCapReached` Notice the createTab dead-end uses — never an extra runtime.
describe('openResolvedTeamChatDm — budget-gated open (Round-43)', () => {
  beforeEach(() => mockNotice.mockClear());

  const notOpenAnywhere = { findConversationAcrossViews: jest.fn(() => null) };

  it('surfaces the cap Notice and does NOT createTab when the budget is full and every inactive DM is streaming', async () => {
    const createTab = jest.fn();
    const closeTab = jest.fn();
    const plugin = { settings: { maxTeamChatDms: 2 }, events: { emit: jest.fn() }, ...notOpenAnywhere } as never;
    // At budget (2): t-a is mid-turn, t-b is active → no idle victim → eviction frees nothing.
    const manager = {
      getAllTabs: () => [
        { id: 't-a', conversationId: 'a', state: { isStreaming: true } },
        { id: 't-b', conversationId: 'b', state: { isStreaming: false } },
      ],
      getActiveTabId: () => 't-b',
      closeTab,
      createTab,
    } as never;

    await openResolvedTeamChatDm(plugin, manager, {} as never, ['a', 'b'], 'c', { isStale: () => false });

    expect(closeTab).not.toHaveBeenCalled();  // a streaming DM is never force-closed
    expect(createTab).not.toHaveBeenCalled(); // and no over-budget runtime is spawned
    expect(mockNotice).toHaveBeenCalledWith(t('teamChat.tabCapReached'));
  });

  it('evicts an idle LRU DM and opens the new one when the budget is full', async () => {
    const createTab = jest.fn().mockResolvedValue({ id: 't-new' });
    const closeTab = jest.fn().mockResolvedValue(true);
    const plugin = { settings: { maxTeamChatDms: 2 }, events: { emit: jest.fn() }, ...notOpenAnywhere } as never;
    const manager = {
      getAllTabs: () => [
        { id: 't-a', conversationId: 'a', state: { isStreaming: false } }, // idle LRU
        { id: 't-b', conversationId: 'b', state: { isStreaming: false } }, // active
      ],
      getActiveTabId: () => 't-b',
      closeTab,
      createTab,
    } as never;

    await openResolvedTeamChatDm(plugin, manager, {} as never, ['a', 'b'], 'c', { isStale: () => false });

    expect(closeTab).toHaveBeenCalledWith('t-a', true);
    expect(createTab).toHaveBeenCalledWith('c', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
    expect(mockNotice).not.toHaveBeenCalled();
  });

  it('opens with no eviction or Notice when under the hot-DM budget', async () => {
    const createTab = jest.fn().mockResolvedValue({ id: 't-new' });
    const closeTab = jest.fn();
    const plugin = { settings: { maxTeamChatDms: 5 }, events: { emit: jest.fn() }, ...notOpenAnywhere } as never;
    const manager = {
      getAllTabs: () => [{ id: 't-a', conversationId: 'a', state: { isStreaming: false } }],
      getActiveTabId: () => 't-a',
      closeTab,
      createTab,
    } as never;

    await openResolvedTeamChatDm(plugin, manager, {} as never, ['a'], 'c', { isStale: () => false });

    expect(closeTab).not.toHaveBeenCalled();
    expect(createTab).toHaveBeenCalledWith('c', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
    expect(mockNotice).not.toHaveBeenCalled();
  });
});

// Round-45 Finding 1: rotateChangedDmProviders routes each background rotation through the
// selectAgent open with preserveFocus. Rotating an INACTIVE open DM's provider must NOT yank
// the pane to it while the user reads a different DM; rotating the ACTIVE DM still swaps to its
// fresh replacement. Activation is derived from whether the rotated DM is the one in focus.
describe('openResolvedTeamChatDm — preserveFocus rotation activation (Round-45)', () => {
  beforeEach(() => mockNotice.mockClear());

  /** Two open DMs (A + B's old tab); a rotation opens a FRESH id for B. `activeTabId` picks focus. */
  function rotationManager(activeTabId: string, createTab: jest.Mock) {
    return {
      getAllTabs: () => [
        { id: 't-a', conversationId: 'conv-a', state: { isStreaming: false } },
        { id: 't-b-old', conversationId: 'conv-b-old', state: { isStreaming: false } },
      ],
      getActiveTabId: () => activeTabId,
      closeTab: jest.fn(),
      createTab,
    } as never;
  }

  const plugin = { settings: { maxTeamChatDms: 5 }, events: { emit: jest.fn() }, findConversationAcrossViews: jest.fn(() => null) } as never;

  it('opens a rotated INACTIVE DM in the background so focus stays on the active DM', async () => {
    const createTab = jest.fn().mockResolvedValue({ id: 't-b-new' });
    // Active DM is A; B (inactive) rotates from conv-b-old to conv-b-new.
    const manager = rotationManager('t-a', createTab);

    await openResolvedTeamChatDm(plugin, manager, {} as never, ['conv-b-old', 'conv-a'], 'conv-b-new',
      { isStale: () => false, displacedConversationId: 'conv-b-old', preserveFocus: true });

    // preserveFocus + the rotated DM is NOT the active one → open in the background (activate:false).
    expect(createTab).toHaveBeenCalledWith('conv-b-new', undefined, { activate: false, kind: 'chat', bypassTabLimit: true });
  });

  it('activates a rotated DM when it IS the one the user is viewing', async () => {
    const createTab = jest.fn().mockResolvedValue({ id: 't-b-new' });
    // Active DM is B itself; rotating B swaps the pane to its fresh replacement.
    const manager = rotationManager('t-b-old', createTab);

    await openResolvedTeamChatDm(plugin, manager, {} as never, ['conv-a', 'conv-b-old'], 'conv-b-new',
      { isStale: () => false, displacedConversationId: 'conv-b-old', preserveFocus: true });

    // The rotated DM was in focus → its replacement takes focus (activate:true).
    expect(createTab).toHaveBeenCalledWith('conv-b-new', undefined, { activate: true, kind: 'chat', bypassTabLimit: true });
  });
});

describe('reconcileRotation — deferred rotation close (:361)', () => {
  it('defers the displaced close while the replacement is cap-blocked, then closes on the retry', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    let replacementOpen = false; // the rotation's new tab hit the cap on the first attempt
    const plugin = {
      agentRosterStore: { get: jest.fn().mockResolvedValue({ name: 'Ada' }) },
      events: { emit: jest.fn() },
      findConversationAcrossViews: jest.fn((id: string) => {
        if (id === 'c-new') return replacementOpen ? { view: {}, tabId: 't-new' } : null;
        if (id === 'c-old') return { view: { getTabManager: () => ({ closeTab }) }, tabId: 't-old' };
        return null;
      }),
    } as never;

    // Call 1: provider rotated (prev ≠ new) but the replacement never opened (cap) — the
    // displaced old DM is recorded, and NOTHING is closed (closing now would strand the agent).
    await reconcileRotation(plugin, 'roster:a', 'c-old', 'c-new');
    expect(closeTab).not.toHaveBeenCalled();

    // Call 2 (retry): resolveOrCreate already remapped, so prev === new and the rotation is
    // no longer re-detected; but the replacement is finally open, so the recorded displaced
    // old-provider tab is now closed and its slot freed.
    replacementOpen = true;
    await reconcileRotation(plugin, 'roster:a', 'c-new', 'c-new');
    expect(closeTab).toHaveBeenCalledWith('t-old', true);
  });

  it('drains the displaced record so a later no-op reconcile does not re-close', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const plugin = {
      agentRosterStore: { get: jest.fn().mockResolvedValue({ name: 'Ada' }) },
      events: { emit: jest.fn() },
      findConversationAcrossViews: jest.fn((id: string) =>
        id === 'c-new'
          ? { view: {}, tabId: 't-new' }
          : id === 'c-old'
            ? { view: { getTabManager: () => ({ closeTab }) }, tabId: 't-old' }
            : null),
    } as never;

    // Replacement already open → closes immediately and clears the displaced record.
    await reconcileRotation(plugin, 'roster:a', 'c-old', 'c-new');
    expect(closeTab).toHaveBeenCalledTimes(1);

    // A subsequent reconcile with nothing displaced (prev === new) must not close again.
    await reconcileRotation(plugin, 'roster:a', 'c-new', 'c-new');
    expect(closeTab).toHaveBeenCalledTimes(1);
  });
});

// Round-48 Fix A: the reload-cleanup path (get() has already rotated to the new id) still needs to
// close the lingering displaced old-provider tab, but must NOT re-fire the rotation notice the user
// already saw pre-reload. `notify` gates only the Notice; the displaced close is unchanged.
describe('reconcileRotation — notify gate (Round-48 Fix A)', () => {
  beforeEach(() => mockNotice.mockClear());

  function pluginWithOpenReplacement(closeTab: jest.Mock) {
    return {
      agentRosterStore: { get: jest.fn().mockResolvedValue({ name: 'Ada' }) },
      events: { emit: jest.fn() },
      findConversationAcrossViews: jest.fn((id: string) =>
        id === 'c-new'
          ? { view: {}, tabId: 't-new' }
          : id === 'c-old'
            ? { view: { getTabManager: () => ({ closeTab }) }, tabId: 't-old' }
            : null),
    } as never;
  }

  it('closes the displaced tab but fires NO notice when notify is false', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);

    await reconcileRotation(pluginWithOpenReplacement(closeTab), 'roster:a', 'c-old', 'c-new', { notify: false });

    expect(closeTab).toHaveBeenCalledWith('t-old', true);
    expect(mockNotice).not.toHaveBeenCalled();
  });

  it('fires the provider-rotated notice when notify is true (default contract)', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);

    await reconcileRotation(pluginWithOpenReplacement(closeTab), 'roster:a', 'c-old', 'c-new', { notify: true });

    expect(mockNotice).toHaveBeenCalledWith(t('teamChat.providerRotated', { agent: 'Ada' }));
    expect(closeTab).toHaveBeenCalledWith('t-old', true);
  });
});
