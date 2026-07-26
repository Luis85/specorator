import type { ChatMessage } from '../../core/types';
import type SpecoratorPlugin from '../../main';

/** Longest preview we keep; the row clamps visually too, but an unbounded string
 *  would still be projected into every snapshot on every stream frame. */
const PREVIEW_MAX_CHARS = 120;

/**
 * One roster row's DM projection: what the rail shows beneath the agent's name.
 * Absent (no entry) means "this agent has no resolved thread yet" — a first-run
 * row, or one whose conversation is not loaded — which the rail renders as the
 * agent's description rather than as an empty preview.
 */
export interface TeamChatThreadMeta {
  conversationId: string;
  /** Flattened, truncated last message. Empty when the thread has no messages yet. */
  preview: string;
  /** Last activity, for the relative timestamp AND the `recent` sort order. */
  updatedAt: number;
}

/**
 * Per-agent DM projection for the roster rail.
 *
 * Deliberately NOT `ConversationStore.getConversationList()`: that filters team-chat
 * conversations out (they are not ad-hoc history) and its `preview` is the FIRST user
 * message — the right answer for a history dropdown, the wrong one for a DM list, where
 * the row must show what was said LAST. So the preview is derived here from the tail of
 * the message list instead.
 *
 * Pure and synchronous over an already-resolved `agentThreads` map: it is called from
 * the view's snapshot projection, which runs on every stream frame, so it must not touch
 * vault I/O. An unmapped or not-yet-loaded conversation is simply omitted rather than
 * throwing or blocking the row.
 *
 * Reads the STORED conversation, which `ConversationController.save()` commits at turn end.
 * The projection also fires from `onTabStreamingChanged` — which runs BEFORE that save — so
 * a freshly finished turn would briefly project the previous preview; `conversation:saved`
 * re-projects once the write lands, which is what closes that window (and closes it across
 * leaves, where the live transcript isn't reachable anyway). Deliberately NOT read from the
 * open tab's `ChatState.messages`: that getter COPIES, and this runs per stream frame for
 * every mapped agent.
 */
export function projectThreadMetas(
  plugin: SpecoratorPlugin,
  agentThreads: Record<string, string>,
): Record<string, TeamChatThreadMeta> {
  const metas: Record<string, TeamChatThreadMeta> = {};
  for (const [agentId, conversationId] of Object.entries(agentThreads)) {
    const conversation = plugin.getConversationSync(conversationId);
    if (!conversation) continue; // deleted, or not hydrated in this session
    metas[agentId] = {
      conversationId,
      preview: previewFromMessages(conversation.messages),
      updatedAt: conversation.lastResponseAt ?? conversation.updatedAt,
    };
  }
  return metas;
}

/**
 * The tail message flattened to one line. Prefers `displayContent` (what the transcript
 * actually shows) over the raw `content`, so an encoded turn — a work-order protocol
 * block, an instruction-mode wrapper — previews as the user sees it rather than as its
 * wire form. A message with no text (a pure tool call, or an image-only turn) walks
 * backwards to the last one that has some, so a tool-heavy tail doesn't blank the row.
 */
function previewFromMessages(messages: readonly ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = flattenMessageText(messages[i]);
    if (text) return text;
  }
  return '';
}

function flattenMessageText(message: ChatMessage): string {
  const raw = (message.displayContent ?? message.content ?? '').trim();
  if (!raw) return '';
  // Collapse every run of whitespace (newlines included) so a multi-paragraph
  // response previews as one line without relying on CSS to hide the breaks.
  const flattened = raw.replace(/\s+/g, ' ').trim();
  return flattened.length > PREVIEW_MAX_CHARS
    ? `${flattened.slice(0, PREVIEW_MAX_CHARS)}…`
    : flattened;
}

/**
 * The agents whose DM moved since the user last looked at it, as a presence-style
 * sparse map (absent = read), matching how `presence` only carries the busy agents.
 *
 * Unread is a per-leaf, in-memory ACTIVITY signal, not a persisted read model (design
 * §1.3): an agent is unread when its thread advanced past the last time its DM was the
 * active tab. Three rules, each load-bearing —
 *  - the ACTIVE agent is never unread, whatever the timestamps say, because you are
 *    looking at it right now;
 *  - an UNSEEDED agent (no stamp yet) is never unread. The view seeds every agent it
 *    first observes a thread for (`seedLastSeen`), so leaf-open means "everything so
 *    far is seen" and only activity from then on can light a row. Defaulting the other
 *    way would make every reopen shout about months-old threads; and
 *  - `updatedAt: 0` (a resolved-but-empty thread) is never unread — a DM created by a
 *    rotation the user never typed into is not new activity.
 */
export function deriveUnreadAgents(
  metas: Record<string, TeamChatThreadMeta>,
  lastSeenByAgent: ReadonlyMap<string, number>,
  activeAgentId: string | null,
): Record<string, true> {
  const unread: Record<string, true> = {};
  for (const [agentId, meta] of Object.entries(metas)) {
    if (agentId === activeAgentId || !meta.updatedAt) continue;
    const seenAt = lastSeenByAgent.get(agentId);
    if (seenAt !== undefined && meta.updatedAt > seenAt) unread[agentId] = true;
  }
  return unread;
}

/**
 * Brings the per-leaf "seen" baseline up to date, mutating `lastSeenByAgent` in place.
 * Called right before `deriveUnreadAgents` on every projection. Two rules:
 *
 *  - **Seed** agents this leaf has no stamp for. An agent's FIRST observed projection
 *    establishes its baseline and so can never be unread, while a later bump to the same
 *    thread can. Already-stamped agents are left alone — re-seeding them would silently
 *    clear a real unread badge.
 *  - **Re-stamp the ACTIVE agent** to its current timestamp. The projection re-runs on
 *    every stream frame, so the DM you are watching stays continuously seen; without
 *    this, watching an agent stream for five minutes and then switching away would mark
 *    it unread for messages that arrived while you were reading them.
 */
export function updateSeenBaseline(
  metas: Record<string, TeamChatThreadMeta>,
  lastSeenByAgent: Map<string, number>,
  activeAgentId: string | null,
): void {
  for (const [agentId, meta] of Object.entries(metas)) {
    if (agentId === activeAgentId || !lastSeenByAgent.has(agentId)) {
      lastSeenByAgent.set(agentId, meta.updatedAt);
    }
  }
}
