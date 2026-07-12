import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolCallInfo } from '@/core/types';
import WriteEditView from '@/features/chat/ui/vue/transcript/blocks/WriteEditView.vue';
import { PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

/**
 * Parity twin of `writeEdit.characterization.test.ts`: reproduces the same
 * DOM contracts via `WriteEditView.vue` instead of the legacy
 * `renderStoredWriteEdit`.
 */
function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-1',
    name: 'Write',
    input: {},
    status: 'completed',
    ...overrides,
  };
}

function mountWriteEdit(toolCall: ToolCallInfo, expandFileEditsByDefault = false) {
  const plugin = { settings: { expandFileEditsByDefault } } as unknown as SpecoratorPlugin;
  return render(WriteEditView, {
    props: { toolCall },
    global: { provide: { [PLUGIN_KEY as symbol]: plugin } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WriteEditView', () => {
  it('(a) new-file Write with all-insert diff reproduces the done wrapper + stats + diff contract', async () => {
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
    const { container } = mountWriteEdit(toolCall);
    await flushPromises();

    const wrapperEl = container.querySelector('.specorator-write-edit-block') as HTMLElement;
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
    expect(statsEl.querySelector('.added')?.textContent).toBe('+2');
    expect(statsEl.querySelector('.removed')).toBeNull();

    const statusEl = header.querySelector('.specorator-write-edit-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(false);

    const content = wrapperEl.querySelector('.specorator-write-edit-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(true);

    const diffEl = content.querySelector('.specorator-write-edit-diff');
    expect(diffEl).not.toBeNull();
    const lines = diffEl?.querySelectorAll('.specorator-diff-line.specorator-diff-insert');
    expect(lines).toHaveLength(2);
    expect(lines?.[0].querySelector('.specorator-diff-text')?.textContent).toBe('line 1');

    expect(content.querySelector('.specorator-write-edit-done-text')).toBeNull();
    expect(content.querySelector('.specorator-write-edit-error')).toBeNull();
  });

  it('(b) Edit with mixed diff reproduces stats +/- with separator and diff line classes', async () => {
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
    const { container } = mountWriteEdit(toolCall);
    await flushPromises();

    const statsEl = container.querySelector('.specorator-write-edit-stats') as HTMLElement;
    expect(statsEl.children).toHaveLength(3);
    expect(statsEl.children[0].className).toBe('added');
    expect(statsEl.children[1].className).toBe('');
    expect(statsEl.children[1].textContent).toBe(' ');
    expect(statsEl.children[2].className).toBe('removed');

    const diffEl = container.querySelector('.specorator-write-edit-diff') as HTMLElement;
    const lineEls = diffEl.querySelectorAll('.specorator-diff-line');
    expect(lineEls).toHaveLength(3);
    expect(lineEls[0].classList.contains('specorator-diff-equal')).toBe(true);
    expect(lineEls[1].classList.contains('specorator-diff-delete')).toBe(true);
    expect(lineEls[2].classList.contains('specorator-diff-insert')).toBe(true);
  });

  it('(c) error status with no diff reproduces the error wrapper + status icon + error text', async () => {
    const toolCall = createToolCall({
      id: 'write-err',
      name: 'Write',
      status: 'error',
      input: { file_path: '/vault/blocked.md' },
      result: 'Permission denied',
    });
    const { container } = mountWriteEdit(toolCall);
    await flushPromises();

    const wrapperEl = container.querySelector('.specorator-write-edit-block') as HTMLElement;
    expect(wrapperEl.classList.contains('error')).toBe(true);
    expect(wrapperEl.classList.contains('done')).toBe(false);

    const statusEl = wrapperEl.querySelector('.specorator-write-edit-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');

    const errorEl = wrapperEl.querySelector('.specorator-write-edit-error');
    expect(errorEl?.textContent).toBe('Permission denied');
    expect(wrapperEl.querySelector('.specorator-write-edit-done-text')).toBeNull();
    expect(wrapperEl.querySelector('.specorator-write-edit-diff')).toBeNull();
  });

  it('(d) success with no diff data reproduces DONE text with no error/diff', async () => {
    const toolCall = createToolCall({
      id: 'write-done',
      name: 'Write',
      status: 'completed',
      input: { file_path: '/vault/plain.md' },
    });
    const { container } = mountWriteEdit(toolCall);
    await flushPromises();

    const wrapperEl = container.querySelector('.specorator-write-edit-block') as HTMLElement;
    expect(wrapperEl.classList.contains('done')).toBe(true);
    expect(wrapperEl.querySelector('.specorator-write-edit-done-text')?.textContent).toBe('DONE');
  });

  it('(e) blocked status with no result reproduces ERROR done-text', async () => {
    const toolCall = createToolCall({
      id: 'write-blocked',
      name: 'Edit',
      status: 'blocked',
      input: { file_path: '/vault/x.md' },
    });
    const { container } = mountWriteEdit(toolCall);
    await flushPromises();

    const wrapperEl = container.querySelector('.specorator-write-edit-block') as HTMLElement;
    expect(wrapperEl.classList.contains('error')).toBe(true);
    expect(wrapperEl.querySelector('.specorator-write-edit-done-text')?.textContent).toBe('ERROR');
  });

  it('(f) name/summary fall back to "file" when file_path is missing', async () => {
    const toolCall = createToolCall({ name: 'Write', input: {} });
    const { container } = mountWriteEdit(toolCall);
    await flushPromises();

    expect(container.querySelector('.specorator-write-edit-summary')?.textContent).toBe('file');
  });

  it('(g) respects settings.expandFileEditsByDefault=true for initial expand state', async () => {
    const toolCall = createToolCall({ input: { file_path: '/vault/x.md' } });
    const { container } = mountWriteEdit(toolCall, true);
    await flushPromises();

    const wrapperEl = container.querySelector('.specorator-write-edit-block') as HTMLElement;
    expect(wrapperEl.classList.contains('expanded')).toBe(true);
    const content = wrapperEl.querySelector('.specorator-write-edit-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(false);
    const header = wrapperEl.querySelector('.specorator-write-edit-header') as HTMLElement;
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('defaults to collapsed when settings.expandFileEditsByDefault is false', async () => {
    const toolCall = createToolCall({ input: { file_path: '/vault/x.md' } });
    const { container } = mountWriteEdit(toolCall, false);
    await flushPromises();

    expect(container.querySelector('.specorator-write-edit-block')?.classList.contains('expanded')).toBe(false);
  });

  it('toggles expanded state on header click', async () => {
    const toolCall = createToolCall({ input: { file_path: '/vault/x.md' } });
    const { container } = mountWriteEdit(toolCall);
    await flushPromises();

    const wrapperEl = container.querySelector('.specorator-write-edit-block') as HTMLElement;
    const header = wrapperEl.querySelector('.specorator-write-edit-header') as HTMLElement;

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapperEl.classList.contains('expanded')).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(header.getAttribute('aria-label')).toBe('Write: /vault/x.md - click to collapse');
  });
});
