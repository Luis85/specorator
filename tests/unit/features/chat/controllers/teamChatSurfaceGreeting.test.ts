import { greetingForSurface } from '@/features/chat/controllers/teamChatSurface';
import type SpecoratorPlugin from '@/main';

/**
 * A Team Chat DM's empty state is `TeamChatStarters`, which greets the user BY AGENT and
 * offers conversation starters. The shared time-of-day greeting renders on exactly the same
 * condition (`messages.length === 0`), so without this gate an empty DM stacked two
 * greetings above one empty thread.
 */
function pluginWithSurface(surface: 'chat' | 'team-chat' | undefined): SpecoratorPlugin {
  return {
    getConversationSync: () => (surface === undefined ? { id: 'c1' } : { id: 'c1', surface }),
  } as unknown as SpecoratorPlugin;
}

describe('greetingForSurface', () => {
  it('suppresses the shared greeting on a Team Chat DM', () => {
    expect(greetingForSurface(pluginWithSurface('team-chat'), 'c1', 'Good evening')).toBe('');
  });

  it('passes the greeting through on an ordinary chat conversation', () => {
    expect(greetingForSurface(pluginWithSurface('chat'), 'c1', 'Good evening')).toBe('Good evening');
  });

  // Absent `surface` is ad-hoc chat — the pre-existing default, which must be untouched.
  it('passes the greeting through when the conversation declares no surface', () => {
    expect(greetingForSurface(pluginWithSurface(undefined), 'c1', 'Good evening')).toBe('Good evening');
  });

  it('passes the greeting through for a tab with no conversation yet', () => {
    expect(greetingForSurface(pluginWithSurface('team-chat'), null, 'Good evening')).toBe('Good evening');
  });
});
