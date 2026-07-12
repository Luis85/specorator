import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolCallInfo } from '@/core/types';
import { getToolLabel, getToolName, getToolSummary } from '@/features/chat/rendering/ToolCallRenderer';
import ToolCall from '@/features/chat/ui/vue/transcript/blocks/ToolCall.vue';

/**
 * Parity twin of `toolCall.characterization.test.ts`: reproduces the same
 * six representative DOM contracts via `ToolCall.vue` instead of the legacy
 * `renderStoredToolCall`.
 */
function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-1',
    name: 'Bash',
    input: {},
    status: 'completed',
    ...overrides,
  };
}

function mountToolCall(toolCall: ToolCallInfo) {
  return render(ToolCall, { props: { toolCall } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ToolCall', () => {
  it('(a) completed Bash tool reproduces the header/status/bash-command/lines contract', async () => {
    const toolCall = createToolCall({
      id: 'bash-1',
      name: 'Bash',
      status: 'completed',
      input: { command: 'npm test' },
      result: 'All tests passed\nSuccess',
    });
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const toolEl = container.querySelector('.specorator-tool-call') as HTMLElement;
    expect(toolEl.classList.contains('specorator-tool-call-bash')).toBe(true);
    expect(toolEl.classList.contains('expanded')).toBe(false);
    expect(toolEl.dataset.toolId).toBe('bash-1');

    const header = toolEl.querySelector('.specorator-tool-header') as HTMLElement;
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-label')).toBe(
      `${getToolLabel('Bash', { command: 'npm test' })} - click to expand`
    );

    const icon = header.querySelector('.specorator-tool-icon');
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
    expect(content.querySelector('.specorator-tool-bash-command')?.textContent).toBe('$ npm test');

    const lines = Array.from(content.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(lines).toEqual(['All tests passed', 'Success']);
  });

  it('(b) blocked Grep tool reproduces the status pill + file-search content contract', async () => {
    const toolCall = createToolCall({
      name: 'Grep',
      status: 'blocked',
      input: { pattern: 'TODO' },
      result: 'Access Denied for this file',
    });
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const toolEl = container.querySelector('.specorator-tool-call') as HTMLElement;
    expect(toolEl.classList.contains('specorator-tool-call-bash')).toBe(false);

    const statusEl = toolEl.querySelector('.specorator-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-blocked')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: blocked');
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'shield-off');

    const lines = toolEl.querySelectorAll('.specorator-tool-content .specorator-tool-line');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('Access Denied for this file');
    expect(lines[0].classList.contains('hoverable')).toBe(true);
  });

  it('(c) error Read tool reproduces the status pill + 15-line-capped content contract', async () => {
    const manyLines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const toolCall = createToolCall({
      name: 'Read',
      status: 'error',
      input: { file_path: '/a/b/c.md' },
      result: manyLines,
    });
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const toolEl = container.querySelector('.specorator-tool-call') as HTMLElement;
    const statusEl = toolEl.querySelector('.specorator-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: error');
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');

    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    expect(content.querySelectorAll('.specorator-tool-line')).toHaveLength(15);
    expect(content.querySelector('.specorator-tool-truncated')?.textContent).toBe('... 5 more lines');
  });

  it('(d) TodoWrite tool reproduces the header name/current-task + todo-item content contract', async () => {
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
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const toolEl = container.querySelector('.specorator-tool-call') as HTMLElement;
    const header = toolEl.querySelector('.specorator-tool-header') as HTMLElement;
    expect(header.querySelector('.specorator-tool-name')?.textContent).toBe('Tasks 1/2');
    expect(header.querySelector('.specorator-tool-summary')?.textContent).toBe('');
    expect(header.querySelector('.specorator-tool-current')?.textContent).toBe('Doing task 2');

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

  it('(e) WebSearch tool reproduces the parsed-links content contract', async () => {
    const toolCall = createToolCall({
      name: 'WebSearch',
      status: 'completed',
      input: { query: 'obsidian plugin api' },
      result:
        'Links: [{"title":"Obsidian API","url":"https://docs.obsidian.md"}]\n\nThe official plugin API docs.',
    });
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const toolEl = container.querySelector('.specorator-tool-call') as HTMLElement;
    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;

    const links = content.querySelectorAll('.specorator-tool-link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://docs.obsidian.md');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].querySelector('.specorator-tool-link-title')?.textContent).toBe('Obsidian API');

    expect(content.querySelector('.specorator-tool-web-summary')?.textContent).toBe(
      'The official plugin API docs.'
    );
  });

  it('(f) answered AskUserQuestion tool reproduces the ask-review content contract', async () => {
    const toolCall = createToolCall({
      name: 'AskUserQuestion',
      status: 'completed',
      input: { questions: [{ id: 'q1', question: 'Favorite color?' }] },
      resolvedAnswers: { q1: 'Blue' },
    });
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const toolEl = container.querySelector('.specorator-tool-call') as HTMLElement;
    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    expect(content.classList.contains('specorator-tool-content-ask')).toBe(true);
    expect(content.querySelector('.specorator-ask-review')).not.toBeNull();

    const pairs = content.querySelectorAll('.specorator-ask-review-pair');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].querySelector('.specorator-ask-review-num')?.textContent).toBe('1.');
    expect(pairs[0].querySelector('.specorator-ask-review-q-text')?.textContent).toBe('Favorite color?');
    expect(pairs[0].querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Blue');
    expect(pairs[0].querySelector('.specorator-ask-review-empty')).toBeNull();
  });

  it('toggles expanded state on header click, including the todo current/status hide behavior', async () => {
    const toolCall = createToolCall({
      name: 'TodoWrite',
      input: {
        todos: [{ status: 'in_progress', content: 'Task 1', activeForm: 'Doing task 1' }],
      },
    });
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const toolEl = container.querySelector('.specorator-tool-call') as HTMLElement;
    const header = toolEl.querySelector('.specorator-tool-header') as HTMLElement;
    const content = toolEl.querySelector('.specorator-tool-content') as HTMLElement;
    const currentTaskEl = header.querySelector('.specorator-tool-current') as HTMLElement;
    const statusEl = header.querySelector('.specorator-tool-status') as HTMLElement;

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(toolEl.classList.contains('expanded')).toBe(true);
    expect(content.classList.contains('specorator-hidden')).toBe(false);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(currentTaskEl.classList.contains('specorator-hidden')).toBe(true);
    expect(statusEl.classList.contains('specorator-hidden')).toBe(true);
    expect(header.getAttribute('aria-label')).toBe(
      `${getToolLabel('TodoWrite', toolCall.input)} - click to collapse`
    );
  });

  it('toggles on Enter/Space keydown with preventDefault', async () => {
    const toolCall = createToolCall();
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const header = container.querySelector('.specorator-tool-header') as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    header.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(container.querySelector('.specorator-tool-call')?.classList.contains('expanded')).toBe(true);
  });

  it('does not hide the status pill on toggle for non-TodoWrite tools', async () => {
    const toolCall = createToolCall({ name: 'Bash', input: { command: 'ls' }, result: 'a\nb' });
    const { container } = mountToolCall(toolCall);
    await flushPromises();

    const header = container.querySelector('.specorator-tool-header') as HTMLElement;
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    const statusEl = header.querySelector('.specorator-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('specorator-hidden')).toBe(false);
  });
});
