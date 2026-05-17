# WP-8 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp08-ux-polish-wave` inside `.worktrees/asv3-wp08/`, not on this branch.

## Iterations

### 2026-05-17 — Iteration 1: i18n migration (UX #18)

- Added new keys to `src/ui/i18n/locales/en.ts` AND `de.ts`:
  - `chat.contextOverflow`, `chat.contextOverflowAriaLabel`
  - `chat.session.resumeLabel`
  - `agent.emptyStateTiles.*` (heading/slash/mention/send/escape)
  - `agent.newMessagesPill`, `agent.newMessagesPillAriaLabel`
  - `agent.planApprovalCancelled`
  - `agent.help.*` (heading/close/closeAriaLabel/openAriaLabel)
- `mention` tile copy renders `@` as "the at-sign" plain text — vue-i18n
  treats a literal `@` as the linked-translation operator and refuses to
  compile a message starting with `@`.
- ChatInput placeholder + send button labels now bind to `t('chat.*')`.
- ChatSidebar header title binds to `$t('chat.title')`.

### 2026-05-17 — Iteration 2: small visual fixes batched

- UX #16 (Stop styling): `ChatSidebar.vue` `.sp-chat__stop` now uses
  `--background-secondary` border/background with `--text-normal`. Hover
  goes to `--interactive-hover`.
- UX #17 (Resume label): `SessionResumeIndicator.vue` now renders the
  `↻` glyph plus a visible "Resumed" text label, on a tinted pill.
- UX #20 (Pills differentiation):
  - SubprocessStartingPill → leading `⌛` + muted-border background.
  - TransportStatusPill → leading `▶` + faint-blend background.
  - SessionResumeIndicator → leading `↻` + success-tint background.
- UX #14 (ContextFileChip overflow):
  - Switched `.sp-chat__chip-label` from `max-width: 14rem` to flex
    shrinking (`flex: 0 1 auto; min-width: 0`) so chips yield
    proportionally to the row.
  - Rewrote `ContextFileList.vue` with a `VISIBLE_CHIP_LIMIT = 6` cap
    and a `+N more` overflow button + popover (data-testid
    `context-chip-overflow` / `context-overflow-popover`).

### 2026-05-17 — Iteration 3: MessageList changes (UX #11 + UX #8)

- UX #11 (empty-state tiles): the empty state now renders an
  `agent-message-list-empty-tiles` grid with four starter tiles
  (`slash`, `mention`, `send`, `escape`). Each tile emits
  `tile-action` with its key.
- UX #8 (scroll-pin guard):
  - Tracks `isAtBottom` with a 32 px tolerance via a passive scroll
    listener on the scroll container.
  - Coalesces auto-scroll writes through `requestAnimationFrame` so
    bursts of streaming deltas don't thrash scrollTop.
  - When new content arrives while the user is scrolled up, the
    "↓ New messages" pill (data-testid `agent-message-new-pill`)
    appears and `jumpToBottom()` resets to the latest message.
  - The rAF coalescing lives in WP-8 (UX #8 + part of WP-10's perf
    scope); WP-10 is expected to leave it here, not duplicate it.
- Added MessageList PageObject helpers and tests for UX #11 (4 tile
  count, click emission, per-tile key emission) and UX #8 (no-pill at
  bottom, pill when scrolled up — uses a geometry-mocking helper so
  jsdom can simulate scrollHeight/clientHeight/scrollTop).

### 2026-05-17 — Iteration 4: InlinePlanApprovalCard (UX #19 + UX #12)

- UX #19: plan body renders via `<MarkdownBlock :text="planMarkdown" />`
  instead of `<pre>{{ planMarkdown }}</pre>`. The data-testid stays
  `agent-plan-approval-plan`.
- UX #12: added a `persistOnUnmount` prop (default `true`) and a new
  `pending-changed` emit. On mount we emit `pending-changed(true)`; on
  resolve / decision we emit `pending-changed(false)`. When
  `persistOnUnmount=true`, unmount is treated as a transient hide and
  does NOT auto-cancel — the parent (a future production wiring via
  `ApprovalPort`) can re-surface the unresolved plan on remount.
  Existing tests opt into `persistOnUnmount=false` to preserve the
  legacy "auto-cancel on unmount" semantics.

### 2026-05-17 — Iteration 5: /help popover (UX #4)

- `/help` no longer renders as a sibling drawer above `MessageList`.
  The `AgentSidepanelRoot` template now wraps the header in a
  `.sp-agent__header-wrap` (position: relative) container and the
  `.sp-agent__help` div renders as a popover (`position: absolute;
  top: 100%`) inside it. The popover floats over the chat surface and
  the message list stays in view on a narrow sidepanel.
- All popover copy now flows through `t('agent.help.*')` so the
  hardcoded "Available slash commands" / "Close" / "Close help" / "Slash
  command help" strings are localised.
- Wired `MessageList` `tile-action` event to a root handler that
  pre-fills `messagesStore.userText` with `'/'` for the `slash` tile,
  `'@'` for the `mention` tile, and no-op for the informational tiles.

### 2026-05-17 — Iteration 6: full pre-PR gate

- `npm audit --audit-level=high --omit=dev` → 0 vulnerabilities.
- `npm run typecheck` → clean.
- `npm run lint` → 0 errors, 24 unrelated warnings (pre-existing
  vue/one-component-per-file + prop-types in unrelated test files).
- `npm run test` → 143 files, 1794 tests, all green.
- `npm run build` → plugin bundle built.
- `npm run build:web` → standalone bundle built.
- `npm run docs:api` → 0 errors (1 pre-existing warning unrelated to
  this PR).

All DoD boxes checked. Ready to commit and open PR.

### 2026-05-17 — Iteration 7: rebase + PR open

- Before commit, `git pull --rebase origin develop` fast-forwarded the
  branch by 7 commits (incl. TransportLifecyclePort + collectStream
  landings). Stashed/popped the working tree across the rebase.
- One residual `obsidianmd/prefer-active-window-timers` lint error
  surfaced on the new `setTimeout` in `MessageList.test.ts` — added a
  scoped `eslint-disable-next-line` with a "jsdom-only test helper"
  comment, since these tests never run inside Obsidian's popout-window
  environment.
- Re-ran the full pre-PR gate post-rebase: audit/typecheck/lint/test
  (1792 / 144 files) / build / build:web / docs:api all green.
- Committed as `c7dc199 feat(asv3): UX polish wave (WP-8)` and pushed
  to `origin/claude/asv3-wp08-ux-polish-wave`.
- Opened PR #403 against `develop` via `mcp__github__create_pull_request`.

## Carry-out items

- No `[carry-out]` items so far. WP-7 has not pushed any commits yet
  (its branch tip equals `origin/develop`), so there is no collision
  to coordinate.
- During the rebase, a transient auto-commit landed in this worktree
  with a WP-7 commit message but a WP-8 diff. Soft-reset and re-committed
  with the correct WP-8 message before pushing. No upstream
  consequences (the bogus commit never reached origin).
