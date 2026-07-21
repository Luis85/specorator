import type { StreamChunk } from '@/core/types';
import { AcpStreamChunkQueue, relayAcpTurnStream } from '@/providers/acp';

function chunk(type: string): StreamChunk {
  return { type } as StreamChunk;
}

describe('relayAcpTurnStream', () => {
  it('drains the queue to the consumer, then awaits the prompt settle and runs onSettled', async () => {
    const queue = new AcpStreamChunkQueue();
    let promptSettled = false;
    const promptPromise = Promise.resolve().then(() => { promptSettled = true; });
    let settledCalled = false;

    queue.push(chunk('assistant_message_start'));
    queue.push(chunk('done'));
    queue.close();

    const seen: string[] = [];
    for await (const c of relayAcpTurnStream(queue, promptPromise, () => { settledCalled = true; })) {
      seen.push(c.type);
    }

    expect(seen).toEqual(['assistant_message_start', 'done']);
    expect(promptSettled).toBe(true);
    expect(settledCalled).toBe(true);
  });

  it('runs onSettled in the finally when the consumer breaks out early', async () => {
    const queue = new AcpStreamChunkQueue();
    let settledCalled = false;
    // A never-settling prompt: only the consumer closing the generator ends it.
    const gen = relayAcpTurnStream(queue, new Promise<void>(() => {}), () => { settledCalled = true; });

    queue.push(chunk('assistant_message_start'));
    const first = await gen.next();
    expect((first.value as StreamChunk).type).toBe('assistant_message_start');
    expect(settledCalled).toBe(false);

    await gen.return(undefined);
    expect(settledCalled).toBe(true);
  });

  it('holds onSettled until the prompt promise settles, after the queue has drained', async () => {
    const queue = new AcpStreamChunkQueue();
    let resolvePrompt!: () => void;
    const promptPromise = new Promise<void>((resolve) => { resolvePrompt = resolve; });
    let settledCalled = false;
    const gen = relayAcpTurnStream(queue, promptPromise, () => { settledCalled = true; });

    queue.push(chunk('done'));
    queue.close();

    const first = await gen.next();
    expect((first.value as StreamChunk).type).toBe('done');

    const finalStep = gen.next(); // drains to null, then parks on `await promptPromise`
    await Promise.resolve();
    expect(settledCalled).toBe(false);

    resolvePrompt();
    const final = await finalStep;
    expect(final.done).toBe(true);
    expect(settledCalled).toBe(true);
  });
});
