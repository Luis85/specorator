---
id: PRD-MC-001
title: MCP client — Claude in-app server manager, config, tester, transports, settings UI, selector wiring
stage: requirements
feature: mcp-client
area: MC
epic: claudian-reboot
phase: P8
status: accepted
owner: pm
integration_branch: next
inputs:
  - specs/claudian-reboot/parity-charter.md#3.7
  - specs/claudian-reboot/parity-charter.md#4 (P8 row)
  - specs/claudian-reboot/parity-charter.md#6a
  - specs/claudian-reboot/parity-charter.md#6b (line 258 — MCP for non-Claude is out; Claude in-app)
  - specs/claudian-reboot/parity-charter.md#3.10 (mcp-* css)
  - specs/claudian-reboot/claudian-audit-backend.md (MCP — McpServerManager / McpConfigParser / McpTester / wiring split)
  - specs/claudian-reboot/claudian-audit-frontend.md#3.5 (MCP selector)
  - D:\Projects\claudian-main src/core/mcp/* + src/core/types/mcp.ts + src/utils/mcp.ts + providers/claude/storage/McpStorage.ts + providers/claude/app/ClaudeWorkspaceServices.ts
  - specs/mcp-client/workflow-state.md (P8 scope + ADR notes + config-source tension)
created: 2026-05-26
updated: 2026-05-26
---

# PRD — MCP client (P8, Claude in-app)

## Summary

P8 grows the **in-app MCP (Model Context Protocol) client for Claude** on the P1–P7
chat surface: a server manager (add / edit / remove / enable / disable a server), a
config parser + validator (the pasted/stored JSON formats), a live connection tester
(connect → list tools → success/error), three transports (**stdio / SSE / HTTP**), a
settings surface (add/edit modal, manage list, test-result modal), and the wiring that
makes the **P6 MCP-selector seam** list and toggle the enabled servers + makes an
enabled server's tools reach a chat turn. Built for the user who runs Claude in
Specorator and wants to extend it with external MCP tools (file-system, search, custom)
without leaving Obsidian. Grounded 1:1 in `claudian-main`'s `McpServerManager`,
`McpConfigParser`, `McpTester`, the MCP types, and the `.claude/mcp.json` vault store.
MCP for **non-Claude** providers (Codex/Opencode) is out of P8 (charter §6b line 258 —
Codex is CLI-managed; that surfaces, if ever, in P9). Additive: with no MCP server
configured, the P1–P7 surface is byte-identical (the no-servers default).

## Goals

- **G1** — Reproduce Claudian's Claude in-app MCP server management: add, edit, remove,
  enable/disable a server; per-server context-saving + disabled-tools metadata round-trip.
- **G2** — Parse + validate the MCP config (Claudian's four paste formats + the stored
  `.claude/mcp.json` shape) and **reject malformed config with an error rather than crash**.
- **G3** — Connect + test a server over each transport (stdio / SSE / HTTP), returning a
  structured success (server name/version + tool list) or a structured error.
- **G4** — Make an enabled server's tools available to a Claude turn (the additive
  runtime seam) and make the **P6 MCP selector** list + toggle the enabled servers.
- **G5** — Gate a server tool call through the **P7 approval engine** (a server's tools
  are not auto-trusted) and degrade gracefully when a server is malformed or unreachable
  (never crash the chat).
- **G6** — Preserve every epic constraint: additivity, narrow ports + 3 bridges, Vue
  never imports `obsidian`, no `v-html`/`window.confirm`, `Result<T,E>`, coverage gate,
  WCAG 2.2 AA, `--sp-*` parity, manifest untouched.

## Non-goals

- **NG1** — MCP for **non-Claude** providers (Codex/Opencode). Codex MCP is CLI-managed;
  charter §6b line 258 puts non-Claude MCP out of P8 (P9+ may surface a read-only note).
- **NG2** — Authoring/running MCP servers, or bundling any MCP server. P8 is a *client*.
- **NG3** — `@mention`-to-selector cross-sync of MCP servers in the composer (the P4/P5
  `@mention` MCP path). P8 ships the selector + the runtime seam; the `@mention` cross-link
  is deferred (the composer `@mention` MCP branch is a later phase). The context-saving
  `@mention` *gating model* is specified (REQ-MC-031) but the composer trigger is NG.
- **NG4** — A live tool-invocation UI beyond the P7 approval block. Rendering a running
  MCP tool call reuses the P2 tool-call renderer; no new tool-call surface is built here.
- **NG5** — Secret storage UI for server auth. Where a server config carries auth
  (headers/env), P8 does not introduce a `SecretStorePort`-backed secret editor; it
  records the security posture (REQ-MC-061..063) and flags `SecretStorePort` integration
  as a follow-up (CLAR-MC-004). No secret is written to a separate plain store by P8.
- **NG6** — Codex/Opencode capability expansion, settings-shell polish (P10), i18n beyond
  the en+de keys these surfaces need (P11), a11y polish beyond WCAG 2.2 AA (P12).
- **NG7** — Migration of any legacy MCP config (CHARTER-REQ-FRESH — load-or-empty).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Claude power user (Obsidian, desktop) | Add an MCP server (e.g. a filesystem or search server) and use its tools in chat without editing JSON by hand | The primary MCP audience; parity with Claudian's in-app management is the bar |
| Claudian migrant | Their existing `.claude/mcp.json` servers appear and behave identically | Charter §1 "a Claudian user would recognise immediately"; the vault config is the same file |
| Cautious user | A new server's tools are *not* auto-trusted; a bad server cannot crash chat | Trust + safety: stdio spawns a subprocess; servers carry network endpoints |
| Specorator maintainer | The MCP client lives behind narrow ports, the real transports are coverage-excluded infra, additivity holds | Keeps the DDD architecture + the verify gate green; the real-transport legs accumulate for the final epic gate |

## Jobs to be done

- When I want a Claude tool that Specorator does not ship, I want to **add an MCP server
  by pasting its config or filling a form**, so I can use its tools in chat.
- When I add or paste a server config, I want **malformed config rejected with a clear
  error** rather than a crash or silent corruption, so I trust the editor.
- When I configure a server, I want to **test it and see whether it connects + what tools
  it exposes**, so I know it works before relying on it.
- When I have several servers, I want to **enable/disable each from the toolbar selector**,
  so I control which tools are in context for a turn.
- When an enabled server's tool is about to run, I want **the approval engine to gate it**,
  so a server cannot act without my say-so.
- When a server is misconfigured or down, I want **chat to keep working**, so one bad
  server does not break the session.

## Functional requirements (EARS)

> EARS notation per `docs/ears-notation.md`. One requirement per entry, stable ID, a
> Given/When/Then acceptance criterion, a MoSCoW priority, an upstream link, a 1:1
> `claudian-main` path, and a future `TEST-MC-*` id. Grouped: config/parse · server
> manager lifecycle · transports · tester · settings UI · selector + runtime · security ·
> a11y + additivity.

### Config parse + validate + store

#### REQ-MC-001 — Parse the stored MCP config from the vault file
- **Pattern:** event-driven
- **Statement:** *When the MCP client loads, the system SHALL read the MCP server list from the vault file `.claude/mcp.json` — the `mcpServers` map plus the `_claudian` per-server metadata sidecar (enabled / contextSaving / disabledTools / description).*
- **Acceptance:**
  - Given a vault `.claude/mcp.json` with a `mcpServers` map and a `_claudian.servers` sidecar
  - When the MCP client loads servers
  - Then each valid server entry becomes a `ManagedMcpServer { name, config, enabled, contextSaving, disabledTools?, description? }` with metadata defaults applied (`enabled:true`, `contextSaving:true`) when the sidecar omits them
- **Priority:** must
- **Satisfies:** charter §3.7; `McpStorage.load` (`providers/claude/storage/McpStorage.ts:14`); `core/types/mcp.ts`
- **Test:** TEST-MC-001

#### REQ-MC-002 — Absent or empty config yields an empty server list (no crash)
- **Pattern:** event-driven
- **Statement:** *When the MCP client loads and `.claude/mcp.json` does not exist or has no `mcpServers` object, the system SHALL return an empty server list.*
- **Acceptance:**
  - Given no `.claude/mcp.json` (or one whose `mcpServers` is missing/not-an-object)
  - When the MCP client loads servers
  - Then it returns `[]` and the chat surface stays byte-identical to P1–P7 (the no-servers default, REQ-MC-082)
- **Priority:** must
- **Satisfies:** charter §3.7; `McpStorage.load` early-return (`McpStorage.ts:16-25`); CHARTER-REQ-FRESH
- **Test:** TEST-MC-002

#### REQ-MC-003 — Parse the four paste formats from a config string
- **Pattern:** event-driven
- **Statement:** *When the user supplies an MCP config string in the add/import flow, the system SHALL accept all four Claudian formats — (1) full `{ "mcpServers": { … } }`, (2) a single server without a name, (3) a single named server, (4) multiple named servers — and return the parsed `{ servers, needsName }` result.*
- **Acceptance:**
  - Given a config string in any of the four formats
  - When the system parses it
  - Then it returns the server list and a `needsName` flag set true only for format 2 (single server without a name)
- **Priority:** must
- **Satisfies:** charter §3.7; `parseClipboardConfig` (`core/mcp/McpConfigParser.ts:17`)
- **Test:** TEST-MC-003

#### REQ-MC-004 — Malformed config is rejected with an error, never a crash
- **Pattern:** unwanted-behaviour
- **Statement:** *If the supplied config string is not valid JSON, or contains no valid server config, then the system SHALL return a `Result.err` carrying a human-readable reason and SHALL NOT throw, corrupt the stored config, or crash the host.*
- **Acceptance:**
  - Given a config string that is invalid JSON (or a valid JSON object with no recognised server)
  - When the system parses it
  - Then it returns `Result.err` with a message such as "Invalid JSON" / "Invalid MCP configuration format" and the existing stored config is unchanged
- **Priority:** must
- **Satisfies:** charter §3.7; `parseClipboardConfig` throw paths (`McpConfigParser.ts:78-84`) → converted to `Result` per audit; ADR-004; Constitution Article I.3
- **Test:** TEST-MC-004

#### REQ-MC-005 — Classify a server config by transport type
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL classify each server config as `stdio`, `sse`, or `http` — `type:'sse'` → sse, `type:'http'` → http, a bare `url` without an explicit type → http, otherwise (a `command`) → stdio.*
- **Acceptance:**
  - Given a config with `{ type:'sse', url }`, `{ url }` (no type), or `{ command }`
  - When the system classifies it
  - Then it returns `sse`, `http`, and `stdio` respectively
- **Priority:** must
- **Satisfies:** charter §3.7; `getMcpServerType` (`core/types/mcp.ts:74`)
- **Test:** TEST-MC-005

#### REQ-MC-006 — Validate a single server config shape
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL treat a server config as valid only when it carries a non-empty string `command` (stdio) or a non-empty string `url` (sse/http), and SHALL reject any other shape.*
- **Acceptance:**
  - Given a candidate object
  - When the system validates it
  - Then `{ command:'x' }` and `{ url:'http://…' }` pass; `{}`, a non-object, an array, and `{ command:123 }` fail
- **Priority:** must
- **Satisfies:** charter §3.7; `isValidMcpServerConfig` (`core/types/mcp.ts:81`)
- **Test:** TEST-MC-006

#### REQ-MC-007 — Persist the server list back to the vault file with metadata round-trip
- **Pattern:** event-driven
- **Statement:** *When the user saves a server-list change (add / edit / remove / enable / disable / toggle a tool), the system SHALL write `.claude/mcp.json` preserving the `mcpServers` map and writing only the non-default `_claudian` metadata (enabled / contextSaving / disabledTools / description), returning `Result`.*
- **Acceptance:**
  - Given a `ManagedMcpServer[]` where one server has `enabled:false` and a non-empty `disabledTools`
  - When the system saves
  - Then `.claude/mcp.json` contains the `mcpServers` config plus a `_claudian.servers[name]` entry recording only the non-default fields; default-valued servers (enabled:true, contextSaving:true, no tools) write no sidecar entry
- **Priority:** must
- **Satisfies:** charter §3.7; `McpStorage.save` (`McpStorage.ts:58`); `DEFAULT_MCP_SERVER` (`core/types/mcp.ts:94`)
- **Test:** TEST-MC-007

### Server manager lifecycle

#### REQ-MC-010 — Add a server
- **Pattern:** event-driven
- **Statement:** *When the user adds a server (a parsed config plus a name), the system SHALL append it to the managed list with the default metadata (`enabled:true`, `contextSaving:true`) and persist the list.*
- **Acceptance:**
  - Given an existing list and a new valid `{ name, config }`
  - When the user adds it
  - Then the list contains the new `ManagedMcpServer` with default metadata and the vault file is updated (REQ-MC-007)
- **Priority:** must
- **Satisfies:** charter §3.7; `McpServerManager` + `McpServerModal` add flow; `DEFAULT_MCP_SERVER`
- **Test:** TEST-MC-010

#### REQ-MC-011 — Reject a duplicate or empty server name on add
- **Pattern:** unwanted-behaviour
- **Statement:** *If the user adds a server whose name is empty or already exists in the managed list, then the system SHALL reject the add with an error and SHALL NOT overwrite the existing server.*
- **Acceptance:**
  - Given a list already containing a server named `fs`
  - When the user adds another named `fs` (or one with an empty name)
  - Then the add returns `Result.err`, the existing `fs` is unchanged, and the user sees a friendly reason
- **Priority:** must
- **Satisfies:** charter §3.7; the `mcpServers` map keys-are-unique invariant; parity with the add modal's name requirement
- **Test:** TEST-MC-011

#### REQ-MC-012 — Edit a server's config or metadata
- **Pattern:** event-driven
- **Statement:** *When the user edits an existing server's config, description, or context-saving flag, the system SHALL replace that server's entry in the managed list and persist the list.*
- **Acceptance:**
  - Given a server `fs` with one config
  - When the user edits its config (or description / contextSaving) and saves
  - Then the managed entry reflects the edit and the vault file is updated
- **Priority:** must
- **Satisfies:** charter §3.7; `McpServerModal` edit flow
- **Test:** TEST-MC-012

#### REQ-MC-013 — Remove a server
- **Pattern:** event-driven
- **Statement:** *When the user removes a server, the system SHALL delete it from the managed list, drop its `_claudian` sidecar entry, and persist the list.*
- **Acceptance:**
  - Given a list containing `fs` and `search`
  - When the user removes `fs`
  - Then the managed list is `[search]` and `.claude/mcp.json` no longer contains `fs` in either `mcpServers` or `_claudian.servers`
- **Priority:** must
- **Satisfies:** charter §3.7; `McpSettingsManager` remove action; `McpStorage.save` sidecar pruning
- **Test:** TEST-MC-013

#### REQ-MC-014 — Enable / disable a server
- **Pattern:** event-driven
- **Statement:** *When the user toggles a server's enabled flag, the system SHALL update the server's `enabled` metadata, persist the list, and reflect the new enabled count.*
- **Acceptance:**
  - Given a server `fs` with `enabled:true`
  - When the user disables it
  - Then `fs.enabled` is false, the vault file records `_claudian.servers.fs.enabled:false`, and the enabled count drops by one
- **Priority:** must
- **Satisfies:** charter §3.7; `McpServerManager.getEnabledCount` (`McpServerManager.ts:25`); `getActiveServers` filter
- **Test:** TEST-MC-014

#### REQ-MC-015 — Report the enabled-server count
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL expose the count of enabled servers so the toolbar selector badge can show it.*
- **Acceptance:**
  - Given two servers, one enabled and one disabled
  - When the selector reads the count
  - Then it receives 1
- **Priority:** should
- **Satisfies:** charter §3.5/§3.7; `McpServerManager.getEnabledCount`; `McpServerSelector` count badge
- **Test:** TEST-MC-015

#### REQ-MC-016 — Toggle an individual tool of a server (disabled-tools metadata)
- **Pattern:** event-driven
- **Statement:** *When the user disables or re-enables an individual tool of a server (from the test-result modal), the system SHALL record the change in that server's `disabledTools` metadata and persist it.*
- **Acceptance:**
  - Given a tested server exposing tools `read`, `write`
  - When the user disables `write`
  - Then `_claudian.servers[name].disabledTools` includes `write` and the active-server computation excludes `mcp__<server>__write` (REQ-MC-033)
- **Priority:** should
- **Satisfies:** charter §3.7; `disabledTools` (`core/types/mcp.ts:43`); `McpTestModal` per-tool checkboxes; `collectDisallowedTools` (`McpServerManager.ts:78`)
- **Test:** TEST-MC-016

### Transports

#### REQ-MC-020 — Support the stdio transport (local subprocess)
- **Pattern:** optional-feature
- **Statement:** *Where a server is configured as `stdio` (a `command` plus optional `args` and `env`), the system SHALL connect by spawning the configured command as a local subprocess via the MCP SDK's stdio transport.*
- **Acceptance:**
  - Given a stdio server `{ command:'npx', args:['-y','server'] }`
  - When the system connects/tests it
  - Then it spawns the parsed command + args with the merged env (REQ-MC-061) and establishes an MCP client connection
- **Priority:** must
- **Satisfies:** charter §3.7; `McpTester` stdio branch (`McpTester.ts:236-247`); `parseCommand` (`utils/mcp.ts:46`)
- **Test:** TEST-MC-020 (manual real-transport leg TEST-MC-M1 — coverage-excluded infra)

#### REQ-MC-021 — Support the SSE transport
- **Pattern:** optional-feature
- **Statement:** *Where a server is configured as `sse` (a `url` plus optional `headers`), the system SHALL connect over Server-Sent Events using the SDK's legacy SSE client transport with a Node HTTP fetch.*
- **Acceptance:**
  - Given an sse server `{ type:'sse', url, headers? }`
  - When the system connects/tests it
  - Then it uses the legacy SSE transport with the supplied headers over the Node fetch (REQ-MC-064) and establishes an MCP client connection
- **Priority:** must
- **Satisfies:** charter §3.7; `McpTester` sse branch + `createLegacySseTransport` (`McpTester.ts:38-44`, `248-258`)
- **Test:** TEST-MC-021 (manual real-transport leg TEST-MC-M1)

#### REQ-MC-022 — Support the HTTP transport
- **Pattern:** optional-feature
- **Statement:** *Where a server is configured as `http` (or a bare `url`), the system SHALL connect over streamable HTTP using the SDK's streamable-HTTP client transport with a Node HTTP fetch and the supplied headers.*
- **Acceptance:**
  - Given an http server `{ type:'http', url, headers? }` or `{ url }`
  - When the system connects/tests it
  - Then it uses the streamable-HTTP transport with the headers over the Node fetch and establishes an MCP client connection
- **Priority:** must
- **Satisfies:** charter §3.7; `McpTester` http branch + `StreamableHTTPClientTransport` (`McpTester.ts:248-258`)
- **Test:** TEST-MC-022 (manual real-transport leg TEST-MC-M1)

#### REQ-MC-023 — A transport that fails to construct returns a structured error
- **Pattern:** unwanted-behaviour
- **Statement:** *If a transport cannot be constructed (missing command, malformed URL, invalid config), then the system SHALL return a structured `{ success:false, tools:[], error }` result and SHALL NOT throw.*
- **Acceptance:**
  - Given a stdio config with an empty command, or an sse/http config with a malformed url
  - When the system attempts a connection/test
  - Then it returns `success:false` with `error` set ("Missing command" / "Invalid server configuration") and no exception escapes
- **Priority:** must
- **Satisfies:** charter §3.7; `McpTester` construct guards (`McpTester.ts:239-265`)
- **Test:** TEST-MC-023

### Connection tester

#### REQ-MC-030 — Test a server → success with server name/version + tools
- **Pattern:** event-driven
- **Statement:** *When the user tests a server, the system SHALL open an MCP client connection, list the server's tools, and return `{ success:true, serverName?, serverVersion?, tools }`.*
- **Acceptance:**
  - Given a reachable server
  - When the user tests it
  - Then the result reports `success:true` with the server's reported name/version and the tool list (name + optional description + input schema)
- **Priority:** must
- **Satisfies:** charter §3.7; `testMcpServer` success path (`McpTester.ts:271-292`); `McpTestResult`/`McpTool` (`McpTester.ts:13-25`)
- **Test:** TEST-MC-030 (manual real-transport leg TEST-MC-M1)

#### REQ-MC-031 — Test enforces a 10-second timeout
- **Pattern:** unwanted-behaviour
- **Statement:** *If a server test does not connect within 10 seconds, then the system SHALL abort the attempt and return `{ success:false, error:'Connection timeout (10s)' }`.*
- **Acceptance:**
  - Given an unresponsive server
  - When the user tests it
  - Then after 10s the attempt is aborted and the result reports the timeout error
- **Priority:** must
- **Satisfies:** charter §3.7; `AbortController` + 10000ms timeout (`McpTester.ts:268-269`, `294-296`)
- **Test:** TEST-MC-031

#### REQ-MC-032 — Connect-ok-but-list-tools-fails is a partial success
- **Pattern:** unwanted-behaviour
- **Statement:** *If a server connects but listing its tools fails, then the system SHALL still return `success:true` with an empty tools array rather than reporting a failure.*
- **Acceptance:**
  - Given a server that connects but errors on `listTools`
  - When the user tests it
  - Then the result is `{ success:true, tools:[], serverName?, serverVersion? }`
- **Priority:** should
- **Satisfies:** charter §3.7; `testMcpServer` partial-success (`McpTester.ts:276-285`)
- **Test:** TEST-MC-032

#### REQ-MC-033 — A failed connection returns a friendly error message
- **Pattern:** unwanted-behaviour
- **Statement:** *If a server connection fails for a reason other than timeout, then the system SHALL return `{ success:false, error }` carrying the underlying error message and SHALL NOT crash.*
- **Acceptance:**
  - Given an unreachable URL or a spawn failure (EACCES, ENOENT)
  - When the user tests the server
  - Then the result reports `success:false` with the underlying message and the host stays responsive
- **Priority:** must
- **Satisfies:** charter §3.7; `testMcpServer` catch path (`McpTester.ts:293-301`)
- **Test:** TEST-MC-033 (manual real-transport leg TEST-MC-M1)

#### REQ-MC-034 — The tester is unavailable on the non-Node bridges and degrades cleanly
- **Pattern:** state-driven
- **Statement:** *While running on a bridge without a Node runtime (the GitHub Pages / LocalStorage demo), the system SHALL report the tester as unavailable with a clear message and SHALL NOT attempt a connection.*
- **Acceptance:**
  - Given the LocalStorage bridge (no Node)
  - When the user tests a server
  - Then the result reports unavailability ("MCP testing requires the desktop app") without a thrown error
- **Priority:** should
- **Satisfies:** charter §3.7; audit "GitHub Pages demo cannot run MCP" (`claudian-audit-backend.md` line 326); ADR-008 3-bridge discipline
- **Test:** TEST-MC-034

### Settings UI

#### REQ-MC-040 — Render the MCP server management list (Claude only)
- **Pattern:** state-driven
- **Statement:** *While the active provider's capabilities report `supportsMcpTools:true`, the system SHALL render an MCP settings section listing each managed server with its name, transport type, enabled toggle, and per-server actions (edit / remove / test).*
- **Acceptance:**
  - Given a Claude session with two managed servers
  - When the user opens the MCP settings section
  - Then both servers render with name, transport type, an enabled toggle, and edit/remove/test actions
- **Priority:** must
- **Satisfies:** charter §3.7/§3.10 (`settings/mcp-settings.css`); `McpSettingsManager`; capability gate (`claudian-audit-backend.md` §"MCP wiring split", line 330)
- **Test:** TEST-MC-040

#### REQ-MC-041 — Hide the MCP settings section when MCP is unsupported
- **Pattern:** unwanted-behaviour
- **Statement:** *If the active provider does not support MCP tools (`supportsMcpTools:false`), then the system SHALL NOT render the MCP settings section.*
- **Acceptance:**
  - Given a provider with `supportsMcpTools:false`
  - When the user opens settings
  - Then no MCP management section is shown
- **Priority:** must
- **Satisfies:** charter §6b line 258; the capability-driven discipline (`ToolbarCapabilities.supportsMcpTools`, `ChatRuntimePort.ts:43`)
- **Test:** TEST-MC-041

#### REQ-MC-042 — Add/edit a server via a modal (no window.confirm/prompt, no v-html)
- **Pattern:** event-driven
- **Statement:** *When the user opens the add or edit flow, the system SHALL present a modal (an Obsidian `Modal` subclass or the established modal seam) with fields for name, transport/config, and description, building all DOM without `innerHTML`/`v-html` and without `window.confirm`/`prompt`.*
- **Acceptance:**
  - Given the add or edit action
  - When the modal opens and the user submits
  - Then the server is added/edited (REQ-MC-010/012) and no banned DOM API is used
- **Priority:** must
- **Satisfies:** charter §3.10 (`modals/mcp-modal.css`); `McpServerModal`; CLAUDE.md DOM rules
- **Test:** TEST-MC-042

#### REQ-MC-043 — Import a server config by paste
- **Pattern:** event-driven
- **Statement:** *When the user pastes a config string into the add flow, the system SHALL parse it (REQ-MC-003), prompt for a name when `needsName` is true, and surface a parse error (REQ-MC-004) without adding a server.*
- **Acceptance:**
  - Given a pasted format-2 config (no name)
  - When the user submits
  - Then the system asks for a name before adding; a malformed paste shows the parse error and adds nothing
- **Priority:** should
- **Satisfies:** charter §3.7; `parseClipboardConfig`/`tryParseClipboardConfig` (`McpConfigParser.ts`)
- **Test:** TEST-MC-043

#### REQ-MC-044 — Show the test result in a modal (server header + per-tool list + errors)
- **Pattern:** event-driven
- **Statement:** *When the user runs a server test, the system SHALL present the result in a modal showing a loading state during the probe, then the server name/version with a per-tool list carrying enable/disable controls on success, or a friendly error message on failure.*
- **Acceptance:**
  - Given a test in progress
  - When it resolves
  - Then the modal shows the spinner during the probe, then either the server header + per-tool checkboxes (REQ-MC-016) or the error (REQ-MC-031/033)
- **Priority:** must
- **Satisfies:** charter §3.7/§3.10 (`modals/mcp-modal.css`); `McpTestModal` (`claudian-audit-backend.md` line 314)
- **Test:** TEST-MC-044

#### REQ-MC-045 — Map the MCP CSS modules to `--sp-*` tokens
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL render the MCP modal, settings, and selector surfaces through `--sp-*` design tokens, with no raw Obsidian variable or physical-direction CSS property leaking into the components.*
- **Acceptance:**
  - Given the MCP modal/settings/selector components
  - When the token guard runs
  - Then every Claudian `mcp-modal` / `mcp-settings` / `mcp-selector` value resolves to a `--sp-*` token and the `lint-style-tokens` guard passes
- **Priority:** must
- **Satisfies:** charter §3.10, §5.4; the AUX `lint-style-tokens` guard
- **Test:** TEST-MC-045

### Selector integration + runtime seam

#### REQ-MC-050 — The P6 MCP selector lists the enabled servers
- **Pattern:** state-driven
- **Statement:** *While at least one MCP server is configured for a Claude session, the system SHALL make the P6 MCP-selector list every managed server with its enabled state and a count badge of the enabled servers — replacing the P6 visible-empty "coming later" panel.*
- **Acceptance:**
  - Given two managed servers (one enabled)
  - When the user opens the MCP selector
  - Then it lists both servers with their enabled state, shows a count badge of 1, and no longer shows the "coming later" notice
- **Priority:** must
- **Satisfies:** charter §3.5; the P6 seam (`src/ui/chat/toolbar/McpSelector.vue`; `buildToolbarViewModel.buildMcp`, `buildToolbarViewModel.ts:181`); `McpServerSelector`
- **Test:** TEST-MC-050

#### REQ-MC-051 — Toggling a server in the selector enables/disables it
- **Pattern:** event-driven
- **Statement:** *When the user toggles a server in the MCP selector, the system SHALL enable/disable that server (REQ-MC-014) and update the count badge.*
- **Acceptance:**
  - Given the selector listing an enabled `fs`
  - When the user toggles `fs` off
  - Then `fs` is disabled, persisted, and the badge count decrements
- **Priority:** must
- **Satisfies:** charter §3.5; `McpServerSelector` mousedown toggle; `McpServerManager` enable/disable
- **Test:** TEST-MC-051

#### REQ-MC-052 — An enabled server's tools reach a Claude turn (additive runtime seam)
- **Pattern:** event-driven
- **Statement:** *When the user sends a turn while MCP servers are enabled, the system SHALL pass the active enabled servers to the runtime via an additive query field (e.g. `enabledMcpServers?`) so the agent can call their tools — and an absent/empty value SHALL leave the query byte-identical to P7.*
- **Acceptance:**
  - Given two enabled servers and a turn
  - When the turn is sent
  - Then the runtime query carries the active enabled servers; with no enabled server the query serialises byte-identically to a P7 query (the `enabledMcpServers?` field, currently EXCLUDED in `ChatTurn.ts`, is introduced additively)
- **Priority:** must
- **Satisfies:** charter §3.7; `McpServerManager.getActiveServers` (`McpServerManager.ts:38`); the EXCLUDED `enabledMcpServers?` note (`ChatTurn.ts:21-22,51`); ADR-CC-001 additivity
- **Test:** TEST-MC-052

#### REQ-MC-053 — Context-saving gating model is specified (servers injected only when mentioned)
- **Pattern:** state-driven
- **Statement:** *While a server has `contextSaving:true`, the system SHALL include it in a turn's active servers only when its name appears in the turn's mentioned-server set, and SHALL otherwise pre-register its disabled tools so a later mention does not force a cold start.*
- **Acceptance:**
  - Given an enabled context-saving server `fs` and a turn whose mentioned set excludes `fs`
  - When the active servers are computed
  - Then `fs` is excluded from the active set but its `disabledTools` are pre-registered (the mention set itself is sourced by a later phase — NG3; P8 wires the gating with an empty mention set by default)
- **Priority:** should
- **Satisfies:** charter §3.7; `getActiveServers` + `getAllDisallowedMcpTools` (`McpServerManager.ts:38-94`); `extractMcpMentions` (`utils/mcp.ts:1`)
- **Test:** TEST-MC-053

#### REQ-MC-054 — Disabled tools never reach the runtime as callable
- **Pattern:** unwanted-behaviour
- **Statement:** *If a server has tools in its `disabledTools` set, then the system SHALL pass those tools to the runtime as disallowed (`mcp__<server>__<tool>`) so the agent cannot invoke them.*
- **Acceptance:**
  - Given an enabled server `fs` with `disabledTools:['write']`
  - When the active servers are computed for a turn
  - Then `mcp__fs__write` is in the disallowed-tools list passed to the runtime
- **Priority:** should
- **Satisfies:** charter §3.7; `getDisallowedMcpTools`/`collectDisallowedTools` (`McpServerManager.ts:62-94`); `mcp__a__b` id format
- **Test:** TEST-MC-054

### Security

#### REQ-MC-061 — A stdio server spawns with a bounded, explicit environment
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL spawn a stdio MCP server with an environment composed of the process env merged with the server config's explicit `env`, an enhanced `PATH`, and `stderr` suppressed — never an unbounded shell evaluation of user input.*
- **Acceptance:**
  - Given a stdio server with an `env` override
  - When the system spawns it
  - Then the child env is `{ ...process.env, ...config.env, PATH: enhancedPath }` with `stderr:'ignore'`, and the command is the explicitly parsed `cmd`+`args`
- **Priority:** must
- **Satisfies:** charter §1 (security/DOM rules); `McpTester` stdio env (`McpTester.ts:242-247`); `getEnhancedPath`
- **Test:** TEST-MC-061 (manual real-transport leg TEST-MC-M1)

#### REQ-MC-062 — The user explicitly adds every server (no implicit/auto-discovered servers)
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL only manage MCP servers the user has explicitly added or that already exist in the vault `.claude/mcp.json`; it SHALL NOT auto-discover, auto-enable, or auto-spawn any server the user did not configure.*
- **Acceptance:**
  - Given a fresh install with no `.claude/mcp.json`
  - When the chat surface loads
  - Then no MCP server is registered, spawned, or connected
- **Priority:** must
- **Satisfies:** charter §1; trust posture; REQ-MC-002
- **Test:** TEST-MC-062

#### REQ-MC-063 — The MCP config is data, not executable, and carries no plaintext secret managed by P8
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL treat the MCP config as inert data (parsed JSON), SHALL NOT evaluate config values as code, and SHALL NOT write any user secret into a separate plaintext store — where a server config requires auth (headers/env), that material stays within the server config the user supplied and the `SecretStorePort` integration is deferred (CLAR-MC-004).*
- **Acceptance:**
  - Given a server config containing an auth header value
  - When the system stores and uses the config
  - Then no config value is `eval`-ed and no secret is duplicated into a separate plaintext file beyond the config the user already authored
- **Priority:** must
- **Satisfies:** charter §1 / CHARTER-REQ-SEC; `McpConfigParser` (pure JSON parse); audit secret-handling open question (`claudian-audit-backend.md` line 629)
- **Test:** TEST-MC-063

#### REQ-MC-064 — Remote-transport probing bypasses renderer CORS via Node HTTP without weakening transport security
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL probe SSE/HTTP servers using a Node `http`/`https` fetch (to avoid the Electron renderer's CORS restriction) while still using the official MCP SDK transports for protocol semantics, and SHALL respect the abort signal/timeout.*
- **Acceptance:**
  - Given an http server probe
  - When the system connects
  - Then it uses the Node-backed fetch with the SDK transport, honours the 10s abort (REQ-MC-031), and does not disable TLS verification
- **Priority:** should
- **Satisfies:** charter §3.7; `createNodeFetch` (`McpTester.ts:50`); `claudian-audit-backend.md` line 314
- **Test:** TEST-MC-064 (manual real-transport leg TEST-MC-M1)

#### REQ-MC-065 — A server tool call is gated by the P7 approval engine
- **Pattern:** event-driven
- **Statement:** *When the agent requests an MCP server tool during a turn, the system SHALL route the request through the P7 approval engine (the existing `setApprovalCallback` seam + `ApprovalManager`) before the tool runs — an MCP tool is not auto-trusted.*
- **Acceptance:**
  - Given an enabled server tool `mcp__fs__read` and a turn that calls it
  - When the runtime requests approval
  - Then the P7 `ApprovalManager.decide` path runs (mode gate → rule match → allow/deny/prompt) exactly as for any other tool; with no matching rule and `normal` mode the unchanged P4/P7 inline approval block is shown
- **Priority:** must
- **Satisfies:** charter §3.9/§3.7; P7 `setApprovalCallback` (`ChatRuntimePort.ts:112`); PRD-AS-001 REQ-AS-020..025; `ApprovalGateRuntime`
- **Test:** TEST-MC-065

### Accessibility + additivity

#### REQ-MC-070 — The MCP surfaces are keyboard-operable
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL make every MCP control — the selector, its server toggles, the settings list actions, the add/edit modal, and the test modal — reachable and operable by keyboard (focus, Enter/Space activation, Escape to close a modal/dropdown) and SHALL expose accessible names and expanded/selected state.*
- **Acceptance:**
  - Given keyboard-only navigation
  - When the user opens the selector, toggles a server, opens add/edit, and runs a test
  - Then every control is reachable and operable, the selector reports `aria-expanded`, and each toggle exposes its state
- **Priority:** must
- **Satisfies:** charter §1/§3.9 a11y; WCAG 2.2 AA; the P6 selector's existing `aria-expanded` (`McpSelector.vue:34`)
- **Test:** TEST-MC-070

#### REQ-MC-071 — A malformed or unreachable server degrades gracefully and never crashes the chat
- **Pattern:** unwanted-behaviour
- **Statement:** *If a configured server is malformed, fails to connect, or errors during a turn, then the system SHALL surface a non-blocking notice and continue the chat session without that server, and SHALL NOT crash the view or break unrelated servers.*
- **Acceptance:**
  - Given two enabled servers where one is unreachable
  - When a turn runs
  - Then the chat completes using the working server, the failure surfaces as a notice, and the session stays usable
- **Priority:** must
- **Satisfies:** charter §3.7; `ErrorBoundary`; `Result`-returning ports; REQ-MC-033/071
- **Test:** TEST-MC-071

#### REQ-MC-072 — Errors surface through the NotificationPort, not raw console only
- **Pattern:** event-driven
- **Statement:** *When an MCP operation fails in a user-initiated flow (test, add, save), the system SHALL surface a user-facing message via `NotificationPort`/`FeedbackService` and SHALL log diagnostic detail via `LoggerPort` without leaking secret config values into the notice.*
- **Acceptance:**
  - Given a save failure or a failed test
  - When the failure occurs
  - Then the user sees a friendly notice and the logger records detail; no auth header/secret value appears in the notice
- **Priority:** should
- **Satisfies:** charter §1; `FeedbackService`; LoggerPort/NotificationPort split (CLAUDE.md ports)
- **Test:** TEST-MC-072

#### REQ-MC-080 — Real transports live in coverage-excluded infrastructure
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL place the real MCP SDK + Node spawn/http transports in `src/infrastructure/obsidian/**` (coverage-excluded), with the Mock bridge providing scriptable canned tool lists/results and the LocalStorage bridge inert, so the automated suite carries the logic and the real-transport legs are manual.*
- **Acceptance:**
  - Given the three bridges
  - When the test suite runs
  - Then the Obsidian transport code is coverage-excluded and exercised only by manual legs, while Mock/LocalStorage carry the automated coverage
- **Priority:** must
- **Satisfies:** charter §6c; ADR-008 3-bridge discipline; the coverage exclusion (`src/infrastructure/obsidian/**`)
- **Test:** TEST-MC-080 (manual real-transport leg TEST-MC-M1)

#### REQ-MC-081 — The MCP client lives behind narrow ports; Vue never imports obsidian/node
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL expose the MCP config store and the MCP client/transport behind narrow ports (`McpConfigStorePort`, `McpClientPort`) consumed one-per-dependency, and Vue components SHALL NOT import `obsidian` or `node:*`.*
- **Acceptance:**
  - Given the MCP UI and application code
  - When ESLint runs
  - Then no Vue component imports `obsidian`/`node:*`, each port has its own InjectionKey + composable, and there is no aggregate `usePorts`
- **Priority:** must
- **Satisfies:** charter §6a/§6c; ADR-008 narrow ports; CLAUDE.md import rules; `McpConfigStorePort`/`McpClientPort` (audit ports table)
- **Test:** TEST-MC-081

#### REQ-MC-082 — Additivity: with no MCP server configured, P1–P7 is byte-identical
- **Pattern:** unwanted-behaviour
- **Statement:** *If no MCP server is configured (the no-servers default), then the chat surface, the toolbar, and the runtime query SHALL be byte-identical to the P1–P7 behaviour — the MCP selector keeps its P6 visible-empty seam and no `enabledMcpServers` value is emitted.*
- **Acceptance:**
  - Given a session with no managed servers
  - When the user chats and inspects the toolbar + the runtime query
  - Then the MCP selector shows the P6 empty seam, the query omits `enabledMcpServers`, and a regression diff against P7 is empty
- **Priority:** must
- **Satisfies:** charter §4 (additive slices); ADR-CC-001 additivity; the EXCLUDED `enabledMcpServers?` (`ChatTurn.ts:51`); the P6 `buildMcp` empty seam
- **Test:** TEST-MC-082

## Non-functional requirements

> Targets inherited from the epic constraints (charter §1, the P7 PRD-AS NFR pattern) and
> CLAUDE.md. New thresholds documented inline.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-MC-001 | additivity | A turn with no enabled MCP server, and a `{ text }`-only query, serialise byte-identically to P7 | Byte-identical; regression diff empty |
| NFR-MC-002 | security (spawn) | A stdio server spawn is explicit + bounded — parsed cmd+args, merged explicit env, no shell-eval of user input, stderr suppressed | No `shell:true` / string-eval; spawn args asserted (REQ-MC-061) |
| NFR-MC-003 | security (secrets) | No MCP config value is `eval`-ed; no secret duplicated into a separate plaintext store by P8; secret values never appear in notices/logs | 0 secret leaks (REQ-MC-063/072); `SecretStorePort` follow-up flagged (CLAR-MC-004) |
| NFR-MC-004 | reliability | A malformed/unreachable server never crashes the chat; the tester enforces a 10s timeout; all port methods return `Result`/structured result and never throw across the boundary | 0 uncaught throws; 10s timeout (REQ-MC-031); `Result`-typed |
| NFR-MC-005 | architecture (DDD) | DDD inward imports; narrow ports (`McpConfigStorePort`, `McpClientPort`), one-per-dependency, no aggregate; Vue never imports `obsidian`/`node:*`; config parse/validate is pure domain | ESLint green; no `IBridge`/`usePorts` (REQ-MC-081) |
| NFR-MC-006 | architecture (coverage) | Real MCP SDK/Node transports live in `src/infrastructure/obsidian/**` (coverage-excluded); Mock scriptable + LS inert carry automated weight; suite meets the 80/70/80/80 gate | Coverage 80/70/80/80; obsidian transport excluded (REQ-MC-080) |
| NFR-MC-007 | security (DOM) | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`, no `v-html`, no `window.confirm`/`alert`/`prompt`; modals via Obsidian `Modal`/the modal seam; DOM via Obsidian helpers | 0 banned-DOM lint errors (REQ-MC-042) |
| NFR-MC-008 | accessibility | The MCP selector, toggles, settings actions, and modals meet WCAG 2.2 AA — keyboard-operable, focus-managed, accessible names, `aria-expanded`/state | WCAG 2.2 AA (REQ-MC-070) |
| NFR-MC-009 | visual parity | The `mcp-modal` / `mcp-settings` / `mcp-selector` surfaces render through `--sp-*` tokens; no raw Obsidian var or physical-direction CSS leaks | `lint-style-tokens` green (REQ-MC-045); perceptual parity at 320/520/720, light+dark |
| NFR-MC-010 | compatibility | `manifest.json` identity (`id`, `version`, `minAppVersion 1.12.7`) unchanged; bundling `@modelcontextprotocol/sdk` records its rationale (license/maintenance) per AGENTS.md §8 | Manifest untouched; dep rationale in the PR (CLAR-MC-003) |
| NFR-MC-011 | privacy | The MCP config is a vault artifact (`.claude/mcp.json`); P8 introduces no telemetry and sends MCP server config nowhere except the server the user configured | 0 new network egress beyond configured servers |
| NFR-MC-012 | desktop-only | The MCP client is desktop-only by nature (subprocess + Node http); on non-Node bridges it degrades to "unavailable" rather than erroring | Clean degrade (REQ-MC-034) |

## Success metrics

- **North star:** A Claudian-migrant user's existing `.claude/mcp.json` servers appear,
  enable/disable from the toolbar, test successfully, and their tools run in a Claude turn
  — recognisable as "the same product" (charter §1).
- **Supporting:** All `must` REQ-MC pass automated acceptance (the non-real-transport
  legs) on the verify gate; the real-transport legs (TEST-MC-M1) pass on the manual
  Obsidian run accumulated for the final epic gate; parity screenshots of the selector +
  modal + settings read as Claudian at 320/520/720 (light+dark).
- **Counter-metric:** No regression in the P1–P7 surface — the no-servers additivity diff
  is empty (NFR-MC-001), coverage stays ≥ 80/70/80/80, and zero new banned-DOM / token-leak
  lint errors. A configured-but-broken server must not raise the chat crash rate above the
  P7 baseline (zero).

## Release criteria

What must be true to ship P8 and merge `feature/mcp-client` → `next`.

- [ ] All `must` REQ-MC pass acceptance (automated legs green; real-transport legs
      TEST-MC-M1 recorded for the final epic gate).
- [ ] All NFR-MC met, or explicitly waived with an ADR.
- [ ] `McpConfigStorePort` + `McpClientPort` ADRs filed + accepted (architect, P8) and the
      config-source decision (CLAR-MC-001 — vault `.claude/mcp.json`) ratified.
- [ ] Additivity proven: no-servers default leaves P1–P7 byte-identical (NFR-MC-001).
- [ ] The P6 MCP selector lists + toggles enabled servers (REQ-MC-050/051); an enabled
      server's tools reach a turn (REQ-MC-052) and are P7-approval-gated (REQ-MC-065).
- [ ] Config parses + validates; malformed config is rejected, never crashes (REQ-MC-004).
- [ ] Each transport (stdio/SSE/HTTP) connects + tests with success/error semantics
      (REQ-MC-020..023, REQ-MC-030..033).
- [ ] Security posture met: bounded explicit spawn, no eval, no plaintext secret duplicated,
      explicit-add-only (REQ-MC-061..064).
- [ ] `lint-style-tokens` + token-mapping review green; parity screenshots captured.
- [ ] Verify gate green (`npm run verify` + `npm run test:all` exit zero); CI green on `next`.
- [ ] `manifest.json` untouched; `@modelcontextprotocol/sdk` dep rationale recorded (CLAR-MC-003).

## Open questions / clarifications

All resolved by recommendation (autonomous mode — the architect's P8 ADRs ratify). None
block `/spec:design`.

- **CLAR-MC-001 — MCP config source: vault file vs device-local.** *Recommendation: a
  vault file (`.claude/mcp.json`, the Claudian path), NOT device-local.* Grounding:
  Claudian stores the MCP list in the vault at `.claude/mcp.json` (`McpStorage.ts:9` —
  `MCP_CONFIG_PATH`) as an `mcpServers` map plus a `_claudian` metadata sidecar, and the
  Claude Agent-SDK/CLI reads that path. CHARTER-REQ-SET says *user/device-scoped personal
  prefs* (locale, logLevel, device CLI paths) stay device-local — but the MCP server list
  is **project/vault configuration, not a personal device pref**: it must be readable by
  the Claude CLI from a known vault location, and it is meaningfully shared with the vault
  (collaborators using the same vault want the same servers). So it differs from the
  ADR-PSR-002 device-local SettingsPort call and the P7 device-local `ApprovalRuleStorePort`
  call. **Tension flagged:** because `.claude/mcp.json` is a vault file it is git-committed
  + shared; that is acceptable for non-secret server config (the auth/secret tension is
  handled by CLAR-MC-004 — no plaintext secret managed by P8). The architect files the
  `McpConfigStorePort` ADR ratifying the vault-file decision (may diverge from prior
  device-local calls precisely because the Claude CLI must read the config). *Owner: architect (P8 ADR).*
- **CLAR-MC-002 — Canonical vault path: `.claude/mcp.json` vs `.claudian`/`.specorator`.**
  *Recommendation: keep `.claude/mcp.json` (the path the Claude CLI/Agent-SDK reads).*
  Renaming to a Specorator-branded path would break Claude-CLI readability, which is the
  whole point of the vault-file decision (CLAR-MC-001). The audit raises this
  (`claudian-audit-backend.md` line 300). *Owner: architect (P8 ADR, ties to ADR-005 sink).*
- **CLAR-MC-003 — Bundling `@modelcontextprotocol/sdk` as a runtime dependency.**
  *Recommendation: bundle it (it is the only sanctioned MCP client/transport implementation)
  and record the rationale (license, maintenance, why-not-existing) in the PR per AGENTS.md
  §8.* The real transports + the SDK live in coverage-excluded infra (REQ-MC-080). *Owner:
  architect/dev (P8).*
- **CLAR-MC-004 — Server auth/secrets vs `SecretStorePort`.** *Recommendation: P8 stores
  server config (including any header/env auth the user authored) as-is in the vault config
  and does NOT introduce a secret editor; flag `SecretStorePort` integration as a follow-up
  (≈P10 with the env/secret surface).* Grounding: Claudian writes server config (with
  headers/env) to `.claude/mcp.json` in plaintext; CHARTER-REQ-SEC forbids *new* plaintext
  secret stores but P8 introduces none — it reuses the config the user already authored.
  P8's posture (REQ-MC-063): config is inert data, never eval-ed, secrets never leaked to
  notices/logs. The architect confirms whether any P8-introduced auth field needs
  `SecretStorePort` now or defers. *Owner: architect (P8/P10).*
- **CLAR-MC-005 — The `enabledMcpServers?` runtime field shape + the mention set source.**
  *Recommendation: introduce `ChatRuntimeQueryOptions.enabledMcpServers?` (the EXCLUDED
  field noted in `ChatTurn.ts:51`) additively as the active-servers map (name → config),
  computed by `getActiveServers(mentionedNames)`; for P8 the mentioned-server set is empty
  by default (the composer `@mention` MCP cross-link is NG3, deferred), so context-saving
  servers are pre-registered-disabled per REQ-MC-053.* The architect ratifies the field
  shape + the disallowed-tools threading in the `McpClientPort`/runtime ADR. *Owner:
  architect (P8 ADR).*

## Out of scope

- MCP for Codex/Opencode (NG1; charter §6b line 258).
- Authoring/bundling MCP servers (NG2).
- The composer `@mention`-MCP cross-link (NG3 — the gating model is specified, the trigger is deferred).
- A bespoke running-tool UI beyond the P2 tool-call renderer + the P7 approval block (NG4).
- A `SecretStorePort`-backed secret editor for server auth (NG5; CLAR-MC-004 follow-up).
- Settings-shell polish (P10), i18n beyond en+de (P11), a11y polish beyond AA (P12) (NG6).
- Any legacy MCP-config migration (NG7; CHARTER-REQ-FRESH).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable (Given/When/Then) + 1:1 claudian path + future TEST-MC id.
- [x] NFRs listed with targets (inherited epic constraints restated; new thresholds documented).
- [x] Success metrics defined (including a counter-metric).
- [x] Release criteria stated.
- [x] `/spec:clarify` self-check: CLAR-MC-001..005 resolved-by-recommendation (autonomous; architect ADRs ratify) — none block design.
