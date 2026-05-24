---
feature: "Obsidian CLI-backed MCP server"
area: OCM
slug: obsidian-cli-mcp-server
stage: design
status: accepted
date: 2026-05-23
adr: ADR-018
---

# Design — Obsidian CLI-backed MCP server

## D1. Architecture placement

```
domain/ports/ObsidianCliPort.ts        ← narrow contract (ADR-008)
            ▲                 ▲
            │                 │
infrastructure/obsidian/      infrastructure/mock/
  ObsidianCliAdapter.ts         MockObsidianCliPort.ts
  ObsidianCliBinaryResolver.ts
            ▲
            │  (constructor injection)
infrastructure/obsidian/ObsidianMcpServerAdapter.ts
  └─ mcp/registerObsidianCliTools.ts   ← new tool group on the existing server
            ▲
            │
plugin/main.ts (wires the adapter)  ·  plugin/settings.ts (management UI)
```

The CLI-backed tools live **inside the existing MCP server** (ADR-013 keeps the tool
surface in one auditable place). We do not stand up a second server or a new transport.

## D2. `ObsidianCliPort` (domain)

```ts
type ObsidianCliErrorCode =
  | 'not-configured' | 'spawn-failed' | 'nonzero-exit' | 'timeout' | 'invalid-json'

class ObsidianCliError extends Error {
  readonly code: ObsidianCliErrorCode
  readonly exitCode: number | null
  readonly stderr: string
}

interface ObsidianCliInvocation { stdout: string; stderr: string; exitCode: number | null }

interface ObsidianCliPort {
  readonly available: boolean
  run(command: string, args?: readonly string[]): Promise<Result<ObsidianCliInvocation, ObsidianCliError>>
  runJson(command: string, args?: readonly string[]): Promise<Result<unknown, ObsidianCliError>>
}
```

`available` reflects whether an absolute CLI path is configured. It is the cheap
synchronous gate the MCP adapter and settings UI use before attempting a call.

## D3. `ObsidianCliAdapter` (infrastructure/obsidian — excluded from coverage)

- Constructor deps: `{ spawn, resolvePath: () => string, timeoutMs? }`. `spawn` is
  injected (test isolation), matching `ClaudeBinaryResolver`'s `SpawnFn`.
- `run` spawns `bin [command, ...args]` **without a shell** (REQ-OCM-007), buffers
  stdout/stderr, applies a 15 s default timeout (kills the child on expiry), and maps
  exit/spawn/timeout outcomes to `ObsidianCliError` codes.
- `runJson` calls `run(command, [...args, 'format=json'])` and `JSON.parse`s the trimmed
  stdout, mapping a parse failure to `invalid-json`.
- Mirrors `ClaudeBinaryResolver`'s eslint-disable for `prefer-active-window-timers`
  (infra layer, no Obsidian window).

## D4. `ObsidianCliBinaryResolver` (infrastructure/obsidian)

Direct sibling of `CursorBinaryResolver` with the binary name `obsidian`:
`sh -lc 'command -v obsidian'` (POSIX) / `where.exe obsidian` (Windows), first
absolute line wins, 5 s timeout, `null` on any failure.

## D5. `registerObsidianCliTools(mcp, cli, store)` (infrastructure/obsidian/mcp)

Read tools (call `cli.runJson` / `cli.run`):

| Tool | CLI command | Args |
|---|---|---|
| `obsidian_cli_search` | `search` | `query=<q>` |
| `obsidian_cli_read_note` | `read` | `path=<p>` |
| `obsidian_cli_get_properties` | `properties` | `path=<p>` |
| `obsidian_cli_run` | *(allow-listed)* | `command`, `args: Record<string,string>` |

> `daily` is **not** a read tool and **not** on the allow-list: the CLI's daily
> command can create today's note if missing (a vault mutation), which would bypass
> `ProposalStore`. A confirmed read-only daily variant is deferred (CLAR-OCM-003).

Write tool (proposal-queued, REQ-OCM-012):

| Tool | CLI command | Behaviour |
|---|---|---|
| `obsidian_cli_append_note` | `append` | `store.queue('obsidian_cli_append_note', {path,content}, () => cli.run('append', ['path='+p,'content='+c]))` → returns `{ proposalId, status: 'pending' }` |

`obsidian_cli_run` validates `command` against `SAFE_CLI_READ_COMMANDS`
(`search, read, properties, tags, tasks, bookmarks, bases, list, info`). Anything
else → `ok({ error: { code: 'command-not-allowed', message, allowed } })`. `eval`,
`delete`, `move`, `create`, `append`, `write`, `daily`, `plugins`, `themes`, `publish`,
`sync` are therefore unreachable here (REQ-OCM-013, NFR-OCM-002).

Every tool wraps the port result: on `result.ok === false` it returns
`ok({ error: { code, message } })` (REQ-OCM-014) so an MCP request never crashes.

Arguments are built as `key=value` strings from zod-validated inputs and passed to the
shell-free `spawn` — values cannot break out into new CLI commands.

## D6. MCP adapter wiring

`ObsidianMcpServerAdapter` gains an optional 7th constructor param `cli?: ObsidianCliPort`.
In `_handleMcpRequest`, after the six existing groups:

```ts
if (this.cli !== undefined && this.cli.available) {
  registerObsidianCliTools(mcp, this.cli, this.proposalStore)
}
```

When `cli` is absent or unavailable, only the CLI group is omitted (REQ-OCM-015). The
accept/reject path is unchanged — CLI writes flow through the same `ProposalStore` the
sidebar already drives.

`main.ts` constructs an `ObsidianCliAdapter` (`spawn` from `node:child_process`,
`resolvePath: () => this.settings.obsidianCliPath`) and passes it as the 7th argument.

## D7. Settings management

- `PluginSettings.obsidianCliPath: string` (default `''`), validated by
  `coerceTrimmedString`. **No `settingsVersion` bump** and **no `migrate` change** — a
  missing key coerces to `''`, identical for fresh and upgrading installs, so the
  existing migration tests stay green.
- `settings.ts`: `renderObsidianCliPathField` mirrors `renderClaudeCliPathField`
  (text input + autodetect via `ObsidianCliBinaryResolver` + test via `spawnSync
  <path> --version`, the existing allow-listed sync-spawn site). `renderMcpServerStatus`
  is extended to report CLI-configured state and the loopback URL when running, via a
  new `PluginCore.getMcpConnectionConfig()` helper guarded by `isMcpServerRunning()`.

## D8. Alternatives considered

- **Standalone stdio MCP process shelling to the CLI.** Rejected for v1: duplicates the
  transport/lifecycle the plugin already owns and complicates start/stop. Captured as
  CLAR-OCM-001 for a future increment.
- **Replace the in-process tool groups with CLI equivalents.** Rejected: the in-process
  groups work without the CLI (older Obsidian, no PATH entry). CLI tools are additive.
- **Expose `obsidian_cli_eval`.** Rejected: arbitrary JS against `app` is an
  unacceptable agent capability (NFR-OCM-002).
