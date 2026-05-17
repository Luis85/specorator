# WP-8 — UX polish wave

**Branch:** `claude/asv3-wp08-ux-polish-wave` (cut from `origin/develop` AFTER WP-2's PR #400 merged)
**Lane:** Store + UX (depends on WP-2; parallel with WP-7)
**Estimated size:** medium (~400–700 LOC across components + tests; many small surfaces touched, each is small)

## Goal (one sentence)

Close the cluster of UX P2/P3 findings from the v2 audit that don't fit anywhere else — `/help` inline, scroll-pin, empty-state tiles, Stop styling, plan-card persistence, hardcoded English, pill differentiation, ContextFileChip overflow.

## Why (reviewer sources)

From the UX review, items not absorbed by WP-2 / WP-7:

- **UX #4 (P1) — `/help` slash command opens a panel ABOVE the chat that pushes history offscreen.** `AgentSidepanelRoot.vue:148-180`. Render as a popover anchored to the input, OR as an inline assistant-like bubble appended to `MessageList`.
- **UX #8 (P2) — Auto-scroll strands the user reading earlier history.** `MessageList.vue:105-119`. Unconditional `scrollTop = scrollHeight` on every delta; yanks the user back to the bottom mid-stream. Fix: track `isAtBottom`; only auto-scroll when already at the bottom; show "↓ New messages" pill when not.
- **UX #11 (P2) — Empty state never surfaces affordances.** `MessageList.vue:206-208`. One italic line; new users miss slash, mention, plan mode, multi-thread, Stop. Replace with a 4-tile starter card.
- **UX #12 (P2) — Plan-approval card auto-cancels on unmount.** `InlinePlanApprovalCard.vue:134-139`. If the user closes the sidepanel mid-plan, plan is silently cancelled. Persist plan-pending state via `ApprovalPort`; on remount, re-surface the unresolved plan.
- **UX #14 (P2) — ContextFileChip truncation invisible at narrow widths.** `ContextFileChip.vue:87-91`. `max-width: 14rem` (~224 px) — chips clip with no overflow indication. Make max-width flex-based; add `+N more` overflow chip with popover.
- **UX #16 (P3) — Stop button styling overstates the consequence.** `ChatSidebar.vue:1236-1247`. Uses `--background-modifier-error` (red). Stop just aborts a stream. Use neutral chrome (`--background-secondary`).
- **UX #17 (P3) — SessionResumeIndicator has no visible text label.** `SessionResumeIndicator.vue:23-34`. Bare `↻` glyph with `aria-label`. Add inline "Resumed" text or convert to labelled pill.
- **UX #18 (P3) — Hardcoded English strings.** `ChatSidebar.vue:1137` ("Ask Claude."), `ChatInput.vue:336` ("Ask anything about your work…"), `ContextFileList.vue:17,32`. Pull through i18n.
- **UX #19 (P3) — Plan markdown rendered as `<pre>`.** `InlinePlanApprovalCard.vue:156-159`. Use `<MarkdownBlock :text="planMarkdown" />`.
- **UX #20 (P3) — Three pills look identical.** `SubprocessStartingPill`, `TransportStatusPill`, `SessionResumeIndicator` share chrome. Differentiate via leading icon glyph (▶ for transport, ↻ for resume, ⌛ for starting) and per-pill background tint.

## Scope — files in

**Modified:**
- `src/ui/agent/AgentSidepanelRoot.vue` — `/help` becomes a popover anchored to the input (or inline bubble in MessageList — implementer's call; document in loop-state). The drawer that pushes history offscreen is removed.
- `src/ui/components/agent/MessageList.vue`:
  - **UX #8** — track `isAtBottom`; rAF-throttle the auto-scroll; only pin when already at the bottom; show a "↓ New messages" floating pill when new content arrives while scrolled up.
  - **UX #11** — empty-state replaced with a 4-tile starter card: "Type `/` for commands" / "Type `@` to attach a file" / "Cmd/Ctrl+Enter to send" / "Esc to dismiss". Each tile click pre-fills the textarea.
- `src/ui/components/agent/InlinePlanApprovalCard.vue`:
  - **UX #19** — `planMarkdown` rendered via `<MarkdownBlock>` (delegates to the existing markdown-render port).
  - **UX #12** — replace the `onBeforeUnmount` auto-cancel with a persistence call through `ApprovalPort`; on remount, re-surface the unresolved plan. Add a `NotificationPort.showInfo('Plan was cancelled.')` on unmount-cancel (fallback path).
- `src/ui/components/chat/ContextFileChip.vue` — flex-based max-width; integrate with parent `ContextFileList`.
- `src/ui/components/chat/ContextFileList.vue` — render `+N more` overflow chip with a popover listing the hidden chips.
- `src/ui/components/chat/ChatSidebar.vue` — Stop button styling; pull hardcoded English `'Ask Claude.'` and any siblings through i18n.
- `src/ui/components/chat/ChatInput.vue` — pull hardcoded `'Ask anything about your work…'` through i18n.
- `src/ui/components/chat/SessionResumeIndicator.vue` — visible "Resumed" text + accent chrome.
- `src/ui/components/chat/SubprocessStartingPill.vue` + `TransportStatusPill.vue` + `SessionResumeIndicator.vue` — pill differentiation (icon + tint).
- `src/ui/i18n/locales/en.ts` + `de.ts` — new keys for the hardcoded strings and the empty-state tiles.

**New tests:** mirror tests for every modified component; PageObject discipline (ADR-009).

**Out of scope:**
- A11y P1 wave (WP-7 — parallel; coordination below).
- Markdown port (WP-4).
- Orchestrator / store changes (WP-2 stable contract).
- Performance / mention cache (WP-10).
- Test catch-up (WP-13).

## Approach

1. **Group by surface to keep diffs reviewable.** Suggested iteration ordering:
   - Iter 1: i18n migration (UX #18) — mechanical, low-risk.
   - Iter 2: Pill differentiation (UX #20) + ContextFileChip overflow (UX #14) + SessionResumeIndicator label (UX #17) + Stop styling (UX #16) — small visual fixes batched.
   - Iter 3: MessageList empty-state tiles (UX #11) + scroll-pin guard (UX #8) — both in MessageList; one PR sub-section.
   - Iter 4: Plan-card markdown render (UX #19) + plan-card persistence via ApprovalPort (UX #12).
   - Iter 5: `/help` popover (UX #4).
   - Iter 6: Full pre-PR gate.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors.
- [ ] `npm run test` passes.
- [ ] `npm run build` + `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds maintained or improved.
- [ ] **UX #4 closed**: `/help` no longer pushes history offscreen on a narrow sidepanel.
- [ ] **UX #8 closed**: scrolling up mid-stream keeps the user where they are; "↓ New messages" pill appears.
- [ ] **UX #11 closed**: empty state renders 4 starter tiles, each pre-fills the textarea on click.
- [ ] **UX #12 closed**: closing the sidepanel mid-plan no longer silently cancels; plan re-surfaces on reopen.
- [ ] **UX #14 closed**: chips don't clip silently; overflow chip exists.
- [ ] **UX #16 closed**: Stop styled neutrally.
- [ ] **UX #17 closed**: Resume indicator carries a visible label.
- [ ] **UX #18 closed**: no hardcoded EN strings in the touched files; both `en.ts` and `de.ts` carry the new keys.
- [ ] **UX #19 closed**: plan body renders via `<MarkdownBlock>`.
- [ ] **UX #20 closed**: pills are visually distinguishable.
- [ ] PR opened against `develop`, title `feat(asv3): UX polish wave (WP-8)`, body cites all closed UX findings.

## RALPH loop

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no a11y wiring (WP-7 — parallel), no store/orchestrator (WP-2 stable), no perf (WP-10).
  4. Run from .worktrees/asv3-wp08:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `git fetch origin develop && git worktree add .worktrees/asv3-wp08 -b claude/asv3-wp08-ux-polish-wave origin/develop`.
- **WP-2 dependency:** cut AFTER WP-2 merged.
- **WP-7 coordination:** WP-7 runs in parallel. Both touch `MessageList.vue`, `ChatInput.vue`, `ChatSidebar.vue`, `InlinePlanApprovalCard.vue`. Whoever lands second rebases mechanically. Stay disciplined about line-level scopes; if your edits collide with WP-7's, drop a `[carry-out] WP-7-coord` note.
- **i18n discipline:** every new user-facing string lives in `en.ts` AND `de.ts`. No string literals in templates that bypass `t(...)`.
- **MarkdownBlock for any markdown body** — never `<pre>{{ … }}</pre>` for content that should render as markdown.
- **Test discipline (ADR-009):** PageObject for every mount test; `data-testid` only.
- **GitHub safety:** never push to `develop`/`main`/`demo`. Never force-push.

## Out of scope

- A11y wiring (WP-7 — parallel; complementary fixes on the same components).
- Perf scroll rAF batching (WP-10 — overlaps with UX #8's scroll-pin guard; coordinate so the rAF coalesce lives in one PR, not two).
- Empty-state TILES requiring icons that don't exist in our icon set — use Obsidian's Lucide icons available via the existing `icons.ts` helper, OR text-only tiles.
- Per-message regenerate / edit / copy-link / token meter / model picker — explicit non-goals on the v2 spec.
