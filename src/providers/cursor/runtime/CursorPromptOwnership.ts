import { withTimeout } from './cursorTurnRaces';

interface CursorPromptOwnershipDeps {
  /** Cooperative cancel of the in-flight turn (runtime `cancel()`). */
  requestCancel: () => void;
  /** Force-recycle the ACP process when a prior prompt never settles. */
  recycleProcess: () => Promise<void>;
  /** Bounded serialize-wait ceiling (cancel escalation + grace). */
  serializeCeilingMs: number;
}

/**
 * Serializes concurrent `query()` starts into an exclusive prompt slot. Each
 * turn claims the slot, awaits any still-unsettled prior prompt (bounded by the
 * serialize ceiling), and releases it in a pre-prompt `finally` or after
 * dispatch. A Stop pressed while a turn is blocked on the serialize wait is
 * scoped to that waiter — later queued queries cannot clear it. Split out of
 * CursorChatRuntime as a self-contained concurrency primitive.
 */
export class CursorPromptOwnership {
  // The prior turn's prompt-settle chain (see ActiveTurn.promptSettled). claim()
  // awaits it — bounded by the serialize ceiling — so turns serialize and a
  // cancelled turn's late blocking requests can't leak into the next turn.
  pendingPromptSettled: Promise<void> | null = null;
  /** Atomically reserves the next prompt slot across simultaneous query() starts. */
  private promptStartTail: Promise<void> = Promise.resolve();
  // Set by requestCancelIfWaiting() for the turn currently claiming/waiting on
  // ownership. Consumed once when ownership is granted so a later queued query
  // cannot clear an earlier turn's Stop that arrived during awaitPriorTurnSettled.
  private ownershipCancelRequested = false;
  /** Count of query() callers blocked in awaitPriorTurnSettled. */
  private serializeWaiters = 0;

  private readonly requestCancel: () => void;
  private readonly recycleProcess: () => Promise<void>;
  private readonly serializeCeilingMs: number;

  constructor(deps: CursorPromptOwnershipDeps) {
    this.requestCancel = deps.requestCancel;
    this.recycleProcess = deps.recycleProcess;
    this.serializeCeilingMs = deps.serializeCeilingMs;
  }

  consumeCancelRequest(): boolean {
    const requested = this.ownershipCancelRequested;
    this.ownershipCancelRequested = false;
    return requested;
  }

  // cancel() only records a Stop while a turn is parked in the serialize wait;
  // it has no per-turn abort controller yet, so this flag is the sole channel.
  requestCancelIfWaiting(): void {
    if (this.serializeWaiters > 0) {
      this.ownershipCancelRequested = true;
    }
  }

  async claim(): Promise<(() => void) | null> {
    const priorClaim = this.promptStartTail;
    let releaseClaim!: () => void;
    const claimSlot = new Promise<void>((resolve) => {
      releaseClaim = resolve;
    });
    this.promptStartTail = priorClaim.then(() => claimSlot);
    await priorClaim;

    try {
      if (!(await this.awaitPriorTurnSettled())) {
        this.consumeCancelRequest();
        return null;
      }
      let releaseReservation!: () => void;
      const reservation = new Promise<void>((resolve) => {
        releaseReservation = resolve;
      });
      this.pendingPromptSettled = reservation;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        releaseReservation();
        if (this.pendingPromptSettled === reservation) {
          this.pendingPromptSettled = null;
        }
      };
    } finally {
      releaseClaim();
    }
  }

  // Bounded serialize wait for a prior turn's prompt. Returns false when the
  // prior prompt is still live after cancel/recycle — callers must not issue a
  // second session/prompt.
  private async awaitPriorTurnSettled(): Promise<boolean> {
    if (!this.pendingPromptSettled) {
      return true;
    }
    this.serializeWaiters += 1;
    try {
      const settled = await withTimeout(
        this.pendingPromptSettled,
        this.serializeCeilingMs,
        new Error('cursor turn serialize ceiling'),
      ).then(() => true).catch(() => false);
      if (settled) {
        return true;
      }

      this.requestCancel();
      await this.recycleProcess();
      return false;
    } finally {
      this.serializeWaiters -= 1;
    }
  }
}
