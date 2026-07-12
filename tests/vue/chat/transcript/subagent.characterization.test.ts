import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubagentInfo, ToolCallInfo } from '@/core/types';
import { renderStoredAsyncSubagent, renderStoredSubagent } from '@/features/chat/rendering/SubagentRenderer';

/**
 * Characterization test: locks the exact DOM contract the legacy
 * `renderStoredSubagent` (sync) and `renderStoredAsyncSubagent` (async)
 * produce — classes, data attributes, header/status-pill/section structure,
 * nested tool items, and status icons — so `SubagentBlock.vue` +
 * `SubagentToolItem.vue` can be built to reproduce it exactly. Deleted
 * alongside the legacy renderer in Task 18; its Vue parity twin is
 * `subagentBlock.test.ts`.
 */
const mockApp = {
  workspace: { openLinkText: vi.fn() },
  metadataCache: { getFirstLinkpathDest: vi.fn(() => null) },
  vault: { getAbstractFileByPath: vi.fn(() => null) },
} as unknown as App;

function createSyncSubagent(overrides: Partial<SubagentInfo> = {}): SubagentInfo {
  return {
    id: 'task-1',
    description: 'Refactor the auth module',
    prompt: 'Refactor src/auth to use the new session store',
    status: 'completed',
    toolCalls: [],
    isExpanded: false,
    ...overrides,
  };
}

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
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

describe('renderStoredSubagent characterization (sync DOM contract lock)', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('completed subagent: root/header/status-pill/prompt+result sections + nested tools', () => {
    const subagent = createSyncSubagent({
      status: 'completed',
      result: 'Refactor complete',
      toolCalls: [
        createToolCall({ id: 'tool-1', name: 'Read', status: 'completed', result: 'file contents' }),
        createToolCall({ id: 'tool-2', name: 'Bash', input: { command: 'npm test' }, status: 'error', result: 'FAIL' }),
      ],
    });

    const root = renderStoredSubagent(mockApp, parentEl, subagent);

    expect(root.classList.contains('specorator-subagent-list')).toBe(true);
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

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-completed')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: completed');
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'check');

    // Root header aria-label does NOT toggle to "click to collapse" on click
    // (setupCollapsible's baseAriaLabel option is never passed for the root
    // header — only createSection/tool-item headers pass it).
    header.click();
    expect(root.classList.contains('expanded')).toBe(true);
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
    expect(promptHeader.getAttribute('tabindex')).toBe('0');
    expect(promptHeader.getAttribute('role')).toBe('button');
    expect(promptHeader.getAttribute('aria-label')).toBe('Prompt - click to expand');
    expect(promptHeader.querySelector('.specorator-subagent-section-title')?.textContent).toBe('Prompt');
    const promptBody = promptSection.querySelector('.specorator-subagent-section-body') as HTMLElement;
    expect(promptBody.classList.contains('specorator-subagent-prompt-body')).toBe(true);
    expect(promptBody.classList.contains('specorator-hidden')).toBe(true);
    expect(promptBody.querySelector('.specorator-subagent-prompt-text')?.textContent).toBe(
      'Refactor src/auth to use the new session store'
    );

    // Prompt section toggles independently of the root, and DOES update its
    // aria-label on toggle (baseAriaLabel is passed to createSection).
    promptHeader.click();
    expect(promptSection.classList.contains('expanded')).toBe(true);
    expect(promptBody.classList.contains('specorator-hidden')).toBe(false);
    expect(promptHeader.getAttribute('aria-label')).toBe('Prompt - click to collapse');

    const toolsContainer = content.querySelector('.specorator-subagent-tools') as HTMLElement;
    const toolItems = toolsContainer.querySelectorAll(':scope > .specorator-subagent-tool-item');
    expect(toolItems).toHaveLength(2);

    const firstTool = toolItems[0] as HTMLElement;
    expect(firstTool.classList.contains('specorator-subagent-tool-completed')).toBe(true);
    expect(firstTool.dataset.toolId).toBe('tool-1');
    const firstHeader = firstTool.querySelector('.specorator-subagent-tool-header') as HTMLElement;
    expect(firstHeader.getAttribute('tabindex')).toBe('0');
    expect(firstHeader.getAttribute('role')).toBe('button');
    const firstToolIcon = firstHeader.querySelector('.specorator-subagent-tool-icon') as HTMLElement;
    expect(firstToolIcon.getAttribute('aria-hidden')).toBe('true');
    expect(firstHeader.querySelector('.specorator-subagent-tool-name')?.textContent).toBe('Read');
    expect(firstHeader.querySelector('.specorator-subagent-tool-summary')?.textContent).toBe('session.ts');
    const firstToolStatus = firstHeader.querySelector('.specorator-subagent-tool-status') as HTMLElement;
    expect(firstToolStatus.classList.contains('status-completed')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(firstToolStatus, 'check');
    const firstToolContent = firstTool.querySelector('.specorator-subagent-tool-content') as HTMLElement;
    expect(firstToolContent.classList.contains('specorator-hidden')).toBe(true);
    const firstLines = Array.from(firstToolContent.querySelectorAll('.specorator-tool-line')).map(
      (el) => el.textContent
    );
    expect(firstLines).toEqual(['file contents']);

    const secondTool = toolItems[1] as HTMLElement;
    expect(secondTool.classList.contains('specorator-subagent-tool-error')).toBe(true);
    const secondToolStatus = secondTool.querySelector('.specorator-subagent-tool-status') as HTMLElement;
    expect(secondToolStatus.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(secondToolStatus, 'x');
    const bashCommand = secondTool.querySelector('.specorator-tool-bash-command');
    expect(bashCommand?.textContent).toBe('$ npm test');

    const resultSection = sections[1];
    expect(resultSection.classList.contains('specorator-subagent-section-result')).toBe(true);
    const resultHeader = resultSection.querySelector('.specorator-subagent-section-header') as HTMLElement;
    expect(resultHeader.querySelector('.specorator-subagent-section-title')?.textContent).toBe('Result');
    const resultBody = resultSection.querySelector('.specorator-subagent-section-body') as HTMLElement;
    expect(resultBody.classList.contains('specorator-subagent-result-body')).toBe(true);
    expect(resultBody.querySelector('.specorator-subagent-result-output')?.textContent).toBe('Refactor complete');
  });

  it('error subagent: error class, x icon, ERROR fallback text when result is blank', () => {
    const subagent = createSyncSubagent({ status: 'error', result: undefined });
    const root = renderStoredSubagent(mockApp, parentEl, subagent);

    expect(root.classList.contains('error')).toBe(true);
    expect(root.classList.contains('done')).toBe(false);

    const statusEl = root.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');

    const resultText = root.querySelector('.specorator-subagent-result-output')?.textContent;
    expect(resultText).toBe('ERROR');
  });

  it('running subagent: no done/error class, no result section, running tool shows placeholder', () => {
    const subagent = createSyncSubagent({
      status: 'running',
      result: undefined,
      toolCalls: [createToolCall({ id: 'tool-1', name: 'Bash', status: 'running', result: undefined })],
    });
    const root = renderStoredSubagent(mockApp, parentEl, subagent);

    expect(root.classList.contains('done')).toBe(false);
    expect(root.classList.contains('error')).toBe(false);

    const statusEl = root.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-running')).toBe(true);

    expect(root.querySelector('.specorator-subagent-section-result')).toBeNull();

    const toolItem = root.querySelector('.specorator-subagent-tool-item') as HTMLElement;
    expect(toolItem.classList.contains('specorator-subagent-tool-running')).toBe(true);
    const emptyEl = toolItem.querySelector('.specorator-subagent-tool-empty');
    expect(emptyEl?.textContent).toBe('Running...');
  });

  it('long description is truncated to 40 chars + ellipsis in the label', () => {
    const longDesc = 'A'.repeat(50);
    const subagent = createSyncSubagent({ description: longDesc });
    const root = renderStoredSubagent(mockApp, parentEl, subagent);
    expect(root.querySelector('.specorator-subagent-label')?.textContent).toBe('A'.repeat(40) + '...');
  });

  it('blank prompt renders the "No prompt provided" fallback', () => {
    const subagent = createSyncSubagent({ prompt: undefined });
    const root = renderStoredSubagent(mockApp, parentEl, subagent);
    expect(root.querySelector('.specorator-subagent-prompt-text')?.textContent).toBe('No prompt provided');
  });
});

describe('renderStoredAsyncSubagent characterization (async DOM contract lock)', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  function createAsyncSubagent(overrides: Partial<SubagentInfo> = {}): SubagentInfo {
    return {
      id: 'async-1',
      description: 'Investigate the flaky test',
      prompt: 'Find and fix the flaky test in the CI suite',
      status: 'running',
      mode: 'async',
      asyncStatus: 'running',
      toolCalls: [],
      isExpanded: false,
      ...overrides,
    };
  }

  it('running: async+running classes, "Running in background" text, prompt-only content (no result section)', () => {
    const subagent = createAsyncSubagent();
    const root = renderStoredAsyncSubagent(mockApp, parentEl, subagent);

    expect(root.classList.contains('specorator-subagent-list')).toBe(true);
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

    const statusTextEl = header.querySelector('.specorator-subagent-status-text');
    expect(statusTextEl?.textContent).toBe('Running in background');

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-running')).toBe(true);
    expect(statusEl.getAttribute('aria-label')).toBe('Status: Running in background');

    // Root header aria-label stays static on toggle, same quirk as sync.
    header.click();
    expect(header.getAttribute('aria-label')).toBe(
      'Background task: Investigate the flaky test - Running in background - click to expand'
    );

    const content = root.querySelector('.specorator-subagent-content') as HTMLElement;
    expect(content.querySelector('.specorator-subagent-prompt-text')?.textContent).toBe(
      'Find and fix the flaky test in the CI suite'
    );
    expect(content.querySelector('.specorator-subagent-section-result')).toBeNull();
  });

  it('completed: done class, empty status text, check icon, result section with actual result text', () => {
    const subagent = createAsyncSubagent({
      status: 'completed',
      asyncStatus: 'completed',
      result: 'Fixed the race condition',
      toolCalls: [createToolCall({ id: 'tool-1', name: 'Edit', status: 'completed', result: 'patched' })],
    });
    const root = renderStoredAsyncSubagent(mockApp, parentEl, subagent);

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

    const resultSection = root.querySelector('.specorator-subagent-section-result');
    expect(resultSection).not.toBeNull();
    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe('Fixed the race condition');
  });

  it('error: error class, "Error" status text, x icon, ERROR fallback when result is blank', () => {
    const subagent = createAsyncSubagent({ status: 'error', asyncStatus: 'error', result: undefined });
    const root = renderStoredAsyncSubagent(mockApp, parentEl, subagent);

    expect(root.classList.contains('error')).toBe(true);
    expect(root.classList.contains('done')).toBe(false);

    const header = root.querySelector('.specorator-subagent-header') as HTMLElement;
    expect(header.querySelector('.specorator-subagent-status-text')?.textContent).toBe('Error');

    const statusEl = header.querySelector('.specorator-subagent-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');

    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe('ERROR');
  });

  it('orphaned: error+orphaned classes, "Orphaned" status text, alert-circle icon, orphan fallback text', () => {
    const subagent = createAsyncSubagent({ status: 'error', asyncStatus: 'orphaned', result: undefined });
    const root = renderStoredAsyncSubagent(mockApp, parentEl, subagent);

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

  it('pending asyncStatus displays as running (no distinct "pending" wrapper class)', () => {
    const subagent = createAsyncSubagent({ status: 'running', asyncStatus: 'pending' });
    const root = renderStoredAsyncSubagent(mockApp, parentEl, subagent);

    expect(root.classList.contains('running')).toBe(true);
    expect(root.classList.contains('pending')).toBe(false);

    const header = root.querySelector('.specorator-subagent-header') as HTMLElement;
    expect(header.querySelector('.specorator-subagent-status-text')?.textContent).toBe('Initializing');
    expect(header.getAttribute('aria-label')).toContain('Initializing');
  });

  it('a fully custom orphan result text is used verbatim, not overridden by the fallback', () => {
    const subagent = createAsyncSubagent({
      status: 'error',
      asyncStatus: 'orphaned',
      result: 'Custom orphan note',
    });
    const root = renderStoredAsyncSubagent(mockApp, parentEl, subagent);
    expect(root.querySelector('.specorator-subagent-result-output')?.textContent).toBe('Custom orphan note');
  });
});
