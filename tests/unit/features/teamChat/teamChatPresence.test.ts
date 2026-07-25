import { type PresenceTabView, projectCrossLeafPresence, projectTeamChatPresence } from '@/features/teamChat/teamChatPresence';

/** A tab bound to `conversationId`, streaming or not. */
function tab(conversationId: string | null, isStreaming: boolean): PresenceTabView {
  return { conversationId, state: { isStreaming } };
}

/** Resolver over a conversationId → boundAgentId table (null = unbound). */
function resolver(map: Record<string, string | null>) {
  return (conversationId: string): string | null => map[conversationId] ?? null;
}

describe('projectTeamChatPresence', () => {
  it('marks a streaming DM tab\'s bound agent as busy', () => {
    const presence = projectTeamChatPresence(
      [tab('conv-1', true)],
      resolver({ 'conv-1': 'roster:a' }),
    );
    expect(presence).toEqual({ 'roster:a': 'busy' });
  });

  it('leaves an agent whose DM tab is idle absent (reader defaults to idle)', () => {
    const presence = projectTeamChatPresence(
      [tab('conv-1', false)],
      resolver({ 'conv-1': 'roster:a' }),
    );
    // Absent, not literally 'idle' — the reader (`?? 'idle'`) renders it idle.
    expect(presence).toEqual({});
    expect(presence['roster:a']).toBeUndefined();
  });

  it('returns an empty map when no tabs are open (an agent with no DM is idle)', () => {
    expect(projectTeamChatPresence([], resolver({}))).toEqual({});
  });

  it('ignores a streaming tab with no bound agent (blank/unbound conversation)', () => {
    const presence = projectTeamChatPresence(
      [tab('conv-blank', true)],
      resolver({ 'conv-blank': null }),
    );
    expect(presence).toEqual({});
  });

  it('ignores a streaming tab with no conversation id', () => {
    const presence = projectTeamChatPresence([tab(null, true)], resolver({}));
    expect(presence).toEqual({});
  });

  it('projects only the busy agents across a mixed tab set', () => {
    const presence = projectTeamChatPresence(
      [tab('conv-a', true), tab('conv-b', false), tab('conv-c', true)],
      resolver({ 'conv-a': 'roster:a', 'conv-b': 'roster:b', 'conv-c': 'roster:c' }),
    );
    expect(presence).toEqual({ 'roster:a': 'busy', 'roster:c': 'busy' });
  });
});

describe('projectCrossLeafPresence — cross-leaf aggregation (Fix 3)', () => {
  /** A leaf whose engine exposes `tabs`. */
  function leaf(tabs: PresenceTabView[]) {
    return { getTabManager: () => ({ getAllTabs: () => tabs }) };
  }

  it('marks an agent busy from a DM streaming in ANOTHER leaf', () => {
    const plugin = {
      // The DM-open coordinator single-mounts the DM in leaf A; leaf B has nothing open.
      getAllViews: () => [leaf([tab('conv-a', true)]), leaf([])],
      getConversationSync: (id: string) => (id === 'conv-a' ? { boundAgentId: 'roster:a' } : null),
    } as never;

    // Aggregated across leaves, so leaf B's roster still shows agent a busy.
    expect(projectCrossLeafPresence(plugin)).toEqual({ 'roster:a': 'busy' });
  });

  it('tolerates a leaf whose engine is absent (getTabManager() null)', () => {
    const plugin = {
      getAllViews: () => [{ getTabManager: () => null }, leaf([tab('conv-a', true)])],
      getConversationSync: () => ({ boundAgentId: 'roster:a' }),
    } as never;

    expect(projectCrossLeafPresence(plugin)).toEqual({ 'roster:a': 'busy' });
  });

  it('is empty when no leaf has a streaming DM', () => {
    const plugin = {
      getAllViews: () => [leaf([tab('conv-a', false)]), leaf([])],
      getConversationSync: () => ({ boundAgentId: 'roster:a' }),
    } as never;

    expect(projectCrossLeafPresence(plugin)).toEqual({});
  });
});
