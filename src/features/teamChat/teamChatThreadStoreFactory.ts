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
    isConversationUsable: (id, agentId, expectedProvider) => {
      const conversation = plugin.getConversationSync(id);
      // A mapping is only usable when the conversation is THIS agent's own team-chat
      // DM on the expected provider — reject an ordinary conversation or another
      // agent's DM that a corrupt/synced threads.json may have mapped here.
      return (
        conversation != null &&
        conversation.surface === 'team-chat' &&
        conversation.boundAgentId === agentId &&
        (expectedProvider === undefined || conversation.providerId === expectedProvider)
      );
    },
    findAdoptable: (agentId, expectedProvider) =>
      plugin.findTeamChatConversationForAgent(agentId, expectedProvider),
    events: plugin.events,
  });
}
