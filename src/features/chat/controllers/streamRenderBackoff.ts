import {
  scheduleAnimationFrame,
  type ScheduledAnimationFrame,
  scheduleDelayedFrame,
} from '../../../utils/animationFrame';

// Size-aware streaming backoff (PERF-3): streaming render is NOT a delta append —
// each throttled tick re-parses the entire accumulated block, so cost is O(C) per
// tick (O(C²) cumulative as the block grows). Below the threshold we re-render every
// frame for snappy feedback; past it we coalesce continuation renders behind a delay
// to cap the re-parse rate. The final render is always exact because finalize flushes
// synchronously. Delta-append rendering is deliberately deferred unless users report
// jank on very long single answers (docs/issues/streaming-render-cost.md).
const STREAM_REPARSE_BACKOFF_THRESHOLD_CHARS = 4096;
const STREAM_REPARSE_BACKOFF_MS = 200;

/**
 * Schedules the next streaming render of a growing block. Small blocks re-render
 * every animation frame; large blocks (≥ threshold) coalesce behind a delay so
 * the O(C²) cumulative re-parse cost stays bounded.
 */
export function scheduleStreamContinuation(
  content: string,
  renderWindow: Window | null,
  callback: () => void,
): ScheduledAnimationFrame {
  if (content.length >= STREAM_REPARSE_BACKOFF_THRESHOLD_CHARS) {
    return scheduleDelayedFrame(callback, STREAM_REPARSE_BACKOFF_MS, renderWindow);
  }
  return scheduleAnimationFrame(callback, renderWindow);
}
