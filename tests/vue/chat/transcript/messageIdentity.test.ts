import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import type { AgentPersona } from '@/features/agents/agentTypes';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Surface-gated agent attribution in the transcript (Team Chat DMs only).
 *
 * Two load-bearing properties:
 *  - the NEGATIVE one: with no projected identity — which is every non-Team-Chat surface —
 *    the transcript renders exactly as it did before, so the sidebar chat is untouched; and
 *  - REACTIVITY: the persona is resolved asynchronously (roster store) and pushed AFTER the
 *    transcript mounts, so a header must appear on a transcript that was already rendered.
 *    An earlier draft read the identity through a callback inside a computed, which is
 *    untracked — restored transcripts stayed anonymous and renamed agents stayed stale.
 */

// renderAgentAvatar is imperative (createSpan/setIcon); stub it so these assertions are
// about attribution placement and grouping, not avatar internals.
const { renderAgentAvatar } = vi.hoisted(() => ({ renderAgentAvatar: vi.fn() }));
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar }));

const CAPABILITIES = {
  providerId: 'claude',
  supportsPersistentRuntime: true,
  supportsNativeHistory: true,
  supportsPlanMode: true,
  supportsRewind: true,
  supportsFork: true,
  supportsProviderCommands: true,
  supportsImageAttachments: true,
  supportsInstructionMode: true,
  supportsMcpTools: true,
  reasoningControl: 'effort' as const,
};

const PERSONA: AgentPersona = {
  id: 'roster:ada',
  name: 'Ada',
  color: 'var(--color-purple)',
  initials: 'AD',
  builtin: false,
};

const RENAMED: AgentPersona = { ...PERSONA, name: 'Ada Lovelace' };

function makePlugin(): SpecoratorPlugin {
  return {
    app: new App(),
    settings: { mediaFolder: '', expandFileEditsByDefault: true },
  } as unknown as SpecoratorPlugin;
}

function makeCallbacks(projection: TabTranscriptProjection): TranscriptCallbacks {
  return {
    subscribe: projection.subscribe,
    onRewind: vi.fn(),
    onFork: vi.fn(),
    isRewindEligible: vi.fn(() => true),
    openProviderSettings: vi.fn(),
    onRetryLastTurn: vi.fn(),
    canRetryLastTurn: vi.fn(() => true),
    getMessageActions: vi.fn(() => []),
    copyText: vi.fn(),
    openFile: vi.fn(),
    resolveImageSrc: vi.fn(() => ''),
    showFullImage: vi.fn(),
    getProviderId: vi.fn(() => 'claude'),
    getWorkOrderPath: vi.fn(() => null),
    getCapabilities: vi.fn(() => CAPABILITIES),
  };
}

function message(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return { id, role, content, timestamp: 1 } as ChatMessage;
}

const CONVERSATION_ID = 'conv-dm';

/** Mounts a transcript over a real `TabTranscriptProjection`, so the identity flows through
 *  the same push path the engine uses. */
async function mountWith(messages: ChatMessage[]) {
  const state = new ChatState();
  state.messages = messages;
  state.currentConversationId = CONVERSATION_ID;
  const projection = new TabTranscriptProjection(state);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = mountTranscript(container, makePlugin(), new Component(), makeCallbacks(projection));
  projection.emit();
  await flushPromises();
  return { container, projection, dispose: () => { mounted.unmount(); container.remove(); } };
}

function identityNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.specorator-message-identity-name')]
    .map((el) => el.textContent ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('transcript agent identity', () => {
  // The sidebar-parity guarantee: no projected identity, no header, nothing changed.
  it('renders NO identity header when the surface projects no identity', async () => {
    const { container, dispose } = await mountWith([message('a1', 'assistant', 'hello')]);

    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    dispose();
  });

  // The reactivity guarantee. The roster store is async, so this is the REAL ordering:
  // the transcript renders first and the persona lands afterwards.
  it('adds the header when a persona is pushed AFTER the transcript has rendered', async () => {
    const { container, projection, dispose } = await mountWith([message('a1', 'assistant', 'hello')]);
    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    projection.setMessageIdentity(PERSONA, CONVERSATION_ID);
    await flushPromises();

    expect(identityNames(container)).toEqual(['Ada']);
    expect(renderAgentAvatar).toHaveBeenCalledWith(
      expect.anything(),
      PERSONA,
      expect.any(Number),
      expect.anything(),
    );

    dispose();
  });

  it('repaints the header when the agent is renamed', async () => {
    const { container, projection, dispose } = await mountWith([message('a1', 'assistant', 'hello')]);
    projection.setMessageIdentity(PERSONA, CONVERSATION_ID);
    await flushPromises();

    projection.setMessageIdentity(RENAMED, CONVERSATION_ID);
    await flushPromises();

    expect(identityNames(container)).toEqual(['Ada Lovelace']);

    dispose();
  });

  // A rotation mints a FRESH conversation; the previous agent's persona must not carry over.
  it('drops the header when the persona was resolved for another conversation', async () => {
    const { container, projection, dispose } = await mountWith([message('a1', 'assistant', 'hello')]);

    projection.setMessageIdentity(PERSONA, 'conv-rotated-away');
    await flushPromises();

    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    dispose();
  });

  // Grouping is what keeps a tool-heavy turn from becoming an avatar wall.
  it('groups consecutive assistant messages under ONE header', async () => {
    const { container, projection, dispose } = await mountWith([
      message('a1', 'assistant', 'first'),
      message('a2', 'assistant', 'second'),
      message('a3', 'assistant', 'third'),
    ]);

    projection.setMessageIdentity(PERSONA, CONVERSATION_ID);
    await flushPromises();

    expect(identityNames(container)).toEqual(['Ada']);

    dispose();
  });

  it('starts a new header after a user turn interrupts the run', async () => {
    const { container, projection, dispose } = await mountWith([
      message('a1', 'assistant', 'first'),
      message('u1', 'user', 'a question'),
      message('a2', 'assistant', 'second'),
    ]);

    projection.setMessageIdentity(PERSONA, CONVERSATION_ID);
    await flushPromises();

    expect(identityNames(container)).toEqual(['Ada', 'Ada']);

    dispose();
  });

  it('never attributes a USER message', async () => {
    const { container, projection, dispose } = await mountWith([message('u1', 'user', 'a question')]);

    projection.setMessageIdentity(PERSONA, CONVERSATION_ID);
    await flushPromises();

    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    dispose();
  });

  // A DM whose agent left the roster is read-only; attributing its messages to a deleted
  // agent would be worse than anonymity.
  it('clears the header when the bound agent leaves the roster', async () => {
    const { container, projection, dispose } = await mountWith([message('a1', 'assistant', 'hello')]);
    projection.setMessageIdentity(PERSONA, CONVERSATION_ID);
    await flushPromises();
    expect(identityNames(container)).toEqual(['Ada']);

    projection.setMessageIdentity(null, CONVERSATION_ID);
    await flushPromises();

    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    dispose();
  });

  // The four still-imperative consumers query these; the header is purely additive.
  it('leaves the message shell classes the imperative consumers read untouched', async () => {
    const { container, projection, dispose } = await mountWith([
      message('u1', 'user', 'a question'),
      message('a1', 'assistant', 'hello'),
    ]);

    projection.setMessageIdentity(PERSONA, CONVERSATION_ID);
    await flushPromises();

    expect(container.querySelector('.specorator-messages')).toBeTruthy();
    expect(container.querySelector('.specorator-message-user')).toBeTruthy();
    expect(container.querySelector('.specorator-message-assistant')).toBeTruthy();
    // The header lives INSIDE the message content, so it can't shift the shell's
    // offsetTop-based navigation scan.
    expect(
      container.querySelector('.specorator-message-content .specorator-message-identity'),
    ).toBeTruthy();

    dispose();
  });
});
