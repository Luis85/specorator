---
title: Library Views Overhaul — search, tags, QoL, and in-library prompting
date: 2026-06-28
status: draft
scope: features/agents/roster, features/skills, features/tasks/loops, shared, utils, features/quickActions, features/chat
---

# Library Views Overhaul

## Problem

The three library views — Agent Roster, Skills, Loops — share a render shell
(`renderLibraryShell` + `createLibraryCard` + `renderLibraryNav`) but each is a
flat, unsearchable list. Specific gaps:

- **Agent rows** render the name as a redundant `<button>` (`nameAsButton: true`)
  even though the whole card is already clickable. Both call `openDetail`.
- **No search, sort, or filter** in any of the three views.
- **No user-authored tags** — agents expose only `roles`, skills only a provider
  chip, loops only `useWhen`. Nothing the user controls for organizing.
- **Skills and loops cannot be prompted from the library.** Skill prompting
  machinery exists (`runVaultSkill`) but is only reachable from the Quick Actions
  modal. Loops have no "send as prompt" path at all — they are only attachable to
  work orders.

## Goals

1. Remove the redundant agent name button; keep keyboard/SR open affordance.
2. Freeform, persisted **tags** on agents, skills, and loops, rendered as chips.
3. Shared **search + sort + filter** across all three views via one tested engine.
4. **Duplicate / clone** action per item.
5. **Prompt a skill** directly from the library (no model picker — skills are
   already provider-bound).
6. **Prompt a loop** from the library through the model picker first, then **seed
   the loop body into the composer as a draft** (do not auto-send).

## Non-goals

- Roving arrow-key navigation between rows (basic Enter/Space-to-open only).
- Changing how loops attach to work orders or how `renderTaskPrompt` injects them.
- Reworking the Skills-tab caching / aggregator freshness model.
- Any change to the nav strip (`renderLibraryNav`).

## Decisions (resolved with user)

| Question | Decision |
|---|---|
| What do "tags" mean? | Freeform user-authored tags, **all three views**, persisted to JSON/frontmatter, render as chips, feed search + filter. |
| Skill prompt path | **Direct send** — skill is provider-bound, route to a matching tab via `runVaultSkill`. No model modal. |
| Loop prompt path | **Model picker first**, then **seed loop body as composer draft** (not auto-send). |
| QoL feature set | Sort control, Filter chips, Duplicate/clone. (Keyboard-roving deferred.) |
| Loop prompt content | Rendered Approach / Steps / Verify / Notes (no Use-when), seeded as draft. |

## Architecture

### 1. Shared list engine — `shared/libraryToolbar.ts`

A single content-agnostic controller drives search/sort/filter for all three
views (chosen over per-view duplication).

```ts
interface LibraryItemAccessors<T> {
  getName(item: T): string;
  getDescription(item: T): string;
  getTags(item: T): string[];        // user tags + implicit facets (role, provider)
  getUpdatedAt(item: T): number;     // epoch ms; 0 if unknown
}

class LibraryListController<T> {
  // holds { query, sort: 'name' | 'updated', activeFilters: Set<string> }
  setItems(items: T[]): void;
  apply(): T[];                       // filtered + sorted
  // renderToolbar mounts: search input, sort <select>, filter-chip row.
  renderToolbar(host: HTMLElement, onChange: () => void): void;
}
```

- **Search**: case-insensitive substring over name + description + tags.
- **Sort**: `Name A–Z` (default, current behavior) or `Recently updated`
  (`getUpdatedAt` desc). Agents use `RosterAgent.updatedAt`; skills and loops use
  the vault file mtime (read at list time).
- **Filter chips**: the union of all tags/facets present in the current item set.
  Clicking toggles a chip. **OR semantics** — a row shows if it carries *any*
  active chip. A reset affordance clears all active chips.
- Each view constructs the controller with its accessors and a `renderRows`
  callback; on toolbar change the view re-renders only the list container, not
  the whole shell.

`renderLibraryShell` gains an opt-in `toolbar` element between the header and the
list container; views that pass no toolbar render exactly as today, so the shell
signature stays backward compatible.

### 2. Card interaction + a11y — `utils/libraryView.ts`

- Drop `nameAsButton`; the name is always a plain span.
- `LibraryCardOptions` gains `interactive?: { onActivate: () => void; ariaLabel: string }`.
  When set, `createLibraryCard` makes the card `role="button"`, `tabindex="0"`,
  wires `click` and `keydown` (Enter/Space → `onActivate`), and sets the aria
  label. Action buttons inside call `stopPropagation`. Nested `<button>` elements
  inside a `div[role=button]` are valid (the card is not a real `<button>`), so
  Start chat / Prompt / Delete remain.
- All three views adopt the interactive card so the whole row opens the primary
  action (agent → detail, skill → editor, loop → editor). The redundant agent
  name button and the skill "Open" / loop "Edit" buttons are removed — the row
  click replaces them.

### 3. Tags — data model + editors

| View | Storage | Parse / write | Editor |
|---|---|---|---|
| Agent | `RosterAgent.tags?: string[]` in the agent JSON | `AgentRosterStore` serializes the whole object — passthrough, no store change | `AgentDetailEditor` gains a tag input |
| Loop | frontmatter `tags` on the `specorator-loop` note | `LoopNoteStore.parse`/`build` read/write `tags`; `LoopDefinition` + `SaveLoopInput` gain `tags?: string[]` | `LoopEditorModal` gains a tag input |
| Skill | frontmatter `tags` on `SKILL.md` | parsed at row-build time in `SkillLibraryView` via `vaultFileAdapter` + `extractStringArray` (vault-file skills only); home-scope (Codex `~/.codex/skills`) and runtime-discovered (Opencode) skills carry none. `SkillLibraryRow` gains `tags: string[]`. No provider-catalog change | `SkillEditorModal` gains a comma-separated tag input that upserts the frontmatter `tags` key via a new `setFrontmatterList` helper (editable vault skills only; read-only rows display tags but cannot edit) |

Tag input UX: a simple comma/Enter-separated chip input. Empty `tags` is omitted
from frontmatter/JSON (no noise on untagged items).

Cards render user tags as `specorator-library-chip` chips alongside the existing
role/provider chips. Implicit facets (agent role, skill provider) are *also* fed
to the filter engine as pseudo-tags so one chip row filters everything.

### 4. Duplicate / clone

A copy icon button (`setIcon` `'copy'`, tooltip "Duplicate") in each row's
actions:

- **Agent**: clone the `RosterAgent` with a fresh deduped id/slug and name
  "`<name>` copy"; `store.save`; open the detail editor on the clone.
- **Skill**: copy the `SKILL.md` directory to a `uniqueChildDir`; name "`<name>`
  copy"; invalidate the `claude` skill bucket; open the editor on the clone.
- **Loop**: copy the loop note to a unique path; name "`<name>` copy";
  `store.save`; open the editor on the clone.

### 5. Skill prompt — direct

Skill rows get a `Prompt` button (`mod-cta`). The view keeps the source
`SkillTabEntry` alongside each `SkillLibraryRow` (the aggregator already returns
entries), so the button calls the existing `runVaultSkill(plugin, entry, null)`
unchanged — provider re-check, tab resolution, `$name`/`/name` dispatch, and the
`usage.recorded` emit all reuse the proven path. No model modal.

### 6. Loop prompt — model picker → seed draft

New `features/tasks/loops/launchLoopPrompt.ts`:

1. Resolve preset provider/model (last-used keyed `loop:<id>`, else global default)
   — reuse the same resolution logic factored out in §7.
2. Open the generalized model picker (title = loop name).
3. On confirm: resolve/create a chat tab on the chosen provider+model (mirroring
   `runVaultSkill`'s tab-resolution order), then **seed** the loop's rendered body
   into that tab's composer as draft — no auto-send.

**Loop body** = `Approach / Steps / Verify / Notes` (the same content
`renderTaskPrompt` injects, minus `useWhen`), assembled by a small
`renderLoopPromptText(loop)` helper.

**Composer seed seam**: `InputController` gains a public
`seedComposerDraft(content: string)` that sets `getInputEl().value = content` and
dispatches an `input` event (so autosize/validation update) **without** sending.
This factors the value-set half out of the existing private `autoResumeWith`
(which sets-then-sends); `autoResumeWith` is refactored to call the new method
then `sendMessage`, keeping its behavior identical.

### 7. Model picker generalization

`QuickActionLaunchModal` is coupled to `QuickAction` only for its title. Generalize:

- New `shared/modals/ModelLaunchModal.ts` — content-agnostic. Same provider/model
  dropdowns, fallback notice, Enter-to-run, and `onConfirm({ providerId, model })`,
  but takes `title: string` instead of `action: QuickAction`.
- New `shared/launchWithModelPicker.ts` — extracts the preset-resolve →
  open-modal → re-check-enabled → persist-last-used dance currently inline in
  `launchQuickAction`. Signature:
  `launchWithModelPicker(plugin, { lastUsedKey, title, onConfirm })`.
- `launchQuickAction` becomes a thin caller of `launchWithModelPicker`
  (`lastUsedKey = 'qa:<stem>'`) — **behavior identical**, existing tests stay green.
- `launchLoopPrompt` calls it with `lastUsedKey = 'loop:<id>'`.
- The last-used store (`QuickActionLastUsedStore`) already accepts an arbitrary
  string key, so quick-actions and loops share it with no plumbing change.
  Quick-actions keep their existing **bare stem** keys (preserving persisted
  last-used data); loops use a `loop:<id>` prefix. The two never collide — a
  quick-action stem cannot contain a colon.

## Data model summary

```ts
// rosterTypes.ts
interface RosterAgent { /* … */ tags?: string[] }

// loopTypes.ts
interface LoopDefinition { /* … */ tags?: string[] }
interface SaveLoopInput  { /* … */ tags?: string[] }

// skillLibraryRows.ts
interface SkillLibraryRow { /* … */ tags: string[] }
```

## File-by-file

**New**
- `src/shared/libraryToolbar.ts` — `LibraryListController` + toolbar render.
- `src/shared/modals/ModelLaunchModal.ts` — generalized provider/model picker.
- `src/shared/launchWithModelPicker.ts` — shared preset/open/persist seam.
- `src/features/tasks/loops/launchLoopPrompt.ts` — loop prompt flow.
- `src/features/tasks/loops/renderLoopPromptText.ts` — loop body → draft text.

**Modified**
- `src/utils/libraryView.ts` — interactive card; drop name-button path.
- `src/features/agents/roster/view/AgentRosterView.ts` — toolbar, tags chips, clone, interactive card.
- `src/features/agents/roster/view/AgentDetailEditor.ts` — tag input.
- `src/features/agents/roster/rosterTypes.ts` — `tags`.
- `src/features/skills/view/SkillLibraryView.ts` — toolbar, Prompt button, tags (parse from frontmatter), clone, interactive card; keep source `SkillTabEntry` beside each row for prompting.
- `src/features/skills/view/SkillEditorModal.ts` — comma-separated tag input that upserts frontmatter `tags`.
- `src/features/skills/skillLibraryRows.ts` — `tags`.
- `src/utils/frontmatter.ts` — `setFrontmatterList(content, key, values)` upsert helper.
- `src/features/tasks/ui/LoopLibraryView.ts` — toolbar, Prompt button, tags, clone, interactive card.
- `src/features/tasks/ui/LoopEditorModal.ts` — tag input.
- `src/features/tasks/loops/loopTypes.ts` — `tags`.
- `src/features/tasks/loops/LoopNoteStore.ts` — parse/build `tags`.
- `src/features/chat/controllers/InputController.ts` — public `seedComposerDraft`.
- `src/features/quickActions/launchQuickAction.ts` — call `launchWithModelPicker`.
- `src/features/quickActions/ui/QuickActionLaunchModal.ts` — re-export/replace via `ModelLaunchModal`.
- i18n: new strings (search placeholder, sort labels, filter/reset, tags label, Prompt, Duplicate) across all 10 locales.

## Testing

**Unit**
- `LibraryListController`: search match, sort name vs updated, OR-chip filter, reset.
- `LoopNoteStore`: `tags` frontmatter round-trip (parse ⇄ build), absent-tags omission.
- `renderLoopPromptText`: includes Approach/Steps/Verify/Notes, excludes Use-when.
- `launchWithModelPicker`: preset resolution, fallback notice, last-used persist with prefixed key; parity with prior `launchQuickAction` behavior.
- `launchLoopPrompt`: confirm seeds draft, **does not** call `sendMessage`.
- `InputController.seedComposerDraft`: sets value, fires `input`, no send; `autoResumeWith` still sends.
- Clone helpers: unique id/slug + "copy" naming for each view.

**Integration**
- Each view renders the toolbar, tag chips, Prompt/clone affordances; agent row has no name button and opens on Enter.

**Regression**
- Existing quick-actions launch tests stay green (identical behavior).
- Library perf specs unaffected (lists stay small; no windowing change).

## Risks & mitigations

- **Touching the tested quick-actions launch path.** Mitigation: keep behavior
  byte-for-byte; `launchQuickAction` only changes its internals to delegate;
  run the quick-actions suite.
- **Skill tags only cover vault-file skills.** Home-scope (Codex) and
  runtime-discovered (Opencode) skills have no readable vault path, so they show
  no tags. Acceptable: the in-app skill authoring path writes to `.claude/skills`
  (vault). Documented, not blocking.
- **Read-only skills.** Tag editing is gated on `editable`; read-only rows show
  tags but the editor input is disabled, matching existing read-only handling.

## Open questions

None — all forks resolved above.
