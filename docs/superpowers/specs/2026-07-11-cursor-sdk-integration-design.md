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
deleted (see §Auth & binary resolution).

## Verified facts about `@cursor/sdk`

- Package `@cursor/sdk@1.0.23`; Node ≥ 22.13; unpacked 18.6 MB / 304 files.
- JS deps: `@bufbuild/protobuf`, `@connectrpc/connect{,-node,-web}`,
  `@statsig/js-client`, `zod@3`.
- Runtime is a **per-platform native binary** shipped via optional deps
  (`@cursor/sdk-darwin-arm64`, `-darwin-x64`, `-linux-arm64`, `-linux-x64`,
  `-win32-x64`) plus a downloaded ripgrep and sandbox-helper. The local agent
  runs that binary; it is not pure in-process JS.
- Public surface (from the official TS SDK docs):
  - `Agent.create({ apiKey, model, local: { cwd }, mode?, mcpServers?, agents?,
    local.customTools? })`, `Agent.resume(id, { apiKey })`,
    `Agent.prompt(msg, opts)`, `Agent.list/get/listRuns/getRun`.
  - `agent.send(message | { text, images: [{ data, mimeType }] }, { mode? })`
    → `Run`.
  - `run.stream()` → `AsyncGenerator<SDKMessage>`; `run.wait()` → `RunResult`
    (`result`, `usage`); `run.cancel()`; `run.onDidChangeStatus(cb)`;
    `run.conversation()` → structured transcript.
  - `SDKMessage` discriminated union: `system`, `user`, `assistant`, `thinking`,
    `tool_call`, `status`, `task`, `request` (awaiting user input), `usage`.
  - `Cursor.models.list()`; `Cursor.me()`.
  - Disposal: `agent[Symbol.asyncDispose]()` / `agent.close()`.

The environment is `isDesktopOnly: true`, so the desktop-only native binary is
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
because it only ever sees `StreamChunk`s. The runtime holds one `Agent` for its
lifetime and resumes by id when synced to a conversation. Capability flags stay
as today; `supportsPersistentRuntime` stays `false` for v1 (no promotion into
shared coordinators).

## Auth & runtime-binary resolution (Milestone 1)

Two things must hold at `ensureReady()`:

- **API key** — read `CURSOR_API_KEY` (and optional `CURSOR_BASE_URL`) from
  `plugin.getResolvedEnvironmentVariables('cursor')` and pass as SDK
  `Agent.create`/`Agent.resume` options. Today these are plumbed as subprocess
  env via `cursorAgentEnv.ts`; that file is deleted and the values become SDK
  options. The reconciler's `ENV_HASH_KEYS = ['CURSOR_API_KEY','CURSOR_BASE_URL']`
  session-invalidation contract is retained verbatim.
- **Native binary** — the SDK's per-platform binary cannot live inside the
  single-file plugin bundle (`main.js` + `manifest.json` + `styles.css`; no
  shipped `node_modules`). The precedent is Claude: the SDK JS wrapper bundles
  into `main.js`, but the heavy runtime is user-resolved
  (`pathToClaudeCodeExecutable: getResolvedProviderCliPath('claude')`). The open
  question is whether `@cursor/sdk` exposes an equivalent "use this binary path"
  option we can point at the user's installed `cursor-agent` (reusing
  `CursorBinaryLocator`/`CursorCliResolver`), or whether we must ship/download
  `@cursor/sdk-<platform>` separately. **Milestone 1 resolves this in code**;
  `CursorBinaryLocator`/`CursorCliResolver` are kept precisely so the repurpose
  is cheap. Under strategy C this is also the de-facto "does the SDK load and
  stream one turn inside Obsidian's Electron" smoke test.

Bundling: `@cursor/sdk`'s JS is bundled by esbuild like the Claude and Codex
SDKs, including an `import.meta.url` patch in `esbuild.config.mjs`
(`patchSdkImportMeta`) if the SDK entry uses it.

## Stream mapping — `SDKMessage` → `StreamChunk`

A new `cursorSdkStreamMapper` replaces `cursorStreamMapper` and the entire
tool-normalization cluster. Because the SDK emits typed, structured events, the
fragile delta/snapshot dedup machinery (`mergeCursorAssistantText`, segment
tracking, doubled-snapshot guards) is no longer needed.

| SDK event (`SDKMessage`) | `StreamChunk` |
|---|---|
| `system` (init) | capture model + session id; no chunk |
| `user` (echo) | `user_message_start` (already emitted pre-stream) |
| `assistant` (text blocks) | `text` |
| `thinking` | `thinking` |
| `tool_call` start | `tool_use { id, name, input }` |
| `tool_call` end | `tool_result { id, content, isError?, toolUseResult? }` (+ `tool_output`) |
| `request` (awaiting input) | → `host.askUser(input, signal)` (see §AskUserQuestion) |
| `status` | `notice` or ignored |
| `task` | subagent chunks (fast-follow) or ignored |
| `usage` | `usage` via `core/providers/usage/buildUsageInfo` |
| result / stream end | `done` |

Usage still funnels through the canonical `buildUsageInfo` (contract-enforced by
`tests/unit/providers/shared/usageContractMatrix.test.ts`); the static
window/pricing catalog (`cursorModelWindowCatalog`) supplies `contextWindow`.

## Session, resume & history

- Session id: SDK agent id stored as `chatSessionId` in `CursorProviderState`
  (unchanged). Resume via `Agent.resume(id)`.
- History hydration (`CursorConversationHistoryService` + `cursorHistoryStore`)
  is rewritten off the SQLite `~/.cursor/chats/<hash>/<session>/store.db` reader
  onto the SDK transcript API (`Agent.resume(id)` → `run.conversation()`).
  Pre-migration conversations keyed to CLI ids will not resolve through the SDK —
  the accepted clean break; they render as-is and start fresh on next turn.
- `extractLastUsage` (history-backed usage recovery) is re-derived from the SDK
  transcript/`RunResult.usage`; it must still return `null` on failure, never
  throw.

## AskUserQuestion — delete the hack, prefer native

Delete `cursorAskUserQuestion.ts` (intercept + `buildCursorAnswerFollowUpPrompt`),
the `autoFollowUpText` staging for Cursor, and the Cursor branch of the
`InputController` auto-send coupling. The SDK's `request` event routes to
`host.askUser(input, signal)` and the answer is delivered back to the same run
in-process.

**Caveat (validated in Milestone 3):** the docs confirm the `request` event but
do not show the exact respond-to-run API for local mode. If local mode is
one-directional, fall back to the resume-follow-up pattern — which
`Agent.resume` makes cleaner than today. Design-for-native, fall-back-to-resume;
the shared `ChatTurnMetadata.autoFollowUpText` seam remains available for the
fallback.

## Aux services

`CursorAuxCliRunner` and the three thin services (title generation, instruction
refine, inline edit) are rewritten onto a one-shot SDK call (`Agent.prompt`, or a
short-lived read-only `Agent.create`). The read-only posture the aux runner
enforces today (`--mode ask --sandbox` engaged; never `--force`/write) maps to
SDK `mode`/sandbox options. The shared `AuxQueryRunner` contract (`query` /
`reset`) and the `QueryBacked*` base classes are untouched — the swap is
contained to the runner internals. Title generation stays provider-routed by the
global `titleGenerationModel`.

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
  (KEEP `CursorAgentStorage` + mention provider). Native `agents: {}` unblocks
  live async subagent lifecycle, but that is scoped as a **fast-follow, not v1**,
  to keep the migration bounded.
- **Capability flags** unchanged for v1: `supportsFork`, `supportsRewind`,
  `supportsProviderCommands`, `supportsMcpTools`, `supportsPersistentRuntime`
  stay `false`. SDK MCP and persistent-runtime are explicit non-goals here.

## File plan (21 DELETE / 12 REWRITE / 21 KEEP)

**DELETE (21)** — CLI orchestration cluster:
`runtime/cursorStreamMapper`, `cursorToolNormalization`, `cursorToolNameMap`,
`cursorToolInputMapping`, `cursorToolValueCoercion`, `cursorGrepFormatting`,
`cursorTaskPayload`, `cursorTaskSubagent`, `cursorAskUserQuestion`,
`cursorAgentSpawnLock`, `cursorProcessKill`, `cursorLaunchArgs`, `cursorLaunch`,
`cursorWindowsSpawn`, `cursorCliPrompt`, `cursorAgentEnv`, `cursorMcpCleanup`,
`cursorQueryLaunch`, `cursorQueryLifecycle`, `cursorQueryProcessing`,
`cursorUsageMapping` (small usage→`UsageInfo` adapter may be re-homed if history
still needs it).

**REWRITE (12)** — reimplement on the SDK:
`runtime/CursorChatRuntime`, `runtime/CursorAuxCliRunner`,
`auxiliary/CursorTitleGenerationService`, `auxiliary/CursorInstructionRefineService`,
`auxiliary/CursorInlineEditService`, `history/CursorConversationHistoryService`,
`history/cursorHistoryStore`, `env/CursorSettingsReconciler` (env-hash contract
retained; API-key application changes), `prompt/encodeCursorTurn`,
`runtime/CursorCliResolver` + `runtime/CursorBinaryLocator` (repurposed to
resolve the SDK runtime binary), `runtime/CursorTaskResultInterpreter`
(reimplement on SDK subagent types).

**KEEP (21)** — provider-neutral / still needed:
`capabilities`, `settings`, `types`, `types/agent`, `modelLabels`,
`runtime/cursorModelFamily`, `cursorModelId`, `cursorModelWindowCatalog`,
`cursorModelCatalog` (live-listing swaps to SDK), `cursorCliModel`,
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

1. **Load + resolve + stream one turn.** Bundle `@cursor/sdk` into `main.js`
   (esbuild patch if needed), resolve API key + native binary in Obsidian's
   Electron, `Agent.create → send → stream → done`. Kills the biggest unknowns.
2. **Full stream mapping** + usage + cancel/cleanup.
3. **Session resume + AskUserQuestion** (native vs. resume fallback decided here).
4. **History rewrite** (clean break) + settings reconciler.
5. **Aux services** + model listing.
6. **Delete the 21 CLI files** + rewrite tests + integration smoke; update
   `CLAUDE.md` (Cursor entries) and the install guide (API-key requirement).

## Risks & open questions

- **Native-binary distribution** inside a single-file plugin (M1). Mitigation:
  prefer pointing the SDK at the user's installed `cursor-agent`; fall back to a
  ship/download strategy if the SDK requires its own binary.
- **SDK Node-22.13 assumptions vs Obsidian's Electron Node** (M1). esbuild
  targets es2018 (down-levels `await using` etc.); residual risk is a Node-22-only
  runtime API. Surfaces immediately in M1's load test.
- **Local-mode `request` bidirectionality** (M3). Fall back to resume-follow-up
  if one-directional.
- **`Cursor.models.list()` shape vs the static catalog** — reconcile the SDK's
  model ids/params against `cursorModelFamily`/`cursorModelWindowCatalog`.

## Non-goals (v1)

- Live async subagent runtime (fast-follow).
- SDK-native MCP management (`supportsMcpTools` stays `false`).
- Persistent-runtime promotion (`supportsPersistentRuntime` stays `false`).
- Fork and rewind (remain gated).
- Preserving/resuming pre-migration CLI conversations (clean break).
