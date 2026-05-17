---
id: d7e8f9a0-1234-4b56-9c78-d9e0f1a2b3c4
feature: 'Agent Sidepanel v2'
area: ASV
slug: agent-sidepanel-v2
current_stage: retrospective
status: active
last_updated: 2026-05-17
last_agent: release-manager
createdAt: 2026-05-16T00:00:00+02:00
updatedAt: 2026-05-17T08:00:00+02:00
artifacts:
  idea: complete
  research: complete
  requirements: complete
  design: complete
  spec: complete
  tasks: complete
  implementation-log: complete
  test-plan: complete
  test-report: complete
  review: complete
  release-notes: complete
  retrospective: pending
---

## Stage progress

| Stage              | Status      | Artifact                                                                                                            | Notes                                                                                                                                                                                                                                |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Idea           | complete    | `idea.md`                                                                                                           | IDEA-ASV-001 — Dedicated sidepanel + Claudian-inspired UX.                                                                                                                                                                           |
| 2 — Research       | complete    | inline in `workflow-state.md` ("Increment 2+ research wave")                                                        | Two research subagents: Claudian-issue mining + Specorator-vs-Claudian gap analysis. Five reviewer subagents (UX, a11y, security, performance pending, architecture) on the v2 PR stack.                                            |
| 3 — Requirements   | complete    | implicit — derived from Claudian feature-set scoped to Claude                                                       | Captured in tracking issue #385 (parity checklist). Explicit non-goals documented.                                                                                                                                                  |
| 4 — Design         | complete    | inline PR descriptions across the 14 PRs                                                                            | Narrow-port discipline (ADR-008) for every new surface (`MarkdownRenderPort`, `ApprovalPort`, `SecretStorePort`). `StreamDelta` discriminated union (ADR-0034 candidate — see OQ-ASV-4).                                            |
| 5 — Specification  | complete    | per-PR commit messages + spec entries                                                                               | Each PR carries a complete spec section in its body.                                                                                                                                                                                  |
| 6 — Tasks          | complete    | implicit — 14 PRs                                                                                                   | Subagent-driven decomposition; each PR is a single mergeable unit.                                                                                                                                                                  |
| 7 — Implementation | complete    | PRs #369, #370, #371, #372, #373, #374, #375, #376, #377, #378, #379, #380, #381, #386, #387, #388, #391             | 17 PRs squash-merged to `develop`. Codex P1/P2 findings addressed across the stack. Migration-removal rebuttals stand per maintainer directive (pre-shipped product, no migration shims).                                          |
| 8 — Testing        | complete    | per-PR test coverage                                                                                                | Each PR gated on full pre-PR + CI matrix (typecheck + lint + test + plugin build) — 1600+ unit tests pass on the merged `develop`. The per-PR CI gates and Codex review threads serve as the test-plan / test-report artifacts for this stack (no dedicated documents authored — explicitly accepted as substitute coverage).                              |
| 9 — Review         | complete    | Codex P1/P2 reviews per-PR                                                                                          | Reviewer subagent reports synthesized into per-PR follow-up commits. Migration-removal rebuttal stands per maintainer directive (pre-shipped product, no migration shims).                                                          |
| 10 — Release       | complete    | per-PR descriptions across 17 merged PRs                                                                            | Stack fully merged to `develop` (including the three deferred PRs and the polish-wave subset). The squash-merge commit bodies serve as the release-notes artifact.                                                                  |
| 11 — Retrospective | pending     | —                                                                                                                   | After demo / main promotion.                                                                                                                                                                                                        |

## PR stack (Increment 1 + Increment 2)

| #     | Branch                                                          | Scope                                                          | Status                                |
| ----- | --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| #369  | `claude/refactor-agent-sidepanel-2CDgl`                         | Sidepanel lift + multi-turn message list                       | ✅ Merged · `d34e0c8`                  |
| #370  | `claude/agent-sidepanel-v2-streaming-port`                      | `queryStream` port shape + `streamFromQuery` helper             | ✅ Merged · `f7204af`                  |
| #371  | `claude/agent-sidepanel-v2-streaming-sdk`                       | SDK real streaming + P1 abort race + P1 exhaustion              | ✅ Merged · `e5ff9cc`                  |
| #372  | `claude/agent-sidepanel-v2-streaming-ui`                        | UI consume + Stop button + P2 buffer reset                      | ✅ Merged · `8d601c8`                  |
| #373  | `claude/agent-sidepanel-v2-markdown`                            | Hand-rolled markdown + P2 link-parens                           | ✅ Merged · `42bf311`                  |
| #374  | `claude/agent-sidepanel-v2-streaming-subproc-v2`                | Subprocess real streaming                                       | ✅ Merged · `991d350`                  |
| #375  | `claude/agent-sidepanel-v2-slash-palette`                       | Slash palette + P2 ×3 (clear-on-select / token-bounds / selEnd) | ✅ Merged · `427de48`                  |
| #376  | `claude/agent-sidepanel-v2-mention-picker`                      | `@`-mention picker + IME guard + P2 ×5                          | ✅ Merged · `f6fdfad`                  |
| #377  | `claude/agent-sidepanel-v2-obsidian-markdown`                   | Obsidian `MarkdownRenderer` port + P1 render race               | ✅ Merged · `a336f4e`                  |
| #378  | `claude/agent-sidepanel-v2-stream-delta-extension`              | `StreamDelta` extension (SDK + chatStore additions)             | ✅ Merged · `350a8f7`                  |
| #379  | `claude/agent-sidepanel-v2-tool-rendering`                      | `ToolCallBlock` + `ThinkingBlock` + compact-boundary            | ✅ Merged · `28ee42c`                  |
| #380  | `claude/agent-sidepanel-v2-plan-mode`                           | `InlinePlanApprovalCard` + `ApprovalPort`                       | ✅ Merged · `f13e5e0`                  |
| #381  | `claude/agent-sidepanel-v2-folder-mentions`                     | Folder rows in `@`-picker                                       | ✅ Merged · `3684bf4`                  |
| #386  | `claude/agent-sidepanel-v2-stream-delta-extension-v2`           | Subprocess parity for `StreamDelta` extension (Codex P1/P2)     | ✅ Merged · `db6093b`                  |
| #387  | `claude/agent-sidepanel-v2-secret-storage-v2-retry`             | `SecretStorePort` — Anthropic key in OS keychain                | ✅ Merged · `e603b0f`                  |
| #388  | `claude/agent-sidepanel-v2-slash-vault-commands`                | Vault-loaded slash commands (.claude/commands + skills)         | ✅ Merged · `8cd51e6`                  |
| #391  | `claude/agent-sidepanel-v2-polish-wave`                         | i18n + port file PascalCase renames (polish-wave subset)        | ✅ Merged · `542515b`                  |

## Blocks

None.

## Hand-off notes

| Date       | From | To  | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-16 | pm   | dev | Spec entry created on `claude/refactor-agent-sidepanel-2CDgl` to track the agent-sidepanel v2 work. Increment 1 of v2 is a pure structural lift: extract chat into its own `ItemView` (`VIEW_TYPE = 'specorator-agent'`), remove `/chat` from `MainLayout` tab nav, preserve every existing REQ-CCS / REQ-ASM behaviour. Claudian-style UX features (multi-turn message list, streaming, slash-command palette, @file mentions) land as Increment 2+.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-05-16 | dev  | qa  | PR-ASV-1 landed structural lift + multi-turn message list. New surfaces: `AgentSidepanelView` (`VIEW_TYPE_AGENT = 'specorator-agent'`), `AgentSidepanelRoot.vue`, `AgentSidepanelHeader.vue`, `MessageList.vue`, `ChatMessage` DTO + `appendMessage`/`clearThreadMessages` store actions. Removed: `/chat` route, `ChatSidebarView.vue`, `nav.chat` i18n key. URI handler reroutes `open-chat`/`focus-chat` to the new sidepanel. 1445 tests pass (34 new), typecheck clean, plugin build and standalone web build pass. Streaming, slash palette, `@`-mentions, stop-button still deferred to Increment 2.                                                                                                                                                                                                                                                                                                |
| 2026-05-16 | dev  | dev | PR-ASV-1 post-open polish: Codex P2 (clear prior thread's message bucket on "New conversation") fixed by `handleNewConversation` calling `clearThreadMessages(prev)` before rotating `activeThreadId`. Internal-review P1 #2 closed by `tests/plugin/main.uri-handler.test.ts` covering all action branches (`open-chat`, `focus-chat`, `open-agent`, deferred, unknown, core short-circuit). Internal-review P2 #5 (MessageList scroll watcher will miss streaming deltas) documented inline as a forward-looking comment. Deferred: P1 #1 / P2 #6 (`SpecoratorView` retains a now-vestigial chat-thread hydration + status watcher — harmless dead code in production but load-bearing in `tests/plugin/SpecoratorView.test.ts`; clean up in a follow-up refactor PR before Increment 2). P3 polish (i18n unused keys, hard-coded `getDisplayText`, single timestamp for user+assistant turns) deferred. |
| 2026-05-16 | dev  | dev | Increment 2 wave landed across 11 PRs (streaming port → tool rendering → plan-mode card → folder mentions → SecretStorage). Five reviewer subagents (UX / a11y / security / performance / architecture) dispatched in parallel. Findings consolidated for a polish-wave dispatch — see "Reviewer findings" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-05-17 | dev  | dev | Mop-up wave: the three deferred PRs all landed on `develop`. #386 (`db6093b`) reimplemented subprocess parity for the v2 `StreamDelta` union on top of #378's SDK-only base, with the Codex P1 inputJson seed + P2 partial-usage-merge fixes baked in. #387 (`e603b0f`) reimplemented `SecretStorePort` cleanly on current develop — `anthropicApiKey` removed from `PluginSettings`, `_apiKeyCache` hydrated from `App.secretStorage` in `loadSettings()`, transport selector takes `apiKeyPresent: boolean` in `deps`. #391 ports the still-meaningful subset of the polish-wave (de.ts translation, six new i18n keys, three kebab→PascalCase port file renames); the larger template / store / view diffs were dropped because their base predates the mention-picker + slash-palette work. 1685 tests pass; ESLint 0 errors; plugin + standalone web builds clean across all three. |

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

## Increment 2+ research wave (2026-05-16, post-streaming)

Two follow-up research subagents mined Claudian's GitHub history + did a side-by-side gap analysis after PRs #370–#376 landed. Output captured here so future implementers don't re-research.

### Top-5 remaining gaps (priority order)

1. **Obsidian `MarkdownRenderer` port (P1).** Hand-rolled `MarkdownBlock.vue` parser misses GFM tables, code syntax highlighting, math (`$...$` / `$$...$$`), wikilinks, image embeds, mermaid. Single highest-leverage change. Pattern: new `MarkdownRenderPort` in `src/domain/ports/`, `ObsidianMarkdownRenderAdapter` wraps `MarkdownRenderer.render(this.app, …)`, `MockMarkdownRenderAdapter` keeps the hand-rolled parser for jsdom unit tests.
2. **`StreamDelta` union extension (P1).** Today: `text | session-id | done | error`. Missing: `thinking | tool-use-start | tool-use-input-delta | tool-use-stop | compact-boundary | usage`. Gates tool-call rendering and plan-mode wiring. Touches `ClaudeCliPort.ts`, both adapters (`ClaudeCliAdapter._dispatchMessage`, `ClaudeSubprocessAdapter._handleNdjsonLine`), both mocks, and `ChatSidebar.consumeStream`.
3. **Tool-call + thinking rendering (P1).** Build `src/ui/components/chat/tool-call/ToolCallBlock.vue` dispatching on `tool_use.name`. Five renderers cover ~90% of real traffic: Bash / Read / Write / Edit / TodoWrite. Plus `ThinkingBlock.vue` (collapsed `<details>` showing thinking deltas). Depends on #2.
4. **IME `isComposing` guard + folder mentions in `@`-picker.** IME guard shipped on `claude/agent-sidepanel-v2-mention-picker` 2026-05-16. Folder mentions deferred — extend `vaultFileSearch.ts` with `kind: 'file' | 'folder'`, render `@<name>/` for folders, no chip on folder selection.
5. **Subprocess polish.** Audit `ClaudeBinaryResolver` PATH discovery against Claudian's list (volta / asdf / npm_config_prefix / native + global node_modules entries). Ensure `options.signal.abort()` reaches `_killChild` mid-flight (not just on timeout).

### Lessons from Claudian's bug history (defer if not currently affecting us)

- **Stream dedup.** Claudian PR [#510](https://github.com/YishenTu/claudian/pull/510): when `--include-partial-messages` emits the same block in both `content_block_delta` and `content_block_stop`, naïve consumers double-render. **Verify** our reducer dedup once tool-call rendering lands.
- **Stop-hook loop.** Claudian PR [#502](https://github.com/YishenTu/claudian/pull/502) / issue [#624](https://github.com/YishenTu/claudian/issues/624): the Stop hook fires AFTER a turn naturally ends; if treated as user-abort it causes infinite re-prompts. **Our SDK path is immune** (we don't run the Claude Code CLI hook subsystem). Subprocess path: verify we ignore Stop-hook events post-`result`.
- **Math during streaming kills perf.** Claudian PR [#608](https://github.com/YishenTu/claudian/pull/608): defer math rendering to end-of-message. Applies when we add KaTeX support to `MarkdownBlock` (gap #1 above).
- **JSONL transcript tailing.** Claudian issue [#637](https://github.com/YishenTu/claudian/issues/637): full-file reread every 100ms → 399% CPU. We don't tail JSONL today. **Avoid if** we add a session-log viewer.
- **Windows reserved filenames.** Claudian PR [#612](https://github.com/YishenTu/claudian/pull/612) had to rename a folder `aux` → `auxiliary`. **Audit** our `.claude/` + `templates/` tree before any Windows-user rollout.
- **Configurable send shortcut.** Claudian PR [#643](https://github.com/YishenTu/claudian/pull/643): users want Enter=newline / Cmd+Enter=send vs. Enter=send / Shift+Enter=newline. **Defer** until a Windows / macOS keyboard-preferences ADR.
- **`outputStyle` settings propagation.** Claudian issue [#544](https://github.com/YishenTu/claudian/issues/544). **Defer** — the SDK adapter inherits `~/.claude/settings.json` automatically; subprocess path stays unaffected because we never start under a user's claude settings file by design (NFR-ASM-004).
- **`compactionControl.enabled` default.** Claudian issue [#598](https://github.com/YishenTu/claudian/issues/598): the SDK's compaction default has flipped between releases. **Verified** in our pinned SDK: no public `compactionControl` option exposed; compact boundaries are emitted via `SDKCompactBoundaryMessage`. Add a delta handler for that event (covered by gap #2).
- **Tier-alias model leaks to provider.** Claudian issue [#578](https://github.com/YishenTu/claudian/issues/578): bare `"opus"` returns 429 from non-Anthropic endpoints. **N/A today** (no model picker); revisit if we add one.

### Out of scope for v2 (explicit non-goals)

- Multi-provider routing (Codex, Opencode, ACP). Locked to `@anthropic-ai/claude-agent-sdk` + local CLI per ADR-0029.
- `BangBashService` / shell-passthrough — security posture forbids.
- Image embeds / paste-from-clipboard — workflow plugin, not a chat-first product.
- External context directories — H-ACD principle requires vault as operating environment.
- `BrowserSelectionController` / Canvas selection — handled by a separate spec (Canvas tool group).
- Mobile support — desktop-only is a hard constraint of both transports.
