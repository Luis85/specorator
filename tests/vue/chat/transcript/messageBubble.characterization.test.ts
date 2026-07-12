import '@/providers';

import { App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage, ChatMessageAction } from '@/core/types';
import { MessageRenderer } from '@/features/chat/rendering/MessageRenderer';

/**
 * Characterization test: locks the exact shell/assembly DOM contract the
 * legacy `MessageRenderer.renderStoredMessage` (+ `renderStoredUserMessage`
 * / `renderStoredAssistantMessage` / `createMessageShell` /
 * `renderInterruptMessage` / `appendInterruptIndicator`, delegating block
 * dispatch to `renderAssistantMessageContent`) produces — shell classes/
 * attributes, content-block dispatch order, leftover tool calls, the legacy
 * no-contentBlocks fallback, and the duration footer — so `BlockList.vue` +
 * `MessageBubble.vue` can be built to reproduce it exactly.
 *
 * Leaf tool/thinking/subagent/write-edit renderers are already characterized
 * elsewhere (`toolCall.characterization.test.ts`, `writeEdit.characterization.test.ts`,
 * `subagent.characterization.test.ts`, `thinkingBlock.characterization.test.ts`)
 * so they're mocked here to identifiable marker elements — this test locks
 * ASSEMBLY (ordering, nesting, gating), not leaf DOM shape. Its Vue parity
 * twins are `blockList.test.ts` and `messageBubble.test.ts`.
 */
vi.mock('@/features/chat/rendering/SubagentRenderer', () => ({
  renderStoredAsyncSubagent: vi.fn((_app: unknown, contentEl: HTMLElement, subagent: { id: string }) =>
    contentEl.createDiv({ cls: 'mock-async-subagent', attr: { 'data-subagent-id': subagent.id } })),
  renderStoredSubagent: vi.fn((_app: unknown, contentEl: HTMLElement, subagent: { id: string }) =>
    contentEl.createDiv({ cls: 'mock-subagent', attr: { 'data-subagent-id': subagent.id } })),
}));
vi.mock('@/features/chat/rendering/ThinkingBlockRenderer', () => ({
  renderStoredThinkingBlock: vi.fn((contentEl: HTMLElement, content: string) =>
    contentEl.createDiv({ cls: 'mock-thinking', text: content })),
}));
vi.mock('@/features/chat/rendering/ToolCallRenderer', () => ({
  renderStoredToolCall: vi.fn((_app: unknown, contentEl: HTMLElement, toolCall: { id: string }) =>
    contentEl.createDiv({ cls: 'mock-tool-call', attr: { 'data-tool-id': toolCall.id } })),
}));
vi.mock('@/features/chat/rendering/WriteEditRenderer', () => ({
  renderStoredWriteEdit: vi.fn((_app: unknown, contentEl: HTMLElement, toolCall: { id: string }) =>
    contentEl.createDiv({ cls: 'mock-write-edit', attr: { 'data-tool-id': toolCall.id } })),
}));
vi.mock('@/utils/imageEmbed', () => ({
  replaceImageEmbedsWithHtml: vi.fn((md: string) => md),
}));
vi.mock('@/utils/fileLink', () => ({
  processFileLinks: vi.fn(),
  registerFileLinkHandler: vi.fn(),
}));

function createMockComponent() {
  return {
    registerDomEvent: vi.fn(),
    register: vi.fn(),
    addChild: vi.fn(),
    load: vi.fn(),
    unload: vi.fn(),
  };
}

function mockRendererPlugin(overrides: Record<string, unknown> = {}) {
  return {
    app: new App(),
    settings: { mediaFolder: '' },
    chatMessageActions: [] as ChatMessageAction[],
    getActiveConversationSnapshot: () => null as { id: string; title: string } | null,
    ...overrides,
  };
}

function mockCapabilities(providerId: 'claude' | 'codex' = 'claude') {
  return () => ({
    providerId,
    supportsPersistentRuntime: true,
    supportsNativeHistory: providerId === 'claude',
    supportsPlanMode: true,
    supportsRewind: true,
    supportsFork: true,
    supportsProviderCommands: true,
    supportsImageAttachments: true,
    supportsInstructionMode: true,
    supportsMcpTools: true,
    reasoningControl: 'effort' as const,
  });
}

function createRenderer(messagesEl: HTMLElement, providerId: 'claude' | 'codex' = 'claude'): MessageRenderer {
  return new MessageRenderer(mockRendererPlugin() as any, createMockComponent() as any, messagesEl, {
    getCapabilities: mockCapabilities(providerId),
  });
}

function childClasses(el: HTMLElement): string[] {
  return Array.from(el.children).map((c) => c.className);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MessageRenderer shell characterization (assembly DOM contract lock)', () => {
  it('user text message: shell attrs + text block inside content, action-bar toolbar as a msgEl-level sibling of content', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);
    const msg: ChatMessage = { id: 'u1', role: 'user', content: 'Hello world', timestamp: 1, userMessageId: 'user-u1' };

    renderer.renderStoredMessage(msg);

    expect(messagesEl.children).toHaveLength(1);
    const msgEl = messagesEl.children[0] as HTMLElement;
    expect(msgEl.classList.contains('specorator-message')).toBe(true);
    expect(msgEl.classList.contains('specorator-message-user')).toBe(true);
    expect(msgEl.dataset.messageId).toBe('u1');
    expect(msgEl.dataset.role).toBe('user');

    const contentEl = msgEl.querySelector(':scope > .specorator-message-content') as HTMLElement;
    expect(contentEl).not.toBeNull();
    expect(contentEl.getAttribute('dir')).toBe('auto');
    expect(contentEl.querySelector('.specorator-text-block')).not.toBeNull();

    // The copy-button toolbar is a DIRECT CHILD of msgEl (sibling of .specorator-message-content),
    // not nested inside it — MessageActionBar.addUserCopyButton is called with msgEl, not contentEl.
    const toolbar = msgEl.querySelector(':scope > .specorator-user-msg-actions');
    expect(toolbar).not.toBeNull();
    expect(contentEl.querySelector('.specorator-user-msg-actions')).toBeNull();
    expect(toolbar!.querySelector('.specorator-user-msg-copy-btn')).not.toBeNull();
  });

  it('skips the bubble entirely for an image-only user message (no textToShow)', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);
    const msg: ChatMessage = {
      id: 'u1',
      role: 'user',
      content: '',
      timestamp: 1,
      images: [{ id: 'img-1', name: 'img.png', mediaType: 'image/png', data: 'abc', size: 100, source: 'paste' }],
    };

    renderer.renderStoredMessage(msg);

    const bubbles = Array.from(messagesEl.children).filter((c) => c.classList.contains('specorator-message'));
    expect(bubbles).toHaveLength(0);
    expect(messagesEl.querySelector('.specorator-message-images')).not.toBeNull();
  });

  it('assistant mixed blocks (thinking + text + tool_use x2 + subagent): dispatch order, no footer', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [
        { id: 'edit-1', name: 'Edit', input: { file_path: 'x.md' }, status: 'completed' },
        { id: 'read-1', name: 'Read', input: { file_path: 'x.md' }, status: 'completed' },
        {
          id: 'sub-1',
          name: 'Task',
          input: { description: 'desc' },
          status: 'running',
          subagent: { id: 'sub-1', mode: 'sync', status: 'running', toolCalls: [], isExpanded: false },
        },
      ],
      contentBlocks: [
        { type: 'thinking', content: 'thinking text', durationSeconds: 3 },
        { type: 'text', content: 'Hello from assistant' },
        { type: 'tool_use', toolId: 'edit-1' },
        { type: 'tool_use', toolId: 'read-1' },
        { type: 'subagent', subagentId: 'sub-1' },
      ],
    } as ChatMessage;

    renderer.renderStoredMessage(msg);

    const msgEl = messagesEl.children[0] as HTMLElement;
    expect(msgEl.classList.contains('specorator-message-assistant')).toBe(true);
    expect(msgEl.dataset.messageId).toBe('a1');
    expect(msgEl.dataset.role).toBe('assistant');

    const contentEl = msgEl.querySelector('.specorator-message-content') as HTMLElement;
    expect(childClasses(contentEl)).toEqual([
      'mock-thinking',
      'specorator-text-block',
      'mock-write-edit',
      'mock-tool-call',
      'mock-subagent',
    ]);

    const writeEditEl = contentEl.children[2] as HTMLElement;
    expect(writeEditEl.dataset.toolId).toBe('edit-1');
    const toolCallEl = contentEl.children[3] as HTMLElement;
    expect(toolCallEl.dataset.toolId).toBe('read-1');
    const subagentEl = contentEl.children[4] as HTMLElement;
    expect(subagentEl.dataset.subagentId).toBe('sub-1');

    expect(contentEl.querySelector('.specorator-response-footer')).toBeNull();
  });

  it('assistant duration footer: last child of content, formatted text, default "Baked" flavor word', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [{ type: 'text', content: 'Response text' }],
      durationSeconds: 65,
    } as ChatMessage;

    renderer.renderStoredMessage(msg);

    const contentEl = messagesEl.querySelector('.specorator-message-content') as HTMLElement;
    const footer = contentEl.lastElementChild as HTMLElement;
    expect(footer.classList.contains('specorator-response-footer')).toBe(true);
    const span = footer.querySelector('.specorator-baked-duration');
    expect(span?.textContent).toBe('* Baked for 1m 5s');
  });

  it('does not render the footer when a context_compacted block is present', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [{ type: 'text', content: 'Before' }, { type: 'context_compacted' }],
      durationSeconds: 30,
    } as ChatMessage;

    renderer.renderStoredMessage(msg);

    const contentEl = messagesEl.querySelector('.specorator-message-content') as HTMLElement;
    expect(contentEl.querySelector('.specorator-response-footer')).toBeNull();
    expect(contentEl.querySelector('.specorator-compact-boundary')).not.toBeNull();
  });

  it('interrupt-only user message: bare marker with NO data-message-id/data-role attrs', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = {
      id: 'interrupt-1',
      role: 'user',
      content: '[Request interrupted by user]',
      timestamp: 1,
      isInterrupt: true,
    };

    renderer.renderStoredMessage(msg);

    expect(messagesEl.children).toHaveLength(1);
    const msgEl = messagesEl.children[0] as HTMLElement;
    expect(msgEl.classList.contains('specorator-message')).toBe(true);
    expect(msgEl.classList.contains('specorator-message-assistant')).toBe(true);
    expect(msgEl.dataset.messageId).toBeUndefined();
    expect(msgEl.dataset.role).toBeUndefined();

    const textEl = msgEl.querySelector('.specorator-message-content > .specorator-text-block') as HTMLElement;
    expect(textEl.children).toHaveLength(2);
    expect(textEl.children[0].className).toBe('specorator-interrupted');
    expect(textEl.children[0].textContent).toBe('Interrupted');
    expect(textEl.children[1].className).toBe('specorator-interrupted-hint');
    expect(textEl.textContent).toBe('Interrupted · What should Specorator do instead?');
  });

  it('interrupt-only empty assistant message (Codex-style) also renders the bare marker', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = { id: 'interrupt-2', role: 'assistant', content: '', timestamp: 1, isInterrupt: true };

    renderer.renderStoredMessage(msg);

    const msgEl = messagesEl.children[0] as HTMLElement;
    expect(msgEl.dataset.messageId).toBeUndefined();
    expect(msgEl.querySelector('.specorator-interrupted')).not.toBeNull();
  });

  it('interrupted assistant message WITH content: full shell + blocks/footer, then the appended interrupt indicator', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = {
      id: 'a-interrupt',
      role: 'assistant',
      content: '',
      timestamp: 1,
      isInterrupt: true,
      contentBlocks: [{ type: 'text', content: 'Partial response' }],
      durationSeconds: 10,
    } as ChatMessage;

    renderer.renderStoredMessage(msg);

    const msgEl = messagesEl.children[0] as HTMLElement;
    expect(msgEl.dataset.messageId).toBe('a-interrupt');
    const contentEl = msgEl.querySelector('.specorator-message-content') as HTMLElement;
    const classes = childClasses(contentEl);
    // text block, then the footer, then the appended interrupt indicator (a second .specorator-text-block).
    expect(classes).toEqual(['specorator-text-block', 'specorator-response-footer', 'specorator-text-block']);
    expect(contentEl.children[2].querySelector('.specorator-interrupted')).not.toBeNull();
  });

  it('skips isRebuiltContext messages entirely', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    renderer.renderStoredMessage({
      id: 'rebuilt-1',
      role: 'user',
      content: 'rebuilt context',
      timestamp: 1,
      isRebuiltContext: true,
    });

    expect(messagesEl.children).toHaveLength(0);
  });

  it('leftover tool call: a toolCall not referenced by any content block renders AFTER the block-driven ones', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [
        { id: 'a', name: 'Read', input: { file_path: 'a.md' }, status: 'completed' },
        { id: 'b', name: 'Bash', input: { command: 'ls' }, status: 'completed' },
      ],
      contentBlocks: [{ type: 'tool_use', toolId: 'a' }],
    } as ChatMessage;

    renderer.renderStoredMessage(msg);

    const contentEl = messagesEl.querySelector('.specorator-message-content') as HTMLElement;
    expect(childClasses(contentEl)).toEqual(['mock-tool-call', 'mock-tool-call']);
    expect((contentEl.children[0] as HTMLElement).dataset.toolId).toBe('a');
    expect((contentEl.children[1] as HTMLElement).dataset.toolId).toBe('b');
  });

  it('legacy no-contentBlocks message: msg.content text, then all toolCalls in array order', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Legacy text',
      timestamp: 1,
      toolCalls: [{ id: 't1', name: 'Bash', input: { command: 'ls' }, status: 'completed' }],
    };

    renderer.renderStoredMessage(msg);

    const contentEl = messagesEl.querySelector('.specorator-message-content') as HTMLElement;
    expect(childClasses(contentEl)).toEqual(['specorator-text-block', 'mock-tool-call']);
    expect((contentEl.children[1] as HTMLElement).dataset.toolId).toBe('t1');
  });

  it('skips a stored assistant message with no visible content (empty text, no tool calls)', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    renderer.renderStoredMessage({ id: 'a-empty', role: 'assistant', content: '', timestamp: 1 });

    expect(messagesEl.children).toHaveLength(0);
  });
});
