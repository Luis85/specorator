import { mount } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { PlanApprovalDecision } from '@/core/types/tools';
import InlinePlanApproval from '@/features/chat/ui/vue/transcript/inline/InlinePlanApproval.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

/**
 * Parity twin of the `InlinePlanApproval` half of
 * `inlinePlanCards.characterization.test.ts`: reproduces
 * `rendering/InlinePlanApproval.ts`'s root/title/rows/hints DOM (no
 * permissions block, no AbortSignal) and keyboard-driven resolve payloads
 * via `InlinePlanApproval.vue`. Also covers the promise contract this
 * component owns directly: single-exit resolve and unmount (before a
 * decision) -> null (this card's `destroy()` parity — it takes no signal).
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
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

function mountCard(props: Partial<InstanceType<typeof InlinePlanApproval>['$props']> & {
  resolve: (decision: PlanApprovalDecision | null) => void;
}) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  const wrapper = mount(InlinePlanApproval, {
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

describe('InlinePlanApproval.vue', () => {
  it('renders root/title/rows/hints (no permissions block) and resolves implement on default-focused Enter', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve, planPreview: 'Do the thing' });
    await wrapper.vm.$nextTick();

    expect(wrapper.element.classList.contains('specorator-plan-approval-inline')).toBe(true);
    expect(wrapper.element.getAttribute('tabindex')).toBe('0');
    expect(wrapper.find('.specorator-plan-inline-title').text()).toBe('Plan complete');
    expect(wrapper.find('.specorator-plan-permissions').exists()).toBe(false);

    const preview = wrapper.find('.specorator-plan-content-preview');
    expect(preview.exists()).toBe(true);
    expect(preview.classes()).not.toContain('specorator-plan-read-error');

    const rows = wrapper.findAll('.specorator-ask-item');
    expect(rows).toHaveLength(3);
    expect(rows[0].find('.specorator-ask-item-label').text()).toBe('Implement');
    expect(rows[1].classes()).toContain('specorator-ask-custom-item');
    expect(rows[1].find('.specorator-ask-custom-text').attributes('placeholder')).toBe(
      'Enter feedback to revise plan...',
    );
    expect(rows[2].find('.specorator-ask-item-label').text()).toBe('Cancel');

    expect(wrapper.find('.specorator-ask-hints').text()).toBe(
      'Arrow keys to navigate · Enter to select · Esc to cancel',
    );

    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ type: 'implement' });

    // Single-exit: a second key event is a no-op.
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolves cancel via ArrowDown, Escape (exit input focus), ArrowDown, Enter', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    await keydown(wrapper, 'ArrowDown'); // -> Revise, auto-focuses input
    await keydown(wrapper, 'Escape'); // exit input focus, does not cancel
    expect(resolve).not.toHaveBeenCalled();
    await keydown(wrapper, 'ArrowDown'); // -> Cancel
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'cancel' });
  });

  it('resolves revise with typed text', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    await keydown(wrapper, 'ArrowDown'); // -> Revise, auto-focuses input
    const input = wrapper.find('.specorator-ask-custom-text');
    await input.setValue('Add error handling');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ type: 'revise', text: 'Add error handling' });
  });

  it('resolves null on Escape at the top level', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve });

    await keydown(wrapper, 'Escape');
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('renders the read-error preview when planReadError is set', () => {
    const wrapper = mountCard({ resolve: vi.fn(), planReadError: 'boom' });

    const errorEl = wrapper.find('.specorator-plan-content-preview.specorator-plan-read-error');
    expect(errorEl.exists()).toBe(true);
    expect(errorEl.text()).toBe('Could not read plan file: boom');
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

    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('accepts no AbortSignal prop at all (unlike InlineExitPlanMode)', () => {
    const resolve = vi.fn();
    // No `signal` in props — mounting must not throw, matching legacy's
    // `InlinePlanApproval` constructor, which has no signal parameter.
    expect(() => mountCard({ resolve })).not.toThrow();
  });
});
