import type SpecoratorPlugin from '../../main';
import { createTeamChatDmConversation } from './createTeamChatDmConversation';
import { resolveTeamChatAgentProvider } from './resolveTeamChatAgentProvider';
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
    resolveExpectedProvider: (agentId) => resolveTeamChatAgentProvider(plugin, agentId),
    createConversation: (agentId) => createTeamChatDmConversation(plugin, agentId),
    isConversationUsable: (id, expectedProvider) => {
      const conversation = plugin.getConversationSync(id);
      return (
        conversation != null &&
        (expectedProvider === undefined || conversation.providerId === expectedProvider)
      );
    },
    findAdoptable: (agentId, expectedProvider) =>
      plugin.findTeamChatConversationForAgent(agentId, expectedProvider),
    events: plugin.events,
  });
}
