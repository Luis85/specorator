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

  async append(content: string): Promise<void> {
    const { state, renderer } = this.deps;
    if (!state.currentContentEl) return;

    this.deps.hideThinkingIndicator();
    if (!state.currentThinkingState) {
      state.currentThinkingState = createThinkingBlock(
        state.currentContentEl,
        (el, md) => renderer.renderContent(el, md)
      );
    }

    state.currentThinkingState.content += content;
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

    if (msg && thinkingState.content) {
      msg.contentBlocks = msg.contentBlocks || [];
      msg.contentBlocks.push({
        type: 'thinking',
        content: thinkingState.content,
        durationSeconds,
      });
    }

    state.currentThinkingState = null;
  }

  cancel(): void {
    this.loop.cancel();
  }

  private getWindow(): Window | null {
    const { state } = this.deps;
    return state.currentThinkingState?.contentEl.ownerDocument?.defaultView
      ?? state.currentContentEl?.ownerDocument?.defaultView
      ?? this.deps.getMessagesWindow();
  }
}
