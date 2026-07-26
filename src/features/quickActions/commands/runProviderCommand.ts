import { Notice, type TAbstractFile } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { asSettingsBag } from '@/core/types/settings';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

import { landOnProviderChatTab } from '../resolveProviderChatTab';
import type { CommandTabEntry } from './types';

/**
 * Routes a provider slash command picked in the Quick Actions modal to a chat
 * tab matching its provider, attaches the optional file/folder as a context
 * pill, and dispatches the provider-native invocation.
 *
 * **Send vs seed**: a command with an `argumentHint` (`/review [pr-url]`) is
 * SEEDED into the composer with a trailing space and left unsent — dispatching
 * a bare `/review` would run it argument-less, which is a different command
 * than the user picked. Argument-less commands send immediately, matching the
 * Skills tab's one-click behavior.
 *
 * Provider-enable state is re-checked here via `ProviderRegistry.isEnabled` —
 * `CommandTabEntry.providerEnabled` is a listing-time cache used only for
 * picker dimming, so a provider toggled while the modal was open must not
 * silently dispatch into a disabled provider.
 *
 * Tab routing, the attached-context carry, and the switch-then-attach-pill
 * ordering are shared with the Skills tab — see `landOnProviderChatTab`.
 */
export async function runProviderCommand(
  plugin: SpecoratorPlugin,
  entry: CommandTabEntry,
  file: TAbstractFile | null,
): Promise<void> {
  if (!ProviderRegistry.isEnabled(entry.providerId, asSettingsBag(plugin.settings))) {
    new Notice(
      t('quickActions.commands.providerDisabled', { provider: entry.providerDisplayName }),
    );
    return;
  }

  const input = await landOnProviderChatTab(plugin, entry.providerId, file);
  if (!input) return;

  const invocation = `${entry.insertPrefix}${entry.name}`;
  if (entry.argumentHint) {
    input.seedComposerDraft(`${invocation} `);
    return;
  }
  await input.sendMessage({ content: invocation });
}
