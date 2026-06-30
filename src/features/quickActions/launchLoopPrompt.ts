import { Notice } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';
import { launchWithModelPicker } from '@/features/quickActions/launchWithModelPicker';
import type { LoopDefinition } from '@/features/tasks/loops/loopTypes';
import { renderLoopPromptText } from '@/features/tasks/loops/renderLoopPromptText';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

// Lives in features/quickActions (not features/tasks): seeding a composer draft
// is a chat-side orchestration, so keeping it here lets the Loop Library reuse
// it without features/tasks reaching into chat tab internals — mirroring how the
// work-order context menu reuses quickActions helpers (see tasks/CLAUDE.md).

/** A loop is promptable only if it has at least one body section — the picker
 * seeds Approach/Steps/Verify/Notes, so a `useWhen`-only loop seeds nothing
 * actionable. The editor enforces this, but externally-authored notes bypass it. */
function hasPromptableBody(loop: LoopDefinition): boolean {
  return Boolean(
    loop.approach?.trim() || loop.steps?.trim() || loop.verify?.trim() || loop.notes?.trim(),
  );
}

/**
 * Prompt a loop from the library: open the provider+model picker, then on
 * confirm resolve a tab pinned to the chosen model and SEED the loop body into
 * its composer as a draft (no auto-send). The user appends their task and sends.
 */
export function launchLoopPrompt(plugin: SpecoratorPlugin, loop: LoopDefinition): void {
  if (!hasPromptableBody(loop)) {
    new Notice(t('loopLibrary.emptyBody'));
    return;
  }
  launchWithModelPicker(plugin, {
    lastUsedKey: `loop:${loop.id}`,
    title: t('loopLibrary.promptTitle', { name: loop.name }),
    onConfirm: (choice) => void seedLoopDraft(plugin, loop, choice.providerId, choice.model),
  });
}

async function seedLoopDraft(
  plugin: SpecoratorPlugin,
  loop: LoopDefinition,
  providerId: ProviderId,
  model: string,
): Promise<void> {
  let view = plugin.getView();
  if (!view) {
    await plugin.activateView();
    view = plugin.getView();
  }
  if (!view) return;

  const tabManager = view.getTabManager();
  if (!tabManager) return;

  const target = await resolveOverrideTargetTab(plugin, tabManager, { providerId, model });
  if (!target) {
    new Notice(t('loopLibrary.tabLimitReached'));
    return;
  }

  await tabManager.switchToTab(target.id);
  // keepExisting: the resolved tab may be an active blank tab the user already
  // typed an unsent note into — preserve it above the seeded loop body.
  target.controllers.inputController?.seedComposerDraft(renderLoopPromptText(loop), {
    keepExisting: true,
  });
}
