import type SpecoratorPlugin from '../../main';
import { createTeamChatDmConversation } from './createTeamChatDmConversation';
import { TeamChatThreadStore } from './TeamChatThreadStore';

export type { TeamChatThreadStore } from './TeamChatThreadStore';

/**
 * Builds the single plugin-scoped Team Chat DM thread store. Every dependency is
 * plugin-level, so ONE instance can serialize + cache every Team Chat leaf's
 * mutations — a per-view store would let a stale-cache write drop another leaf's
 * mapping and contend for the shared `threads.json.tmp` path.
 */
export function createTeamChatThreadStore(plugin: SpecoratorPlugin): TeamChatThreadStore {
  return new TeamChatThreadStore({
    adapter: plugin.vaultFileAdapter,
    createConversation: (agentId) => createTeamChatDmConversation(plugin, agentId),
    conversationExists: (id) => plugin.getConversationSync(id) != null,
    findAdoptable: (agentId) => plugin.findTeamChatConversationForAgent(agentId),
    events: plugin.events,
  });
}
