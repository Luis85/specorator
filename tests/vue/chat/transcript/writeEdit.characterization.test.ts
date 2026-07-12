import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolCallInfo } from '@/core/types';
import { renderStoredWriteEdit } from '@/features/chat/rendering/WriteEditRenderer';

/**
 * Characterization test: locks the exact DOM contract the legacy
 * `renderStoredWriteEdit` produces (classes, attributes, stats, diff vs.
 * done/error text) for representative Write/Edit tool call shapes, so
 * `WriteEditView.vue` can be built to reproduce it exactly. Deleted alongside
 * the legacy renderer in a later cleanup task; its Vue parity twin
 * (`writeEdit.test.ts`) remains.
 */
const mockApp = {
  workspace: { openLinkText: vi.fn() },
  metadataCache: { getFirstLinkpathDest: vi.fn(() => null) },
  vault: { getAbstractFileByPath: vi.fn(() => null) },
} as unknown as App;

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-1',
    name: 'Write',
    input: {},
    status: 'completed',
    ...overrides,
  };
}

describe('renderStoredWriteEdit characterization (DOM contract lock)', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('(a) new-file Write with all-insert diff: done wrapper + stats + diff contract', () => {
    const toolCall = createToolCall({
      id: 'write-1',
      name: 'Write',
      status: 'completed',
      input: { file_path: '/vault/notes/new.md' },
      diffData: {
        filePath: '/vault/notes/new.md',
        diffLines: [
          { type: 'insert', text: 'line 1', newLineNum: 1 },
          { type: 'insert', text: 'line 2', newLineNum: 2 },
        ],
        stats: { added: 2, removed: 0 },
      },
    });

    const wrapperEl = renderStoredWriteEdit(mockApp, parentEl, toolCall);

    expect(wrapperEl.classList.contains('specorator-write-edit-block')).toBe(true);
    expect(wrapperEl.classList.contains('done')).toBe(true);
    expect(wrapperEl.classList.contains('error')).toBe(false);
    expect(wrapperEl.dataset.toolId).toBe('write-1');

    const header = wrapperEl.querySelector('.specorator-write-edit-header') as HTMLElement;
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-label')).toBe('Write: /vault/notes/new.md - click to expand');

    const iconEl = header.querySelector('.specorator-write-edit-icon');
    expect(iconEl?.getAttribute('aria-hidden')).toBe('true');
    expect(setIcon).toHaveBeenCalledWith(iconEl, expect.any(String));

    expect(header.querySelector('.specorator-write-edit-name')?.textContent).toBe('Write');
    expect(header.querySelector('.specorator-write-edit-summary')?.textContent).toBe('new.md');

    const statsEl = header.querySelector('.specorator-write-edit-stats') as HTMLElement;
    const addedEl = statsEl.querySelector('.added');
    expect(addedEl?.textContent).toBe('+2');
    expect(statsEl.querySelector('.removed')).toBeNull();

    const statusEl = header.querySelector('.specorator-write-edit-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(false);

    const content = wrapperEl.querySelector('.specorator-write-edit-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(true);

    const diffEl = content.querySelector('.specorator-write-edit-diff');
    expect(diffEl).not.toBeNull();
    const lines = diffEl?.querySelectorAll('.specorator-diff-line.specorator-diff-insert');
    expect(lines).toHaveLength(2);
    expect(lines?.[0].querySelector('.specorator-diff-prefix')?.textContent).toBe('+');
    expect(lines?.[0].querySelector('.specorator-diff-text')?.textContent).toBe('line 1');

    expect(content.querySelector('.specorator-write-edit-done-text')).toBeNull();
    expect(content.querySelector('.specorator-write-edit-error')).toBeNull();
  });

  it('(b) Edit with mixed diff: stats show both +/- with separator', () => {
    const toolCall = createToolCall({
      id: 'edit-1',
      name: 'Edit',
      status: 'completed',
      input: { file_path: 'src/a.ts' },
      diffData: {
        filePath: 'src/a.ts',
        diffLines: [
          { type: 'equal', text: 'context', oldLineNum: 1, newLineNum: 1 },
          { type: 'delete', text: 'old line', oldLineNum: 2 },
          { type: 'insert', text: 'new line', newLineNum: 2 },
        ],
        stats: { added: 1, removed: 1 },
      },
    });

    const wrapperEl = renderStoredWriteEdit(mockApp, parentEl, toolCall);

    const statsEl = wrapperEl.querySelector('.specorator-write-edit-stats') as HTMLElement;
    expect(statsEl.children).toHaveLength(3);
    expect(statsEl.children[0].className).toBe('added');
    expect(statsEl.children[0].textContent).toBe('+1');
    expect(statsEl.children[1].className).toBe('');
    expect(statsEl.children[1].textContent).toBe(' ');
    expect(statsEl.children[2].className).toBe('removed');
    expect(statsEl.children[2].textContent).toBe('-1');

    const diffEl = wrapperEl.querySelector('.specorator-write-edit-diff') as HTMLElement;
    const lineEls = diffEl.querySelectorAll('.specorator-diff-line');
    expect(lineEls).toHaveLength(3);
    expect(lineEls[0].classList.contains('specorator-diff-equal')).toBe(true);
    expect(lineEls[1].classList.contains('specorator-diff-delete')).toBe(true);
    expect(lineEls[1].querySelector('.specorator-diff-prefix')?.textContent).toBe('-');
    expect(lineEls[2].classList.contains('specorator-diff-insert')).toBe(true);
  });

  it('(c) error status with no diff: error wrapper + status icon + error text', () => {
    const toolCall = createToolCall({
      id: 'write-err',
      name: 'Write',
      status: 'error',
      input: { file_path: '/vault/blocked.md' },
      result: 'Permission denied',
    });

    const wrapperEl = renderStoredWriteEdit(mockApp, parentEl, toolCall);

    expect(wrapperEl.classList.contains('error')).toBe(true);
    expect(wrapperEl.classList.contains('done')).toBe(false);

    const statusEl = wrapperEl.querySelector('.specorator-write-edit-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(statusEl.hasAttribute('aria-label')).toBe(false);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');

    const statsEl = wrapperEl.querySelector('.specorator-write-edit-stats') as HTMLElement;
    expect(statsEl.children).toHaveLength(0);

    const errorEl = wrapperEl.querySelector('.specorator-write-edit-error');
    expect(errorEl?.textContent).toBe('Permission denied');
    expect(wrapperEl.querySelector('.specorator-write-edit-done-text')).toBeNull();
    expect(wrapperEl.querySelector('.specorator-write-edit-diff')).toBeNull();
  });

  it('(d) success with no diff data: DONE text, no error/diff', () => {
    const toolCall = createToolCall({
      id: 'write-done',
      name: 'Write',
      status: 'completed',
      input: { file_path: '/vault/plain.md' },
    });

    const wrapperEl = renderStoredWriteEdit(mockApp, parentEl, toolCall);

    expect(wrapperEl.classList.contains('done')).toBe(true);
    const doneEl = wrapperEl.querySelector('.specorator-write-edit-done-text');
    expect(doneEl?.textContent).toBe('DONE');
    expect(wrapperEl.querySelector('.specorator-write-edit-error')).toBeNull();
  });

  it('(e) blocked status with no result: ERROR done-text (falls through both diff and result branches)', () => {
    const toolCall = createToolCall({
      id: 'write-blocked',
      name: 'Edit',
      status: 'blocked',
      input: { file_path: '/vault/x.md' },
    });

    const wrapperEl = renderStoredWriteEdit(mockApp, parentEl, toolCall);

    expect(wrapperEl.classList.contains('error')).toBe(true);
    const doneEl = wrapperEl.querySelector('.specorator-write-edit-done-text');
    expect(doneEl?.textContent).toBe('ERROR');
  });

  it('(f) respects initiallyExpanded option', () => {
    const toolCall = createToolCall({ input: { file_path: '/vault/x.md' } });

    const wrapperEl = renderStoredWriteEdit(mockApp, parentEl, toolCall, { initiallyExpanded: true });

    expect(wrapperEl.classList.contains('expanded')).toBe(true);
    const content = wrapperEl.querySelector('.specorator-write-edit-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(false);
    const header = wrapperEl.querySelector('.specorator-write-edit-header') as HTMLElement;
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('(g) name/summary fall back to "file" when file_path is missing', () => {
    const toolCall = createToolCall({ name: 'Write', input: {} });

    const wrapperEl = renderStoredWriteEdit(mockApp, parentEl, toolCall);

    expect(wrapperEl.querySelector('.specorator-write-edit-summary')?.textContent).toBe('file');
  });
});
