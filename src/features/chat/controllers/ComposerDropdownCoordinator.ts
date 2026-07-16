import type { ConversationMeta } from '../../../core/types';
import {
  type ComposerDropdownDelegate,
  type ComposerDropdownSource,
} from '../../../shared/components/composerDropdownDelegate';
import { clampSelectionIndex, handleDropdownNavigationKey } from '../../../shared/components/dropdownNavigation';
import { formatResumeDate } from '../../../shared/components/ResumeSessionDropdown';
import type { DropdownItem } from '../../../shared/components/SlashCommandDropdown';
import type { MentionItem } from '../../../shared/mention/types';
import { normalizeArgumentHint } from '../../../utils/slashCommand';
import { anchorFromInput } from '../ui/vue/composer/dropdowns/dropdownAnchor';
import type { ComposerDropdownAnchor, ComposerDropdownItem } from '../ui/vue/composer/stores/composerStore';

export type ComposerDropdownKind = 'slash' | 'mention' | 'resume';

export interface ComposerDropdownCoordinatorState {
  kind: ComposerDropdownKind | null;
  items: ComposerDropdownItem[];
  activeIndex: number;
  anchorRect: ComposerDropdownAnchor | null;
}

/** Fresh closed-state literal per call so no consumer can mutate a shared sentinel. */
function emptyState(): ComposerDropdownCoordinatorState {
  return { kind: null, items: [], activeIndex: 0, anchorRect: null };
}

/**
 * Per-tab owner of the active composer dropdown state (`kind` + `items` +
 * `activeIndex` + `anchorRect`) and the single source `TabComposerProjection`'s
 * `buildDropdown` reads. The imperative chat detectors hand it their RAW filtered
 * items via the `showX` methods (instead of rendering DOM), and route their open
 * dropdown's keyboard navigation through this coordinator's `handleKeydown` so
 * `tabInputWiring` sees the same Arrow/Enter/Tab/Escape behavior it saw against
 * the old DOM dropdowns.
 *
 * This coordinator owns the projection of the raw items into the composer's
 * `ComposerDropdownItem`, keeping the shared detector seam free of features
 * types. Every state mutation calls the injected `emit`
 * (`() => tab.composer?.emit()`). Inline-edit does NOT construct a coordinator —
 * its detectors keep their own DOM render.
 */
export class ComposerDropdownCoordinator implements ComposerDropdownDelegate {
  private kind: ComposerDropdownKind | null = null;
  private items: ComposerDropdownItem[] = [];
  private activeIndex = 0;
  private anchorRect: ComposerDropdownAnchor | null = null;
  private source: ComposerDropdownSource | null = null;

  constructor(private readonly emit: () => void) {}

  getState(): ComposerDropdownCoordinatorState {
    if (this.kind === null) return emptyState();
    return { kind: this.kind, items: this.items, activeIndex: this.activeIndex, anchorRect: this.anchorRect };
  }

  showSlash(items: DropdownItem[], inputEl: HTMLTextAreaElement, source: ComposerDropdownSource): void {
    this.show('slash', toComposerSlashItems(items), inputEl, source);
  }

  showMention(
    items: MentionItem[],
    inputEl: HTMLTextAreaElement,
    source: ComposerDropdownSource,
    initialIndex = 0,
  ): void {
    this.show('mention', toComposerMentionItems(items), inputEl, source, initialIndex);
  }

  showResume(
    items: ConversationMeta[],
    inputEl: HTMLTextAreaElement,
    source: ComposerDropdownSource,
    currentConversationId: string | null,
  ): void {
    this.show('resume', toComposerResumeItems(items, currentConversationId), inputEl, source);
  }

  /** Vue hover/click target: clamp into range, keep the dropdown open, re-project. */
  setActiveIndex(index: number): void {
    if (this.kind === null) return;
    this.activeIndex = Math.max(0, Math.min(this.items.length - 1, index));
    this.emit();
  }

  /** Arrow navigation (keyboard + Vue): clamp `activeIndex + delta` into range. */
  move(delta: number): void {
    if (this.kind === null) return;
    this.activeIndex = clampSelectionIndex(this.activeIndex, delta, this.items.length - 1);
    this.emit();
  }

  /**
   * State-clear primitive. The imperative detector calls this AFTER running its
   * own local reset; it never re-invokes `source.dismiss` (no re-entry).
   */
  hide(): void {
    if (this.kind === null) return;
    this.clear();
    this.emit();
  }

  /** Commit the highlighted item through the owning detector's insert logic. */
  selectActive(): void {
    this.source?.select(this.activeIndex);
  }

  /**
   * Consumes Arrow/Enter/Tab/Escape when a dropdown is open; returns true if
   * handled so `tabInputWiring`'s keydown handler short-circuits before its send
   * path. Returns false with no dropdown open so the keydown falls through.
   */
  handleKeydown(e: KeyboardEvent): boolean {
    if (this.kind === null) return false;
    return handleDropdownNavigationKey(e, {
      itemCount: this.items.length,
      navigate: (direction) => this.move(direction),
      select: () => this.selectActive(),
      dismiss: () => this.dismiss(),
    });
  }

  private show(
    kind: ComposerDropdownKind,
    items: ComposerDropdownItem[],
    inputEl: HTMLTextAreaElement,
    source: ComposerDropdownSource,
    initialIndex = 0,
  ): void {
    this.kind = kind;
    this.items = items;
    this.activeIndex = Math.max(0, Math.min(items.length - 1, initialIndex));
    this.anchorRect = anchorFromInput(inputEl);
    this.source = source;
    this.emit();
  }

  /**
   * Coordinator-initiated teardown (keyboard Escape / Vue dismiss / disable):
   * clears state, re-projects, then runs the detector's local reset — which may
   * re-open at a shallower level (mention submenu → first level).
   */
  private dismiss(): void {
    const source = this.source;
    const wasOpen = this.kind !== null;
    this.clear();
    if (wasOpen) this.emit();
    source?.dismiss();
  }

  private clear(): void {
    this.kind = null;
    this.items = [];
    this.activeIndex = 0;
    this.anchorRect = null;
    this.source = null;
  }
}

/**
 * Pure projections of the shared raw item shapes into `ComposerDropdownItem`.
 * Owned here (features) so the shared detector seam stays free of features
 * types; the chat delegation is the single builder of each list (clone guard).
 */
export function toComposerSlashItems(items: DropdownItem[]): ComposerDropdownItem[] {
  return items.map((item) => ({
    id: `${item.displayPrefix}${item.name}`,
    primary: `${item.displayPrefix}${item.name}`,
    secondary: item.description,
    hint: item.argumentHint ? normalizeArgumentHint(item.argumentHint) : undefined,
  }));
}

export function toComposerMentionItems(items: MentionItem[]): ComposerDropdownItem[] {
  return items.map((item) => {
    switch (item.type) {
      case 'mcp-server':
        return { id: `mcp:${item.name}`, primary: `@${item.name}`, variant: 'mcp-server' };
      case 'agent-folder':
        return { id: 'agent-folder', primary: `@${item.name}/`, variant: 'agent-folder' };
      case 'agent':
        return { id: `agent:${item.id}`, primary: `@${item.id}`, secondary: item.description, variant: 'agent' };
      case 'context-folder':
        return { id: `context-folder:${item.name}`, primary: `@${item.name}/`, variant: 'context-folder' };
      case 'context-file':
        return { id: `context-file:${item.absolutePath}`, primary: item.name, variant: 'context-file' };
      case 'folder':
        return { id: `folder:${item.path}`, primary: `@${item.path}/`, variant: 'vault-folder' };
      default:
        return { id: `file:${item.path}`, primary: item.path || item.name };
    }
  });
}

export function toComposerResumeItems(
  conversations: ConversationMeta[],
  currentConversationId: string | null,
): ComposerDropdownItem[] {
  return conversations.map((conv) => {
    const isCurrent = conv.id === currentConversationId;
    return {
      id: conv.id,
      primary: conv.title,
      secondary: isCurrent ? 'Current session' : formatResumeDate(conv.lastResponseAt ?? conv.createdAt),
      variant: isCurrent ? 'current' : undefined,
    };
  });
}
