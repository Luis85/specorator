import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STREAMING_RESPONSE_LABEL } from '@/features/chat/constants';
import { StreamingIndicator } from '@/features/chat/controllers/streamingIndicator';
import { ChatState } from '@/features/chat/state/ChatState';

/**
 * Characterization test: locks the exact `.specorator-thinking` DOM contract
 * the legacy `StreamingIndicator.render` produces (label span class/text,
 * hint span class/text format) so `StreamingIndicator.vue` can reproduce it.
 * This test is deleted alongside the legacy controller in Task 18; its Vue
 * parity twin (`streamingIndicator.test.ts`) remains.
 */
describe('StreamingIndicator characterization (DOM contract lock)', () => {
  let messagesEl: HTMLElement;
  let contentEl: HTMLElement;
  let state: ChatState;
  let indicator: StreamingIndicator;

  let nowMs = 10_000;

  beforeEach(() => {
    vi.useFakeTimers();
    // Fake timers under this vitest config leave `performance.now()`
    // pinned at 0 unless stubbed — pin it explicitly and align
    // `responseStartTime` to the same base so elapsed starts at 0s.
    nowMs = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    messagesEl = document.createElement('div');
    contentEl = document.createElement('div');
    messagesEl.appendChild(contentEl);
    // The legacy timer checks `timerSpan.isConnected` to stop ticking once
    // detached — attach to `document.body` so the interval actually fires.
    document.body.appendChild(messagesEl);
    state = new ChatState();
    state.currentContentEl = contentEl;
    state.responseStartTime = nowMs;
    indicator = new StreamingIndicator({
      state,
      getMessagesEl: () => messagesEl,
      updateQueueIndicator: vi.fn(),
    });
  });

  afterEach(() => {
    indicator.hide();
    messagesEl.remove();
    vi.useRealTimers();
  });

  it('show() debounces 400ms then renders .specorator-thinking > flavor + hint spans', () => {
    indicator.show('Thinking...');

    // Not yet rendered before the debounce elapses.
    expect(contentEl.querySelector('.specorator-thinking')).toBeNull();

    vi.advanceTimersByTime(400);

    const wrapper = contentEl.querySelector('.specorator-thinking') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toBe('specorator-thinking');

    const flavor = wrapper.querySelector('.specorator-thinking-flavor') as HTMLElement;
    expect(flavor).not.toBeNull();
    expect(flavor.textContent).toBe('Thinking...');

    const hint = wrapper.querySelector('.specorator-thinking-hint') as HTMLElement;
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe(' (esc to interrupt · 0s)');
  });

  it('hint text ticks with elapsed seconds via formatDurationMmSs', () => {
    indicator.show('Pondering...');
    vi.advanceTimersByTime(400);

    // Advance the stubbed clock 65s and let the 1s interval tick to pick it up.
    nowMs += 65_000;
    vi.advanceTimersByTime(1000);

    const hint = contentEl.querySelector('.specorator-thinking-hint') as HTMLElement;
    expect(hint.textContent).toBe(' (esc to interrupt · 1m 5s)');
  });

  it('showWriting() renders immediately (no debounce) with STREAMING_RESPONSE_LABEL', () => {
    indicator.showWriting();

    const wrapper = contentEl.querySelector('.specorator-thinking') as HTMLElement;
    expect(wrapper).not.toBeNull();

    const flavor = wrapper.querySelector('.specorator-thinking-flavor') as HTMLElement;
    expect(flavor.textContent).toBe(STREAMING_RESPONSE_LABEL);

    const hint = wrapper.querySelector('.specorator-thinking-hint') as HTMLElement;
    expect(hint.textContent).toBe(' (esc to interrupt · 0s)');
  });

  it('showWriting() relabels an already-mounted thinking indicator instead of creating a new one', () => {
    indicator.show('Ruminating...');
    vi.advanceTimersByTime(400);
    expect(contentEl.querySelectorAll('.specorator-thinking')).toHaveLength(1);

    indicator.showWriting();

    expect(contentEl.querySelectorAll('.specorator-thinking')).toHaveLength(1);
    const flavor = contentEl.querySelector('.specorator-thinking-flavor') as HTMLElement;
    expect(flavor.textContent).toBe(STREAMING_RESPONSE_LABEL);
  });

  it('hide() removes the indicator element', () => {
    indicator.showWriting();
    expect(contentEl.querySelector('.specorator-thinking')).not.toBeNull();

    indicator.hide();

    expect(contentEl.querySelector('.specorator-thinking')).toBeNull();
  });
});
