import { closeAgentDmTab } from '@/features/teamChat/teamChatDmActions';
import type SpecoratorPlugin from '@/main';

/**
 * The user-initiated DM close promises to refuse a streaming DM. Its own pre-check is only
 * an optimization: by the time the close is dequeued behind another tab mutation, a turn may
 * have started. The guarantee is the NON-FORCED close, which re-checks `isStreaming` inside
 * `closeTabImpl`'s serialized mutation — a forced close would truncate the live response.
 */
function makeManager(tabs: Array<{ id: string; conversationId: string; isStreaming: boolean }>) {
  const closeTab = jest.fn().mockResolvedValue(true);
  return {
    closeTab,
    getAllTabs: () => tabs.map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      state: { isStreaming: t.isStreaming },
    })),
  } as never;
}

function makePlugin(boundAgentByConversation: Record<string, string>): SpecoratorPlugin {
  return {
    getConversationSync: (id: string) => ({ id, boundAgentId: boundAgentByConversation[id] }),
    events: { emit: jest.fn() },
  } as unknown as SpecoratorPlugin;
}

describe('closeAgentDmTab', () => {
  it('closes the agent DM WITHOUT forcing, so streaming is re-checked in the serialized mutation', async () => {
    const manager = makeManager([{ id: 'tab-1', conversationId: 'conv-1', isStreaming: false }]);
    const plugin = makePlugin({ 'conv-1': 'roster:a' });

    await closeAgentDmTab(plugin, manager, 'roster:a');

    // `force` must be false — the whole point: eviction/rotation force, a user close must not.
    expect((manager as never as { closeTab: jest.Mock }).closeTab).toHaveBeenCalledWith('tab-1', false);
  });

  it('refuses up front when the DM is already streaming', async () => {
    const manager = makeManager([{ id: 'tab-1', conversationId: 'conv-1', isStreaming: true }]);
    const plugin = makePlugin({ 'conv-1': 'roster:a' });

    const closed = await closeAgentDmTab(plugin, manager, 'roster:a');

    expect(closed).toBe(false);
    expect((manager as never as { closeTab: jest.Mock }).closeTab).not.toHaveBeenCalled();
  });

  it('no-ops when the agent has no open DM', async () => {
    const manager = makeManager([{ id: 'tab-1', conversationId: 'conv-1', isStreaming: false }]);
    const plugin = makePlugin({ 'conv-1': 'roster:other' });

    expect(await closeAgentDmTab(plugin, manager, 'roster:a')).toBe(false);
    expect((manager as never as { closeTab: jest.Mock }).closeTab).not.toHaveBeenCalled();
  });
});
