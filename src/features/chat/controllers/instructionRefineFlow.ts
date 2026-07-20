import { Notice } from 'obsidian';

import type { InstructionRefineService } from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { InstructionModal } from '../../../shared/modals/InstructionConfirmModal';
import { appendMarkdownSnippet } from '../../../utils/markdown';
import type { InstructionModeManager } from '../ui/InstructionModeManager';

export interface InstructionRefineFlowDeps {
  plugin: SpecoratorPlugin;
  instructionRefineService: InstructionRefineService;
  instructionModeManager: InstructionModeManager | null;
  /** Auxiliary-model id to apply as the refine service's per-call override. */
  getAuxiliaryModel: () => string | null;
}

/**
 * Runs the `#` instruction-refinement flow: opens the confirm modal, refines the
 * raw instruction against the current system prompt, and appends the accepted
 * result to `settings.systemPrompt`. Extracted from `InputController` as a free
 * function — it shares no turn/stream state, only the refine service + modal.
 */
export async function runInstructionRefineFlow(
  rawInstruction: string,
  deps: InstructionRefineFlowDeps,
): Promise<void> {
  const { plugin, instructionRefineService, instructionModeManager } = deps;
  const syncModelOverride = (): void => {
    instructionRefineService.setModelOverride?.(deps.getAuxiliaryModel() ?? undefined);
  };

  const existingPrompt = plugin.settings.systemPrompt;
  let modal: InstructionModal | null = null;
  let wasCancelled = false;

  try {
    modal = new InstructionModal(
      plugin.app,
      rawInstruction,
      {
        onAccept: (finalInstruction) => {
          void (async (): Promise<void> => {
            const currentPrompt = plugin.settings.systemPrompt;
            plugin.settings.systemPrompt = appendMarkdownSnippet(currentPrompt, finalInstruction);
            await plugin.saveSettings();

            new Notice(t('chat.input.instructionAdded'));
            instructionModeManager?.clear();
          })();
        },
        onReject: () => {
          wasCancelled = true;
          instructionRefineService.cancel();
          instructionModeManager?.clear();
        },
        onClarificationSubmit: async (response) => {
          syncModelOverride();
          const result = await instructionRefineService.continueConversation(response);

          if (wasCancelled) {
            return;
          }

          if (!result.success) {
            if (result.error === 'Cancelled') {
              return;
            }
            new Notice(result.error || t('chat.input.processResponseFailed'));
            modal?.showError(result.error || 'Failed to process response');
            return;
          }

          if (result.clarification) {
            modal?.showClarification(result.clarification);
          } else if (result.refinedInstruction) {
            modal?.showConfirmation(result.refinedInstruction);
          }
        }
      }
    );
    modal.open();

    syncModelOverride();
    instructionRefineService.resetConversation();
    const result = await instructionRefineService.refineInstruction(
      rawInstruction,
      existingPrompt
    );

    if (wasCancelled) {
      return;
    }

    if (!result.success) {
      if (result.error === 'Cancelled') {
        instructionModeManager?.clear();
        return;
      }
      new Notice(result.error || t('chat.input.refineFailed'));
      modal.showError(result.error || 'Failed to refine instruction');
      instructionModeManager?.clear();
      return;
    }

    if (result.clarification) {
      modal.showClarification(result.clarification);
    } else if (result.refinedInstruction) {
      modal.showConfirmation(result.refinedInstruction);
    } else {
      new Notice(t('chat.input.noInstruction'));
      modal.showError('No instruction received');
      instructionModeManager?.clear();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    new Notice(t('common.errorWithDetail', { error: errorMsg }));
    modal?.showError(errorMsg);
    instructionModeManager?.clear();
  }
}
