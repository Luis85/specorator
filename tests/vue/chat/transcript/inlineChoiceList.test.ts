import { mount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { InlineChoiceRowSpec } from '@/features/chat/rendering/inlineChoiceCard';
import InlineChoiceList from '@/features/chat/ui/vue/transcript/inline/InlineChoiceList.vue';

/**
 * Parity twin of the shared-row portion of
 * `inlinePlanCards.characterization.test.ts`: reproduces
 * `rendering/inlineChoiceCard.ts`'s `InlineChoiceList` row DOM + keyboard
 * state machine via `InlineChoiceList.vue`. Root-level chrome (tabindex,
 * rAF focus, abort) is host-card concern, exercised in
 * `inlineExitPlanMode.test.ts` / `inlinePlanApproval.test.ts`. Uses
 * `@vue/test-utils`'s `mount` (attached to `document.body`) rather than
 * `@testing-library/vue`'s `render` so `handleKeyDown` — exposed via
 * `defineExpose` for the host root's keydown delegation — is reachable, and
 * so `document.activeElement` assertions for the auto-focused input work.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

let wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.forEach((w) => w.unmount());
  wrappers = [];
});

function mountList(specs: InlineChoiceRowSpec[]) {
  const wrapper = mount(InlineChoiceList, { props: { specs }, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

function makeSpecs(overrides?: Partial<Record<'onSelectA' | 'onSelectB' | 'onSubmit', () => void>>) {
  const onSelectA = vi.fn();
  const onSelectB = vi.fn();
  const onSubmit = vi.fn();
  const specs: InlineChoiceRowSpec[] = [
    { kind: 'action', label: 'First', onSelect: overrides?.onSelectA ?? onSelectA },
    { kind: 'action', label: 'Second', onSelect: overrides?.onSelectB ?? onSelectB },
    { kind: 'input', placeholder: 'Type here...', onSubmit: overrides?.onSubmit ?? onSubmit },
  ];
  return { specs, onSelectA, onSelectB, onSubmit };
}

// `is-focused` is a reactive class binding — Vue batches the DOM patch onto
// the next microtask, so callers that assert on it must await this.
async function keydown(wrapper: ReturnType<typeof mount>, key: string): Promise<KeyboardEvent> {
  const evt = new KeyboardEvent('keydown', { key, cancelable: true });
  (wrapper.vm as unknown as { handleKeyDown: (e: KeyboardEvent) => void }).handleKeyDown(evt);
  await wrapper.vm.$nextTick();
  return evt;
}

describe('InlineChoiceList', () => {
  it('renders action + input rows with the exact DOM shape, first row focused', () => {
    const { specs } = makeSpecs();
    const wrapper = mountList(specs);

    expect(wrapper.element.classList.contains('specorator-ask-list')).toBe(true);
    const rows = Array.from(wrapper.element.querySelectorAll('.specorator-ask-item')) as HTMLElement[];
    expect(rows).toHaveLength(3);

    expect(rows[0].classList.contains('is-focused')).toBe(true);
    expect(rows[0].classList.contains('specorator-ask-custom-item')).toBe(false);
    expect(rows[0].querySelector('.specorator-ask-cursor')?.textContent).toBe('›');
    expect(rows[0].querySelector('.specorator-ask-item-num')?.textContent).toBe('1. ');
    expect(rows[0].querySelector('.specorator-ask-item-label')?.textContent).toBe('First');

    expect(rows[1].classList.contains('is-focused')).toBe(false);
    expect(rows[1].querySelector('.specorator-ask-cursor')?.textContent).toBe(' ');
    expect(rows[1].querySelector('.specorator-ask-item-label')?.textContent).toBe('Second');

    expect(rows[2].classList.contains('specorator-ask-custom-item')).toBe(true);
    const input = rows[2].querySelector('.specorator-ask-custom-text') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.placeholder).toBe('Type here...');
    expect(input.type).toBe('text');
  });

  it('clicking an action row selects it and focuses it', async () => {
    const { specs, onSelectB } = makeSpecs();
    const wrapper = mountList(specs);
    const rows = wrapper.element.querySelectorAll('.specorator-ask-item');

    (rows[1] as HTMLElement).click();
    await wrapper.vm.$nextTick();

    expect(onSelectB).toHaveBeenCalledTimes(1);
    expect(rows[1].classList.contains('is-focused')).toBe(true);
    expect(rows[0].classList.contains('is-focused')).toBe(false);
  });

  it('exposes handleKeyDown for arrow navigation, clamped at both ends', async () => {
    const { specs } = makeSpecs();
    const wrapper = mountList(specs);
    const rows = () => Array.from(wrapper.element.querySelectorAll('.specorator-ask-item')) as HTMLElement[];

    await keydown(wrapper, 'ArrowDown');
    expect(rows()[1].classList.contains('is-focused')).toBe(true);

    await keydown(wrapper, 'ArrowDown');
    // Now on the input row (index 2) — clamps here, does not go further. The
    // row's own auto-focus puts the widget in input-focus mode, where arrow
    // keys are swallowed (matching legacy) until Escape exits it.
    await keydown(wrapper, 'ArrowDown');
    expect(rows()[2].classList.contains('is-focused')).toBe(true);

    await keydown(wrapper, 'Escape'); // exit input focus, does not cancel
    await keydown(wrapper, 'ArrowUp');
    await keydown(wrapper, 'ArrowUp');
    await keydown(wrapper, 'ArrowUp');
    expect(rows()[0].classList.contains('is-focused')).toBe(true);
  });

  it('Enter on a focused action row calls onSelect; Enter on the input row focuses it', async () => {
    const { specs, onSelectA } = makeSpecs();
    const wrapper = mountList(specs);
    const input = wrapper.element.querySelector('.specorator-ask-custom-text') as HTMLInputElement;

    await keydown(wrapper, 'Enter');
    expect(onSelectA).toHaveBeenCalledTimes(1);

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'Enter');
    expect(document.activeElement).toBe(input);
  });

  it('Escape at the top level emits cancel', async () => {
    const { specs } = makeSpecs();
    const wrapper = mountList(specs);

    await keydown(wrapper, 'Escape');
    expect(wrapper.emitted().cancel).toHaveLength(1);
  });

  it('when input is focused: Enter with non-empty trimmed value submits; whitespace-only does not', async () => {
    const { specs, onSubmit } = makeSpecs();
    const wrapper = mountList(specs);
    const input = wrapper.element.querySelector('.specorator-ask-custom-text') as HTMLInputElement;

    // Navigate to and auto-focus the input row.
    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'ArrowDown');
    expect(document.activeElement).toBe(input);

    input.value = '   ';
    await keydown(wrapper, 'Enter');
    expect(onSubmit).not.toHaveBeenCalled();

    input.value = '  hello  ';
    await keydown(wrapper, 'Enter');
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('when input is focused: Escape exits input focus and emits exit-input-focus (does not cancel)', async () => {
    const { specs } = makeSpecs();
    const wrapper = mountList(specs);
    const input = wrapper.element.querySelector('.specorator-ask-custom-text') as HTMLInputElement;

    await keydown(wrapper, 'ArrowDown');
    await keydown(wrapper, 'ArrowDown');
    expect(document.activeElement).toBe(input);

    await keydown(wrapper, 'Escape');
    expect(wrapper.emitted()['exit-input-focus']).toHaveLength(1);
    expect(wrapper.emitted().cancel).toBeUndefined();
    expect(document.activeElement).not.toBe(input);

    // Now back at top level: Escape cancels normally.
    await keydown(wrapper, 'Escape');
    expect(wrapper.emitted().cancel).toHaveLength(1);
  });

  it('preventDefault on every handled key; unhandled keys are a no-op', async () => {
    const { specs } = makeSpecs();
    const wrapper = mountList(specs);

    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
      const evt = await keydown(wrapper, key);
      expect(evt.defaultPrevented).toBe(true);
    }

    const unhandled = await keydown(wrapper, 'a');
    expect(unhandled.defaultPrevented).toBe(false);
  });
});
