/**
 * A minimal observable boolean: holds a ready flag and notifies subscribers only
 * on an actual transition. Extracted from CursorChatRuntime's inline
 * `ready`/`readyListeners`/`setReady` trio so the observable is testable on its
 * own and off the runtime's field surface.
 *
 * NOTE: the Claude/Codex/Opencode runtimes carry the same inline pattern; this
 * is deliberately kept cursor-local for now — promoting it to a shared
 * `core/runtime` utility and migrating the other three providers is a separate,
 * cross-provider change out of scope here.
 */
export class ReadyStateNotifier {
  private ready = false;
  private readonly listeners = new Set<(ready: boolean) => void>();

  get(): boolean {
    return this.ready;
  }

  /** Sets the flag and notifies subscribers; a no-op when the value is unchanged. */
  set(ready: boolean): void {
    if (this.ready === ready) {
      return;
    }
    this.ready = ready;
    for (const listener of this.listeners) {
      listener(ready);
    }
  }

  /** Subscribes to transitions; returns an unsubscribe function. */
  subscribe(listener: (ready: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Drops all subscribers (runtime teardown). Leaves the flag untouched. */
  clear(): void {
    this.listeners.clear();
  }
}
