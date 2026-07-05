import { describe, expect, it, vi } from 'vitest';

import { useGuardedLoad } from '@/features/library/vue/useGuardedLoad';

/** A promise plus its resolve/reject handles, to sequence overlapping loads. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useGuardedLoad', () => {
  it('runs commit for the current token and clears loading in finally', async () => {
    const guard = useGuardedLoad();
    const commit = vi.fn();
    expect(guard.loading.value).toBe(false);

    const done = guard.run(() => Promise.resolve(['a']), commit);
    expect(guard.loading.value).toBe(true); // set synchronously before the await
    await done;

    expect(commit).toHaveBeenCalledWith(['a']);
    expect(guard.loading.value).toBe(false);
  });

  it('drops a superseded load\'s commit and does not clear the newer load\'s loading flag', async () => {
    const guard = useGuardedLoad();
    const commitA = vi.fn();
    const commitB = vi.fn();
    const a = deferred<string[]>();
    const b = deferred<string[]>();

    const first = guard.run(() => a.promise, commitA);  // older token
    const second = guard.run(() => b.promise, commitB);  // newer token — still pending
    expect(guard.loading.value).toBe(true);

    a.resolve(['stale']); // A resolves late, after B already started
    await first;
    // Superseded: A's commit is dropped AND its finally must NOT clear the flag
    // out from under B, which is still in flight.
    expect(commitA).not.toHaveBeenCalled();
    expect(guard.loading.value).toBe(true);

    b.resolve(['fresh']);
    await second;
    expect(commitB).toHaveBeenCalledWith(['fresh']);
    expect(guard.loading.value).toBe(false);
  });

  it('invokes onError for a current-token fetch rejection and clears loading', async () => {
    const guard = useGuardedLoad();
    const onError = vi.fn();
    const boom = new Error('boom');

    await guard.run(() => Promise.reject(boom), vi.fn(), onError);

    expect(onError).toHaveBeenCalledWith(boom);
    expect(guard.loading.value).toBe(false);
  });

  it('rethrows a fetch rejection when no onError hook is supplied (loading still clears)', async () => {
    const guard = useGuardedLoad();
    const boom = new Error('boom');

    await expect(guard.run(() => Promise.reject(boom), vi.fn())).rejects.toBe(boom);
    expect(guard.loading.value).toBe(false);
  });

  it('does not invoke onError for a superseded load that rejects', async () => {
    const guard = useGuardedLoad();
    const onErrorA = vi.fn();
    const a = deferred<string[]>();
    const b = deferred<string[]>();

    const first = guard.run(() => a.promise, vi.fn(), onErrorA);
    const second = guard.run(() => b.promise, vi.fn());

    a.reject(new Error('stale failure'));
    await first;
    expect(onErrorA).not.toHaveBeenCalled(); // stale — error swallowed, not surfaced
    expect(guard.loading.value).toBe(true); // B still in flight

    b.resolve(['fresh']);
    await second;
    expect(guard.loading.value).toBe(false);
  });
});
