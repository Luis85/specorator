import { describe, expect, it, vi } from 'vitest';

import { useRowActionPending } from '@/features/library/vue/useRowActionPending';

describe('useRowActionPending', () => {
  it('marks the row busy for the lifetime of the action, then clears', async () => {
    const pending = useRowActionPending();
    let resolve!: () => void;
    expect(pending.isBusy('a')).toBe(false);
    const p = pending.run('a', () => new Promise<void>((r) => { resolve = r; }));
    expect(pending.isBusy('a')).toBe(true);
    expect(pending.isBusy('b')).toBe(false);
    resolve();
    await p;
    expect(pending.isBusy('a')).toBe(false);
  });

  it('re-entrant run on a busy row no-ops without queuing (double-fire guard)', async () => {
    const pending = useRowActionPending();
    let resolve!: () => void;
    const first = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const second = vi.fn().mockResolvedValue(undefined);
    const p = pending.run('a', first);
    // Returns immediately, second action NEVER runs — no queue, just a drop.
    await pending.run('a', second);
    expect(second).not.toHaveBeenCalled();
    // A different row is unaffected by 'a' being busy.
    const other = vi.fn().mockResolvedValue(undefined);
    await pending.run('b', other);
    expect(other).toHaveBeenCalledTimes(1);
    resolve();
    await p;
    // Once the first action settles, the row accepts work again.
    await pending.run('a', second);
    expect(second).toHaveBeenCalledTimes(1);
    expect(pending.isBusy('a')).toBe(false);
  });

  it('clears busy when the action rejects (finally), propagating the rejection', async () => {
    const pending = useRowActionPending();
    await expect(pending.run('a', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(pending.isBusy('a')).toBe(false);
    // The row is usable again after the failure.
    const again = vi.fn().mockResolvedValue(undefined);
    await pending.run('a', again);
    expect(again).toHaveBeenCalledTimes(1);
  });
});
