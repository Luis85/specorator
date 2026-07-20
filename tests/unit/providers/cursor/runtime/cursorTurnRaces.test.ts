import {
  APPROVAL_CANCELLED,
  raceApprovalAgainstCancel,
  withTimeout,
} from '@/providers/cursor/runtime/cursorTurnRaces';

/** Collects unhandled rejections for the duration of `body`, then restores. */
async function withUnhandledRejectionWatch(body: () => Promise<void>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    await body();
    // Give the microtask + a macrotask tick for any unhandled rejection to surface.
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return seen;
}

describe('raceApprovalAgainstCancel', () => {
  it('returns the promise unchanged when there is no signal', async () => {
    await expect(raceApprovalAgainstCancel(Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('resolves to APPROVAL_CANCELLED when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(raceApprovalAgainstCancel(Promise.resolve('ok'), controller.signal)).resolves.toBe(
      APPROVAL_CANCELLED,
    );
  });

  it('resolves to the promise value when it settles before the abort', async () => {
    const controller = new AbortController();
    await expect(raceApprovalAgainstCancel(Promise.resolve('decision'), controller.signal)).resolves.toBe(
      'decision',
    );
  });

  it('resolves to APPROVAL_CANCELLED when abort fires before the promise settles', async () => {
    const controller = new AbortController();
    const pending = new Promise<string>(() => {}); // never settles
    const raced = raceApprovalAgainstCancel(pending, controller.signal);
    controller.abort();
    await expect(raced).resolves.toBe(APPROVAL_CANCELLED);
  });

  it('forwards the original rejection reason unchanged', async () => {
    const controller = new AbortController();
    const reason = new Error('approval boom');
    await expect(raceApprovalAgainstCancel(Promise.reject(reason), controller.signal)).rejects.toBe(reason);
  });

  it('removes the abort listener once the promise settles', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    await raceApprovalAgainstCancel(Promise.resolve('ok'), controller.signal);
    await Promise.resolve();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('does not emit an unhandled rejection when the raced promise rejects', async () => {
    const reason = new Error('load failed');
    const seen = await withUnhandledRejectionWatch(async () => {
      const controller = new AbortController();
      await expect(raceApprovalAgainstCancel(Promise.reject(reason), controller.signal)).rejects.toBe(reason);
    });
    expect(seen).not.toContain(reason);
  });
});

describe('withTimeout', () => {
  it('resolves to the value when the promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000, new Error('too slow'))).resolves.toBe('done');
  });

  it('rejects with the timeout error when the promise is too slow', async () => {
    const timeoutError = new Error('too slow');
    const pending = new Promise<string>(() => {}); // never settles
    await expect(withTimeout(pending, 5, timeoutError)).rejects.toBe(timeoutError);
  });

  it('forwards the promise rejection unchanged when it rejects before the timeout', async () => {
    const reason = new Error('init boom');
    await expect(withTimeout(Promise.reject(reason), 1000, new Error('too slow'))).rejects.toBe(reason);
  });

  it('does not emit an unhandled rejection when the raced promise rejects', async () => {
    const reason = new Error('init boom');
    const seen = await withUnhandledRejectionWatch(async () => {
      await expect(withTimeout(Promise.reject(reason), 1000, new Error('too slow'))).rejects.toBe(reason);
    });
    expect(seen).not.toContain(reason);
  });
});
