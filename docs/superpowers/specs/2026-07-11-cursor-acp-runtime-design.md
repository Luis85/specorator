---
title: Cursor ACP runtime — hard-cutover migration design
date: 2026-07-11
status: implemented (2026-07-11) — first-run validation pending
scope: src/providers/cursor, src/providers/acp, src/core/transport, docs
relates-to: docs/adr/0002-cursor-askuserquestion-transport.md, docs/adr/0001-transport-agnostic-provider-seam.md, docs/superpowers/specs/2026-07-11-cursor-native-acp-migration-spike.md (superseded)
---

# Cursor ACP runtime — hard-cutover migration design

## Decisions (validated in brainstorm, 2026-07-11)

| Decision | Choice |
|---|---|
| v1 scope | Parity **plus** the in-turn upgrades ACP unlocks: blocking in-turn AskUserQuestion (`cursor/ask_question`) and interactive tool approvals (`session/request_permission`). Live subagent lifecycle deferred. |
| Rollout | **Hard cutover.** The stream-json chat runtime is replaced and deleted in the same release; no feature flag, no fallback runtime. |
| History/resume | Keep offline JSONL hydration from `~/.cursor/chats/` for reload; use `session/load(chatSessionId)` only to resume live sessions. |
| Aux queries | Title generation / instruction refine / inline edit stay on the one-shot `--output-format json` CLI path (`CursorAuxCliRunner`), read-only pinned. |
| Spike | **None.** Build directly from the documented protocol (cursor.com/docs/cli/acp + ACP schema); mitigate with graceful fallbacks and a first-run validation checklist instead of pre-verification. This supersedes the spike-gated plan in `2026-07-11-cursor-native-acp-migration-spike.md`. |
| Architecture | **Approach A** — Cursor becomes a second direct consumer of `src/providers/acp/` (the stack Opencode ships on), plus one small Cursor-dialect module. No `AcpChatRuntimeBase` extraction now; revisit when a third ACP provider lands (rule of three; candidate: gemini-cli idea). |

## Why

Cursor CLI ships first-party ACP (`agent acp`, a persistent stdio JSON-RPC
server) — the watch condition ADR-0002 named. The one-shot
`cursor-agent --print` model is the root cause of Cursor's worst UX debt:
per-turn spawn latency, the Windows spawn lock, terminal-flash from the
batch-shim fallback, the delta-vs-snapshot stream heuristics, and the
auto-resume AskUserQuestion hack. A persistent protocol removes the causes
rather than patching symptoms. It also upgrades Cursor from the
trust-everything provider (`--trust` + `--force` flags) to the same
approval-card UX every other provider has.

**Non-goal:** env/PATH construction is transport-independent
(`buildCursorAgentEnvironment` still builds the allowlisted env + enhanced
PATH for the persistent process) and is not part of this migration.

## Architecture

`CursorChatRuntime` is rewritten with the same skeleton as
`OpencodeChatRuntime`: it owns one `agent acp` subprocess via
`AcpSubprocess`/`AgentSubprocess`, speaks JSON-RPC through
`AcpClientConnection`, and translates `session/update` notifications into
`StreamChunk`s through `AcpSessionUpdateNormalizer` + `AcpToolStreamAdapter`.

### Process lifecycle

- One persistent `agent acp` process per runtime instance (per conversation
  tab): lazy spawn on first `query()`, reused across turns, torn down on
  dispose/unload via `AgentSubprocess`'s SIGTERM→SIGKILL `shutdown()`.
- `cursorAgentSpawnLock` shrinks from per-turn to per-session-spawn (the
  `~/.cursor/cli-config.json` contention it guards is a spawn-time race;
  concurrent tabs still spawn concurrently).
- Deleted outright: the per-turn spawn path (`cursorQueryLaunch`), the
  batch-shim `cmd.exe` fallback for chat turns, and the NDJSON stream
  reducer with its delta/snapshot heuristics.

### Session mapping

- `CursorProviderState.chatSessionId` keeps its meaning. New conversation →
  `session/new`, store the returned id. Resume → `session/load(chatSessionId)`.
- **Load-bearing assumption (no spike):** ACP session ids correspond to
  Cursor's native chat ids. If `session/load` rejects, fall back to
  `session/new` and re-inject conversation context through the existing
  prompt-encoding path (`buildCursorAgentPrompt` with `conversationHistory` —
  the same fallback the CLI path uses when a resume id is missing). A
  mismatch degrades to "context re-injected", never a broken conversation.
  Log a warning in the runtime scope so id-mapping issues are diagnosable
  from user reports.

### Permission posture

Moves from CLI flags (`--trust`/`--force`/`--sandbox`) to protocol:

| Specorator mode | ACP session mode | Approvals |
|---|---|---|
| `normal` | `agent` | `session/request_permission` → shared approval card (`RuntimeHost.approval`), like Opencode |
| `yolo` | `agent` | permission requests auto-answered `allow-always` |
| `plan` | `plan` | `cursor/create_plan` → `planCompleted` + shared post-plan approval card |

Doc-gap to resolve during implementation: whether sandbox posture is
configurable over ACP or governed by Cursor's own config. The contract here
is mode + approvals; we do not reimplement sandbox flags.

## Components

New / rewritten in `src/providers/cursor/runtime/`:

| Module | Role |
|---|---|
| `CursorChatRuntime` (rewrite) | ACP session lifecycle: lazy connect → authenticate-if-needed → `session/new`/`load` → `session/prompt` → stream → cooperative `session/cancel` (process-kill fallback) |
| `cursorAcpExtensions.ts` (new) | Cursor dialect: `authenticate` (`cursor_login`); blocking `cursor/ask_question` → `RuntimeHost.askUser`; `cursor/create_plan` → plan approval card; `cursor/update_todos` / `cursor/task` notification handlers |
| `cursorAcpSession.ts` (new, small) | Session-config assembly: mode mapping, model selection, workspace dir, resume-vs-new + fallback |
| `cursorAcpToolNames.ts` (slimmed from `cursorToolNormalization`) | Canonical tool-name mapping applied to ACP `tool_call` events; NDJSON envelope/reshaping plumbing is deleted |

Retired: `cursorStreamMapper` (+ its fixture suites), `cursorQueryLaunch`,
`cursorAskUserQuestion` resume delivery (`ChatTurnMetadata.autoFollowUpText`
stays in core), the stream-json flag builder in `cursorLaunchArgs`, per-turn
`windowsSpawn` shim usage.

Surviving unchanged: JSONL history hydration
(`CursorConversationHistoryService`), settings + reconciliation, model
catalog (one-shot CLI), `CursorAuxCliRunner` (+ json/text flag builders,
read-only pinning), plan-path conventions, subagent definition
discovery/mentions, `buildCursorAgentEnvironment` (including the cliPath →
enhanced-PATH fix).

Capabilities delta: `supportsPersistentRuntime: true`; everything else
unchanged. `supportsMcpTools` stays `false` — MCP remains Cursor-managed via
`.cursor/mcp.json`; the ACP-mode limitation (team-level/dashboard MCP servers
unavailable) gets a note in the Cursor settings tab and user manual.

## Turn data flow

```
send → ensure process+session → session/prompt (text/image content blocks via
       ACP prompt encoding; # instructions and context framing reuse
       buildCursorAgentPrompt's assembly)
     ← session/update ─────────────────→ AcpSessionUpdateNormalizer
                                         └→ StreamChunk (text/thinking/
                                            tool_use/tool_result via
                                            AcpToolStreamAdapter +
                                            cursorAcpToolNames)
     ← session/request_permission ─────→ approval card → response (blocking)
     ← cursor/ask_question ────────────→ AskUserQuestion UI → answer
                                          (blocking, in-turn)
     ← prompt response (stopReason) ───→ usage (buildAcpUsageInfo when
                                          emitted; model-window fallback
                                          otherwise) + done
```

Cancel = `session/cancel`, then `AgentSubprocess.shutdown()` escalation if
the turn does not end. Images ride ACP content blocks (the path Opencode
already exercises), replacing the CLI temp-file convention.

## Error handling (each surface gets an actionable path — hard cutover)

- **Old CLI (no `acp` subcommand):** process exits before `initialize`
  resolves, or handshake timeout → persistent notice + chat error chunk:
  "Cursor CLI doesn't support ACP; update cursor-agent" (with the update
  command). Never a hang or silent retry loop.
- **Not authenticated:** `authenticate(cursor_login)` failure or auth-shaped
  `session/new` rejection → actionable message ("run `cursor-agent login`"),
  same UX slot as Opencode's auth errors.
- **`session/load` mismatch:** fallback chain above + warning log.
- **Mid-turn process death:** `AgentSubprocess.onClose` → pending requests
  rejected (`JsonRpcStdioClient` behavior) → error chunk + `done`, stderr
  ring-buffer snapshot logged. Next send lazily respawns.
- **Unanswered blocking requests:** dismissing the approval/ask card responds
  `reject-once` / cancels the question rather than leaving the agent blocked;
  cancel-turn answers any pending blocking request before `session/cancel`.

## Testing (synthetic-from-docs — the price of skipping the spike)

- Unit suites mirroring the Opencode pattern: session lifecycle
  (new/load/fallback), mode mapping, extension handlers (blocking
  ask_question round-trip, create_plan → approval card, todos), tool-name
  mapping, cancel/teardown, auth failures, old-CLI detection.
- Fixture-driven stream tests using hand-built `session/update` sequences
  derived from the ACP schema + Cursor docs, structured like the current
  captured-fixture suites so real captures can replace them 1:1.
- Runtime-consumer integration tests rewritten against a scripted fake ACP
  server over in-memory streams (the `JsonRpcStdioClient.test.ts` pattern).
- Perf: `cursorHistory.perf` unaffected; no new perf gate (request volume is
  low — matches the transport extraction's deferral).

## First-run validation checklist (replaces the spike; run on a real vault)

1. New chat: send, stream, tool calls render, turn completes with usage.
2. Interactive approval appears in `normal` mode; `yolo` auto-approves;
   dismiss rejects without wedging the turn.
3. `cursor/ask_question` round-trips in-turn (answer → agent continues in
   the same turn).
4. Plan mode: plan turn completes → post-plan approval card → implement.
5. Resume an existing conversation (created pre-migration) → `session/load`
   works, or the fallback re-injects context; either way the turn succeeds.
6. History reload of old conversations still hydrates from JSONL.
7. Image attachment round-trips.
8. Project `.cursor/mcp.json` server tools appear; settings-tab note about
   team-level MCP servers is accurate.
9. Old-CLI error path: with an outdated cursor-agent, the update notice
   appears (no hang).
10. Cancel mid-turn: turn ends promptly; process survives for the next send.

## Docs updated in the same change

CLAUDE.md Cursor rows (provider description + architecture table), Cursor
`capabilities.ts`, ADR-0002 marked superseded-by-implementation,
`docs/product/user-manuals/install-cursor.md` (minimum CLI version + login),
Cursor settings-tab MCP note. Single release, no flag.
