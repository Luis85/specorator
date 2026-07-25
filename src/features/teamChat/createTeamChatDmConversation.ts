import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import type { Conversation } from '../../core/types/chat';
import { asSettingsBag } from '../../core/types/settings';
import type SpecoratorPlugin from '../../main';
import { resolveAgentProvider } from '../agents/roster/resolveAgentProvider';

/**
 * Creates an agent's Team Chat DM on its roster-policy provider — the explicit
 * `providerOverride`, else the provider implied by `modelSelection`, else the
 * active/default enabled provider (mirror of `startChatWithRosterAgent` for the
 * team-chat surface). Resolving the provider BEFORE creation is load-bearing:
 * `resolveBoundAgent` only forwards the agent's model when the conversation
 * already runs on the model's provider, so a naive `providerOverride ?? default`
 * would silently drop a cross-provider model.
 *
 * Plugin-scoped (not view-scoped) so the single plugin-wide `TeamChatThreadStore`
 * can own DM creation without pinning to one Team Chat leaf.
 */
export async function createTeamChatDmConversation(
  plugin: SpecoratorPlugin,
  agentId: string,
): Promise<Conversation> {
  const agent = await plugin.agentRosterStore.get(agentId);
  const settings = asSettingsBag(plugin.settings);
  const providerId = agent
    ? resolveAgentProvider(
        agent,
        (candidate) => ProviderRegistry.isEnabled(candidate, settings),
        ProviderRegistry.resolveSettingsProviderId(settings),
      )
    : undefined;
  return plugin.createConversation({
    boundAgentId: agentId,
    surface: 'team-chat',
    ...(providerId ? { providerId } : {}),
  });
}
