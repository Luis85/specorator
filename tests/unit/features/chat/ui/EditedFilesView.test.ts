/**
 * @jest-environment jsdom
 */
import { createMockEl, type MockElement } from '@test/helpers/mockElement';

import { EditedFilesView } from '@/features/chat/ui/EditedFilesView';
import type { EditedFileEntry } from '@/features/chat/utils/editedFiles';

jest.mock('obsidian', () => ({ setIcon: jest.fn() }));
jest.mock('@/i18n/i18n', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(',')}` : key,
}));

function findAll(root: MockElement, cls: string): MockElement[] {
  const out: MockElement[] = [];
  const walk = (n: MockElement) => {
    if (n.hasClass(cls)) out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

function first(root: MockElement, cls: string): MockElement {
  const all = findAll(root, cls);
  if (all.length === 0) throw new Error(`no element with class ${cls}`);
  return all[0];
}

const entries: EditedFileEntry[] = [
  { path: 'src/new.ts', changeKind: 'created' },
  { path: 'notes/old.md', changeKind: 'edited' },
];

describe('EditedFilesView', () => {
  it('starts hidden', () => {
    const row = createMockEl();
    new EditedFilesView(row, { onOpenFile: jest.fn() });
    expect(row.hasClass('specorator-hidden')).toBe(true);
  });

  it('renders a collapsed kind-split badge and no popover', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });

    view.render(entries);

    expect(findAll(row, 'specorator-edited-files-badge')).toHaveLength(1);
    expect(first(row, 'specorator-edited-files-badge-count').textContent).toBe(
      'chat.editedFiles.created:1 · chat.editedFiles.edited:1',
    );
    expect(findAll(row, 'specorator-edited-files-menu')).toHaveLength(0);
    expect(first(row, 'specorator-edited-files-badge').getAttribute('aria-expanded')).toBe('false');
    expect(row.hasClass('specorator-visible-flex')).toBe(true);
  });

  it('shows only the present kind when one count is zero', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });

    view.render([{ path: 'a/b.ts', changeKind: 'created' }]);
    expect(first(row, 'specorator-edited-files-badge-count').textContent).toBe('chat.editedFiles.created:1');

    view.render([{ path: 'a/b.ts', changeKind: 'edited' }]);
    expect(first(row, 'specorator-edited-files-badge-count').textContent).toBe('chat.editedFiles.edited:1');
  });

  it('hides and clears the row when there are no entries', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });
    view.render(entries);

    view.render([]);

    expect(findAll(row, 'specorator-edited-files-badge')).toHaveLength(0);
    expect(row.hasClass('specorator-hidden')).toBe(true);
    expect(row.hasClass('specorator-visible-flex')).toBe(false);
  });

  it('toggles the popover open on badge click, grouped created-before-edited', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });
    view.render(entries);

    first(row, 'specorator-edited-files-badge').click();

    expect(findAll(row, 'specorator-edited-files-menu')).toHaveLength(1);
    expect(first(row, 'specorator-edited-files-badge').getAttribute('aria-expanded')).toBe('true');

    const groupLabels = findAll(row, 'specorator-edited-files-group-label').map((el) => el.textContent);
    expect(groupLabels).toEqual(['chat.editedFiles.groupCreated', 'chat.editedFiles.groupEdited']);
    expect(findAll(row, 'specorator-edited-files-item--created')).toHaveLength(1);
    expect(findAll(row, 'specorator-edited-files-item--edited')).toHaveLength(1);
  });

  it('renders each row with basename and muted parent dir', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });
    view.render(entries);
    first(row, 'specorator-edited-files-badge').click();

    expect(first(row, 'specorator-edited-files-item-name').textContent).toBe('new.ts');
    expect(first(row, 'specorator-edited-files-item-dir').textContent).toBe('src');
  });

  it('opens the file on row click and closes the popover', () => {
    const row = createMockEl();
    const onOpenFile = jest.fn();
    const view = new EditedFilesView(row, { onOpenFile });
    view.render(entries);
    first(row, 'specorator-edited-files-badge').click();

    first(row, 'specorator-edited-files-item').click();

    expect(onOpenFile).toHaveBeenCalledWith('src/new.ts');
    expect(findAll(row, 'specorator-edited-files-menu')).toHaveLength(0);
    expect(first(row, 'specorator-edited-files-badge').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the popover on outside mousedown', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });
    view.render(entries);
    first(row, 'specorator-edited-files-badge').click();
    expect(findAll(row, 'specorator-edited-files-menu')).toHaveLength(1);

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(findAll(row, 'specorator-edited-files-menu')).toHaveLength(0);
  });

  it('closes the popover on Escape', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });
    view.render(entries);
    first(row, 'specorator-edited-files-badge').click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(findAll(row, 'specorator-edited-files-menu')).toHaveLength(0);
  });

  it('detaches dismissal listeners on destroy', () => {
    const row = createMockEl();
    const view = new EditedFilesView(row, { onOpenFile: jest.fn() });
    view.render(entries);
    first(row, 'specorator-edited-files-badge').click();

    view.destroy();

    expect(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();
    expect(row.children).toHaveLength(0);
  });
});
