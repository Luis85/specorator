import type { ChatMessage } from '../../../core/types';
import {
  cancelScheduledAnimationFrame,
  type ScheduledAnimationFrame,
} from '../../../utils/animationFrame';
import type { MessageRenderer, RenderContentOptions } from '../rendering/MessageRenderer';
import { createThinkingBlock, finalizeThinkingBlock } from '../rendering/ThinkingBlockRenderer';
import type { ChatState } from '../state/ChatState';

export interface ThinkingRenderDeps {
  state: ChatState;
  renderer: MessageRenderer;
  hideThinkingIndicator: () => void;
  getStreamingRenderOptions: (content: string) => RenderContentOptions | undefined;
  scheduleContinuation: (
    content: string,
    renderWindow: Window | null,
    callback: () => void,
  ) => ScheduledAnimationFrame;
  scrollToBottom: () => void;
  getMessagesWindow: () => Window | null;
}

/**
 * Owns the streaming thinking-block render lifecycle lifted out of
 * `StreamController`: the throttled rAF render loop (with the O(C²) re-parse
 * backoff via `scheduleContinuation`) and its pending-render promise. The
 * thinking block itself lives on the shared `ChatState.currentThinkingState`;
 * this coordinator owns only the render-frame/promise bookkeeping. Behavior is
 * byte-for-byte the previous `StreamController` implementation — only its home
 * moved, with the shared StreamController helpers injected as callbacks.
 */
export class ThinkingRenderCoordinator {
  private pendingFrame: ScheduledAnimationFrame | null = null;
  private pendingPromise: Promise<void> | null = null;
  private resolvePending: (() => void) | null = null;
  private isRunning = false;

  constructor(private readonly deps: ThinkingRenderDeps) {}

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
    void this.schedule();
  }

  async finalize(msg?: ChatMessage): Promise<void> {
    const { state, renderer } = this.deps;
    if (!state.currentThinkingState) return;
    await this.flush();

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
    if (this.pendingFrame !== null) {
      cancelScheduledAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }

    const resolve = this.resolvePending;
    this.pendingPromise = null;
    this.resolvePending = null;
    resolve?.();
  }

  private schedule(): Promise<void> {
    if (!this.pendingPromise) {
      this.pendingPromise = new Promise(resolve => {
        this.resolvePending = resolve;
      });
    }

    if (this.pendingFrame === null && !this.isRunning) {
      this.pendingFrame = this.deps.scheduleContinuation(
        this.deps.state.currentThinkingState?.content ?? '',
        this.getWindow(),
        () => {
          this.pendingFrame = null;
          void this.render();
        },
      );
    }

    return this.pendingPromise;
  }

  private async flush(): Promise<void> {
    const pendingRender = this.pendingPromise;
    if (!pendingRender) return;

    if (this.pendingFrame !== null) {
      cancelScheduledAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
      void this.render();
    }

    await pendingRender;
  }

  private async render(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const { state, renderer } = this.deps;
    const thinkingState = state.currentThinkingState;
    const content = thinkingState?.content ?? '';

    try {
      if (thinkingState) {
        const options = this.deps.getStreamingRenderOptions(content);
        if (options) {
          await renderer.renderContent(thinkingState.contentEl, content, options);
        } else {
          await renderer.renderContent(thinkingState.contentEl, content);
        }
        this.deps.scrollToBottom();
      }
    } catch {
      // MessageRenderer owns user-visible render fallback; keep stream state moving.
    } finally {
      this.isRunning = false;
    }

    if (state.currentThinkingState === thinkingState && thinkingState && thinkingState.content !== content) {
      this.pendingFrame = this.deps.scheduleContinuation(
        thinkingState.content,
        this.getWindow(),
        () => {
          this.pendingFrame = null;
          void this.render();
        },
      );
      return;
    }

    const resolve = this.resolvePending;
    this.pendingPromise = null;
    this.resolvePending = null;
    resolve?.();
  }

  private getWindow(): Window | null {
    const { state } = this.deps;
    return state.currentThinkingState?.contentEl.ownerDocument?.defaultView
      ?? state.currentContentEl?.ownerDocument?.defaultView
      ?? this.deps.getMessagesWindow();
  }
}
