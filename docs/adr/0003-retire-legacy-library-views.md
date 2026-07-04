---
title: Retire the legacy library views and the useVueLibrary flag
date: 2026-07-04
status: accepted
scope: src/features/library, src/features/agents/roster, src/features/skills, src/features/tasks (loop library), src/app/views, src/app/commands, src/style
supersedes: none
relates-to: docs/superpowers/specs/2026-07-04-library-consolidation-design.md, docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md
method: codebase audit (flag/view/CSS consumer greps, per-deletion audit gates) + QA sign-off on the unified Library
---

# ADR 0003 — Retire the legacy library views

## Status

**Accepted and implemented** (2026-07-04, library consolidation, PR #478).

## Context

The unified Library (`LibraryView`, a per-leaf Vue 3 + Pinia island) shipped
behind the `useVueLibrary` flag, default **off**, alongside three legacy
imperative views: `AgentRosterView`, `SkillLibraryView`, and
`LoopLibraryView`, each with its own ribbon icon. The plan of record said the
legacy views and their CSS would die "in the v4.0.0 deletion pass".

That milestone no longer exists: the plugin is **published** (v1.2.x under
the Specorator name) and there is no major-version breaking release to defer
to — the deletion pass IS this change. Meanwhile QA approved the unified
Library at feature parity, so keeping two implementations of every library
surface only cost maintenance (double CSS, double tests, flag branches in
view registration, `setState` redirect shims) without protecting anyone.

## Decision

1. **Hard cut, no shims.** Delete the `useVueLibrary` flag (settings type,
   defaults, registry field, 10 locales) and the three legacy view classes,
   their view-type registrations, and the legacy-view-type↔tab maps. No
   redirect views are registered for the retired view types.
2. **Single ribbon.** The three library ribbons collapse into one
   "Open Library" ribbon (`library-big`), revealing the Library on its
   current tab. The old command ids (`open-agent-roster`,
   `open-skill-library`, `open-loop-library`) survive as tab deep-links —
   registered on the registrar path so hotkeys keep working — joined by
   `open-library` and `open-quick-actions`.
3. **Quick Actions join the Library.** A fourth tab gives quick actions full
   management (run/edit/duplicate/favorite/delete) by reusing
   `QuickActionStorage`, `QuickActionEditorModal`, and
   `runQuickActionForFile` unchanged in behavior.
4. **Per-deletion audit gates.** Every deleted export, CSS rule, and i18n key
   required a consumer grep showing zero remaining ts/vue references before
   removal; ratchet baselines (LOC, CSS `!important`, fallow quality) were
   re-locked in the same commits with diffs limited to removals/improvements.

## Consequences

- **Stale saved leaves show an empty pane once.** A workspace layout saved
  with a legacy view type open renders Obsidian's default "no view" pane
  after upgrade (user-accepted); closing it and using the Library ribbon is
  the recovery. No data is involved — the views were projections.
- **What stays imperative.** The skill/loop editor modals
  (`.specorator-library-modal-*` CSS) and the embedded `AgentDetailEditor`
  (`.specorator-roster-detail*` CSS) remain imperative Obsidian DOM until
  their own migrations; `library.css` and `agent-roster.css` now carry only
  those remnants.
- **The "v4.0.0 deletion pass" framing is retired repo-wide.** Deferred
  deletions (e.g. the settings legacy renderers,
  `docs/issues/settings-registry-port-followup.md`) land as dedicated passes
  gated on their own verification, not on a version milestone.

## References

- Design: `docs/superpowers/specs/2026-07-04-library-consolidation-design.md`
- Plan: `docs/superpowers/plans/2026-07-04-library-consolidation.md`
- Style fork that preceded the cut: `docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md`
