import type { ChatMessage } from '../../../core/types';
import type { ChatState } from '../state/ChatState';

export interface TextRenderDeps {
  state: ChatState;
  showWriting: () => void;
  hideThinkingIndicator: () => void;
  shouldCollapseStreamingResponse: () => boolean;
}

/**
 * Owns the streaming assistant-text lifecycle as pure reactive data: it grows
 * the open `text` content block on `msg.contentBlocks` (the Vue `TextBlock`
 * renders the live growth) and drives the streaming indicator's writing/thinking
 * mode. No DOM: the imperative render loop, collapse-mode snapshot render, and
 * finalize-time card swap were removed with the Vue cutover (the Vue transcript
 * splits the work-order handoff card off the text segment itself).
 *
 * `state.currentTextEl` stays as a NON-DOM sentinel (a detached element) so
 * `StreamController.blockState()` (`hasOpenTextBlock`) still reads "a text block
 * is open"; nothing is ever appended to it.
 */
export class TextRenderCoordinator {
  // Collapse setting snapshotted once when the current text block starts, so a
  // mid-block toggle applies to the next block (parity with the legacy render).
  private currentBlockCollapsed = false;

  constructor(private readonly deps: TextRenderDeps) {}

  async append(text: string, msg?: ChatMessage): Promise<void> {
    const { state } = this.deps;
    if (!state.currentContentEl) return;

    if (!state.currentTextEl) {
      // Detached sentinel — marks "a text block is open" for blockState(); never
      // rendered into.
      state.currentTextEl = state.currentContentEl.ownerDocument.createElement('div');
      state.currentTextContent = '';
      this.currentBlockCollapsed = this.deps.shouldCollapseStreamingResponse();
      this.openReactiveTextBlock(msg);
    }

    if (!this.currentBlockCollapsed) {
      this.deps.hideThinkingIndicator();
    }

    state.currentTextContent += text;
    this.growReactiveTextBlock(msg);

    if (this.currentBlockCollapsed) {
      // Collapse mode kept a "Writing response…" placeholder up for the whole
      // block; the Vue indicator reproduces it from the writing mode.
      this.deps.showWriting();
    }
  }

  async finalize(msg?: ChatMessage): Promise<void> {
    const { state } = this.deps;

    // A collapsed block held its writing placeholder for the whole block; drop
    // it as the block closes.
    if (this.currentBlockCollapsed) {
      this.deps.hideThinkingIndicator();
    }

    this.closeReactiveTextBlock(msg);
    state.currentTextEl = null;
    state.currentTextContent = '';
    this.currentBlockCollapsed = false;
  }

  cancel(): void {
    // No render loop to cancel in data-only mode.
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
   * dropped so a bare `finalize` leaves no stray empty block.
   */
  private closeReactiveTextBlock(msg?: ChatMessage): void {
    const { state } = this.deps;
    const blocks = msg?.contentBlocks;
    if (!blocks || state.activeBlockIndex < 0) return;
    const block = blocks[state.activeBlockIndex];
    // Only close a block we actually own (finalize can run while a thinking block
    // is the open one).
    if (block?.type !== 'text') return;
    if (block.content === '' && state.activeBlockIndex === blocks.length - 1) {
      blocks.pop();
    }
    state.activeBlockIndex = -1;
  }
}
