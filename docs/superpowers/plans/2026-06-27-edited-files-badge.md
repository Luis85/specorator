# Edited-Files Badge + Floating Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unbounded wrapping edited-files chip strip above the composer with a fixed-height, kind-split badge that expands a floating, grouped popover — so the composer never grows and chat messages stay readable.

**Architecture:** View-layer-only change. `EditedFilesView` is rewritten from a chip strip into a badge toggle + absolutely-positioned popover (`role="menu"`), mirroring the in-house `WorkOrderActivityDropdown` idiom (toggle div + count, custom popover div, re-render on toggle, ARIA wired, document-level click-away/Esc dismissal). Detection (`utils/editedFiles.ts`), `ChatState.editedFiles`, transcript derivation, and the `showAgentEditedFiles` setting are untouched.

**Tech Stack:** TypeScript, Obsidian API (`setIcon`, `createDiv`/`createSpan`/`setText`), modular CSS (`src/style/components/input.css`), i18n (`src/i18n`), Jest + ts-jest (unit), `createMockEl` test helper.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/i18n/types/chat.ts` | Chat translation-key union | Modify: add 4 keys |
| `src/i18n/locales/*.json` (10) | Localized strings | Modify: expand `chat.editedFiles` |
| `src/features/chat/ui/EditedFilesView.ts` | Badge + popover rendering, dismissal | Rewrite |
| `src/style/components/input.css` | Badge/popover styles | Modify: replace `.specorator-edited-file*` block |
| `tests/unit/features/chat/ui/EditedFilesView.test.ts` | View unit tests | Rewrite |

**No changes** to `tabFactory.ts` (row element + classes unchanged), `tabUi.ts` (constructor signature unchanged), `utils/editedFiles.ts`, `ChatState`, or `StreamController`.

---

## Task 1: i18n keys for the badge

**Files:**
- Modify: `src/i18n/types/chat.ts` (near `'chat.editedFiles.label'`, line ~63)
- Modify: `src/i18n/locales/en.json` (`chat.editedFiles`, line ~81) and the other 9 locale files
- Test: `tests/unit/i18n/locales.test.ts` (existing parity test — no edits; must stay green)

- [ ] **Step 1: Add the 4 keys to the type union**

In `src/i18n/types/chat.ts`, replace:

```ts
  // Chat - Files changed by the agent (edited-files strip)
  | 'chat.editedFiles.label'
```

with:

```ts
  // Chat - Files changed by the agent (edited-files badge + popover)
  | 'chat.editedFiles.label'
  | 'chat.editedFiles.created'
  | 'chat.editedFiles.edited'
  | 'chat.editedFiles.groupCreated'
  | 'chat.editedFiles.groupEdited'
```

- [ ] **Step 2: Expand `chat.editedFiles` in `en.json`**

In `src/i18n/locales/en.json`, replace:

```json
    "editedFiles": {
      "label": "Files changed"
    },
```

with:

```json
    "editedFiles": {
      "label": "Files changed",
      "created": "{count} created",
      "edited": "{count} edited",
      "groupCreated": "Created",
      "groupEdited": "Edited"
    },
```

- [ ] **Step 3: Expand `chat.editedFiles` in the other 9 locales**

In each locale file, keep its existing `label` value and add the 4 keys with these translations:

| File | created | edited | groupCreated | groupEdited |
|------|---------|--------|--------------|-------------|
| `de.json` | `"{count} erstellt"` | `"{count} bearbeitet"` | `"Erstellt"` | `"Bearbeitet"` |
| `es.json` | `"{count} creados"` | `"{count} editados"` | `"Creados"` | `"Editados"` |
| `fr.json` | `"{count} créés"` | `"{count} modifiés"` | `"Créés"` | `"Modifiés"` |
| `ja.json` | `"{count} 件作成"` | `"{count} 件編集"` | `"作成"` | `"編集"` |
| `ko.json` | `"{count}개 생성"` | `"{count}개 편집"` | `"생성됨"` | `"편집됨"` |
| `pt.json` | `"{count} criados"` | `"{count} editados"` | `"Criados"` | `"Editados"` |
| `ru.json` | `"{count} создано"` | `"{count} изменено"` | `"Создано"` | `"Изменено"` |
| `zh-CN.json` | `"新建 {count} 个"` | `"编辑 {count} 个"` | `"新建"` | `"编辑"` |
| `zh-TW.json` | `"新增 {count} 個"` | `"編輯 {count} 個"` | `"新增"` | `"編輯"` |

Each file's object becomes (example for `de.json`, preserving its own `label`):

```json
    "editedFiles": {
      "label": "<existing de label, unchanged>",
      "created": "{count} erstellt",
      "edited": "{count} bearbeitet",
      "groupCreated": "Erstellt",
      "groupEdited": "Bearbeitet"
    },
```

- [ ] **Step 4: Run the parity test to verify alignment**

Run: `npm run test -- --selectProjects unit --testPathPattern "i18n/locales"`
Expected: PASS — "keeps every locale structurally aligned with English" stays green (all 10 locales now share the 5 keys).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (the union additions are valid; nothing references missing keys yet).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/types/chat.ts src/i18n/locales/*.json
git commit -m "i18n(chat): add edited-files badge keys (created/edited/group labels)"
```

---

## Task 2: Rewrite `EditedFilesView` as badge + popover (TDD)

**Files:**
- Modify: `src/features/chat/ui/EditedFilesView.ts` (full rewrite)
- Test: `tests/unit/features/chat/ui/EditedFilesView.test.ts` (full rewrite)

- [ ] **Step 1: Write the failing test file**

Replace the entire contents of `tests/unit/features/chat/ui/EditedFilesView.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- --selectProjects unit --testPathPattern "EditedFilesView"`
Expected: FAIL — current `EditedFilesView` renders `specorator-edited-file-chip`, so badge/menu classes are absent.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `src/features/chat/ui/EditedFilesView.ts` with:

```ts
import { setIcon } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type { EditedFileChangeKind, EditedFileEntry } from '../utils/editedFiles';

export interface EditedFilesViewCallbacks {
  /** Opens the clicked file (resolution + error handling owned by the caller). */
  onOpenFile: (path: string) => void;
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

function parentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? '' : normalized.slice(0, slash);
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- --selectProjects unit --testPathPattern "EditedFilesView"`
Expected: PASS — all 10 specs green.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS — no `innerHTML`/`console`, DOM built via `createDiv`/`createSpan`/`setIcon`.

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/ui/EditedFilesView.ts tests/unit/features/chat/ui/EditedFilesView.test.ts
git commit -m "feat(chat): edited-files badge + floating popover (replace chip strip)"
```

---

## Task 3: Swap chip-strip CSS for badge + popover

**Files:**
- Modify: `src/style/components/input.css` (replace the edited-files block, lines ~187-242)

- [ ] **Step 1: Replace the edited-files CSS block**

In `src/style/components/input.css`, replace the entire block from the comment
`/* Edited-files row (files the agent created/edited, above the context row) */`
through the `.specorator-edited-file-chip-name { ... }` rule (the last edited-file
rule before the `/* Composer queue status row ... */` comment) with:

```css
/* Edited-files affordance: a single-line badge above the context row that
   toggles a floating, grouped popover. Fixed badge height keeps the composer
   from growing; the popover floats upward over the messages. */
.specorator-edited-files-row {
  align-items: center;
  flex-shrink: 0;
  padding: 6px 10px 0 10px;
}

.specorator-edited-files {
  position: relative;
  display: inline-flex;
}

.specorator-edited-files-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  font-size: 12px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
}

.specorator-edited-files-badge:hover {
  background: var(--background-modifier-hover);
}

.specorator-edited-files-badge-icon,
.specorator-edited-files-badge-chevron {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.specorator-edited-files-badge-icon svg,
.specorator-edited-files-badge-chevron svg {
  width: 12px;
  height: 12px;
}

.specorator-edited-files-badge-count {
  color: var(--text-normal);
}

.specorator-edited-files-badge-chevron {
  transition: transform 0.12s ease;
}

.specorator-edited-files-badge[aria-expanded='true'] .specorator-edited-files-badge-chevron {
  transform: rotate(180deg);
}

.specorator-edited-files-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 30;
  min-width: 220px;
  max-width: 360px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.specorator-edited-files-group-label {
  padding: 6px 8px 2px 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.specorator-edited-files-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}

.specorator-edited-files-item:hover,
.specorator-edited-files-item:focus {
  background: var(--background-modifier-hover);
  outline: none;
}

.specorator-edited-files-item-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--text-muted);
}

.specorator-edited-files-item-icon svg {
  width: 12px;
  height: 12px;
}

.specorator-edited-files-item--created .specorator-edited-files-item-icon {
  color: var(--text-success);
}

.specorator-edited-files-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-normal);
}

.specorator-edited-files-item-dir {
  margin-left: auto;
  padding-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Build CSS and run the CSS guard**

Run: `npm run build:css && npm run check:css`
Expected: PASS — `styles.css` regenerates; no new `!important` (none added).

- [ ] **Step 3: Commit**

```bash
git add src/style/components/input.css styles.css
git commit -m "style(chat): badge + floating popover styles for edited files"
```

---

## Task 4: Full verification + manual check

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: PASS — all green; build emits `main.js` + `styles.css`.

- [ ] **Step 2: Manual check in Obsidian**

Reload the plugin, open a chat, and run a turn that edits several files (or load a conversation that already did). Verify:
- A single-line badge appears above the composer reading e.g. `3 created · 7 edited` (or just one kind when the other is zero).
- The composer does NOT grow with file count; chat messages above stay readable.
- Clicking the badge opens a popover floating UP over the messages, grouped Created then Edited, each row = icon + basename + muted parent dir, not clipped by the input border.
- Clicking a row opens the file and closes the popover; a since-deleted file shows a Notice.
- Clicking outside or pressing Escape closes the popover.
- Toggling the `showAgentEditedFiles` setting off removes the badge entirely.

> Note: `.specorator-input-wrapper` and `.specorator-input-container` use `overflow: visible`, so the upward popover should not clip. If a theme introduces clipping, raise the popover's `z-index` or set `overflow: visible` on the offending ancestor — do not switch to inline expansion (that reintroduces the composer growth).

- [ ] **Step 3: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "fix(chat): edited-files badge verification follow-ups"
```

---

## Self-Review

**Spec coverage:**
- Badge collapsed, kind-split, graceful single-kind → Task 2 (`badgeLabel`, tests), Task 1 (keys). ✓
- Floating popover, upward, zero layout shift → Task 2 (`renderPopover`), Task 3 (`.specorator-edited-files-menu` absolute `bottom: 100%`, z-index). ✓
- Grouped Created/Edited, row = icon + basename + muted dir → Task 2 (`renderGroup`/`renderRow`), Task 3 (group/item/dir styles). ✓
- Click-away + Esc + listener teardown → Task 2 (`attach/detachDismissListeners`, `destroy`), tests. ✓
- Row click opens + closes popover, re-resolve at click via existing `openEditedFile` → Task 2 (`activate` calls `callbacks.onOpenFile`; resolution stays in `tabUi.openEditedFile`, unchanged). ✓
- Setting unchanged; detection/state unchanged → no tasks touch them (File Structure "No changes"). ✓
- i18n parity across 10 locales → Task 1 + parity test. ✓

**Placeholder scan:** No TBD/TODO; every code/CSS/JSON step shows full content; commands have expected output. ✓

**Type consistency:** `EditedFileChangeKind`/`EditedFileEntry` imported from `utils/editedFiles` (exist, verified). Keys `chat.editedFiles.{created,edited,groupCreated,groupEdited}` defined in Task 1 union before use in Task 2. Classes used in CSS (Task 3) match those emitted by the view (Task 2) and asserted in tests (`badge`, `badge-count`, `badge-chevron`, `menu`, `group-label`, `item`, `item--created`, `item-name`, `item-dir`). Constructor signature `(rowEl, { onOpenFile })` unchanged, so `tabUi.ts` caller stays valid. ✓
