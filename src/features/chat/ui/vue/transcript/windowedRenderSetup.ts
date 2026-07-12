/**
 * Trailing window of stored messages mounted on conversation load / switch / rewind.
 * Long chats otherwise mount unbounded DOM, making each re-mount O(N). Windowing
 * bounds it to O(K): the trailing region — where streaming and the bottom anchor
 * live — is always mounted, and earlier messages mount on demand through the
 * "load earlier" control. Consumed by the Vue transcript island (`TranscriptRoot`).
 */
export const RENDER_WINDOW_SIZE = 80;

/** First message index to mount, capping to the trailing window of {@link windowSize}. */
export function windowStartIndex(total: number, windowSize = RENDER_WINDOW_SIZE): number {
  return Math.max(0, total - windowSize);
}
