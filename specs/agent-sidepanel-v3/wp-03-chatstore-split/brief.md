# WP-3 — chatStore decomposition (Threads / StreamingTurn / Proposals)

**Branch:** `claude/asv3-wp03-chatstore-split` (cut from `origin/develop`)
**Lane:** Store + UX (blocks WP-2, WP-7, WP-10)
**Estimated size:** medium-large (~600 LOC across store + consumers + tests; mostly mechanical)

## Goal (one sentence)

Split the 648-LOC `chatStore` into three Pinia stores aligned with its three real lifecycles, and add the missing streaming-reset-on-transport-change test.

## Why (reviewer sources)

- **Architecture review #4 — "Carve `chatStore` into `ChatThreadsStore` + `ProposalStore` + `StreamingTurnStore`"** (P2 deepening). The store mixes (a) thread persistence (`chatThreads`, `activeThreadId`, `markThreadUsed`, `captureSessionId`) that survives plugin reloads, (b) streaming-turn state (`streamingText`, `streamingThinking`, `streamingToolCalls`, `lastUsage`, `cliStartingUp`, `sessionResumed`) that's per-turn, and (c) proposals (`proposals`, `structuredFail`) that cross both. The single store forces `handleNewConversation` to know 9 state slots; the Codex P2 "leak of `clearThreadProposals`" only happened because the store conflated them.
- **UX review #15 (P2) — `streamingText` not reset on `New conversation`.** `handleNewConversation` calls `clearThreadMessages`, `clearThreadProposals`, `setActiveThreadId(null)`, `clearResponse`, `setUserText('')` — but **does not call `resetStreaming()`**. Mid-stream-completion residual state can survive a thread rotation.
- **Testing review F8 (P2) — Transport-change reset invariant untested.** No test composes "begin streaming → simulate transport swap → assert state is clean".

## Scope — files in

**New:**
- `src/ui/stores/chatThreadsStore.ts` — owns `chatThreads`, `activeThreadId`, `markThreadUsed`, `captureSessionId`, `clearThreadMessages`, persistence keys.
- `src/ui/stores/streamingTurnStore.ts` — owns `streamingText`, `streamingThinking`, `streamingToolCalls`, `lastUsage`, `cliStartingUp`, `sessionResumed`, `compactBoundaries`, plus actions `appendStreamingDelta`, `appendStreamingThinking`, `startStreamingToolCall`, `appendStreamingToolCallInput`, `finishStreamingToolCall`, `setLastUsage`, `appendCompactBoundaryNotice`, `resetStreaming`.
- `src/ui/stores/proposalStore.ts` — owns `proposals`, `structuredFail`, `clearThreadProposals`, retry actions.
- `src/ui/stores/messagesStore.ts` — owns `messages` (per-thread map), `appendMessage`, `clearThreadMessages` (or fold into threads — implementer's call; document the choice in the loop-state.md design decision).
- `src/ui/composables/useChatReset.ts` — one composable exposing `resetForNewConversation(previousThreadId)` that calls all four stores' reset hooks. Single source of truth for "new conversation".
- `tests/ui/stores/chatThreadsStore.test.ts`, `streamingTurnStore.test.ts`, `proposalStore.test.ts`, `messagesStore.test.ts` — one each, mirroring the source.
- `tests/ui/composables/useChatReset.test.ts` — asserts all four stores are reset.

**Modified:**
- `src/ui/stores/chatStore.ts` — **deleted** after consumers migrate; or kept as a facade for one release cycle if migration risk is high. **Default to deletion**; the project's no-back-compat policy applies (CLAUDE.md "no backwards-compatibility hacks").
- All consumers: `src/ui/components/chat/ChatSidebar.vue`, `src/ui/components/agent/MessageList.vue`, `src/ui/components/agent/AgentSidepanelHeader.vue`, `src/ui/agent/AgentSidepanelRoot.vue`, `src/plugin/AgentSidepanelView.ts`, `src/plugin/SpecoratorView.ts`, `src/plugin/main.ts` (`chatThreadsPersistence` wiring), and any other `useChatStore` callsite.
- `src/plugin/chatThreadsPersistence.ts` — point at `chatThreadsStore` only.
- All existing `tests/ui/stores/chatStore.test.ts` cases — split into the new per-store test files; nothing lost.

**New tests for the gap:**
- In `tests/ui/stores/streamingTurnStore.test.ts`: `it('resetStreaming() drops streamingText, streamingThinking, and the tool-call block map')`.
- In `tests/ui/composables/useChatReset.test.ts`: `it('resetForNewConversation() drops streaming state along with thread/proposal/message buckets')` — closes Testing F8 and UX #15.

**Out of scope:**
- Extracting `ChatTurnOrchestrator` (WP-2; consumes the new stores).
- Persistence layer changes beyond pointing it at the new threads store (WP-14 lifts persistence into a port).
- A11y / live-region changes (WP-7; reads the streaming store shape after this lands).

## Approach

1. Start with a **diagram** in loop-state.md: list every current `chatStore` field and action, assign each to one of the four new stores, document any ambiguous case.
2. Create the four new stores; export typed `useChatThreadsStore()`, `useStreamingTurnStore()`, `useProposalStore()`, `useMessagesStore()` composables. Each store registers its own `pinia` ID.
3. Per ADR-003: stores hold plain DTOs only. Reuse existing `ChatMessage`, `ChatThreadRecord`, `FileWriteProposal`, `StreamDelta`-derived types.
4. Implement `useChatReset` as a composable that pulls all four stores and runs each `.reset()` in a stable order (proposals → messages → streaming → threads.activeId = null), so observers see one consistent transition.
5. Migrate consumers one component at a time. For each, replace `const chat = useChatStore()` with the targeted stores. Run `npm run typecheck` after each component.
6. Delete `chatStore.ts` once all consumers compile.
7. Add the two gap tests.
8. Verify pre-PR gate.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors.
- [ ] `npm run test` passes; new tests under `tests/ui/stores/` and `tests/ui/composables/` cover the moved actions plus the gap (transport-change reset, new-conversation reset).
- [ ] `npm run build` and `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds (80/70/80/80) maintained or improved.
- [ ] `src/ui/stores/chatStore.ts` deleted (no facade left behind per CLAUDE.md no-back-compat policy).
- [ ] `handleNewConversation` in `AgentSidepanelRoot.vue` calls `useChatReset().resetForNewConversation(prev)` — one line replaces the previous multi-action sequence — and the streaming-state-residual case is regression-tested.
- [ ] PR opened against `develop`, title `refactor(asv3): split chatStore into threads/streaming/proposals/messages (WP-3)`, body cites Arch-#4, UX-#15, Testing-F8.

## RALPH loop

```
loop:
  1. Read brief.md and loop-state.md.
  2. Pick the next failing check (typecheck → lint → test → build → DoD criterion).
  3. Implement the smallest change that moves one check red→green.
  4. Run the full AGENTS.md §3 pre-PR gate:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck \
         && npm run lint \
         && npm run test \
         && npm run build \
         && npm run build:web \
         && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR via mcp__github__create_pull_request.
     Else → goto 1.
  Hard cap: 8 loop iterations. If stuck, write blocker note in loop-state.md and exit.
```

## Conventions

- **Worktree:** `git worktree add .worktrees/asv3-wp03 -b claude/asv3-wp03-chatstore-split origin/develop`; `cd` into it before any edits.
- **Commits:** conventional, single squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review.
- **Do not touch** the streaming codec (WP-1), `ChatTurnOrchestrator` (WP-2), a11y wiring (WP-7), or `ChatThreadsPersistence` port lift (WP-14). If `chatThreadsPersistence` needs a tiny shim today, leave it shim-shaped and note "to be lifted in WP-14".
- **If you find a bug outside scope** — `[carry-out]` note in loop-state.md.
- **Never** push to `develop`. Never force-push.
