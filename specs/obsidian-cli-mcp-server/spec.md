---
id: SPEC-OCM-001
feature: "Obsidian CLI-backed MCP server"
area: OCM
slug: obsidian-cli-mcp-server
stage: specification
status: accepted
date: 2026-05-23
implements: [REQ-OCM-001, REQ-OCM-002, REQ-OCM-003, REQ-OCM-004, REQ-OCM-005, REQ-OCM-006, REQ-OCM-007, REQ-OCM-008, REQ-OCM-009, REQ-OCM-010, REQ-OCM-011, REQ-OCM-012, REQ-OCM-013, REQ-OCM-014, REQ-OCM-015, REQ-OCM-016, REQ-OCM-017, REQ-OCM-018]
---

# SPEC-OCM-001 — Obsidian CLI-backed MCP server

## §1 Scope

A CLI-backed tool group on the existing in-process MCP server (ADR-013), a narrow
`ObsidianCliPort` and its production/mock implementations, an `obsidian` binary
resolver, and settings-tab management. Additive; the in-process tool groups are
untouched.

## §2 Files

| Path | Kind | Coverage-gated |
|---|---|---|
| `src/domain/ports/ObsidianCliPort.ts` | new | yes (domain) |
| `src/domain/ports/index.ts` | edit (export) | yes |
| `src/infrastructure/obsidian/ObsidianCliAdapter.ts` | new | no (obsidian/**) |
| `src/infrastructure/obsidian/ObsidianCliBinaryResolver.ts` | new | no (obsidian/**) |
| `src/infrastructure/obsidian/mcp/registerObsidianCliTools.ts` | new | no |
| `src/infrastructure/obsidian/mcp/index.ts` | edit (export) | no |
| `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts` | edit (wire cli) | no |
| `src/infrastructure/mock/MockObsidianCliPort.ts` | new | yes (mock) |
| `src/domain/settings/PluginSettings.ts` | edit (`obsidianCliPath`) | yes |
| `src/core/core-settings.ts` | edit (validate field) | yes |
| `src/core/plugin-core.ts` | edit (`getMcpConnectionConfig`) | yes |
| `src/plugin/main.ts` | edit (wire adapter) | n/a |
| `src/plugin/settings.ts` | edit (management UI) | n/a |

## §3 Port contract (REQ-OCM-001..007)

`ObsidianCliPort.run(command, args=[])`:
- `available === false` ⇒ resolves `err(ObsidianCliError('not-configured'))`, no spawn.
- spawn throws ⇒ `err('spawn-failed')`; child `error` event ⇒ `err('spawn-failed')`.
- timeout (default 15 000 ms) ⇒ kill child, `err('timeout')`.
- close with `exitCode === null` (signal-terminated, partial output) ⇒
  `err('signal-terminated', { stderr })` — never `ok`.
- close with code ∉ {0} ⇒ `err('nonzero-exit', { exitCode, stderr })`.
- close with code 0 ⇒ `ok({ stdout, stderr, exitCode })`.
- spawn is shell-free (`spawn(bin, [command, ...args])`).

`runJson(command, args=[])` = `run(command, [...args, 'format=json'])`; on `ok`,
`JSON.parse(stdout.trim())` ⇒ `ok(parsed)` or `err('invalid-json')`; on `err`,
propagate.

## §4 Resolver (REQ-OCM-008..009)

`ObsidianCliBinaryResolver({ spawn, platform, timeoutMs? })` — POSIX
`sh -lc 'command -v obsidian'`, Windows `where.exe obsidian`; first non-empty trimmed
line that is `path.isAbsolute` wins; else `null`; 5 s default timeout; `null` on spawn
error/timeout.

## §5 Tool surface (REQ-OCM-010..014)

`registerObsidianCliTools(mcp, cli, store)` registers:

- `obsidian_cli_search { query }` → `cli.runJson('search', ['query='+query])`.
- `obsidian_cli_read_note { path }` → `cli.runJson('read', ['path='+path])`.
- `obsidian_cli_get_properties { path }` → `cli.runJson('properties', ['path='+path])`.
- `obsidian_cli_run { command, args? }` → command ∈ `SAFE_CLI_READ_COMMANDS` else
  `ok({ error: { code: 'command-not-allowed', message, allowed }})`; allowed ⇒
  `cli.runJson(command, [k+'='+v, …])`.
- `obsidian_cli_append_note { path, content }` →
  `store.queue('obsidian_cli_append_note', { path, content }, () => cli.run('append',
  ['path='+path, 'content='+content]))` ⇒ `ok({ proposalId, status: 'pending' })`.

Result mapping: any `cli` `err` ⇒ `ok({ error: { code, message } })`; any `ok` ⇒
`ok({ result: value })` (search/read/daily/properties/run) — never throw.

`SAFE_CLI_READ_COMMANDS = ['search','read','properties','tags','tasks',
'bookmarks','bases','list','info']`. `eval`/`delete`/`move`/`create`/`append`/`write`/
`plugins`/`themes`/`publish`/`sync` are not in the set and have no dedicated tool
(REQ-OCM-013). **`daily` is excluded** because it can create today's note (a vault
mutation) — it must not bypass `ProposalStore` (CLAR-OCM-003).

## §6 Adapter wiring (REQ-OCM-015)

Optional `cli?: ObsidianCliPort` 7th constructor arg. Register the group only when
`cli !== undefined && cli.available`. Absence ⇒ server starts, group omitted.

## §7 Settings (REQ-OCM-016..018)

- `PluginSettings.obsidianCliPath: string`, default `''`; `core-settings.validateSettings`
  adds `obsidianCliPath: coerceTrimmedString(r.obsidianCliPath, default)`. No version
  bump; no migrate change.
- `settings.ts` renders "Obsidian CLI path" (`data-testid` `settings-obsidian-cli-path-*`)
  with autodetect (`ObsidianCliBinaryResolver`) and test (`spawnSync <path> --version`).
- `renderMcpServerStatus` reports CLI-configured state and, when
  `core.isMcpServerRunning()`, the URL from `core.getMcpConnectionConfig()`.

## §8 Out of scope

Standalone stdio process (CLAR-OCM-001); CLI `eval`/destructive tools (NFR-OCM-002);
persisting proposals across reload (ADR-013 defers to v2).
