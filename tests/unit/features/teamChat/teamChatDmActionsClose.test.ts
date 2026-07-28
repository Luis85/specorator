import { closeAgentDmTab } from '@/features/teamChat/teamChatDmActions';
import type SpecoratorPlugin from '@/main';

/**
 * The user-initiated DM close has two contracts beyond "close the tab":
 *
 *  - it resolves the owning tab ACROSS LEAVES, because the open coordinator single-mounts a
 *    DM and reveals it wherever it already lives — the row you click in leaf A may be
 *    mounted in leaf B, and a same-leaf lookup would silently no-op; and
 *  - it closes NON-FORCED, so `closeTabImpl` re-checks `isStreaming` inside the serialized
 *    mutation. The caller's own pre-check is stale once the close queues behind another tab
 *    mutation — a turn can start in that window, and a forced close would truncate it.
 */
function makeManager(tabs: Array<{ conversationId: string; isStreaming: boolean }>) {
  return {
    closeTab: jest.fn().mockResolvedValue(true),
    getAllTabs: () => tabs.map((t) => ({
      conversationId: t.conversationId,
      state: { isStreaming: t.isStreaming },
    })),
  };
}

function makePlugin(options: {
  threadConversationId?: string | null;
  owner?: { manager: ReturnType<typeof makeManager>; tabId: string } | null;
}): SpecoratorPlugin {
  const owner = options.owner ?? null;
  return {
    getTeamChatThreadStore: () => ({
      get: jest.fn().mockResolvedValue(options.threadConversationId ?? null),
    }),
    findConversationAcrossViews: jest.fn(() =>
      (owner ? { view: { getTabManager: () => owner.manager }, tabId: owner.tabId } : null)),
    events: { emit: jest.fn() },
  } as unknown as SpecoratorPlugin;
}

describe('closeAgentDmTab', () => {
  it('closes the DM in whichever leaf owns it, WITHOUT forcing', async () => {
    const manager = makeManager([{ conversationId: 'conv-1', isStreaming: false }]);
    const plugin = makePlugin({ threadConversationId: 'conv-1', owner: { manager, tabId: 'tab-9' } });

    const closed = await closeAgentDmTab(plugin, 'roster:a');

    expect(closed).toBe(true);
    // `force` false — eviction/rotation force; a user close must let the serialized
    // mutation re-check streaming.
    expect(manager.closeTab).toHaveBeenCalledWith('tab-9', false);
  });

  it('refuses up front when the owning leaf reports the DM streaming', async () => {
    const manager = makeManager([{ conversationId: 'conv-1', isStreaming: true }]);
    const plugin = makePlugin({ threadConversationId: 'conv-1', owner: { manager, tabId: 'tab-9' } });

    expect(await closeAgentDmTab(plugin, 'roster:a')).toBe(false);
    expect(manager.closeTab).not.toHaveBeenCalled();
  });

  it('no-ops when the agent has no mapped thread', async () => {
    const plugin = makePlugin({ threadConversationId: null });

    expect(await closeAgentDmTab(plugin, 'roster:a')).toBe(false);
  });

  // Mapped but evicted / never opened: nothing to close, and definitely not an error.
  it('no-ops when the mapped DM is open in no leaf', async () => {
    const plugin = makePlugin({ threadConversationId: 'conv-1', owner: null });

    expect(await closeAgentDmTab(plugin, 'roster:a')).toBe(false);
  });
});
