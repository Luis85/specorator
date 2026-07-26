import type { ChatMessage, Conversation } from '@/core/types';
import {
  deriveUnreadAgents,
  projectThreadMetas,
  type TeamChatThreadMeta,
  updateSeenBaseline,
} from '@/features/teamChat/teamChatThreadMeta';
import type SpecoratorPlugin from '@/main';

/**
 * The roster rail's DM projection: last-message preview, activity timestamp, and the
 * per-leaf unread signal. These run inside the view's snapshot projection, which fires on
 * every stream frame — so the contract under test is "synchronous, total, and never throws
 * on a missing conversation", as much as the values themselves.
 */

function message(role: 'user' | 'assistant', content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `m-${content}`, role, content, timestamp: 1, ...extra } as ChatMessage;
}

function conversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    providerId: 'claude',
    title: 'DM',
    createdAt: 1,
    updatedAt: 100,
    sessionId: null,
    messages: [],
    ...overrides,
  } as Conversation;
}

function pluginWith(conversations: Conversation[]): SpecoratorPlugin {
  const byId = new Map(conversations.map((c) => [c.id, c]));
  return { getConversationSync: (id: string) => byId.get(id) ?? null } as unknown as SpecoratorPlugin;
}

describe('projectThreadMetas', () => {
  it('previews the LAST message, not the first — a DM list shows what was just said', () => {
    const plugin = pluginWith([
      conversation('conv-a', {
        messages: [message('user', 'first thing'), message('assistant', 'latest reply')],
      }),
    ]);

    const metas = projectThreadMetas(plugin, { 'roster:a': 'conv-a' });

    expect(metas['roster:a'].preview).toBe('latest reply');
  });

  it('prefers displayContent so an encoded turn previews as the transcript shows it', () => {
    const plugin = pluginWith([
      conversation('conv-a', {
        messages: [message('user', '<protocol>raw wire form</protocol>', { displayContent: 'what the user sees' })],
      }),
    ]);

    expect(projectThreadMetas(plugin, { 'roster:a': 'conv-a' })['roster:a'].preview)
      .toBe('what the user sees');
  });

  it('flattens whitespace so a multi-paragraph response previews as one line', () => {
    const plugin = pluginWith([
      conversation('conv-a', { messages: [message('assistant', 'line one\n\n   line two')] }),
    ]);

    expect(projectThreadMetas(plugin, { 'roster:a': 'conv-a' })['roster:a'].preview)
      .toBe('line one line two');
  });

  it('walks back past text-less messages so a tool-only tail does not blank the row', () => {
    const plugin = pluginWith([
      conversation('conv-a', {
        messages: [message('assistant', 'the real answer'), message('assistant', '   ')],
      }),
    ]);

    expect(projectThreadMetas(plugin, { 'roster:a': 'conv-a' })['roster:a'].preview)
      .toBe('the real answer');
  });

  it('truncates a long preview rather than projecting an unbounded string every frame', () => {
    const plugin = pluginWith([
      conversation('conv-a', { messages: [message('assistant', 'x'.repeat(500))] }),
    ]);

    const preview = projectThreadMetas(plugin, { 'roster:a': 'conv-a' })['roster:a'].preview;

    expect(preview.length).toBeLessThanOrEqual(121); // 120 chars + the ellipsis
    expect(preview.endsWith('…')).toBe(true);
  });

  it('prefers lastResponseAt over updatedAt for the activity timestamp', () => {
    const plugin = pluginWith([conversation('conv-a', { updatedAt: 100, lastResponseAt: 250 })]);

    expect(projectThreadMetas(plugin, { 'roster:a': 'conv-a' })['roster:a'].updatedAt).toBe(250);
  });

  // The rail must never block a render on a conversation that isn't loaded.
  it('omits an unloaded or deleted conversation instead of throwing', () => {
    const plugin = pluginWith([]);

    const metas = projectThreadMetas(plugin, { 'roster:a': 'conv-missing' });

    expect(metas).toEqual({});
  });

  it('projects an empty preview for a resolved-but-empty thread', () => {
    const plugin = pluginWith([conversation('conv-a', { messages: [] })]);

    expect(projectThreadMetas(plugin, { 'roster:a': 'conv-a' })['roster:a'].preview).toBe('');
  });
});

describe('updateSeenBaseline + deriveUnreadAgents', () => {
  const meta = (updatedAt: number): TeamChatThreadMeta => ({ conversationId: 'c', preview: 'p', updatedAt });

  it('never marks an agent unread on its FIRST observation (leaf-open baseline)', () => {
    const metas = { 'roster:a': meta(500) };
    const seen = new Map<string, number>();

    updateSeenBaseline(metas, seen, null);

    expect(deriveUnreadAgents(metas, seen, null)).toEqual({});
  });

  it('marks an agent unread once its thread advances past the seen baseline', () => {
    const seen = new Map<string, number>();
    updateSeenBaseline({ 'roster:a': meta(500) }, seen, null);

    const moved = { 'roster:a': meta(900) };
    updateSeenBaseline(moved, seen, null); // no-op for an already-stamped, non-active agent

    expect(deriveUnreadAgents(moved, seen, null)).toEqual({ 'roster:a': true });
  });

  // You are looking at it right now, whatever the timestamps say.
  it('never marks the ACTIVE agent unread', () => {
    const seen = new Map<string, number>([['roster:a', 100]]);

    expect(deriveUnreadAgents({ 'roster:a': meta(900) }, seen, 'roster:a')).toEqual({});
  });

  // Without the re-stamp, watching an agent stream and then switching away would mark it
  // unread for messages that arrived while you were reading them.
  it('re-stamps the active agent so a watched stream never becomes unread on switch-away', () => {
    const seen = new Map<string, number>([['roster:a', 100]]);

    // Frames arrive while 'roster:a' is active…
    updateSeenBaseline({ 'roster:a': meta(900) }, seen, 'roster:a');
    // …then the user switches to another DM.
    expect(deriveUnreadAgents({ 'roster:a': meta(900) }, seen, 'roster:b')).toEqual({});
  });

  it('never marks a resolved-but-empty thread unread', () => {
    const seen = new Map<string, number>([['roster:a', 0]]);

    expect(deriveUnreadAgents({ 'roster:a': meta(0) }, seen, null)).toEqual({});
  });

  it('does not re-seed an already-stamped agent (which would clear a real badge)', () => {
    const seen = new Map<string, number>([['roster:a', 100]]);

    updateSeenBaseline({ 'roster:a': meta(900) }, seen, null);

    expect(seen.get('roster:a')).toBe(100);
  });
});
