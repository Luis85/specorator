# WP-2 — ChatTurnOrchestrator + drop doubled output panel

**Branch:** `claude/asv3-wp02-chat-turn-orchestrator` (cut from `origin/develop` AFTER WP-3's PR #396 merged)
**Lane:** Store + UX (depends on WP-3; blocks WP-7 + WP-8)
**Estimated size:** large (~600–800 LOC moved out of `ChatSidebar.vue`, plus new orchestrator + tests)

## Goal (one sentence)

Extract a pure `ChatTurnOrchestrator` from `ChatSidebar.vue` so a Vue component stops owning thread rotation / transport selection / stream consumption / proposal accept / vault-mirror scheduling, and remove the doubled assistant-response rendering in the agent sidepanel.

## Why (reviewer sources)

- **Architecture review #1 (P1 deepening)** — "Extract a `ChatTurnOrchestrator` from `ChatSidebar.vue`". `ChatSidebar.vue` (1,271 LOC originally; ~860 after WP-3) hosts `handleSend` (~120 LOC), `consumeStream`, `applyStreamDelta`, `applyNonTerminalDelta`, `mintRotatedThread`, `resolveActiveThread`, `applySuccessfulTurn`, `mirrorTurnToVault` — orchestration that is unreachable from a unit test without mounting the component. Codex P2 fixes have piled up here precisely because of that.
- **Architecture review #9 (P2 deepening)** — "Lift `effectiveContextFiles` + `isStructuredIntent` + `computeStagePromptContext` into a `TurnInputBuilder`". Decided to absorb this into WP-2: the orchestrator naturally consumes a single `TurnInput` DTO, so building it is the orchestrator's pre-step.
- **UX review #1 (P1)** — "Doubled assistant output (history bubble + ChatResponse panel)". `applySuccessfulTurn` calls both `messagesStore.setResponse(...)` AND `messagesStore.appendMessage({role:'assistant', ...})`; the user sees the response twice (once in `MessageList`, once in `ChatResponse`).
- **UX review #2 (P1)** — "Streaming bubble + duplicate 'Thinking…' status". The streaming-bubble path in `MessageList` and the `responseState === 'loading'` "Thinking…" copy in `ChatResponse` are simultaneously visible.
- **UX review #5 (P1)** — "`assistantEmpty` placeholder leaks into normal flow for structured proposals". For structured-output turns, `assistantResponse === ''` produces a "(No text — see the proposal card below.)" placeholder while the proposal card is rendered far away in `ChatResponse`. Either drop the empty assistant bubble for structured turns, or surface the proposal card inside the assistant bubble.

## Scope — files in

**New:**
- `src/application/chat/ChatTurnOrchestrator.ts` — pure orchestrator class. Constructor takes a `ClaudeCliPort`, the four chat stores (or their `useXxxStore()` getters), a `SessionLogMirror` shim (or the existing `SessionLogWriter` injection directly — note the future `SessionLogMirror` facade is WP-5's scope; do not pre-empt it), a clock, and an `AbortController` factory. Exposes one method: `sendTurn(input: TurnInput): Promise<Result<TurnOutcome, ChatTurnError>>`. Internally owns thread rotation, structured-vs-freetext dispatch, stream consumption, success/error mutation, mirror scheduling, and `nextTick`/focus orchestration.
- `src/application/chat/TurnInputBuilder.ts` — pure helper that takes the current user text, snapshots of the four stores, vault port + settings, and returns a `TurnInput` DTO `{ prompt, suffix, contextFiles, intent, transport, threadDecision }`. Absorbs `computeStagePromptContext`, `effectiveContextFiles` dedup, `isStructuredIntent` classification, prompt budget, resume-session resolution.
- `src/application/chat/TurnInput.ts` (or co-located in the builder) — DTO definition.
- `src/application/chat/ChatTurnError.ts` (or in `errors.ts`) — typed error union for orchestrator failure modes.
- `tests/application/chat/ChatTurnOrchestrator.test.ts` — exercises the orchestrator against `MockClaudeCliPort` + fake stores; no Vue mounting. Covers thread rotation, structured/freetext routing, stream consumption, abort, error paths, mirror best-effort wrapping, ordering of store mutations.
- `tests/application/chat/TurnInputBuilder.test.ts` — pure unit; covers intent classification, context-file dedup, stage-prompt assembly.

**Modified:**
- `src/ui/components/chat/ChatSidebar.vue` — `handleSend` shrinks to: build input via `TurnInputBuilder`, call `orchestrator.sendTurn(input)`, handle the `Result` (notice / refocus / clear UI state). Drop `consumeStream`, `applyStreamDelta`, `applyNonTerminalDelta`, `mintRotatedThread`, `resolveActiveThread`, `applySuccessfulTurn`, `mirrorTurnToVault`, `mirrorTerminalProposalFailure` and their helpers. **Target: get `ChatSidebar.vue` under 500 LOC, ideally under 450.**
- `src/ui/agent/AgentSidepanelRoot.vue` — in the agent sidepanel mount only, render `<MessageList>` as the sole rendering surface for assistant content. **Collapse `<ChatResponse>` to render only the non-success branches** (`loading`, `timeout`, `error`, `structured-fail`) and the `proposalCard` slot. The "last response" text path becomes redundant once `MessageList` is the source of truth.
- `src/ui/components/chat/ChatResponse.vue` — make the success branch a no-op (or guard it behind a `legacyMode` prop) so the agent sidepanel renders only the error/proposal states. **Do not delete `ChatResponse.vue`** — `SpecoratorView`'s legacy embed may still need the success rendering, OR the embed has already been gutted by WP-3; check both code paths.
- For UX-#5: in the orchestrator's `applySuccessfulTurn` path, **skip `messagesStore.appendMessage` when the turn produced a proposal AND `assistantResponse === ''`** — the proposal card is the rendering, no empty placeholder needed.
- All existing tests that exercise the moved methods directly (`ChatSidebar.proposalFlow.test.ts`, `ChatSidebar.threadRotation.test.ts`, etc.) need their assertions repointed: most behaviour is still observable through the same store side-effects, but if a test was poking into the component's internals it now belongs in `ChatTurnOrchestrator.test.ts`.

**Out of scope:**
- `SessionLogMirror` facade extraction — that's WP-5. The orchestrator uses the existing `SessionLogWriter` callable; if best-effort wrapping reads awkwardly today, leave a `[carry-out] WP-5: wrap awaits via SessionLogMirror facade` note.
- A11y attributes / live regions — WP-7. The doubled-rendering fix makes a11y simpler but doesn't add ARIA.
- Inline `/help`, scroll-pin, empty-state tiles — WP-8.
- Touching the `ClaudeCliPort` interface — WP-12.
- `degradedClaudeCliPort` rework — WP-15.

## Approach

1. **Start with the DTO + builder.** Define `TurnInput` shape, write `TurnInputBuilder.ts` + its test. Pure functions; no orchestrator yet.
2. **Stand up the orchestrator skeleton.** New file `ChatTurnOrchestrator.ts` with `sendTurn(input): Promise<Result<TurnOutcome, ChatTurnError>>` returning `err(new ChatTurnError('not-implemented'))`. Wire dependency injection (constructor takes ports + stores + clock + abort factory).
3. **Migrate `consumeStream` + `applyStreamDelta` + `applyNonTerminalDelta`** verbatim from `ChatSidebar.vue` into the orchestrator. They operate on `chatStore`-shaped state — adapt them to take the four split stores from WP-3.
4. **Migrate `mintRotatedThread` + `resolveActiveThread` + `applySuccessfulTurn` + `mirrorTurnToVault`.** Adapt to the new store shape; preserve every invariant.
5. **Move structured-vs-freetext dispatch** (`isStructuredIntent`, `handleStructuredSend`) into the orchestrator's private method dispatched from `sendTurn`.
6. **Replace `ChatSidebar.handleSend`** with `orchestrator.sendTurn(builder.build(...))`. Keep only UI concerns in the component (focus textarea, clear input on success, surface notification on error).
7. **Drop the doubled-rendering** in `AgentSidepanelRoot.vue`: collapse `<ChatResponse>` to the non-success branches when mounted in the agent panel. Skip the empty assistant `appendMessage` for proposal-only turns.
8. **Migrate or repoint affected tests.** `ChatSidebar.*` tests stay green by observing side-effects through the stores; orchestrator-internal tests move to the new file.
9. **Run the full pre-PR gate every iteration.** Target: `ChatSidebar.vue` < 500 LOC, all P1 reviewer findings closed, no regressions.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors; the `max-lines > 350` warning on `ChatSidebar.vue` is **gone** (or at minimum the LOC drops by ≥ 40%).
- [ ] `npm run test` passes; new `ChatTurnOrchestrator.test.ts` and `TurnInputBuilder.test.ts` exist with ≥ 90% statements + 80% branches on both new modules.
- [ ] `npm run build` and `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` — overall thresholds (80/70/80/80) maintained or improved.
- [ ] **UX-#1 closed**: opening the agent sidepanel, sending a message, and seeing the assistant reply produces **exactly one** rendering of the assistant text (in `MessageList`), not two.
- [ ] **UX-#2 closed**: during streaming, no "Thinking…" copy is rendered alongside the streamed text.
- [ ] **UX-#5 closed**: a structured-output turn does not produce an empty "(No text — see the proposal card below.)" assistant bubble.
- [ ] PR opened against `develop`, title `refactor(asv3): extract ChatTurnOrchestrator + drop doubled output (WP-2)`, body cites Arch-#1, Arch-#9, UX-#1, UX-#2, UX-#5, and the closed `max-lines` lint warning.

## RALPH loop

```
loop:
  1. Read brief.md and loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no port reshapes, no a11y, no SessionLogMirror facade.
  4. Run: npm audit --audit-level=high --omit=dev \
            && npm run typecheck && npm run lint && npm run test \
            && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR via mcp__github__create_pull_request.
     Else → goto 1.
  Hard cap: 10 RALPH iterations (large refactor). If stuck, write blocker note and exit.
```

## Conventions

- **Worktree:** `git fetch origin develop && git worktree add .worktrees/asv3-wp02 -b claude/asv3-wp02-chat-turn-orchestrator origin/develop`; `cd` into it before any edits.
- **Commits:** conventional, single squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review.
- **Do not touch** the streaming codec / adapters (WP-1 / WP-11 / WP-12) — note any seam friction as `[carry-out]`.
- **Do not touch** a11y attributes / live regions / focus management (WP-7).
- **Do not touch** the slash palette, empty-state tiles, scroll-pin, plan-card persistence (WP-8).
- **Reference WP-3's `chatStoresFacade`** in `tests/__fakes__/` if you need to keep older multi-store tests passing during refactor.
- **Never** push to `develop`. Never force-push.
