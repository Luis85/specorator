---
title: "Local Tool Host: Bundled MCP Server Extended by User-Authored Node Scripts"
date: 2026-06-28
status: draft
scope: agents
tags:
  - tools
  - mcp
  - agents
related:
  - "[[docs/research/2026-06-19-user-tools-and-mcp-transport.md]]"
  - "[[docs/tech-debt/2026-06-27-revert-1.13-and-drop-tool-library.md]]"
  - "[[docs/superpowers/specs/2026-06-19-tool-and-skill-library-design.md]]"
supersedes_attempt: "1.13 user tool library (reverted 2026-06-27, commit 28fbcfa)"
---

# Local Tool Host: Bundled MCP Server Extended by User-Authored Node Scripts

## Why

Users want to give the selected model custom capabilities by writing small Node
scripts, without authoring a full MCP server. Specorator should ship a bundled
**local MCP server** ("the tool host") that users extend by dropping `.mjs`
files into a vault folder; each script becomes a callable tool.

This is a deliberate re-attempt. A "user tool library" shipped in 1.13 and was
reverted on 2026-06-27 (commit `28fbcfa`) for **one** reason: it transpiled user
TypeScript and ran it **in-process via the `Function` constructor**, which was the
single *blocking* Obsidian-marketplace Error in the review — every other finding
was advisory. The revert note
([`2026-06-27-revert-1.13-and-drop-tool-library`](../../tech-debt/2026-06-27-revert-1.13-and-drop-tool-library.md))
explicitly leaves the door open to revisit "via a worker/iframe sandbox or a
non-`eval` execution model."

This design takes the non-`eval` path: user code runs as a **spawned `node`
subprocess behind a real stdio MCP server**, loaded with native `import()`. No
user code is ever evaluated inside the plugin renderer, so the blocker that
killed the last attempt does not exist here.

## The safety property (load-bearing)

The plugin bundle contains **no dynamic code evaluation** — no `Function`
constructor, no `eval`. User scripts are loaded with native ESM `import()`
*inside the spawned host process*, which is a separate `node` runtime, not the
Obsidian renderer. This is the entire reason the design is viable where 1.13 was
not.

> **Flagged risk to verify before marketplace submission:** confirm the review
> bot does not object to `import()` in the separately-bundled `tool-host.mjs`.
> The prior Error was specifically the `Function` constructor; dynamic `import()`
> is standard ESM and should not be flagged — but this must be checked, not
> assumed.

## Scope

**In scope (v1):**
- A bundled stdio MCP server ("tool host") shipped alongside `main.js`.
- User scripts authored in **plain JS / ESM** (`.mjs`), discovered from
  `.specorator/tools/`.
- **Claude provider only.** The host is provider-neutral; only the Claude wiring
  ships in v1.
- Opt-in (off by default); requires Node installed on the host machine.
- A lightweight settings surface: enable toggle + discovered-tool list.

**Out of scope (revisitable later):**
- TypeScript authoring (defer to Node-native type-stripping, Node ≥23).
- Codex / Cursor / Opencode wiring (host already neutral — later work is config
  marshalling only).
- A dedicated Tool Library view + in-app editor (the heavy surface 1.13 built).
- Bound-agent per-agent tool grants (the roster `tools` field the revert removed).

## Authoring contract

A tool is a single `.mjs` file in `.specorator/tools/` exporting a `manifest`
and a `handler`:

```js
// .specorator/tools/wordCount.mjs
export const manifest = {
  name: 'word_count',
  description: 'Count words in a piece of text',
  inputSchema: {                    // plain JSON Schema — no zod, no transpile
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  // optional: declared secrets resolved from SecretStorage into ctx.secrets
  // secrets: ['OPENAI_API_KEY'],
};

export async function handler(input, ctx) {
  const n = String(input.text).trim().split(/\s+/).filter(Boolean).length;
  return String(n);          // string → auto-wrapped into MCP result
  // or return { content: [{ type: 'text', text: '...' }] } for full control
}
```

**Contract rules:**
- `manifest.name` — the tool name; exposed as `mcp__specorator__<name>`.
- `manifest.description` — shown to the model.
- `manifest.inputSchema` — a **plain JSON Schema** object, passed straight to MCP
  as the tool's input schema. No zod dependency in the host.
- `manifest.secrets?` — optional array of SecretStorage-backed secret ids the
  tool needs; resolved by the plugin and surfaced via `ctx.secrets`.
- `handler(input, ctx)` — `async`. Returns either:
  - a **string** → host wraps it as `{ content: [{ type: 'text', text }] }`, or
  - a raw **MCP result object** (`{ content: [...], isError? }`) → passed through.
- `ctx` (minimal for v1):
  - `ctx.vaultPath` — absolute path to the vault root (scripts reach vault files
    through `node:fs`; there is no `App` object across the process boundary).
  - `ctx.secrets` — resolved values for the ids declared in `manifest.secrets`.
  - (A logger / `fetch` helper are candidates for later; v1 keeps `ctx` minimal —
    `node:fetch` and `console` are already available in-process.)

## Components

| Component | Location | Responsibility |
|---|---|---|
| **Tool host** | `tool-host/` → bundled to `tool-host.mjs` | Standalone `@modelcontextprotocol/sdk` stdio server. Reads tools dir from env, `import()`s each script, registers `manifest` as an MCP tool, routes `CallToolRequest` → `handler`. Watches its dir; emits `tools/list_changed`. **No plugin imports** — clean process boundary. |
| **`ToolHostConfig`** | plugin (Claude side) | Builds the stdio `McpServerConfig` (`command: <node>`, `args: [hostEntrypoint, …]`, curated `env` with tools dir + vault path + declared secrets). Injected into Claude `mcpServers` at the `ClaudeQueryOptionsBuilder` seam the 1.13 design used (now pointing at the real host). |
| **`ToolDiscovery`** | plugin | Scans `.specorator/tools/` for the settings list and load-error surfacing; backed by `vault.on('modify')`. |
| **Settings section** | Claude settings, near existing MCP UI | Opt-in toggle (+ Node-availability check), discovered-tool list with per-tool enable/disable and error badges, trust-posture notice. |

## Data flow (one turn)

1. Feature enabled **and** ≥1 tool exists → `ToolHostConfig` emits the host stdio
   config into Claude's `mcpServers`.
2. Claude SDK spawns `node tool-host.mjs` (curated env).
3. Host scans the tools dir, `import()`s each `.mjs`, registers each `manifest`.
4. Model invokes `mcp__specorator__word_count`.
5. Host runs that script's `handler` in-process; returns an MCP result (or
   auto-wrapped string).
6. Result streams back as a normal MCP tool result.
7. Per-tool disable reuses the existing `disabledTools` → `disallowedTools`
   plumbing in `McpServerManager`.

## Storage & config

| Path | Contents |
|---|---|
| `.specorator/tools/*.mjs` | User tool scripts (new). |
| settings store | Opt-in enable flag + per-tool disabled state. |

- **Secrets:** `manifest.secrets` lists SecretStorage-backed ids; the plugin
  resolves them and passes the values into the host's curated env, exposed to
  handlers via `ctx.secrets`. Reuses the existing `secretEnv` mechanism —
  secret values never land in the script file.

## Error handling & lifecycle

- **Lazy start** — host spawns only when enabled *and* a tool exists; no idle
  process otherwise.
- **Per-script isolation** — an import/parse failure registers nothing for that
  file and shows an error badge in settings; other tools and the host stay up.
- **Handler faults** — every `handler` call is wrapped in `try/catch` + a
  timeout; a throw or timeout returns `{ isError: true }` to the model rather
  than crashing the host (an uncaught throw must never stop the agent loop).
- **Hot reload** — the host watches its dir and emits MCP `tools/list_changed`;
  the settings list refreshes via `vault.on('modify')`. Editing a script
  re-registers it without an app restart.
- **Node missing** — the enable toggle checks Node availability (reusing CLI
  resolution); if absent, the feature stays off with a clear message.

## Trust posture

Full-trust execution: a user tool can do anything `node` can (filesystem,
network). This matches the Obsidian norm (Dataview, Templater, QuickAdd, JS
Engine) and is stated plainly in the settings UI and docs. Mitigations:
- **Opt-in** — off by default.
- **Curated env** — host spawns with `curateStdioMcpEnv`, so host credentials
  (cloud tokens, provider keys) do not leak into the child; only declared
  secrets are passed.
- **Per-handler `try/catch` + timeout.**

Web Worker / iframe isolation is explicitly deferred; the process boundary plus
curated env is the v1 containment story, documented honestly rather than
overclaimed.

## Testing

**Host (unit):**
- Discovery of `.mjs` files; manifest → tool registration.
- String return auto-wrapped; object return passed through.
- `inputSchema` passthrough to the registered tool.
- Per-script error isolation (one bad file doesn't sink the host).
- Handler throw / timeout → `{ isError: true }`.

**Plugin (unit):**
- `ToolHostConfig` emission: command, args, curated env, declared secrets.
- Node-missing path keeps the feature off with a message.
- `ToolDiscovery` list state + reload on `vault.on('modify')`.

**Integration:**
- Host config lands in Claude `mcpServers` when enabled + tool present.
- Disabled tool → `disallowedTools`.

## Open questions for the implementation plan

1. **Node resolution** — reuse Claude's `customSpawn` node-path resolution, or a
   dedicated resolver? (The host is spawned by the Claude SDK from the stdio
   config, so node-path resolution must be baked into `command`.)
2. **Host bundling** — confirm the esbuild config can emit a second entrypoint
   (`tool-host.mjs`) bundling `@modelcontextprotocol/sdk` without bloating
   `main.js`.
3. **Secret env scoping** — v1 passes declared secrets as host-process env
   (process-wide). Acceptable for a single-host model; revisit if per-tool secret
   isolation is needed.
</content>
</invoke>
