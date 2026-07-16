/**
 * Specorator - Resume session dropdown
 *
 * Dropup UI for selecting a previous conversation to resume.
 * Shown when the /resume built-in command is executed.
 */

import type { ConversationMeta } from '../../core/types';
import type { ComposerDropdownDelegate } from './composerDropdownDelegate';

export interface ResumeSessionDropdownCallbacks {
  onSelect: (conversationId: string) => void;
  onDismiss: () => void;
}

export interface ResumeSessionDropdownOptions {
  /**
   * Chat-only render seam. The resume dropdown is built exclusively by
   * `ResumeSessionDropdownCoordinator` (chat composer), which always injects
   * the coordinator, so render + keyboard + visibility delegate to it. There is
   * no DOM-render fallback (unlike Slash/Mention, which inline-edit constructs
   * coordinator-less).
   */
  coordinator: ComposerDropdownDelegate;
}

/** Today / same-day → time, otherwise short date. Pure (extracted for reuse). */
export function formatResumeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export class ResumeSessionDropdown {
  private inputEl: HTMLTextAreaElement;
  private callbacks: ResumeSessionDropdownCallbacks;
  private conversations: ConversationMeta[];
  private currentConversationId: string | null;
  private onInput: () => void;
  private readonly coordinator: ComposerDropdownDelegate;

  constructor(
    _containerEl: HTMLElement,
    inputEl: HTMLTextAreaElement,
    conversations: ConversationMeta[],
    currentConversationId: string | null,
    callbacks: ResumeSessionDropdownCallbacks,
    options: ResumeSessionDropdownOptions,
  ) {
    this.inputEl = inputEl;
    this.conversations = this.sortConversations(conversations);
    this.currentConversationId = currentConversationId;
    this.callbacks = callbacks;
    this.coordinator = options.coordinator;

    this.coordinator.showResume(
      this.conversations,
      this.inputEl,
      {
        select: (index) => this.selectItem(index),
        dismiss: () => this.callbacks.onDismiss(),
      },
      this.currentConversationId,
    );

    // Auto-dismiss when user starts typing
    this.onInput = () => this.dismiss();
    this.inputEl.addEventListener('input', this.onInput);
  }

  handleKeydown(e: KeyboardEvent): boolean {
    if (!this.isVisible()) return false;
    return this.coordinator.handleKeydown(e);
  }

  isVisible(): boolean {
    return this.coordinator.getState().kind === 'resume';
  }

  destroy(): void {
    this.inputEl.removeEventListener('input', this.onInput);
    // Owner-scoped clear: only drops the projected state when resume still owns
    // it (hide is the state-clear primitive — it never re-enters the dismiss
    // callback), so tearing this instance down can't clobber a menu another
    // detector opened in the meantime.
    this.coordinator.hide('resume');
  }

  private dismiss(): void {
    // The coordinator's onDismiss destroys this instance (which clears the
    // projected state); this just fans the dismissal to the owning callbacks.
    this.callbacks.onDismiss();
  }

  private selectItem(index: number): void {
    if (this.conversations.length === 0) return;
    const selected = this.conversations[index];
    if (!selected) return;

    // Dismiss without switching if selecting the current conversation
    if (selected.id === this.currentConversationId) {
      this.dismiss();
      return;
    }

    this.callbacks.onSelect(selected.id);
  }

  private sortConversations(conversations: ConversationMeta[]): ConversationMeta[] {
    return [...conversations].sort((a, b) => {
      return (b.lastResponseAt ?? b.createdAt) - (a.lastResponseAt ?? a.createdAt);
    });
  }
}
