import { Notice } from 'obsidian';

import type { ConversationMeta } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import { ResumeSessionDropdown } from '../../../shared/components/ResumeSessionDropdown';

export interface ResumeSessionDropdownDeps {
  getInputContainerEl: () => HTMLElement;
  getInputEl: () => HTMLTextAreaElement;
  getConversations: () => ConversationMeta[];
  getCurrentConversationId: () => string | null;
  openConversation: (conversationId: string) => Promise<void>;
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
    // Clean up any existing dropdown
    this.destroy();

    const conversations = this.deps.getConversations();
    if (conversations.length === 0) {
      new Notice(t('chat.input.noConversationsToResume'));
      return;
    }

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
    );
  }
}
