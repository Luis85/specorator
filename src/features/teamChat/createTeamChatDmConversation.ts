import type { Conversation } from '../../core/types/chat';
import type SpecoratorPlugin from '../../main';
import { resolveTeamChatAgentProvider } from './resolveTeamChatAgentProvider';

/**
 * Creates an agent's Team Chat DM on its roster-policy provider (via
 * `resolveTeamChatAgentProvider`). Resolving the provider BEFORE creation is
 * load-bearing: `resolveBoundAgent` only forwards the agent's model when the
 * conversation already runs on the model's provider, so a naive
 * `providerOverride ?? default` would silently drop a cross-provider model.
 *
 * Plugin-scoped (not view-scoped) so the single plugin-wide `TeamChatThreadStore`
 * can own DM creation without pinning to one Team Chat leaf.
 */
export async function createTeamChatDmConversation(
  plugin: SpecoratorPlugin,
  agentId: string,
): Promise<Conversation> {
  const providerId = await resolveTeamChatAgentProvider(plugin, agentId);
  return plugin.createConversation({
    boundAgentId: agentId,
    surface: 'team-chat',
    ...(providerId ? { providerId } : {}),
  });
}
