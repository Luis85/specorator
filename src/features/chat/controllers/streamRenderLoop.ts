import {
  cancelScheduledAnimationFrame,
  type ScheduledAnimationFrame,
} from '../../../utils/animationFrame';
import type { MessageRenderer, RenderContentOptions } from '../rendering/MessageRenderer';
import { scheduleStreamContinuation } from './streamRenderBackoff';

export interface StreamRenderTarget {
  el: HTMLElement;
  /** Identity token; the loop only continues while this stays the same object. */
  token: unknown;
}

export interface StreamRenderLoopDeps {
  renderer: Pick<MessageRenderer, 'renderContent'>;
  getStreamingRenderOptions: (content: string) => RenderContentOptions | undefined;
  scrollToBottom: () => void;
  /** Block-specific: the block's live content, '' when there is no open block. */
  currentContent: () => string;
  /** Block-specific: the element to render into + an identity token, or null. */
  currentTarget: () => StreamRenderTarget | null;
  /** Block-specific: the window owning the render target (for rAF scheduling). */
  getWindow: () => Window | null;
}

/**
 * Throttled streaming render loop shared by the thinking and text coordinators.
 * Each tick re-parses the whole accumulated block (O(C)/tick — see the PERF-3
 * note in streamRenderBackoff), coalescing large blocks behind a delay; a
 * pending-render promise lets callers flush synchronously on finalize. The loop
 * keeps re-scheduling itself while the same block keeps growing. Block-specific
 * differences (which block, which element) arrive through the deps accessors.
 */
export class StreamRenderLoop {
  private pendingFrame: ScheduledAnimationFrame | null = null;
  private pendingPromise: Promise<void> | null = null;
  private resolvePending: (() => void) | null = null;
  private isRunning = false;

  constructor(private readonly deps: StreamRenderLoopDeps) {}

  schedule(): Promise<void> {
    if (!this.pendingPromise) {
      this.pendingPromise = new Promise(resolve => {
        this.resolvePending = resolve;
      });
    }

    if (this.pendingFrame === null && !this.isRunning) {
      this.pendingFrame = scheduleStreamContinuation(
        this.deps.currentContent(),
        this.deps.getWindow(),
        () => {
          this.pendingFrame = null;
          void this.render();
        },
      );
    }

    return this.pendingPromise;
  }

  async flush(): Promise<void> {
    const pendingRender = this.pendingPromise;
    if (!pendingRender) return;

    if (this.pendingFrame !== null) {
      cancelScheduledAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
      void this.render();
    }

    await pendingRender;
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

  private async render(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const target = this.deps.currentTarget();
    const content = this.deps.currentContent();

    try {
      if (target) {
        const options = this.deps.getStreamingRenderOptions(content);
        if (options) {
          await this.deps.renderer.renderContent(target.el, content, options);
        } else {
          await this.deps.renderer.renderContent(target.el, content);
        }
        this.deps.scrollToBottom();
      }
    } catch {
      // MessageRenderer owns user-visible render fallback; keep stream state moving.
    } finally {
      this.isRunning = false;
    }

    const after = this.deps.currentTarget();
    if (after && target && after.token === target.token && this.deps.currentContent() !== content) {
      this.pendingFrame = scheduleStreamContinuation(
        this.deps.currentContent(),
        this.deps.getWindow(),
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
}
