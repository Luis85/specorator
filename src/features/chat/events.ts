import type { HistoryLoadErrorCode } from '../../core/providers/types';

export interface ChatEventMap {
  /** Emitted when a chat tab is opened or closed. */
  'chat:tabs-changed': { openCount: number; chatCount: number; workOrderCount: number };
  /**
   * Emitted when a conversation's title changes (manual rename or auto-title).
   * Listeners reading conversation titles for UI (header title, history
   * dropdown, tab bar) refresh in response. The payload carries only the
   * conversation id + new title — consumers look up the full conversation
   * through `plugin.getConversationSync(id)` if they need more.
   */
  'conversation:renamed': { conversationId: string; title: string };
  /**
   * Emitted when a conversation's `titleGenerationStatus` transitions
   * (pending → success/failed/cleared) WITHOUT the title itself changing, so a
   * plain `conversation:renamed` never fires. The Vue history dropdown renders
   * the pending spinner / regenerate affordance off this status, so an already
   * open dropdown must re-project when it flips. The imperative
   * `ConversationHistoryView` re-rendered here; this event replaces that.
   */
  'conversation:title-status-changed': { conversationId: string };
  /**
   * Emitted after a conversation is fully deleted (metadata gone, views
   * repaired). The deleting view re-projects through its own subscription, and
   * OTHER leaves with an open history dropdown drop the dead row instead of
   * rendering it until their next re-projection.
   */
  'conversation:deleted': { conversationId: string };
  /**
   * Emitted when a provider history service reports an `error` outcome from
   * either `hydrateConversationHistory` or `deleteConversationSession`.
   * The payload is the redacted user-safe summary from the provider; raw
   * detail strings stay confined to the leveled logger. Subscriber wiring is
   * a follow-up task — this event is produced today so callers can react
   * without inspecting `HistoryLoadOutcome` themselves.
   */
  'conversation:hydration-failed': {
    conversationId: string;
    code: HistoryLoadErrorCode;
    message: string;
  };
}

/**
 * Builds the `chat:tabs-changed` payload from a tab manager's live counts (zeros
 * when absent). Shared so every chat-engine host — SpecoratorView and TeamChatView
 * both fire it after restore so the Agent Board queue re-reads capacity — emits the
 * SAME shape from one definition rather than an inline copy per host.
 */
export function tabCountsPayload(
  tabManager: { getTabCount(): number; countTabsByKind(kind: 'chat' | 'work-order'): number } | null,
): ChatEventMap['chat:tabs-changed'] {
  return {
    openCount: tabManager?.getTabCount() ?? 0,
    chatCount: tabManager?.countTabsByKind('chat') ?? 0,
    workOrderCount: tabManager?.countTabsByKind('work-order') ?? 0,
  };
}
