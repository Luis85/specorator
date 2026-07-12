import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolCallInfo } from '@/core/types';
import { getToolLabel } from '@/features/chat/rendering/toolLabel';
import SubagentToolItem from '@/features/chat/ui/vue/transcript/blocks/SubagentToolItem.vue';

/**
 * Parity twin (nested-tool slice) of `subagent.characterization.test.ts`:
 * reproduces the `.specorator-subagent-tool-*` DOM contract via
 * `SubagentToolItem.vue` in isolation, independent of the parent
 * `SubagentBlock.vue`.
 */
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubagentToolItem', () => {
  it('completed tool: wrapper/header/status/content contract, collapsed by default', async () => {
    const toolCall = createToolCall();
    const { container } = render(SubagentToolItem, { props: { toolCall } });
    await flushPromises();

    const wrapper = container.querySelector('.specorator-subagent-tool-item') as HTMLElement;
    expect(wrapper.classList.contains('specorator-subagent-tool-completed')).toBe(true);
    expect(wrapper.classList.contains('expanded')).toBe(false);
    expect(wrapper.dataset.toolId).toBe('tool-1');

    const header = wrapper.querySelector('.specorator-subagent-tool-header') as HTMLElement;
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-label')).toBe(
      `${getToolLabel('Read', toolCall.input)} - click to expand`
    );

    const icon = header.querySelector('.specorator-subagent-tool-icon') as HTMLElement;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(setIcon).toHaveBeenCalledWith(icon, 'file-text');

    expect(header.querySelector('.specorator-subagent-tool-name')?.textContent).toBe('Read');
    expect(header.querySelector('.specorator-subagent-tool-summary')?.textContent).toBe('session.ts');

    const statusEl = header.querySelector('.specorator-subagent-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-completed')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'check');

    const content = wrapper.querySelector('.specorator-subagent-tool-content') as HTMLElement;
    expect(content.classList.contains('specorator-hidden')).toBe(true);
    const lines = Array.from(content.querySelectorAll('.specorator-tool-line')).map((el) => el.textContent);
    expect(lines).toEqual(['export class Session {}']);
  });

  it('error status: status-error class + x icon', async () => {
    const toolCall = createToolCall({ id: 'tool-2', name: 'Bash', input: { command: 'npm test' }, status: 'error', result: 'FAIL' });
    const { container } = render(SubagentToolItem, { props: { toolCall } });
    await flushPromises();

    const wrapper = container.querySelector('.specorator-subagent-tool-item') as HTMLElement;
    expect(wrapper.classList.contains('specorator-subagent-tool-error')).toBe(true);
    const statusEl = wrapper.querySelector('.specorator-subagent-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'x');
    expect(wrapper.querySelector('.specorator-tool-bash-command')?.textContent).toBe('$ npm test');
  });

  it('blocked status: status-blocked class + shield-off icon', async () => {
    const toolCall = createToolCall({ status: 'blocked', result: 'Access denied' });
    const { container } = render(SubagentToolItem, { props: { toolCall } });
    await flushPromises();

    const statusEl = container.querySelector('.specorator-subagent-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-blocked')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(statusEl, 'shield-off');
  });

  it('running with no result: no status icon call, running placeholder in content', async () => {
    const toolCall = createToolCall({ status: 'running', result: undefined });
    const { container } = render(SubagentToolItem, { props: { toolCall } });
    await flushPromises();

    const wrapper = container.querySelector('.specorator-subagent-tool-item') as HTMLElement;
    expect(wrapper.classList.contains('specorator-subagent-tool-running')).toBe(true);
    const statusEl = wrapper.querySelector('.specorator-subagent-tool-status') as HTMLElement;
    expect(statusEl.classList.contains('status-running')).toBe(true);
    expect(setIcon).not.toHaveBeenCalledWith(statusEl, expect.anything());

    const content = wrapper.querySelector('.specorator-subagent-tool-content') as HTMLElement;
    const emptyEl = content.querySelector('.specorator-subagent-tool-empty');
    expect(emptyEl?.textContent).toBe('Running...');
  });

  it('running WITH a partial result renders the result body instead of the placeholder', async () => {
    const toolCall = createToolCall({ status: 'running', result: 'partial output' });
    const { container } = render(SubagentToolItem, { props: { toolCall } });
    await flushPromises();

    const content = container.querySelector('.specorator-subagent-tool-content') as HTMLElement;
    expect(content.querySelector('.specorator-subagent-tool-empty')).toBeNull();
    const lines = Array.from(content.querySelectorAll('.specorator-tool-line')).map((el) => el.textContent);
    expect(lines).toEqual(['partial output']);
  });

  it('toggles expanded state and aria-label on header click, honoring initiallyExpanded from toolCall.isExpanded', async () => {
    const toolCall = createToolCall({ isExpanded: true });
    const { container } = render(SubagentToolItem, { props: { toolCall } });
    await flushPromises();

    const wrapper = container.querySelector('.specorator-subagent-tool-item') as HTMLElement;
    const header = wrapper.querySelector('.specorator-subagent-tool-header') as HTMLElement;
    const content = wrapper.querySelector('.specorator-subagent-tool-content') as HTMLElement;

    expect(wrapper.classList.contains('expanded')).toBe(true);
    expect(content.classList.contains('specorator-hidden')).toBe(false);
    expect(header.getAttribute('aria-label')).toBe(
      `${getToolLabel('Read', toolCall.input)} - click to collapse`
    );

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.classList.contains('expanded')).toBe(false);
    expect(content.classList.contains('specorator-hidden')).toBe(true);
    expect(header.getAttribute('aria-label')).toBe(
      `${getToolLabel('Read', toolCall.input)} - click to expand`
    );
  });

  it('toggles on Enter/Space keydown with preventDefault', async () => {
    const toolCall = createToolCall();
    const { container } = render(SubagentToolItem, { props: { toolCall } });
    await flushPromises();

    const header = container.querySelector('.specorator-subagent-tool-header') as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    header.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(container.querySelector('.specorator-subagent-tool-item')?.classList.contains('expanded')).toBe(true);
  });
});
