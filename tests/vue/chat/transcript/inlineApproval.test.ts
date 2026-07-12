import { mount } from '@vue/test-utils';
import { Notice } from 'obsidian';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ApprovalDecision } from '@/core/types';
import InlineApproval from '@/features/chat/ui/vue/transcript/inline/InlineApproval.vue';

/**
 * `InlineApproval.vue` wraps `InlineAskUserQuestion.vue` the same way the
 * legacy `InlinePromptController.handleApprovalRequest` configures the ask
 * card: a single immediate-select question ("Allow this action?"), a header
 * with tool/reason/blocked-path/agent/description info, `showCustomInput:
 * false`, `title: 'Permission required'`, and a resolved-answer ->
 * `ApprovalDecision` mapping. There is no standalone legacy "InlineApproval"
 * class to characterize against — the contract is read directly from
 * `InlinePromptController.handleApprovalRequest`.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  };
});

let wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.forEach((w) => {
    try {
      w.unmount();
    } catch {
      // Already unmounted by the test itself — fine.
    }
  });
  wrappers = [];
  vi.clearAllMocks();
});

function mountCard(props: Partial<InstanceType<typeof InlineApproval>['$props']> & {
  resolve: (decision: ApprovalDecision) => void;
  toolName: string;
  description: string;
}) {
  const wrapper = mount(InlineApproval, {
    props,
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
}

async function keydown(wrapper: ReturnType<typeof mount>, key: string): Promise<void> {
  wrapper.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await wrapper.vm.$nextTick();
}

describe('InlineApproval.vue', () => {
  it('renders default Deny/Allow once/Always allow options with the header info block', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({
      resolve,
      toolName: 'Bash',
      description: 'Run `ls -la`',
      approvalOptions: {
        decisionReason: 'Requires elevated access',
        blockedPath: '/etc/passwd',
        agentID: 'agent-42',
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.specorator-ask-inline-title').text()).toBe('Permission required');
    expect(wrapper.find('.specorator-ask-tab-bar').exists()).toBe(false);

    const header = wrapper.find('.specorator-ask-approval-info');
    expect(header.exists()).toBe(true);
    expect(header.find('.specorator-ask-approval-tool-name').text()).toBe('Bash');
    expect(header.find('.specorator-ask-approval-reason').text()).toBe('Requires elevated access');
    expect(header.find('.specorator-ask-approval-blocked-path').text()).toBe('/etc/passwd');
    expect(header.find('.specorator-ask-approval-agent').text()).toBe('Agent: agent-42');
    expect(header.find('.specorator-ask-approval-desc').text()).toBe('Run `ls -la`');

    const rows = wrapper.findAll('.specorator-ask-item');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.find('.specorator-ask-item-label').text())).toEqual([
      'Deny',
      'Allow once',
      'Always allow',
    ]);
    // showCustomInput: false -> no custom "other" row.
    expect(wrapper.find('.specorator-ask-custom-item').exists()).toBe(false);
  });

  it('omits optional header lines (reason/blocked-path/agent) when absent', () => {
    const wrapper = mountCard({ resolve: vi.fn(), toolName: 'Read', description: 'Read a file' });
    expect(wrapper.find('.specorator-ask-approval-reason').exists()).toBe(false);
    expect(wrapper.find('.specorator-ask-approval-blocked-path').exists()).toBe(false);
    expect(wrapper.find('.specorator-ask-approval-agent').exists()).toBe(false);
    expect(wrapper.find('.specorator-ask-approval-desc').text()).toBe('Read a file');
  });

  it('maps Deny/Allow once/Always allow selections to the matching ApprovalDecision', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({ resolve, toolName: 'Bash', description: 'desc' });

    await keydown(wrapper, 'Enter'); // focused row 0 -> Deny
    expect(resolve).toHaveBeenCalledWith('deny');
  });

  it('maps "Allow once" via ArrowDown + Enter', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({ resolve, toolName: 'Bash', description: 'desc' });

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith('allow');
  });

  it('maps "Always allow" via ArrowDown x2 + Enter', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({ resolve, toolName: 'Bash', description: 'desc' });

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith('allow-always');
  });

  it('maps Escape / unmount-before-decision to "cancel"', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({ resolve, toolName: 'Bash', description: 'desc' });

    await keydown(wrapper, 'Escape');
    expect(resolve).toHaveBeenCalledWith('cancel');
  });

  it('resolves "cancel" when unmounted before any decision', () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({ resolve, toolName: 'Bash', description: 'desc' });

    wrapper.unmount();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('cancel');
  });

  it('uses caller-supplied decisionOptions and preserves each decision', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({
      resolve,
      toolName: 'Bash',
      description: 'desc',
      approvalOptions: {
        decisionOptions: [
          { label: 'Reject', value: 'reject-value', decision: 'deny' },
          { label: 'Accept', value: 'accept-value', decision: 'allow' },
        ],
      },
    });

    const rows = wrapper.findAll('.specorator-ask-item');
    expect(rows.map((r) => r.find('.specorator-ask-item-label').text())).toEqual(['Reject', 'Accept']);

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith('allow');
  });

  it('falls back to a select-option decision when a custom option has no decision mapping', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({
      resolve,
      toolName: 'Bash',
      description: 'desc',
      approvalOptions: {
        decisionOptions: [
          { label: 'Custom choice', value: 'custom-value' },
        ],
      },
    });

    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'select-option', value: 'custom-value' });
  });

  it('assigns a synthetic value and surfaces a Notice when a decision option has no value', async () => {
    const resolve = vi.fn<(decision: ApprovalDecision) => void>();
    const wrapper = mountCard({
      resolve,
      toolName: 'Bash',
      description: 'desc',
      approvalOptions: {
        decisionOptions: [{ label: 'No value', value: '' }],
      },
    });

    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'select-option', value: 'approval-option-0' });
    expect(Notice).not.toHaveBeenCalled();
  });
});
