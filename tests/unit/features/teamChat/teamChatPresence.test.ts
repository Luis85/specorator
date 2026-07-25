import { type PresenceTabView, projectTeamChatPresence } from '@/features/teamChat/teamChatPresence';

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
