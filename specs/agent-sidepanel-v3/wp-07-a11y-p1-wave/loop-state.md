# WP-7 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp07-a11y-p1-wave` inside `.worktrees/asv3-wp07/`, not on this branch.

## Iterations

### 2026-05-17 — Rebase WP-7 onto develop after WP-8 merge (PR #403)

WP-8 merged to `develop` (93159f1) while PR #402 was open; six files conflicted (five
source/template + one test). Chose **option A (rebase)** because the conflicts were
all "both WPs touched same DOM/file at different concerns" — not divergent intent.
Rebased onto `93159f1`, replayed five commits, then amended a tiny fixup into the
last commit (see below).

**Conflicts resolved (intents kept from BOTH WPs):**

- `src/ui/components/agent/MessageList.vue` —
  - Kept WP-8's `onBeforeUnmount(scroll-rAF cleanup)` + `emptyTiles` array + `handleTileClick`.
  - Kept WP-7's assistant-message-count watcher, **using the c1378bf form** (the
    `[threadId, count]` tuple watcher that guards against false "Assistant replied"
    on thread switch, NOT the naïve `next > prev` form from 523d17e).
  - Template: kept WP-8's `@scroll.passive="handleScroll"` AND removed
    `aria-live="polite"` per WP-7's A11y #1 (the announcer fires once per turn instead).
  - Streaming bubble retained `aria-busy="true"` + `aria-live="off"` (was already
    placed by WP-7 in section that didn't conflict).
- `src/ui/components/agent/InlinePlanApprovalCard.vue` —
  - Merged `onMounted` to run BOTH WP-7's focus-capture + auto-focus AND WP-8's
    `emit('pending-changed', true)`.
  - Merged `onBeforeUnmount`: WP-8's persist-on-unmount branch returns early (no
    decide, focus restoration deferred to commit()); the legacy branch
    (`persistOnUnmount=false`, used by tests) auto-cancels AND calls WP-7's
    `restorePreviousFocus()` before emitting cancel.
  - Round-3 commit (radiogroup `aria-activedescendant`) replayed cleanly on top.
- `src/ui/components/chat/ChatInput.vue` —
  - Merged `vue` import to take all of `computed, ref, onBeforeUnmount` (WP-7) plus
    `useI18n` (WP-8).
  - Textarea attrs: WP-7's `role="combobox"`, `aria-controls`, `aria-activedescendant`
    on the same element as WP-8's i18n'd `:aria-label`, `:placeholder`.
- `src/ui/agent/AgentSidepanelRoot.vue` —
  - Merged `vue` import: `computed, nextTick, provide, ref` (union of both sides) plus
    `useI18n`. Body of file kept both `provide(A11Y_ANNOUNCER_KEY, ...)` and WP-8's
    `/help` popover + empty-tile prefill (auto-merged correctly elsewhere).
- `styles.css` — took HEAD side at conflict-resolution time (all hash differences),
  then ran `npm run build`, which regenerated the file with the new merged scoped
  hashes (`data-v-c95b7db5` for MessageList etc.). Committed the regenerated file
  as a fixup amend.
- `tests/ui/components/agent/InlinePlanApprovalCard.test.ts` — kept BOTH the WP-8
  `persistOnUnmount` describe block and the WP-7 a11y #2 focus/radiogroup describe
  block. `mountCard` already defaulted `persistOnUnmount: false`, so the legacy
  "unmounting before a decision emits cancel" test still works.

**Auto-merge fixup amended into round-3 commit:**

- `tests/ui/components/agent/MessageList.test.ts` had a duplicate
  `import { nextTick } from 'vue';` line because git auto-merged both WPs' imports
  side-by-side. Removed the duplicate; the file otherwise stayed as auto-merged.

**Pre-PR gate:** all green.

- `npm audit --audit-level=high --omit=dev` — 0 vulnerabilities
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors (26 pre-existing warnings)
- `npm run test` — 146/146 files, 1822/1822 tests pass
- `npm run build` — succeeded; styles.css regenerated and amended
- `npm run build:web` — succeeded
- `npm run docs:api` — succeeded (1 pre-existing typedoc warning)

**Force-pushed** with `--force-with-lease` to `origin/claude/asv3-wp07-a11y-p1-wave`.

## Carry-out items

(notes on issues found that belong in other WPs)

- None. The WP-7 ↔ WP-8 overlap was complementary — each WP added different
  semantic wiring to the same DOM regions, so combining was mechanical once the
  intents were aligned. No new bugs surfaced from either side during the rebase.
