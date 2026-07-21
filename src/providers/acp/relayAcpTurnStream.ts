import type { StreamChunk } from '../../core/types';
import type { AcpStreamChunkQueue } from './AcpStreamChunkQueue';

/**
 * Relays an ACP turn's stream to the consumer: drains the chunk queue, awaits
 * the off-thread prompt settle once the queue closes, and runs `onSettled` in a
 * `finally` — whether the consumer breaks out early or the queue drains
 * normally. Shared by the Cursor and Opencode ACP runtimes, whose runPromptTurn
 * relay bodies were byte-identical; `onSettled` carries each runtime's own
 * active-turn teardown.
 */
export async function* relayAcpTurnStream(
  queue: AcpStreamChunkQueue,
  promptPromise: Promise<void>,
  onSettled: () => void,
): AsyncGenerator<StreamChunk> {
  try {
    while (true) {
      const chunk = await queue.next();
      if (!chunk) {
        break;
      }
      yield chunk;
    }
    await promptPromise;
  } finally {
    onSettled();
  }
}
