# WP-7 — A11y P1 wave: live regions, focus, combobox wiring, focus-return, Esc-aborts

**Branch:** `claude/asv3-wp07-a11y-p1-wave` (cut from `origin/develop` AFTER WP-2's PR #400 merged)
**Lane:** Store + UX (depends on WP-2; parallel with WP-8)
**Estimated size:** medium (~400–600 LOC across components + tests; lots of ARIA wiring + focus-management code, but no architectural change)

## Goal (one sentence)

Close the five P1 accessibility blockers from the v2 audit so keyboard-only and screen-reader users can complete every core flow in the agent sidepanel.

## Why (reviewer sources)

From the accessibility review (5 P1 blockers, all on the new v2 surface):

1. **A11y #1 (P1) — Streaming `aria-live` firehose.** `MessageList` uses `role="log"` + `aria-live="polite"` over the entire scroll container, so every streamed delta re-announces the whole growing text (CPU + SR cognitive load). Per-token deltas drown the SR user. The streaming bubble is replaced/re-rendered on each tick and `MarkdownBlock` further re-renders its native subtree via Obsidian's renderer on every `text` change. (`MessageList.vue:122-205`, `MarkdownBlock.vue:362-389`.)
2. **A11y #2 (P1) — Plan-approval card never receives focus when mounted.** `InlinePlanApprovalCard.vue:142-151` — root has `tabindex="0"` but no `onMounted` focus; rows are `tabindex="-1"`. Card appears mid-conversation; keyboard focus stays on the textarea; ArrowDown/Enter never reach the section. The "keyboard list" is unusable.
3. **A11y #3 (P1) — SlashCommandDropdown lacks combobox wiring.** `ChatInput.vue:319-344` + `SlashCommandDropdown.vue:53-101`. Textarea declares `aria-expanded` / `aria-controls` only for the mention dropdown. When the slash palette opens the textarea exposes no relationship, the listbox has no id, no `aria-activedescendant`. SRs cannot announce "/help selected" as the user arrows. Same gap on `MentionDropdown` (no per-item `id`, no `aria-activedescendant`).
4. **A11y #4 (P1) — Focus not restored after proposal accept/reject.** `FileWriteProposalCard.vue:99-101, :143-174`; `ChatSidebar.vue:1175-1185`. Card auto-focuses its heading on mount but no handler returns focus when the card is unmounted after Accept/Reject. Focus drops to `<body>`. Same for streaming-complete and Stop.
5. **A11y #5 (P1) — Stop button not announced and unreachable by keyboard shortcut.** Appears via `v-if` mid-turn with no announcement; SR users following streaming have no signal it exists. No keyboard shortcut bound to abort.

## Scope — files in

**Modified — A11y #1 (live regions):**
- `src/ui/components/agent/MessageList.vue` — remove `aria-live` from the scroll container. Add a dedicated off-screen polite announcement region that emits ONE summarised message per *completed* assistant turn (e.g. "Assistant replied. Press Tab to read."). Tag the streaming bubble `aria-busy="true"` while in-flight and drop it to `aria-live="off"`. Apply the same pattern to `streamingThinking` and `streamingToolCalls`.
- New `src/ui/components/agent/A11yAnnouncer.vue` — tiny component owning the off-screen `role="status"` + `aria-live="polite"` region. Driven by a `useA11yAnnouncer` composable.
- New `src/ui/composables/useA11yAnnouncer.ts` — exposes `announce(message: string)`; debounces consecutive announcements; clears on unmount.

**Modified — A11y #2 (plan-card focus):**
- `src/ui/components/agent/InlinePlanApprovalCard.vue` — `onMounted` calls `rootEl.value?.focus()`. Save the previously focused element and restore it after `emit('decide', …)` (before unmount). Consider `role="radiogroup"` + `role="radio"` + `aria-checked` for the rows (replaces `role="button"` + `tabindex="-1"`). Radiogroup semantics match the WAI-ARIA APG arrow-keys pattern.

**Modified — A11y #3 (combobox wiring):**
- `src/ui/components/chat/SlashCommandDropdown.vue` — give the listbox an `id` (`slash-command-dropdown`). Each `<li>` gets a deterministic `id="slash-command-item-${name}"`.
- `src/ui/components/chat/MentionDropdown.vue` — give the listbox an `id` (`mention-dropdown`). Each option gets `id="mention-item-${path}"` (basename + index to dedupe).
- `src/ui/components/chat/ChatInput.vue` — extend the textarea's `aria-expanded` / `aria-controls` / `aria-activedescendant` to track WHICHEVER picker is currently open (slash OR mention). Single set of attributes, drived by a `currentPicker` computed.

**Modified — A11y #4 (focus return):**
- `src/ui/components/chat/FileWriteProposalCard.vue` — capture `document.activeElement` on mount; expose a `restoreFocus()` method (or fire a `decided` event with no payload). After Accept/Reject resolves and the card is removed, focus moves to the input.
- `src/ui/components/chat/ChatSidebar.vue` — in `handleAcceptProposal` / `handleRejectProposal` (now both in `useProposalDecisions`), after the proposal-store mutation that removes the card, call `focusTextarea()`. (NB: `useProposalDecisions` was extracted in WP-2; this WP modifies its `Accept`/`Reject` handlers to call back into the component for focus restoration, OR ChatSidebar listens for a `decided` event.)
- Streaming-complete focus: in the orchestrator's completion path (via the `onAbortController` cleared signal), trigger a `focusTextarea()` call on the component side.

**Modified — A11y #5 (Stop button announcement + Esc abort):**
- `src/ui/components/chat/ChatInput.vue` — extend `handleKeydown`: bind `Escape` to fire an `abort` emit when `props.loading && !palette.isOpen && !picker.open`. Add `aria-keyshortcuts="Escape"` to the Stop button.
- `src/ui/components/chat/ChatSidebar.vue` — listen for `abort` from `ChatInput`; call `inFlightAbort.value?.abort()`. Same effect as clicking Stop, but via keyboard.
- Add `role="status"` with a short polite announcement at the start of `handleSend` ("Generating. Press Escape to stop.") via the new `useA11yAnnouncer`.
- Stop button's `<button>` element gets `aria-keyshortcuts="Escape"`.

**New / updated tests:**
- `tests/ui/components/agent/A11yAnnouncer.test.ts` (+ co-located PageObject).
- `tests/ui/composables/useA11yAnnouncer.test.ts`.
- `tests/ui/components/agent/MessageList.test.ts` — assert the scroll container does NOT have `aria-live`; assert the announcer is invoked exactly once per completed turn.
- `tests/ui/components/agent/InlinePlanApprovalCard.test.ts` — assert root receives focus on mount; assert focus restores to the previously-focused element on decide.
- `tests/ui/components/chat/SlashCommandDropdown.test.ts` — assert listbox `id` + per-option `id` exist; assert `aria-activedescendant` updates with `selectedIndex`.
- `tests/ui/components/chat/MentionDropdown.test.ts` — same combobox assertions.
- `tests/ui/components/chat/ChatInput.test.ts` — assert Escape during loading emits `abort`; assert combobox attributes update across palette/picker open states.
- `tests/ui/components/chat/FileWriteProposalCard.test.ts` — assert focus restoration on Accept and on Reject.
- `tests/ui/components/chat/ChatSidebar.test.ts` — assert keyboard Stop via Escape calls the same path as clicking the Stop button.

**Out of scope:**
- UX polish items in WP-8 (inline /help, scroll-pin, empty state, plan card persistence, pill differentiation, etc.). If your changes touch the same surface, leave WP-8's slot empty as a `[carry-out]`.
- The orchestrator's logic (WP-2 — stable contract).
- Markdown rendering changes (WP-4).
- Test-coverage-focused expansion (WP-13).

## Approach

1. **Stand up the announcer first.** New composable + new component + their tests. Pure UI plumbing; doesn't depend on the rest of the WP.
2. **Migrate MessageList off the scroll-container `aria-live`** to the new announcer. Pin behaviour with a test that asserts ONE announcement per completed turn (not N for N tokens).
3. **Fix InlinePlanApprovalCard focus + radiogroup semantics.** Smaller and self-contained.
4. **Combobox wiring on the dropdowns + ChatInput's textarea attributes.** Trickier because two pickers share the same textarea; consolidate via a `currentPicker` computed.
5. **Focus restoration after proposal Accept/Reject.** Decide between event-up or method-down; document the choice in loop-state.
6. **Esc-aborts + Stop announcement + `aria-keyshortcuts`.** Smallest piece; lands last.
7. **Run the full pre-PR gate.**

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors; no new warnings on touched files.
- [ ] `npm run test` passes; every new test file's component coverage ≥ 90% statements.
- [ ] `npm run build` and `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds maintained or improved.
- [ ] **A11y #1 closed**: `MessageList.vue` no longer carries `aria-live` on the scroll container. New announcer fires ONCE per completed turn. Manual: open the sidepanel with VoiceOver / NVDA → stream a reply → exactly one announcement.
- [ ] **A11y #2 closed**: opening a plan-approval card auto-focuses the root and Arrow/Enter operate the radiogroup. Manual: tab to textarea, trigger plan; card receives focus immediately; ArrowDown selects "Revise"; Enter commits.
- [ ] **A11y #3 closed**: both dropdowns expose `id` on listbox and per-option; `aria-activedescendant` on the textarea tracks the highlighted option. Manual: open slash palette with `/`; arrow through; SR announces each option.
- [ ] **A11y #4 closed**: Accept/Reject restores focus to the textarea. Manual: focus card via tab, accept → focus returns to textarea.
- [ ] **A11y #5 closed**: Stop button announces on appearance; Escape during streaming aborts. Manual: Cmd+Enter → SR announces "Generating. Press Escape to stop." → press Escape → stream aborts.
- [ ] PR opened against `develop`, title `feat(asv3): A11y P1 wave (WP-7)`, body cites a11y review #1–#5.

## RALPH loop

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no UX-polish work (WP-8), no orchestrator/store changes (WP-2 stable).
  4. Run from .worktrees/asv3-wp07:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `git fetch origin develop && git worktree add .worktrees/asv3-wp07 -b claude/asv3-wp07-a11y-p1-wave origin/develop`; `cd` into it.
- **WP-2 dependency:** cut AFTER WP-2 PR #400 merged. The four stores (`messagesStore`, `streamingTurnStore`, `proposalStore`, `chatThreadsStore`), `ChatTurnOrchestrator`, and the agent-panel rendering shape are now the stable contract.
- **WP-8 coordination:** WP-8 runs in parallel; both touch `MessageList.vue`, `ChatInput.vue`, and `ChatSidebar.vue`. Whoever lands second rebases mechanically. If WP-8 lands first, the touched lines may be in slightly different shapes — adapt.
- **No backwards-compat shims.** Per CLAUDE.md no-back-compat: don't leave dead aria-attributes or unused focus handlers.
- **`Result<T,E>` (ADR-004):** N/A here (no new application-layer code), but the announcer / picker code stays consistent with `Result` for any failure mode.
- **Test discipline (ADR-009):** every new mount test gets a co-located PageObject; `data-testid` only; no class/id selectors.
- **GitHub safety:** never push to `develop`/`main`/`demo`. Never force-push.

## Out of scope

- WP-8 UX polish list (separate PR).
- WP-4 markdown rendering.
- A11y items at P2/P3 from the original audit (timestamps, copy/regenerate, reduced-motion, label-in-name etc.) — track for a future WP if not absorbed.
