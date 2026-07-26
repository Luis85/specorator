import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type {
  TranscriptCallbacks,
  TranscriptSnapshot,
} from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Integration proof for the Task 18a per-tab mount seam (`mountTranscript`):
 * a projected conversation renders into `.specorator-messages`; a later
 * projection push (the streaming-chunk emit) re-renders the reactive store;
 * `SCROLL_HOST_KEY` hands the engine the real scroll element; and `unmount`
 * tears the island down. Uses the real production `createApp(...).mount(...)`
 * path (not `@testing-library/vue`'s `render`) so the mount function itself is
 * exercised end to end.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function userMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: 'user' as const,
    content: `message ${i}`,
    timestamp: i,
  }));
}

/**
 * Callbacks whose `subscribe` behaves like the engine's projection seam: it
 * immediately pushes the initial snapshot (mirroring `mountChatShell`'s
 * `onChange(project())`) and retains the observer so the test can drive later
 * snapshots — the streaming-emit path.
 */
function makeProjectingCallbacks(initial: TranscriptSnapshot): {
  callbacks: TranscriptCallbacks;
  push: (snapshot: TranscriptSnapshot) => void;
  disposed: () => boolean;
} {
  let observer: ((s: TranscriptSnapshot) => void) | null = null;
  let wasDisposed = false;
  const callbacks: TranscriptCallbacks = {
    subscribe: (onChange) => {
      observer = onChange;
      onChange(initial);
      return () => {
        observer = null;
        wasDisposed = true;
      };
    },
    onRewind: vi.fn(),
    onFork: vi.fn(),
    isRewindEligible: vi.fn(() => false),
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
    getCapabilities: vi.fn(() => ({
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
    })),
  };
  return {
    callbacks,
    push: (snapshot) => observer?.(snapshot),
    disposed: () => wasDisposed,
  };
}

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('mountTranscript', () => {
  it('renders a projected conversation into a Vue-owned .specorator-messages and exposes it as the scroll host', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { callbacks } = makeProjectingCallbacks({
      messages: userMessages(3),
      activeStream: null,
      conversationId: null,
      projectionRevision: 0,
      greeting: '',
      loadingText: null,
      hydrationError: null, messageIdentity: null,
    });

    const mounted = mountTranscript(container, makePlugin(), new Component(), callbacks);
    await flushPromises();

    const scrollEl = container.querySelector('.specorator-messages');
    expect(scrollEl).not.toBeNull();
    expect(mounted.getScrollEl()).toBe(scrollEl);
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(3);

    mounted.unmount();
    container.remove();
  });

  it('re-renders reactively when a later projection push arrives (streaming-emit path)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { callbacks, push } = makeProjectingCallbacks({
      messages: userMessages(1),
      activeStream: null,
      conversationId: null,
      projectionRevision: 0,
      greeting: '',
      loadingText: null,
      hydrationError: null, messageIdentity: null,
    });

    const mounted = mountTranscript(container, makePlugin(), new Component(), callbacks);
    await flushPromises();
    expect(container.querySelector('.specorator-thinking')).toBeNull();

    // A stream chunk emit re-projects with an active thinking stream.
    push({
      messages: userMessages(1),
      activeStream: { messageId: 'm0', blockIndex: 0, isThinking: true, isWriting: false, elapsedSeconds: 0 },
      conversationId: null,
      projectionRevision: 0,
      greeting: '',
      loadingText: null,
      hydrationError: null, messageIdentity: null,
    });
    await flushPromises();

    expect(container.querySelector('.specorator-thinking')).not.toBeNull();

    mounted.unmount();
    container.remove();
  });

  it('registers the delegated file-link handler on the scroll host so generated links open files', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { callbacks } = makeProjectingCallbacks({
      messages: userMessages(1),
      activeStream: null,
      conversationId: null,
      projectionRevision: 0,
      greeting: '',
      loadingText: null,
      hydrationError: null, messageIdentity: null,
    });

    const plugin = makePlugin();
    const component = new Component();
    const mounted = mountTranscript(container, plugin, component, callbacks);
    await flushPromises();

    // The wikilink/inline-path anchors that `processFileLinks` generates in the
    // rendered markdown are opened by a DELEGATED click handler bound to the
    // scroll host via `registerFileLinkHandler(app, scrollEl, component)`.
    const scrollEl = container.querySelector('.specorator-messages') as HTMLElement;
    const domCalls = (component.registerDomEvent as unknown as Mock).mock.calls;
    const clickCall = domCalls.find(([el, ev]) => el === scrollEl && ev === 'click');
    expect(clickCall).toBeDefined();

    // Driving the registered handler over a generated link opens the vault file.
    const openLinkText = vi.fn();
    plugin.app.workspace.openLinkText = openLinkText;
    const link = document.createElement('a');
    link.className = 'specorator-file-link';
    link.setAttribute('data-href', 'Note.md');
    scrollEl.appendChild(link);
    clickCall![2]({ target: link, preventDefault: vi.fn() } as unknown as MouseEvent);
    expect(openLinkText).toHaveBeenCalledWith('Note.md', '', 'tab');

    mounted.unmount();
    container.remove();
  });

  it('opens a NON-anchor tool file-link (span) exactly once via delegation (no double-open)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { callbacks } = makeProjectingCallbacks({
      messages: userMessages(1),
      activeStream: null,
      conversationId: null,
      projectionRevision: 0,
      greeting: '',
      loadingText: null,
      hydrationError: null, messageIdentity: null,
    });

    const plugin = makePlugin();
    const component = new Component();
    const mounted = mountTranscript(container, plugin, component, callbacks);
    await flushPromises();

    const scrollEl = container.querySelector('.specorator-messages') as HTMLElement;
    const domCalls = (component.registerDomEvent as unknown as Mock).mock.calls;
    const clickCall = domCalls.find(([el, ev]) => el === scrollEl && ev === 'click');
    expect(clickCall).toBeDefined();

    const openLinkText = vi.fn();
    plugin.app.workspace.openLinkText = openLinkText;

    // A tool summary/result file-link is a <span>/<div> (not an <a>) carrying the
    // `.specorator-file-link` + `data-href` contract — exactly what ToolCall /
    // WriteEditView / ToolContentLines render now that the direct @click was
    // removed. The delegated matcher's `[data-href].specorator-file-link` branch
    // matches it, opening the file ONCE (the double-open regression was the
    // direct handler firing in addition to this).
    const span = document.createElement('span');
    span.className = 'specorator-tool-summary specorator-file-link';
    span.setAttribute('data-href', 'notes/a.md');
    span.setAttribute('role', 'link');
    scrollEl.appendChild(span);

    clickCall![2]({ target: span, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as MouseEvent);
    expect(openLinkText).toHaveBeenCalledTimes(1);
    expect(openLinkText).toHaveBeenCalledWith('notes/a.md', '', 'tab');
    // The component wires no direct open path, so nothing else opened the file.
    expect(callbacks.openFile).not.toHaveBeenCalled();

    mounted.unmount();
    container.remove();
  });

  it('disposes the projection subscription on unmount', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { callbacks, disposed } = makeProjectingCallbacks({
      messages: userMessages(1),
      activeStream: null,
      conversationId: null,
      projectionRevision: 0,
      greeting: '',
      loadingText: null,
      hydrationError: null, messageIdentity: null,
    });

    const mounted = mountTranscript(container, makePlugin(), new Component(), callbacks);
    await flushPromises();
    expect(disposed()).toBe(false);

    mounted.unmount();
    expect(disposed()).toBe(true);
    container.remove();
  });
});
