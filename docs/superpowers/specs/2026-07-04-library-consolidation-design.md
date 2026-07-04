---
title: Library consolidation — retire the flag and legacy views, single ribbon, Quick Actions tab
date: 2026-07-04
status: approved
scope: features/library, features/quickActions (additive), app/views, settings, style, i18n
---

# Library Consolidation — Hard Cut + Single Ribbon + Quick Actions Tab

## Problem

The unified Vue Library shipped behind `useVueLibrary` (default off) with the
three legacy views intact, pending a deletion pass once the unified view
proved itself. The plugin is now published — there is no future major-version
milestone to park the deletion behind. Manual QA
approved the unified view; keeping the flag now costs three ribbon icons,
duplicated redirect logic, and a frozen legacy codepath nobody should enter.
Separately, Quick Actions — vault-authored prompt notes with full storage,
editor-modal, favorites, and launch plumbing — have no management surface;
they are only reachable through the chat modal and context menus.

## Decisions (user-approved)

| Question | Decision |
|----------|----------|
| Flag lifetime | **Remove `useVueLibrary` now.** The plugin is published and there is no v4.0.0 milestone to wait for — the deletion pass IS this change. The unified Library is the only library surface. |
| Legacy views | **Delete** AgentRosterView, SkillLibraryView, LoopLibraryView, their registrations, redirect guards, and tests. |
| Saved workspaces holding legacy leaves | **Hard cut.** The legacy view types become unregistered; stale leaves show Obsidian's default empty pane. No redirect shims, no migration. |
| Ribbons | **One "Open Library" ribbon** (`library-big` icon) replaces the three library ribbons. Chat and Agent Board ribbons unchanged. |
| Quick Actions in the Library | **Full management tab**: list + search/sort/tag-filter, New, Run, Edit, Duplicate, Delete (confirmed), favorite star with click-to-toggle. Existing quick-action surfaces (chat modal, context menus, capture, favorites-driven WO menu) are untouched consumers of the same storage. |

## Part 1 — The hard cut

### Deleted

- `useVueLibrary`: settings type field, `defaultSettings` entry, registry
  toggle in `fields/general.ts`, `settings.useVueLibrary.*` i18n keys in all
  10 locales, and every read site.
- `LibraryView`: the flag-off early-return in `onOpen` and the flag-off
  redirect block in `setState` (the tab-restore logic stays).
- `src/features/library/viewType.ts`: `LEGACY_VIEW_TYPE_TO_TAB` and
  `TAB_TO_LEGACY_VIEW_TYPE` maps.
- The three legacy view classes + their `registerView` calls + the
  `VIEW_TYPE_AGENT_ROSTER` / `VIEW_TYPE_SKILL_LIBRARY` /
  `VIEW_TYPE_LOOP_LIBRARY` constants (delete each constant with its view
  unless a non-view consumer surfaces in the audit — then keep the constant
  only where consumed and note why).
- The flag branch in `registerPluginViews.ts`'s `openLibrary` helper.
- Legacy-only shared UI: in `src/shared/libraryToolbar.ts`, the DOM half —
  `LibraryListController`, `mountLibraryList` (audit for remaining
  consumers first; the legacy views are expected to be the only ones).
  **Kept**: `LibrarySort`, `LibraryItemAccessors`, `collectLibraryTags`,
  `applyLibraryQuery`, `libraryToolbarLabels` — the Vue list engine imports
  them.
- Legacy-only CSS: in `src/style/features/library.css` the nav / toolbar /
  card / chip / empty / loading / list rules and the three legacy
  view-header hide rules. In `accessibility.css`, legacy library focus
  rules that no longer match anything. **Kept**: every
  `.specorator-library-modal-*` rule (skill/loop editor modals remain
  imperative and render into `document.body`), and all of
  `agent-roster.css`'s detail-editor rules (the embedded editor inside the
  island still consumes them; only its list/card rules die if the audit
  confirms the Vue panel forks are their sole remaining consumers —
  `-roster-card-avatar`/`-roster-card-desc`/`-roster-chip`* legacy rules
  become dead once AgentRosterView is deleted and MUST be pruned too).
- Legacy view test suites; redirect/parity tests that exist only to pin
  flag behavior.

### Audit rule for every deletion

Before deleting any export/class/rule: grep for remaining consumers. A
deletion PR task must list what it checked. Shared substrate that stays:
`librarySlug`/`uniqueChildDir` (`utils/libraryView.ts`), `skillCloning.ts`,
`renderLibraryLoading`/clone-button helpers **if** still imported by
`AgentDetailEditor` (it imports `renderLibraryLoading` today), the loop/skill
editor modals, `AgentDetailEditor` itself.

### Ratchets

Deleting files strands LOC-baseline and `!important`-baseline entries
(guards fail on stale entries by design) and improves fallow metrics —
re-lock all affected baselines in the same commit as each deletion, with the
diff limited to removed/improved entries.

### ADR

`docs/adr/` gains a short ADR: retire the legacy library and flag now that
the plugin is published (no major-version milestone exists to defer to);
hard-cut rationale (QA-approved unified view, no redirect shims, accepted
stale-leaf cost); what remains imperative (editor modals, embedded detail
editor) and why.

Docs sweep: every remaining "v4.0.0 deletion pass" reference becomes stale
with this change and is updated in the docs task — root `CLAUDE.md`
(features/library row), the 2026-07-03 style-baseline spec's addendum/out-of-
scope mentions (annotated, not rewritten — it is a historical record), and
the comment in `AgentsPanel.vue` that cites the pass.

## Part 2 — Single ribbon + commands

- One ribbon: `library-big`, label `ribbon.openLibrary` (new i18n key ×10),
  handler: reveal an existing Library leaf **without forcing a tab**;
  create one on the `agents` tab when none exists. `activateLibrary` gains
  an optional-tab mode (`tab?: LibraryTab`) — existing callers keep forcing
  their tab.
- The three existing palette commands (open roster / skills / loops ids)
  stay as tab deep-links into the Library — same command ids so user
  keybindings survive; labels unchanged. A fourth command "Open library"
  (no tab forcing) and a fifth "Open quick actions" tab deep-link are
  added.
- Ribbon registration order stays chat → board → library.

## Part 3 — Quick Actions tab

### Tab

`LibraryTab` union gains `'quick-actions'` (4th tab, after Loops). Tab
label reuses the existing quick-actions naming (`quickActions.*` i18n
namespace) — new key only for the tab label if none fits.

### Store (`useQuickActionStore`, house patterns)

Wraps the existing `QuickActionStorage` (constructed from
`plugin.storage.getAdapter()` exactly as `openQuickActionsModal` does).
State: `actions: QuickAction[]`, `loading`, `error`. Methods:

- `init(plugin)` — idempotent (init-guard pattern).
- `load()` — `storage.loadAll()` behind the stale-load request-token guard.
- `remove(action)` — `storage.delete(action.filePath)`, then favorites
  cache refresh (`plugin.quickActionFavoritesCache?.refresh()`), then
  `load()`. Returns boolean.
- `duplicate(action)` — collision-safe copy: derive `<name> copy[ n]`,
  check `storage.exists` on the derived file path, `storage.save`, refresh
  favorites cache, `load()`, return the saved action (or its path) so the
  panel can surface it.
- `toggleFavorite(action)` — `setFavorite(action,
  assignNextFavoriteRank(actions))` / `unsetFavorite(action)`, favorites
  cache refresh, `load()`.
- Every mutation reloads (multi-leaf consistency); no event-bus seam exists
  for quick-action writes from other surfaces (the modal doesn't emit), so
  the panel also reloads on mount/tab-activation. *Addendum (external-review
  follow-up, 2026-07-04):* the mounted panel now also subscribes to
  folder-scoped vault create/modify/delete/rename events (debounced, the
  `QuickActionFavoritesCache` pattern), so external writes from the modal and
  the capture flow refresh a mounted tab without a remount.

### Panel (`QuickActionsPanel.vue`)

- `useLibraryList` over `store.actions` with accessors: name, description,
  tags; `updated` returns 0 (QuickAction carries no mtime — the sort
  dropdown keeps both options; "updated" degenerates to stable order,
  matching the accessors contract).
- Card: leading icon (`setIcon` via the imperative-host pattern with a
  scoped `:deep()` or the existing card-icon atom), name, favorite star
  button (`aria-pressed`, toggles via store), description, tag chips.
- Actions (all busy-gated via `useRowActionPending`, matching the other
  panels): **Run**, **Edit**, **Duplicate**, **Delete** (confirm modal
  first, inside the busy window).
- **Run**: resolves a target chat tab with the same reuse-or-create,
  draft-guarded policy the existing non-header launch paths use, then
  routes through `dispatchQuickActionToTab` so `usage.recorded` emission is
  preserved. No file pill (Library has no file context — mirrors the chat
  header path's contract). The exact tab-resolution helper is pinned in
  the plan after reading `openContextMenuQuickAction`/`runQuickAction`;
  if no tab-resolving export exists that is usable without a file, extract
  one from the context-menu path rather than duplicating the policy.
- **Edit / New**: open the existing `QuickActionEditorModal` with a
  save-callback that reloads the store. New-collision behavior matches the
  modal's existing Add flow (uses `storage.exists`).
- Empty state: `LibraryEmptyState` with a "New quick action" CTA.

### Style & guards

`specorator-vue-*` namespace only; atoms reuse plus a small scoped block
(favorite star state); `--sp-*` tokens only; the namespace/token guards and
coverage floors apply automatically (the Vitest include glob already covers
`src/features/library/**`).

## Testing

- **Vitest**: store spec (init-guard, token-guard interleaving, per-mutation
  reload + exact storage-call pinning, duplicate collision naming, favorite
  toggle rank behavior); panel spec (busy-gating incl. double-fire, delete
  confirm decline/accept, run wiring with mocked resolver+dispatcher, star
  toggle, empty-state CTA); LibraryRoot gains the 4th tab (nav strip test
  update); snapshot for the card.
- **Jest**: `registerPluginViews` tests updated (one library ribbon, command
  set incl. the two new commands); deletion fallout (removed suites, no
  orphaned imports — typecheck + lint are the executable proof).
- Full gate sweep at the end (both test lanes, both typechecks, lint, LOC /
  CSS / quality ratchets re-locked, build + artifact smoke).

## Out of scope

- Any change to quick-action behavior in the chat modal, context menus,
  capture flow, or favorites-driven WO menu.
- Migrating the skill/loop/quick-action editor modals to Vue.
- Deleting `AgentDetailEditor` (still the embedded editor).
- Workspace migration for stale legacy leaves (explicit hard cut).
