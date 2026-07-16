import type { ConversationMeta } from '../../core/types';
import type { MentionItem } from '../mention/types';
import type { DropdownItem } from './SlashCommandDropdown';

/**
 * Seam between the imperative chat dropdown detectors (SlashCommandDropdown,
 * MentionDropdownController, ResumeSessionDropdown) and the chat-only
 * `ComposerDropdownCoordinator` (features/chat). The detectors keep owning
 * input scanning, item building, and insert logic; when a coordinator is
 * injected they DELEGATE render + keyboard + visibility to it instead of
 * building/reading DOM.
 *
 * The detectors hand the coordinator their RAW filtered items (the shared item
 * shapes); the coordinator (features) owns the projection into the composer's
 * `ComposerDropdownItem`, so this shared seam never imports a features type.
 */
export interface ComposerDropdownSource {
  /** Commit the item at `index` — the detector's own insert logic. */
  select: (index: number) => void;
  /**
   * Coordinator-initiated teardown (keyboard Escape / Vue dismiss). Runs the
   * detector's local reset; MUST NOT re-enter the coordinator.
   */
  dismiss: () => void;
}

export interface ComposerDropdownDelegate {
  showSlash(items: DropdownItem[], inputEl: HTMLTextAreaElement, source: ComposerDropdownSource): void;
  /**
   * `initialIndex` defaults to 0; the mention menu pre-highlights the first
   * vault item (not the first item), so it passes its own resolved index.
   */
  showMention(
    items: MentionItem[],
    inputEl: HTMLTextAreaElement,
    source: ComposerDropdownSource,
    initialIndex?: number,
  ): void;
  showResume(
    items: ConversationMeta[],
    inputEl: HTMLTextAreaElement,
    source: ComposerDropdownSource,
    currentConversationId: string | null,
  ): void;
  setActiveIndex(index: number): void;
  move(delta: number): void;
  hide(): void;
  selectActive(): void;
  handleKeydown(e: KeyboardEvent): boolean;
  getState(): { kind: 'slash' | 'mention' | 'resume' | null };
}
