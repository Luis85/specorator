import { beforeAll, describe, expect, it, vi } from 'vitest';

import { InlineAskUserQuestion } from '@/features/chat/rendering/InlineAskUserQuestion';

/**
 * Characterization test: locks the exact DOM contract + keyboard-driven
 * resolve payloads the legacy `InlineAskUserQuestion` class produces (built
 * on `renderAskOptionRow`/`renderAskCustomInputRow` from
 * `askQuestionTabRenderer.ts` and `coerceOption`/`deduplicateOptions` from
 * `askUserQuestionOptions.ts`) so `InlineAskUserQuestion.vue`,
 * `AskOptionRow.vue`, `AskCustomInputRow.vue`, and `InlineApproval.vue` can be
 * built to reproduce it exactly. Its Vue parity twins are
 * `inlineAskUserQuestion.test.ts` and `inlineApproval.test.ts`.
 */

beforeAll(() => {
  // jsdom does not implement scrollIntoView; activateInlineCard + the
  // class's own updateFocusIndicator() both call it unconditionally.
  Element.prototype.scrollIntoView = vi.fn();
});

function fireKeyDown(root: HTMLElement, key: string, opts: KeyboardEventInit = {}): void {
  root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

// Real jsdom focus() (used by the card's auto-focus) is a no-op on
// disconnected elements, so every container must be attached.
function createContainer(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('InlineAskUserQuestion characterization', () => {
  it('renders title/tab-bar/question-tab DOM and resolves via full multi-question keyboard flow', () => {
    const container = createContainer();
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
    const widget = new InlineAskUserQuestion(container, input, resolve);
    widget.render();

    const root = container.querySelector('.specorator-ask-question-inline')!;
    expect(root.getAttribute('tabindex')).toBe('0');
    expect(root.querySelector('.specorator-ask-inline-title')?.textContent).toBe('Question');

    const tabs = Array.from(root.querySelectorAll('.specorator-ask-tab'));
    expect(tabs).toHaveLength(3); // 2 questions + submit
    // header is truncated to 12 chars when explicitly provided.
    expect(tabs[0].querySelector('.specorator-ask-tab-label')?.textContent).toBe('Color questi');
    expect(tabs[1].querySelector('.specorator-ask-tab-label')?.textContent).toBe('Q2');
    expect(tabs[2].querySelector('.specorator-ask-tab-label')?.textContent).toBe('Submit');
    expect(tabs[0].classList.contains('is-active')).toBe(true);
    expect(tabs[0].getAttribute('title')).toBe('Pick a color');

    const content = root.querySelector('.specorator-ask-content')!;
    expect(content.querySelector('.specorator-ask-question-text')?.textContent).toBe('Pick a color');
    const rows = Array.from(content.querySelectorAll('.specorator-ask-item'));
    // single-select question with no isOther -> 2 option rows, no custom row.
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.specorator-ask-item-label')?.textContent).toBe('Red');
    expect(rows[0].querySelector('.specorator-ask-cursor')?.textContent).toBe('›');
    expect(rows[1].querySelector('.specorator-ask-cursor')?.textContent).toBe('\u00A0');
    expect(content.querySelector('.specorator-ask-hints')?.textContent)
      .toBe('Enter to select · Tab/Arrow keys to navigate · Esc to cancel');

    // ArrowDown moves focus, Enter selects Blue -> single-select auto-advances tab.
    const root2 = root as HTMLElement;
    fireKeyDown(root2, 'ArrowDown');
    fireKeyDown(root2, 'Enter');
    expect(resolve).not.toHaveBeenCalled();
    expect(root.querySelector('.specorator-ask-tab.is-answered')).toBeTruthy();
    expect(root.querySelectorAll('.specorator-ask-tab')[1].classList.contains('is-active')).toBe(true);

    // Now on question 2 (multiSelect + isOther): 2 option rows + 1 custom row.
    const q2Rows = Array.from(root.querySelectorAll('.specorator-ask-content .specorator-ask-item'));
    expect(q2Rows).toHaveLength(3);
    expect(q2Rows[2].classList.contains('specorator-ask-custom-item')).toBe(true);
    const customInput = q2Rows[2].querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    expect(customInput.getAttribute('type')).toBe('text');
    expect(customInput.getAttribute('placeholder')).toBe('Type something.');

    // Toggle both multi-select checkboxes via Enter + ArrowDown.
    fireKeyDown(root2, 'Enter'); // select Cheese (focusedItemIndex reset to 0 on tab switch)
    expect(root.querySelectorAll('.specorator-ask-check.is-checked')).toHaveLength(1);
    fireKeyDown(root2, 'ArrowDown');
    fireKeyDown(root2, 'Enter'); // select Olives too
    expect(root.querySelectorAll('.specorator-ask-check.is-checked')).toHaveLength(2);

    // ArrowRight switches to submit tab.
    fireKeyDown(root2, 'ArrowRight');
    expect(root.querySelectorAll('.specorator-ask-tab')[2].classList.contains('is-active')).toBe(true);

    const reviewTitle = root.querySelector('.specorator-ask-review-title')!;
    expect(reviewTitle.textContent).toBe('Review your answers');
    const pairs = Array.from(root.querySelectorAll('.specorator-ask-review-pair'));
    expect(pairs).toHaveLength(2);
    expect(pairs[0].querySelector('.specorator-ask-review-num')?.textContent).toBe('1.');
    expect(pairs[0].querySelector('.specorator-ask-review-q-text')?.textContent).toBe('Pick a color');
    expect(pairs[0].querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Blue');
    expect(pairs[1].querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Cheese, Olives');

    const actionRows = Array.from(root.querySelectorAll('.specorator-ask-content .specorator-ask-item'));
    expect(actionRows).toHaveLength(2);
    expect(actionRows[0].querySelector('.specorator-ask-item-label')?.textContent).toBe('Submit answers');
    expect(actionRows[0].classList.contains('is-disabled')).toBe(false); // both questions answered

    // Submit via Enter on the focused submit row.
    fireKeyDown(root2, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({
      'Pick a color': 'Blue',
      'Pick toppings': ['Cheese', 'Olives'],
    });
    // Single-exit: root detached, further keydowns are no-ops.
    expect(root.isConnected).toBe(false);
    fireKeyDown(root2, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('gates submit until all questions are answered, then submits with custom "other" text', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const input = {
      questions: [
        { question: 'Q1', options: [{ label: 'A' }], multiSelect: false, isOther: true },
      ],
    };
    const widget = new InlineAskUserQuestion(container, input, resolve);
    widget.render();
    const root = container.querySelector('.specorator-ask-question-inline') as HTMLElement;

    // Switch to submit tab immediately without answering.
    fireKeyDown(root, 'ArrowRight');
    let submitRow = root.querySelectorAll('.specorator-ask-content .specorator-ask-item')[0];
    expect(submitRow.classList.contains('is-disabled')).toBe(true);
    fireKeyDown(root, 'Enter'); // submit attempt while disabled -> handleSubmit() no-ops
    expect(resolve).not.toHaveBeenCalled();

    // Back to question tab, type into the "other" custom input.
    fireKeyDown(root, 'ArrowLeft');
    fireKeyDown(root, 'ArrowDown'); // move focus onto the custom row (index === options.length)
    fireKeyDown(root, 'Enter'); // Enter on custom row focuses the input
    const customInput = root.querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    customInput.value = 'My own answer';
    customInput.dispatchEvent(new Event('input', { bubbles: true }));

    fireKeyDown(root, 'Tab'); // while input-focused, Tab exits input focus and advances tabs
    submitRow = root.querySelectorAll('.specorator-ask-content .specorator-ask-item')[0];
    expect(submitRow.classList.contains('is-disabled')).toBe(false);
    fireKeyDown(root, 'Enter');
    expect(resolve).toHaveBeenCalledWith({ Q1: 'My own answer' });
  });

  it('immediateSelect config (approval-style) resolves on first pick with no tab bar and a re-attached header', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const headerEl = document.createElement('div');
    headerEl.className = 'specorator-ask-approval-info';
    const toolEl = document.createElement('div');
    toolEl.className = 'specorator-ask-approval-tool';
    toolEl.textContent = 'Bash';
    headerEl.appendChild(toolEl);

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
    const widget = new InlineAskUserQuestion(container, input, resolve, undefined, {
      title: 'Permission required',
      headerEl,
      showCustomInput: false,
      immediateSelect: true,
    });
    widget.render();

    const root = container.querySelector('.specorator-ask-question-inline')!;
    expect(root.querySelector('.specorator-ask-inline-title')?.textContent).toBe('Permission required');
    expect(root.querySelector('.specorator-ask-approval-info')).toBe(headerEl);
    expect(root.querySelector('.specorator-ask-tab-bar')).toBeNull();
    const hints = root.querySelector('.specorator-ask-hints')!;
    expect(hints.textContent).toBe('Enter to select · Arrow keys to navigate · Esc to cancel');

    const root2 = root as HTMLElement;
    fireKeyDown(root2, 'ArrowDown'); // -> Allow once
    fireKeyDown(root2, 'Enter');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ 'Allow this action?': 'Allow once' });
  });

  it('immediateSelect is forced off when more than one question is supplied', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const input = {
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [{ label: 'B' }] },
      ],
    };
    const widget = new InlineAskUserQuestion(container, input, resolve, undefined, { immediateSelect: true });
    widget.render();
    const root = container.querySelector('.specorator-ask-question-inline')!;
    // tab bar present -> immediateSelect was reset to false.
    expect(root.querySelector('.specorator-ask-tab-bar')).toBeTruthy();
  });

  it('resolves null immediately when no valid questions are parsed', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const widget = new InlineAskUserQuestion(container, { questions: [] }, resolve);
    widget.render();
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('isSecret renders a password input with the secret placeholder', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [], isOther: true, isSecret: true }] };
    const widget = new InlineAskUserQuestion(container, input, resolve);
    widget.render();
    const root = container.querySelector('.specorator-ask-question-inline')!;
    const customInput = root.querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    expect(customInput.getAttribute('type')).toBe('password');
    expect(customInput.getAttribute('placeholder')).toBe('Enter secret.');
  });

  it('Escape at top level resolves null; Escape while input-focused only exits input focus', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [], isOther: true }] };
    const widget = new InlineAskUserQuestion(container, input, resolve);
    widget.render();
    const root = container.querySelector('.specorator-ask-question-inline') as HTMLElement;

    fireKeyDown(root, 'Enter'); // focuses the (only) custom row's input
    expect(resolve).not.toHaveBeenCalled();

    fireKeyDown(root, 'Escape'); // exits input focus, does not resolve
    expect(resolve).not.toHaveBeenCalled();

    fireKeyDown(root, 'Escape'); // now at top level -> resolves null
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('resolves null on abort and does not resolve twice on destroy()', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const controller = new AbortController();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }] }] };
    const widget = new InlineAskUserQuestion(container, input, resolve, controller.signal);
    widget.render();

    controller.abort();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);

    widget.destroy();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('destroy() alone (no prior render-triggered resolve) resolves null exactly once', () => {
    const container = createContainer();
    const resolve = vi.fn();
    const input = { questions: [{ question: 'Q1', options: [{ label: 'A' }] }] };
    const widget = new InlineAskUserQuestion(container, input, resolve);
    widget.render();

    widget.destroy();
    widget.destroy();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('clicking an option row selects it and clicking the custom row focuses its input', () => {
    const container = createContainer();
    const resolve = vi.fn();
    // multiSelect: true so selecting an option does not auto-advance the tab
    // (single-select's switchTab-on-select would detach the rows below).
    const input = {
      questions: [{ question: 'Q1', options: [{ label: 'A' }, { label: 'B' }], multiSelect: true, isOther: true }],
    };
    const widget = new InlineAskUserQuestion(container, input, resolve);
    widget.render();
    const root = container.querySelector('.specorator-ask-question-inline') as HTMLElement;

    const rows = Array.from(root.querySelectorAll('.specorator-ask-item'));
    (rows[1] as HTMLElement).click();
    expect(rows[1].classList.contains('is-selected')).toBe(true);
    expect(rows[1].querySelector('.specorator-ask-check.is-checked')).toBeTruthy();

    (rows[2] as HTMLElement).click();
    const customInput = rows[2].querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    expect(root.ownerDocument.activeElement).toBe(customInput);
  });
});
