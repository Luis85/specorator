import { Notice } from 'obsidian';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';

// The Marketplace fetches remote content from GitHub. Warn the user the first
// time they opt in, then persist a flag so the Notice shows only once.
export async function maybeWarnMarketplaceNetwork(plugin: SpecoratorPlugin): Promise<void> {
  if (plugin.settings.marketplaceNetworkWarningShown) {
    return;
  }
  plugin.settings.marketplaceNetworkWarningShown = true;
  await plugin.saveSettings();
  new Notice(t('marketplace.warning'), 12000);
}
