---
id: d7e8f9a0-1234-4b56-9c78-d9e0f1a2b3c4
feature: 'Agent Sidepanel v2'
area: ASV
slug: agent-sidepanel-v2
current_stage: idea
status: active
last_updated: 2026-05-16
last_agent: pm
createdAt: 2026-05-16T00:00:00+02:00
updatedAt: 2026-05-16T00:00:00+02:00
artifacts:
  idea: complete
  research: pending
  requirements: pending
  design: pending
  spec: pending
  tasks: pending
  implementation-log: pending
  test-plan: pending
  test-report: pending
  review: pending
  release-notes: pending
  retrospective: pending
---

## Stage progress

| Stage              | Status   | Artifact  | Notes                                                                                   |
| ------------------ | -------- | --------- | --------------------------------------------------------------------------------------- |
| 1 — Idea           | complete | `idea.md` | IDEA-ASV-001 — Lift chat into its own dedicated sidepanel + adopt Claudian-inspired UX. |
| 2 — Research       | pending  | —         |                                                                                         |
| 3 — Requirements   | pending  | —         |                                                                                         |
| 4 — Design         | pending  | —         |                                                                                         |
| 5 — Specification  | pending  | —         |                                                                                         |
| 6 — Tasks          | pending  | —         |                                                                                         |
| 7 — Implementation | pending  | —         | PR-ASV-1 (structural lift) will land first on `claude/refactor-agent-sidepanel-2CDgl`.  |
| 8 — Testing        | pending  | —         |                                                                                         |
| 9 — Review         | pending  | —         |                                                                                         |
| 10 — Release       | pending  | —         |                                                                                         |
| 11 — Retrospective | pending  | —         |                                                                                         |

## Blocks

None.

## Hand-off notes

| Date       | From | To  | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-16 | pm   | dev | Spec entry created on `claude/refactor-agent-sidepanel-2CDgl` to track the agent-sidepanel v2 work. Increment 1 of v2 is a pure structural lift: extract chat into its own `ItemView` (`VIEW_TYPE = 'specorator-agent'`), remove `/chat` from `MainLayout` tab nav, preserve every existing REQ-CCS / REQ-ASM behaviour. Claudian-style UX features (multi-turn message list, streaming, slash-command palette, @file mentions) land as Increment 2+.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-05-16 | dev  | qa  | PR-ASV-1 landed structural lift + multi-turn message list. New surfaces: `AgentSidepanelView` (`VIEW_TYPE_AGENT = 'specorator-agent'`), `AgentSidepanelRoot.vue`, `AgentSidepanelHeader.vue`, `MessageList.vue`, `ChatMessage` DTO + `appendMessage`/`clearThreadMessages` store actions. Removed: `/chat` route, `ChatSidebarView.vue`, `nav.chat` i18n key. URI handler reroutes `open-chat`/`focus-chat` to the new sidepanel. 1445 tests pass (34 new), typecheck clean, plugin build and standalone web build pass. Streaming, slash palette, `@`-mentions, stop-button still deferred to Increment 2.                                                                                                                                                                                                                                                                                                |
| 2026-05-16 | dev  | dev | PR-ASV-1 post-open polish: Codex P2 (clear prior thread's message bucket on "New conversation") fixed by `handleNewConversation` calling `clearThreadMessages(prev)` before rotating `activeThreadId`. Internal-review P1 #2 closed by `tests/plugin/main.uri-handler.test.ts` covering all action branches (`open-chat`, `focus-chat`, `open-agent`, deferred, unknown, core short-circuit). Internal-review P2 #5 (MessageList scroll watcher will miss streaming deltas) documented inline as a forward-looking comment. Deferred: P1 #1 / P2 #6 (`SpecoratorView` retains a now-vestigial chat-thread hydration + status watcher — harmless dead code in production but load-bearing in `tests/plugin/SpecoratorView.test.ts`; clean up in a follow-up refactor PR before Increment 2). P3 polish (i18n unused keys, hard-coded `getDisplayText`, single timestamp for user+assistant turns) deferred. |

## Open clarifications

- **OQ-ASV-1** — Increment 2 scope ordering: which Claudian-inspired feature ships first? Candidates: streaming responses, slash-command palette, @file mentions, stop-generation control. PM to confirm before research stage.
- **OQ-ASV-2** — Standalone web demo lost the chat surface in Increment 1 (no `/chat` route). Acceptable trade-off, but if we want to keep a demo we'd add a `/agent` route in `src/ui/main.ts` only. Defer decision to design stage.
- **OQ-ASV-3** — `SpecoratorView` cleanup: with chat gone, the chat-thread hydration block (`SpecoratorView.ts:170-185`) and the chat-status watcher (`_isChatLoading`, `_installPendingRefreshWatcher`) are vestigial. Removing them simplifies the file but breaks four existing tests in `tests/plugin/SpecoratorView.test.ts` that exercise the mid-turn guard against a chat store that no longer drives the chat. Worth doing in a focused refactor PR; out of scope for PR-ASV-1.

## Increment 2 research notes (Claudian deep-dive, 2026-05-16)

External reference: https://github.com/YishenTu/claudian. The four headline Claudian features below are sized as separate mergeable PRs. Each notes the Specorator surfaces it would touch and the smallest viable shape.

- **Streaming responses (Increment 2 PR-ASV-2):** Both `ClaudeCliAdapter` (SDK async generator + existing `AbortController`) and `ClaudeSubprocessAdapter` (already passes `--output-format stream-json --verbose --include-partial-messages` and reassembles NDJSON in `_spawnChild`) have the streaming + cancellation primitives in place. Work is in surfacing them through a new `ClaudeCliPort.queryStream(prompt, opts): AsyncIterable<StreamDelta>` method with a `StreamDelta` discriminated union (`text | session-id | done | error`). Cancellation reuses the existing SIGTERM→SIGKILL ladder. Sized: 4 PRs × ~200 LOC each (port shape + mocks; subprocess; SDK; UI consume + Stop button). The Pinia `streamingText` field is already there (`appendStreamingDelta`, `resetStreaming`) — Increment 2 wires it for real and updates the `MessageList` watcher (see comment in `MessageList.vue`).
- **Slash-command palette (REQ-ASV-051 candidate):** Claudian uses `src/shared/components/SlashCommandDropdown.ts` with a backward-scan trigger (`/` at position 0 OR preceded by whitespace) and three command-source layers (built-ins from TS, SDK-probed via `conversation.supportedCommands()`, vault fallback from `.claude/commands/*.md`). Frontmatter schema: `description`, `argument-hint`, `allowed-tools`, `model`, `disable-model-invocation`, `user-invocable`, `context`, `agent`, `hooks`. Specorator port: new `CommandCatalogPort` in `src/domain/ports/`, `useSlashPalette()` composable, `ChatInput.vue` keystroke handler. Smallest viable PR: built-ins only (`/clear`, `/new-conversation`, `/advance-stage`), no SDK probe.
- **`@`-mention picker (REQ-ASV-052 candidate):** Claudian's `MentionDropdownController` debounces 200ms, scans backward from caret for `@` at position-0-or-after-whitespace, and lists vault files (`VaultMentionCache` with lazy-dirty invalidation) + agents/MCP/external-context via submenus. Sort: prefix-match → mtime → type → path; capped 50 folders / 100 files. Specorator port: new `VaultMentionPort` wrapping the existing `VaultPort.listFiles/listFolders` + mtime, `useMentionPicker.ts` composable, `attachedFiles` DTO on `chatStore`. Smallest viable PR: vault files only, no caching layer.
- **Plan mode + inline approval (REQ-ASV-053 candidate):** Plan Mode is a Claude Code CLI/SDK concern, not a plugin feature — the plugin reacts to `ExitPlanMode` tool calls via `setExitPlanModeCallback()`. The inline approval card pattern (`Implement / Revise / Cancel` keyboard list) overlaps with our existing `FileWriteProposalCard` (REQ-ASM-044) but is orthogonal in scope: Plan approval is whole-plan; ours is per-file. Consolidation candidate via a unified `ApprovalPort`. Smallest viable PR: just the `InlinePlanApprovalCard.vue` Vue component + `ApprovalPort.requestPlanApproval()` wired to a no-op mock — exercises the keyboard/Vue patterns without depending on the streaming port.
