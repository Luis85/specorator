/**
 * Shared subscribe/emit observer-set boilerplate for per-tab Vue island
 * projection sources (`TabChromeProjection` and friends). Every projection
 * mutates its own state and builds its own snapshot shape; this factors out
 * only the identical "register an observer, push the current snapshot
 * immediately, fan a fresh snapshot to every observer, no-op when nothing is
 * mounted" wiring that would otherwise be duplicated verbatim per projection.
 */
export class ProjectionObserverSet<TSnapshot> {
  private readonly observers = new Set<(snapshot: TSnapshot) => void>();

  constructor(private readonly buildSnapshot: () => TSnapshot) {}

  /** Registers `onChange`, pushes the current snapshot immediately (mirrors
   *  `mountChatShell`'s subscribe), and returns a disposer that unregisters it. */
  readonly subscribe = (onChange: (snapshot: TSnapshot) => void): (() => void) => {
    this.observers.add(onChange);
    onChange(this.buildSnapshot());
    return () => { this.observers.delete(onChange); };
  };

  /** Builds a fresh snapshot and fans it to every observer. No-op when nothing is mounted. */
  emit(): void {
    if (this.observers.size === 0) return;
    const snapshot = this.buildSnapshot();
    for (const observer of this.observers) observer(snapshot);
  }
}
