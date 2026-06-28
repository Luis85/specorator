import { Notice } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';
import { launchWithModelPicker } from '@/shared/launchWithModelPicker';

import type { LoopDefinition } from './loopTypes';
import { renderLoopPromptText } from './renderLoopPromptText';

/**
 * Prompt a loop from the library: open the provider+model picker, then on
 * confirm resolve a tab pinned to the chosen model and SEED the loop body into
 * its composer as a draft (no auto-send). The user appends their task and sends.
 */
export function launchLoopPrompt(plugin: SpecoratorPlugin, loop: LoopDefinition): void {
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
    new Notice(t('quickActions.contextMenu.tabLimitReached'));
    return;
  }

  await tabManager.switchToTab(target.id);
  target.controllers.inputController?.seedComposerDraft(renderLoopPromptText(loop));
}
