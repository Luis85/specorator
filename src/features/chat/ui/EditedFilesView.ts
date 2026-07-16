import { setIcon } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type { EditedFileChangeKind, EditedFileEntry } from '../utils/editedFiles';
import { basename, parentDir } from '../utils/pathLabel';

export interface EditedFilesViewCallbacks {
  /** Opens the clicked file (resolution + error handling owned by the caller). */
  onOpenFile: (path: string) => void;
}

/**
 * Renders the "files changed by the agent" affordance above the composer as a
 * single-line badge (kind-split count) that toggles a floating, grouped popover
 * listing every created/edited file. The collapsed badge has a fixed height so
 * the composer never grows; the popover overlays the messages with no layout
 * shift and closes on outside click or Escape. Self-manages row visibility
 * (hidden when empty). Mirrors the WorkOrderActivityDropdown toggle idiom.
 */
export class EditedFilesView {
  private readonly rowEl: HTMLElement;
  private readonly callbacks: EditedFilesViewCallbacks;
  private entries: readonly EditedFileEntry[] = [];
  private open = false;
  private rootEl: HTMLElement | null = null;
  private listenersAttached = false;

  private readonly onDocumentMouseDown = (event: MouseEvent): void => {
    const target = event.target as Node | null;
    if (this.rootEl && target && this.rootEl.contains(target)) return;
    this.close();
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.close();
  };

  constructor(rowEl: HTMLElement, callbacks: EditedFilesViewCallbacks) {
    this.rowEl = rowEl;
    this.callbacks = callbacks;
    this.rowEl.addClass('specorator-hidden');
  }

  destroy(): void {
    this.detachDismissListeners();
    this.rowEl.empty();
    this.rootEl = null;
  }

  render(entries: readonly EditedFileEntry[]): void {
    this.entries = entries;
    if (entries.length === 0) this.open = false;
    this.renderInternal();
  }

  private renderInternal(): void {
    this.rowEl.empty();
    this.rootEl = null;

    if (this.entries.length === 0) {
      this.detachDismissListeners();
      this.rowEl.removeClass('specorator-visible-flex');
      this.rowEl.addClass('specorator-hidden');
      return;
    }

    this.rowEl.addClass('specorator-visible-flex');
    this.rowEl.removeClass('specorator-hidden');

    const root = this.rowEl.createDiv({ cls: 'specorator-edited-files' });
    this.rootEl = root;
    this.renderBadge(root);
    if (this.open) {
      this.renderPopover(root);
      this.attachDismissListeners();
    } else {
      this.detachDismissListeners();
    }
  }

  private renderBadge(root: HTMLElement): void {
    const badge = root.createDiv({ cls: 'specorator-edited-files-badge' });
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-haspopup', 'menu');
    badge.setAttribute('aria-expanded', this.open ? 'true' : 'false');
    badge.setAttribute('aria-label', t('chat.editedFiles.label'));

    setIcon(badge.createSpan({ cls: 'specorator-edited-files-badge-icon' }), 'file-pen');
    badge.createSpan({ cls: 'specorator-edited-files-badge-count', text: this.badgeLabel() });
    setIcon(badge.createSpan({ cls: 'specorator-edited-files-badge-chevron' }), 'chevron-down');

    badge.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggle();
    });
    badge.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.toggle();
    });
  }

  private badgeLabel(): string {
    const { created, edited } = this.countByKind();
    const parts: string[] = [];
    if (created > 0) parts.push(t('chat.editedFiles.created', { count: String(created) }));
    if (edited > 0) parts.push(t('chat.editedFiles.edited', { count: String(edited) }));
    return parts.join(' · ');
  }

  private countByKind(): { created: number; edited: number } {
    let created = 0;
    let edited = 0;
    for (const entry of this.entries) {
      if (entry.changeKind === 'created') created += 1;
      else edited += 1;
    }
    return { created, edited };
  }

  private renderPopover(root: HTMLElement): void {
    const menu = root.createDiv({ cls: 'specorator-edited-files-menu' });
    menu.setAttribute('role', 'menu');
    this.renderGroup(menu, 'created', t('chat.editedFiles.groupCreated'));
    this.renderGroup(menu, 'edited', t('chat.editedFiles.groupEdited'));
  }

  private renderGroup(menu: HTMLElement, kind: EditedFileChangeKind, label: string): void {
    const items = this.entries.filter((entry) => entry.changeKind === kind);
    if (items.length === 0) return;
    menu.createDiv({ cls: 'specorator-edited-files-group-label', text: label });
    for (const entry of items) this.renderRow(menu, entry);
  }

  private renderRow(menu: HTMLElement, entry: EditedFileEntry): void {
    const row = menu.createDiv({
      cls: `specorator-edited-files-item specorator-edited-files-item--${entry.changeKind}`,
    });
    row.setAttribute('role', 'menuitem');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', entry.path);

    const iconEl = row.createSpan({ cls: 'specorator-edited-files-item-icon' });
    setIcon(iconEl, entry.changeKind === 'created' ? 'file-plus' : 'file-pen');

    const nameEl = row.createSpan({ cls: 'specorator-edited-files-item-name' });
    nameEl.setText(basename(entry.path));
    nameEl.setAttribute('title', entry.path);

    const dir = parentDir(entry.path);
    if (dir) row.createSpan({ cls: 'specorator-edited-files-item-dir', text: dir });

    const activate = (): void => {
      this.close();
      this.callbacks.onOpenFile(entry.path);
    };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
  }

  private toggle(): void {
    this.open = !this.open;
    this.renderInternal();
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.renderInternal();
  }

  private attachDismissListeners(): void {
    if (this.listenersAttached) return;
    const doc = this.rowEl.ownerDocument;
    doc.addEventListener('mousedown', this.onDocumentMouseDown);
    doc.addEventListener('keydown', this.onDocumentKeyDown);
    this.listenersAttached = true;
  }

  private detachDismissListeners(): void {
    if (!this.listenersAttached) return;
    const doc = this.rowEl.ownerDocument;
    doc.removeEventListener('mousedown', this.onDocumentMouseDown);
    doc.removeEventListener('keydown', this.onDocumentKeyDown);
    this.listenersAttached = false;
  }
}
