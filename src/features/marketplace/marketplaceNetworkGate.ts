import { Notice } from 'obsidian';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';

// The Marketplace fetches remote content from GitHub. Warn the user the first
// time they opt in, then persist a flag so the Notice shows only once.
export async function maybeWarnMarketplaceNetwork(plugin: SpecoratorPlugin): Promise<void> {
  if (plugin.settings.marketplaceNetworkWarningShown) {
    return;
  }
  // Show the notice FIRST so a settings-write failure can't skip it, then persist
  // the flag — rolling it back if the save rejects so a later opt-in re-shows and
  // re-persists instead of suppressing the warning forever on an in-memory flag.
  new Notice(t('marketplace.warning'), 12000);
  plugin.settings.marketplaceNetworkWarningShown = true;
  try {
    await plugin.saveSettings();
  } catch {
    plugin.settings.marketplaceNetworkWarningShown = false;
  }
}
