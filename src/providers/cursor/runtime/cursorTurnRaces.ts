// Pure per-turn race helpers for the Cursor ACP runtime: bound a blocking RPC
// (the approval card, ACP `initialize`) against the turn's cancel signal or a
// timeout without leaving an unhandled rejection on the cleanup chain. Extracted
// from CursorChatRuntime so the Promise plumbing is unit-testable in isolation.

// Sentinel resolved by the approval race when the per-turn cancel signal fires
// before the user decides. ApprovalDecision is a string|object union, so a
// symbol can never collide with a real decision.
export const APPROVAL_CANCELLED = Symbol('cursor-approval-cancelled');

export function raceApprovalAgainstCancel<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T | typeof APPROVAL_CANCELLED> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.resolve(APPROVAL_CANCELLED);
  }
  // Promise.race forwards `promise`'s rejection unchanged; `.catch` consumes the
  // cleanup chain's duplicate so it can't surface as an unhandled rejection.
  const cancellation = new Promise<typeof APPROVAL_CANCELLED>((resolve) => {
    const onAbort = () => resolve(APPROVAL_CANCELLED);
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.finally(() => signal.removeEventListener('abort', onAbort)).catch(() => {});
  });
  return Promise.race([promise, cancellation]);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError: Error): Promise<T> {
  // Promise.race: the timeout rejects with a real Error and `promise`'s own
  // rejection forwards unchanged; `.catch` swallows the cleanup chain's duplicate.
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = window.setTimeout(() => reject(timeoutError), ms);
    void promise.finally(() => window.clearTimeout(timer)).catch(() => {});
  });
  return Promise.race([promise, timeout]);
}
