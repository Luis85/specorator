import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderMessageContextCard } from '@/features/chat/rendering/MessageContextCard';

/**
 * Characterization test: locks the exact DOM contract the legacy
 * `renderMessageContextCard` produces — empty short-circuit, header count
 * label, file/folder row shape, and the `onOpenFile` click wiring — so
 * `cards/MessageContextCard.vue` can be built to reproduce it exactly.
 * Deleted alongside the legacy renderer in a later cleanup task; its Vue
 * parity twin is `messageContextCard.test.ts`.
 */
describe('renderMessageContextCard characterization', () => {
  let parentEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parentEl = document.createElement('div');
  });

  it('returns null and renders nothing when files and folders are both empty', () => {
    const result = renderMessageContextCard(parentEl, { files: [], folders: [] });
    expect(result).toBeNull();
    expect(parentEl.querySelector('.specorator-context-card')).toBeNull();
  });

  it('renders header count, file rows (icon/name/title), and folder rows (trailing slash, no click wiring)', () => {
    const onOpenFile = vi.fn();
    renderMessageContextCard(
      parentEl,
      { files: ['notes/design.md'], folders: ['assets/images'] },
      { onOpenFile },
    );

    const card = parentEl.querySelector('.specorator-context-card')!;
    const header = card.querySelector('.specorator-context-card-header') as HTMLElement;
    const headerIcon = header.querySelector('.specorator-context-card-header-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(headerIcon, 'paperclip');
    expect(header.querySelector('.specorator-context-card-header-label')?.textContent).toBe(
      'Attached context (2)',
    );

    const fileRow = card.querySelector('.specorator-context-card-row--file') as HTMLElement;
    expect(fileRow.classList.contains('specorator-context-card-row--clickable')).toBe(true);
    const fileIcon = fileRow.querySelector('.specorator-context-card-row-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(fileIcon, 'file-text');
    const fileName = fileRow.querySelector('.specorator-context-card-row-name')!;
    expect(fileName.textContent).toBe('design.md');
    expect(fileName.getAttribute('title')).toBe('notes/design.md');

    fileRow.click();
    expect(onOpenFile).toHaveBeenCalledWith('notes/design.md');

    const folderRow = card.querySelector('.specorator-context-card-row--folder') as HTMLElement;
    expect(folderRow.classList.contains('specorator-context-card-row--clickable')).toBe(false);
    const folderIcon = folderRow.querySelector('.specorator-context-card-row-icon') as HTMLElement;
    expect(setIcon).toHaveBeenCalledWith(folderIcon, 'folder');
    const folderName = folderRow.querySelector('.specorator-context-card-row-name')!;
    expect(folderName.textContent).toBe('images/');
    expect(folderName.getAttribute('title')).toBe('assets/images');

    // Folder rows never wire a click handler (no Obsidian API to open a folder).
    folderRow.click();
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it('does not add the clickable class or click wiring when onOpenFile is omitted', () => {
    renderMessageContextCard(parentEl, { files: ['a.md'], folders: [] });
    const fileRow = parentEl.querySelector('.specorator-context-card-row--file') as HTMLElement;
    expect(fileRow.classList.contains('specorator-context-card-row--clickable')).toBe(false);
  });
});
