import { ProviderWorkspaceRegistry } from '../../core/providers/ProviderWorkspaceRegistry';
import type { ProviderId } from '../../core/types/provider';
import type SpecoratorPlugin from '../../main';

/** Best-effort provider catalog refresh after a successful vault write: a
 *  provider whose listing needs a live subprocess (Codex spawns an ephemeral
 *  app-server) can fail to refresh, but the disk mutation already happened —
 *  the caller must complete (reload, close, notify success) regardless. The
 *  aggregator's vaultSkill.changed emit + TTL cover eventual freshness. */
export async function refreshSkillCatalogBestEffort(
  plugin: SpecoratorPlugin,
  providerId: ProviderId,
): Promise<void> {
  try {
    await ProviderWorkspaceRegistry.getCommandCatalog(providerId)?.refresh();
  } catch (error) {
    plugin.logger.scope('skills').warn('catalog refresh failed after save', error);
  }
}
