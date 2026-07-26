import { Notice, type TAbstractFile } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { asSettingsBag } from '@/core/types/settings';
import { isCompactInvocation } from '@/features/chat/controllers/composerSendPhases';
import type { TabData } from '@/features/chat/tabs/types';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

import { attachPickedContext, landOnProviderChatTab } from '../resolveProviderChatTab';
import type { CommandTabEntry } from './types';

/**
 * Mirrors `InputController.isConversationBusy()`: the tab is mid-reset, so
 * neither dispatch mode survives. A send returns immediately from
 * `sendMessage` without sending, and a seed is wiped by whatever the reset
 * settles into — `createNew` clears the composer and the file context,
 * successful hydration resets the file context, and a failed one restores the
 * pre-switch draft over the seeded invocation.
 *
 * Checked BEFORE attaching the picked file: a pill attached and then abandoned
 * would sit on the composer and ride along with an unrelated later send.
 */
function isConversationBusy(tab: TabData): boolean {
  return tab.state.isCreatingConversation
    || tab.state.isSwitchingConversation
    || tab.state.isHydrating;
}

/**
 * Additionally blocks a SEND while the tab streams: `sendMessage` routes it
 * into the queue, whose single slot `mergeQueuedChatTurns` joins as
 * `existing\n\nincoming` — ruinous for an invocation from either side. An
 * occupied slot yields `queued text\n\n/command`, no longer a leading-token
 * command; an empty one is merged by the user's NEXT send into
 * `/command\n\ntheir message`, running the command with their message as
 * arguments and swallowing it.
 *
 * Seeding is exempt: it writes the composer and never enqueues, which is
 * exactly what typing the invocation by hand mid-stream already does.
 */
function cannotSendNow(tab: TabData): boolean {
  return tab.state.isStreaming || isConversationBusy(tab);
}

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
 * the composer), so it always stays on the active conversation. Either mode is
 * declined while the tab is mid-reset, and a send additionally while it streams
 * — see `isConversationBusy` / `cannotSendNow`.
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
 * draft a seed would clobber, or does not exist. Everything else (the
 * attached-context carry, the switch-then-attach-pill ordering) is shared — see
 * `landOnProviderChatTab`.
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

  const invocation = `${entry.insertPrefix}${entry.name}`;
  // `/compact` is a control operation on the transcript: it ships without the
  // mention suffix and without images, and (since the pill-preservation fix)
  // consumes neither. So ANY context around it would be neither used nor
  // cleared — it would just linger on the composer for the next send to pick
  // up. That rules out both the picked file/folder and the carry of the active
  // tab's own attachments onto a fallback tab.
  const isCompact = isCompactInvocation(invocation);

  // A slash command is a turn IN a conversation, so it lands on the tab the
  // user is looking at. The one exception is an argument-taking command: it
  // WRITES the composer via seedComposerDraft, which would overwrite an unsent
  // draft, so it steps aside to a fresh tab rather than destroy the text. A
  // send-only dispatch touches nothing in the composer and always stays put.
  const target = await landOnProviderChatTab(plugin, entry.providerId, {
    preferActiveTab: entry.argumentHint ? 'when-composer-empty' : 'always',
    carryAttachedContext: !isCompact,
  });
  const input = target?.controllers.inputController;
  if (!target || !input) return;

  // Both modes need the tab to be settled; only a send is additionally blocked
  // by streaming. Checked before `attachPickedContext` so a declined dispatch
  // never strands a pill.
  const blocked = entry.argumentHint ? isConversationBusy(target) : cannotSendNow(target);
  if (blocked) {
    new Notice(t('quickActions.commands.queueBusy'));
    return;
  }

  const picked = isCompact ? null : file;
  attachPickedContext(target, picked);
  if (entry.argumentHint) {
    input.seedComposerDraft(`${invocation} `);
    return;
  }
  await input.sendMessage({ content: invocation });
}
