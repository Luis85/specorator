import { Notice, type TAbstractFile } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { asSettingsBag } from '@/core/types/settings';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

import { attachPickedContext, landOnProviderChatTab } from '../resolveProviderChatTab';
import type { SkillTabEntry } from './types';

/**
 * Routes execution of a vault skill to a chat tab matching the skill's
 * provider, attaches the optional file/folder as a context pill, and sends
 * the provider-native skill invocation (`$name` or `/name`).
 *
 * Provider-enable state is re-checked at execution time via
 * `ProviderRegistry.isEnabled` — `SkillTabEntry.providerEnabled` is a
 * listing-time cache for picker dimming, so a provider toggled while the
 * modal was open must not silently send into a disabled provider, and a
 * provider re-enabled while the modal was open must not silently fail.
 *
 * Tab routing, the attached-context carry, and the switch-then-attach-pill
 * ordering are shared with the Commands tab — see `landOnProviderChatTab`.
 */
export async function runVaultSkill(
  plugin: SpecoratorPlugin,
  entry: SkillTabEntry,
  file: TAbstractFile | null,
): Promise<void> {
  const settingsBag = asSettingsBag(plugin.settings);
  const enabledNow = ProviderRegistry.isEnabled(entry.providerId, settingsBag);
  if (!enabledNow) {
    new Notice(
      t('quickActions.skills.providerDisabled', { provider: entry.providerDisplayName }),
    );
    return;
  }

  // A global (`~/.claude/skills`) skill is listed regardless of the provider's
  // user-scope setting (discovery is deliberately ungated), but `/name` only
  // resolves when the provider loads user scope. Refuse up front rather than
  // dispatch a `/name` that the runtime silently drops. Re-checked live here so
  // toggling the setting takes effect without touching the cached listing.
  if (
    entry.scope === 'user'
    && !ProviderRegistry.resolvesUserScopeSkills(entry.providerId, settingsBag)
  ) {
    new Notice(
      t('quickActions.skills.userSettingsRequired', { provider: entry.providerDisplayName }),
    );
    return;
  }

  const target = await landOnProviderChatTab(plugin, entry.providerId);
  const input = target?.controllers.inputController;
  if (!target || !input) return;
  attachPickedContext(target, file);
  await input.sendMessage({ content: `${entry.insertPrefix}${entry.name}` });
  plugin.events.emit('usage.recorded', {
    kind: 'skill',
    name: entry.name,
    providerId: entry.providerId,
  });
}
