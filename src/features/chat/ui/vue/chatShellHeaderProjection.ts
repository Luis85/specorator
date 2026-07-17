import type { ConversationMeta } from '../../../../core/types';
import {
  EMPTY_WORK_ORDER_ACTIVITY_SUMMARY,
  type WorkOrderActivitySummary,
} from '../../../../core/types/workOrderActivity';
import type { ChatShellConversations, ChatShellGit, HistoryConversationOpenState } from './stores/chatShellStore';

/**
 * Pure projection builders for the chat-shell side-panel slices. Extracted from
 * SpecoratorView so the view stays under its LOC ceiling and the projection logic
 * is unit-testable without a live view/TabManager: each takes explicit inputs
 * rather than reading `this`.
 */

/** History-dropdown slice: newest-first conversation list plus per-row open state. */
export function buildConversationsSlice(
  list: ConversationMeta[],
  currentConversationId: string | null,
  getOpenState: (id: string) => HistoryConversationOpenState,
): ChatShellConversations {
  const items = [...list].sort((a, b) => (b.lastResponseAt ?? b.createdAt) - (a.lastResponseAt ?? a.createdAt));
  const perItem: Record<string, { openState: HistoryConversationOpenState }> = {};
  for (const c of items) perItem[c.id] = { openState: getOpenState(c.id) };
  return { items, currentConversationId, perItem };
}

/** Work-order slice: the live summary, or the shared empty summary when absent. */
export function buildWorkOrderSlice(
  summary: WorkOrderActivitySummary | null | undefined,
): WorkOrderActivitySummary {
  return summary ?? EMPTY_WORK_ORDER_ACTIVITY_SUMMARY;
}

/** Git-action slice: the badge is visible only for a dirty repo with actions enabled. */
export function buildGitSlice(
  status: { isRepo: boolean; dirtyCount: number } | null | undefined,
  enabled: boolean,
): ChatShellGit {
  const isRepo = status?.isRepo ?? false;
  const dirtyCount = status?.dirtyCount ?? 0;
  return { isRepo, dirtyCount, visible: Boolean(status && isRepo && dirtyCount > 0 && enabled) };
}
