import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubagentInfo, ToolCallInfo } from '@/core/types';
import SubagentBlock from '@/features/chat/ui/vue/transcript/blocks/SubagentBlock.vue';

/**
 * Parity twin of `subagent.characterization.test.ts`: reproduces the same
 * sync + async DOM contracts via `SubagentBlock.vue` (which projects the
 * incoming `ToolCallInfo` through `subagentViewModel.resolveTaskSubagent`
 * first, then renders — mirroring `MessageSubagentRenderer.renderTaskSubagent`
 * + `SubagentRenderer.ts`'s `renderStoredSubagent`/`renderStoredAsyncSubagent`).
 */
function createTaskToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'task-1',
    name: 'Task',
    input: { description: 'Refactor the auth module', prompt: 'Refactor src/auth to use the new session store' },
    status: 'completed',
    result: 'Refactor complete',
    ...overrides,
  };
}

function createSubagentToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-1',
    name: 'Read',
    input: { file_path: 'src/auth/session.ts' },
    status: 'completed',
    result: 'export class Session {}',
    isExpanded: false,
    ...overrides,
  };
}

function mountBlock(toolCall: ToolCallInfo, mode?: 'sync' | 'async') {
  return render(SubagentBlock, { props: { toolCall, mode, providerId: 'claude' } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubagentBlock (sync)', () => {
  it('completed subagent reproduces root/header/status-pill/prompt+result sections + nested tools', async () => {
    const subagent: SubagentInfo = {
      id: 'task-1',
      description: 'Refactor the auth module',
      prompt: 'Refactor src/auth to use the new session store',
      status: 'completed',
      result: 'Refactor complete',
      isExpanded: false,
      toolCalls: [
        createSubagentToolCall({ id: 'tool-1', name: 'Read', status: 'completed', result: 'file contents' }),
        createSubagentToolCall({ id: 'tool-2', name: 'Bash', input: { command: 'npm test' }, status: 'error', result: 'FAIL' }),
      ],
    };
    const toolCall = createTaskToolCall({ subagent });
    const { container } = mountBlock(toolCall);
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('done')).toBe(true);
    expect(root.classList.contains('error')).toBe(false);
    expect(root.classList.contains('expanded')).toBe(false);
    expect(root.dataset.subagentId).toBe('task-1');
    expect(root.dataset.asyncSubagentId).toBeUndefined();

    const header = root.querySelector('.specorator-subagent-header') as HTMLElement;
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-label')).toBe(
      'Subagent task: Refactor the auth module - Status: completed - click to expand'
    );

    const icon = header.querySelector('.specorator-subagent-icon') as HTMLElement;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(setIcon).toHaveBeenCalledWith(icon, 'bot');

    expect(header.querySelector('.specorator-subagent-label')?.textContent).toBe('Refactor the auth module');
    expect(header.querySelector('.specorator-subagent-status-text')).toBeNull();

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-completed')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: completed');
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'check');

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(root.classList.contains('expanded')).toBe(true);
    // Static aria-label quirk: root header text does NOT flip to "click to
    // collapse" (matches the legacy renderer's setupCollapsible call, which
    // never passes baseAriaLabel for the root header).
    expect(header.getAttribute('aria-label')).toBe(
      'Subagent task: Refactor the auth module - Status: completed - click to expand'
    );

    const content = root.querySelector('.specorator-subagent-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(false);

    const sections = content.querySelectorAll(':scope > .specorator-subagent-section');
    expect(sections).toHaveLength(2);

    const promptSection = sections[0];
    expect(promptSection.classList.contains('specorator-subagent-section-prompt')).toBe(true);
    const promptHeader = promptSection.querySelector('.specorator-subagent-section-header') as HTMLElement;
    expect(promptHeader.getAttribute('aria-label')).toBe('Prompt - click to expand');
    expect(promptHeader.querySelector('.specorator-subagent-section-title')?.textContent).toBe('Prompt');
    const promptBody = promptSection.querySelector('.specorator-subagent-section-body') as HTMLElement;
    expect(promptBody.classList.contains('specorator-subagent-prompt-body')).toBe(true);
    expect(promptBody.classList.contains('specorator-hidden')).toBe(true);
    expect(promptBody.querySelector('.specorator-subagent-prompt-text')?.textContent).toBe(
      'Refactor src/auth to use the new session store'
    );

    promptHeader.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(promptSection.classList.contains('expanded')).toBe(true);
    expect(promptBody.classList.contains('specorator-hidden')).toBe(false);
    expect(promptHeader.getAttribute('aria-label')).toBe('Prompt - click to collapse');

    const toolsContainer = content.querySelector('.specorator-subagent-tools') as HTMLElement;
    const toolItems = toolsContainer.querySelectorAll(':scope > .specorator-subagent-tool-item');
    expect(toolItems).toHaveLength(2);
    expect((toolItems[0] as HTMLElement).classList.contains('specorator-subagent-tool-completed')).toBe(true);
    expect((toolItems[0] as HTMLElement).dataset.toolId).toBe('tool-1');
    expect((toolItems[1] as HTMLElement).classList.contains('specorator-subagent-tool-error')).toBe(true);

    const resultSection = sections[1];
    expect(resultSection.classList.contains('specorator-subagent-section-result')).toBe(true);
    const resultBody = resultSection.querySelector('.specorator-subagent-section-body') as HTMLElement;
    expect(resultBody.classList.contains('specorator-subagent-result-body')).toBe(true);
    expect(resultBody.querySelector('.specorator-subagent-result-output')?.textContent).toBe('Refactor complete');
  });

  it('error subagent: error class, x icon, ERROR fallback text when result is blank', async () => {
    const subagent: SubagentInfo = {
      id: 'task-1',
      description: 'Broke something',
      status: 'error',
      isExpanded: false,
      toolCalls: [],
    };
    const { container } = mountBlock(createTaskToolCall({ subagent, result: undefined }));
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('error')).toBe(true);
    expect(root.classList.contains('done')).toBe(false);

    const statusEl = root.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');
    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe('ERROR');
  });

  it('running subagent: no done/error class, no result section, running tool shows placeholder', async () => {
    const subagent: SubagentInfo = {
      id: 'task-1',
      description: 'Still working',
      status: 'running',
      isExpanded: false,
      toolCalls: [createSubagentToolCall({ id: 'tool-1', name: 'Bash', status: 'running', result: undefined })],
    };
    const { container } = mountBlock(createTaskToolCall({ subagent, result: undefined }));
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('done')).toBe(false);
    expect(root.classList.contains('error')).toBe(false);
    expect(root.querySelector('.specorator-subagent-section-result')).toBeNull();

    const toolItem = root.querySelector('.specorator-subagent-tool-item') as HTMLElement;
    expect(toolItem.classList.contains('specorator-subagent-tool-running')).toBe(true);
    expect(toolItem.querySelector('.specorator-subagent-tool-empty')?.textContent).toBe('Running...');
  });

  it('projects a raw Task ToolCallInfo (no pre-stored .subagent) from input.description/prompt', async () => {
    const toolCall = createTaskToolCall({
      subagent: undefined,
      input: { description: 'Ad-hoc task', prompt: 'Do the ad-hoc thing' },
      status: 'completed',
      result: 'ok',
    });
    const { container } = mountBlock(toolCall);
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.dataset.subagentId).toBe('task-1');
    expect(root.querySelector('.specorator-subagent-label')?.textContent).toBe('Ad-hoc task');
    expect(root.querySelector('.specorator-subagent-prompt-text')?.textContent).toBe('Do the ad-hoc thing');
    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe('ok');
  });

  it('truncates a long description to 40 chars + ellipsis', async () => {
    const longDesc = 'A'.repeat(50);
    const toolCall = createTaskToolCall({
      subagent: {
        id: 'task-1',
        description: longDesc,
        status: 'completed',
        isExpanded: false,
        toolCalls: [],
      },
    });
    const { container } = mountBlock(toolCall);
    await flushPromises();
    expect(container.querySelector('.specorator-subagent-label')?.textContent).toBe('A'.repeat(40) + '...');
  });
});

describe('SubagentBlock (async)', () => {
  function createAsyncSubagent(overrides: Partial<SubagentInfo> = {}): SubagentInfo {
    return {
      id: 'async-1',
      description: 'Investigate the flaky test',
      prompt: 'Find and fix the flaky test in the CI suite',
      status: 'running',
      mode: 'async',
      asyncStatus: 'running',
      isExpanded: false,
      toolCalls: [],
      ...overrides,
    };
  }

  it('running: async+running classes, "Running in background" text, prompt-only content', async () => {
    const subagent = createAsyncSubagent();
    const { container } = mountBlock(createTaskToolCall({ subagent, result: undefined }));
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('async')).toBe(true);
    expect(root.classList.contains('running')).toBe(true);
    expect(root.classList.contains('done')).toBe(false);
    expect(root.classList.contains('error')).toBe(false);
    expect(root.dataset.asyncSubagentId).toBe('async-1');
    expect(root.dataset.subagentId).toBeUndefined();

    const header = root.querySelector('.specorator-subagent-header') as HTMLElement;
    expect(header.getAttribute('aria-label')).toBe(
      'Background task: Investigate the flaky test - Running in background - click to expand'
    );
    expect(header.querySelector('.specorator-subagent-status-text')?.textContent).toBe('Running in background');

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-running')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: Running in background');

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(header.getAttribute('aria-label')).toBe(
      'Background task: Investigate the flaky test - Running in background - click to expand'
    );

    expect(root.querySelector('.specorator-subagent-prompt-text')?.textContent).toBe(
      'Find and fix the flaky test in the CI suite'
    );
    expect(root.querySelector('.specorator-subagent-section-result')).toBeNull();
  });

  it('completed: done class, empty status text, check icon, result text + nested tool', async () => {
    const subagent = createAsyncSubagent({
      status: 'completed',
      asyncStatus: 'completed',
      result: 'Fixed the race condition',
      toolCalls: [createSubagentToolCall({ id: 'tool-1', name: 'Edit', status: 'completed', result: 'patched' })],
    });
    const { container } = mountBlock(createTaskToolCall({ subagent }));
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('completed')).toBe(true);
    expect(root.classList.contains('done')).toBe(true);
    expect(root.classList.contains('error')).toBe(false);

    const header = root.querySelector('.specorator-subagent-header') as HTMLElement;
    expect(header.querySelector('.specorator-subagent-status-text')?.textContent).toBe('');

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-completed')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'check');

    const toolItem = root.querySelector('.specorator-subagent-tool-item') as HTMLElement;
    expect(toolItem.classList.contains('specorator-subagent-tool-completed')).toBe(true);

    expect(root.querySelector('.specorator-subagent-section-result')).not.toBeNull();
    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe('Fixed the race condition');
  });

  it('error: error class, "Error" status text, x icon, ERROR fallback', async () => {
    const subagent = createAsyncSubagent({ status: 'error', asyncStatus: 'error', result: undefined });
    const { container } = mountBlock(createTaskToolCall({ subagent, result: undefined }));
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('error')).toBe(true);
    expect(root.classList.contains('done')).toBe(false);

    const header = root.querySelector('.specorator-subagent-header') as HTMLElement;
    expect(header.querySelector('.specorator-subagent-status-text')?.textContent).toBe('Error');

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');
    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe('ERROR');
  });

  it('orphaned: error+orphaned classes, "Orphaned" status text, alert-circle icon, orphan fallback', async () => {
    const subagent = createAsyncSubagent({ status: 'error', asyncStatus: 'orphaned', result: undefined });
    const { container } = mountBlock(createTaskToolCall({ subagent, result: undefined }));
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('error')).toBe(true);
    expect(root.classList.contains('orphaned')).toBe(true);
    expect(root.classList.contains('done')).toBe(false);

    const header = root.querySelector('.specorator-subagent-header') as HTMLElement;
    expect(header.querySelector('.specorator-subagent-status-text')?.textContent).toBe('Orphaned');
    expect(header.getAttribute('aria-label')).toContain('Orphaned');

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'alert-circle');
    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe(
      'Conversation ended before task completed'
    );
  });

  it('pending asyncStatus displays as running with "Initializing" text', async () => {
    const subagent = createAsyncSubagent({ status: 'running', asyncStatus: 'pending' });
    const { container } = mountBlock(createTaskToolCall({ subagent, result: undefined }));
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('running')).toBe(true);
    expect(root.classList.contains('pending')).toBe(false);
    expect(root.querySelector('.specorator-subagent-status-text')?.textContent).toBe('Initializing');
  });

  it('projects a raw Task ToolCallInfo with an explicit async modeHint prop and run_in_background input', async () => {
    const toolCall = createTaskToolCall({
      subagent: undefined,
      input: { description: 'Background job', prompt: 'Do work', run_in_background: true },
      status: 'completed',
      result: '{"status":"done"}',
    });
    const { container } = mountBlock(toolCall, 'async');
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('async')).toBe(true);
    expect(root.classList.contains('done')).toBe(true);
    expect(root.dataset.asyncSubagentId).toBe('task-1');
  });

  it('infers a still-running async status from a "not_ready" result payload', async () => {
    const toolCall = createTaskToolCall({
      subagent: undefined,
      input: { description: 'Background job', run_in_background: true },
      status: 'completed',
      result: '{"retrieval_status":"not_ready"}',
    });
    const { container } = mountBlock(toolCall);
    await flushPromises();

    const root = container.querySelector('.specorator-subagent-list') as HTMLElement;
    expect(root.classList.contains('running')).toBe(true);
    expect(root.classList.contains('done')).toBe(false);
  });
});
