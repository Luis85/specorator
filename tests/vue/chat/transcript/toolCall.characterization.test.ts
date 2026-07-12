import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolCallInfo } from '@/core/types';
import { getToolLabel, getToolName, getToolSummary, renderStoredToolCall } from '@/features/chat/rendering/ToolCallRenderer';

/**
 * Characterization test: locks the exact DOM contract the legacy
 * `renderStoredToolCall` produces (classes, attributes, status derivation,
 * expanded-content structure) for six representative tool shapes so
 * `ToolCall.vue` + its specialized body components can be built to
 * reproduce it exactly. Deleted alongside the legacy renderer in Task 18;
 * its Vue parity twins (`toolCall.test.ts`, `todoListView.test.ts`,
 * `webSearchView.test.ts`, `askQuestionResult.test.ts`) remain.
 */
const mockApp = {
  workspace: { openLinkText: vi.fn() },
  metadataCache: { getFirstLinkpathDest: vi.fn(() => null) },
  vault: { getAbstractFileByPath: vi.fn(() => null) },
} as unknown as App;

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-1',
    name: 'Bash',
    input: {},
    status: 'completed',
    ...overrides,
  };
}

describe('renderStoredToolCall characterization (DOM contract lock)', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('(a) completed Bash tool: header/status/bash-command/lines contract', () => {
    const toolCall = createToolCall({
      name: 'Bash',
      status: 'completed',
      input: { command: 'npm test' },
      result: 'All tests passed\nSuccess',
    });

    const toolEl = renderStoredToolCall(mockApp, parentEl, toolCall);

    expect(toolEl.classList.contains('specorator-tool-call')).toBe(true);
    expect(toolEl.classList.contains('specorator-tool-call-bash')).toBe(true);
    expect(toolEl.classList.contains('expanded')).toBe(false);
    // The stored render path never sets data-tool-id (only the live
    // `renderToolCall` variant does via `toolCallElements`).
    expect(toolEl.dataset.toolId).toBeUndefined();

    const header = toolEl.querySelector('.specorator-tool-header') as HTMLElement;
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-label')).toBe(
      `${getToolLabel('Bash', { command: 'npm test' })} - click to expand`
    );

    const icon = header.querySelector('.specorator-tool-icon');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(setIcon).toHaveBeenCalledWith(icon, 'terminal');

    expect(header.querySelector('.specorator-tool-name')?.textContent).toBe(getToolName('Bash', {}));
    expect(header.querySelector('.specorator-tool-summary')?.textContent).toBe(
      getToolSummary('Bash', { command: 'npm test' })
    );
    expect(header.querySelector('.specorator-tool-current')).toBeNull();

    const statusEl = header.querySelector('.specorator-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-completed')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: completed');
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'check');

    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(true);

    const cmdEl = content.querySelector('.specorator-tool-bash-command');
    expect(cmdEl?.textContent).toBe('$ npm test');

    const lines = Array.from(content.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(lines).toEqual(['All tests passed', 'Success']);
  });

  it('(b) blocked Grep tool: status pill + file-search content contract', () => {
    const toolCall = createToolCall({
      name: 'Grep',
      status: 'blocked',
      input: { pattern: 'TODO' },
      result: 'Access Denied for this file',
    });

    const toolEl = renderStoredToolCall(mockApp, parentEl, toolCall);
    expect(toolEl.classList.contains('specorator-tool-call-bash')).toBe(false);

    const statusEl = toolEl.querySelector('.specorator-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-blocked')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: blocked');
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'shield-off');

    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    const lines = content.querySelectorAll('.specorator-tool-line');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('Access Denied for this file');
    expect(lines[0].classList.contains('hoverable')).toBe(true);
  });

  it('(c) error Read tool: status pill + 15-line-capped content contract', () => {
    const manyLines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const toolCall = createToolCall({
      name: 'Read',
      status: 'error',
      input: { file_path: '/a/b/c.md' },
      result: manyLines,
    });

    const toolEl = renderStoredToolCall(mockApp, parentEl, toolCall);

    const statusEl = toolEl.querySelector('.specorator-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: error');
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');

    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    const lines = content.querySelectorAll('.specorator-tool-line');
    expect(lines).toHaveLength(15);
    const truncated = content.querySelector('.specorator-tool-truncated');
    expect(truncated?.textContent).toBe('... 5 more lines');
  });

  it('(d) TodoWrite tool: header name/current-task + todo-item content contract', () => {
    const toolCall = createToolCall({
      id: 'todo-1',
      name: 'TodoWrite',
      status: 'completed',
      input: {
        todos: [
          { status: 'completed', content: 'Task 1', activeForm: 'Doing task 1' },
          { status: 'in_progress', content: 'Task 2', activeForm: 'Doing task 2' },
        ],
      },
    });

    const toolEl = renderStoredToolCall(mockApp, parentEl, toolCall);

    const header = toolEl.querySelector('.specorator-tool-header') as HTMLElement;
    expect(header.querySelector('.specorator-tool-name')?.textContent).toBe('Tasks 1/2');
    expect(header.querySelector('.specorator-tool-summary')?.textContent).toBe('');

    const currentTaskEl = header.querySelector('.specorator-tool-current');
    expect(currentTaskEl?.textContent).toBe('Doing task 2');

    // Not all todos are completed -> "running" status, no icon mounted.
    const statusEl = header.querySelector('.specorator-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-running')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: in progress');
    expect(setIcon).not.toHaveBeenCalledWith(statusEl, 'check');

    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    expect(content.classList.contains('specorator-tool-content-todo')).toBe(true);
    expect(content.classList.contains('specorator-todo-panel-content')).toBe(true);
    expect(content.classList.contains('specorator-todo-list-container')).toBe(true);

    const items = content.querySelectorAll('.specorator-todo-item');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('specorator-todo-completed')).toBe(true);
    expect(items[0].querySelector('.specorator-todo-text')?.textContent).toBe('Task 1');
    expect(items[1].classList.contains('specorator-todo-in_progress')).toBe(true);
    expect(items[1].querySelector('.specorator-todo-text')?.textContent).toBe('Doing task 2');
  });

  it('(e) WebSearch tool: parsed-links content contract', () => {
    const toolCall = createToolCall({
      name: 'WebSearch',
      status: 'completed',
      input: { query: 'obsidian plugin api' },
      result:
        'Links: [{"title":"Obsidian API","url":"https://docs.obsidian.md"}]\n\nThe official plugin API docs.',
    });

    const toolEl = renderStoredToolCall(mockApp, parentEl, toolCall);
    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;

    const links = content.querySelectorAll('.specorator-tool-link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://docs.obsidian.md');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].querySelector('.specorator-tool-link-title')?.textContent).toBe('Obsidian API');

    const summary = content.querySelector('.specorator-tool-web-summary');
    expect(summary?.textContent).toBe('The official plugin API docs.');
  });

  it('(f) answered AskUserQuestion tool: ask-review content contract', () => {
    const toolCall = createToolCall({
      name: 'AskUserQuestion',
      status: 'completed',
      input: { questions: [{ id: 'q1', question: 'Favorite color?' }] },
      resolvedAnswers: { q1: 'Blue' },
    });

    const toolEl = renderStoredToolCall(mockApp, parentEl, toolCall);
    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    expect(content.classList.contains('specorator-tool-content-ask')).toBe(true);

    const review = content.querySelector('.specorator-ask-review');
    expect(review).not.toBeNull();

    const pairs = content.querySelectorAll('.specorator-ask-review-pair');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].querySelector('.specorator-ask-review-num')?.textContent).toBe('1.');
    expect(pairs[0].querySelector('.specorator-ask-review-q-text')?.textContent).toBe('Favorite color?');
    expect(pairs[0].querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Blue');
    expect(pairs[0].querySelector('.specorator-ask-review-empty')).toBeNull();
  });
});
