---
id: RES-ASV-001
title: 'Agent Sidepanel v2 — Research'
stage: research
feature: agent-sidepanel-v2
status: in-progress
owner: dev
created: 2026-05-16
updated: 2026-05-16
references:
  - external: 'https://github.com/YishenTu/claudian'
  - spec: 'specs/agent-sidepanel-v2/idea.md'
  - spec: 'specs/agent-sidepanel-mvp/design.md'
---

## Scope

Research notes for Increment 2+ of `agent-sidepanel-v2` — adopt Claudian-style UX
features scoped to Claude integration only. Source: deep-dive subagent reports on
[Claudian](https://github.com/YishenTu/claudian) (2026-05-16) plus a feasibility
report on our own streaming + cancellation surfaces.

## D-ASV-1 — Streaming responses (highest priority)

**Verdict:** ship in PR-ASV-2 (this branch). Both adapters already have the
primitives.

- `ClaudeCliAdapter` (SDK transport, `src/infrastructure/obsidian/ClaudeCliAdapter.ts:170`)
  iterates `for await (const message of gen)` and currently collects only the
  final `result` event. The SDK natively emits `partial` / `stream_event`
  messages; the existing `AbortController` (line 118) already supports
  cancellation.
- `ClaudeSubprocessAdapter` (subscription transport,
  `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts:709-718`) already
  passes `--output-format stream-json --verbose --include-partial-messages`
  and reassembles NDJSON from `stdoutBuffer` in `_handleNdjsonLine`. Cancellation
  exists via `_killChild` (SIGTERM → SIGKILL @ 200ms ladder).

**Port shape** (added in PR-ASV-2-port — this branch):

```ts
queryStream(prompt: string, options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta>

type StreamDelta =
  | { type: 'text'; text: string }
  | { type: 'session-id'; sessionId: SessionId }
  | { type: 'done' }
  | { type: 'error'; error: ClaudeCliError }

interface ClaudeCliStreamOptions extends ClaudeCliQueryOptions {
  signal?: AbortSignal
}
```

**Sizing** — four mergeable PRs:

| PR               | Scope                                                                                                                      | Est. LOC |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| PR-ASV-2-port    | Port interface + `streamFromQuery` helper + mock + bridge + adapter stubs (delegate to `query()`)                          | ~250     |
| PR-ASV-2-subproc | `ClaudeSubprocessAdapter` real impl: refactor `_spawnChild` NDJSON loop to yield text deltas; wire `signal` to kill ladder | ~250     |
| PR-ASV-2-sdk     | `ClaudeCliAdapter` real impl: emit text deltas from SDK `partial` events; wire `signal` to existing `AbortController`      | ~200     |
| PR-ASV-2-ui      | `ChatSidebar.handleSend` switches to `queryStream`; render `streamingText` in `MessageList`; "Stop generation" button      | ~250     |

## D-ASV-2 — Slash-command palette (`/`)

**Claudian reference:** `src/shared/components/SlashCommandDropdown.ts`,
`src/utils/slashCommand.ts`, `src/providers/claude/commands/ClaudeCommandCatalog.ts`.

**Trigger rules:** `/` at position 0 OR preceded by whitespace; scans backward
from caret. Aborts if whitespace appears after the trigger.

**Command sources (Claudian, in order):**

1. Built-ins (TS-encoded actions): `clear`, `add-dir`, `resume`, `fork`. Only
   shown when trigger is at position 0.
2. SDK-probed commands via `conversation.supportedCommands()` (Anthropic Agent
   SDK scans `.claude/commands/` and `.claude/skills/` in vault + user home).
3. Vault-fallback loader (`commandStorage` + `skillStorage`).

**Frontmatter schema (kebab-case primary, camelCase fallback):**
`description`, `argument-hint`, `allowed-tools`, `model`,
`disable-model-invocation`, `user-invocable`, `context`, `agent`, `hooks`.

**Specorator port plan:**

- New `CommandCatalogPort` in `src/domain/ports/` with
  `listCommands(scope): Promise<CommandDef[]>`.
- New `useSlashPalette()` composable in `src/ui/composables/`.
- `ChatInput.vue` gains a `/` keystroke handler that opens the dropdown.
- Frontmatter parser in `src/application/commands/` reads `.claude/commands/*.md`
  through `VaultPort`.

**Smallest mergeable PR (PR-ASV-3):** built-ins only (`/clear`,
`/new-conversation`, `/advance-stage`). No SDK probe; no vault loader. ~600 LOC.
Vault and SDK sources land in PR-ASV-6.

## D-ASV-3 — `@`-file mention picker

**Claudian reference:** `src/shared/mention/{MentionDropdownController,VaultMentionCache,VaultMentionDataProvider}.ts`.

**Trigger rules:** `@` at position 0 OR preceded by whitespace. 200ms debounce
on input. Submenu pattern for drill-down (agents, MCP servers, external dirs).

**Result shapes (Claudian, six discriminated kinds):**

- `mcp-server` — inserted as text
- `agent-folder` / `agent` — drill-down → leaf inserted as `@${id} (agent) `
- `context-folder` / `context-file` — external dirs
- `folder` — vault folder, inserted as `@${path}/ `
- `file` — vault file, inserts display token AND adds an attached-file chip

**Scoring:** substring match on `path` OR `name`, lowercased. Sort: prefix-match
→ mtime → type → path. Caps: 50 folders, 100 files.

**Specorator port plan:**

- New `VaultMentionPort` wrapping `VaultPort.listFiles/listFolders` + an mtime
  accessor.
- New `useMentionPicker()` composable.
- `chatStore.attachedFiles: AttachedFileDto[]` (plain DTO — ADR-003).
- `ChatInput.vue` gains an `@` keystroke handler.

**Smallest mergeable PR (PR-ASV-4):** vault files only (no folders, no agents,
no MCP, no external dirs); no caching layer (read straight through
`VaultPort`). ~600 LOC.

## D-ASV-4 — Plan mode + inline approval

**Verdict:** orthogonal to our existing `FileWriteProposalCard` — they can
compose under a single `ApprovalPort`. Defer until streaming is shipped.

Plan Mode is a Claude Code CLI/SDK concern, not a plugin feature. The plugin
**reacts** to the SDK's `ExitPlanMode` tool call via
`setExitPlanModeCallback()`. The inline approval card (Implement / Revise /
Cancel) is a keyboard-driven Vue component sibling of `FileWriteProposalCard`.

**Smallest mergeable PR (PR-ASV-5):** `InlinePlanApprovalCard.vue` + an
`ApprovalPort.requestPlanApproval()` wired to a no-op mock. Real SDK wiring
follows in a later PR. ~400 LOC.

## D-ASV-5 — Markdown + code block rendering

Currently `MessageList.vue` renders messages as `<pre>` blocks (plain text).
Claudian renders markdown with syntax-highlighted code blocks via
`utils/markdown.ts`. For Specorator we'd add a `MarkdownRenderer` composable
backed by an existing markdown library (or Obsidian's own `MarkdownRenderer`
when available — guarded behind the narrow port pattern).

**Smallest mergeable PR (PR-ASV-7):** swap the `<pre>` in `MessageList.vue` for
a `MarkdownBlock.vue` component that renders markdown without code-block
highlighting. ~300 LOC. Highlighting in a follow-up.

## D-ASV-6 — Tool-call rendering

When Claude makes a tool call (Edit, Write, Bash, etc.), Claudian renders an
inline card with the tool name, input args, and result. The Anthropic SDK
emits `tool_use` and `tool_result` blocks as part of the streamed `assistant`
message.

**Specorator port plan:** extend `ChatMessage` with a discriminated content
variant: `{ type: 'text'; text: string } | { type: 'tool_use'; ... }`. Pivot
`MessageList.vue` to render per-block. The existing single-string `text` field
becomes a normalized `content: ContentBlock[]`.

**Smallest mergeable PR (PR-ASV-8):** add `ContentBlock` discriminated union;
render `tool_use` / `tool_result` with collapsible details. Defer Edit/Write
diff-rendering to PR-ASV-9. ~500 LOC.

## D-ASV-7 — Image embeds (deferred)

Claudian supports clipboard paste / drag-drop of images. Our `VaultPort`
already lets us read binary files; the SDK accepts image content blocks.
Defer to Increment 3 — not on the critical path to Claudian-parity.

## D-ASV-8 — Thread switcher / multi-tab (deferred)

Claudian supports multi-tab chats with persisted per-tab state. Our
`chatThreads` Map already has the metadata (each `ChatThreadRecord` is a
"tab"); we just need a UI. Defer to Increment 3 — depends on streaming +
slash + @-mention shipping first, otherwise users have no compelling reason
to keep multiple conversations open.

## Open risks

- **R-ASV-1** — SDK streaming events differ between `partial`, `assistant`,
  and `stream_event` types. The streaming-feasibility report assumed `partial`
  events carry text deltas; verify against the actual SDK message shapes
  before writing PR-ASV-2-sdk. Mitigation: read the SDK type definitions
  exported from `@anthropic-ai/claude-agent-sdk` and add a typed adapter
  function.
- **R-ASV-2** — `ClaudeSubprocessAdapter._spawnChild` is a 130-line method
  with a `pending.textBuffer` accumulator. Refactoring it to yield deltas
  while preserving the existing `query()` contract risks regression on the
  free-text path. Mitigation: keep `query()` as a thin wrapper over the new
  `queryStream()` that collects all `text` deltas into a single string.
- **R-ASV-3** — Stop-button cancellation in the SDK path uses
  `AbortController.abort()`. The SDK might not honor mid-tool-call abort
  cleanly; partial tool calls could leak. Mitigation: emit a final
  `{ type: 'error', error: QUERY_FAILED }` on abort regardless, and accept
  that the underlying SDK call may take a beat to clean up.
- **R-ASV-4** — Slash-command markdown loader needs frontmatter parsing.
  Reuse the existing `parseStructuredEnvelope` / Zod approach? Or import a
  YAML parser? Decide in PR-ASV-3 design.

## Decisions

- **D-ASV-1 / D-ASV-2 / D-ASV-3 / D-ASV-5 / D-ASV-6** in scope for Increment 2.
- **D-ASV-4** in scope for Increment 2 (PR-ASV-5) but lower priority than
  streaming.
- **D-ASV-7 / D-ASV-8** deferred to Increment 3.

## Hand-off

| Date       | From | To  | Note                                                             |
| ---------- | ---- | --- | ---------------------------------------------------------------- |
| 2026-05-16 | dev  | dev | Research notes captured; PR-ASV-2-port in flight on this branch. |
