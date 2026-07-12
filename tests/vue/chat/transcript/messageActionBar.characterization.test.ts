import { Menu } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderCapabilities } from '@/core/providers/types';
import type { ChatMessage, ChatMessageAction } from '@/core/types';
import { MessageActionBar, type MessageActionBarDeps } from '@/features/chat/rendering/MessageActionBar';

/**
 * Characterization test: locks the exact DOM contract the legacy
 * `MessageActionBar` produces for the user-message toolbar (copy + rewind +
 * fork + registered actions, in insertion order), the assistant inline
 * actions group, the rewind mode submenu, and capability/eligibility
 * gating — so `cards/MessageActionBar.vue` can be built to reproduce it
 * exactly. Its Vue parity twin is `messageActionBar.test.ts`.
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

function makeDeps(overrides: Partial<MessageActionBarDeps> = {}): MessageActionBarDeps {
  return {
    plugin: {
      chatMessageActions: [] as ChatMessageAction[],
      getActiveConversationSnapshot: () => ({ id: 'conv-1', title: 't' }),
    } as unknown as MessageActionBarDeps['plugin'],
    getCapabilities: () => baseCapabilities(),
    rewindCallback: vi.fn().mockResolvedValue(undefined),
    forkCallback: vi.fn().mockResolvedValue(undefined),
    isRewindEligible: () => true,
    getMessageEl: () => null,
    getLiveMessageEl: () => undefined,
    deleteLiveMessageEl: () => {},
    ...overrides,
  };
}

function makeAction(overrides: Partial<ChatMessageAction> = {}): ChatMessageAction {
  return {
    id: 'work-order',
    label: 'Create work order',
    icon: 'briefcase',
    isEligible: () => true,
    run: vi.fn(),
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

beforeEach(() => {
  (Menu as typeof Menu & { instances: unknown[] }).instances.length = 0;
});

describe('MessageActionBar characterization', () => {
  it('user toolbar: copy + registered actions, in call order (copy before actions)', () => {
    const msgEl = document.createElement('div');
    const action = makeAction();
    const deps = makeDeps({ plugin: { chatMessageActions: [action], getActiveConversationSnapshot: () => null } as any });
    const bar = new MessageActionBar(deps);

    bar.addUserCopyButton(msgEl, 'hello there');
    bar.addRegisteredMessageActions(msgEl, userMsg);

    const toolbar = msgEl.querySelector('.specorator-user-msg-actions')!;
    expect(toolbar).not.toBeNull();
    const children = Array.from(toolbar.children).map((c) => c.className);
    expect(children).toEqual(['specorator-user-msg-copy-btn', 'specorator-user-msg-action-btn']);

    const copyBtn = toolbar.querySelector('.specorator-user-msg-copy-btn')!;
    expect(copyBtn.getAttribute('aria-label')).toBe('Copy message');

    const actionBtn = toolbar.querySelector('.specorator-user-msg-action-btn')!;
    expect(actionBtn.getAttribute('aria-label')).toBe('Create work order');
    (actionBtn as HTMLElement).click();
    expect(action.run).toHaveBeenCalledWith(userMsg, null);
  });

  it('rewind + fork buttons are inserted first, pushing copy/actions after (fork most recent = first)', () => {
    const msgEl = document.createElement('div');
    const deps = makeDeps();
    const bar = new MessageActionBar(deps);

    bar.addUserCopyButton(msgEl, 'hello there');
    bar.addRegisteredMessageActions(msgEl, userMsg);
    bar.addRewindButton(msgEl, userMsg.id);
    bar.addForkButton(msgEl, userMsg.id);

    const toolbar = msgEl.querySelector('.specorator-user-msg-actions')!;
    const children = Array.from(toolbar.children).map((c) => c.className);
    expect(children).toEqual([
      'specorator-message-fork-btn',
      'specorator-message-rewind-btn',
      'specorator-user-msg-copy-btn',
    ]);
  });

  it('rewind button opens a Menu with conversation-only + code-and-conversation items, calling rewindCallback', async () => {
    const msgEl = document.createElement('div');
    const rewindCallback = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ rewindCallback });
    const bar = new MessageActionBar(deps);

    bar.addRewindButton(msgEl, userMsg.id);
    const btn = msgEl.querySelector('.specorator-message-rewind-btn') as HTMLElement;
    expect(btn.getAttribute('aria-label')).toBeTruthy();

    btn.click();
    const menu = (Menu as typeof Menu & { instances: any[] }).instances[0];
    expect(menu.items.map((item: any) => item.title)).toEqual([
      'Rewind conversation only',
      'Rewind code + conversation',
    ]);
    expect(menu.items.map((item: any) => item.icon)).toEqual(['message-square', 'rotate-ccw']);

    menu.items[0].clickHandler?.();
    await Promise.resolve();
    expect(rewindCallback).toHaveBeenCalledWith('u1', 'conversation');

    menu.items[1].clickHandler?.();
    await Promise.resolve();
    expect(rewindCallback).toHaveBeenCalledWith('u1', 'code-and-conversation');
  });

  it('fork button calls forkCallback with the message id', () => {
    const msgEl = document.createElement('div');
    const forkCallback = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ forkCallback });
    const bar = new MessageActionBar(deps);

    bar.addForkButton(msgEl, userMsg.id);
    const btn = msgEl.querySelector('.specorator-message-fork-btn') as HTMLElement;
    expect(btn.getAttribute('aria-label')).toBeTruthy();
    btn.click();

    expect(forkCallback).toHaveBeenCalledWith('u1');
  });

  it('omits the rewind button when supportsRewind is false', () => {
    const msgEl = document.createElement('div');
    const deps = makeDeps({ getCapabilities: () => baseCapabilities({ supportsRewind: false }) });
    const bar = new MessageActionBar(deps);

    bar.addRewindButton(msgEl, userMsg.id);
    expect(msgEl.querySelector('.specorator-message-rewind-btn')).toBeNull();
  });

  it('omits the fork button when supportsFork is false', () => {
    const msgEl = document.createElement('div');
    const deps = makeDeps({ getCapabilities: () => baseCapabilities({ supportsFork: false }) });
    const bar = new MessageActionBar(deps);

    bar.addForkButton(msgEl, userMsg.id);
    expect(msgEl.querySelector('.specorator-message-fork-btn')).toBeNull();
  });

  it('refreshActionButtons omits rewind/fork when not eligible', () => {
    const msgEl = document.createElement('div');
    const deps = makeDeps({
      isRewindEligible: () => false,
      getLiveMessageEl: () => msgEl,
    });
    const bar = new MessageActionBar(deps);

    bar.refreshActionButtons(userMsg, [userMsg], 0);

    expect(msgEl.querySelector('.specorator-message-rewind-btn')).toBeNull();
    expect(msgEl.querySelector('.specorator-message-fork-btn')).toBeNull();
  });

  it('assistant inline actions: .specorator-text-actions > .specorator-text-action-btn, anchored to the last text block', () => {
    const msgEl = document.createElement('div');
    const block1 = msgEl.createDiv({ cls: 'specorator-text-block' });
    const block2 = msgEl.createDiv({ cls: 'specorator-text-block' });
    const action = makeAction({ id: 'a', label: 'Do thing', icon: 'zap' });
    const deps = makeDeps({ plugin: { chatMessageActions: [action], getActiveConversationSnapshot: () => null } as any });
    const bar = new MessageActionBar(deps);

    bar.addAssistantMessageActions(msgEl, assistantMsg);

    expect(block1.querySelector('.specorator-text-actions')).toBeNull();
    const container = block2.querySelector('.specorator-text-actions')!;
    expect(container).not.toBeNull();
    const btn = container.querySelector('.specorator-text-action-btn')!;
    expect(btn.getAttribute('aria-label')).toBe('Do thing');
    (btn as HTMLElement).click();
    expect(action.run).toHaveBeenCalledWith(assistantMsg, null);
  });

  it('assistant inline actions render nothing when there are no eligible actions', () => {
    const msgEl = document.createElement('div');
    msgEl.createDiv({ cls: 'specorator-text-block' });
    const deps = makeDeps({ plugin: { chatMessageActions: [], getActiveConversationSnapshot: () => null } as any });
    const bar = new MessageActionBar(deps);

    bar.addAssistantMessageActions(msgEl, assistantMsg);

    expect(msgEl.querySelector('.specorator-text-actions')).toBeNull();
  });
});
