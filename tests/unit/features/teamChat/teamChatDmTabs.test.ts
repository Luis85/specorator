import { closeRotatedDmTab, restoreTeamChatDmTabs } from '@/features/teamChat/teamChatDmTabs';

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
