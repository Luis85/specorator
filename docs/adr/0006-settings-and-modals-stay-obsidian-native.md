---
title: Settings and modals stay Obsidian-native — the Vue island set is closed
date: 2026-07-17
status: accepted
scope: src/features/settings, src/shared/settings, src/shared/modals, src/features/inline-edit, src/features/quickActions/ui, src/features/tasks/ui (modals), provider settings UIs
supersedes: none
relates-to: docs/adr/0003-retire-legacy-library-views.md, docs/adr/0004-agent-board-vue-migration.md, docs/adr/0005-chat-shell-vue-migration.md
method: product decision (owner call, 2026-07-17) + codebase audit of remaining imperative surfaces after ADR 0005 sub-project 4
---

# ADR 0006 — Settings and modals stay Obsidian-native

## Status

**Accepted** (2026-07-17, owner decision).

## Context

After ADR 0005 sub-project 4 (PR #490), every *view* surface is a Vue 3 +
Pinia island: the Library (ADR 0003), the Agent Board (ADR 0004), and the
entire chat feature — shell, transcript, composer, side panels, and header
widgets (ADR 0005). An audit of what remained imperative found exactly two
families:

1. **Settings** — the registry-rendered settings tabs
   (`features/settings/registry/`), the provider-owned settings widgets
   (Claude/Codex/Cursor/Opencode agent, skill, and command managers), the MCP
   management dialogs, and `shared/settings` helpers.
2. **Modals** — the Obsidian `Modal` subclasses in `shared/modals`, the tasks
   pickers/editors (`LoopPickerModal`, `WorkOrderTemplatePickerModal`,
   `AddToWorkOrderModal`, `CommitOnAcceptModal`, `LoopEditorModal`), the
   quick-actions pair (`QuickActionsModal`, `QuickActionEditorModal`), and
   `InlineEditModal` (the inline-edit flow).

The open question was whether these become Vue "sub-project 5+".

## Decision

**They do not. Settings and modals are and will remain implemented with
Obsidian-native tools** (`PluginSettingTab`, `Setting`, `Modal`,
`SuggestModal`, `createEl`/`createDiv` DOM building) — they are permanently
out of scope for the Vue migration. With this decision the Vue island set is
**closed**: Library, Agent Board, and chat (plus the shared
`.specorator-vue` style baseline). New view-level product surfaces may still
choose the island pattern, but no existing native surface gets rewritten in
Vue as a migration goal.

Rationale:

- Settings tabs and modals are Obsidian's home turf: the native `Setting`
  rows and `Modal` chrome already deliver platform-consistent look, focus
  handling, and accessibility for free, and these surfaces are neither
  streaming-coupled nor projection-shaped — the properties that justified
  Vue for the board and chat (reactive read-models over a live engine) don't
  apply.
- The migration's cost model (spec → plan → island seam → DOM-contract tests
  → ratchet re-locks per surface) is not worth paying for form-shaped UI
  that changes rarely.

## Consequences

- **Inline-edit stays native**, so the shared imperative
  `SlashCommandDropdown` (plus `composerDropdownDelegate` /
  `dropdownNavigation` and the `SelectableDropdown` family it shares) is
  **retained permanently**, not "until inline-edit migrates". ADR 0005's
  framing of it as the last retained engine widget is now the end state.
- **Already-Vue modal internals are grandfathered, not reverted**: the Agent
  Board's `WorkOrderDetailModal` / template editor / lane editor internals
  (ADR 0004) and the Library's editor handoff keep their Vue islands inside
  native `Modal` shells. The decision governs future work only.
- **The settings legacy-renderer deletion pass** (tracked since ADR 0003,
  gated on manual vault verification) proceeds as Obsidian-native cleanup —
  deleting the pre-registry fallback renderers is unrelated to Vue.
- Native surfaces keep using the shared imperative helpers
  (`shared/settings/*`, `LucideIconPicker`, `settingsListUI`); these are not
  migration debt. Vue islands must not grow dependencies on them beyond the
  existing grandfathered seams (e.g. `LucideIconField.vue` wrapping the
  picker).
- The `check:css` / `check:loc` / fallow ratchets continue to apply equally
  to both worlds; "native" is not an exemption from the quality gates.

## What "finishing the Vue migration" now means

With this ADR, the migration program is complete when ADR 0005 sub-project 4
(PR #490) merges. Remaining work items are ordinary debt inside the closed
island set, not new migrations — chiefly the tracked ADR 0005 deferrals
(auto-turn retry-suppression parity, the consolidated provider-lifecycle
spawn/wait/close card, the `InlineAskUserQuestion.renderTabBar` vs `TabStrip`
consistency audit) and optional componentization of the remaining
Vue-mounted DOM helper hosts under `features/chat/rendering/`
(`DiffRenderer`, `askUserQuestionRenderer`, `WorkOrderProtocolDisplay`),
which already render inside Vue-owned hosts and migrate only if touched for
other reasons.
