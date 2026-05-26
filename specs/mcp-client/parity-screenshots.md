---
id: PARITY-MC-001
title: MCP client (P8) — parity screenshot matrix
stage: implementation
feature: mcp-client
area: MC
epic: claudian-reboot
phase: P8
owner: dev (baseline scaffold) / human (capture + Specorator column)
reference: D:\Projects\claudian-main
created: 2026-05-26
updated: 2026-05-26
---

# Parity screenshots — MCP client (P8)

Per T-MC-001 (NFR-MC-009 baseline leg) this is the per-surface × width × theme
matrix the single final epic-review human gate (TEST-MC-M2) fills in. The
**baseline** column captures `D:\Projects\claudian-main`; the **Specorator**
column is filled at the final review (autonomous-drive — no per-phase human
checkpoint). Agents never self-claim a parity row.

Charter widths: **320 / 520 / 720 px**; themes: **light + dark**.

## Baseline reference (claudian-main)

The P8 MCP surfaces map to `D:\Projects\claudian-main`:

- **Config round-trip** — `src/providers/claude/storage/McpStorage.ts`:
  - `MCP_CONFIG_PATH = '.claude/mcp.json'` (`:9`) — the Claude-CLI-readable vault file.
  - `load` (`:14-56`) — `exists` guard → read → `JSON.parse` → `mcpServers` +
    `_claudian.servers` sidecar; `DEFAULT_MCP_SERVER` defaults applied when the
    sidecar omits `enabled`/`contextSaving`; `disabledTools` filtered to non-empty
    strings (→ `undefined` when empty); a non-object `mcpServers` ⇒ `[]`; any
    `catch` ⇒ `[]` (load-or-default).
  - `save` (`:58-134`) — write `mcpServers[name] = config`; emit ONLY non-default
    `_claudian.servers[name]` metadata (`enabled !== true`, `contextSaving !== true`,
    trimmed-non-empty `disabledTools`, truthy `description`); start from a shallow
    copy of the parsed existing doc (`:97-110`) so unknown top-level keys survive;
    merge `{ ...existingClaudian, servers }` (`:113-119`) so non-`servers`
    `_claudian` keys survive; delete an empty `_claudian` (`:120-130`); 2-space
    indent (`:132`).
- **Parser** — `src/core/mcp/McpConfigParser.ts:17` (`parseClipboardConfig`) — the
  four formats: (1) `{ mcpServers: { name: config } }` → `needsName:false`, empty ⇒
  throw `'No valid server configs found in mcpServers'`; (2) a single un-named valid
  config → `needsName:true`; (3) a single `{ name: config }` → `needsName:false`;
  (4) multiple `{ name: config, … }` → `needsName:false`, none valid ⇒ throw
  `'Invalid MCP configuration format'`; a non-object ⇒ throw `'Invalid JSON object'`;
  a `SyntaxError` ⇒ throw `'Invalid JSON'`. `src/core/types/mcp.ts:74`
  (`getMcpServerType`) — `type:'sse'`→sse, `type:'http'`→http, bare `url`→http, else
  (command)→stdio. `:81` (`isValidMcpServerConfig`) — non-null object AND (non-empty
  string `command` OR non-empty string `url`). `:94` (`DEFAULT_MCP_SERVER` =
  `{ enabled:true, contextSaving:true }`).
- **Tester** — `src/core/mcp/McpTester.ts`: the `McpTool` (`:13-17`) +
  `McpTestResult` (`:19-25`) shapes; the stdio/SSE/HTTP transports; the 10s
  `AbortController` (`:268-269`); the partial-success path (connect-ok + list-fail →
  `success:true`, empty tools) (`:276-285`); the friendly-error `catch` (`:293-301`).
- **Manager** — `src/core/mcp/McpServerManager.ts`: `getActiveServers` (`:38`) —
  skip `!enabled`, skip `contextSaving` unless `@`-mentioned, else copy `config`
  under `name`; `getAllDisallowedMcpTools`/`collectDisallowedTools` (`:74-94`) —
  enabled servers (ignoring `contextSaving`/mentions), emit `mcp__${name}__${tool.trim()}`
  into a `Set`, sorted; `getEnabledCount` (`:25`).
- **Command split** — `src/utils/mcp.ts:46` (`parseCommand`) / `:59`
  (`splitCommandString`) — the no-shell quote-aware tokeniser (no eval, no `shell:true`).
- **Styling** — `mcp-modal.css` / `mcp-settings.css` / `mcp-selector.css` (the
  add/edit + test modals, the settings list, the toolbar selector + count badge).

Each surface carries a stable `data-testid` in the Specorator port
(`mcp-settings`, `mcp-server-row`, `mcp-server-name`, `mcp-server-type`,
`mcp-server-enabled`, `mcp-server-edit`, `mcp-server-remove`, `mcp-server-test`,
`mcp-server-modal`, `mcp-test-modal`, `mcp-test-running`, `mcp-test-success`,
`mcp-test-tool`, `mcp-test-tool-toggle`, `mcp-test-error`, `mcp-test-unavailable`,
`mcp-test-close`, `toolbar-mcp`, `mcp-selector-server`, `mcp-selector-toggle`,
`mcp-selector-badge`).

## Surface 1 — MCP settings, empty state (no servers)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-settings.css` empty state_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 2 — MCP settings, list state (≥ 1 managed server, mixed transports)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-settings.css` row list_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 3 — Add/edit modal (incl. paste + name-required + parse-error)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-modal.css` add/edit form_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 4 — Test modal, running state

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-modal.css` running spinner_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 5 — Test modal, success-with-tools (per-tool toggles)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-modal.css` tool list_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 6 — Test modal, partial / timeout / error / unavailable

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-modal.css` failed/partial/unavailable_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 7 — Selector, expanded list with mixed enabled/disabled + count badge

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-selector.css` list + badge_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |

## Surface 8 — Selector, no-servers seam (the P6 byte-identical empty state)

| Width | Theme | Baseline (claudian-main) | Specorator (final review) |
|---|---|---|---|
| 320 | light | _capture pending — `mcp-selector.css` empty seam (P6 parity)_ | _pending_ |
| 320 | dark | _capture pending_ | _pending_ |
| 520 | light | _capture pending_ | _pending_ |
| 520 | dark | _capture pending_ | _pending_ |
| 720 | light | _capture pending_ | _pending_ |
| 720 | dark | _capture pending_ | _pending_ |
