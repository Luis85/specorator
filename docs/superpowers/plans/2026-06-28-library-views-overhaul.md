---
status: open
---


# Library Views Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Agent / Skills / Loops library views a shared search + sort + tag-filter engine, freeform persisted tags, duplicate/clone, cleaner clickable rows, and in-library prompting (skills direct, loops via the model picker seeding a composer draft).

**Architecture:** One content-agnostic `LibraryListController<T>` drives search/sort/filter for all three `ItemView`s. The card scaffold gains an interactive (`role=button`) mode replacing the redundant agent name button. The Quick Actions model picker is generalized to a shared `ModelLaunchModal` + `launchWithModelPicker` seam reused by loops; loops seed the composer via a new `InputController.seedComposerDraft`. Tags persist to agent JSON, loop frontmatter, and `SKILL.md` frontmatter.

**Tech Stack:** TypeScript, Obsidian plugin API, Jest (`npm run test`), the project's `t()` i18n, modular CSS.

**Conventions:**
- Run a single test file with `npm run test -- <path>`.
- After each task: `npm run typecheck && npm run lint && npm run test` before the commit step.
- Match each file's existing import style (`@/…` alias vs relative) — noted per task.
- No `console.*`; no `innerHTML`/`outerHTML`; build DOM with `createEl`/`createDiv`/`createSpan`/`setText`.

---

## Task 1: Shared `LibraryListController` + toolbar

**Files:**
- Create: `src/shared/libraryToolbar.ts`
- Test: `tests/unit/shared/libraryToolbar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shared/libraryToolbar.test.ts
import { LibraryListController, type LibraryItemAccessors } from '@/shared/libraryToolbar';

interface Row { name: string; description: string; tags: string[]; updatedAt: number }

const accessors: LibraryItemAccessors<Row> = {
  getName: (r) => r.name,
  getDescription: (r) => r.description,
  getTags: (r) => r.tags,
  getUpdatedAt: (r) => r.updatedAt,
};

const rows: Row[] = [
  { name: 'Beta', description: 'second', tags: ['x'], updatedAt: 200 },
  { name: 'Alpha', description: 'has KEYWORD', tags: ['y'], updatedAt: 100 },
  { name: 'Gamma', description: 'third', tags: ['x', 'y'], updatedAt: 300 },
];

function make(): LibraryListController<Row> {
  const c = new LibraryListController<Row>(accessors);
  c.setItems(rows);
  return c;
}

describe('LibraryListController', () => {
  it('sorts by name A-Z by default', () => {
    expect(make().apply().map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by updatedAt desc when sort=updated', () => {
    const c = make();
    c.setSort('updated');
    expect(c.apply().map((r) => r.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('search matches name, description, and tags case-insensitively', () => {
    const c = make();
    c.setQuery('keyword');
    expect(c.apply().map((r) => r.name)).toEqual(['Alpha']);
    c.setQuery('GAMMA');
    expect(c.apply().map((r) => r.name)).toEqual(['Gamma']);
    c.setQuery('y'); // tag match
    expect(c.apply().map((r) => r.name).sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('filters with OR semantics across active chips', () => {
    const c = make();
    c.toggleFilter('x');
    expect(c.apply().map((r) => r.name).sort()).toEqual(['Beta', 'Gamma']);
    c.toggleFilter('y'); // x OR y → all three
    expect(c.apply().map((r) => r.name).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    c.clearFilters();
    expect(c.apply()).toHaveLength(3);
  });

  it('allTags returns the sorted union', () => {
    expect(make().allTags()).toEqual(['x', 'y']);
  });

  it('drops active filters whose tag disappears after setItems', () => {
    const c = make();
    c.toggleFilter('x');
    c.setItems([{ name: 'Solo', description: '', tags: ['z'], updatedAt: 1 }]);
    expect(c.activeFilters()).toEqual([]);
    expect(c.apply()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/shared/libraryToolbar.test.ts`
Expected: FAIL — cannot find module `@/shared/libraryToolbar`.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/libraryToolbar.ts
export type LibrarySort = 'name' | 'updated';

export interface LibraryItemAccessors<T> {
  getName(item: T): string;
  getDescription(item: T): string;
  getTags(item: T): string[];
  getUpdatedAt(item: T): number;
}

export interface LibraryToolbarLabels {
  searchPlaceholder: string;
  sortLabel: string;
  sortName: string;
  sortUpdated: string;
  resetFilters: string;
}

/**
 * Content-agnostic search/sort/filter engine shared by the Agent, Skill, and
 * Loop library views. Holds query + sort + active-tag state; `apply()` returns
 * the filtered, sorted view. `renderToolbar` mounts the controls; callers
 * re-render only their list container on change (so the search input keeps focus).
 */
export class LibraryListController<T> {
  private items: T[] = [];
  private query = '';
  private sort: LibrarySort = 'name';
  private readonly active = new Set<string>();

  constructor(private readonly accessors: LibraryItemAccessors<T>) {}

  setItems(items: T[]): void {
    this.items = items;
    const present = new Set(this.allTags());
    for (const tag of [...this.active]) {
      if (!present.has(tag)) this.active.delete(tag);
    }
  }

  setQuery(query: string): void { this.query = query; }
  setSort(sort: LibrarySort): void { this.sort = sort; }
  toggleFilter(tag: string): void {
    if (this.active.has(tag)) this.active.delete(tag);
    else this.active.add(tag);
  }
  clearFilters(): void { this.active.clear(); }
  activeFilters(): string[] { return [...this.active]; }
  totalCount(): number { return this.items.length; }

  /** Sorted union of every tag across the current item set. */
  allTags(): string[] {
    const set = new Set<string>();
    for (const item of this.items) {
      for (const tag of this.accessors.getTags(item)) {
        const trimmed = tag.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  apply(): T[] {
    const q = this.query.trim().toLowerCase();
    const filtered = this.items.filter((item) => {
      if (q) {
        const haystack = [
          this.accessors.getName(item),
          this.accessors.getDescription(item),
          ...this.accessors.getTags(item),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (this.active.size > 0) {
        const tags = this.accessors.getTags(item).map((tag) => tag.trim());
        if (!tags.some((tag) => this.active.has(tag))) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    if (this.sort === 'name') {
      sorted.sort((a, b) => this.accessors.getName(a).localeCompare(this.accessors.getName(b)));
    } else {
      sorted.sort((a, b) => this.accessors.getUpdatedAt(b) - this.accessors.getUpdatedAt(a));
    }
    return sorted;
  }

  /**
   * Mounts search input + sort dropdown + filter-chip row into `host`. Calls
   * `onChange` after any control mutates state. Re-mount (call again) only when
   * the tag universe changes; chip pressed-state updates in place.
   */
  renderToolbar(host: HTMLElement, labels: LibraryToolbarLabels, onChange: () => void): void {
    host.empty();
    host.addClass('specorator-library-toolbar');

    const search = host.createEl('input', {
      cls: 'specorator-library-search',
      type: 'search',
      attr: { placeholder: labels.searchPlaceholder, 'aria-label': labels.searchPlaceholder },
    });
    search.value = this.query;
    search.addEventListener('input', () => { this.setQuery(search.value); onChange(); });

    const sort = host.createEl('select', {
      cls: 'specorator-library-sort dropdown',
      attr: { 'aria-label': labels.sortLabel },
    });
    sort.createEl('option', { value: 'name', text: labels.sortName });
    sort.createEl('option', { value: 'updated', text: labels.sortUpdated });
    sort.value = this.sort;
    sort.addEventListener('change', () => { this.setSort(sort.value as LibrarySort); onChange(); });

    const tags = this.allTags();
    if (tags.length === 0) return;

    const chips = host.createDiv({ cls: 'specorator-library-filterchips' });
    const reset = chips.createEl('button', { cls: 'specorator-library-filterreset', text: labels.resetFilters });
    const syncReset = (): void => { reset.toggleClass('is-hidden', this.active.size === 0); };
    reset.addEventListener('click', () => { this.clearFilters(); refreshAll(); onChange(); });

    const chipEls: Array<{ tag: string; el: HTMLElement }> = [];
    for (const tag of tags) {
      const chip = chips.createEl('button', { cls: 'specorator-library-filterchip', text: tag });
      chip.addEventListener('click', () => { this.toggleFilter(tag); refreshAll(); onChange(); });
      chipEls.push({ tag, el: chip });
    }
    const refreshAll = (): void => {
      for (const { tag, el } of chipEls) {
        const on = this.active.has(tag);
        el.toggleClass('is-on', on);
        el.setAttribute('aria-pressed', String(on));
      }
      syncReset();
    };
    refreshAll();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/shared/libraryToolbar.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/libraryToolbar.ts tests/unit/shared/libraryToolbar.test.ts
git commit -m "feat(library): shared search/sort/filter list controller"
```

---

## Task 2: Toolbar slot + interactive card option

**Files:**
- Modify: `src/utils/libraryView.ts`
- Test: `tests/unit/utils/libraryView.test.ts` (add cases; create file if absent)

This task is **additive** — `nameAsButton` stays until Task 13 removes its last user.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/utils/libraryView.test.ts
import { createLibraryCard, renderLibraryShell } from '@/utils/libraryView';

describe('renderLibraryShell', () => {
  it('returns a toolbar slot between header and list', () => {
    const root = document.createElement('div');
    const { actions, toolbar, list } = renderLibraryShell(root, 'Title');
    expect(actions).toBeTruthy();
    expect(toolbar).toBeTruthy();
    expect(list).toBeTruthy();
    // toolbar precedes list in DOM order
    expect(toolbar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('createLibraryCard interactive', () => {
  it('makes the card a role=button that activates on click and Enter', () => {
    const list = document.createElement('div');
    let activations = 0;
    const { card } = createLibraryCard(list, 'X', {
      interactive: { onActivate: () => { activations += 1; }, ariaLabel: 'X' },
    });
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
    card.dispatchEvent(new MouseEvent('click'));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(activations).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/utils/libraryView.test.ts`
Expected: FAIL — `toolbar` is undefined / `interactive` not handled.

- [ ] **Step 3: Update `renderLibraryShell` to add the toolbar slot**

In `src/utils/libraryView.ts`, replace the body of `renderLibraryShell` and its return type:

```ts
export function renderLibraryShell(
  contentEl: HTMLElement,
  title: string,
  renderNav?: (container: HTMLElement) => void,
): { actions: HTMLElement; toolbar: HTMLElement; list: HTMLElement } {
  contentEl.empty();
  contentEl.addClass('specorator-library');
  renderNav?.(contentEl);
  const header = contentEl.createDiv({ cls: 'specorator-library-header' });
  header.createEl('h2', { text: title });
  const actions = header.createDiv({ cls: 'specorator-library-header-actions' });
  const toolbar = contentEl.createDiv({ cls: 'specorator-library-toolbar-slot' });
  const list = contentEl.createDiv({ cls: 'specorator-library-list' });
  return { actions, toolbar, list };
}
```

- [ ] **Step 4: Add the `interactive` option to `createLibraryCard`**

In `LibraryCardOptions` add:

```ts
  /**
   * Makes the whole card a focusable `role=button` that fires `onActivate` on
   * click and Enter/Space. Replaces the old `nameAsButton` open affordance while
   * preserving keyboard/SR operability. Nested action buttons must call
   * `stopPropagation`.
   */
  interactive?: { onActivate: () => void; ariaLabel: string };
```

In `createLibraryCard`, immediately after `const card = list.createDiv(...)`:

```ts
  if (opts?.interactive) {
    const { onActivate, ariaLabel } = opts.interactive;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', ariaLabel);
    card.addEventListener('click', () => onActivate());
    card.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    });
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/unit/utils/libraryView.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify existing callers still compile**

Run: `npm run typecheck`
Expected: PASS (toolbar is a new return field; existing `{ actions, list }` destructures ignore it).

- [ ] **Step 7: Commit**

```bash
git add src/utils/libraryView.ts tests/unit/utils/libraryView.test.ts
git commit -m "feat(library): toolbar slot + interactive card option"
```

---

## Task 3: `InputController.seedComposerDraft`

**Files:**
- Modify: `src/features/chat/controllers/InputController.ts`
- Test: `tests/unit/features/chat/controllers/inputControllerSeedDraft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/chat/controllers/inputControllerSeedDraft.test.ts
import { InputController } from '@/features/chat/controllers/InputController';

describe('InputController.seedComposerDraft', () => {
  it('sets the composer value and fires input without sending', () => {
    const el = document.createElement('textarea');
    let inputs = 0;
    el.addEventListener('input', () => { inputs += 1; });

    // Exercise the method in isolation: it only touches deps.getInputEl().
    const controller = Object.create(InputController.prototype) as InputController;
    (controller as unknown as { deps: { getInputEl(): HTMLTextAreaElement } }).deps = {
      getInputEl: () => el,
    };

    controller.seedComposerDraft('hello world');

    expect(el.value).toBe('hello world');
    expect(inputs).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/features/chat/controllers/inputControllerSeedDraft.test.ts`
Expected: FAIL — `seedComposerDraft` is not a function.

- [ ] **Step 3: Add the public method and refactor `autoResumeWith`**

In `src/features/chat/controllers/InputController.ts`, add a public method (place it just above the private `autoResumeWith`):

```ts
  /**
   * Seeds the composer with draft text WITHOUT sending. Used by the library
   * "prompt as draft" flows (loops) so the user can append a task before
   * sending. Fires an `input` event so autosize/validation update.
   */
  seedComposerDraft(content: string): void {
    const el = this.deps.getInputEl();
    el.value = content;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
```

Then change `autoResumeWith` to reuse it:

```ts
  private autoResumeWith(content: string): void {
    this.seedComposerDraft(content);
    this.sendMessage().catch((err: unknown) => {
      this.deps.plugin.logger.scope('input').error('sendMessage failed unexpectedly', err);
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/unit/features/chat/controllers/inputControllerSeedDraft.test.ts`
Expected: PASS.
Run: `npm run test -- --selectProjects unit -t "InputController"`
Expected: PASS (existing InputController tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/controllers/InputController.ts tests/unit/features/chat/controllers/inputControllerSeedDraft.test.ts
git commit -m "feat(chat): InputController.seedComposerDraft for draft prefill"
```

---

## Task 4: Generalize the model picker to `ModelLaunchModal`

**Files:**
- Create: `src/shared/modals/ModelLaunchModal.ts`
- Modify: `src/features/quickActions/ui/QuickActionLaunchModal.ts`
- Test: `tests/unit/shared/modals/modelLaunchModal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shared/modals/modelLaunchModal.test.ts
import { ModelLaunchModal } from '@/shared/modals/ModelLaunchModal';

function fakeApp() { return {} as never; }

describe('ModelLaunchModal', () => {
  it('confirms the selected provider+model and closes', () => {
    let confirmed: { providerId: string; model: string } | null = null;
    const modal = new ModelLaunchModal({
      app: fakeApp(),
      title: 'Pick a model',
      presetProviderId: 'claude',
      presetModel: 'sonnet',
      enabledProviders: [
        { id: 'claude', displayName: 'Claude', models: [{ value: 'sonnet', label: 'Sonnet' }, { value: 'opus', label: 'Opus' }] },
      ],
      resolveDefaultModelForProvider: () => 'sonnet',
      onConfirm: (c) => { confirmed = c; },
    });
    modal.onOpen();
    const run = modal.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-run"]');
    run?.click();
    expect(confirmed).toEqual({ providerId: 'claude', model: 'sonnet' });
  });

  it('sets the title from options', () => {
    const modal = new ModelLaunchModal({
      app: fakeApp(), title: 'Custom Title', presetProviderId: 'claude', presetModel: 'sonnet',
      enabledProviders: [{ id: 'claude', displayName: 'Claude', models: [{ value: 'sonnet', label: 'Sonnet' }] }],
      resolveDefaultModelForProvider: () => 'sonnet', onConfirm: () => {},
    });
    modal.onOpen();
    expect(modal.titleEl.textContent).toBe('Custom Title');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/shared/modals/modelLaunchModal.test.ts`
Expected: FAIL — cannot find module `@/shared/modals/ModelLaunchModal`.

- [ ] **Step 3: Create `ModelLaunchModal`**

Copy the current `QuickActionLaunchModal` implementation into the new file, swapping the `action: QuickAction` coupling for `title: string`. Keep the `qa-*` `data-testid`s so existing Quick Actions tests stay green.

```ts
// src/shared/modals/ModelLaunchModal.ts
import { type App, Modal } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { t } from '@/i18n/i18n';

export interface ModelLaunchModelOption { value: string; label: string }

export interface ModelLaunchProvider {
  id: ProviderId;
  displayName: string;
  models: ModelLaunchModelOption[];
}

export interface ModelLaunchModalOptions {
  app: App;
  title: string;
  presetProviderId: ProviderId;
  presetModel: string;
  enabledProviders: ModelLaunchProvider[];
  resolveDefaultModelForProvider: (providerId: ProviderId) => string;
  fallbackNotice?: { storedProviderLabel: string; storedModelLabel: string };
  onConfirm: (choice: { providerId: ProviderId; model: string }) => void;
}

/**
 * Content-agnostic provider+model confirmation modal. Forces the user to confirm
 * provider+model before a prompt dispatches from outside an active chat tab.
 * Generalized from the original quick-action launch modal; reused by quick
 * actions and loop prompting.
 */
export class ModelLaunchModal extends Modal {
  private readonly options: ModelLaunchModalOptions;
  private providerSelect: HTMLSelectElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;

  constructor(options: ModelLaunchModalOptions) {
    super(options.app);
    this.options = options;
  }

  onOpen(): void {
    this.modalEl?.addClass?.('specorator-qa-launch-modal');
    const root = this.contentEl;
    root.empty();

    this.scope?.register?.([], 'Enter', (event) => {
      if (this.options.enabledProviders.length === 0) return;
      event.preventDefault();
      this.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-run"]')?.click();
    });

    this.titleEl.setText(this.options.title);

    if (this.options.fallbackNotice) {
      const notice = root.createDiv({
        cls: 'specorator-qa-launch-notice',
        attr: { 'data-testid': 'qa-fallback-notice', role: 'alert' },
      });
      notice.setText(t('quickActions.launchModal.fallbackNotice', {
        provider: this.options.fallbackNotice.storedProviderLabel,
        model: this.options.fallbackNotice.storedModelLabel,
      }));
    }

    if (this.options.enabledProviders.length === 0) {
      const emptyId = 'specorator-qa-empty-' + Math.random().toString(36).slice(2, 9);
      const empty = root.createDiv({
        cls: 'specorator-qa-launch-empty',
        attr: { id: emptyId, 'data-testid': 'qa-empty', 'aria-live': 'polite' },
      });
      empty.setText(t('quickActions.launchModal.noProvidersEnabled'));
      this.renderActions(root, true, emptyId);
      return;
    }

    this.renderProviderRow(root);
    this.renderModelRow(root);
    this.renderActions(root, false);
    this.contentEl.querySelector<HTMLButtonElement>('[data-testid="qa-run"]')?.focus();
  }

  onClose(): void {
    this.modalEl?.removeClass?.('specorator-qa-launch-modal');
    this.contentEl.empty();
    this.providerSelect = null;
    this.modelSelect = null;
  }

  private renderProviderRow(root: HTMLElement): void {
    const selectId = 'specorator-qa-provider-' + Math.random().toString(36).slice(2, 9);
    const row = root.createDiv({ cls: 'specorator-qa-launch-row' });
    row.createEl('label', { text: t('quickActions.launchModal.providerLabel'), attr: { for: selectId } });
    const select = row.createEl('select', { attr: { id: selectId, 'data-testid': 'qa-provider' } });
    for (const provider of this.options.enabledProviders) {
      const opt = select.createEl('option', { text: provider.displayName });
      opt.value = provider.id;
      if (provider.id === this.options.presetProviderId) opt.selected = true;
    }
    select.addEventListener('change', () => {
      const next = select.value;
      this.renderModelOptions(next, this.options.resolveDefaultModelForProvider(next));
      this.modelSelect?.focus();
    });
    this.providerSelect = select;
  }

  private renderModelRow(root: HTMLElement): void {
    const selectId = 'specorator-qa-model-' + Math.random().toString(36).slice(2, 9);
    const row = root.createDiv({ cls: 'specorator-qa-launch-row' });
    row.createEl('label', { text: t('quickActions.launchModal.modelLabel'), attr: { for: selectId } });
    const select = row.createEl('select', { attr: { id: selectId, 'data-testid': 'qa-model' } });
    this.modelSelect = select;
    this.renderModelOptions(this.options.presetProviderId, this.options.presetModel);
  }

  private renderModelOptions(providerId: ProviderId, selectedValue: string): void {
    if (!this.modelSelect) return;
    this.modelSelect.empty();
    const models = this.options.enabledProviders.find((p) => p.id === providerId)?.models ?? [];
    for (const model of models) {
      const opt = this.modelSelect.createEl('option', { text: model.label });
      opt.value = model.value;
      if (model.value === selectedValue) opt.selected = true;
    }
    if (this.modelSelect.value !== selectedValue && models.length > 0) {
      this.modelSelect.value = models[0].value;
    }
  }

  private renderActions(root: HTMLElement, runDisabled: boolean, describedById?: string): void {
    const actions = root.createDiv({ cls: 'specorator-qa-launch-actions' });
    const cancel = actions.createEl('button', {
      text: t('quickActions.launchModal.cancelButton'),
      attr: { 'data-testid': 'qa-cancel' },
    });
    cancel.addEventListener('click', () => this.close());

    const run = actions.createEl('button', {
      text: t('quickActions.launchModal.runButton'),
      attr: { 'data-testid': 'qa-run' },
    });
    run.addClass('mod-cta');
    run.disabled = runDisabled;
    if (runDisabled && describedById) run.setAttribute('aria-describedby', describedById);
    run.addEventListener('click', () => {
      if (!this.providerSelect || !this.modelSelect) return;
      this.options.onConfirm({ providerId: this.providerSelect.value, model: this.modelSelect.value });
      this.close();
    });
  }
}
```

- [ ] **Step 4: Reimplement `QuickActionLaunchModal` as a thin subclass**

Replace the body of `src/features/quickActions/ui/QuickActionLaunchModal.ts` with:

```ts
import type { App } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { t } from '@/i18n/i18n';
import {
  ModelLaunchModal,
  type ModelLaunchModelOption,
  type ModelLaunchProvider,
} from '@/shared/modals/ModelLaunchModal';

import type { QuickAction } from '../types';

// Back-compat re-exports for existing importers/tests.
export type QuickActionLaunchModelOption = ModelLaunchModelOption;
export type QuickActionLaunchProvider = ModelLaunchProvider;

export interface QuickActionLaunchModalOptions {
  app: App;
  action: QuickAction;
  presetProviderId: ProviderId;
  presetModel: string;
  enabledProviders: ModelLaunchProvider[];
  resolveDefaultModelForProvider: (providerId: ProviderId) => string;
  fallbackNotice?: { storedProviderLabel: string; storedModelLabel: string };
  onConfirm: (choice: { providerId: ProviderId; model: string }) => void;
}

/** Quick-action-flavored launch modal: derives the title from the action name. */
export class QuickActionLaunchModal extends ModelLaunchModal {
  constructor(options: QuickActionLaunchModalOptions) {
    const rawName = options.action.name?.trim();
    const name = rawName && rawName.length > 0 ? rawName : t('quickActions.launchModal.untitledFallback');
    super({ ...options, title: t('quickActions.launchModal.title', { name }) });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/unit/shared/modals/modelLaunchModal.test.ts`
Expected: PASS.
Run: `npm run test -- --selectProjects unit -t "QuickActionLaunchModal"`
Expected: PASS (existing modal tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/shared/modals/ModelLaunchModal.ts src/features/quickActions/ui/QuickActionLaunchModal.ts tests/unit/shared/modals/modelLaunchModal.test.ts
git commit -m "refactor(library): generalize QuickActionLaunchModal into ModelLaunchModal"
```

---

## Task 5: Extract `launchWithModelPicker`

**Files:**
- Create: `src/shared/launchWithModelPicker.ts`
- Modify: `src/features/quickActions/launchQuickAction.ts`
- Test: `tests/unit/shared/launchWithModelPicker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shared/launchWithModelPicker.test.ts
import { launchWithModelPicker } from '@/shared/launchWithModelPicker';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';

jest.mock('@/shared/modals/ModelLaunchModal', () => {
  return {
    ModelLaunchModal: class {
      constructor(public options: { onConfirm: (c: { providerId: string; model: string }) => void }) {}
      open(): void {
        // Simulate the user confirming the preset immediately.
        this.options.onConfirm({ providerId: 'claude', model: 'sonnet' });
      }
    },
  };
});

describe('launchWithModelPicker', () => {
  it('persists the confirmed choice under the given key and invokes onConfirm', () => {
    const set = jest.fn();
    const plugin = {
      app: {},
      settings: { providers: { claude: { enabled: true } } },
      quickActionLastUsedStore: { get: () => null, set, delete: jest.fn() },
    } as never;

    jest.spyOn(ProviderRegistry, 'isEnabled').mockReturnValue(true);
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
    jest.spyOn(ProviderRegistry, 'getChatUIConfig').mockReturnValue({
      getModelOptions: () => [{ value: 'sonnet', label: 'Sonnet' }],
    } as never);
    jest.spyOn(ProviderRegistry, 'getProviderDisplayName').mockReturnValue('Claude');
    jest.spyOn(ProviderRegistry, 'resolveSettingsProviderId').mockReturnValue('claude');

    let confirmed: { providerId: string; model: string } | null = null;
    launchWithModelPicker(plugin, {
      lastUsedKey: 'loop:my-loop',
      title: 'Prompt with loop',
      onConfirm: (c) => { confirmed = c; },
    });

    expect(confirmed).toEqual({ providerId: 'claude', model: 'sonnet' });
    expect(set).toHaveBeenCalledWith('loop:my-loop', { providerId: 'claude', model: 'sonnet' });
  });
});
```

> Note: `resolveBlankTabModel` is imported by the implementation; the test's mocked model options make the preset valid so the stored path is not exercised. If the implementation calls `resolveBlankTabModel`, add `jest.mock('@/features/chat/tabs/tabShared', () => ({ resolveBlankTabModel: () => 'sonnet' }))` at the top of the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/shared/launchWithModelPicker.test.ts`
Expected: FAIL — cannot find module `@/shared/launchWithModelPicker`.

- [ ] **Step 3: Create the shared seam**

```ts
// src/shared/launchWithModelPicker.ts
import { Notice } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderId } from '@/core/providers/types';
import { asSettingsBag } from '@/core/types/settings';
import { resolveBlankTabModel } from '@/features/chat/tabs/tabShared';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';
import { ModelLaunchModal, type ModelLaunchProvider } from '@/shared/modals/ModelLaunchModal';

export interface ModelPickerLaunch {
  /** Persistence key for the last-used provider/model memo. */
  lastUsedKey: string;
  /** Modal title (already composed by the caller). */
  title: string;
  onConfirm: (choice: { providerId: ProviderId; model: string }) => void;
}

/**
 * Resolve the preset (stored last-used or global default), validate it against
 * the currently enabled providers + their model catalog, open the model picker,
 * persist the confirmed choice, and invoke `onConfirm`. The single seam reused
 * by quick actions and loop prompting.
 */
export function launchWithModelPicker(plugin: SpecoratorPlugin, launch: ModelPickerLaunch): void {
  const settings = asSettingsBag(plugin.settings);
  const enabledProviders = buildEnabledProviders(settings);
  const enabledIds = new Set(enabledProviders.map((p) => p.id));
  const stored = plugin.quickActionLastUsedStore?.get(launch.lastUsedKey) ?? null;

  let presetProviderId: ProviderId;
  let presetModel: string;
  let fallbackNotice: { storedProviderLabel: string; storedModelLabel: string } | undefined;

  const storedIsValid = !!stored
    && enabledIds.has(stored.providerId)
    && !!enabledProviders.find((p) => p.id === stored.providerId)?.models.some((m) => m.value === stored.model);

  if (stored && storedIsValid) {
    presetProviderId = stored.providerId;
    presetModel = stored.model;
  } else {
    presetProviderId = ProviderRegistry.resolveSettingsProviderId(settings);
    presetModel = resolveBlankTabModel(plugin, presetProviderId);
    if (stored) {
      fallbackNotice = {
        storedProviderLabel: resolveProviderLabel(stored.providerId),
        storedModelLabel: resolveModelLabel(stored.providerId, stored.model, settings),
      };
      plugin.quickActionLastUsedStore?.delete(launch.lastUsedKey);
    }
  }

  new ModelLaunchModal({
    app: plugin.app,
    title: launch.title,
    presetProviderId,
    presetModel,
    enabledProviders,
    resolveDefaultModelForProvider: (providerId) => resolveBlankTabModel(plugin, providerId),
    fallbackNotice,
    onConfirm: (choice) => {
      if (!ProviderRegistry.isEnabled(choice.providerId, settings)) {
        new Notice(t('quickActions.launchModal.providerDisabled'));
        return;
      }
      plugin.quickActionLastUsedStore?.set(launch.lastUsedKey, choice);
      launch.onConfirm(choice);
    },
  }).open();
}

function buildEnabledProviders(settings: Record<string, unknown>): ModelLaunchProvider[] {
  const out: ModelLaunchProvider[] = [];
  for (const id of ProviderRegistry.getRegisteredProviderIds()) {
    if (!ProviderRegistry.isEnabled(id, settings)) continue;
    const models = ProviderRegistry.getChatUIConfig(id)
      .getModelOptions(settings)
      .map((opt) => ({ value: opt.value, label: opt.label }));
    out.push({ id, displayName: ProviderRegistry.getProviderDisplayName(id), models });
  }
  return out;
}

function resolveProviderLabel(providerId: ProviderId): string {
  try {
    return ProviderRegistry.getProviderDisplayName(providerId);
  } catch {
    return providerId;
  }
}

function resolveModelLabel(providerId: ProviderId, model: string, settings: Record<string, unknown>): string {
  try {
    const found = ProviderRegistry.getChatUIConfig(providerId).getModelOptions(settings).find((o) => o.value === model);
    if (found) return found.label;
  } catch { /* provider may no longer be registered */ }
  return model;
}
```

- [ ] **Step 4: Refactor `launchQuickAction` to use the seam**

Replace the body of `src/features/quickActions/launchQuickAction.ts` with:

```ts
import { type TAbstractFile } from 'obsidian';

import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';
import { launchWithModelPicker } from '@/shared/launchWithModelPicker';

import { quickActionStemFromPath } from './quickActionStem';
import { runQuickActionForFile } from './runQuickActionForFile';
import type { QuickAction } from './types';

/**
 * Single seam invoked by every non-chat quick-action entry point. Delegates the
 * provider/model preset + picker + persist dance to `launchWithModelPicker`,
 * keyed by the quick-action stem (bare key preserved for back-compat), then
 * dispatches via `runQuickActionForFile`.
 */
export async function launchQuickAction(
  plugin: SpecoratorPlugin,
  file: TAbstractFile,
  action: QuickAction,
): Promise<void> {
  const stem = quickActionStemFromPath(action.filePath);
  const rawName = action.name?.trim();
  const name = rawName && rawName.length > 0 ? rawName : t('quickActions.launchModal.untitledFallback');
  launchWithModelPicker(plugin, {
    lastUsedKey: stem,
    title: t('quickActions.launchModal.title', { name }),
    onConfirm: (choice) => void runQuickActionForFile(plugin, file, action, choice),
  });
}
```

> The quick-action `lastUsedKey` stays the bare `stem` (not `qa:<stem>`) so existing persisted last-used entries survive. Loops use a `loop:<id>` prefix; the two never collide (a quick-action stem cannot contain a colon).

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/unit/shared/launchWithModelPicker.test.ts`
Expected: PASS.
Run: `npm run test -- --selectProjects unit -t "launchQuickAction"`
Expected: PASS (behavior preserved).

- [ ] **Step 6: Commit**

```bash
git add src/shared/launchWithModelPicker.ts src/features/quickActions/launchQuickAction.ts tests/unit/shared/launchWithModelPicker.test.ts
git commit -m "refactor(library): extract launchWithModelPicker seam"
```

---

## Task 6: Extract `resolveOverrideTargetTab`

**Files:**
- Create: `src/features/chat/tabs/resolveOverrideTargetTab.ts`
- Modify: `src/features/quickActions/runQuickActionForFile.ts`
- Test: `tests/unit/features/chat/tabs/resolveOverrideTargetTab.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/chat/tabs/resolveOverrideTargetTab.test.ts
import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';

jest.mock('@/features/chat/tabs/providerResolution', () => ({ getTabProviderId: () => 'claude' }));
jest.mock('@/features/chat/tabs/tabShared', () => ({ resolveBlankTabModel: () => 'sonnet' }));

function tabManager(opts: { active?: unknown; canCreate?: boolean; created?: unknown }) {
  return {
    getActiveTab: () => opts.active ?? null,
    canCreateTab: () => opts.canCreate ?? true,
    createTab: jest.fn(async () => opts.created ?? { id: 'new' }),
  } as never;
}

describe('resolveOverrideTargetTab', () => {
  it('reuses a blank active tab whose provider+model match the override', async () => {
    const active = { id: 'a', lifecycleState: 'blank', pinnedModel: 'sonnet' };
    const tm = tabManager({ active });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(active);
  });

  it('creates a pinned tab when the override model differs', async () => {
    const active = { id: 'a', lifecycleState: 'blank', pinnedModel: 'haiku' };
    const created = { id: 'new' };
    const tm = tabManager({ active, created });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(created);
    expect(tm.createTab).toHaveBeenCalledWith(null, undefined, {
      activate: false, defaultProviderId: 'claude', pinnedModel: 'sonnet',
    });
  });

  it('returns null when at the tab limit', async () => {
    const tm = tabManager({ active: null, canCreate: false });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/features/chat/tabs/resolveOverrideTargetTab.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the helper (moving the logic out of `runQuickActionForFile`)**

```ts
// src/features/chat/tabs/resolveOverrideTargetTab.ts
import type { ProviderId } from '@/core/providers/types';
import type SpecoratorPlugin from '@/main';

import { getTabProviderId } from './providerResolution';
import { resolveBlankTabModel } from './tabShared';
import type { TabData } from './types';
import type { TabManager } from './TabManager';

export interface TabModelOverride { providerId: ProviderId; model: string }

function resolveActiveBlankTabModel(
  tab: Pick<TabData, 'pinnedModel' | 'draftModel'>,
  plugin: SpecoratorPlugin,
  providerId: ProviderId,
): string {
  if (typeof tab.pinnedModel === 'string' && tab.pinnedModel.trim()) return tab.pinnedModel.trim();
  if (typeof tab.draftModel === 'string' && tab.draftModel.trim()) return tab.draftModel.trim();
  return resolveBlankTabModel(plugin, providerId);
}

/**
 * Resolve the tab a provider+model override should target. Reuses the active
 * blank tab only when BOTH its provider and effective model match the override
 * (`switchToTab` carries no model, so a mismatched pinned tab would silently
 * drop the picked model); otherwise creates a fresh tab pinned to the override.
 * Returns null at the tab limit. With no override, reuses any blank active tab.
 */
export async function resolveOverrideTargetTab(
  plugin: SpecoratorPlugin,
  tabManager: TabManager,
  override?: TabModelOverride,
): Promise<TabData | null> {
  const activeTab = tabManager.getActiveTab();
  const isBlank = activeTab?.lifecycleState === 'blank';
  const overrideMatchesActive = override !== undefined && isBlank && activeTab
    ? getTabProviderId(activeTab, plugin) === override.providerId
      && resolveActiveBlankTabModel(activeTab, plugin, override.providerId) === override.model
    : false;

  if (override === undefined && isBlank && activeTab) return activeTab;
  if (overrideMatchesActive && activeTab) return activeTab;
  if (tabManager.canCreateTab()) {
    const created = await tabManager.createTab(null, undefined, {
      activate: false,
      ...(override !== undefined
        ? { defaultProviderId: override.providerId, pinnedModel: override.model }
        : {}),
    });
    return created ?? null;
  }
  return null;
}
```

- [ ] **Step 4: Refactor `runQuickActionForFile` to use it**

In `src/features/quickActions/runQuickActionForFile.ts`:
- Delete the local `resolveActiveBlankTabModel` function and the inline tab-resolution block (lines computing `overrideMatchesActive` … assigning `targetTab`).
- Add import: `import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';`
- Replace the resolution block with:

```ts
  const targetTab = await resolveOverrideTargetTab(plugin, tabManager, override);
  if (!targetTab) {
    new Notice(t('quickActions.contextMenu.tabLimitReached'));
    return;
  }
```

Keep the subsequent `switchToTab` → attach-pill → `dispatchQuickActionToTab` unchanged. Remove the now-unused `getTabProviderId` / `resolveBlankTabModel` imports if they are no longer referenced (run lint to confirm).

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/unit/features/chat/tabs/resolveOverrideTargetTab.test.ts`
Expected: PASS.
Run: `npm run test -- --selectProjects unit -t "runQuickActionForFile"`
Expected: PASS (behavior identical).

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/tabs/resolveOverrideTargetTab.ts src/features/quickActions/runQuickActionForFile.ts tests/unit/features/chat/tabs/resolveOverrideTargetTab.test.ts
git commit -m "refactor(chat): extract resolveOverrideTargetTab"
```

---

## Task 7: Loop prompt text + `launchLoopPrompt`

**Files:**
- Create: `src/features/tasks/loops/renderLoopPromptText.ts`
- Create: `src/features/tasks/loops/launchLoopPrompt.ts`
- Test: `tests/unit/features/tasks/loops/renderLoopPromptText.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/loops/renderLoopPromptText.test.ts
import { renderLoopPromptText } from '@/features/tasks/loops/renderLoopPromptText';
import type { LoopDefinition } from '@/features/tasks/loops/loopTypes';

const loop: LoopDefinition = {
  path: 'x.md', id: 'tdd', name: 'TDD',
  useWhen: 'when building features', approach: 'red-green', steps: '1. test', verify: 'all green', notes: 'be honest',
};

describe('renderLoopPromptText', () => {
  it('includes Approach/Steps/Verify/Notes and the loop name', () => {
    const out = renderLoopPromptText(loop);
    expect(out).toContain('## Loop: TDD');
    expect(out).toContain('### Approach');
    expect(out).toContain('red-green');
    expect(out).toContain('### Steps');
    expect(out).toContain('### Verify');
    expect(out).toContain('### Notes');
  });

  it('never includes the Use-when guidance', () => {
    expect(renderLoopPromptText(loop)).not.toContain('when building features');
  });

  it('omits empty sections', () => {
    const out = renderLoopPromptText({ ...loop, notes: '', verify: '' });
    expect(out).not.toContain('### Notes');
    expect(out).not.toContain('### Verify');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/loops/renderLoopPromptText.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `renderLoopPromptText`**

```ts
// src/features/tasks/loops/renderLoopPromptText.ts
import type { LoopDefinition } from './loopTypes';

/**
 * Render a loop as standalone playbook prompt text for seeding the composer.
 * Mirrors the work-order loop block (Approach / Steps / Verify / Notes — never
 * `useWhen`, which is selection-only) but without work-order framing: the user
 * appends their task before sending.
 */
export function renderLoopPromptText(loop: LoopDefinition): string {
  const parts: string[] = [
    `## Loop: ${loop.name}`,
    'Follow this loop: apply its approach, work the steps, and satisfy its verify condition.',
  ];
  const sub = (heading: string, value: string): void => {
    const trimmed = value.trim();
    if (trimmed) parts.push(`\n### ${heading}\n${trimmed}`);
  };
  sub('Approach', loop.approach);
  sub('Steps', loop.steps);
  sub('Verify', loop.verify);
  sub('Notes', loop.notes);
  return parts.join('\n');
}
```

- [ ] **Step 4: Create `launchLoopPrompt`**

```ts
// src/features/tasks/loops/launchLoopPrompt.ts
import { Notice } from 'obsidian';

import type { ProviderId } from '@/core/providers/types';
import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';
import { launchWithModelPicker } from '@/shared/launchWithModelPicker';

import type { LoopDefinition } from './loopTypes';
import { renderLoopPromptText } from './renderLoopPromptText';

/**
 * Prompt a loop from the library: open the provider+model picker, then on
 * confirm resolve a tab pinned to the chosen model and SEED the loop body into
 * its composer as a draft (no auto-send). The user appends their task and sends.
 */
export function launchLoopPrompt(plugin: SpecoratorPlugin, loop: LoopDefinition): void {
  launchWithModelPicker(plugin, {
    lastUsedKey: `loop:${loop.id}`,
    title: t('loopLibrary.promptTitle', { name: loop.name }),
    onConfirm: (choice) => void seedLoopDraft(plugin, loop, choice.providerId, choice.model),
  });
}

async function seedLoopDraft(
  plugin: SpecoratorPlugin,
  loop: LoopDefinition,
  providerId: ProviderId,
  model: string,
): Promise<void> {
  let view = plugin.getView();
  if (!view) {
    await plugin.activateView();
    view = plugin.getView();
  }
  if (!view) return;

  const tabManager = view.getTabManager();
  if (!tabManager) return;

  const target = await resolveOverrideTargetTab(plugin, tabManager, { providerId, model });
  if (!target) {
    new Notice(t('quickActions.contextMenu.tabLimitReached'));
    return;
  }

  await tabManager.switchToTab(target.id);
  target.controllers.inputController?.seedComposerDraft(renderLoopPromptText(loop));
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- tests/unit/features/tasks/loops/renderLoopPromptText.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS (`launchLoopPrompt` wires existing seams).

- [ ] **Step 6: Commit**

```bash
git add src/features/tasks/loops/renderLoopPromptText.ts src/features/tasks/loops/launchLoopPrompt.ts tests/unit/features/tasks/loops/renderLoopPromptText.test.ts
git commit -m "feat(loops): launchLoopPrompt seeds loop body as composer draft"
```

---

## Task 8: `setFrontmatterList` helper

**Files:**
- Modify: `src/utils/frontmatter.ts`
- Test: `tests/unit/utils/setFrontmatterList.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/utils/setFrontmatterList.test.ts
import { setFrontmatterList, extractStringArray, parseFrontmatter } from '@/utils/frontmatter';

function tagsOf(content: string): string[] | undefined {
  const parsed = parseFrontmatter(content);
  return parsed ? extractStringArray(parsed.frontmatter, 'tags') : undefined;
}

describe('setFrontmatterList', () => {
  it('inserts a new key when absent', () => {
    const src = `---\ndescription: hi\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', ['a', 'b']);
    expect(tagsOf(out)).toEqual(['a', 'b']);
    expect(out).toContain('Body');
  });

  it('replaces an existing flow-list key', () => {
    const src = `---\ntags: [old]\ndescription: hi\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', ['new']);
    expect(tagsOf(out)).toEqual(['new']);
    expect(out).toContain('description: hi');
  });

  it('replaces an existing block-list key', () => {
    const src = `---\ntags:\n  - old1\n  - old2\nname: x\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', ['new']);
    expect(tagsOf(out)).toEqual(['new']);
    expect(out).toContain('name: x');
  });

  it('removes the key when values is empty', () => {
    const src = `---\ntags: [a]\nname: x\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', []);
    expect(tagsOf(out)).toBeUndefined();
    expect(out).toContain('name: x');
  });

  it('returns content unchanged when there is no frontmatter', () => {
    const src = `No frontmatter here`;
    expect(setFrontmatterList(src, 'tags', ['a'])).toBe(src);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/utils/setFrontmatterList.test.ts`
Expected: FAIL — `setFrontmatterList` is not exported.

- [ ] **Step 3: Add the helper to `src/utils/frontmatter.ts`**

Append (it can reference the module-private `FRONTMATTER_PATTERN`):

```ts
/**
 * Upsert a flow-sequence list (`key: ["a", "b"]`) into `content`'s frontmatter,
 * replacing an existing `key:` flow line or block-sequence (`key:` + indented
 * `- ` items). Removes the key entirely when `values` is empty. Returns content
 * unchanged when no `---` frontmatter block is present.
 */
export function setFrontmatterList(content: string, key: string, values: string[]): string {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) return content;

  const yamlLines = match[1].split(/\r?\n/);
  const body = match[2];
  const keyLine = new RegExp(`^${key}\\s*:`);
  const kept: string[] = [];
  let skippingBlock = false;
  for (const line of yamlLines) {
    if (skippingBlock) {
      if (/^\s*-\s+/.test(line)) continue; // drop block-list items under the removed key
      skippingBlock = false;
    }
    if (keyLine.test(line)) { skippingBlock = true; continue; }
    kept.push(line);
  }
  if (values.length > 0) {
    const flow = values.map((v) => JSON.stringify(v)).join(', ');
    kept.push(`${key}: [${flow}]`);
  }
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  return `---\n${kept.join('\n')}\n---\n${body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/utils/setFrontmatterList.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/frontmatter.ts tests/unit/utils/setFrontmatterList.test.ts
git commit -m "feat(utils): setFrontmatterList upsert helper"
```

---

## Task 9: i18n keys + CSS

**Files:**
- Modify: every locale file under `src/i18n/locales/` (run `Glob src/i18n/locales/*` to list them; English is authoritative, others may copy English values pending translation)
- Modify: the library stylesheet under `src/style/` (run `Grep "specorator-library-card"` under `src/style/` to find the file; create `src/style/library-toolbar.css` and import it from the style entry if the project bundles per-file)

- [ ] **Step 1: Add these keys (English values) to each locale's translation map**

```
library.searchPlaceholder      = "Search…"
library.sortLabel              = "Sort"
library.sortName               = "Name (A–Z)"
library.sortUpdated            = "Recently updated"
library.resetFilters           = "Clear filters"
library.duplicate              = "Duplicate"
library.noMatches              = "No items match your search."
library.tagsField              = "Tags (comma-separated)"
agentRoster.tagsLabel          = "Tags"
agentRoster.tagsPlaceholder    = "comma, separated, tags"
skillLibrary.prompt            = "Prompt"
loopLibrary.prompt             = "Prompt"
loopLibrary.promptTitle        = "Prompt with loop: {name}"
tasks.loopEditor.tagsName      = "Tags"
tasks.loopEditor.tagsDesc      = "Comma-separated tags for search and filtering."
```

Follow the existing locale file structure (nested object vs flat key). If the project keys a `TranslationKey` union type, add each key there too so `t()` typechecks.

- [ ] **Step 2: Add the CSS**

```css
/* src/style/library-toolbar.css */
.specorator-library-toolbar { display: flex; flex-wrap: wrap; gap: var(--size-4-2); align-items: center; margin-bottom: var(--size-4-2); }
.specorator-library-search { flex: 1 1 12rem; min-width: 8rem; }
.specorator-library-sort { flex: 0 0 auto; }
.specorator-library-filterchips { display: flex; flex-wrap: wrap; gap: var(--size-2-2); flex-basis: 100%; }
.specorator-library-filterchip,
.specorator-library-filterreset {
  font-size: var(--font-ui-smaller);
  padding: var(--size-2-1) var(--size-2-3);
  border-radius: var(--radius-s);
  background: var(--background-modifier-hover);
  border: 1px solid transparent;
}
.specorator-library-filterchip.is-on { background: var(--interactive-accent); color: var(--text-on-accent); }
.specorator-library-filterreset.is-hidden { display: none; }
.specorator-library-card-icon { display: inline-flex; align-items: center; justify-content: center; }
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run check:css`
Expected: PASS (no new `!important`; all `t()` keys resolve).

- [ ] **Step 4: Commit**

```bash
git add src/i18n src/style
git commit -m "feat(library): i18n keys + toolbar/chip styles"
```

---

## Task 10: Agent tags (type + dirty + editor)

**Files:**
- Modify: `src/features/agents/roster/rosterTypes.ts`
- Modify: `src/features/agents/roster/rosterDirty.ts`
- Modify: `src/features/agents/roster/view/AgentDetailEditor.ts`
- Test: `tests/unit/features/agents/roster/rosterDirty.test.ts` (add a case; create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/agents/roster/rosterDirty.test.ts
import { isRosterAgentDirty } from '@/features/agents/roster/rosterDirty';
import type { RosterAgent } from '@/features/agents/roster/rosterTypes';

function agent(over: Partial<RosterAgent> = {}): RosterAgent {
  return {
    id: 'roster:a', name: 'A', description: '', prompt: '', disallowedTools: [], skills: [],
    roles: [], createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('isRosterAgentDirty tags', () => {
  it('is dirty when tags differ', () => {
    expect(isRosterAgentDirty(agent({ tags: ['x'] }), agent({ tags: ['y'] }))).toBe(true);
  });
  it('is clean when tags match (order-insensitive)', () => {
    expect(isRosterAgentDirty(agent({ tags: ['x', 'y'] }), agent({ tags: ['y', 'x'] }))).toBe(false);
  });
  it('treats undefined and empty as equal', () => {
    expect(isRosterAgentDirty(agent({ tags: undefined }), agent({ tags: [] }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/features/agents/roster/rosterDirty.test.ts`
Expected: FAIL — `tags` not on `RosterAgent` / not compared.

- [ ] **Step 3: Add `tags` to `RosterAgent`**

In `src/features/agents/roster/rosterTypes.ts`, add to the `RosterAgent` interface (after `roles`):

```ts
  /** Freeform user tags for search + filtering in the roster. */
  tags?: string[];
```

- [ ] **Step 4: Compare `tags` in `rosterDirty.ts`**

In `isRosterAgentDirty`, extend the final return (reusing the existing `sameSet`):

```ts
  return (
    !sameSet(original.skills, draft.skills) ||
    !sameSet(original.roles, draft.roles) ||
    !sameSet(original.tags ?? [], draft.tags ?? []) ||
    !sameModel(original.modelSelection, draft.modelSelection)
  );
```

- [ ] **Step 5: Seed `tags` into the draft + add the editor input**

In `AgentDetailEditor.render`, update the draft clone:

```ts
    this.draft = { ...agent, roles: [...agent.roles], skills: [...agent.skills], tags: [...(agent.tags ?? [])] };
```

In `renderHeaderCard`, after `this.renderRolesRow(fields);` add `this.renderTagsRow(fields);` and define:

```ts
  private renderTagsRow(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: 'specorator-roster-tags' });
    const input = row.createEl('input', { cls: 'specorator-roster-tags-input', type: 'text' });
    input.value = (this.draft.tags ?? []).join(', ');
    input.placeholder = t('agentRoster.tagsPlaceholder');
    input.setAttribute('aria-label', t('agentRoster.tagsLabel'));
    input.addEventListener('input', () => {
      this.draft.tags = input.value.split(',').map((s) => s.trim()).filter(Boolean);
      this.updateDirty();
    });
  }
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run test -- tests/unit/features/agents/roster/rosterDirty.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/roster/rosterTypes.ts src/features/agents/roster/rosterDirty.ts src/features/agents/roster/view/AgentDetailEditor.ts tests/unit/features/agents/roster/rosterDirty.test.ts
git commit -m "feat(roster): freeform agent tags"
```

---

## Task 11: Loop tags (type + store + editor)

**Files:**
- Modify: `src/features/tasks/loops/loopTypes.ts`
- Modify: `src/features/tasks/loops/LoopNoteStore.ts`
- Modify: `src/features/tasks/ui/LoopEditorModal.ts`
- Test: `tests/unit/features/tasks/loops/loopNoteStoreTags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/loops/loopNoteStoreTags.test.ts
import { LoopNoteStore } from '@/features/tasks/loops/LoopNoteStore';

const store = new LoopNoteStore();

describe('LoopNoteStore tags', () => {
  it('round-trips tags through build → parse', () => {
    const md = store.build({
      name: 'TDD', useWhen: 'w', approach: 'a', steps: 's', verify: 'v', notes: 'n', tags: ['testing', 'quality'],
    });
    expect(md).toContain('tags: ["testing", "quality"]');
    const parsed = store.parse('loops/tdd.md', md);
    expect(parsed.tags).toEqual(['testing', 'quality']);
  });

  it('omits the tags line when none provided', () => {
    const md = store.build({ name: 'X', useWhen: '', approach: 'a', steps: '', verify: '', notes: '' });
    expect(md).not.toContain('tags:');
    expect(store.parse('loops/x.md', md).tags).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/loops/loopNoteStoreTags.test.ts`
Expected: FAIL — `tags` not built/parsed.

- [ ] **Step 3: Add `tags` to loop types**

In `src/features/tasks/loops/loopTypes.ts`, add to both `LoopDefinition` and `SaveLoopInput`:

```ts
  /** Freeform user tags for search + filtering. */
  tags?: string[];
```

Also add to `LoopDefinition` (used for sort-by-updated in the view):

```ts
  /** File mtime, populated by LoopNoteStore.list for "recently updated" sort. */
  updatedAt?: number;
```

- [ ] **Step 4: Parse + build + stamp mtime in `LoopNoteStore`**

Add the import at the top:

```ts
import { extractString, extractStringArray, parseFrontmatter } from '../../../utils/frontmatter';
```

In `parse`, add to the returned object (after `icon`):

```ts
      tags: extractStringArray(parsed.frontmatter, 'tags'),
```

In `build`, after the `icon` push:

```ts
    if (input.tags && input.tags.length > 0) {
      lines.push(`tags: [${input.tags.map((tag) => JSON.stringify(tag)).join(', ')}]`);
    }
```

In `list`, stamp the mtime after each successful parse:

```ts
      try {
        const def = this.parse(file.path, await vault.read(file));
        def.updatedAt = file.stat.mtime;
        loops.push(def);
      } catch (error) {
        warnings.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
```

- [ ] **Step 5: Add the tags input to `LoopEditorModal`**

In `onOpen`, add `let tags = (this.existing?.tags ?? []).join(', ');` beside the other `let` fields, then after the `notes` `area(...)` call add:

```ts
    new Setting(this.contentEl)
      .setName(t('tasks.loopEditor.tagsName'))
      .setDesc(t('tasks.loopEditor.tagsDesc'))
      .addText((tc) => tc.setValue(tags).onChange((v) => { tags = v; }));
```

In the Save button's `onClick`, pass tags through:

```ts
          .onClick(() => {
            void this.handleSave({
              name, description, icon, useWhen, approach, steps, verify, notes,
              tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
            });
          });
```

In `handleSave`, thread tags into the payload (after `notes`):

```ts
      tags: form.tags && form.tags.length > 0 ? form.tags : undefined,
```

(`handleSave`'s parameter is `SaveLoopInput`, which now includes `tags`.)

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run test -- tests/unit/features/tasks/loops/loopNoteStoreTags.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/tasks/loops/loopTypes.ts src/features/tasks/loops/LoopNoteStore.ts src/features/tasks/ui/LoopEditorModal.ts tests/unit/features/tasks/loops/loopNoteStoreTags.test.ts
git commit -m "feat(loops): freeform loop tags + mtime stamp"
```

---

## Task 12: Skill tags (row + editor)

**Files:**
- Modify: `src/features/skills/skillLibraryRows.ts`
- Modify: `src/features/skills/view/SkillEditorModal.ts`
- Test: `tests/unit/features/skills/skillLibraryRows.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/skills/skillLibraryRows.test.ts
import { toSkillLibraryRows } from '@/features/skills/skillLibraryRows';
import type { SkillTabEntry } from '@/features/quickActions/skills/types';

function entry(over: Partial<SkillTabEntry> = {}): SkillTabEntry {
  return {
    id: 'claude:skill-a', providerId: 'claude', providerDisplayName: 'Claude', name: 'a',
    description: 'desc', insertPrefix: '$', sourceFilePath: '.claude/skills/a/SKILL.md',
    providerEnabled: true, ...over,
  };
}

describe('toSkillLibraryRows', () => {
  it('defaults tags to an empty array', () => {
    const [row] = toSkillLibraryRows([entry()]);
    expect(row.tags).toEqual([]);
  });

  it('applies tags from the supplied tag map', () => {
    const [row] = toSkillLibraryRows([entry()], new Map([['claude:skill-a', ['x', 'y']]]));
    expect(row.tags).toEqual(['x', 'y']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/features/skills/skillLibraryRows.test.ts`
Expected: FAIL — `tags` not on `SkillLibraryRow` / arity mismatch.

- [ ] **Step 3: Add `tags` to the row + accept a tag map**

Replace `src/features/skills/skillLibraryRows.ts`:

```ts
import type { SkillTabEntry } from '../quickActions/skills/types';

export interface SkillLibraryRow {
  id: string;
  name: string;
  description: string;
  providerDisplayName: string;
  sourceFilePath: string | null;
  editable: boolean;
  tags: string[];
}

/**
 * Map aggregator entries to library rows. `tagsById` carries frontmatter tags
 * parsed by the view for vault-file skills; entries absent from the map get `[]`.
 */
export function toSkillLibraryRows(
  entries: SkillTabEntry[],
  tagsById?: Map<string, string[]>,
): SkillLibraryRow[] {
  return entries
    .map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      providerDisplayName: e.providerDisplayName,
      sourceFilePath: e.sourceFilePath,
      editable: e.sourceFilePath !== null,
      tags: tagsById?.get(e.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Add a tags input to `SkillEditorModal` that upserts frontmatter**

In `src/features/skills/view/SkillEditorModal.ts`:
- Add imports: `import { setFrontmatterList } from '../../../utils/frontmatter';` and `import { renderModalTextField } from '../../../utils/libraryView';` (already imports several from `libraryView`; add `renderModalTextField` to the existing import list).
- Add a field: `private tagsEl: HTMLInputElement | null = null;`
- In `renderBody`, after the name field and before the content label, add:

```ts
    this.tagsEl = renderModalTextField(root, t('library.tagsField'), this.row.tags.join(', '));
```

- In `save`, compute the new content with upserted tags before writing. Replace the two write sites so both carry tags:

```ts
  private async save(): Promise<void> {
    if (!this.contentArea || !this.row.sourceFilePath) return;
    const adapter = this.plugin.vaultFileAdapter;
    const oldPath = this.row.sourceFilePath;
    const currentSlug = oldPath.split('/').slice(-2, -1)[0];
    const newName = this.nameEl?.value.trim() || this.row.name;
    const newSlug = librarySlug(newName) || currentSlug;
    const tags = (this.tagsEl?.value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const content = setFrontmatterList(this.contentArea.value, 'tags', tags);
    if (newSlug === currentSlug) {
      await adapter.write(oldPath, content);
    } else {
      const root = oldPath.split('/').slice(0, -2).join('/');
      const newPath = await renameLibraryItemDir(adapter, oldPath, root, newSlug, content);
      this.row = { ...this.row, name: newName, sourceFilePath: newPath };
    }
    this.plugin.events.emit('vaultSkill.changed', { providerId: 'claude' });
    this.onSaved();
    new Notice(t('skillLibrary.saved', { name: this.row.name }));
    this.close();
  }
```

> Read-only rows (no `sourceFilePath`) return early in `renderBody` before the tags input, so they display tags via the card chips but cannot edit — matching the existing read-only handling.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- tests/unit/features/skills/skillLibraryRows.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS (callers of `toSkillLibraryRows` updated in Task 14).

> If `typecheck` flags the existing `SkillLibraryView` call site lacking `tags`, that is expected — it is fixed in Task 14. To keep this commit green in isolation, also apply the Task 14 row-building change now, or run typecheck after Task 14. Sequence Tasks 12 → 14 back-to-back.

- [ ] **Step 6: Commit**

```bash
git add src/features/skills/skillLibraryRows.ts src/features/skills/view/SkillEditorModal.ts tests/unit/features/skills/skillLibraryRows.test.ts
git commit -m "feat(skills): skill tags via frontmatter upsert"
```

---

## Task 13: Agent Roster view rewire

**Files:**
- Modify: `src/features/agents/roster/view/AgentRosterView.ts`
- Modify: `src/utils/libraryView.ts` (remove now-unused `nameAsButton`)

- [ ] **Step 1: Remove `nameAsButton` from the shared card**

In `src/utils/libraryView.ts`:
- Delete the `nameAsButton?: boolean;` field from `LibraryCardOptions`.
- In `createLibraryCard`, delete the `nameButton` local, the `if (opts?.nameAsButton) { … } else { … }` branch, and the `nameButton` return field. Replace the name rendering with the plain span only:

```ts
  const body = card.createDiv({ cls: 'specorator-library-card-body' });
  const nameRow = body.createDiv({ cls: 'specorator-library-card-name' });
  nameRow.createSpan({ text: name });
  const actions = card.createDiv({ cls: 'specorator-library-card-actions' });
  return { card, nameRow, body, actions };
```

Update the return type to drop `nameButton?`.

- [ ] **Step 2: Rewire the agent card to interactive + tags + clone**

In `src/features/agents/roster/view/AgentRosterView.ts`:
- Add imports: `import { setIcon } from 'obsidian';` (merge into the existing obsidian import) and `import { LibraryListController } from '../../../../shared/libraryToolbar';`.
- Add a controller field on the class:

```ts
  private readonly controller = new LibraryListController<RosterAgent>({
    getName: (a) => a.name,
    getDescription: (a) => a.description,
    getTags: (a) => [...a.roles, ...(a.tags ?? [])],
    getUpdatedAt: (a) => a.updatedAt,
  });
```

- Replace `renderList`'s tail (from `renderLibraryLoading` onward) so it wires the toolbar and a re-renderable rows pass:

```ts
    renderLibraryLoading(list, t('common.loading'));

    const agents = await this.store.list();
    list.empty();
    if (agents.length === 0) {
      renderLibraryEmptyState(list, {
        icon: 'users',
        message: t('agentRoster.emptyState'),
        actionLabel: t('agentRoster.newAgent'),
        onAction: () => void withErrorNotice(() => this.createAndEdit(), fail, (e) => this.fail(e)),
      });
      return;
    }

    this.controller.setItems(agents);
    this.controller.renderToolbar(toolbar, {
      searchPlaceholder: t('library.searchPlaceholder'),
      sortLabel: t('library.sortLabel'),
      sortName: t('library.sortName'),
      sortUpdated: t('library.sortUpdated'),
      resetFilters: t('library.resetFilters'),
    }, () => this.renderRows(list));
    this.renderRows(list);
```

  …and capture `toolbar` from the shell call:

```ts
    const { actions: headerActions, toolbar, list } = renderLibraryShell(
      this.contentEl,
      t('agentRoster.title'),
      (c) => renderLibraryNav(c, this.plugin, VIEW_TYPE_AGENT_ROSTER),
    );
```

- Add `renderRows`:

```ts
  private renderRows(list: HTMLElement): void {
    list.empty();
    const rows = this.controller.apply();
    if (rows.length === 0) {
      list.createDiv({ cls: 'specorator-library-empty-text', text: t('library.noMatches') });
      return;
    }
    for (const agent of rows) this.renderCard(list, agent);
  }
```

- Replace `renderCard` with the interactive-card version (no name button; tag chips; clone icon):

```ts
  private renderCard(list: HTMLElement, agent: RosterAgent): void {
    const { card, body, actions } = createLibraryCard(list, agent.name, {
      leading: (slot) => {
        slot.addClass('specorator-roster-card-avatar');
        slot.setAttribute('aria-hidden', 'true');
        renderAgentAvatar(slot, rosterAgentToPersona(agent), CARD_AVATAR_SIZE);
      },
      interactive: { onActivate: () => void this.openDetail(agent), ariaLabel: agent.name },
    });
    card.addClass('specorator-roster-card');

    body.createDiv({ cls: 'specorator-roster-card-desc', text: agent.description || '—' });

    const caps = body.createDiv({ cls: 'specorator-roster-card-caps' });
    for (const role of agent.roles) {
      const roleLabel = role === 'verifier' ? t('agentRoster.roleVerifier') : t('agentRoster.roleWorker');
      caps.createSpan({ cls: 'specorator-roster-chip specorator-roster-chip-role', text: roleLabel });
    }
    for (const tag of agent.tags ?? []) {
      caps.createSpan({ cls: 'specorator-library-chip', text: tag });
    }
    if (agent.skills.length > 0) {
      caps.createSpan({
        cls: 'specorator-roster-chip',
        text: t('agentRoster.capsSummary', { skills: String(agent.skills.length) }),
      });
    }

    const fail = t('agentRoster.actionFailed');
    const startBtn = actions.createEl('button', { cls: 'mod-cta', text: t('agentRoster.startChatShort') });
    startBtn.onclick = (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.startChatWithAgent(agent), fail, (err) => this.fail(err));
    };
    const cloneBtn = actions.createEl('button', {
      cls: 'specorator-library-card-icon',
      attr: { 'aria-label': t('library.duplicate'), title: t('library.duplicate') },
    });
    setIcon(cloneBtn, 'copy');
    cloneBtn.onclick = (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.cloneAgent(agent), fail, (err) => this.fail(err));
    };
    const deleteBtn = actions.createEl('button', { cls: 'specorator-library-card-delete', text: t('agentRoster.delete') });
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.deleteAgent(agent), fail, (err) => this.fail(err));
    };
  }
```

- Add `cloneAgent`:

```ts
  private async cloneAgent(agent: RosterAgent): Promise<void> {
    const existing = await this.store.list();
    const cloneName = `${agent.name} copy`;
    const base = createRosterAgent(cloneName, Date.now());
    const clone: RosterAgent = {
      ...agent,
      id: dedupeRosterId(base.id, existing.map((a) => a.id)),
      name: cloneName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.store.save(clone);
    await this.renderList();
    await this.openDetail(clone);
  }
```

- [ ] **Step 2b: Manual verification**

Run: `npm run build`, open the Agent Roster. Confirm: the agent name is no longer a button; clicking the row or pressing Enter opens the detail; the search box filters; sort toggles; role/tag chips show; Duplicate clones and opens the copy.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/libraryView.ts src/features/agents/roster/view/AgentRosterView.ts
git commit -m "feat(roster): clickable rows, toolbar, tag chips, duplicate; drop name button"
```

---

## Task 14: Skill Library view rewire

**Files:**
- Modify: `src/features/skills/view/SkillLibraryView.ts`

- [ ] **Step 1: Rewire render to keep entries, parse tags, add toolbar + Prompt + clone**

In `src/features/skills/view/SkillLibraryView.ts`:
- Add imports:

```ts
import { setIcon, type TAbstractFile } from 'obsidian';
import { LibraryListController } from '../../../shared/libraryToolbar';
import { runVaultSkill } from '../../quickActions/skills/runVaultSkill';
import type { SkillTabEntry } from '../../quickActions/skills/types';
import { extractStringArray, parseFrontmatter } from '../../../utils/frontmatter';
import { createLibraryCard } from '../../../utils/libraryView'; // already imported; ensure present
```

- Add a controller field + an entry map:

```ts
  private readonly controller = new LibraryListController<SkillLibraryRow>({
    getName: (r) => r.name,
    getDescription: (r) => r.description,
    getTags: (r) => r.tags,
    getUpdatedAt: () => 0, // skills have no in-app mtime; "recently updated" falls back to name order
  });
  private entryById = new Map<string, SkillTabEntry>();
```

- Replace `render` from `renderLibraryLoading` onward:

```ts
    renderLibraryLoading(list, t('common.loading'));
    const entries = (await this.plugin.vaultSkillAggregator?.listAll()) ?? [];
    this.entryById = new Map(entries.map((e) => [e.id, e]));
    const tagsById = await this.loadSkillTags(entries);
    list.empty();
    const rows = toSkillLibraryRows(entries, tagsById);
    if (rows.length === 0) {
      renderLibraryEmptyState(list, {
        icon: 'book-open',
        message: t('skillLibrary.empty'),
        actionLabel: t('skillLibrary.newSkill'),
        onAction: () => this.createSkillSafely(),
      });
      return;
    }

    this.controller.setItems(rows);
    this.controller.renderToolbar(toolbar, {
      searchPlaceholder: t('library.searchPlaceholder'),
      sortLabel: t('library.sortLabel'),
      sortName: t('library.sortName'),
      sortUpdated: t('library.sortUpdated'),
      resetFilters: t('library.resetFilters'),
    }, () => this.renderRows(list));
    this.renderRows(list);
```

  …and capture `toolbar` from the shell:

```ts
    const { actions, toolbar, list } = renderLibraryShell(this.contentEl, t('skillLibrary.title'),
      (c) => renderLibraryNav(c, this.plugin, VIEW_TYPE_SKILL_LIBRARY));
```

- Add `loadSkillTags` + `renderRows` + `renderSkillCard`:

```ts
  /** Read frontmatter `tags` for vault-file skills. Home/abs paths fail the
   * vault read and yield no tags (documented limitation). */
  private async loadSkillTags(entries: SkillTabEntry[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    await Promise.all(entries.map(async (e) => {
      if (!e.sourceFilePath) return;
      try {
        const content = await this.plugin.vaultFileAdapter.read(e.sourceFilePath);
        const parsed = parseFrontmatter(content);
        const tags = parsed ? extractStringArray(parsed.frontmatter, 'tags') : undefined;
        if (tags && tags.length > 0) out.set(e.id, tags);
      } catch { /* home-scope/abs path or missing → no tags */ }
    }));
    return out;
  }

  private renderRows(list: HTMLElement): void {
    list.empty();
    const rows = this.controller.apply();
    if (rows.length === 0) {
      list.createDiv({ cls: 'specorator-library-empty-text', text: t('library.noMatches') });
      return;
    }
    for (const row of rows) this.renderSkillCard(list, row);
  }

  private renderSkillCard(list: HTMLElement, row: SkillLibraryRow): void {
    const { nameRow, body, actions } = createLibraryCard(list, row.name, {
      interactive: { onActivate: () => this.openEditor(row), ariaLabel: row.name },
    });
    nameRow.createSpan({ cls: 'specorator-library-chip specorator-library-chip-muted', text: row.providerDisplayName });
    if (!row.editable) {
      nameRow.createSpan({ cls: 'specorator-library-chip specorator-library-chip-outline', text: t('skillLibrary.readOnlyNote') });
    }
    body.createDiv({ cls: 'specorator-library-card-desc', text: row.description });
    const caps = body.createDiv({ cls: 'specorator-roster-card-caps' });
    for (const tag of row.tags) caps.createSpan({ cls: 'specorator-library-chip', text: tag });

    const promptBtn = actions.createEl('button', { cls: 'mod-cta', text: t('skillLibrary.prompt') });
    promptBtn.onclick = (e) => {
      e.stopPropagation();
      const entry = this.entryById.get(row.id);
      if (entry) void runVaultSkill(this.plugin, entry, null as TAbstractFile | null);
    };
    const cloneBtn = actions.createEl('button', {
      cls: 'specorator-library-card-icon',
      attr: { 'aria-label': t('library.duplicate'), title: t('library.duplicate') },
    });
    setIcon(cloneBtn, 'copy');
    cloneBtn.onclick = (e) => { e.stopPropagation(); void this.cloneSkill(row); };
  }
```

- Add `cloneSkill` (vault-file skills only; copies the SKILL.md dir):

```ts
  private async cloneSkill(row: SkillLibraryRow): Promise<void> {
    if (!row.sourceFilePath) { new Notice(t('skillLibrary.readonlyNotice')); return; }
    const adapter = this.plugin.vaultFileAdapter;
    const root = row.sourceFilePath.split('/').slice(0, -2).join('/'); // `.claude/skills`
    const content = await adapter.read(row.sourceFilePath).catch(() => '');
    const dir = await uniqueChildDir(adapter, root, `${librarySlug(row.name)}-copy`);
    const path = `${dir}/SKILL.md`;
    await adapter.write(path, content);
    this.plugin.events.emit('vaultSkill.changed', { providerId: 'claude' });
    new Notice(t('skillLibrary.created', { path }));
    await this.render();
  }
```

> `uniqueChildDir` and `librarySlug` are already imported in this file.

- [ ] **Step 2: Manual verification**

Run: `npm run build`, open Skills. Confirm: rows click to open the editor; search/sort work; tag chips render; Prompt sends `$name` into a provider tab; Duplicate clones an editable skill; the editor shows a Tags field that persists.

- [ ] **Step 3: Typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm run test -- tests/unit/features/skills/skillLibraryRows.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/skills/view/SkillLibraryView.ts
git commit -m "feat(skills): clickable rows, toolbar, tag chips, prompt, duplicate"
```

---

## Task 15: Loop Library view rewire

**Files:**
- Modify: `src/features/tasks/ui/LoopLibraryView.ts`

- [ ] **Step 1: Rewire render with toolbar + interactive rows + Prompt + clone**

In `src/features/tasks/ui/LoopLibraryView.ts`:
- Add imports:

```ts
import { setIcon } from 'obsidian'; // merge into existing obsidian import
import { LibraryListController } from '../../../shared/libraryToolbar';
import { createLibraryCard } from '../../../utils/libraryView'; // already imported; ensure present
import { launchLoopPrompt } from '../loops/launchLoopPrompt';
```

- Add a controller field:

```ts
  private readonly controller = new LibraryListController<LoopDefinition>({
    getName: (l) => l.name,
    getDescription: (l) => `${l.description ?? ''} ${l.useWhen ?? ''}`,
    getTags: (l) => l.tags ?? [],
    getUpdatedAt: (l) => l.updatedAt ?? 0,
  });
```

- Replace `render` from `renderLibraryLoading` onward:

```ts
    renderLibraryLoading(list, t('common.loading'));
    const { loops } = await this.store.list(this.plugin.app.vault, this.folder());
    list.empty();
    if (loops.length === 0) {
      renderLibraryEmptyState(list, {
        icon: 'repeat',
        message: t('loopLibrary.empty'),
        actionLabel: t('loopLibrary.newLoop'),
        onAction: () => this.openEditorSafely(null),
      });
      return;
    }

    this.controller.setItems(loops);
    this.controller.renderToolbar(toolbar, {
      searchPlaceholder: t('library.searchPlaceholder'),
      sortLabel: t('library.sortLabel'),
      sortName: t('library.sortName'),
      sortUpdated: t('library.sortUpdated'),
      resetFilters: t('library.resetFilters'),
    }, () => this.renderRows(list));
    this.renderRows(list);
```

  …capturing `toolbar` from the shell:

```ts
    const { actions, toolbar, list } = renderLibraryShell(this.contentEl, t('loopLibrary.title'),
      (c) => renderLibraryNav(c, this.plugin, VIEW_TYPE_LOOP_LIBRARY));
```

- Add `renderRows` + `renderLoopCard`:

```ts
  private renderRows(list: HTMLElement): void {
    list.empty();
    const rows = this.controller.apply();
    if (rows.length === 0) {
      list.createDiv({ cls: 'specorator-library-empty-text', text: t('library.noMatches') });
      return;
    }
    for (const loop of rows) this.renderLoopCard(list, loop);
  }

  private renderLoopCard(list: HTMLElement, loop: LoopDefinition): void {
    const { body, actions: cardActions } = createLibraryCard(list, loop.name, {
      interactive: { onActivate: () => this.openEditorSafely(loop), ariaLabel: loop.name },
    });
    if (loop.description) {
      body.createDiv({ cls: 'specorator-library-card-desc', text: loop.description });
    }
    if (loop.useWhen) {
      body.createDiv({ cls: 'specorator-library-card-desc', text: `${t('loopLibrary.useWhenLabel')} ${loop.useWhen}` });
    }
    const caps = body.createDiv({ cls: 'specorator-roster-card-caps' });
    for (const tag of loop.tags ?? []) caps.createSpan({ cls: 'specorator-library-chip', text: tag });

    const promptBtn = cardActions.createEl('button', { cls: 'mod-cta', text: t('loopLibrary.prompt') });
    promptBtn.onclick = (e) => { e.stopPropagation(); launchLoopPrompt(this.plugin, loop); };

    const cloneBtn = cardActions.createEl('button', {
      cls: 'specorator-library-card-icon',
      attr: { 'aria-label': t('library.duplicate'), title: t('library.duplicate') },
    });
    setIcon(cloneBtn, 'copy');
    cloneBtn.onclick = (e) => { e.stopPropagation(); void withErrorNotice(() => this.cloneLoop(loop), t('loopLibrary.actionFailed'), (err) => this.fail(err)); };

    const deleteBtn = cardActions.createEl('button', { cls: 'specorator-library-card-delete', text: t('loopLibrary.delete') });
    deleteBtn.onclick = (e) => { e.stopPropagation(); void withErrorNotice(() => this.deleteLoop(loop), t('loopLibrary.actionFailed'), (err) => this.fail(err)); };
  }
```

- Add `cloneLoop`:

```ts
  private async cloneLoop(loop: LoopDefinition): Promise<void> {
    await this.store.save(this.plugin.app.vault, this.folder(), {
      name: `${loop.name} copy`,
      description: loop.description,
      icon: loop.icon,
      useWhen: loop.useWhen,
      approach: loop.approach,
      steps: loop.steps,
      verify: loop.verify,
      notes: loop.notes,
      tags: loop.tags,
    });
    await this.render();
  }
```

> `cloneLoop` omits `originalPath`, so `LoopNoteStore.save` creates a new file at a slug derived from the new name.

- [ ] **Step 2: Manual verification**

Run: `npm run build`, open Loops. Confirm: rows click to open the editor; search/sort/tag-filter work; Prompt opens the model picker, and on confirm a tab opens with the loop body seeded as draft (NOT sent); Duplicate creates a "… copy"; the editor has a Tags field that persists.

- [ ] **Step 3: Typecheck + lint + full suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/tasks/ui/LoopLibraryView.ts
git commit -m "feat(loops): clickable rows, toolbar, tag chips, prompt-as-draft, duplicate"
```

---

## Final verification

- [ ] **Run the full gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all PASS.

- [ ] **Run the quality + CSS guards**

Run: `npm run check:css && npm run check:loc`
Expected: PASS (no new `!important`; LOC within ratchet — if the ratchet trips, see `docs/build-ci/quality-gates.md`).

- [ ] **Manual smoke across all three views**

Open each library tab. Verify search, sort, filter chips, duplicate, clickable rows, tag editing, skill Prompt (direct send), and loop Prompt (picker → seeded draft, not sent).

---

## Self-Review (completed during planning)

**Spec coverage:**
- Card a11y / drop name button → Tasks 2, 13.
- Tags (all 3 views) → Tasks 10 (agent), 11 (loop), 12 (skill), with parse helpers in Task 8.
- Shared search/sort/filter engine → Task 1, wired in Tasks 13–15.
- Duplicate/clone → Tasks 13 (agent), 14 (skill), 15 (loop).
- Skill prompt (direct) → Task 14 via `runVaultSkill`.
- Loop prompt (picker → seed draft) → Tasks 3 (`seedComposerDraft`), 4 (`ModelLaunchModal`), 5 (`launchWithModelPicker`), 6 (`resolveOverrideTargetTab`), 7 (`launchLoopPrompt`), wired in Task 15.
- i18n + CSS → Task 9.

**Type consistency:** `LibraryListController` accessors `{getName,getDescription,getTags,getUpdatedAt}` are used identically in Tasks 1, 13, 14, 15. `SkillLibraryRow.tags` defined in Task 12 and consumed in Task 14. `LoopDefinition.tags`/`updatedAt` defined in Task 11 and consumed in Task 15. `ModelLaunchModalOptions.title` (Task 4) consumed by `launchWithModelPicker` (Task 5).

**Sequencing note:** Tasks 12 → 14 touch the same `SkillLibraryRow` contract; run them back-to-back so `typecheck` is green at the Task 14 commit (called out in Task 12 Step 5).
