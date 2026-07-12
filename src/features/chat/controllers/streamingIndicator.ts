import type { ChatState } from '../state/ChatState';

export interface StreamingIndicatorDeps {
  state: ChatState;
  getMessagesEl: () => HTMLElement;
  updateQueueIndicator: () => void;
  /** Re-projects the transcript snapshot (drives the Vue StreamingIndicator). */
  emit: () => void;
}

/**
 * Owns the streaming-indicator STATE beneath the active assistant turn: the
 * debounced "thinking" flavor mode and the immediate "writing" placeholder mode,
 * tracked on `ChatState.streamingIndicatorMode` (read by
 * `getActiveStreamSnapshot`). The Vue `StreamingIndicator` renders the DOM from
 * that snapshot — this class no longer builds any DOM. A 1s ticker re-emits so
 * the Vue timer's `elapsedSeconds` (derived from `responseStartTime`) advances.
 */
export class StreamingIndicator {
  /** Debounce delay before entering the thinking mode (ms). */
  private static readonly DELAY = 400;

  constructor(private deps: StreamingIndicatorDeps) {}

  /**
   * Schedules the debounced "thinking" mode after {@link DELAY}. If content
   * arrives first, the caller's `hide`/`showWriting` supersedes it. Thinking
   * block state takes priority — the flavor mode never shows while a reasoning
   * block is open. `overrideText`/`overrideCls` are accepted for call-site
   * compatibility but no longer rendered (the Vue indicator owns its label).
   */
  show(_overrideText?: string, _overrideCls?: string): void {
    const { state } = this.deps;
    if (!state.currentContentEl) return;

    if (state.thinkingIndicatorTimeout) {
      state.clearThinkingIndicatorTimeout(this.getWindow());
    }

    // Don't enter flavor mode while a model thinking block is active.
    if (state.currentThinkingState) return;
    // Already in thinking mode — nothing to reschedule.
    if (state.streamingIndicatorMode === 'thinking') {
      this.deps.updateQueueIndicator();
      return;
    }

    const timerWindow = this.getWindow();
    if (!timerWindow) return;
    state.setThinkingIndicatorTimeout(
      timerWindow.setTimeout(() => {
        state.setThinkingIndicatorTimeout(null, null);
        if (!state.currentContentEl || state.streamingIndicatorMode === 'thinking' || state.currentThinkingState) {
          return;
        }
        state.streamingIndicatorMode = 'thinking';
        this.startTicker();
        this.deps.emit();
      }, StreamingIndicator.DELAY),
      timerWindow,
    );
  }

  /**
   * Immediately enters the "writing" placeholder mode (collapse mode). Unlike
   * {@link show}, bypasses the debounce — a continuous text-only answer never
   * produces the 400ms idle gap.
   */
  showWriting(): void {
    const { state } = this.deps;
    if (!state.currentContentEl || state.currentThinkingState) return;

    if (state.thinkingIndicatorTimeout) {
      state.clearThinkingIndicatorTimeout(this.getWindow());
    }
    state.streamingIndicatorMode = 'writing';
    this.startTicker();
    this.deps.updateQueueIndicator();
    this.deps.emit();
  }

  /** Clears the indicator mode and cancels any pending show timeout + ticker. */
  hide(): void {
    const { state } = this.deps;

    if (state.thinkingIndicatorTimeout) {
      state.clearThinkingIndicatorTimeout(this.getWindow());
    }
    // Clear the ticker (but preserve responseStartTime for duration capture).
    state.clearFlavorTimerInterval();
    state.streamingIndicatorMode = null;
    this.deps.emit();
  }

  /** Starts the 1s re-emit ticker that advances the Vue indicator's elapsed timer. */
  private startTicker(): void {
    const { state } = this.deps;
    if (state.flavorTimerInterval) {
      state.clearFlavorTimerInterval();
    }
    const tickerWindow = this.getWindow();
    if (!tickerWindow) return;
    state.setFlavorTimerInterval(
      tickerWindow.setInterval(() => {
        if (!state.responseStartTime) return;
        this.deps.emit();
      }, 1000),
      tickerWindow,
    );
  }

  private getWindow(): Window | null {
    return this.deps.getMessagesEl().ownerDocument.defaultView
      ?? (typeof window === 'undefined' ? null : window);
  }
}
