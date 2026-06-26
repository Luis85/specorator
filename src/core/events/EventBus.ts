export type EventMap = Record<string, unknown>;
export type EventHandler<P> = (payload: P) => void;

/**
 * Minimal typed, synchronous, in-process event bus.
 * No Obsidian dependency so it can be unit-tested in isolation.
 */
// No constraint on `M`: concrete event maps are declared as `interface`s
// (ChatEventMap, TaskEventMap, ...), which lack an implicit index signature and
// so fail a `Record<string, unknown>` constraint. Leaving `M` unconstrained
// accepts them while keeping every member signature precise via `keyof M`/`M[K]`.
export class EventBus<M = Record<string, unknown>> {
  private readonly handlers = new Map<keyof M, Set<EventHandler<never>>>();
  private errorSink?: (error: unknown, event: string) => void;

  setErrorSink(sink: (error: unknown, event: string) => void): void {
    this.errorSink = sink;
  }

  on<K extends keyof M>(event: K, handler: EventHandler<M[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof M>(event: K, handler: EventHandler<M[K]>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends keyof M>(event: K, ...args: M[K] extends void ? [] : [M[K]]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    const payload = (args.length > 0 ? args[0] : undefined) as M[K];
    for (const handler of [...set]) {
      try {
        (handler as EventHandler<M[K]>)(payload);
      } catch (error) {
        // One bad subscriber must not break others or the producer.
        this.errorSink?.(error, String(event));
      }
    }
  }
}
