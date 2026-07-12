import type { ChatMessage } from '../../../core/types';
import type { MessageRenderer, RenderContentOptions } from '../rendering/MessageRenderer';
import { createThinkingBlock, finalizeThinkingBlock } from '../rendering/ThinkingBlockRenderer';
import type { ChatState } from '../state/ChatState';
import { StreamRenderLoop, type StreamRenderTarget } from './streamRenderLoop';

export interface ThinkingRenderDeps {
  state: ChatState;
  renderer: MessageRenderer;
  hideThinkingIndicator: () => void;
  getStreamingRenderOptions: (content: string) => RenderContentOptions | undefined;
  scrollToBottom: () => void;
  getMessagesWindow: () => Window | null;
}

/**
 * Owns the streaming thinking-block render lifecycle lifted out of
 * `StreamController`. The throttled render loop is the shared `StreamRenderLoop`;
 * this coordinator supplies the thinking-specific driver (the block lives on
 * `ChatState.currentThinkingState`) and the append/finalize transitions.
 */
export class ThinkingRenderCoordinator {
  private readonly loop: StreamRenderLoop;

  constructor(private readonly deps: ThinkingRenderDeps) {
    this.loop = new StreamRenderLoop({
      renderer: deps.renderer,
      getStreamingRenderOptions: deps.getStreamingRenderOptions,
      scrollToBottom: deps.scrollToBottom,
      currentContent: () => deps.state.currentThinkingState?.content ?? '',
      currentTarget: (): StreamRenderTarget | null => {
        const block = deps.state.currentThinkingState;
        return block ? { el: block.contentEl, token: block } : null;
      },
      getWindow: () => this.getWindow(),
    });
  }

  async append(content: string, msg?: ChatMessage): Promise<void> {
    const { state, renderer } = this.deps;
    if (!state.currentContentEl) return;

    this.deps.hideThinkingIndicator();
    if (!state.currentThinkingState) {
      state.currentThinkingState = createThinkingBlock(
        state.currentContentEl,
        (el, md) => renderer.renderContent(el, md)
      );
      // Open the reactive block on the FIRST chunk so the Vue transcript can
      // render live thinking growth; finalize sets its `durationSeconds`.
      this.openReactiveThinkingBlock(msg);
    }

    state.currentThinkingState.content += content;
    this.growReactiveThinkingBlock(msg);
    void this.loop.schedule();
  }

  async finalize(msg?: ChatMessage): Promise<void> {
    const { state, renderer } = this.deps;
    if (!state.currentThinkingState) return;
    await this.loop.flush();

    const thinkingState = state.currentThinkingState;
    if (this.deps.getStreamingRenderOptions(thinkingState.content)) {
      await renderer.renderContent(thinkingState.contentEl, thinkingState.content);
    }

    const durationSeconds = finalizeThinkingBlock(thinkingState);

    // The reactive block was created + grown during `append`; finalize only
    // closes it (stamping `durationSeconds`) — pushing here would double it.
    this.closeReactiveThinkingBlock(msg, thinkingState.content, durationSeconds);

    state.currentThinkingState = null;
  }

  cancel(): void {
    this.loop.cancel();
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
   * duration. A block that never received content is dropped so a bare
   * `finalize` leaves no stray empty block (matching the legacy push guard).
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
    // Only close a block we own (see TextRenderCoordinator.closeReactiveTextBlock).
    if (block?.type !== 'thinking') return;
    if (content) {
      block.content = content;
      block.durationSeconds = durationSeconds;
    } else if (state.activeBlockIndex === blocks.length - 1) {
      blocks.pop();
    }
    state.activeBlockIndex = -1;
  }

  private getWindow(): Window | null {
    const { state } = this.deps;
    return state.currentThinkingState?.contentEl.ownerDocument?.defaultView
      ?? state.currentContentEl?.ownerDocument?.defaultView
      ?? this.deps.getMessagesWindow();
  }
}
