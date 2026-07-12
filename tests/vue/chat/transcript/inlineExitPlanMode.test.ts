import { mount } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ExitPlanModeDecision } from '@/core/types/tools';
import InlineExitPlanMode from '@/features/chat/ui/vue/transcript/inline/InlineExitPlanMode.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

/**
 * Parity twin of the `InlineExitPlanMode` half of
 * `inlinePlanCards.characterization.test.ts`: reproduces
 * `rendering/InlineExitPlanMode.ts`'s root/title/permissions/rows/hints DOM
 * and keyboard-driven resolve payloads via `InlineExitPlanMode.vue`. Also
 * covers the promise contract this component owns directly: single-exit
 * resolve, abort -> null, and unmount (before a decision) -> null.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // rAF must actually run its callback for the mount-time focus/scroll.
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  };
});

beforeEach(() => {
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
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
});

function mountCard(props: Partial<InstanceType<typeof InlineExitPlanMode>['$props']> & {
  resolve: (decision: ExitPlanModeDecision | null) => void;
}) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  const wrapper = mount(InlineExitPlanMode, {
    props: { planPreview: null, planReadError: null, ...props },
    attachTo: document.body,
    global: {
      provide: {
        [APP_KEY as symbol]: new App(),
        [COMPONENT_KEY as symbol]: new Component(),
        [PLUGIN_KEY as symbol]: plugin,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

async function keydown(wrapper: ReturnType<typeof mount>, key: string): Promise<void> {
  wrapper.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await wrapper.vm.$nextTick();
}

describe('InlineExitPlanMode.vue', () => {
  it('renders root/title/permissions/rows/hints and resolves approve-new-session via resolvePlanContent', async () => {
    const resolve = vi.fn();
    const resolvePlanContent = vi.fn(() => 'Step 1\nStep 2');
    const wrapper = mountCard({
      resolve,
      planPreview: 'Step 1\nStep 2',
      planReadError: null,
      allowedPrompts: [{ tool: 'Bash', prompt: 'Run bash commands' }],
      resolvePlanContent,
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.element.classList.contains('specorator-plan-approval-inline')).toBe(true);
    expect(wrapper.element.getAttribute('tabindex')).toBe('0');
    expect(wrapper.find('.specorator-plan-inline-title').text()).toBe('Plan complete');

    const permLabel = wrapper.find('.specorator-plan-permissions-label');
    expect(permLabel.text()).toBe('Requested permissions:');
    const permItems = wrapper.findAll('.specorator-plan-permissions-list li').map((li) => li.text());
    expect(permItems).toEqual(['Run bash commands']);

    const rows = wrapper.findAll('.specorator-ask-item');
    expect(rows).toHaveLength(3);
    expect(rows[0].find('.specorator-ask-item-label').text()).toBe('Approve (new session)');
    expect(rows[1].find('.specorator-ask-item-label').text()).toBe('Approve (current session)');
    expect(rows[0].classes()).toContain('is-focused');
    expect(rows[2].classes()).toContain('specorator-ask-custom-item');
    expect(rows[2].find('.specorator-ask-custom-text').attributes('placeholder')).toBe(
      'Enter feedback to continue planning...',
    );

    expect(wrapper.find('.specorator-ask-hints').text()).toBe(
      'Arrow keys to navigate · Enter to select · Esc to cancel',
    );

    await keydown(wrapper, 'Enter');
    expect(resolvePlanContent).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({
      type: 'approve-new-session',
      planContent: 'Implement this plan:\n\nStep 1\nStep 2',
    });

    // Single-exit: a second key event is a no-op.
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('falls back to "Implement the approved plan." when resolvePlanContent is absent/returns null', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve, planReadError: 'ENOENT' });
    await wrapper.vm.$nextTick();

    const errorEl = wrapper.find('.specorator-plan-content-preview.specorator-plan-read-error');
    expect(errorEl.exists()).toBe(true);
    expect(errorEl.text()).toBe(
      'Could not read plan file: ENOENT. "Approve (new session)" will not include plan details.',
    );

    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'approve-new-session', planContent: 'Implement the approved plan.' });
  });

  it('omits the permissions block when allowedPrompts is absent/empty', () => {
    const wrapper = mountCard({ resolve: vi.fn() });
    expect(wrapper.find('.specorator-plan-permissions').exists()).toBe(false);

    const wrapper2 = mountCard({ resolve: vi.fn(), allowedPrompts: [] });
    expect(wrapper2.find('.specorator-plan-permissions').exists()).toBe(false);
  });

  it('resolves approve (current session) via ArrowDown + Enter', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'approve' });
  });

  it('resolves feedback via navigate-to-input + typed Enter', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter'); // focuses the feedback input
    expect(resolve).not.toHaveBeenCalled();

    const input = wrapper.find('.specorator-ask-custom-text');
    await input.setValue('Please revise the plan');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'feedback', text: 'Please revise the plan' });
  });

  it('resolves null on Escape at the top level', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    await keydown(wrapper, 'Escape');
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('resolves null exactly once on abort via the injected AbortSignal', async () => {
    const resolve = vi.fn();
    const controller = new AbortController();
    const wrapper = mountCard({ resolve, signal: controller.signal });
    await wrapper.vm.$nextTick();

    controller.abort();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);

    // A second abort (or any other resolve path) is a no-op.
    controller.abort();
    await keydown(wrapper, 'Escape');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolves null exactly once when unmounted before any decision (destroy() parity)', () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    wrapper.unmount();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('does not resolve again on unmount after a decision was already made', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
