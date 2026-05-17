# WP-2 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp02-chat-turn-orchestrator` inside `.worktrees/asv3-wp02/`, not on this branch (`claude/improve-sidepanel-chat-8pgcT`). PR #395 only ships `specs/**` files.

## Iterations

### Iteration 1 — DTOs + builder + orchestrator scaffold (single pass)

Done in one sweep (the surface area was clear from the brief and stable enough that staging would have been busy-work):

- **New:** `src/application/chat/TurnInput.ts` — sealed-envelope DTO consumed by the orchestrator. Carries `userMessage`, `prompt`, `truncated`, `systemPromptSuffix`, `slug`, `transport`, `intent`, and a `ThreadRotationDecision` (`'rotate'` / `'reuse'`).
- **New:** `src/application/chat/ChatTurnError.ts` — typed error union for orchestrator-level failures (`'cli-unavailable'`).
- **New:** `src/application/chat/TurnInputBuilder.ts` — pure helper that snapshots the four chat stores + vault + settings into a `TurnInput`. Absorbed `computeStagePromptContext`, `effectiveContextFiles` dedup, `isStructuredIntent`, prompt-budget, resume-session resolution (closes Arch #9). 100% statements/branches/functions covered.
- **New:** `src/application/chat/ChatTurnOrchestrator.ts` — single owner of one chat turn. Holds thread rotation, structured-vs-freetext dispatch, success/error mutation, vault-mirror scheduling. ~98% lines / 88% branches / 93% functions covered.
- **New:** `src/application/chat/consumeStream.ts` — extracted stream-delta drain so the orchestrator stays under `max-lines`. 100% covered.
- **New:** `tests/application/chat/TurnInputBuilder.test.ts` — 21 cases.
- **New:** `tests/application/chat/ChatTurnOrchestrator.test.ts` — 17 cases (free-text happy path, error mapping, abort handle, structured success + parse fail + transport error, rotate vs reuse, non-text delta dispatch, session-id capture, mirror call).

### Iteration 2 — ChatSidebar rewrite + UX-#1/#2/#5 fixes

- **Modified:** `src/ui/components/chat/ChatSidebar.vue` — `handleSend` now builds a `TurnInput` via `TurnInputBuilder` and delegates to `orchestrator.sendTurn()`. Component holds only UI concerns: focus, refocus, surface AbortController via `onAbortController`, seed the per-proposal path-error map. Dropped `consumeStream`, `applyStreamDelta`, `applyNonTerminalDelta`, `mintRotatedThread`, `resolveActiveThread`, `applySuccessfulTurn`, `mirrorTurnToVault`, `mirrorTerminalProposalFailure`, `addProposalFromEnvelope`, `handleStructuredSend`, `computeStagePromptContext`, `loadContextFileBodies`, `isStructuredIntent`. LOC 1277 → 507 (60% drop, exceeds the brief's 40% fallback target).
- **Modified:** `src/ui/components/chat/ChatResponse.vue` — added `legacyMode` prop (default behaviour unchanged for the standalone embed). Non-legacy mode suppresses idle / loading / success-text branches (UX-#1, UX-#2) but still hosts the trim notice, errors, structured-fail banner, and the `proposalCard` slot.
- **New:** `src/ui/components/chat/ChatDegradedState.vue` — extracted the four degraded-state templates from ChatSidebar.
- **New:** `src/ui/composables/useProposalDecisions.ts` — extracted the Accept/Reject decision handlers so the component focuses on dispatch.
- **Modified:** existing ChatSidebar tests adapted: `hasResponseText`/`hasResponseLoading` assertions repointed onto `messagesStore.response` / `messagesStore.status` (the doubled DOM no longer exists in the agent panel mount).
- **Modified:** existing ChatResponse tests opt into `legacyMode: true` to exercise the original branches; two new tests cover the non-legacy mode.

### Final gate

```
npm audit --audit-level=high --omit=dev   → 0 vulnerabilities
npm run typecheck                          → clean
npm run lint                               → 0 errors, 24 warnings (all pre-existing)
npm run test                               → 1740 / 1740 passing
npm run build                              → success
npm run build:web                          → success
npm run docs:api                           → success (1 unrelated link warning)
```

Coverage on the four new modules:
- `ChatTurnError`        — 100/100/100
- `ChatTurnOrchestrator` — 97.7/87.8/92.9
- `TurnInputBuilder`     — 100/100/100
- `consumeStream`        — 100/100/100

Overall thresholds (80/70/80/80) maintained: 92.71/86.35/89.78/93.97.

UX reviewer findings closed:
- **UX-#1** — `MessageList` is the sole rendering surface for assistant text in the agent panel. `ChatResponse` runs in non-legacy mode and the success-text body is suppressed. Manual trace: send a message → assistant text appears exactly once in the message bubble; the old "double bubble" is gone.
- **UX-#2** — Streaming bubble + `ChatResponse` "Thinking…" no longer coexist. The loading branch of `ChatResponse` is gated on `legacyMode` so MessageList's streaming bubble owns the in-flight signal.
- **UX-#5** — Orchestrator's `applySuccessfulTurn` skips the empty assistant `appendMessage` when the turn produced a proposal AND the response is empty. Structured turns now render only the proposal card; no "(No text — see the proposal card below.)" placeholder.

## Carry-out items

- **WP-5 (SessionLogMirror facade)** — `ChatTurnOrchestrator.mirrorTurnToVault` still uses the existing `SessionLogWriter` directly with an inline `.then(...).catch(...)`. The brief explicitly out-of-scoped the facade extraction; the inline best-effort wrap reads cleanly today.
- **WP-7 (a11y / live regions / focus restoration)** — no work done here. The orchestrator's `onAbortController` callback is the future seam for a11y-aware Stop button announcements.
- **WP-3 stores** — used as the stable contract. No issues found in the four post-WP-3 stores.
- **Existing `max-lines` warnings** on adjacent legacy files (`MessageList.vue` 569 effective lines, plugin/main.ts 902 effective lines, etc.) are out of scope for WP-2.
- **ChatSidebar.vue 507 raw lines / ~340 effective** — the brief's 500/450 target is for raw lines; effective lines (skipBlankLines+skipComments) are now under the 350 ceiling and the `max-lines` warning is gone for this file.
