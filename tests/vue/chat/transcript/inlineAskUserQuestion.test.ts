import { mount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import InlineAskUserQuestion from '@/features/chat/ui/vue/transcript/inline/InlineAskUserQuestion.vue';

/**
 * Parity twin of `inlineAskUserQuestion.characterization.test.ts`: reproduces
 * `rendering/InlineAskUserQuestion.ts`'s root/tab-bar/question-tab/submit-tab
 * DOM and keyboard-driven resolve payloads via `InlineAskUserQuestion.vue`
 * (+ `AskOptionRow.vue` / `AskCustomInputRow.vue`). Also covers the promise
 * contract this component owns directly: single-exit resolve, abort -> null,
 * and unmount (before a resolve) -> null.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // rAF must actually run its callback for the mount-time focus/scroll.
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
});

function mountCard(props: Partial<InstanceType<typeof InlineAskUserQuestion>['$props']> & {
  resolve: (result: Record<string, string | string[]> | null) => void;
  input: Record<string, unknown>;
}) {
  const wrapper = mount(InlineAskUserQuestion, {
    props,
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
}

async function keydown(wrapper: ReturnType<typeof mount>, key: string, opts: KeyboardEventInit = {}): Promise<void> {
  wrapper.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
  await wrapper.vm.$nextTick();
}

describe('InlineAskUserQuestion.vue', () => {
  it('renders title/tab-bar/question-tab DOM and resolves via full multi-question keyboard flow', async () => {
    const resolve = vi.fn<(result: Record<string, string | string[]> | null) => void>();
    const input = {
      questions: [
        {
          question: 'Pick a color',
          header: 'Color question header',
          options: [{ label: 'Red' }, { label: 'Blue' }],
          multiSelect: false,
        },
        {
          question: 'Pick toppings',
          options: ['Cheese', 'Olives'],
          multiSelect: true,
          isOther: true,
        },
      ],
    };
    const wrapper = mountCard({ resolve, input });
    await wrapper.vm.$nextTick();

    expect(wrapper.element.classList.contains('specorator-ask-question-inline')).toBe(true);
    expect(wrapper.element.getAttribute('tabindex')).toBe('0');
    expect(wrapper.find('.specorator-ask-inline-title').text()).toBe('Question');

    const tabs = wrapper.findAll('.specorator-ask-tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].find('.specorator-ask-tab-label').text()).toBe('Color questi');
    expect(tabs[1].find('.specorator-ask-tab-label').text()).toBe('Q2');
    expect(tabs[2].find('.specorator-ask-tab-label').text()).toBe('Submit');
    expect(tabs[0].classes()).toContain('is-active');
    expect(tabs[0].attributes('title')).toBe('Pick a color');

    expect(wrapper.find('.specorator-ask-question-text').text()).toBe('Pick a color');
    let rows = wrapper.findAll('.specorator-ask-item');
    expect(rows).toHaveLength(2);
    expect(rows[0].find('.specorator-ask-item-label').text()).toBe('Red');
    expect(wrapper.find('.specorator-ask-hints').text()).toBe(
      'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
    );

    // ArrowDown moves focus, Enter selects Blue -> single-select auto-advances tab.
    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter');
    expect(resolve).not.toHaveBeenCalled();
    expect(wrapper.find('.specorator-ask-tab.is-answered').exists()).toBe(true);
    expect(wrapper.findAll('.specorator-ask-tab')[1].classes()).toContain('is-active');

    rows = wrapper.findAll('.specorator-ask-item');
    expect(rows).toHaveLength(3);
    expect(rows[2].classes()).toContain('specorator-ask-custom-item');
    const customInput = rows[2].find('.specorator-ask-custom-text');
    expect(customInput.attributes('type')).toBe('text');
    expect(customInput.attributes('placeholder')).toBe('Type something.');

    await keydown(wrapper, 'Enter'); // select Cheese
    expect(wrapper.findAll('.specorator-ask-check.is-checked')).toHaveLength(1);
    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter'); // select Olives too
    expect(wrapper.findAll('.specorator-ask-check.is-checked')).toHaveLength(2);

    await keydown(wrapper, 'ArrowRight');
    expect(wrapper.findAll('.specorator-ask-tab')[2].classes()).toContain('is-active');

    expect(wrapper.find('.specorator-ask-review-title').text()).toBe('Review your answers');
    const pairs = wrapper.findAll('.specorator-ask-review-pair');
    expect(pairs).toHaveLength(2);
    expect(pairs[0].find('.specorator-ask-review-num').text()).toBe('1.');
    expect(pairs[0].find('.specorator-ask-review-q-text').text()).toBe('Pick a color');
    expect(pairs[0].find('.specorator-ask-review-a-text').text()).toBe('Blue');
    expect(pairs[1].find('.specorator-ask-review-a-text').text()).toBe('Cheese, Olives');

    const actionRows = wrapper.findAll('.specorator-ask-content .specorator-ask-item');
    expect(actionRows).toHaveLength(2);
    expect(actionRows[0].find('.specorator-ask-item-label').text()).toBe('Submit answers');
    expect(actionRows[0].classes()).not.toContain('is-disabled');

    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({
      'Pick a color': 'Blue',
      'Pick toppings': ['Cheese', 'Olives'],
    });

    // Single-exit: a second key event is a no-op.
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('gates submit until all questions are answered, then submits with custom "other" text', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [
        { question: 'Q1', options: [{ label: 'A' }], multiSelect: false, isOther: true },
      ],
    };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'ArrowRight');
    let submitRow = wrapper.findAll('.specorator-ask-content .specorator-ask-item')[0];
    expect(submitRow.classes()).toContain('is-disabled');
    await keydown(wrapper, 'Enter');
    expect(resolve).not.toHaveBeenCalled();

    await keydown(wrapper, 'ArrowLeft');
    await keydown(wrapper, 'ArrowDown'); // move focus onto the custom row
    await keydown(wrapper, 'Enter'); // Enter on custom row focuses the input
    const customInput = wrapper.find('.specorator-ask-custom-text');
    await customInput.setValue('My own answer');

    await keydown(wrapper, 'Tab'); // while input-focused, Tab exits input focus and advances tabs
    submitRow = wrapper.findAll('.specorator-ask-content .specorator-ask-item')[0];
    expect(submitRow.classes()).not.toContain('is-disabled');
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ Q1: 'My own answer' });
  });

  it('immediateSelect config (approval-style) resolves on first pick with no tab bar and header slot content', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [
        {
          question: 'Allow this action?',
          options: [
            { label: 'Deny', value: 'Deny' },
            { label: 'Allow once', value: 'Allow once' },
            { label: 'Always allow', value: 'Always allow' },
          ],
          isOther: false,
          isSecret: false,
        },
      ],
    };
    const wrapper = mount(InlineAskUserQuestion, {
      props: {
        resolve,
        input,
        title: 'Permission required',
        showCustomInput: false,
        immediateSelect: true,
      },
      attachTo: document.body,
      slots: {
        header: '<div class="specorator-ask-approval-info">header content</div>',
      },
    });
    wrappers.push(wrapper);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.specorator-ask-inline-title').text()).toBe('Permission required');
    expect(wrapper.find('.specorator-ask-approval-info').exists()).toBe(true);
    expect(wrapper.find('.specorator-ask-tab-bar').exists()).toBe(false);
    expect(wrapper.find('.specorator-ask-hints').text()).toBe(
      'Enter to select · Arrow keys to navigate · Esc to cancel',
    );

    await keydown(wrapper, 'ArrowDown'); // -> Allow once
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ 'Allow this action?': 'Allow once' });
  });

  it('immediateSelect is forced off when more than one question is supplied', () => {
    const resolve = vi.fn();
    const input = {
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [{ label: 'B' }] },
      ],
    };
    const wrapper = mountCard({ resolve, input, immediateSelect: true });
    expect(wrapper.find('.specorator-ask-tab-bar').exists()).toBe(true);
  });

  it('resolves null immediately when no valid questions are parsed', async () => {
    const resolve = vi.fn();
    const wrapper = mountCard({ resolve, input: { questions: [] } });
    await wrapper.vm.$nextTick();
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('isSecret renders a password input with the secret placeholder', () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [], isOther: true, isSecret: true }] };
    const wrapper = mountCard({ resolve, input });
    const customInput = wrapper.find('.specorator-ask-custom-text');
    expect(customInput.attributes('type')).toBe('password');
    expect(customInput.attributes('placeholder')).toBe('Enter secret.');
  });

  it('Escape at top level resolves null; Escape while input-focused only exits input focus', async () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [], isOther: true }] };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'Enter'); // focuses the (only) custom row's input
    expect(resolve).not.toHaveBeenCalled();

    await keydown(wrapper, 'Escape'); // exits input focus, does not resolve
    expect(resolve).not.toHaveBeenCalled();

    await keydown(wrapper, 'Escape'); // now at top level -> resolves null
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('resolves null exactly once on abort via the injected AbortSignal', async () => {
    const resolve = vi.fn();
    const controller = new AbortController();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }] }] };
    const wrapper = mountCard({ resolve, input, signal: controller.signal });
    await wrapper.vm.$nextTick();

    controller.abort();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);

    controller.abort();
    await keydown(wrapper, 'Escape');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolves null exactly once when unmounted before any decision (destroy() parity)', () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }] }] };
    const wrapper = mountCard({ resolve, input });

    wrapper.unmount();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('does not resolve again on unmount after a resolve already happened', async () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }] }] };
    const wrapper = mountCard({ resolve, input, immediateSelect: true });

    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('clicking an option row selects it and clicking the custom row focuses its input', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [{ question: 'Q1', options: [{ label: 'A' }, { label: 'B' }], multiSelect: true, isOther: true }],
    };
    const wrapper = mountCard({ resolve, input });

    const rows = wrapper.findAll('.specorator-ask-item');
    await rows[1].trigger('click');
    expect(rows[1].classes()).toContain('is-selected');
    expect(wrapper.find('.specorator-ask-check.is-checked').exists()).toBe(true);

    await rows[2].trigger('click');
    const customInput = wrapper.find('.specorator-ask-custom-text');
    expect(wrapper.element.ownerDocument.activeElement).toBe(customInput.element);
  });

  it('multiSelect toggles a value on and off via repeated Enter', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [{ question: 'Q1', options: [{ label: 'A' }], multiSelect: true }],
    };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'Enter'); // select A
    expect(wrapper.find('.specorator-ask-item').classes()).toContain('is-selected');
    await keydown(wrapper, 'Enter'); // deselect A
    expect(wrapper.find('.specorator-ask-item').classes()).not.toContain('is-selected');
  });

  it('Tab (not input-focused) switches tabs via handleNavigationKey, Shift+Tab switches back', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [{ label: 'B' }] },
      ],
    };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'Tab');
    expect(wrapper.find('.specorator-ask-question-text').text()).toBe('Q2');
    await keydown(wrapper, 'Tab', { shiftKey: true });
    expect(wrapper.find('.specorator-ask-question-text').text()).toBe('Q1');
  });

  it('ArrowUp/ArrowDown while input-focused move focus and exit input focus', async () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }], isOther: true }] };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'ArrowDown'); // focus custom row
    await keydown(wrapper, 'Enter'); // focus the input
    const customInput = wrapper.find('.specorator-ask-custom-text');
    expect(wrapper.element.ownerDocument.activeElement).toBe(customInput.element);

    await keydown(wrapper, 'ArrowUp'); // moves focus back to option row, exits input focus
    const rows = wrapper.findAll('.specorator-ask-item');
    expect(rows[0].classes()).toContain('is-focused');
    expect(wrapper.element.ownerDocument.activeElement).not.toBe(customInput.element);
  });

  it('Enter on the focused Cancel row (submit tab) resolves null', async () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }] }] };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'ArrowRight'); // -> submit tab
    await keydown(wrapper, 'ArrowDown'); // focus Cancel row
    await keydown(wrapper, 'Enter');
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('clicking the Submit answers row submits, clicking Cancel resolves null', async () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }] }] };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'ArrowRight'); // -> submit tab, not yet answered
    const actionRows = wrapper.findAll('.specorator-ask-content .specorator-ask-item');
    await actionRows[0].trigger('click'); // Submit answers, but disabled -> no-op
    expect(resolve).not.toHaveBeenCalled();

    await actionRows[1].trigger('click'); // Cancel
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('clicking the Submit answers row submits once all questions are answered', async () => {
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }], multiSelect: true }] };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'Enter'); // select A (multiSelect stays on the question tab)
    await keydown(wrapper, 'ArrowRight'); // -> submit tab
    const actionRows = wrapper.findAll('.specorator-ask-content .specorator-ask-item');
    await actionRows[0].trigger('click');
    expect(resolve).toHaveBeenCalledWith({ Q1: ['A'] });
  });

  it('ArrowUp moves focus upward on a question tab (not input-focused)', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [{ question: 'Q1', options: [{ label: 'A' }, { label: 'B' }], multiSelect: true }],
    };
    const wrapper = mountCard({ resolve, input });

    await keydown(wrapper, 'ArrowDown'); // focus row 1 (B)
    expect(wrapper.findAll('.specorator-ask-item')[1].classes()).toContain('is-focused');
    await keydown(wrapper, 'ArrowUp'); // focus back to row 0 (A)
    expect(wrapper.findAll('.specorator-ask-item')[0].classes()).toContain('is-focused');
  });

  it('clicking a tab bar item switches tabs directly', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [{ label: 'B' }] },
      ],
    };
    const wrapper = mountCard({ resolve, input });

    const tabs = wrapper.findAll('.specorator-ask-tab');
    await tabs[1].trigger('click'); // jump straight to Q2
    expect(wrapper.find('.specorator-ask-question-text').text()).toBe('Q2');

    await tabs[2].trigger('click'); // jump straight to Submit
    expect(wrapper.find('.specorator-ask-review-title').exists()).toBe(true);
  });

  it('clicking a review pair jumps back to that question tab', async () => {
    const resolve = vi.fn();
    const input = {
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [{ label: 'B' }] },
      ],
    };
    const wrapper = mountCard({ resolve, input, immediateSelect: false });

    await keydown(wrapper, 'ArrowRight'); // -> Q2
    await keydown(wrapper, 'ArrowRight'); // -> Submit
    expect(wrapper.find('.specorator-ask-review-title').exists()).toBe(true);

    const pairs = wrapper.findAll('.specorator-ask-review-pair');
    await pairs[0].trigger('click'); // back to Q1
    expect(wrapper.find('.specorator-ask-question-text').text()).toBe('Q1');
  });
});
