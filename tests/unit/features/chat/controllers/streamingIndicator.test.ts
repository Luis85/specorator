import { createMockEl } from '@test/helpers/mockElement';

import { StreamingIndicator } from '@/features/chat/controllers/streamingIndicator';
import { ChatState } from '@/features/chat/state/ChatState';

/**
 * Data-only (Task 18a): the indicator no longer builds any DOM — it tracks
 * `state.streamingIndicatorMode`, which drives the Vue `StreamingIndicator` via
 * `getActiveStreamSnapshot().isThinking/isWriting`, and re-emits so the Vue
 * elapsed timer advances. These tests assert the mode transitions + emits.
 */
describe('StreamingIndicator reactive mode (data-only)', () => {
  let state: ChatState;
  let indicator: StreamingIndicator;
  let updateQueueIndicator: jest.Mock;
  let emit: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    state = new ChatState();
    state.activeMessageId = 'assistant-1';
    state.responseStartTime = performance.now();
    state.currentContentEl = createMockEl();
    updateQueueIndicator = jest.fn();
    emit = jest.fn();
    indicator = new StreamingIndicator({
      state,
      getMessagesEl: () => createMockEl(),
      updateQueueIndicator,
      emit,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('show() sets thinking mode only after the 400ms debounce, then emits', () => {
    indicator.show();

    // Before the debounce fires, the mode is still null.
    expect(state.streamingIndicatorMode).toBeNull();
    expect(state.getActiveStreamSnapshot()!.isThinking).toBe(false);

    jest.advanceTimersByTime(400);

    expect(state.streamingIndicatorMode).toBe('thinking');
    const snap = state.getActiveStreamSnapshot()!;
    expect(snap.isThinking).toBe(true);
    expect(snap.isWriting).toBe(false);
    expect(emit).toHaveBeenCalled();
  });

  it('show() does not set thinking mode while a reasoning block is active (suppressed)', () => {
    state.currentThinkingState = { content: 'x' } as never;
    indicator.show();
    jest.advanceTimersByTime(400);

    expect(state.streamingIndicatorMode).toBeNull();
    expect(state.getActiveStreamSnapshot()!.isThinking).toBe(false);
  });

  it('showWriting() sets writing mode immediately (no debounce) and emits', () => {
    indicator.showWriting();

    expect(state.streamingIndicatorMode).toBe('writing');
    const snap = state.getActiveStreamSnapshot()!;
    expect(snap.isWriting).toBe(true);
    expect(snap.isThinking).toBe(false);
    expect(emit).toHaveBeenCalled();
  });

  it('showWriting() converts an already-shown thinking indicator to writing mode', () => {
    indicator.show();
    jest.advanceTimersByTime(400);
    expect(state.streamingIndicatorMode).toBe('thinking');

    indicator.showWriting();
    expect(state.streamingIndicatorMode).toBe('writing');
  });

  it('hide() clears the reactive mode and emits', () => {
    indicator.showWriting();
    expect(state.streamingIndicatorMode).toBe('writing');

    indicator.hide();

    expect(state.streamingIndicatorMode).toBeNull();
    expect(state.getActiveStreamSnapshot()!.isThinking).toBe(false);
    expect(state.getActiveStreamSnapshot()!.isWriting).toBe(false);
    expect(emit).toHaveBeenCalled();
  });

  it('hide() cancels a pending show() before its mode is ever set', () => {
    indicator.show();
    indicator.hide();
    jest.advanceTimersByTime(400);

    expect(state.streamingIndicatorMode).toBeNull();
  });

  it('show(overrideText) stores the custom label once thinking mode is entered', () => {
    indicator.show('Compacting...');

    // Label lands only after the debounce enters thinking mode.
    expect(state.streamingIndicatorLabel).toBeNull();

    jest.advanceTimersByTime(400);

    expect(state.streamingIndicatorMode).toBe('thinking');
    expect(state.streamingIndicatorLabel).toBe('Compacting...');
    expect(state.getActiveStreamSnapshot()!.label).toBe('Compacting...');
  });

  it('show() without an override leaves the label null (default flavor)', () => {
    indicator.show();
    jest.advanceTimersByTime(400);

    expect(state.streamingIndicatorMode).toBe('thinking');
    expect(state.streamingIndicatorLabel).toBeNull();
    expect(state.getActiveStreamSnapshot()!.label).toBeUndefined();
  });

  it('hide() clears the custom label', () => {
    indicator.show('Compacting...');
    jest.advanceTimersByTime(400);
    expect(state.streamingIndicatorLabel).toBe('Compacting...');

    indicator.hide();

    expect(state.streamingIndicatorLabel).toBeNull();
    expect(state.getActiveStreamSnapshot()!.label).toBeUndefined();
  });

  it('resetStreamingState() clears the custom label', () => {
    indicator.show('Compacting...');
    jest.advanceTimersByTime(400);
    expect(state.streamingIndicatorLabel).toBe('Compacting...');

    state.resetStreamingState();

    expect(state.streamingIndicatorLabel).toBeNull();
  });
});
