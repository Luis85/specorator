---
feature: "Obsidian CLI-backed MCP server"
area: OCM
slug: obsidian-cli-mcp-server
stage: research
status: complete
date: 2026-05-23
sources:
  - https://obsidian.md/cli
  - https://help.obsidian.md/cli
  - https://www.npmjs.com/package/@modelcontextprotocol/sdk
  - https://github.com/modelcontextprotocol/typescript-sdk
  - https://github.com/coddingtonbear/obsidian-local-rest-api
---

# Research — Obsidian CLI-backed MCP server

## R1. Does an official Obsidian CLI exist? — Yes

`https://obsidian.md/cli` is a genuine official landing page ("Command your vault").
The CLI shipped in **Obsidian 1.12.0 (Catalyst early access, Feb 2026)** and went GA in
**1.12.4**. It is **not a standalone headless tool** — it is a remote-control binary
bundled with the Obsidian desktop app that talks to a running instance (and can
auto-launch Obsidian if it is not open).

Implication: the CLI requires the desktop app. This matches Specorator's deployment
(the plugin only runs inside desktop Obsidian), so it is a sound foundation here. It is
**not** suitable for a truly headless server — but that is not our deployment.

## R2. CLI command surface

30+ command categories / 100+ commands. Relevant to us:

| Command | Purpose | JSON |
|---|---|---|
| `search query=… ` | Full-text vault search | `format=json` |
| `read path=…` | Read a note's content | `format=json` |
| `daily` | Open/return today's daily note | `format=json` |
| `properties path=…` | Read note frontmatter/properties | `format=json` |
| `tags` | List tags | `format=json` |
| `tasks` | List tasks | `format=json` |
| `bookmarks` | List bookmarks | `format=json` |
| `bases` | Query Bases | `format=json` |
| `append path=… content=…` | Append to a note (**write**) | — |
| `create`, `move`, `delete` | Mutating file ops (**write**) | — |
| `eval code="…"` | **Run arbitrary JS against `app`** | — |

The official docs do **not** mention MCP. Many read commands accept `format=json`.
`eval` reaches the entire plugin API and is therefore a significant security surface.

## R3. MCP TypeScript SDK facts

- Package: **`@modelcontextprotocol/sdk`** (already a dependency at `^1.29.0`).
- Server: `McpServer`; tools registered via `mcp.registerTool(name, { description,
  inputSchema }, handler)`.
- Transports: **stdio** (local child-process servers, how Claude Desktop/Code spawn
  them) and **Streamable HTTP** (modern network transport). SSE is deprecated.
- Specorator already uses `StreamableHTTPServerTransport` over a loopback HTTP server
  with a dynamic port and a `Host`-header gate (ADR-013).

## R4. How community Obsidian MCP servers access the vault

Two dominant patterns predate the official CLI:
1. **Local REST API plugin** (`coddingtonbear/obsidian-local-rest-api`) fronted by
   servers like `MarkusPfundstein/mcp-obsidian` — requires Obsidian running, HTTPS on
   `127.0.0.1:27124` with a bearer token.
2. **Direct filesystem** access to the vault directory — app-independent, with
   path-traversal guards, but bypasses Obsidian's indexing/link handling.

None of the dominant servers shell out to a CLI (because there was no official one until
Feb 2026). Building on the official CLI is therefore a **novel but defensible** design:
it avoids a third-party-plugin dependency and re-uses Obsidian's own, maintained
operations.

## R5. Existing Specorator MCP infrastructure (code review)

- `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts` — in-process loopback HTTP
  MCP server (ADR-013). Constructs a fresh `McpServer` per request and registers six
  tool groups. Started/stopped by `PluginCore`, gated by `mcpServerEnabled`.
- `src/infrastructure/obsidian/mcp/register*Tools.ts` — the six tool groups.
- `src/infrastructure/obsidian/ProposalStore.ts` — write boundary: `queue(tool, params,
  mutate) → proposalId`; `accept` runs the mutator, `reject` does not.
- `src/infrastructure/obsidian/ClaudeBinaryResolver.ts` /
  `CursorBinaryResolver.ts` — PATH discovery via a short-lived child process
  (`sh -lc 'command -v <bin>'` / `where.exe <bin>`), first-absolute-line validation,
  5 s timeout. Reusable pattern for an `obsidian` resolver.
- `src/plugin/settings.ts` — `renderClaudeCliPathField` shows the reusable "path field
  with autodetect + test" pattern; `renderMcpServerStatus` is the current (minimal) MCP
  status line.
- `src/domain/settings/PluginSettings.ts` — `claudeCliPath` field shows the convention
  for a configurable absolute binary path (`'' = unset/auto`).

## R6. Decision inputs

- **Build the MCP tool surface on the CLI as an additive group** inside the existing
  adapter (ADR-013 mandates a single registration site; modules cannot register tools).
- **Reuse** `ProposalStore` for CLI writes, the binary-resolver pattern for discovery,
  and the settings-path-field pattern for management UI.
- **Never expose `eval` or destructive commands** as agent tools. Reads are
  allow-listed; the only write is a proposal-queued `append`.
- **Graceful degradation:** when no CLI is configured/available, the server still runs
  with the in-process groups; the CLI group is omitted.

## R7. Caveats to carry into design

1. The official CLI is ~3 months old; treat its JSON output as an *unstable contract*.
   Parse defensively and surface parse failures as typed errors, never crashes.
2. The CLI requires the desktop app running — acceptable for this plugin.
3. `format=json` support is per-command; `runJson` is only used for commands known to
   support it.
