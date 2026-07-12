import type { ChatState } from '../state/ChatState';
import type { TranscriptHydrationError } from '../ui/vue/transcript/stores/transcriptStore';
import type { TranscriptSnapshot, TranscriptSubscribe } from '../ui/vue/transcript/transcriptCallbacks';

/**
 * Per-tab projection source for the Vue transcript island. Mirrors
 * `SpecoratorView`'s `emitChatShellChange` + observer set, but PER TAB (each tab
 * owns its own `ChatState.messages`). The engine mutates `ChatState`; this pushes
 * a fully-projected {@link TranscriptSnapshot} to every observer registered
 * through {@link subscribe} (the `useTranscriptEventRouting` seam).
 *
 * Messages + active stream are read live from `ChatState` on every emit
 * (`ChatState.messages` is a copying getter, so the shallowRef store watch fires
 * on identity change). The welcome greeting, loading spinner text, and hydration
 * banner are engine-pushed transients held here and carried in the same snapshot
 * — the store has no other channel to the engine.
 */
export class TabTranscriptProjection {
  private readonly observers = new Set<(s: TranscriptSnapshot) => void>();
  private greeting = '';
  private loadingText: string | null = null;
  private hydrationError: TranscriptHydrationError | null = null;

  constructor(private readonly state: ChatState) {}

  /** The `TranscriptCallbacks.subscribe` seam: registers an observer, pushes the
   *  current snapshot immediately (like `mountChatShell`'s subscribe), returns a
   *  disposer. */
  readonly subscribe: TranscriptSubscribe = (onChange) => {
    this.observers.add(onChange);
    onChange(this.snapshot());
    return () => {
      this.observers.delete(onChange);
    };
  };

  /** Builds a snapshot and fans it to every observer. Cheap: a shallow message
   *  copy + a stream snapshot. No-op when nothing is mounted. */
  emit(): void {
    if (this.observers.size === 0) return;
    const snapshot = this.snapshot();
    for (const observer of this.observers) {
      observer(snapshot);
    }
  }

  /** Stores the welcome greeting and re-emits (idempotent on an unchanged value). */
  setGreeting(greeting: string): void {
    if (greeting === this.greeting) return;
    this.greeting = greeting;
    this.emit();
  }

  /** Sets the hydration-spinner text (null clears it) and re-emits. */
  setLoadingText(loadingText: string | null): void {
    if (loadingText === this.loadingText) return;
    this.loadingText = loadingText;
    this.emit();
  }

  /** Sets the history-hydration failure banner (null clears it) and re-emits. */
  setHydrationError(hydrationError: TranscriptHydrationError | null): void {
    this.hydrationError = hydrationError;
    this.emit();
  }

  private snapshot(): TranscriptSnapshot {
    return {
      messages: this.state.messages,
      activeStream: this.state.getActiveStreamSnapshot(),
      // The greeting is a welcome-screen affordance: suppress it once the
      // transcript has messages (mirrors the legacy `updateWelcomeVisibility`
      // that added `.specorator-hidden` to the welcome block).
      greeting: this.state.messages.length === 0 ? this.greeting : '',
      loadingText: this.loadingText,
      hydrationError: this.hydrationError,
    };
  }
}
