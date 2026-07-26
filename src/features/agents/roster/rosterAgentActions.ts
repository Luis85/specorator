import { Notice } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';

/**
 * Roster action consumed by the Vue `AgentsPanel` — the provider sync + its
 * Notice copy (extracted for the legacy `AgentRosterView`, deleted 2026-07-04,
 * ADR 0003). Starting a chat now opens the agent's Team Chat DM directly
 * (`activateTeamChat`), so the former sidebar-launch helper was removed.
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
