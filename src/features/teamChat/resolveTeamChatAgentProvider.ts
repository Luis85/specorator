import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import type { ProviderId } from '../../core/providers/types';
import { asSettingsBag } from '../../core/types/settings';
import type SpecoratorPlugin from '../../main';
import { resolveAgentProvider } from '../agents/roster/resolveAgentProvider';

/**
 * The provider an agent's Team Chat DM should run on, under the same roster
 * policy the roster launcher uses: the explicit `providerOverride`, else the
 * provider implied by `modelSelection`, else the active/default enabled provider.
 * `undefined` when the agent is unknown (a deleted roster entry) — the caller
 * then creates provider-agnostically and has no known provider to rotate toward.
 *
 * Extracted so DM creation AND the thread store's provider-change rotation gate
 * resolve the expected provider through ONE policy, never a drifting second copy:
 * a mismatch would let a DM reuse gate disagree with what creation actually built.
 */
export async function resolveTeamChatAgentProvider(
  plugin: SpecoratorPlugin,
  agentId: string,
): Promise<ProviderId | undefined> {
  const agent = await plugin.agentRosterStore.get(agentId);
  if (!agent) return undefined;
  const settings = asSettingsBag(plugin.settings);
  return resolveAgentProvider(
    agent,
    (candidate) => ProviderRegistry.isEnabled(candidate, settings),
    ProviderRegistry.resolveSettingsProviderId(settings),
  );
}
