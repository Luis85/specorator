import { createMockEl } from '@test/helpers/mockElement';

import { StreamingIndicator } from '@/features/chat/controllers/streamingIndicator';
import { ChatState } from '@/features/chat/state/ChatState';

/**
 * Task 17: the imperative indicator's show/showWriting/hide state is mirrored
 * onto `state.streamingIndicatorMode`, which drives the Vue `StreamingIndicator`
 * via `getActiveStreamSnapshot().isThinking/isWriting`. These tests assert the
 * DUAL-WRITE: the existing `thinkingEl` DOM stays, and the reactive mode tracks
 * it in lockstep.
 */
describe('StreamingIndicator reactive mode (dual-write)', () => {
  let state: ChatState;
  let indicator: StreamingIndicator;
  let updateQueueIndicator: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    state = new ChatState();
    state.activeMessageId = 'assistant-1';
    state.responseStartTime = performance.now();
    state.currentContentEl = createMockEl();
    updateQueueIndicator = jest.fn();
    indicator = new StreamingIndicator({
      state,
      getMessagesEl: () => createMockEl(),
      updateQueueIndicator,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('show() sets thinking mode only after the 400ms debounce renders the indicator', () => {
    indicator.show();

    // Before the debounce fires, nothing is on screen and the mode is still null.
    expect(state.thinkingEl).toBeNull();
    expect(state.streamingIndicatorMode).toBeNull();
    expect(state.getActiveStreamSnapshot()!.isThinking).toBe(false);

    jest.advanceTimersByTime(400);

    // After the debounce: the imperative DOM AND the reactive flag are set.
    expect(state.thinkingEl).not.toBeNull();
    expect(state.streamingIndicatorMode).toBe('thinking');
    const snap = state.getActiveStreamSnapshot()!;
    expect(snap.isThinking).toBe(true);
    expect(snap.isWriting).toBe(false);
  });

  it('show() does not set thinking mode while a reasoning block is active (suppressed)', () => {
    state.currentThinkingState = { content: 'x' } as never;
    indicator.show();
    jest.advanceTimersByTime(400);

    expect(state.thinkingEl).toBeNull();
    expect(state.streamingIndicatorMode).toBeNull();
    expect(state.getActiveStreamSnapshot()!.isThinking).toBe(false);
  });

  it('showWriting() sets writing mode immediately (no debounce) and mounts the DOM', () => {
    indicator.showWriting();

    expect(state.thinkingEl).not.toBeNull();
    expect(state.streamingIndicatorMode).toBe('writing');
    const snap = state.getActiveStreamSnapshot()!;
    expect(snap.isWriting).toBe(true);
    expect(snap.isThinking).toBe(false);
  });

  it('showWriting() converts an already-shown thinking indicator to writing mode', () => {
    indicator.show();
    jest.advanceTimersByTime(400);
    expect(state.streamingIndicatorMode).toBe('thinking');

    indicator.showWriting();
    expect(state.thinkingEl).not.toBeNull();
    expect(state.streamingIndicatorMode).toBe('writing');
  });

  it('hide() clears both the DOM and the reactive mode', () => {
    indicator.showWriting();
    expect(state.streamingIndicatorMode).toBe('writing');

    indicator.hide();

    expect(state.thinkingEl).toBeNull();
    expect(state.streamingIndicatorMode).toBeNull();
    expect(state.getActiveStreamSnapshot()!.isThinking).toBe(false);
    expect(state.getActiveStreamSnapshot()!.isWriting).toBe(false);
  });

  it('hide() cancels a pending show() before its mode is ever set', () => {
    indicator.show();
    indicator.hide();
    jest.advanceTimersByTime(400);

    expect(state.thinkingEl).toBeNull();
    expect(state.streamingIndicatorMode).toBeNull();
  });
});
