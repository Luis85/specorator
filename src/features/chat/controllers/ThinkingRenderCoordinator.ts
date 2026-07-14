import type { ChatMessage } from '../../../core/types';
import {
  createThinkingTimingState,
  finalizeThinkingTimingState,
  type ThinkingTimingState,
} from '../rendering/ThinkingBlockRenderer';
import type { ChatState } from '../state/ChatState';

export interface ThinkingRenderDeps {
  state: ChatState;
  hideThinkingIndicator: () => void;
}

/**
 * Owns the streaming thinking-block lifecycle as pure reactive data: it grows
 * the open `thinking` content block on `msg.contentBlocks` (the Vue
 * `ThinkingBlock` renders the live growth + final `durationSeconds`).
 */
export class ThinkingRenderCoordinator {
  constructor(private readonly deps: ThinkingRenderDeps) {}

  async append(content: string, msg?: ChatMessage): Promise<void> {
    const { state } = this.deps;
    if (!state.currentContentEl) return;

    this.deps.hideThinkingIndicator();
    if (!state.currentThinkingState) {
      state.currentThinkingState = createThinkingTimingState();
      this.openReactiveThinkingBlock(msg);
    }

    state.currentThinkingState.content += content;
    this.growReactiveThinkingBlock(msg);
  }

  async finalize(msg?: ChatMessage): Promise<void> {
    const { state } = this.deps;
    if (!state.currentThinkingState) return;

    const thinkingState = state.currentThinkingState;
    const durationSeconds = finalizeThinkingTimingState(thinkingState);
    this.closeReactiveThinkingBlock(msg, thinkingState.content, durationSeconds);

    state.currentThinkingState = null;
  }

  cancel(): void {
    // No render loop to cancel in data-only mode.
  }

  /** Pushes the empty reactive thinking block that `append` grows and `finalize` closes. */
  private openReactiveThinkingBlock(msg?: ChatMessage): void {
    if (!msg) return;
    msg.contentBlocks = msg.contentBlocks || [];
    msg.contentBlocks.push({ type: 'thinking', content: '' });
    this.deps.state.activeBlockIndex = msg.contentBlocks.length - 1;
  }

  /** Mirrors the accumulated reasoning into the open reactive block. */
  private growReactiveThinkingBlock(msg?: ChatMessage): void {
    if (!msg) return;
    const { state } = this.deps;
    const block = msg.contentBlocks?.[state.activeBlockIndex];
    if (block?.type === 'thinking') {
      block.content = state.currentThinkingState?.content ?? '';
    }
  }

  /**
   * Closes the open reactive thinking block, stamping its final content +
   * duration. A block that never received content is dropped.
   */
  private closeReactiveThinkingBlock(
    msg: ChatMessage | undefined,
    content: string,
    durationSeconds: number,
  ): void {
    const { state } = this.deps;
    const blocks = msg?.contentBlocks;
    if (!blocks || state.activeBlockIndex < 0) return;
    const block = blocks[state.activeBlockIndex];
    if (block?.type !== 'thinking') return;
    if (content) {
      block.content = content;
      block.durationSeconds = durationSeconds;
    } else if (state.activeBlockIndex === blocks.length - 1) {
      blocks.pop();
    }
    state.activeBlockIndex = -1;
  }
}

export type { ThinkingTimingState };
