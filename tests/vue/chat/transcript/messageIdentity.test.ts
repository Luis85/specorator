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
 * The load-bearing assertion here is the NEGATIVE one: with `getMessageIdentity` absent —
 * which is every non-Team-Chat surface — the transcript must render exactly as it did
 * before, so the sidebar chat is untouched by this feature.
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

function makePlugin(): SpecoratorPlugin {
  return {
    app: new App(),
    settings: { mediaFolder: '', expandFileEditsByDefault: true },
  } as unknown as SpecoratorPlugin;
}

function makeCallbacks(
  projection: TabTranscriptProjection,
  overrides: Partial<TranscriptCallbacks> = {},
): TranscriptCallbacks {
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
    ...overrides,
  };
}

function message(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return { id, role, content, timestamp: 1 } as ChatMessage;
}

async function mountWith(messages: ChatMessage[], overrides: Partial<TranscriptCallbacks> = {}) {
  const state = new ChatState();
  state.messages = messages;
  const projection = new TabTranscriptProjection(state);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = mountTranscript(container, makePlugin(), new Component(), makeCallbacks(projection, overrides));
  projection.emit();
  await flushPromises();
  return { container, dispose: () => { mounted.unmount(); container.remove(); } };
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
  // The sidebar-parity guarantee: no callback, no header, nothing changed.
  it('renders NO identity header when the surface supplies no identity', async () => {
    const { container, dispose } = await mountWith([message('a1', 'assistant', 'hello')]);

    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    dispose();
  });

  it('attributes an assistant message when the surface supplies a persona', async () => {
    const { container, dispose } = await mountWith(
      [message('a1', 'assistant', 'hello')],
      { getMessageIdentity: () => PERSONA },
    );

    expect(identityNames(container)).toEqual(['Ada']);
    expect(renderAgentAvatar).toHaveBeenCalledWith(
      expect.anything(),
      PERSONA,
      expect.any(Number),
      expect.anything(),
    );

    dispose();
  });

  // Grouping is what keeps a tool-heavy turn from becoming an avatar wall.
  it('groups consecutive assistant messages under ONE header', async () => {
    const { container, dispose } = await mountWith(
      [
        message('a1', 'assistant', 'first'),
        message('a2', 'assistant', 'second'),
        message('a3', 'assistant', 'third'),
      ],
      { getMessageIdentity: () => PERSONA },
    );

    expect(identityNames(container)).toEqual(['Ada']);

    dispose();
  });

  it('starts a new header after a user turn interrupts the run', async () => {
    const { container, dispose } = await mountWith(
      [
        message('a1', 'assistant', 'first'),
        message('u1', 'user', 'a question'),
        message('a2', 'assistant', 'second'),
      ],
      { getMessageIdentity: () => PERSONA },
    );

    expect(identityNames(container)).toEqual(['Ada', 'Ada']);

    dispose();
  });

  it('never attributes a USER message', async () => {
    const { container, dispose } = await mountWith(
      [message('u1', 'user', 'a question')],
      { getMessageIdentity: () => PERSONA },
    );

    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    dispose();
  });

  // A DM whose agent left the roster is read-only; attributing its messages to a deleted
  // agent would be worse than anonymity.
  it('renders anonymously when the bound agent has left the roster', async () => {
    const { container, dispose } = await mountWith(
      [message('a1', 'assistant', 'hello')],
      { getMessageIdentity: () => null },
    );

    expect(container.querySelector('.specorator-message-identity')).toBeNull();

    dispose();
  });

  // The four still-imperative consumers query these; the header is purely additive.
  it('leaves the message shell classes the imperative consumers read untouched', async () => {
    const { container, dispose } = await mountWith(
      [message('u1', 'user', 'a question'), message('a1', 'assistant', 'hello')],
      { getMessageIdentity: () => PERSONA },
    );

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
