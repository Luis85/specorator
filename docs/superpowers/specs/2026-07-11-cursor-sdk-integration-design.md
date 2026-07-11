---
title: Cursor SDK integration — design
date: 2026-07-11
status: draft
scope: cursor-sdk-migration
parent: "[[Multi Provider Support]]"
---

# Cursor SDK integration — design

## Problem

The Cursor provider is the only backend that hand-rolls its runtime: it spawns
the `cursor-agent` CLI directly (`-p --output-format stream-json`), parses the
NDJSON by hand, and rebuilds session, tool, and streaming semantics that the
provider already owns. That surface has been persistently fragile — spawn locks,
process-tree kills, Windows shell selection, cumulative-snapshot text dedup, and
a one-shot `--print` AskUserQuestion workaround (collect the answer, mark the
tool neutrally, resume as a follow-up turn). Successive fixes have addressed
symptoms rather than the root cause: we are reimplementing an agent harness
instead of adapting to one.

Cursor shipped an official TypeScript SDK (`@cursor/sdk`, April 2026) that
exposes the same runtime that powers the Cursor app and CLI. Adopting it aligns
Cursor with how Claude and Codex already work here — an official provider SDK
bundled as a dependency — and lets us delete the hand-rolled orchestration
wholesale.

This migration replaces the `cursor-agent` subprocess integration with
`@cursor/sdk`, accepting the new dependency.

## Decisions (locked)

- **Auth: require `CURSOR_API_KEY`.** One auth path. The SDK authenticates with a
  Cursor API key (API/token-based pricing); the CLI additionally supported
  `cursor-agent login` (subscription). We take the clean single path. The
  settings UI already surfaces `CURSOR_API_KEY`, so this is a small step; the
  install guide gains a "get an API key" note. No-key ⇒ runtime reports
  not-ready with a clear notice.
- **History: clean break.** Pre-migration Cursor conversations were created by
  the CLI and keyed to CLI session ids. After migration they may not resolve
  through the SDK; that is accepted. Cursor is opt-in, so blast radius is small.
- **Strategy: full immediate cut, no separate spike.** Build the SDK runtime and
  delete the CLI plumbing in one pass, validating in-app as we go. The one hard
  unknown (native-binary distribution + Electron load) is front-loaded into
  Milestone 1 so it is hit on day one rather than ceremonially gated.

"Delete the CLI" means removing the hand-rolled subprocess *orchestration*
(NDJSON mapper, spawn lock, process-tree kill, launch-args, Windows shell env,
the AskUserQuestion follow-up hack). The binary *resolver* is repurposed, not
deleted (see §Auth, helper binaries & permission-mode mapping).

## Verified facts about `@cursor/sdk`

Verified against the installed package's type definitions and minified
implementation (`@cursor/sdk@1.0.23`), not docs paraphrase:

- Package `@cursor/sdk@1.0.23`; `engines.node >= 22.13` (repo already requires
  this); unpacked 18.6 MB / 304 files. JS deps: `@bufbuild/protobuf`,
  `@connectrpc/connect{,-node,-web}`, `@statsig/js-client`, `zod@3`.
- **The local agent harness runs in-process** (webpack-bundled JS,
  `createLocalExecutor`). There is no agent binary. The per-platform optional
  deps (`@cursor/sdk-linux-x64` etc.) ship only two helper binaries:
  `bin/rg` (ripgrep) and `bin/cursorsandbox`.
- Helper-binary discovery walks **up from `dirname(process.argv[1])`** looking
  for `node_modules/@cursor/sdk-<platform>/bin/<name>` — which fails inside
  Obsidian (argv[1] is Electron's, not the plugin's). Ripgrep has a
  `CURSOR_RIPGREP_PATH` env override (read from `process.env`, settable
  in-process) plus a PATH-search fallback. `cursorsandbox` has **no override**;
  without it, `sandboxOptions: { enabled: true }` fails with a
  "sandboxing is not supported in this environment" `ConfigurationError`.
- `AgentOptions`: `{ model: { id, params? }, apiKey?, name?, local?, cloud?,
  mcpServers?, agents?, agentId?, mode? }`. `AgentModeOption = "agent" | "plan"`
  — there is **no `ask` mode** in the SDK.
- `LocalAgentOptions`: `{ cwd?, autoReview?, store?, settingSources?,
  sandboxOptions?: { enabled: boolean }, customTools?, enableAgentRetries? }`.
  `SettingSource = "project" | "user" | "team" | "mdm" | "plugins" | "all"`.
  Explicit `sandboxOptions.enabled: false` → `insecure_none` policy; leaving it
  unset defers to `~/.cursor/sandbox.json` / SDK defaults — so we always pass it
  explicitly.
- `SDKCustomTool = { description?, inputSchema?, execute(args, ctx) }` —
  in-process callback tools exposed to the model via a `custom-user-tools` MCP
  server. This is the AskUserQuestion transport (see below).
- `agent.send(message | { text, images: [{ data | url, mimeType }] },
  { mode?, onDelta?, onStep?, local? })` → `Run`. `run.stream()` yields
  **message-granularity** `SDKMessage`s (`system`, `user`, `assistant`,
  `tool_call` with `status: running|completed|error`, `thinking`, `status`,
  `request` — carries only `request_id`, no payload and no respond API —
  `task`, `usage`); fine-grained typing-effect streaming comes from
  `send({ onDelta })` `InteractionUpdate`s: `text-delta`, `thinking-delta`,
  `thinking-completed`, `token-delta`, `tool-call-started`,
  `partial-tool-call`, `tool-call-completed`, `shell-output-delta`,
  `turn-ended`, `user-message-appended`, …
- Typed `ToolCall` union (`toolCall.type`): `read`, `edit`, `write`, `delete`,
  `shell`, `grep`, `glob`, `ls`, `mcp`, `task`, plus `createPlan`, `readLints`,
  `semSearch`, `updateTodos` exports. **No ask-question variant** — the mapper
  keeps an unknown-kind fallback.
- History: `run.conversation()` is a method on `Run`; recovery from a stored
  agent id goes through `Agent.messages.list(agentId, { cwd })` or
  `Agent.listRuns(agentId, { runtime: 'local', cwd })` → per-run
  `conversation()`. `Agent.delete/archive` are **cloud-only**.
- Local persistence: default store is SQLite via `node:sqlite`/`bun:sqlite`
  (Obsidian's Electron ships `node:sqlite`; the current history store already
  uses it), with `JsonlLocalAgentStore(rootDir)` as the explicit fallback and
  `isSqliteModuleLoadError()` to detect the failure. State root:
  `CURSOR_DATA_DIR` env or `~/.cursor/projects/…`.
- `Cursor.models.list()` → `ModelListItem[]` (`id`, `displayName`, `aliases?`,
  `parameters?`, `variants?`) — maps onto the existing family/variant catalog.
- `TokenUsage = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
  totalTokens, reasoningTokens? }`.
- Errors: `CursorSdkError` base; `AuthenticationError`, `ConfigurationError`,
  `RateLimitError`, `AgentBusyError`, `AgentNotFoundError`, `NetworkError`.
- Disposal: `agent.close()` / `agent[Symbol.asyncDispose]()`.
- `import.meta.url` appears only in the ESM build; esbuild's CJS resolution
  takes `dist/cjs`, so no `patchSdkImportMeta` entry is expected (verified by
  build smoke in Milestone 1).
- **Footgun:** when the resolved backend URL matches `localhost`/`127.0.0.1`,
  the local executor sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"`
  **process-wide**. Specorator must never pass a loopback `CURSOR_BASE_URL`
  through to the SDK (the env allowlist already denies
  `NODE_TLS_REJECT_UNAUTHORIZED` itself).

The environment is `isDesktopOnly: true`, so desktop-only helper binaries are
acceptable; there is no mobile target to satisfy.

## Architecture — the seam does not move

`ChatRuntime` (`src/core/runtime/ChatRuntime.ts`) is unchanged. We swap only the
implementation behind `providerId: 'cursor'`. The runtime holds an `Agent`
instead of a `child_process`:

- `ensureReady()` → resolve API key + runtime binary; construct/validate the
  `Agent`. Readiness flips false with a clear notice when either is missing.
- `query()` → `agent.send(prompt)`, then adapt `run.stream()` `SDKMessage`s into
  neutral `StreamChunk`s.
- `cancel()` → `run.cancel()` (+ `agent.close()` on teardown), replacing the
  SIGTERM→SIGKILL→taskkill escalation.
- `syncConversationState()` / `buildSessionUpdates()` → persist the SDK agent id
  as `chatSessionId` in `CursorProviderState` (unchanged shape).
- Resume via `Agent.resume(id)` (replaces `--resume`).

Everything downstream (chat UI, message renderer, `providerState`) is untouched
because it only ever sees `StreamChunk`s. The `Agent` handle is **per turn**,
not per runtime: each `query()` calls `Agent.resume(activeResumeId)` (or
`Agent.create` when none) and `close()`s in its `finally`. Conversation
switches within the same tab only call `syncConversationState(...)`
(`ConversationController.switchTo` does not rebuild the runtime), so the
resume id is re-read from the synced conversation on every turn — no SDK state
can leak across conversations (review finding). Capability flags stay as
today; `supportsPersistentRuntime` stays `false` for v1 (no promotion into
shared coordinators).

## Auth, helper binaries & permission-mode mapping (Milestone 1)

At `ensureReady()`:

- **API key** — read `CURSOR_API_KEY` (and optional `CURSOR_BASE_URL`) from
  `plugin.getResolvedEnvironmentVariables('cursor')` (falling back to host
  `process.env.CURSOR_API_KEY`) and pass as the SDK `apiKey` option. Today these
  are plumbed as subprocess env via `cursorAgentEnv.ts`; that file is deleted
  and the values become SDK options. Loopback guard (TLS footgun above) works
  at **both** layers, because the SDK runs in-process and reads `process.env`
  directly: a loopback settings-box `CURSOR_BASE_URL` is rejected, **and**
  loopback host-env values of the vars the SDK itself reads
  (`CURSOR_API_BASE_URL`, `CURSOR_BACKEND_URL`, `CURSOR_BASE_URL`) are cleared
  from `process.env` before every agent creation (review finding — rejecting
  only the configured option is insufficient when Obsidian was launched with a
  loopback var already set). The reconciler's
  `ENV_HASH_KEYS = ['CURSOR_API_KEY','CURSOR_BASE_URL']` session-invalidation
  contract is retained verbatim.
- **Helper binaries** — the agent harness itself is bundled JS (in-process);
  only ripgrep and `cursorsandbox` are native, and the SDK's argv[1]-relative
  discovery fails inside Obsidian. Resolution:
  - **ripgrep**: set `process.env.CURSOR_RIPGREP_PATH` before agent creation
    when discoverable. Reuse `CursorBinaryLocator`-style PATH discovery to find
    an `rg` (the user's cursor-agent install dir and plain PATH both ship one);
    if none is found, grep-tool degradation is Cursor's own fallback behavior.
  - **cursorsandbox**: no override exists, so OS sandboxing is treated as
    unavailable in-app for v1 (matching Windows today, where the CLI already ran
    `--sandbox disabled`). See the permission-mode mapping below for the
    resulting posture. If Cursor adds a sandbox-path override later, the mapping
    slots it back in without UI changes.

### Permission-mode → SDK options mapping

The CLI flags (`--force`, `--sandbox`, `--mode plan/ask`) die with the CLI, but
their **postures must be reproduced explicitly** — the SDK's implicit defaults
(unset `sandboxOptions` defers to `~/.cursor/sandbox.json`) are never relied on:

| Specorator mode | CLI today | SDK mapping (v1) |
|---|---|---|
| `normal` | `--sandbox enabled` (win32: `disabled`) | `sandboxOptions: { enabled: false }` + `autoReview: true`, plus a one-time "runs without OS sandbox" notice (see below) |
| `plan` | `--mode plan --sandbox enabled` | `mode: 'plan'` + same sandbox posture as `normal` |
| `yolo` | `--force --sandbox disabled` | `sandboxOptions: { enabled: false }`, `autoReview: false` |
| aux (read-only) | `--mode ask --sandbox enabled` | `mode: 'plan'` + `sandboxOptions: { enabled: false }` + prompt-level "reply with text only; do not create or modify files" (no `ask` mode exists in the SDK) |

Honest constraint, stated in settings UI copy: on macOS/Linux the CLI's
`normal` mode engaged an OS sandbox; the SDK cannot (no reachable
`cursorsandbox` in-app), so v1 `normal` differs from the CLI by running
unsandboxed with Cursor's Auto-review classifier (`autoReview: true`) instead.
Milestone 1 empirically re-checks whether `enabled: true` can work in-app
(e.g. if the SDK also PATH-searches or the user's cursor-agent install ships
`cursorsandbox`); if it can, `normal`/`plan` upgrade to
`{ enabled: true }` on macOS/Linux and the notice is dropped. This mapping is
a direct response to review: silently losing the sandbox posture is not
acceptable — the change is explicit, surfaced, and minimized.

Bundling: `@cursor/sdk`'s JS is bundled by esbuild like the Claude and Codex
SDK wrappers. esbuild's `require` resolution takes the CJS build (no
`import.meta`), so no `patchSdkImportMeta` entry is expected; Milestone 1's
build smoke asserts the bundle stays `import.meta`-free.

## Stream mapping — `SDKMessage` → `StreamChunk`

A new `cursorSdkStreamAdapter` replaces `cursorStreamMapper` and the entire
tool-normalization cluster. Because the SDK emits typed, structured events, the
fragile delta/snapshot dedup machinery (`mergeCursorAssistantText`, segment
tracking, doubled-snapshot guards) is no longer needed.

The adapter is **two-channel**: `run.stream()` yields message-granularity
`SDKMessage`s (lifecycle, tool calls, usage), while `send({ onDelta })`
`InteractionUpdate`s carry the fine-grained typing effect. Both feed one
ordered `StreamChunk` queue; text is emitted from `text-delta` updates and the
whole-message `assistant` duplicates are dropped (same pattern as Claude's
`sawStreamText` dedup — one boolean, not snapshot heuristics).

| SDK signal | `StreamChunk` |
|---|---|
| `system` (init) | capture `agent_id`/model; no chunk |
| `user` (echo) | ignored (`user_message_start` already emitted pre-stream) |
| onDelta `text-delta` | `text` |
| onDelta `thinking-delta` / `thinking-completed` | `thinking` |
| `tool_call` (`status: 'running'`) | `tool_use { id: call_id, name, input }` via typed `ToolCall` union (`read`/`edit`/`write`/`delete`/`shell`/`grep`/`glob`/`ls`/`mcp`/`task`/`createPlan`/…; unknown kinds fall back to raw name + args) |
| `tool_call` (`status: 'completed' \| 'error'`) | `tool_result { id, content, isError?, toolUseResult? }` (result caps re-homed from the old normalization) |
| onDelta `shell-output-delta` | `tool_output` |
| `assistant` message | dedup only (text already streamed via deltas) |
| `thinking` message | dedup only |
| `request` | no-op in local runs (carries only `request_id`; AskUserQuestion rides the custom tool instead) |
| `status` | `error` on `ERROR`; otherwise ignored |
| `task` | ignored in v1 (subagent lifecycle is fast-follow) |
| `usage` (`TokenUsage`) | `usage` via `core/providers/usage/buildUsageInfo` |
| stream end / `run.wait()` | terminal `error` (from `RunResult.error`) and/or `done` |

Usage still funnels through the canonical `buildUsageInfo` (contract-enforced by
`tests/unit/providers/shared/usageContractMatrix.test.ts`); the static
window/pricing catalog (`cursorModelWindowCatalog`) supplies `contextWindow`.

## Session, resume & history

- Session id: SDK agent id stored as `chatSessionId` in `CursorProviderState`
  (unchanged). Resume via `Agent.resume(id)`.
- History hydration (`CursorConversationHistoryService` + `cursorHistoryStore`)
  is rewritten off the SQLite `~/.cursor/chats/<hash>/<session>/store.db` reader
  onto APIs reachable **from the stored agent id alone** (review finding —
  `run.conversation()` hangs off a `Run`, not the resumed `Agent`):
  `Agent.messages.list(agentId, { cwd })` as the primary transcript source,
  with `Agent.listRuns(agentId, { runtime: 'local', cwd })` → per-run
  `conversation()` as the structured alternative if message payloads prove too
  lossy. Local SDK state lives under `CURSOR_DATA_DIR` / `~/.cursor/projects/…`.
  Pre-migration conversations keyed to CLI ids will not resolve through the SDK —
  the accepted clean break; they render as-is and start fresh on next turn.
- `extractLastUsage` (history-backed usage recovery) is re-derived from the
  latest run's `usage` (`Agent.listRuns` → `run.usage`); it must still return
  `null` on failure, never throw.
- Conversation deletion: `Agent.delete` is cloud-only. Local deletion goes
  through the `LocalAgentStore` row APIs where practical; otherwise v1 leaves
  orphaned local SDK state behind (bounded, documented) rather than
  reimplementing store internals.

## AskUserQuestion — delete the hack, go native via a custom tool

Delete `cursorAskUserQuestion.ts` (intercept + `buildCursorAnswerFollowUpPrompt`),
the `autoFollowUpText` staging for Cursor, and the Cursor branch of the
`InputController` auto-send coupling.

Verified transport: the SDK has **no** ask-question `ToolCall` variant, no
respond-to-run API, and its `request` message carries only a `request_id` — but
`LocalAgentOptions.customTools` registers **in-process callback tools** the
model can invoke. AskUserQuestion becomes a custom `ask_user` tool:

- `execute(args)` awaits `host.askUser(args, signal)` (the shared modal), then
  returns the selected answer(s) as the tool result — the model receives the
  answer **mid-turn**, in-process. Strictly better than both the CLI's
  auto-reject hack and a resume-follow-up.
- Cancel/teardown aborts the pending `askUser` via the existing
  `AbortController`; the tool then returns a neutral "user did not answer"
  result so the run can complete.
- The tool's `inputSchema` mirrors the AskUserQuestion shape the shared modal
  already renders (questions / options / multiSelect).

Milestone 3 validates model uptake (does the model call the tool when it needs
input?). The `ChatTurnMetadata.autoFollowUpText` seam stays in core (it is
provider-neutral), but Cursor stops using it.

## Aux services

`CursorAuxCliRunner` and the three thin services (title generation, instruction
refine, inline edit) are rewritten onto a one-shot SDK call (`Agent.prompt`, or a
short-lived `Agent.create` + `send` + `close`). The read-only posture the aux
runner enforces today (`--mode ask`) has no SDK equivalent (`ask` mode was
dropped); the aux row of the permission-mode table applies: `mode: 'plan'` plus
a prompt-level text-only constraint, never `autoReview`-relaxed. The shared
`AuxQueryRunner` contract (`query` / `reset`) and the `QueryBacked*` base
classes are untouched — the swap is contained to the runner internals. Title
generation stays provider-routed by the global `titleGenerationModel`.

## Capability parity + native upgrades

- **Plan mode** → SDK `mode: "plan"` / per-run `mode` (replaces `--mode plan`);
  post-plan approval card unchanged. Capability `supportsPlanMode` stays `true`,
  `planPathPrefix: '.cursor/plans'` unchanged.
- **Images** → `agent.send({ text, images: [{ data, mimeType }] })`; prompt
  encoder drops image hint plumbing.
- **Model listing** → `Cursor.models.list()` replaces the `agent --list-models`
  spawn in `cursorModelCatalog.runListModels`; the static catalog + families
  stay.
- **Subagents** → definitions still discovered and `@`-mentioned from vault
  (KEEP `CursorAgentStorage` + mention provider). To keep those mentions
  *functional*, every `Agent.create`/`Agent.resume` passes
  `local.settingSources: ['project', 'user']` so the SDK loads `.cursor/agents/`
  (vault) and `~/.cursor/agents/` (global) definitions exactly as the CLI did —
  without this, mentions would name agents the runtime cannot delegate to
  (review finding, verified against `SettingSource` in the SDK types). Native
  `agents: {}` (inline definitions) unblocks live async subagent lifecycle, but
  that is scoped as a **fast-follow, not v1**, to keep the migration bounded.
- **Capability flags** unchanged for v1: `supportsFork`, `supportsRewind`,
  `supportsProviderCommands`, `supportsMcpTools`, `supportsPersistentRuntime`
  stay `false`. SDK MCP and persistent-runtime are explicit non-goals here.

## File plan (20 DELETE / 11 REWRITE / 23 KEEP)

**DELETE (20)** — CLI orchestration cluster:
`runtime/cursorStreamMapper`, `cursorToolNormalization`, `cursorToolNameMap`,
`cursorToolInputMapping`, `cursorToolValueCoercion`, `cursorGrepFormatting`,
`cursorTaskPayload`, `cursorTaskSubagent`, `cursorAskUserQuestion`,
`cursorAgentSpawnLock`, `cursorProcessKill`, `cursorLaunchArgs`, `cursorLaunch`,
`cursorWindowsSpawn`, `cursorCliPrompt`, `cursorAgentEnv`,
`cursorQueryLaunch`, `cursorQueryLifecycle`, `cursorQueryProcessing`,
`cursorUsageMapping` (small usage→`UsageInfo` adapter may be re-homed if history
still needs it).

`cursorMcpCleanup` moves to **KEEP** (review finding): with
`settingSources: ['project', 'user']` the SDK re-reads user-level Cursor
settings including `~/.cursor/mcp.json`, so the one-shot migration that strips
the dead loopback `specorator` MCP entry older builds wrote there must survive
— otherwise affected users pay connection retries (or failed turns) on every
send. The SDK runtime keeps invoking it once per runtime before the first
agent creation, exactly as the CLI runtime does today.

**REWRITE (11)** — reimplement on the SDK:
`runtime/CursorChatRuntime`, `runtime/CursorAuxCliRunner`,
`auxiliary/CursorTitleGenerationService`, `auxiliary/CursorInstructionRefineService`,
`auxiliary/CursorInlineEditService`, `history/CursorConversationHistoryService`,
`history/cursorHistoryStore`, `prompt/encodeCursorTurn`,
`runtime/CursorCliResolver` + `runtime/CursorBinaryLocator` (repurposed to
discover ripgrep for `CURSOR_RIPGREP_PATH`; no agent binary exists to resolve),
`runtime/CursorTaskResultInterpreter`
(reimplement on SDK subagent types).

**KEEP (23)** — provider-neutral / still needed:
`capabilities`, `settings`, `types`, `types/agent`, `modelLabels`,
`runtime/cursorModelFamily`, `cursorModelId`, `cursorModelWindowCatalog`,
`cursorModelCatalog` (live-listing swaps to SDK), `cursorCliModel`,
`runtime/cursorMcpCleanup` (one-shot `~/.cursor/mcp.json` migration, see above),
`env/CursorSettingsReconciler` (its env-hash session invalidation and model
reconciliation have no CLI coupling — already SDK-correct as-is),
`registration`, `app/CursorWorkspaceServices`, `app/cursorWorkspaceAccess`,
`agents/CursorAgentMentionProvider`, `storage/CursorAgentStorage`, and all
settings UI (`ui/CursorChatUIConfig`, `CursorSettingsTab`, `CursorAgentSettings`,
`cursorModelFilter`, `cursorSettingsWidgets`, `visibleModelsPicker`).

## Testing

- Delete tests bound to deleted NDJSON/tool-normalization modules; rewrite
  runtime/stream/session/aux/history unit tests against `SDKMessage` fixtures.
- Add the missing `tests/integration/providers/cursor/` smoke (open hardening
  item T22) — easier with typed SDK events than raw NDJSON captures.
- `cursorHistory.perf` retargets to the SDK transcript shape, or is retired if
  hydration moves fully in-SDK.
- Per-milestone in-app validation via the `verify` skill (a real driven turn),
  the safety net that strategy C leans on.
- Gate check after each milestone: `npm run typecheck && npm run lint &&
  npm run test && npm run build`.

## Milestones (risk-first)

1. **Bundle + load + stream one turn in Obsidian.** Add `@cursor/sdk`, verify
   esbuild takes the CJS build (bundle stays `import.meta`-free), wire API key +
   `CURSOR_RIPGREP_PATH`, `Agent.create → send({ onDelta }) → stream → done`
   inside Obsidian's Electron. Empirically re-check whether
   `sandboxOptions: { enabled: true }` can engage in-app; lock the
   permission-mode mapping accordingly. Kills the biggest unknowns.
2. **Full stream adapter** (two-channel) + usage + cancel/cleanup + plan-turn
   metadata (`CreatePlan` completion → `planCompleted`).
3. **Session resume + AskUserQuestion custom tool** (model-uptake validated
   here).
4. **History rewrite** (clean break, `Agent.messages.list`/`listRuns`); verify
   the reconciler's env-hash invalidation still fires on key change (no code
   change expected — it has no CLI coupling).
5. **Aux services** + model listing (`Cursor.models.list()`).
6. **Delete the 20 CLI files** + rewrite tests + integration smoke; update
   `CLAUDE.md` (Cursor entries) and the install guide (API-key requirement).

## Risks & open questions

- **Sandbox posture regression** (M1): `cursorsandbox` is unreachable in-app
  (argv[1]-relative discovery, no override), so macOS/Linux `normal` mode runs
  unsandboxed with `autoReview: true` + an explicit notice unless M1's in-app
  check finds an engagement path. Explicit, surfaced, minimized — never silent.
- **SDK Node-22.13 assumptions vs Obsidian's Electron Node** (M1). esbuild
  targets es2018 (down-levels newer syntax; the SDK ships its own
  `Symbol.asyncDispose` helpers); residual risk is a Node-22-only runtime API
  (`node:sqlite` is confirmed present). Surfaces immediately in M1's load test.
- **In-process side effects** (M1): the SDK mutates shared process state
  (`process.env.NODE_TLS_REJECT_UNAUTHORIZED` on loopback base URLs; statsig
  telemetry client). Loopback base URLs are rejected at the seam; M1 observes
  for other renderer-hostile behavior (timers needing `unref`, etc. — the
  existing `patchRendererUnsafeUnref` gate will flag those at build time).
- **Custom-tool uptake for AskUserQuestion** (M3): if the model reliably
  ignores the `ask_user` custom tool, questions simply stop surfacing (the
  agent proceeds on its own judgment) — degraded but safe; revisit with
  prompt-level steering before considering any resume-based fallback.
- **`Cursor.models.list()` shape vs the static catalog** — reconcile the SDK's
  `ModelListItem` ids/params/variants against
  `cursorModelFamily`/`cursorModelWindowCatalog` (M5).
- **Local store backend** (M1/M4): default SQLite rides `node:sqlite`; if
  `isSqliteModuleLoadError` fires in-app, pass an explicit
  `JsonlLocalAgentStore` rooted under the SDK state dir.

## Non-goals (v1)

- Live async subagent runtime (fast-follow).
- SDK-native MCP management (`supportsMcpTools` stays `false`).
- Persistent-runtime promotion (`supportsPersistentRuntime` stays `false`).
- Fork and rewind (remain gated).
- Preserving/resuming pre-migration CLI conversations (clean break).
