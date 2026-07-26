import type { UsageEventMap } from '../../core/usage/events';
import type { AgentsEventMap } from '../../features/agents/events';
import type { ChatEventMap } from '../../features/chat/events';
import type { QuickActionsEventMap } from '../../features/quickActions/events';
import type { SettingsEventMap } from '../../features/settings/events';
import type { TaskEventMap } from '../../features/tasks/events';

/**
 * Team Chat surface events. Owned at the app layer for now because the surface's
 * thread store (T2) lands before the feature module gains its own event file;
 * mirrors the `void` fire-and-forget convention of `AgentsEventMap.roster:changed`.
 */
export interface TeamChatEventMap {
  /** The team-chat thread map (roomKey → conversationId) changed. */
  'teamChat:threads-changed': void;
  /** A DM's streaming state changed in some leaf; every Team Chat leaf re-projects
   *  presence so an agent busy in ANOTHER leaf's DM shows busy here too. */
  'teamChat:presence': void;
}

export type SpecoratorEventMap = ChatEventMap
  & QuickActionsEventMap
  & SettingsEventMap
  & TaskEventMap
  & UsageEventMap
  & AgentsEventMap
  & TeamChatEventMap;
