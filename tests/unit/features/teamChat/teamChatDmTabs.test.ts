import { closeRotatedDmTab, reconcileRotation, restoreTeamChatDmTabs } from '@/features/teamChat/teamChatDmTabs';

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

    expect(createTab).toHaveBeenCalledWith('c1', 't1', { activate: false, kind: 'chat' });
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

describe('closeRotatedDmTab', () => {
  it('force-closes the old tab only when the new tab actually opened', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    const plugin = {
      findConversationAcrossViews: jest.fn((id: string) =>
        id === 'c-new'
          ? { view: {}, tabId: 't-new' }
          : { view: { getTabManager: () => ({ closeTab }) }, tabId: 't-old' }),
    } as never;

    await closeRotatedDmTab(plugin, 'c-old', 'c-new');

    expect(closeTab).toHaveBeenCalledWith('t-old', true);
  });

  it('no-ops when the new tab did not open (cap-blocked rotation)', async () => {
    const closeTab = jest.fn();
    const plugin = {
      findConversationAcrossViews: jest.fn((id: string) =>
        id === 'c-new' ? null : { view: { getTabManager: () => ({ closeTab }) }, tabId: 't-old' }),
    } as never;

    await closeRotatedDmTab(plugin, 'c-old', 'c-new');

    expect(closeTab).not.toHaveBeenCalled();
  });
});

describe('reconcileRotation — deferred rotation close (:361)', () => {
  it('defers the displaced close while the replacement is cap-blocked, then closes on the retry', async () => {
    const closeTab = jest.fn().mockResolvedValue(true);
    let replacementOpen = false; // the rotation's new tab hit the cap on the first attempt
    const plugin = {
      agentRosterStore: { get: jest.fn().mockResolvedValue({ name: 'Ada' }) },
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
