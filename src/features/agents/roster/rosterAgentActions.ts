import { Notice } from 'obsidian';

import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import { asSettingsBag } from '../../../core/types/settings';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { installPresetAgents } from './presetAgents';
import { resolveAgentProvider } from './resolveAgentProvider';
import type { RosterAgent } from './rosterTypes';

/**
 * Roster actions shared verbatim by the legacy `AgentRosterView` and the Vue
 * `AgentsPanel` (both stay alive until the v4.0.0 legacy deletion pass), so
 * the Notice copy and provider-resolution rules cannot drift between them.
 */

/** Sync every roster agent to the enabled providers, noticing both result branches. */
export async function syncRosterAgentsWithNotice(plugin: SpecoratorPlugin): Promise<void> {
  const result = await plugin.syncRosterAgentsToProviders();
  if (result.failed.length > 0) {
    new Notice(t('agentRoster.syncFailed', { written: String(result.written), failed: String(result.failed.length) }));
    return;
  }
  new Notice(
    result.providers.length > 0
      ? t('agentRoster.syncDone', {
          written: String(result.written),
          providers: result.providers.join(', '),
        })
      : t('agentRoster.syncNone'),
  );
}

/** Install the starter agents and notice how many were new vs already present. */
export async function installPresetAgentsWithNotice(plugin: SpecoratorPlugin): Promise<void> {
  const result = await installPresetAgents(plugin.agentRosterStore);
  new Notice(
    result.installed.length > 0
      ? t('agentRoster.installStarterDone', {
          installed: String(result.installed.length),
          skipped: String(result.skipped.length),
        })
      : t('agentRoster.installStarterNone'),
  );
}

/**
 * Open a chat bound to the agent on a supported provider. The agent's
 * preferred provider (explicit `providerOverride`, else its model's provider)
 * wins only when that provider is actually enabled; otherwise it falls back to
 * the user's active/default enabled provider. This prevents defaulting to a
 * disabled Claude (which would error with "CLI not found") when, say, only
 * Cursor is enabled. Always opens a fresh tab so the agent never hijacks a
 * chat already in use (e.g. a streaming conversation in the active tab).
 */
export async function startChatWithRosterAgent(plugin: SpecoratorPlugin, agent: RosterAgent): Promise<void> {
  const settings = asSettingsBag(plugin.settings);
  const providerId = resolveAgentProvider(
    agent,
    (p) => ProviderRegistry.isEnabled(p, settings),
    ProviderRegistry.resolveSettingsProviderId(settings),
  );
  const conversation = await plugin.createConversation({ providerId, boundAgentId: agent.id });
  await plugin.openConversation(conversation.id, { requireNewTab: true });
}
