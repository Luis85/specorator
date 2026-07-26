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
 * Skills tab's one-click behavior. Seeding overwrites the textarea, so it never
 * targets a tab holding an unsent draft (see the routing note below); sending
 * is non-destructive (`sendMessage({ content })` neither folds in nor clears
 * the composer), so it always stays on the active conversation.
 *
 * Provider-enable state is re-checked here via `ProviderRegistry.isEnabled` —
 * `CommandTabEntry.providerEnabled` is a listing-time cache used only for
 * picker dimming, so a provider toggled while the modal was open must not
 * silently dispatch into a disabled provider.
 *
 * **Tab routing differs from the Skills tab on purpose.** A skill starts new
 * work, so it targets a draft-free blank tab. A command is a turn IN a
 * conversation — `/compact` compacts the transcript it is sent to — so it
 * stays on the active tab whenever that tab's provider matches, bound or not
 * (`preferActiveTab`). It falls back to the shared blank-tab routing only when
 * the active tab belongs to another provider, is a work-order run tab, holds a
 * draft a seed would clobber, or does not exist. Everything else (the attached-context carry, the
 * switch-then-attach-pill ordering) is shared — see `landOnProviderChatTab`.
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

  // A slash command is a turn IN a conversation, so it lands on the tab the
  // user is looking at. The one exception is an argument-taking command: it
  // WRITES the composer via seedComposerDraft, which would overwrite an unsent
  // draft, so it steps aside to a fresh tab rather than destroy the text. A
  // send-only dispatch touches nothing in the composer and always stays put.
  const input = await landOnProviderChatTab(plugin, entry.providerId, file, {
    preferActiveTab: entry.argumentHint ? 'when-composer-empty' : 'always',
  });
  if (!input) return;

  const invocation = `${entry.insertPrefix}${entry.name}`;
  if (entry.argumentHint) {
    input.seedComposerDraft(`${invocation} `);
    return;
  }
  await input.sendMessage({ content: invocation });
}
