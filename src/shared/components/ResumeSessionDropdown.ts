/**
 * Specorator - Resume session dropdown
 *
 * Dropup UI for selecting a previous conversation to resume.
 * Shown when the /resume built-in command is executed.
 */

import { setIcon } from 'obsidian';

import type { ConversationMeta } from '../../core/types';
import type { ComposerDropdownDelegate } from './composerDropdownDelegate';
import {
  applySelectionClass,
  clampSelectionIndex,
  handleDropdownNavigationKey,
} from './dropdownNavigation';

export interface ResumeSessionDropdownCallbacks {
  onSelect: (conversationId: string) => void;
  onDismiss: () => void;
}

export interface ResumeSessionDropdownOptions {
  /**
   * Chat-only: when present, render + keyboard + visibility DELEGATE to the
   * coordinator (no DOM built).
   */
  coordinator?: ComposerDropdownDelegate;
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
  private containerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private dropdownEl: HTMLElement | null = null;
  private callbacks: ResumeSessionDropdownCallbacks;
  private conversations: ConversationMeta[];
  private currentConversationId: string | null;
  private selectedIndex = 0;
  private onInput: () => void;
  private readonly coordinator: ComposerDropdownDelegate | null;

  constructor(
    containerEl: HTMLElement,
    inputEl: HTMLTextAreaElement,
    conversations: ConversationMeta[],
    currentConversationId: string | null,
    callbacks: ResumeSessionDropdownCallbacks,
    options: ResumeSessionDropdownOptions = {},
  ) {
    this.containerEl = containerEl;
    this.inputEl = inputEl;
    this.conversations = this.sortConversations(conversations);
    this.currentConversationId = currentConversationId;
    this.callbacks = callbacks;
    this.coordinator = options.coordinator ?? null;

    if (this.coordinator) {
      this.coordinator.showResume(
        this.conversations,
        this.inputEl,
        {
          select: (index) => this.selectItem(index),
          dismiss: () => this.callbacks.onDismiss(),
        },
        this.currentConversationId,
      );
    } else {
      this.dropdownEl = this.containerEl.createDiv({ cls: 'specorator-resume-dropdown' });
      this.render();
      this.dropdownEl.addClass('visible');
    }

    // Auto-dismiss when user starts typing
    this.onInput = () => this.dismiss();
    this.inputEl.addEventListener('input', this.onInput);
  }

  handleKeydown(e: KeyboardEvent): boolean {
    if (!this.isVisible()) return false;

    if (this.coordinator) {
      return this.coordinator.handleKeydown(e);
    }

    return handleDropdownNavigationKey(e, {
      itemCount: this.conversations.length,
      navigate: (direction) => this.navigate(direction),
      select: () => this.selectItem(),
      dismiss: () => this.dismiss(),
    });
  }

  isVisible(): boolean {
    if (this.coordinator) {
      return this.coordinator.getState().kind === 'resume';
    }
    return this.dropdownEl?.hasClass('visible') ?? false;
  }

  destroy(): void {
    this.inputEl.removeEventListener('input', this.onInput);
    // Clear the projected state only if this dropdown still owns it (hide is the
    // state-clear primitive — it never re-enters the dismiss callback).
    if (this.coordinator && this.coordinator.getState().kind === 'resume') {
      this.coordinator.hide();
    }
    this.dropdownEl?.remove();
  }

  private dismiss(): void {
    // Coordinator path: the wrapper's onDismiss destroys this instance (which
    // clears the projected state); DOM path clears the visible class directly.
    this.dropdownEl?.removeClass('visible');
    this.callbacks.onDismiss();
  }

  private selectItem(index: number = this.selectedIndex): void {
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

  private navigate(direction: number): void {
    this.selectedIndex = clampSelectionIndex(
      this.selectedIndex,
      direction,
      this.conversations.length - 1,
    );
    this.updateSelection();
  }

  private updateSelection(): void {
    applySelectionClass(
      this.dropdownEl?.querySelectorAll('.specorator-resume-item'),
      this.selectedIndex,
    );
  }

  private sortConversations(conversations: ConversationMeta[]): ConversationMeta[] {
    return [...conversations].sort((a, b) => {
      return (b.lastResponseAt ?? b.createdAt) - (a.lastResponseAt ?? a.createdAt);
    });
  }

  private render(): void {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    const header = this.dropdownEl.createDiv({ cls: 'specorator-resume-header' });
    header.createSpan({ text: 'Resume conversation' });

    if (this.conversations.length === 0) {
      this.dropdownEl.createDiv({ cls: 'specorator-resume-empty', text: 'No conversations' });
      return;
    }

    const list = this.dropdownEl.createDiv({ cls: 'specorator-resume-list' });

    for (let i = 0; i < this.conversations.length; i++) {
      const conv = this.conversations[i];
      const isCurrent = conv.id === this.currentConversationId;

      const item = list.createDiv({ cls: 'specorator-resume-item' });
      if (isCurrent) item.addClass('current');
      if (i === this.selectedIndex) item.addClass('selected');

      const iconEl = item.createDiv({ cls: 'specorator-resume-item-icon' });
      setIcon(iconEl, isCurrent ? 'message-square-dot' : 'message-square');

      const content = item.createDiv({ cls: 'specorator-resume-item-content' });
      const titleEl = content.createDiv({ cls: 'specorator-resume-item-title', text: conv.title });
      titleEl.setAttribute('title', conv.title);
      content.createDiv({
        cls: 'specorator-resume-item-date',
        text: isCurrent ? 'Current session' : formatResumeDate(conv.lastResponseAt ?? conv.createdAt),
      });

      item.addEventListener('click', () => {
        if (isCurrent) {
          this.dismiss();
          return;
        }
        this.callbacks.onSelect(conv.id);
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
    }
  }
}
