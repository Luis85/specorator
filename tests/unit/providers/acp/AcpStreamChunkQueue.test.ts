import type { StreamChunk } from '@/core/types';
import { AcpStreamChunkQueue } from '@/providers/acp/AcpStreamChunkQueue';

function chunk(content: string): StreamChunk {
  return { type: 'text', content };
}

describe('AcpStreamChunkQueue', () => {
  it('delivers buffered chunks in push order', async () => {
    const queue = new AcpStreamChunkQueue();
    queue.push(chunk('a'));
    queue.push(chunk('b'));
    expect(await queue.next()).toEqual(chunk('a'));
    expect(await queue.next()).toEqual(chunk('b'));
  });

  it('hands a push directly to a parked waiter', async () => {
    const queue = new AcpStreamChunkQueue();
    const pending = queue.next();
    queue.push(chunk('live'));
    await expect(pending).resolves.toEqual(chunk('live'));
  });

  it('close() resolves every parked waiter with null', async () => {
    const queue = new AcpStreamChunkQueue();
    const first = queue.next();
    const second = queue.next();
    queue.close();
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
  });

  it('next() returns null immediately once closed and drained', async () => {
    const queue = new AcpStreamChunkQueue();
    queue.push(chunk('tail'));
    queue.close();
    expect(await queue.next()).toEqual(chunk('tail'));
    expect(await queue.next()).toBeNull();
  });

  it('drops pushes after close so racing terminators cannot double-emit', async () => {
    const queue = new AcpStreamChunkQueue();
    queue.push(chunk('first'));
    queue.close();
    queue.push(chunk('late'));
    expect(await queue.next()).toEqual(chunk('first'));
    expect(await queue.next()).toBeNull();
  });

  it('close() is idempotent and exposes isClosed', () => {
    const queue = new AcpStreamChunkQueue();
    expect(queue.isClosed).toBe(false);
    queue.close();
    queue.close();
    expect(queue.isClosed).toBe(true);
  });
});
