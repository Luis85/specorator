import { refreshBoundAgentDisplayModels } from '@/features/chat/tabs/tabShared';

function makeTab(conversationId: string | null, displayModel: unknown = null) {
  return { conversationId, displayModel } as never as {
    conversationId: string | null;
    displayModel: unknown;
  };
}

describe('refreshBoundAgentDisplayModels', () => {
  it('recomputes each bound tab to its agent model, clears unbound, skips blank', async () => {
    const boundTab = makeTab('c1', { conversationId: 'c1', model: 'old-opus' });
    const unboundTab = makeTab('c2');
    const blankTab = makeTab(null);
    const plugin = {
      getConversationById: jest.fn(async (id: string) => (
        id === 'c1' ? { id: 'c1', providerId: 'claude', boundAgentId: 'agent-1' }
          : id === 'c2' ? { id: 'c2', providerId: 'claude' }
            : null
      )),
      resolveBoundAgent: jest.fn(async () => ({ slug: 'agent-1', model: 'new-haiku' })),
    } as never as Parameters<typeof refreshBoundAgentDisplayModels>[0];

    await refreshBoundAgentDisplayModels(plugin, [boundTab, unboundTab, blankTab] as never);

    // Same conversation, edited agent model → seed tracks the NEW model (the key
    // wouldn't invalidate it, which is exactly why roster:changed calls this).
    expect(boundTab.displayModel).toEqual({ conversationId: 'c1', model: 'new-haiku' });
    // Unbound conversation → cleared; blank tab (no conversationId) → left alone.
    expect(unboundTab.displayModel).toBeNull();
    expect(blankTab.displayModel).toBeNull();
    // Blank tab is skipped before any lookup.
    expect((plugin as unknown as { getConversationById: jest.Mock }).getConversationById)
      .not.toHaveBeenCalledWith(null);
    expect((plugin as unknown as { resolveBoundAgent: jest.Mock }).resolveBoundAgent)
      .toHaveBeenCalledWith('agent-1', 'claude');
  });
});
