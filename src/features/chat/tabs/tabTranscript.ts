import type { ChatMessage, SubagentInfo } from '../../../core/types';
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
  /**
   * Messages whose in-place mutation happened OUTSIDE the active stream and so
   * won't be caught by the active-message identity refresh — chiefly async /
   * background subagent completions (`SubagentStreamCoordinator`). Consumed and
   * cleared by the next `snapshot()`.
   */
  private readonly dirtyMessageIds = new Set<string>();
  private projectionRevision = 0;
  private lastConversationId: string | null = null;

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
    const unchanged = loadingText === this.loadingText;
    this.loadingText = loadingText;
    // Re-raise a non-null loading string even when the value is unchanged so a
    // retry after a dropped/stuck projection still paints the overlay.
    if (unchanged && loadingText === null) return;
    this.emit();
  }

  /** Sets the history-hydration failure banner (null clears it) and re-emits. */
  setHydrationError(hydrationError: TranscriptHydrationError | null): void {
    this.hydrationError = hydrationError;
    this.emit();
  }

  /**
   * Flags a message whose fields were mutated in place off the stream path
   * (async/background subagent completion) and re-projects. The next snapshot
   * gives it a fresh identity so the keyed `MessageBubble` re-patches and its
   * `BlockList`/`ToolCall`/`SubagentBlock` recompute from the mutated values.
   */
  refreshMessage(messageId: string): void {
    this.dirtyMessageIds.add(messageId);
    this.emit();
  }

  private snapshot(): TranscriptSnapshot {
    const messages = this.state.messages; // a fresh array copy from ChatState
    const activeId = this.state.activeMessageId;

    // The engine mutates message objects IN PLACE (msg.content += chunk,
    // contentBlocks.push, toolCall.result = …), so the `msg` identity never
    // changes — but `MessageBubble` is a keyed `v-for` child, so an unchanged
    // identity makes Vue skip the patch and the live turn renders blank. Give
    // the actively-streaming message (and any off-stream dirtied message) a
    // fresh identity — including fresh tool-call identities, since those are
    // passed to `ToolCall`/`SubagentBlock` by reference — so the child
    // re-renders. Snapshot-ONLY: the clone never touches `ChatState.messages`,
    // so the engine's live `msg` reference keeps growing the original object.
    if (activeId !== null || this.dirtyMessageIds.size > 0) {
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.id === activeId || this.dirtyMessageIds.has(message.id)) {
          messages[i] = refreshMessageIdentity(message);
        }
      }
    }
    this.dirtyMessageIds.clear();

    const conversationId = this.state.currentConversationId;
    if (conversationId !== this.lastConversationId) {
      this.lastConversationId = conversationId;
      this.projectionRevision += 1;
    }

    return {
      messages,
      activeStream: this.state.getActiveStreamSnapshot(),
      conversationId,
      projectionRevision: this.projectionRevision,
      // The greeting is a welcome-screen affordance: suppress it once the
      // transcript has messages (mirrors the legacy `updateWelcomeVisibility`
      // that added `.specorator-hidden` to the welcome block).
      greeting: messages.length === 0 ? this.greeting : '',
      loadingText: this.loadingText,
      hydrationError: this.hydrationError,
    };
  }
}

/**
 * Shallow clone giving `message`, each of its tool calls, each tool call's
 * nested `subagent`, AND every nested `subagent.toolCalls` entry a fresh
 * identity. Content blocks are NOT cloned: `BlockList` re-derives text/thinking
 * item strings from the (mutated) blocks once `props.msg` identity changes. But
 * tool calls are passed to `ToolCall` / `SubagentBlock` by object reference, and
 * `SubagentBlock` further reads `toolCall.subagent` through a computed whose
 * downstream `statusPill`/result computeds only recompute when the `subagent`
 * REFERENCE changes — so both need a fresh reference. The nested tool items are
 * keyed `SubagentToolItem` children fed `subagent.toolCalls[i]` by reference;
 * `SubagentStreamCoordinator.handleSubagentChunk` mutates those entries IN PLACE
 * on a live SYNC subagent (nested `toolCall.status`/`result`), so without a
 * fresh entry identity the keyed child keeps the old prop object and stays stuck
 * on `running`. Snapshot-ONLY: every clone is a copy — `ChatState`'s real
 * message/subagent/toolCall objects are never touched, so the engine's live refs
 * keep growing. O(tool calls + nested tool calls on this one message).
 */
function refreshMessageIdentity(message: ChatMessage): ChatMessage {
  return {
    ...message,
    toolCalls: message.toolCalls
      ? message.toolCalls.map((toolCall) => ({
          ...toolCall,
          subagent: toolCall.subagent ? cloneSubagentIdentity(toolCall.subagent) : toolCall.subagent,
        }))
      : message.toolCalls,
  };
}

function cloneSubagentIdentity(subagent: SubagentInfo): SubagentInfo {
  return {
    ...subagent,
    toolCalls: subagent.toolCalls
      ? subagent.toolCalls.map((nestedToolCall) => ({ ...nestedToolCall }))
      : subagent.toolCalls,
  };
}
