import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer, TFile, TFolder } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage, ImageAttachment, ToolCallInfo } from '@/core/types';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * The DOM-contract backstop for the transcript Vue island (Task 20). The
 * imperative `MessageRenderer` + `rendering/*` block renderers are gone, but
 * FOUR still-imperative consumers read the transcript DOM by class/attribute
 * and are OUT of the Vue migration's scope:
 *
 *   - `NavigationController` / `NavigationSidebar` — scan `.specorator-message-user`
 *     + `offsetTop` to jump between user turns (the single most load-bearing class).
 *   - the three selection controllers (editor / browser / canvas).
 *   - `ChatDropController` — the drag-drop overlay over the messages host.
 *   - `StreamController` auto-scroll — the `.specorator-messages` scroll container.
 *
 * So the Vue transcript MUST keep emitting the exact legacy `.specorator-*`
 * classes/attributes. This test mounts the REAL `mountTranscript` →
 * `TranscriptRoot` (same path as `liveMutation.regression`/`transcriptScaling`)
 * with a fixture exercising every block type + user/assistant + streaming +
 * chrome, and asserts every class/attribute the un-migrated consumers query.
 * The authoritative list lives in the migration plan's Task 20 Step 1; keep the
 * two in sync. If a component stops emitting one of these, this fails LOUDLY.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

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

/** App whose vault resolves the fixture @mentions so the context card renders. */
function makeApp(): App {
  const app = new App();
  // The context-card resolver only needs `instanceof TFile`/`TFolder`; the path
  // is carried by the mention string, not read off the returned entry.
  app.vault.getAbstractFileByPath = (path: string) => {
    if (path === 'notes/design.md') return new TFile();
    if (path === 'assets/images') return new TFolder();
    return null;
  };
  return app;
}

function makePlugin(): SpecoratorPlugin {
  return {
    app: makeApp(),
    // expandFileEditsByDefault: true so the write/edit block mounts `.expanded`
    // (the universal collapsible-open class the contract requires a witness for).
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
    getMessageActions: vi.fn(() => [{ id: 'wo', label: 'Create work order', icon: 'briefcase', run: vi.fn() }]),
    copyText: vi.fn(),
    openFile: vi.fn(),
    resolveImageSrc: vi.fn(() => 'data:image/png;base64,AAAA'),
    showFullImage: vi.fn(),
    getProviderId: vi.fn(() => 'claude'),
    getWorkOrderPath: vi.fn(() => '/Agent Board/wo.md'),
    getCapabilities: vi.fn(() => CAPABILITIES),
    ...overrides,
  };
}

function mount(state: ChatState, projection: TabTranscriptProjection, callbacks: TranscriptCallbacks) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = mountTranscript(container, makePlugin(), new Component(), callbacks);
  return { container, dispose: () => { mounted.unmount(); container.remove(); } };
}

/** Asserts every selector resolves to at least one node, naming every miss. */
function expectAllPresent(container: HTMLElement, selectors: string[]): void {
  const missing = selectors.filter((sel) => container.querySelector(sel) === null);
  expect(missing, `missing DOM-contract selectors: ${missing.join(', ')}`).toEqual([]);
}

function tool(overrides: Partial<ToolCallInfo> & { id: string; name: string }): ToolCallInfo {
  return { input: {}, status: 'completed', isExpanded: false, ...overrides };
}

const IMAGE: ImageAttachment = {
  id: 'img-1',
  name: 'shot.png',
  mediaType: 'image/png',
  data: 'AAAA',
  size: 4,
  source: 'paste',
};

/** A conversation exercising user + assistant + every block type. */
function buildRichConversation(): ChatMessage[] {
  const bash = tool({ id: 'bash-1', name: 'Bash', status: 'completed', input: { command: 'npm test' }, result: 'ok\ndone' });
  const grep = tool({ id: 'grep-1', name: 'Grep', status: 'blocked', input: { pattern: 'TODO' }, result: 'Access Denied' });
  const read = tool({
    id: 'read-1',
    name: 'Read',
    status: 'error',
    input: { file_path: '/a.md' },
    result: Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n'),
  });
  const todo = tool({
    id: 'todo-1',
    name: 'TodoWrite',
    status: 'completed',
    input: { todos: [
      { status: 'completed', content: 'Task 1', activeForm: 'Doing 1' },
      { status: 'in_progress', content: 'Task 2', activeForm: 'Doing 2' },
    ] },
  });
  const web = tool({
    id: 'web-1',
    name: 'WebSearch',
    status: 'completed',
    input: { query: 'obsidian api' },
    result: 'Links: [{"title":"Obsidian API","url":"https://docs.obsidian.md"}]\n\nThe docs.',
  });
  const ask = tool({
    id: 'ask-1',
    name: 'AskUserQuestion',
    status: 'completed',
    input: { questions: [{ id: 'q1', question: 'Favorite color?' }] },
    resolvedAnswers: { q1: 'Blue' },
  });
  const write = tool({
    id: 'write-1',
    name: 'Write',
    status: 'completed',
    input: { file_path: '/vault/new.md' },
    diffData: {
      filePath: '/vault/new.md',
      diffLines: [
        { type: 'equal', text: 'ctx', oldLineNum: 1, newLineNum: 1 },
        { type: 'delete', text: 'old', oldLineNum: 2 },
        { type: 'insert', text: 'new', newLineNum: 2 },
      ],
      stats: { added: 1, removed: 1 },
    },
  });
  const syncTask = tool({
    id: 'task-sync',
    name: 'Task',
    status: 'completed',
    input: { description: 'Refactor auth', prompt: 'do it' },
    result: 'done',
    subagent: {
      id: 'task-sync',
      description: 'Refactor auth',
      prompt: 'do it',
      status: 'completed',
      result: 'Refactor complete',
      isExpanded: false,
      toolCalls: [tool({ id: 'nested-1', name: 'Read', status: 'completed', result: 'x' })],
    },
  });
  const asyncTask = tool({
    id: 'task-async',
    name: 'Task',
    status: 'running',
    input: { description: 'Background job', prompt: 'go', run_in_background: true },
    subagent: {
      id: 'task-async',
      description: 'Background job',
      prompt: 'go',
      status: 'running',
      mode: 'async',
      asyncStatus: 'running',
      isExpanded: false,
      toolCalls: [],
    },
  });

  const workOrderText = [
    '<specorator_progress>',
    'step: scanning files',
    'done: 2 / 5',
    'note: src first',
    '</specorator_progress>',
    '<specorator_needs_input>',
    'question: Which env?',
    'why: Ambiguous',
    'default: staging',
    '</specorator_needs_input>',
    '<specorator_needs_approval>',
    'action: Delete branch',
    'risk: Irreversible',
    'reversible: false',
    '</specorator_needs_approval>',
    '<specorator_handoff>',
    'summary: Refactored auth',
    'verification: Ran tests',
    'risks: None',
    'next_action: Merge',
    '</specorator_handoff>',
  ].join('\n');

  return [
    // User turn: text + @mention context card + image attachment + action bar.
    {
      id: 'u1',
      role: 'user',
      content: 'Check @notes/design.md and @assets/images please',
      timestamp: 1,
      userMessageId: 'user-u1',
      images: [IMAGE],
    },
    // The work-order execution prompt collapse (user path).
    {
      id: 'u2',
      role: 'user',
      content: 'You are executing a Specorator work order. Proceed.',
      timestamp: 2,
    },
    // Assistant turn: thinking + text + every tool kind + sync subagent + footer.
    {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 3,
      durationSeconds: 42,
      durationFlavorWord: 'Baked',
      contentBlocks: [
        { type: 'thinking', content: 'reasoning about the approach', durationSeconds: 3 },
        { type: 'text', content: 'Here is the plan.' },
        { type: 'tool_use', toolId: 'bash-1' },
        { type: 'tool_use', toolId: 'grep-1' },
        { type: 'tool_use', toolId: 'read-1' },
        { type: 'tool_use', toolId: 'todo-1' },
        { type: 'tool_use', toolId: 'web-1' },
        { type: 'tool_use', toolId: 'ask-1' },
        { type: 'tool_use', toolId: 'write-1' },
        { type: 'subagent', subagentId: 'task-sync', mode: 'sync' },
      ],
      toolCalls: [bash, grep, read, todo, web, ask, write, syncTask],
    },
    // Assistant turn: compaction boundary + cli-not-found runtime error (details).
    {
      id: 'a2',
      role: 'assistant',
      content: '',
      timestamp: 4,
      contentBlocks: [
        { type: 'context_compacted' },
        { type: 'runtime_error', content: 'spawn claude ENOENT' },
      ],
    },
    // Assistant turn: unauthenticated runtime error (login hint arm).
    {
      id: 'a3',
      role: 'assistant',
      content: '',
      timestamp: 5,
      contentBlocks: [{ type: 'runtime_error', content: '401 Unauthorized: invalid api key' }],
    },
    // Assistant turn: async/background subagent.
    {
      id: 'a4',
      role: 'assistant',
      content: '',
      timestamp: 6,
      contentBlocks: [{ type: 'subagent', subagentId: 'task-async', mode: 'async' }],
      toolCalls: [asyncTask],
    },
    // Assistant turn: bare interrupt marker.
    {
      id: 'a5',
      role: 'assistant',
      content: '',
      timestamp: 7,
      isInterrupt: true,
    },
    // Assistant turn: work-order protocol split into the four cards.
    {
      id: 'a6',
      role: 'assistant',
      content: '',
      timestamp: 8,
      contentBlocks: [{ type: 'text', content: workOrderText }],
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('transcript DOM contract', () => {
  it('emits every consumer-critical + block class/attribute for a rich conversation', async () => {
    const state = new ChatState();
    for (const msg of buildRichConversation()) state.addMessage(msg);
    // Drive the streaming indicator (thinking mode) through the real snapshot path.
    state.activeMessageId = 'a1';
    state.streamingIndicatorMode = 'thinking';
    state.responseStartTime = performance.now();

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection, makeCallbacks(projection));
    await flushPromises();

    expectAllPresent(container, [
      // Scroll container (StreamController auto-scroll / drop overlay / nav scan).
      '.specorator-messages',

      // Message shell — the nav sidebar depends on `.specorator-message-user`.
      '.specorator-message',
      '.specorator-message-user',
      '.specorator-message-assistant',
      '.specorator-message-content',
      '[data-message-id]',
      '[data-role="user"]',
      '[data-role="assistant"]',
      '.specorator-text-block',
      '.specorator-response-footer',
      '.specorator-baked-duration',
      '.specorator-interrupted',
      '.specorator-interrupted-hint',
      '.specorator-work-order-prompt',
      '.specorator-work-order-prompt-summary',

      // Collapsible state (universal).
      '.expanded',
      '.specorator-hidden',
      '[aria-expanded]',

      // Thinking (stored block + live streaming indicator).
      '.specorator-thinking-block',
      '.specorator-thinking-header',
      '.specorator-thinking-label',
      '.specorator-thinking-content',
      '.specorator-thinking',
      '.specorator-thinking-flavor',
      '.specorator-thinking-hint',

      // Tool call.
      '.specorator-tool-call',
      '.specorator-tool-call-bash',
      '[data-tool-id]',
      '.specorator-tool-header',
      '.specorator-tool-icon',
      '.specorator-tool-name',
      '.specorator-tool-summary',
      '.specorator-tool-current',
      '.specorator-tool-status',
      '.specorator-tool-status.status-completed',
      '.specorator-tool-status.status-blocked',
      '.specorator-tool-status.status-error',
      '.specorator-tool-status.status-running',
      '.specorator-tool-content',
      '.specorator-tool-content-todo',
      '.specorator-tool-content-ask',
      '.specorator-tool-line',
      '.specorator-tool-line.hoverable',
      '.specorator-tool-truncated',
      '.specorator-tool-bash-command',
      '.specorator-tool-link',
      '.specorator-tool-link-title',

      // Write/Edit + diff.
      '.specorator-write-edit-block',
      '.specorator-write-edit-header',
      '.specorator-write-edit-icon',
      '.specorator-write-edit-name',
      '.specorator-write-edit-summary',
      '.specorator-write-edit-stats',
      '.specorator-write-edit-status',
      '.specorator-write-edit-content',
      '.specorator-write-edit-diff',
      '.specorator-diff-line',
      '.specorator-diff-line.specorator-diff-insert',
      '.specorator-diff-line.specorator-diff-delete',
      '.specorator-diff-line.specorator-diff-equal',
      '.specorator-diff-text',
      '.specorator-write-edit-stats .added',
      '.specorator-write-edit-stats .removed',

      // Todo.
      '.specorator-todo-item',
      '.specorator-todo-completed',
      '.specorator-todo-in_progress',
      '.specorator-todo-status-icon',
      '.specorator-todo-text',
      '.specorator-todo-panel-content',
      '.specorator-todo-list-container',

      // Subagent (sync + async).
      '.specorator-subagent-list',
      '[data-subagent-id]',
      '[data-async-subagent-id]',
      '.specorator-subagent-header',
      '.specorator-subagent-icon',
      '.specorator-subagent-label',
      '.specorator-subagent-status',
      '.specorator-subagent-status-text',
      '.specorator-subagent-content',
      '.specorator-subagent-section',
      '.specorator-subagent-section-prompt',
      '.specorator-subagent-section-result',
      '.specorator-subagent-section-header',
      '.specorator-subagent-section-title',
      '.specorator-subagent-section-body',
      '.specorator-subagent-prompt-text',
      '.specorator-subagent-result-output',
      '.specorator-subagent-tools',
      '.specorator-subagent-tool-item',
      '.specorator-subagent-tool-completed',

      // Compact + runtime error (cli-not-found details + unauthenticated hint).
      '.specorator-compact-boundary',
      '.specorator-compact-boundary-label',
      '.specorator-runtime-error-card',
      '.specorator-runtime-error-cli-not-found',
      '.specorator-runtime-error-unauthenticated',
      '.specorator-runtime-error-body',
      '.specorator-runtime-error-details-text',
      '.specorator-runtime-error-hint',
      '.specorator-runtime-error-hint-command',
      '.specorator-runtime-error-actions',
      '.specorator-runtime-error-button',
      '.specorator-runtime-error-button-primary',

      // Ask (answered).
      '.specorator-ask-review',
      '.specorator-ask-review-pair',
      '.specorator-ask-review-num',
      '.specorator-ask-review-q-text',
      '.specorator-ask-review-a-text',

      // Work-order cards.
      '.specorator-work-order-progress-card',
      '.specorator-work-order-needs-input-card',
      '.specorator-work-order-needs-approval-card',
      '.specorator-work-order-handoff-card',

      // Context card / images / action bar.
      '.specorator-context-card',
      '.specorator-context-card-row--file',
      '.specorator-context-card-row--folder',
      '.specorator-message-images',
      '.specorator-message-image',
      '.specorator-user-msg-actions',
      '.specorator-user-msg-copy-btn',
      '.specorator-user-msg-action-btn',
      '.specorator-message-rewind-btn',
      '.specorator-message-fork-btn',
      '.specorator-text-block',
      '.specorator-text-actions',
      '.specorator-text-action-btn',
    ]);

    // The nav-critical class must anchor a real, addressable user turn.
    const userTurn = container.querySelector('.specorator-message-user') as HTMLElement;
    expect(userTurn.getAttribute('data-message-id')).toBe('u1');
    expect(userTurn.getAttribute('data-role')).toBe('user');

    dispose();
  });

  it('emits the loading-state chrome classes', async () => {
    const state = new ChatState();
    state.addMessage({ id: 'm1', role: 'user', content: 'hi', timestamp: 1 });
    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection, makeCallbacks(projection));
    await flushPromises();

    projection.setLoadingText('Loading conversation…');
    await flushPromises();

    expectAllPresent(container, [
      '.specorator-loading',
      '.specorator-loading-spinner',
      '.specorator-loading-text',
    ]);

    dispose();
  });

  it('emits the welcome + hydration-error chrome classes', async () => {
    const state = new ChatState();
    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection, makeCallbacks(projection));
    await flushPromises();

    projection.setGreeting('Good morning');
    projection.setHydrationError({ code: 'store-unreadable', message: 'History unavailable' });
    await flushPromises();

    expectAllPresent(container, [
      '.specorator-welcome',
      '.specorator-welcome-greeting',
      '.specorator-hydration-error',
      '.specorator-hydration-error[data-error-code]',
    ]);
    expect(
      container.querySelector<HTMLElement>('.specorator-hydration-error')!.dataset.errorCode,
    ).toBe('store-unreadable');

    dispose();
  });

  it('emits the load-earlier control classes past the render window', async () => {
    const state = new ChatState();
    for (let i = 0; i < 81; i++) {
      state.addMessage({ id: `m${i}`, role: 'user', content: `msg ${i}`, timestamp: i });
    }
    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection, makeCallbacks(projection));
    await flushPromises();

    expectAllPresent(container, [
      '.specorator-load-earlier',
      '.specorator-load-earlier-btn',
    ]);
    // Windowing bound holds — the trailing window, not the full history, mounts.
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(80);

    dispose();
  });
});
