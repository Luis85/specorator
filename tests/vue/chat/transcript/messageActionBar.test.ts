import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { Menu, setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderCapabilities } from '@/core/providers/types';
import type { ChatMessage } from '@/core/types';
import MessageActionBar from '@/features/chat/ui/vue/transcript/cards/MessageActionBar.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';

/**
 * Parity twin of `messageActionBar.characterization.test.ts`: reproduces
 * the same DOM contract via `MessageActionBar.vue`, sourcing
 * `getCapabilities` / `isRewindEligible` / `onRewind` / `onFork` /
 * `getMessageActions` from the injected callbacks seam instead of
 * `MessageActionBarDeps`.
 */
function baseCapabilities(overrides: Partial<ProviderCapabilities> = {}): ProviderCapabilities {
  return {
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
    reasoningControl: 'effort',
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<TranscriptCallbacks> = {}): TranscriptCallbacks {
  return {
    subscribe: vi.fn(),
    onRewind: vi.fn().mockResolvedValue(undefined),
    onFork: vi.fn().mockResolvedValue(undefined),
    isRewindEligible: vi.fn(() => true),
    openProviderSettings: vi.fn(),
    onRetryLastTurn: null,
    canRetryLastTurn: vi.fn(() => false),
    getMessageActions: vi.fn(() => []),
    copyText: vi.fn(),
    openFile: vi.fn(),
    resolveImageSrc: vi.fn(() => ''),
    showFullImage: vi.fn(),
    getProviderId: vi.fn(() => 'claude'),
    getWorkOrderPath: vi.fn(() => null),
    getCapabilities: vi.fn(() => baseCapabilities()),
    ...overrides,
  };
}

const userMsg: ChatMessage = {
  id: 'u1',
  role: 'user',
  content: 'hello there',
  timestamp: 1,
  userMessageId: 'user-u1',
};

const assistantMsg: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'hi',
  timestamp: 2,
  assistantMessageId: 'assistant-a1',
};

function renderBar(msg: ChatMessage, role: 'user' | 'assistant', callbacks: TranscriptCallbacks) {
  return render(MessageActionBar, {
    props: { msg, role },
    global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
  });
}

beforeEach(() => {
  (Menu as typeof Menu & { instances: unknown[] }).instances.length = 0;
  vi.clearAllMocks();
});

describe('MessageActionBar', () => {
  it('user toolbar: fork, rewind, copy, then registered actions, in that order', () => {
    const action = { id: 'work-order', label: 'Create work order', icon: 'briefcase', run: vi.fn() };
    const callbacks = makeCallbacks({ getMessageActions: vi.fn(() => [action]) });
    const { container } = renderBar(userMsg, 'user', callbacks);

    const toolbar = container.querySelector('.specorator-user-msg-actions')!;
    expect(toolbar).not.toBeNull();
    const children = Array.from(toolbar.children).map((c) => c.className);
    expect(children).toEqual([
      'specorator-message-fork-btn',
      'specorator-message-rewind-btn',
      'specorator-user-msg-copy-btn',
      'specorator-user-msg-action-btn',
    ]);

    const copyBtn = toolbar.querySelector('.specorator-user-msg-copy-btn')!;
    expect(copyBtn.getAttribute('aria-label')).toBe('Copy message');

    const actionBtn = toolbar.querySelector('.specorator-user-msg-action-btn') as HTMLElement;
    expect(actionBtn.getAttribute('aria-label')).toBe('Create work order');
    actionBtn.click();
    expect(action.run).toHaveBeenCalledTimes(1);
  });

  it('rewind button opens a Menu with two mode items that call onRewind', async () => {
    const callbacks = makeCallbacks();
    const { container } = renderBar(userMsg, 'user', callbacks);
    await flushPromises();

    const btn = container.querySelector('.specorator-message-rewind-btn') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(setIcon).toHaveBeenCalledWith(btn, 'rotate-ccw');
    expect(btn.getAttribute('aria-label')).toBeTruthy();

    btn.click();
    const menu = (Menu as typeof Menu & { instances: any[] }).instances[0];
    expect(menu.items.map((item: any) => item.title)).toEqual([
      'Rewind conversation only',
      'Rewind code + conversation',
    ]);

    menu.items[0].clickHandler?.();
    await Promise.resolve();
    expect(callbacks.onRewind).toHaveBeenCalledWith('u1', 'conversation');

    menu.items[1].clickHandler?.();
    await Promise.resolve();
    expect(callbacks.onRewind).toHaveBeenCalledWith('u1', 'code-and-conversation');
  });

  it('fork button calls onFork with the message id', async () => {
    const callbacks = makeCallbacks();
    const { container } = renderBar(userMsg, 'user', callbacks);
    await flushPromises();

    const btn = container.querySelector('.specorator-message-fork-btn') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(setIcon).toHaveBeenCalledWith(btn, 'git-fork');
    btn.click();

    expect(callbacks.onFork).toHaveBeenCalledWith('u1');
  });

  it('omits the rewind button when supportsRewind is false', () => {
    const callbacks = makeCallbacks({ getCapabilities: vi.fn(() => baseCapabilities({ supportsRewind: false })) });
    const { container } = renderBar(userMsg, 'user', callbacks);
    expect(container.querySelector('.specorator-message-rewind-btn')).toBeNull();
    // Fork still renders — gating is independent per capability.
    expect(container.querySelector('.specorator-message-fork-btn')).not.toBeNull();
  });

  it('omits the fork button when supportsFork is false', () => {
    const callbacks = makeCallbacks({ getCapabilities: vi.fn(() => baseCapabilities({ supportsFork: false })) });
    const { container } = renderBar(userMsg, 'user', callbacks);
    expect(container.querySelector('.specorator-message-fork-btn')).toBeNull();
    expect(container.querySelector('.specorator-message-rewind-btn')).not.toBeNull();
  });

  it('omits rewind and fork when isRewindEligible is false', () => {
    const callbacks = makeCallbacks({ isRewindEligible: vi.fn(() => false) });
    const { container } = renderBar(userMsg, 'user', callbacks);
    expect(container.querySelector('.specorator-message-rewind-btn')).toBeNull();
    expect(container.querySelector('.specorator-message-fork-btn')).toBeNull();
  });

  // Characterization (sidebar/Agent-Board unchanged): with no explicit
  // isForkEligible the renderer falls back to isRewindEligible, so fork keeps
  // showing for an eligible fork-capable user message — pre-split behavior.
  it('shows fork for an eligible user message when isForkEligible is not supplied (fallback to rewind eligibility)', () => {
    const callbacks = makeCallbacks({ isRewindEligible: vi.fn(() => true) });
    expect(callbacks.isForkEligible).toBeUndefined();
    const { container } = renderBar(userMsg, 'user', callbacks);
    expect(container.querySelector('.specorator-message-fork-btn')).not.toBeNull();
    expect(container.querySelector('.specorator-message-rewind-btn')).not.toBeNull();
  });

  // Team Chat surface: the split lets a DM hide fork while keeping rewind
  // (rewind is same-conversation and stays safe).
  it('hides fork but keeps rewind when isForkEligible returns false', () => {
    const callbacks = makeCallbacks({
      isRewindEligible: vi.fn(() => true),
      isForkEligible: vi.fn(() => false),
    });
    const { container } = renderBar(userMsg, 'user', callbacks);
    expect(container.querySelector('.specorator-message-fork-btn')).toBeNull();
    expect(container.querySelector('.specorator-message-rewind-btn')).not.toBeNull();
  });

  // The split is independent of rewind: fork can be eligible while rewind is
  // gated only by its own capability/eligibility (both true here → both show).
  it('shows fork when isForkEligible returns true', () => {
    const callbacks = makeCallbacks({
      isRewindEligible: vi.fn(() => true),
      isForkEligible: vi.fn(() => true),
    });
    const { container } = renderBar(userMsg, 'user', callbacks);
    expect(container.querySelector('.specorator-message-fork-btn')).not.toBeNull();
    expect(container.querySelector('.specorator-message-rewind-btn')).not.toBeNull();
  });

  it('renders no user toolbar at all when there is no text, no rewind, and no fork', () => {
    const callbacks = makeCallbacks({
      isRewindEligible: vi.fn(() => false),
      getMessageActions: vi.fn(() => []),
    });
    const emptyMsg: ChatMessage = { id: 'u2', role: 'user', content: '', timestamp: 3 };
    const { container } = renderBar(emptyMsg, 'user', callbacks);
    expect(container.querySelector('.specorator-user-msg-actions')).toBeNull();
  });

  it('assistant role: renders a self-contained .specorator-text-actions group', async () => {
    const action = { id: 'a', label: 'Do thing', icon: 'zap', run: vi.fn() };
    const callbacks = makeCallbacks({ getMessageActions: vi.fn(() => [action]) });
    const { container } = renderBar(assistantMsg, 'assistant', callbacks);
    await flushPromises();

    const group = container.querySelector('.specorator-text-actions')!;
    expect(group).not.toBeNull();
    const btn = group.querySelector('.specorator-text-action-btn') as HTMLElement;
    expect(btn.getAttribute('aria-label')).toBe('Do thing');
    expect(setIcon).toHaveBeenCalledWith(btn, 'zap');
    btn.click();
    expect(action.run).toHaveBeenCalledTimes(1);

    // Assistant role never shows the user toolbar / rewind / fork.
    expect(container.querySelector('.specorator-user-msg-actions')).toBeNull();
    expect(container.querySelector('.specorator-message-rewind-btn')).toBeNull();
    expect(container.querySelector('.specorator-message-fork-btn')).toBeNull();
  });

  it('assistant role: renders nothing when there are no registered actions', () => {
    const callbacks = makeCallbacks({ getMessageActions: vi.fn(() => []) });
    const { container } = renderBar(assistantMsg, 'assistant', callbacks);
    expect(container.querySelector('.specorator-text-actions')).toBeNull();
  });

  it('omits rewind/fork/registered actions (but still shows copy) when callbacks are absent', () => {
    const { container } = render(MessageActionBar, { props: { msg: userMsg, role: 'user' } });
    expect(container.querySelector('.specorator-message-rewind-btn')).toBeNull();
    expect(container.querySelector('.specorator-message-fork-btn')).toBeNull();
    expect(container.querySelector('.specorator-user-msg-action-btn')).toBeNull();
    expect(container.querySelector('.specorator-user-msg-copy-btn')).not.toBeNull();
  });
});
