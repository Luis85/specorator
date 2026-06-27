---
title: Edited-files badge + floating popover (replace the unbounded chip strip)
date: 2026-06-27
status: approved
scope: features/chat
---

## Problem

The agent-edited-files strip (`EditedFilesView`) renders one clickable chip per
created/edited file in a `flex-wrap: wrap` row directly above the composer. The
list is per-conversation, sticky, and never trimmed, so on multi-file turns the
row wraps onto many lines and grows vertically. As it grows it pushes the
composer down and shrinks the chat-message area above it — at ~10 files the chat
becomes hard to read. Placement above the composer is fine; the unbounded
inline list is the problem.

## Goal

Replace the wrapping chip strip with a single-line **badge** that summarizes the
count and expands a **floating popover** listing every file grouped by kind.
The collapsed badge has a fixed height, so the composer never grows; the popover
floats over the messages with zero layout shift.

This is a view-layer change only. Detection, `ChatState.editedFiles`, transcript
derivation, and the `showAgentEditedFiles` setting are untouched.

## Decisions (from brainstorming)

- **Collapse to a badge** — not a bounded inline list, not a header dropdown.
- **Floating popover** — overlays upward over chat messages, anchored to the
  badge. Zero layout shift. Click-away / Esc closes. (Inline expand was
  rejected because it reintroduces the growth on open.)
- **Kind-split badge label** — `3 created · 7 edited`, graceful when one kind is
  zero. No ICU plural; "1 edited" is acceptable.
- **Grouped popover** — a **Created** section then an **Edited** section; each
  row is kind icon + basename + muted parent dir, click-to-open.

## Design

### Component (single-file rewrite)

`EditedFilesView` keeps its public surface: constructor
`(rowEl: HTMLElement, { onOpenFile })`, `render(entries)`, `destroy()`, and the
same `EditedFileEntry[]` input. Internals swap from the chip strip to a badge +
popover, mirroring the in-house `WorkOrderActivityDropdown` idiom (toggle div
with count, custom popover `div` with `role="menu"`, re-render on toggle, ARIA
wired).

- **Badge** — a toggle `div` (`role="button"`, `aria-haspopup="menu"`,
  `aria-expanded`, `tabindex=0`) holding a leading edit icon, the kind-split
  count text, and a `chevron-down`. Click / Enter / Space flips an internal
  `open` flag and re-renders.
- **Popover** — an absolutely-positioned `div` (`role="menu"`) rendered only
  when `open`, anchored upward (`bottom: 100%`) so it overlays the messages.
  Contains up to two groups (**Created**, **Edited**); empty groups are omitted.
  Each group is a header label plus rows; each row (`role="menuitem"`,
  `tabindex=0`) shows the kind icon, the basename, and the muted parent
  directory. `max-height` with internal `overflow-y: auto` bounds very long
  lists.

### Badge label (kind-split, graceful)

Derived from the entries' `changeKind` counts:

- both kinds present → `<icon> 3 created · 7 edited <chevron>`
- created only → `<icon> 3 created <chevron>`
- edited only → `<icon> 7 edited <chevron>`
- zero entries → row hidden (existing empty behavior preserved)

The `·` separator is a literal in code; `created` / `edited` phrases come from
i18n with a `{count}` interpolation (no plural variants).

### Interaction

- Clicking the badge toggles the popover open/closed.
- Clicking a row re-resolves the path at click time (existing `openEditedFile`,
  which shows a Notice if the file was since deleted), opens it via
  `workspace.openLinkText`, then **closes the popover**.
- **Click-away** (a `document` mousedown listener) and **Esc** close the
  popover. The listeners are attached when the popover opens and torn down on
  close and in `destroy()` to avoid leaks.

### Layout-shift kill

The row now holds a single-line badge, so its height is fixed (~24px) and
`flex-wrap` is removed — the composer no longer grows with file count. The
popover is `position: absolute` over the messages with a `z-index` above the
message list; the row becomes the `position: relative` anchor.

> Implementation gotcha to verify: the popover opens **upward**, unlike
> `WorkOrderActivityDropdown` (which opens downward in the header). Confirm no
> input-wrapper ancestor clips it with `overflow: hidden`; if one does, set
> `overflow: visible` on that chain or raise the popover onto a higher layer.

### State and setting

No change. `ChatState.editedFiles` (most-recent-first, deduped, sticky-created)
still feeds `render()`. `showAgentEditedFiles` (default on) still gates whether
anything is tracked or rendered.

## Files touched

- `src/features/chat/ui/EditedFilesView.ts` — rewrite: label builder, group
  helper, badge toggle, popover render, click-away/Esc dismissal.
- `src/style/components/input.css` — replace the `.specorator-edited-file*`
  strip rules with badge, popover, group-header, row, muted-dir, scroll-cap, and
  upward-anchor styles; drop `flex-wrap` growth.
- `src/i18n/types/chat.ts` + the 10 `src/i18n/locales/*.json` — add keys
  `chat.editedFiles.created`, `.edited`, `.groupCreated`, `.groupEdited`,
  `.toggleAria`; drop or repurpose the now-unused `chat.editedFiles.label`.
- `tests/unit/features/chat/ui/EditedFilesView.test.ts` — rewrite for the
  badge + popover behavior.

## Scope guardrails (v1)

- Open-only rows (no per-row diff or dismiss).
- Reuse existing detection and state; no new tracking.
- Keyboard support is tab order + Enter/Space on badge and rows, plus Esc to
  close — no arrow-key roving (matches `WorkOrderActivityDropdown`).
- Created + edited only (deletions still not listed); vault files only; top-level
  tool calls only — all inherited unchanged from the current feature.

## Tests

- **Badge label**: both kinds; created-only; edited-only; singular counts;
  empty hides the row.
- **Toggle**: click opens/closes; `aria-expanded` tracks state.
- **Popover**: group order (Created before Edited); empty group omitted; row
  content (icon + basename + muted dir); row click opens the file and closes the
  popover.
- **Dismissal**: click-away closes; Esc closes; listeners removed on close and
  `destroy()`.
- **i18n**: structural parity across all 10 locales for the new keys.
