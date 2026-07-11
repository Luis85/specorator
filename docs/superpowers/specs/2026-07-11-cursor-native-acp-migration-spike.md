---
title: Cursor native-ACP migration — spike plan and design sketch
date: 2026-07-11
status: superseded (2026-07-11) — decision to proceed without a spike; see 2026-07-11-cursor-acp-runtime-design.md
scope: src/providers/cursor, src/providers/acp, src/core/transport
relates-to: docs/adr/0002-cursor-askuserquestion-transport.md, docs/adr/0001-transport-agnostic-provider-seam.md
---

# Cursor native-ACP migration — spike plan and design sketch

## Why now

ADR 0002 kept Cursor on the one-shot `cursor-agent --print --output-format
stream-json` path and named one event that "most changes this calculus":
**Cursor shipping first-party ACP support**. That event has occurred. Cursor
CLI now ships a native `agent acp` subcommand — a persistent stdio JSON-RPC
server (documented at <https://cursor.com/docs/cli/acp>; JetBrains launched
its Cursor integration on it in March 2026). No community wrapper is involved,
so the vendor-native-first principle from ADR 0001 is now satisfied *by* ACP
rather than violated by it.

Native ACP (per the vendor docs) provides:

- `initialize` → `authenticate` (`cursor_login`) → `session/new` /
  `session/load` → `session/prompt` — a persistent session over one process.
- Modes: `agent` (full tools), `plan` (read-only planning), `ask` (Q&A).
- Blocking agent→client requests: `session/request_permission`,
  **`cursor/ask_question`**, `cursor/create_plan`.
- Notifications: `cursor/update_todos`, `cursor/task`, `cursor/generate_image`.
- Limitation: team-level (dashboard-configured) MCP servers are not available
  in ACP mode; project/user `.cursor/mcp.json` works.

## What this would structurally fix

These Cursor pain points are artifacts of the per-turn one-shot spawn model,
not of our adaptor code, and a persistent ACP process removes their cause:

| Pain today | Mechanism today | Under native ACP |
|---|---|---|
| Per-turn spawn latency and repeated PATH/env resolution | fresh `spawnCursorChild()` every message | one process per session |
| Windows `EPERM` contention on `~/.cursor/cli-config.json` | `cursorAgentSpawnLock` serializing concurrent spawns | at most one spawn per session |
| Terminal window flashes (batch-shim `cmd.exe` fallback) | `resolveCursorSpawnSpec` wrapping shims per turn | once per session, still `windowsHide` |
| AskUserQuestion auto-reject → collect → auto-`--resume` follow-up turn | `cursorAskUserQuestion.ts` + `ChatTurnMetadata.autoFollowUpText` | blocking `cursor/ask_question` answered in-turn |
| Delta-vs-snapshot guessing in `cursorStreamMapper` | NDJSON cumulative/partial text heuristics | ACP `session/update` events via the shared normalizer |

**Explicit non-goal:** ACP does not fix "the agent can't find tools on PATH".
`agent acp` is still a subprocess launched with the env we construct
(`buildCursorAgentEnvironment`). Env/PATH fixes are a separate, transport-
independent workstream and must not be folded into this migration.

## Decision gate (updated from ADR 0002)

ADR 0002's original gate had three legs; first-party ACP resolves the trust
leg outright and the docs resolve the AskQuestion leg on paper. The spike must
still verify empirically, on a machine with `cursor-agent` installed:

1. **AskQuestion round-trips in-turn.** `cursor/ask_question` arrives as a
   blocking request, and answering it makes the agent continue **within the
   same turn**.
2. **History/session survival.** `session/load` maps onto Cursor's native
   session ids; `~/.cursor/chats/<workspace>/<session>/` is still written, so
   `CursorConversationHistoryService` JSONL hydration and `CursorProviderState.
   chatSessionId` resume keep working (or are cheaply adaptable).
3. **Capability parity.** Model selection, plan mode (`plan` ACP mode vs our
   `.cursor/plans/` conventions), image attachments, and project/user MCP
   behave at least as well as the stream-json path.

If leg 2 fails and cannot be adapted, stay on stream-json and re-file.

## Spike procedure (throwaway; scripts and captures in `.context/` only)

1. Launch `agent acp` and capture the `initialize` handshake + advertised
   capabilities.
2. Drive it with a throwaway script over the existing `AcpClientConnection`
   (`src/providers/acp/`): `initialize`, `authenticate` (`cursor_login`),
   `session/new`, `session/prompt`. Log every agent→client request verbatim.
3. Force a multi-choice question; record the `cursor/ask_question` shape and
   confirm same-turn continuation after answering.
4. Force a permission request; record `session/request_permission` shape and
   the `allow-once` / `allow-always` / `reject-once` response contract.
5. Inspect `~/.cursor/chats/` before/after; test `session/load` against a
   session created by the plain CLI and vice versa.
6. Exercise plan mode, model switching, an image attachment, and a project
   `.cursor/mcp.json` server.
7. Capture raw `session/update` streams for the fixture suite (the current
   `tests/fixtures/providers/cursor/*` pattern) — these become the contract
   tests of the new mapper.

## Migration sketch (only after the gate passes)

- **Transport:** reuse `src/core/transport/AgentSubprocess` +
  `JsonRpcStdioClient` and the `src/providers/acp/` client — the same stack
  Opencode ships on. This is ADR 0001's Move 2 layout paying off; the
  migration cost estimate in ADR 0002 (~2K LOC replaced with net-new plumbing)
  is now substantially lower.
- **Retire:** `cursorQueryLaunch` per-turn spawn path, `cursorAgentSpawnLock`,
  the Windows batch-shim fallback for turns, `cursorAskUserQuestion`'s
  resume-based delivery (`autoFollowUpText` stays for other providers), and
  the `cursorStreamMapper` delta/snapshot heuristics.
- **Map:** ACP `session/update` → `StreamChunk` via the shared ACP update
  normalizer, with a Cursor-specific extension handler for
  `cursor/ask_question`, `cursor/create_plan`, `cursor/update_todos`.
  `cursorToolNormalization`'s canonical-name mapping survives (tool names
  still need normalizing); its stream-shape plumbing does not.
- **Keep:** JSONL history hydration, `CursorProviderState.chatSessionId`,
  plan-path conventions, settings reconciliation, model catalog (verify
  whether the ACP handshake advertises models; the CLI catalog path remains
  the fallback).
- **AskUserQuestion:** wire `cursor/ask_question` through the existing
  `RuntimeHost.askUser` callback — the blocking-RPC pattern
  `OpencodeChatRuntime.handlePermissionRequest` already proves out.
- **Sequencing:** land as a parallel runtime behind a settings flag first
  (stream-json stays the fallback for one release), then flip the default.

## Open questions for the spike

- Does `agent acp` still contend on `~/.cursor/cli-config.json` at startup
  (i.e. does the spawn lock need to survive for the single session spawn)?
- Does the `plan` ACP mode emit a plan document we can map to the shared
  post-plan approval card, or does `cursor/create_plan` carry it?
- Are usage/token events exposed over ACP (stream-json's `result` usage today)?
- Subagent parity: whether Cursor's ACP surface exposes anything for live
  subagent lifecycle (today's gap noted in CLAUDE.md).
