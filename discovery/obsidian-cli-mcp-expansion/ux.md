# UX — Obsidian-CLI MCP Expansion

Scope: chat sidebar (~400 px) only. Treatment names (tokens, components) are placeholders for `ui-designer`.

## 1. Tool-class flows

Four classes, derived from blast radius, not tool name:

| Class | Examples | Flow |
|---|---|---|
| **Read** | `vault:list`, `property:get`, `task list` | Inline result block under the tool call. No proposal. Collapsible after 5 lines. |
| **Safe-write** | `property:set`, `task toggle`, `obsidian_cli_append_note` | Proposal card. Per-tool auto-accept toggle (default: `task toggle` ON, `property:set` ON when value length ≤ 80 chars, `append_note` OFF). |
| **Risky-write** | `file:create`, `file:move`, `file:delete`, `history:restore`, `plugin:install`, `command:run` | Proposal card, never auto-accept. Risky-write requires the agent to also include a one-sentence `intent` field; sidebar refuses to render the accept button if missing. |
| **Interactive** | `obsidian_cli_web`, `dev:dom`, `dev:screenshot` | Opens side effect in Obsidian surface (webviewer pane, devtools), returns a *handle* to the agent. Sidebar shows a compact "opened" stub with a "View" affordance that focuses the surface. |

Auto-accept policy is per-class **and** per-tool, surfaced in Settings; every auto-accepted action still posts a card (collapsed, `auto` badge) so the timeline is auditable. An "Undo last auto-accept" affordance lives at the bottom of the chat composer for 10 seconds after acceptance.

## 2. New proposal-card types

All cards share: title row (verb + target), intent line (one sentence), diff/preview region, accept/reject row, kebab for "show raw tool call". Differences:

- **Append** (existing): preview shows added lines with a `+` gutter.
- **Create**: shows target path + first 20 lines of new body. If path collides, card flips to error state ("target exists — agent must use append or choose new path").
- **Move/rename**: two-line `from → to` row, no body diff. If `to` exists, blocked the same way.
- **Delete**: target path, file size, last-modified, and the first 10 lines of current content (so the user sees what they're losing). Accept button reads "Delete" and is the destructive variant; requires a second confirm tap (single tap to arm, second to confirm; arms reset after 5 s). Keyboard: `Enter` arms, second `Enter` confirms.
- **Property set**: target file + `name: old → new`. Multi-property bundle if the agent submits ≥ 2 in one turn (see §4).
- **History restore**: before/after diff (unified, scrollable), restore source (snapshot timestamp or sync version), and a "preview in main pane" link.
- **Plugin install/enable**: plugin id, author, repo URL (read-only, copyable, NOT linkified to prevent click-through fakery), and a trust-list toggle ("Trust this plugin's author for future installs"). First install from any author is always manual.
- **Command run**: palette id, resolved human label from the command registry, and the intent line. If the registry lookup fails the card is blocked with "Unknown command — reject".

## 3. Webviewer integration

`obsidian_cli_web` opens the page in Obsidian's webviewer pane (not inline). Sidebar shows a "Opened *page title* — webviewer" stub with: URL (truncated middle-ellipsis, full URL in tooltip and to screen readers), favicon slot, and three actions: **Focus**, **Snapshot DOM** (chains `dev:dom`), **Screenshot** (chains `dev:screenshot`). Snapshot/screenshot results return as new tool-call blocks under the same turn, threaded with a leader line.

No inline iframe. Rationale: iframes in a 400 px column are unreadable, leak focus traps, and conflict with sidebar keyboard nav. The webviewer pane is the correct surface; the sidebar is the conversation about it.

Accessibility: the webviewer pane is owned by Obsidian; we only annotate our stub. Stub announces "Opened web page, *title*, in webviewer pane" via `aria-live=polite`. DOM-snapshot results render as a `<details>` with the page title as summary so screen readers can skip the dump.

## 4. Batch-proposal handling

Threshold: ≥ 3 proposals in one agent turn collapses into a **Plan card** with header ("Agent proposes 7 changes across 4 files"), a per-item compact row (verb + target + tiny diff hint), and three actions: **Accept all**, **Reject all**, **Review individually** (expands to standard cards). Each row has its own checkbox; "Accept selected" appears once any row is unchecked. Risky-write items are pre-unchecked and labelled "needs review" — accept-all on a plan containing risky-writes is disabled until each is opened once.

Keyboard: `j/k` between rows, `space` toggles, `a` accept-all, `r` reject-all, `Enter` opens row detail.

## 5. States

- **Empty**: no card. Settings panel shows "No pending proposals" only when the user opens the queue view.
- **Loading**: card renders skeleton (target path + spinner) while the diff is being computed; accept button disabled with `aria-busy=true`. Timeout after 8 s → error state.
- **Error**: red-bordered card with reason ("Target file moved during proposal", "Plugin registry unreachable", "Command id no longer registered"). Two actions: **Dismiss**, **Ask agent to retry** (posts a synthetic user turn with the error).
- **Restored-from-history**: after a `history:restore` accept, the affected file's next message reference shows a `restored` badge for the remainder of the session, so the agent's context window is visibly distinct from the file's true content. Hover/focus reveals the snapshot timestamp.
- **Auto-accepted**: collapsed card with `auto` badge and a "Why?" affordance that shows which rule fired.
- **Conflict (mid-proposal vault change)**: card flips to a warning state with "File changed since proposal — view current" link; accept disabled until user dismisses or re-requests.

Accessibility baseline: every card is a `<section role="group" aria-labelledby="...">`; accept/reject pairs use `aria-describedby` pointing at the intent line; destructive confirms announce "Press again to confirm delete" via `aria-live=assertive`; data-table outputs from `vault:list` / `task list` render as real `<table>` with `<caption>` and column headers, not divs.
