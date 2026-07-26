import { getTeamChatDmOpenCoordinator } from '@/features/teamChat/TeamChatDmOpenCoordinator';
import type SpecoratorPlugin from '@/main';

/** A distinct object per test stands in for a plugin instance (WeakMap key). */
function makePlugin(): SpecoratorPlugin {
  return {} as SpecoratorPlugin;
}

/** A deferred whose body records when it ran and resolves on demand. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Drain all pending microtasks (the serialize chain is several `.then`s deep). */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TeamChatDmOpenCoordinator', () => {
  it('returns one shared coordinator per plugin, distinct across plugins', () => {
    const pluginA = makePlugin();
    const pluginB = makePlugin();
    expect(getTeamChatDmOpenCoordinator(pluginA)).toBe(getTeamChatDmOpenCoordinator(pluginA));
    expect(getTeamChatDmOpenCoordinator(pluginA)).not.toBe(getTeamChatDmOpenCoordinator(pluginB));
  });

  it('runs opens for the SAME conversationId one at a time (second starts after first settles)', async () => {
    const coordinator = getTeamChatDmOpenCoordinator(makePlugin());
    const order: string[] = [];
    const first = deferred();

    const p1 = coordinator.serialize('conv-1', async () => {
      order.push('first:start');
      await first.promise;
      order.push('first:end');
    });
    const p2 = coordinator.serialize('conv-1', async () => {
      order.push('second:start');
    });

    // The second body must NOT begin until the first has fully settled.
    await flushMicrotasks();
    expect(order).toEqual(['first:start']);

    first.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('runs opens for DIFFERENT conversationIds concurrently (independent queues)', async () => {
    const coordinator = getTeamChatDmOpenCoordinator(makePlugin());
    const order: string[] = [];
    const a = deferred();

    const pa = coordinator.serialize('conv-a', async () => {
      order.push('a:start');
      await a.promise;
    });
    const pb = coordinator.serialize('conv-b', async () => {
      order.push('b:start');
    });

    // conv-b is not blocked by conv-a's in-flight open.
    await pb;
    expect(order).toEqual(['a:start', 'b:start']);
    a.resolve();
    await pa;
  });

  it('does not wedge a conversationId queue when an earlier open rejects', async () => {
    const coordinator = getTeamChatDmOpenCoordinator(makePlugin());
    const ran: string[] = [];

    const failing = coordinator.serialize('conv-1', async () => {
      throw new Error('open failed');
    });
    await expect(failing).rejects.toThrow('open failed');

    // A later open for the same id still runs (the rejection was isolated).
    await coordinator.serialize('conv-1', async () => {
      ran.push('recovered');
    });
    expect(ran).toEqual(['recovered']);
  });
});
