import { Notice } from 'obsidian';

import type { ConversationMeta } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type { ComposerDropdownDelegate } from '../../../shared/components/composerDropdownDelegate';
import { ResumeSessionDropdown } from '../../../shared/components/ResumeSessionDropdown';

export interface ResumeSessionDropdownDeps {
  getInputContainerEl: () => HTMLElement;
  getInputEl: () => HTMLTextAreaElement;
  getConversations: () => ConversationMeta[];
  getCurrentConversationId: () => string | null;
  openConversation: (conversationId: string) => Promise<void>;
  /** Chat dropdown coordinator (the resume dropdown delegates render/keyboard to it). */
  getDropdownCoordinator?: () => ComposerDropdownDelegate | null;
  /**
   * Whether the `$` resume affordance is disabled for the owning tab's surface.
   * A Team Chat DM binds one fixed thread per agent, so ad-hoc resume is
   * suppressed there. Absent/false everywhere else — sidebar/Agent-Board
   * behavior is unchanged.
   */
  isResumeDisabled?: () => boolean;
}

/**
 * Owns the `$`-resume session dropdown lifecycle for the chat composer: a single
 * live dropdown instance plus its keyboard routing. Lifted out of
 * `InputController`, which keeps thin delegators and feeds this coordinator live
 * accessors (so there is no controller↔coordinator import cycle).
 */
export class ResumeSessionDropdownCoordinator {
  private active: ResumeSessionDropdown | null = null;

  constructor(private readonly deps: ResumeSessionDropdownDeps) {}

  handleKeydown(e: KeyboardEvent): boolean {
    if (!this.active?.isVisible()) return false;
    return this.active.handleKeydown(e);
  }

  isVisible(): boolean {
    return this.active?.isVisible() ?? false;
  }

  destroy(): void {
    if (this.active) {
      this.active.destroy();
      this.active = null;
    }
  }

  show(): void {
    // Team Chat DMs bind one fixed thread per agent, so the ad-hoc `$` resume
    // affordance is disabled there — suppress it before touching any state.
    if (this.deps.isResumeDisabled?.()) return;

    // Clean up any existing dropdown
    this.destroy();

    const conversations = this.deps.getConversations();
    if (conversations.length === 0) {
      new Notice(t('chat.input.noConversationsToResume'));
      return;
    }

    // The composer always mounts the dropdown coordinator before the resume
    // dropdown is built, so in production this is non-null; the type is nullable
    // only for prototype/test paths, which this guard tolerates without a throw.
    const coordinator = this.deps.getDropdownCoordinator?.();
    if (!coordinator) return;

    this.active = new ResumeSessionDropdown(
      this.deps.getInputContainerEl(),
      this.deps.getInputEl(),
      conversations,
      this.deps.getCurrentConversationId(),
      {
        onSelect: (id) => {
          this.destroy();
          this.deps.openConversation(id).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(t('chat.input.openConversationFailed', { error: msg }));
          });
        },
        onDismiss: () => {
          this.destroy();
        },
      },
      { coordinator },
    );
  }
}
