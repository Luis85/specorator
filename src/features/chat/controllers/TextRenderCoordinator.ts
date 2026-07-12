import type { ChatMessage } from '../../../core/types';
import type { ChatState } from '../state/ChatState';

export interface TextRenderDeps {
  state: ChatState;
  showWriting: () => void;
  hideThinkingIndicator: () => void;
  shouldCollapseStreamingResponse: () => boolean;
  /** Whether streaming math delimiters should be escaped (deferred) until finalize. */
  shouldDeferMathRendering: () => boolean;
}

/**
 * Owns the streaming assistant-text lifecycle as pure reactive data. In the
 * default NON-collapse mode it grows the open `text` content block on
 * `msg.contentBlocks` on every chunk (the Vue `TextBlock` renders the live
 * growth) and drives the streaming indicator's writing/thinking mode. In
 * COLLAPSE mode (`collapseStreamingResponse`, the default) it WITHHOLDS the
 * partial text from the reactive block for the whole turn — the Vue transcript
 * shows only the "Writing response…" placeholder — and writes the full
 * accumulated text into the block once at `finalize`, so the response renders
 * in one shot on completion rather than streaming live. No DOM: the imperative
 * render loop and finalize-time card swap were removed with the Vue cutover
 * (the Vue transcript splits the work-order handoff card off the text segment
 * itself).
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

    if (this.currentBlockCollapsed) {
      // Collapse mode withholds the partial text from the reactive block for the
      // whole block (the visible content stays empty, so the Vue transcript shows
      // only the "Writing response…" placeholder the writing mode reproduces).
      // The accumulated text is flushed into the block once at `finalize`.
      this.deps.showWriting();
    } else {
      // Live (non-collapse) growth: defer math so incomplete `$…$`/LaTeX
      // fragments are escaped every chunk instead of hitting Obsidian's renderer
      // mid-delimiter. The flag is cleared on finalize (the final render escapes
      // nothing → math renders).
      this.growReactiveTextBlock(msg, this.deps.shouldDeferMathRendering());
    }
  }

  async finalize(msg?: ChatMessage): Promise<void> {
    const { state } = this.deps;

    // A collapsed block withheld its content and held a writing placeholder for
    // the whole block; flush the full accumulated text into the reactive block
    // one-shot so it renders on completion, then drop the placeholder. This must
    // run BEFORE `closeReactiveTextBlock` so the now-filled block survives the
    // empty-block-drop guard (a block that never received any text stays empty
    // and is still dropped).
    if (this.currentBlockCollapsed) {
      this.growReactiveTextBlock(msg);
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

  /**
   * Mirrors the accumulated streamed text into the open reactive block.
   * `deferMath` stamps the transient escape-math flag while the live block grows;
   * finalize's flush passes it `false` (default) so the completed block persists
   * without the flag.
   */
  private growReactiveTextBlock(msg: ChatMessage | undefined, deferMath = false): void {
    if (!msg) return;
    const { state } = this.deps;
    const block = msg.contentBlocks?.[state.activeBlockIndex];
    if (block?.type === 'text') {
      block.content = state.currentTextContent;
      if (deferMath) {
        block.deferMath = true;
      } else {
        delete block.deferMath;
      }
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
    } else {
      // Drop the transient streaming defer-math flag so the finalized/persisted
      // block renders math normally (non-collapse mode never re-grows at
      // finalize, so this is the clear point for that path).
      delete block.deferMath;
    }
    state.activeBlockIndex = -1;
  }
}
