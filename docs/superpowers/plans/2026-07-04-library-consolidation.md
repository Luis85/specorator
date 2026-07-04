# Library Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `useVueLibrary` flag and the three legacy library views (hard cut), replace three ribbons with one "Open Library" button, and add a full-management Quick Actions tab to the unified Library.

**Architecture:** Per `docs/superpowers/specs/2026-07-04-library-consolidation-design.md`: staged cut-then-build — (1) code hard cut (flag, views, maps), (2) CSS/shared-DOM prune with per-deletion audits, (3) single ribbon + commands, (4) Quick Action store, (5) Quick Actions panel + tab, (6) ADR + docs sweep + full gates. Quick Actions reuse `QuickActionStorage`, `QuickActionEditorModal`, `resolveOverrideTargetTab`/`dispatchQuickActionToTab` unchanged in behavior.

**Tech Stack:** Vue 3.5 SFC + Pinia (house patterns: init-guard, stale-load token, mutation-reload), Obsidian ribbon/commands, Vitest lane + Jest lane, ratchet re-locks.

**Branch:** `claude/frontend-vue3-pinia-refactor-2ptqlt` (PR #478). Commits end with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq`

**Load-bearing facts (verified):**
- `registerPluginViews.ts` registers the 3 legacy views (lines ~40-42), the flag-aware `openLibrary` helper (~47-48), 3 library ribbons (~49-51), and the roster/skills commands (~52-61). The `open-loop-library` command lives in `src/app/commands/registerPluginCommands.ts:113-116`.
- `viewType.ts` holds `LEGACY_VIEW_TYPE_TO_TAB` / `TAB_TO_LEGACY_VIEW_TYPE` — flag-machinery only after the cut.
- `LibraryView` flag reads: `onOpen` early-return + `setState` redirect block (grep `useVueLibrary`).
- Vue list engine imports FROM `src/shared/libraryToolbar.ts`: `LibraryItemAccessors`, `LibrarySort`, `applyLibraryQuery`, `collectLibraryTags`, and `libraryToolbarLabels` (LibraryToolbar.vue) — these STAY. `LibraryListController` + `mountLibraryList` are legacy-view-only — they GO (audit first).
- `AgentDetailEditor` imports `renderLibraryLoading` (from `src/utils/libraryView.ts`) and uses `.specorator-library-card-delete` + `.specorator-library-modal-*`-adjacent classes — utils and modal CSS STAY.
- Quick actions: `QuickActionStorage(adapter, getFolderPath)` — `loadAll/save/delete/exists/setFavorite/unsetFavorite/hasConfiguredFolder`; `save` derives the path from the name when `filePath` is empty (private `getFilePathForName`); a NON-configured folder throws on save → the tab must guard with `hasConfiguredFolder()` like the modal does. Favorites cache: `plugin.quickActionFavoritesCache?.refresh()`. Editor modal ctor: `(app, existing, onSave: (action) => Promise<void>, storage, seed?)` — the CALLER persists in `onSave`. Run seam: `runQuickActionForFile(plugin, file, action, override?)` resolves view→tabManager→`resolveOverrideTargetTab`→switch→(pill)→`dispatchQuickActionToTab` (which emits `usage.recorded`); the pill attach is already `instanceof`-guarded, so widening `file` to `TAbstractFile | null` is the spec-sanctioned extraction.
- Ratchets fail on STALE baseline entries when files shrink/die — every deletion commit re-locks `scripts/loc-baseline.json` (`npm run check:loc -- --update` equivalent: `node scripts/check-loc.mjs --update`), `scripts/css-important-baseline.json` (`node scripts/check-css-important.mjs --update`) and `scripts/quality-baseline.json` (`npm run check:quality -- --update`) as needed, with diffs limited to removed/improved entries (inspect before committing).
- Vue guards: template classes `specorator-vue-*`/`is-*`/allowlist; SFC + vue-sheet styles `--sp-*` only; Vitest coverage floors 88/75/90/93 over `src/features/library/**`.

---

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/features/agents/roster/view/AgentRosterView.ts`, `src/features/skills/view/SkillLibraryView.ts`, `src/features/tasks/ui/LoopLibraryView.ts` | **Delete** | Legacy views (+ their test files) |
| `src/core/types/settings.ts`, `src/app/settings/defaultSettings.ts` (or wherever `useVueLibrary` lives — grep), `src/features/settings/registry/fields/general.ts`, 10 locale files | Modify | Flag removal |
| `src/features/library/viewType.ts` | Modify | Drop both legacy maps; add `'quick-actions'` to `LibraryTab` (Task 5) |
| `src/features/library/LibraryView.ts` | Modify | Drop flag branches |
| `src/features/library/activateLibrary.ts` | Modify | Optional-tab mode |
| `src/app/views/registerPluginViews.ts` | Modify | Deregister legacy views; single ribbon; command retarget |
| `src/app/commands/registerPluginCommands.ts` | Modify | `open-loop-library` retarget |
| `src/shared/libraryToolbar.ts` | Modify | Delete `LibraryListController` + `mountLibraryList` (audit-gated) |
| `src/style/features/library.css`, `src/style/features/agent-roster.css`, `src/style/accessibility.css` | Modify | Legacy-rule prune (keep modal + detail-editor rules) |
| `src/features/library/vue/stores/quickActionStore.ts` | Create | Store |
| `src/features/library/vue/panels/QuickActionsPanel.vue` | Create | Panel |
| `src/features/library/vue/quickActionLibraryAccessors.ts` | Create | List accessors |
| `src/features/quickActions/runQuickActionForFile.ts` | Modify | `file: TAbstractFile \| null` |
| `src/features/quickActions/QuickActionStorage.ts` | Modify | `getFilePathForName` → public |
| `src/features/library/vue/LibraryRoot.vue` | Modify | 4th tab |
| `docs/adr/NNNN-retire-legacy-library.md` | Create | ADR (next free number — `ls docs/adr/`) |
| CLAUDE.md files, style-baseline spec annotations, PR body | Modify | Docs sweep (Task 6) |

---

### Task 1: Hard cut A — flag, legacy views, maps, registrations

**Files:** delete the 3 legacy view files + their 3 test suites (`tests/unit/features/agents/roster/view/AgentRosterView.test.ts`, `tests/unit/features/skills/view/SkillLibraryView.test.ts`, `tests/unit/features/tasks/ui/LoopLibraryView.test.ts`); modify `settings.ts`/defaults/`fields/general.ts`/10 locales, `viewType.ts`, `LibraryView.ts`, `activateLibrary.ts` callers unchanged, `registerPluginViews.ts`, `registerPluginCommands.ts`, `tests/vue/libraryView.test.ts` (flag-off tests), settings parity tests.

- [ ] **Step 1: Enumerate every flag + legacy-view consumer (the audit)**

Run and paste into the commit body:
```bash
grep -rn "useVueLibrary" src/ tests/ | grep -v ".vue.map"
grep -rln "AgentRosterView\|SkillLibraryView\|LoopLibraryView" src/ tests/
grep -rn "VIEW_TYPE_AGENT_ROSTER\|VIEW_TYPE_SKILL_LIBRARY\|VIEW_TYPE_LOOP_LIBRARY" src/ tests/
grep -rn "LEGACY_VIEW_TYPE_TO_TAB\|TAB_TO_LEGACY_VIEW_TYPE" src/ tests/
```
Every hit must be resolved by this task (deleted file, edited site, or justified keep — e.g. `AgentDetailEditor` shared helpers are NOT hits for these symbols; if an unexpected consumer appears, STOP and report instead of deleting).

- [ ] **Step 2: Update tests first (red)** — in `tests/vue/libraryView.test.ts`: delete the flag-off tests ("returns without mounting when the flag is off", the setState legacy-redirect test — grep `useVueLibrary` in the file) and change every `makePlugin(true)`-style flag argument the helpers take so the plugin fake no longer carries `useVueLibrary` (read the helper; make it flag-free). In `tests/unit/app/commands/registerPluginCommands.test.ts` update the `open-loop-library` expectation to the unified target (see Step 5's code). Run both suites — expect failures against current code (`npx vitest run tests/vue/libraryView.test.ts`; `npx jest tests/unit/app/commands/registerPluginCommands.test.ts --silent`).

- [ ] **Step 3: Cut the code**

1. `viewType.ts` becomes exactly:
```ts
export const VIEW_TYPE_LIBRARY = 'specorator-library';

export type LibraryTab = 'agents' | 'skills' | 'loops';
```
2. `LibraryView.ts`: remove the `onOpen` flag early-return and the whole `setState` flag-off redirect block (keep tab restore + `super.setState`); remove the now-unused import of `TAB_TO_LEGACY_VIEW_TYPE`.
3. Delete the three legacy view files and their three test suites (`git rm`).
4. `registerPluginViews.ts`: remove the three `registerView` calls for legacy types, their imports, the three library ribbons, and the flag branch — the helper becomes `const openLibrary = (tab: LibraryTab) => activateLibrary(plugin, tab);` and the two commands call `openLibrary('agents')` / `openLibrary('skills')`. Do NOT add the new ribbon yet (Task 3) — keep the two commands working. Update the header comment (ribbon order note).
5. `registerPluginCommands.ts:113-116`: `open-loop-library` callback becomes `() => void activateLibrary(plugin, 'loops')` (import from `@/features/library/activateLibrary`); delete its flag branch and legacy imports.
6. Flag removal: delete the `useVueLibrary` field from the settings type + defaults + the registry field block in `fields/general.ts` (grep `useVueLibrary` — the block is ~6 lines with `id/label/description`), and the `settings.useVueLibrary` key object from ALL 10 locale files (script it; re-parse each JSON after edit). Check `tests/integration/settings/` parity fixtures for the field and update.

- [ ] **Step 4: Green + ratchet re-locks**

```bash
npm run typecheck && npm run typecheck:vue && npm run lint
npx vitest run tests/vue && npx jest tests/unit/app tests/unit/features --silent
node scripts/check-loc.mjs        # stale entries for deleted files → FAIL expected
node scripts/check-loc.mjs --update && git diff scripts/loc-baseline.json   # removals only
npm run check:quality             # improvement → stale → re-lock:
npm run check:quality -- --update && git diff scripts/quality-baseline.json # improved-only diff
npx jest tests/unit/i18n --silent # locale alignment
```
If any baseline diff contains anything other than removals/improvements, STOP and report.

- [ ] **Step 5: Commit** — `feat(library)!: remove the useVueLibrary flag and the three legacy library views` with the audit output + "hard cut: legacy view types are unregistered; stale workspace leaves show Obsidian's empty pane (user-accepted)" in the body.

---

### Task 2: Hard cut B — CSS + shared-DOM prune

**Files:** `src/shared/libraryToolbar.ts`, `src/style/features/library.css`, `src/style/features/agent-roster.css`, `src/style/accessibility.css`, its test file if any (grep `libraryToolbar` in tests/).

- [ ] **Step 1: Audit each deletion target**

FIRST (found by Task 1's spec review): delete `src/shared/libraryNav.ts` +
`tests/unit/shared/libraryNav.test.ts`. It is dead legacy nav DOM whose only
consumers were the deleted views; it holds the legacy view types as raw
string literals (invisible to symbol greps) and references
`specorator-library-nav`/`-nav-item`, which would otherwise make the nav CSS
look alive to the greps below. Audit-gate it: `grep -rn "libraryNav\|renderLibraryNav\|LIBRARY_VIEW_TYPES" src/ tests/` must show only the file itself + its test before `git rm`.

```bash
grep -rn "LibraryListController\|mountLibraryList" src/ tests/     # expect: definition + legacy-only/test hits
grep -rn "specorator-library-nav\|specorator-library-toolbar\b\|specorator-library-search\|specorator-library-sort\|specorator-library-filterchip\|specorator-library-filterreset\|specorator-library-card\|specorator-library-chip\|specorator-library-empty\|specorator-library-loading\|specorator-library-list\|specorator-library-header" src/ --include="*.ts" --include="*.vue"
grep -rn "specorator-roster-card-avatar\|specorator-roster-card-desc\|specorator-roster-chip" src/ --include="*.ts" --include="*.vue"
```
Decision rule: a CSS rule dies only when NO ts/vue file references its class anymore. Known keeps: `specorator-library-card-delete` (AgentDetailEditor footer button), `.specorator-library-modal-*` (SkillEditorModal / loop editor), `.specorator-library` bare class if any non-view consumer remains (expected none — verify). If `renderLibraryLoading`/clone-button helpers in `src/utils/libraryView.ts` still have consumers (AgentDetailEditor does), they stay.

- [ ] **Step 2: Prune**

1. `libraryToolbar.ts`: delete `LibraryListController` and `mountLibraryList` (+ their private helpers if now unused); keep the pure functions + labels + types. Update its header comment. Delete/trim their tests (grep tests/ for the deleted symbols).
2. `library.css`: delete the legacy view-header hide rule (3 legacy data-types), nav, header (+`h2`), list, loading, empty*, card* (EXCEPT `-card-delete`), chip*, toolbar/search/sort/filterchips/filterchip/filterreset rules. KEEP: `.specorator-library` padding? — grep first; if only legacy views added that class, delete it too. KEEP all `.specorator-library-modal-*` rules. Update the file header comment to say "editor-modal + shared remnants for the imperative modals".
3. `agent-roster.css`: delete `-roster-card-avatar`, `-roster-card-desc`, `-roster-chip`, `-roster-chip-role` (the Vue forks own these looks now; the legacy roster view is gone). KEEP everything the detail editor uses (`-roster-detail*`, `-roster-section`, `-roster-card-section`, `-roster-role-chip`, footer, dirty…) — the earlier grep list is the source of truth.
4. `accessibility.css:46` area: remove the `.specorator-library-nav-item:focus-visible` selector from its rule list (and any other dead `specorator-library-*` selectors in that file).

- [ ] **Step 3: Verify + re-lock**

```bash
npm run build:css && npm run build && node scripts/check-artifacts.mjs
node scripts/check-css-important.mjs   # stale entries? re-lock with --update, inspect diff
npx vitest run tests/vue && npx jest tests/unit --silent
npm run check:quality                  # re-lock if improved (libraryToolbar shrink)
```
Then re-run Step 1's greps — every deleted class must now have ZERO ts/vue hits and zero CSS definitions; paste the residual-grep summary into the commit body.

- [ ] **Step 4: Commit** — `chore(library): prune legacy-only library CSS and list DOM helpers`.

---

### Task 3: Single ribbon + optional-tab activation + commands

**Files:** `src/features/library/activateLibrary.ts`, `src/app/views/registerPluginViews.ts`, 10 locales, `tests/unit/app/views/` (new or existing registration test — check `PluginViewActivator*` first and follow suit), `tests/vue/activateLibrary.test.ts`.

- [ ] **Step 1: Failing tests** — extend `tests/vue/activateLibrary.test.ts`: calling `activateLibrary(plugin)` with NO tab (a) reveals an existing leaf and does NOT call `setActiveTab`; (b) with no leaf, creates one (existing create-path assertions) and does not force a tab. Jest: registration test asserting exactly ONE library ribbon (`library-big`, label = `ribbon.openLibrary`) and the commands `open-agent-roster`/`open-skill-library`/`open-loop-library`/`open-library`/`open-quick-actions` exist (the last targets the tab added in Task 5 — register it here already; the tab id string is `'quick-actions'`). Red first.

- [ ] **Step 2: Implement**

`activateLibrary.ts` — signature `(plugin, tab?: LibraryTab)`; the final line becomes:
```ts
  if (tab && leaf.view instanceof LibraryView) await leaf.view.setActiveTab(tab);
```
(keep reveal + `loadIfDeferred` unconditional; update the doc comment: "switches to `tab` when given; otherwise reveals the leaf on its current tab").

`registerPluginViews.ts` — after the Library `registerView`:
```ts
  const openLibrary = (tab?: LibraryTab) => activateLibrary(plugin, tab);
  plugin.addRibbonIcon('library-big', t('ribbon.openLibrary'), () => void openLibrary());
  plugin.addCommand({ id: 'open-library', name: t('commands.openLibrary'), callback: () => void openLibrary() });
  plugin.addCommand({ id: 'open-agent-roster', name: t('commands.openAgentRoster'), callback: () => void openLibrary('agents') });
  plugin.addCommand({ id: 'open-skill-library', name: t('commands.openSkillLibrary'), callback: () => void openLibrary('skills') });
  plugin.addCommand({ id: 'open-quick-actions', name: t('commands.openQuickActions'), callback: () => void openLibrary('quick-actions') });
```
ALSO (Task 1 quality-review note): the three library commands now diverge in
registration path — roster/skills via raw `plugin.addCommand` in
registerPluginViews, loops via the registrar (`registerPluginCommands`, which
also feeds the hotkey registry). While rewriting the command block here,
unify: move ALL library commands (the three tab deep-links + the two new
ones) onto ONE path — whichever of the two the codebase treats as canonical
for hotkey support (inspect `registerCommandHotkey` usage in
registerPluginCommands.ts and follow it). Update the Jest expectations
accordingly.

NOTE: `'quick-actions'` is not a valid `LibraryTab` until Task 5 — to keep Task 3 compiling, add the union member in THIS task (`viewType.ts`: `export type LibraryTab = 'agents' | 'skills' | 'loops' | 'quick-actions';`) and let `LibraryRoot` handle the unknown tab gracefully until Task 5 (check `LibraryRoot.vue`'s panel switch: `AgentsPanel` is the `v-else` fallback — an unmatched tab falls back to Agents; acceptable transiently, note it in the commit). i18n: add `ribbon.openLibrary`, `commands.openLibrary`, `commands.openQuickActions` to all 10 locales.

- [ ] **Step 3: Verify + commit** — both lanes + typechecks + lint + locale alignment; commit `feat(library): single Open Library ribbon and unified commands`.

---

### Task 4: Quick Action store

**Files:** Create `src/features/library/vue/stores/quickActionStore.ts`, `src/features/library/vue/quickActionLibraryAccessors.ts`; modify `src/features/quickActions/QuickActionStorage.ts` (make `getFilePathForName` public with a doc comment: "public for the Library duplicate flow's collision probe"), `src/features/quickActions/runQuickActionForFile.ts` (widen `file: TAbstractFile | null`; the two `instanceof` guards already handle null). Tests: `tests/vue/stores/quickActionStore.test.ts` (+ a Jest case in the existing `runQuickActionForFile`/quickActions suite pinning the null-file path skips pill attach but still dispatches).

- [ ] **Step 1: Failing store spec** — mirror `tests/vue/stores/skillLibraryStore.test.ts` conventions (read it): init-guard (second `init` no-op), `load()` token-guard interleaving (stale slow load must not clobber a newer one), `remove` → `storage.delete(filePath)` + favorites refresh + reload, `duplicate` → name `"X copy"` then `"X copy 2"` when `exists` says taken (pin the exact `getFilePathForName` probe calls) + save + reload, `toggleFavorite` on/off → `setFavorite(action, rank-from-assignNextFavoriteRank)` / `unsetFavorite` + refresh + reload, `folderConfigured` exposed from `hasConfiguredFolder`. Red.

- [ ] **Step 2: Implement the store**

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { assignNextFavoriteRank, QuickActionStorage } from '../../../quickActions/QuickActionStorage';
import type { QuickAction } from '../../../quickActions/types';
import type SpecoratorPlugin from '../../../../main';

/**
 * Reactive projection over QuickActionStorage for the Library tab. I/O stays
 * in the storage class; every mutation reloads so all mounted leaves
 * re-derive (house pattern, mirrors skillLibraryStore).
 */
export const useQuickActionStore = defineStore('library-quick-actions', () => {
  const actions = ref<QuickAction[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const folderConfigured = ref(true);

  let plugin: SpecoratorPlugin | null = null;
  let storage: QuickActionStorage | null = null;
  let loadToken = 0;

  function init(p: SpecoratorPlugin): void {
    if (plugin) return;
    plugin = p;
    storage = new QuickActionStorage(p.storage.getAdapter(), () => p.settings.quickActionsFolder ?? '');
  }

  async function load(): Promise<void> {
    if (!storage) return;
    const token = ++loadToken;
    loading.value = true;
    try {
      folderConfigured.value = storage.hasConfiguredFolder();
      const next = await storage.loadAll();
      if (token !== loadToken) return; // a newer load superseded this one
      actions.value = next;
      error.value = null;
    } catch (e) {
      if (token !== loadToken) return;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (token === loadToken) loading.value = false;
    }
  }

  async function remove(action: QuickAction): Promise<boolean> {
    if (!storage) return false;
    await storage.delete(action.filePath);
    await plugin?.quickActionFavoritesCache?.refresh();
    await load();
    return true;
  }

  async function duplicate(action: QuickAction): Promise<QuickAction | null> {
    if (!storage) return null;
    let name = `${action.name} copy`;
    for (let n = 2; await storage.exists(storage.getFilePathForName(name)); n++) {
      name = `${action.name} copy ${n}`;
    }
    const copy: QuickAction = { ...action, name, filePath: '', favorite: undefined, favoriteRank: undefined };
    await storage.save(copy);
    await load();
    return copy;
  }

  async function toggleFavorite(action: QuickAction): Promise<void> {
    if (!storage) return;
    if (action.favorite) {
      await storage.unsetFavorite(action);
    } else {
      const rank = assignNextFavoriteRank(actions.value);
      if (rank === null) return; // favorite cap reached — storage rule owns the limit
      await storage.setFavorite(action, rank);
    }
    await plugin?.quickActionFavoritesCache?.refresh();
    await load();
  }

  return { actions, loading, error, folderConfigured, init, load, remove, duplicate, toggleFavorite };
});
```
CHECK against reality while implementing: the exact settings key for the folder (`grep -rn "quickActionsFolder\|QuickActions folder" src/core/types/settings.ts src/features/quickActions/` — use whatever `openQuickActionsModal` passes as `getFolderPath`), whether `assignNextFavoriteRank` is exported from `QuickActionStorage.ts` (it is, line 7), and duplicate's favorite-stripping (a copy must not inherit favorite rank — keep this behavior and pin it in the spec's test). Adjust imports to the real paths; keep the doc comments.

Accessors (`quickActionLibraryAccessors.ts`):
```ts
import type { LibraryItemAccessors } from '../../../shared/libraryToolbar';
import type { QuickAction } from '../../quickActions/types';

/** updated() returns 0: QuickAction carries no mtime; "updated" sort degrades to stable order. */
export const quickActionLibraryAccessors: LibraryItemAccessors<QuickAction> = {
  name: (a) => a.name,
  description: (a) => a.description ?? '',
  tags: (a) => a.tags ?? [],
  updated: () => 0,
};
```
(Verify the real `LibraryItemAccessors` field names against `src/shared/libraryToolbar.ts:7-13` and mirror `loopLibraryAccessors.ts` — adjust to the actual interface, keeping the 0-mtime note.)

- [ ] **Step 3: `runQuickActionForFile` widening (Jest red first)** — add a test: `file = null` → no `attachFileAsPill`/`attachFolderAsPill` call, `dispatchQuickActionToTab` still called. Widen the signature + JSDoc ("null = no file context, e.g. the Library tab").

- [ ] **Step 4: Green + commit** — `npx vitest run tests/vue && npx jest tests/unit/features/quickActions --silent && npm run typecheck && npm run typecheck:vue`; commit `feat(library): quick-action store with duplicate/favorite/delete flows`.

---

### Task 5: Quick Actions panel + 4th tab

**Files:** Create `src/features/library/vue/panels/QuickActionsPanel.vue`; modify `LibraryRoot.vue` (4th tab entry + panel branch), 10 locales (new `quickActions.library.*` keys), `tests/vue/panels/quickActionsPanel.test.ts` (new), `tests/vue/libraryView.test.ts` (nav now has 4 tabs).

- [ ] **Step 1: Failing panel spec** — mirror `tests/vue/panels/loopsPanel.test.ts` harness: renders cards (name/desc/tags/star state); Run resolves through a mocked `runQuickActionForFile` with `(plugin, null, action)`; Edit opens a mocked `QuickActionEditorModal` and its `onSave` persists via storage + reloads; New respects `folderConfigured === false` → CTA disabled/hint shown; Duplicate/Delete busy-gated (deferred promise, double-click fires once — copy the busy-test pattern); Delete confirm-declined does nothing; star toggle calls the store. LibraryRoot test: 4 nav items, clicking the 4th shows the panel heading. Red.

- [ ] **Step 2: Implement the panel** (structure mirrors `LoopsPanel.vue` — read it first and keep the same section order):

```vue
<script setup lang="ts">
import { inject } from 'vue';

import { t } from '../../../../i18n/i18n';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { runQuickActionForFile } from '../../../quickActions/runQuickActionForFile';
import type { QuickAction } from '../../../quickActions/types';
import { QuickActionEditorModal } from '../../../quickActions/ui/QuickActionEditorModal';
import LibraryCard from '../components/LibraryCard.vue';
import LibraryEmptyState from '../components/LibraryEmptyState.vue';
import LibraryToolbar from '../components/LibraryToolbar.vue';
import { PLUGIN_KEY } from '../libraryKeys';
import { quickActionLibraryAccessors } from '../quickActionLibraryAccessors';
import { useQuickActionStore } from '../stores/quickActionStore';
import { useLibraryList } from '../useLibraryList';
import { useRowActionPending } from '../useRowActionPending';
</script>
```
Body essentials (write the full component following LoopsPanel's shape): store init + `onMounted(load)`; `useLibraryList(() => store.actions, quickActionLibraryAccessors)`; header `specorator-vue-panel-header` with `<h2>{{ t('quickActions.library.title') }}</h2>` + New button (`mod-cta`, disabled when `!store.folderConfigured`, opens `QuickActionEditorModal(plugin.app, null, onSaved, storageOf(store), undefined)` — the store must expose its storage or a `save(action)` method; ADD `save(action)` to the store in this task (storage.save + favorites refresh + load) and route the modal's `onSave` through it, keeping storage private); loading row; empty state (two variants: folder-not-configured hint `quickActions.library.folderNotConfigured` with NO CTA, vs configured-but-empty with New CTA); card list — leading icon via the `-card-icon` atom + `setIcon` host pattern (copy from LoopsPanel), name-chips slot hosts the favorite star button (`aria-pressed`, classes `specorator-vue-qa-star` + `is-on` when favorite, scoped block styles it with `--sp-*` tokens only), desc, tags via card `tags` prop, actions Run/Edit/Duplicate/Delete all wrapped in `pending.run(action.filePath, ...)` (filePath is the stable row id) with `withErrorNotice`, Delete confirm inside the busy window (`quickActions.library.deleteConfirm` interpolating name, "and its note" wording — deleting a quick action deletes one note file, not a folder). Run: `void pending.run(action.filePath, () => withErrorNotice(() => runQuickActionForFile(plugin, null, action), t('quickActions.library.actionFailed'), fail))`.

- [ ] **Step 3: Wire the 4th tab** — `LibraryRoot.vue` TABS array gains `{ id: 'quick-actions', label: t('quickActions.library.tab') }` and the template panel switch gains `<QuickActionsPanel v-else-if="activeTab === 'quick-actions'" />` BEFORE the Agents `v-else`. i18n: add the `quickActions.library` namespace (tab, title, newAction, actionFailed, run, edit, duplicate, delete, deleteConfirm, deleted, favoriteAria, folderNotConfigured) ×10 locales + `TranslationKey` unions (find the quickActions type file via `grep -rn "quickActions.editor" src/i18n/types/`).

- [ ] **Step 4: Green + guards + commit** — `npx vitest run tests/vue` (snapshots for the new card if the harness adds one), `npm run test:vue:coverage` (floors hold — the new store/panel need the specs from Steps 1/4 of Task 4), `npx vitest run tests/vue/styleBaseline.test.ts` (namespace guard covers the new template automatically — `specorator-vue-qa-star` matches the pattern), locale alignment, typechecks, lint, `npm run build && node scripts/check-artifacts.mjs`. Commit `feat(library): Quick Actions tab with full management`.

---

### Task 6: ADR + docs sweep + full gates + PR update

- [ ] **Step 1: ADR** — `docs/adr/` next free number, `retire-legacy-library-views.md`: context (flag shipped default-off; QA approved; plugin now published — no major-version milestone), decision (hard cut, no shims; single ribbon; Quick Actions join the Library), consequences (stale saved leaves show empty panes once; editor modals + embedded detail editor stay imperative until their own migrations). Frontmatter per existing ADRs (read one).
- [ ] **Step 2: Docs sweep** — update: root `CLAUDE.md` features/library row (no flag, four tabs incl. Quick Actions, single ribbon, legacy views deleted — rewrite the row) + features/quickActions row (mention the Library management tab); `src/style/CLAUDE.md` (drop "legacy views keep the untouched CSS until v4.0.0" phrasing → "legacy library CSS was pruned 2026-07-04; the imperative editor modals keep `.specorator-library-modal-*`"); annotate (do not rewrite) the 2026-07-03 style-baseline spec: one-line note under its Decisions table: "*(2026-07-04: the deletion pass landed with the library consolidation — see docs/superpowers/specs/2026-07-04-library-consolidation-design.md.)*"; fix the `AgentsPanel.vue` comment citing agent-roster.css legacy lifetime; `grep -rn "v4.0.0" src/ docs/ CLAUDE.md` → resolve every hit (annotate or rewrite per the spec's sweep rule); `docs/build-ci/quality-gates.md` only if it references the flag.
- [ ] **Step 3: Full gate sweep** — `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test && npx vitest run tests/vue && npm run test:vue:coverage && npm run build && node scripts/check-artifacts.mjs && npm run check:css && npm run check:loc && npm run check:quality` — ALL green; report each.
- [ ] **Step 4: Commit + push is controller-owned** — commit `docs: ADR + docs sweep for the library consolidation`; the controller pushes and updates the PR body (consolidation section + revised QA checklist: single ribbon entry, 4-tab library, quick-action management flows, stale-leaf note).

---

## Self-review notes

- Spec coverage: Part 1 → Tasks 1-2; Part 2 → Task 3; Part 3 → Tasks 4-5; ADR/docs/ratchets → per-task re-locks + Task 6. Hard-cut consequence, keep-lists, audit rule, folder-not-configured guard, usage-emission preservation (`dispatchQuickActionToTab` via `runQuickActionForFile`), same-command-ids, favorite-strip-on-duplicate: all present.
- Known verify-at-implementation points are marked CHECK (settings key name for the quick-actions folder, accessor interface field names, LibraryRoot fallback behavior for unknown tabs) — each has a lookup command and a decision rule, no TBDs.
- Type consistency: `LibraryTab` gains `'quick-actions'` in Task 3 (compile requirement) and is consumed in Task 5; store API used by the panel matches Task 4's code (`folderConfigured`, `save` added in Task 5 Step 2 — flagged inline where it's added).
