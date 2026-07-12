import type { ChatMessage } from '../../../core/types';
import { hasStreamingMathDelimiters } from '../../../utils/markdownMath';
import type { MessageRenderer, RenderContentOptions } from '../rendering/MessageRenderer';
import type { ChatState } from '../state/ChatState';
import { StreamRenderLoop, type StreamRenderTarget } from './streamRenderLoop';

export interface TextRenderDeps {
  state: ChatState;
  renderer: MessageRenderer;
  showWriting: () => void;
  hideThinkingIndicator: () => void;
  scrollToBottom: () => void;
  getStreamingRenderOptions: (content: string) => RenderContentOptions | undefined;
  shouldDeferMathRendering: () => boolean;
  shouldCollapseStreamingResponse: () => boolean;
  getMessagesWindow: () => Window | null;
}

/**
 * Owns the streaming assistant-text render lifecycle lifted out of
 * `StreamController`: the collapse-mode snapshot, the finalize-time card swap /
 * copy button, and the append/finalize transitions. The throttled render loop is
 * the shared `StreamRenderLoop`; the text block element + content live on the
 * shared `ChatState`.
 */
export class TextRenderCoordinator {
  private readonly loop: StreamRenderLoop;
  // Collapse setting snapshotted once when the current text block starts. Read
  // (not re-evaluated) through the block's append/render/finalize lifecycle so a
  // mid-block toggle can't race those steps; the toggle takes effect next block.
  private currentBlockCollapsed = false;

  constructor(private readonly deps: TextRenderDeps) {
    this.loop = new StreamRenderLoop({
      renderer: deps.renderer,
      getStreamingRenderOptions: deps.getStreamingRenderOptions,
      scrollToBottom: deps.scrollToBottom,
      currentContent: () => deps.state.currentTextContent,
      currentTarget: (): StreamRenderTarget | null => {
        const el = deps.state.currentTextEl;
        return el ? { el, token: el } : null;
      },
      getWindow: () => this.getWindow(),
    });
  }

  async append(text: string, msg?: ChatMessage): Promise<void> {
    const { state } = this.deps;
    if (!state.currentContentEl) return;

    // Snapshot the collapse setting once, when the block starts. Reading it again
    // mid-block would let a toggle race the append/render/finalize steps; instead
    // a block keeps the mode it started in and a toggle applies to the next block.
    if (!state.currentTextEl) {
      state.currentTextEl = state.currentContentEl.createDiv({ cls: 'specorator-text-block' });
      state.currentTextContent = '';
      this.currentBlockCollapsed = this.deps.shouldCollapseStreamingResponse();
      // Open the reactive block on the FIRST chunk (was a finalize-time push):
      // the Vue transcript renders live growth from contentBlocks, so the block
      // must exist for the whole turn, not only after it closes.
      this.openReactiveTextBlock(msg);
    }

    if (!this.currentBlockCollapsed) {
      this.deps.hideThinkingIndicator();
    }

    state.currentTextContent += text;
    this.growReactiveTextBlock(msg);

    if (this.currentBlockCollapsed) {
      // Hide the half-formed render: keep an immediate placeholder up and render
      // the whole block in one pass when it finalizes.
      this.deps.showWriting();
      return;
    }

    void this.loop.schedule();
  }

  async finalize(msg?: ChatMessage): Promise<void> {
    const { state, renderer } = this.deps;
    await this.loop.flush();

    // A block keeps the collapse mode it started in (snapshotted in append),
    // so finalize follows that snapshot, not the live setting.
    const collapsed = this.currentBlockCollapsed;
    // A collapsed block kept its "Writing response..." placeholder up for the
    // whole block; drop it before the one-pass render below.
    if (collapsed) {
      this.deps.hideThinkingIndicator();
    }

    if (msg && state.currentTextContent) {
      await this.renderFinalizedTextBlock(state.currentTextEl, state.currentTextContent, collapsed);
      // The reactive block was created + grown during `append`; finalize only
      // closes it (below) — pushing here would double the block.
      // Work-order tabs swap a completed handoff block for the compact card on
      // finalize; everything else keeps the raw text block plus copy button.
      // Derive the content element from the text element's parent because
      // `InputController` nulls `state.currentContentEl` right before this
      // call — guarding on `state.currentContentEl` here would mean the live
      // swap never fires on a normal completed turn (only after a reload).
      const liveContentEl =
        (state.currentTextEl?.parentElement)
          ?? state.currentContentEl;
      const replacedWithCard =
        liveContentEl && state.currentTextEl
          ? renderer.finalizeStreamedAssistantText?.(
              liveContentEl,
              state.currentTextEl,
              state.currentTextContent,
            ) ?? false
          : false;
      // Copy button added here (not during streaming) to match history-loaded messages
      if (state.currentTextEl && !replacedWithCard) {
        renderer.addTextCopyButton(state.currentTextEl, state.currentTextContent);
      }
      // The card swap removed the text block that registered actions anchor to;
      // re-anchor them onto the card so a freshly completed run keeps actions
      // (e.g. Create work order) without waiting for a reload.
      if (replacedWithCard && msg) {
        renderer.refreshMessageActions?.(msg);
      }
    }
    this.closeReactiveTextBlock(msg);
    state.currentTextEl = null;
    state.currentTextContent = '';
    this.currentBlockCollapsed = false;
  }

  cancel(): void {
    this.loop.cancel();
  }

  /** Pushes the empty reactive text block that `append` grows and `finalize` closes. */
  private openReactiveTextBlock(msg?: ChatMessage): void {
    if (!msg) return;
    msg.contentBlocks = msg.contentBlocks || [];
    msg.contentBlocks.push({ type: 'text', content: '' });
    this.deps.state.activeBlockIndex = msg.contentBlocks.length - 1;
  }

  /** Mirrors the accumulated streamed text into the open reactive block. */
  private growReactiveTextBlock(msg?: ChatMessage): void {
    if (!msg) return;
    const { state } = this.deps;
    const block = msg.contentBlocks?.[state.activeBlockIndex];
    if (block?.type === 'text') {
      block.content = state.currentTextContent;
    }
  }

  /**
   * Closes the open reactive text block. A block that never received content is
   * dropped so a bare `finalize` leaves no stray empty block (matching the
   * legacy `if (msg && currentTextContent)` push guard).
   */
  private closeReactiveTextBlock(msg?: ChatMessage): void {
    const { state } = this.deps;
    const blocks = msg?.contentBlocks;
    if (!blocks || state.activeBlockIndex < 0) return;
    const block = blocks[state.activeBlockIndex];
    // Only close a block we actually own. `finalizeCurrentTextBlock` can be
    // called (e.g. on `done`) while the open block is a thinking block; touching
    // `activeBlockIndex` then would orphan it before its own finalize runs.
    if (block?.type !== 'text') return;
    if (block.content === '' && state.activeBlockIndex === blocks.length - 1) {
      blocks.pop();
    }
    state.activeBlockIndex = -1;
  }

  /**
   * Renders the finalized text into its element. A collapsed block was never
   * live-rendered, so render it once now; a non-collapsed block already holds the
   * streamed render and only needs a re-render to bake deferred math.
   */
  private async renderFinalizedTextBlock(
    textEl: HTMLElement | null,
    content: string,
    collapsed: boolean,
  ): Promise<void> {
    if (!textEl) return;
    if (collapsed) {
      await this.deps.renderer.renderContent(textEl, content);
      return;
    }
    if (this.deps.shouldDeferMathRendering() && hasStreamingMathDelimiters(content)) {
      await this.deps.renderer.renderContent(textEl, content);
    }
  }

  private getWindow(): Window | null {
    const { state } = this.deps;
    return state.currentTextEl?.ownerDocument?.defaultView
      ?? state.currentContentEl?.ownerDocument?.defaultView
      ?? this.deps.getMessagesWindow();
  }
}
