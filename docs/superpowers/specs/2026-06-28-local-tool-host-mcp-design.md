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

**The host ships inside `main.js`, not as a separate file.** Obsidian's
community-plugin installer only ever downloads `main.js`, `manifest.json`, and
`styles.css` from a release — any extra artifact (a standalone `tool-host.mjs`)
would never reach marketplace-installed users. So the host bundle is **baked into
`main.js` as embedded source** and **materialized to `<pluginDir>/tool-host.mjs`
on plugin load** (overwritten each load so it tracks the installed version),
then spawned by `node`. The materialized file is *our* reviewed code emitted from
the shipped bundle, not fetched remotely.

> **Flagged risk to verify before marketplace submission:** confirm the review
> bot does not object to (a) dynamic `import()` of user scripts inside the
> materialized host, or (b) writing the embedded host source to disk and spawning
> it. The prior Error was specifically the `Function` constructor in the renderer;
> neither of these is `Function`/`eval` in the renderer, and the host source is
> bundled (not remote) — but this must be checked, not assumed.

## Scope

**In scope (v1):**
- A stdio MCP server ("tool host") **bundled into `main.js`** as embedded source
  and materialized to `<pluginDir>/tool-host.mjs` at runtime (no extra release
  artifact — Obsidian ships only `main.js`/`manifest.json`/`styles.css`).
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
  ctx.logger.info('counted words', { n });          // surfaced to user (see ctx.logger)
  await ctx.vault.write('Reports/word-count.md', `Words: ${n}\n`);  // path-safe vault write
  return String(n);          // string → auto-wrapped into MCP result
  // or return { content: [{ type: 'text', text: '...' }] } for full control
}
```

**Contract rules:**
- `manifest.name` — the tool name; exposed as `mcp__specorator-tools__<name>`.
- `manifest.description` — shown to the model.
- `manifest.inputSchema` — a **plain JSON Schema** object, passed straight to MCP
  as the tool's input schema. No zod dependency in the host.
- `manifest.secrets?` — optional array of SecretStorage-backed secret ids the
  tool needs; resolved by the plugin and surfaced via `ctx.secrets`.
- `handler(input, ctx)` — `async`. Returns either:
  - a **string** → host wraps it as `{ content: [{ type: 'text', text }] }`, or
  - a raw **MCP result object** (`{ content: [...], isError? }`) → passed through.
- `ctx`:
  - `ctx.vaultPath` — absolute path to the vault root.
  - `ctx.vault` — a **path-safe vault reader/writer** (resolves vault-relative
    paths against `ctx.vaultPath` and rejects any path that escapes the root):
    - `await ctx.vault.read(relPath)` → string
    - `await ctx.vault.write(relPath, content)` (creates parent dirs)
    - `await ctx.vault.exists(relPath)` → boolean
    - `await ctx.vault.list(relPath)` → string[]
    - It is **convenience + a traversal guard, not a security boundary** — raw
      `node:fs` is still available in-process (full-trust model). The guard exists
      so well-behaved scripts can't accidentally write outside the vault.
  - `ctx.logger` — `ctx.logger.info|warn|error(message, data?)`. Writes
    structured lines that are surfaced to the user: appended to a host log file
    `.specorator/tool-host.log` in the vault (user-inspectable) and mirrored to
    the host process stderr (visible when Specorator debug logging is on). Each
    line is tagged with the tool name.
  - `ctx.secrets` — resolved values for the ids declared in `manifest.secrets`.
  - (`globalThis.fetch` and `console` remain available in-process; `ctx` adds the
    vault/logger/secret surface the process boundary otherwise can't reach.)

## Components

| Component | Location | Responsibility |
|---|---|---|
| **Tool host** | `src/tool-host/` → esbuild'd to embedded source baked into `main.js` | Standalone `@modelcontextprotocol/sdk` stdio server. Reads tools dir from env, `import()`s each script, registers `manifest` as an MCP tool, routes `CallToolRequest` → `handler`. **No plugin imports** — clean process boundary. |
| **`ToolHostMaterializer`** | plugin (Claude side) | Writes the embedded host source to `<pluginDir>/tool-host.mjs` on plugin load / enable (overwrite to track the installed version); returns its absolute path. This is how the host reaches disk without being a separate release artifact. |
| **`ToolHostConfig`** | plugin (Claude side) | Builds the stdio `McpServerConfig` (`command: <node>`, `args: [materialized host path]`, curated `env` with tools dir + vault path + declared secrets). Injected into Claude `mcpServers` at the `ClaudeQueryOptionsBuilder` seam the 1.13 design used. |
| **`ToolDiscovery`** (catalog read) | plugin | Spawns the host in `--catalog` mode to list tools + load errors for the settings UI and the declared-secrets cache. Re-run explicitly (load / enable / settings-open / "Reload tools") — **not** `vault.on(...)`, which doesn't fire for dot-folders. |
| **Settings section** | Claude settings, near existing MCP UI | Opt-in toggle (+ Node-availability check), discovered-tool list with per-tool enable/disable and error badges, trust-posture notice. |

## Data flow (one turn)

0. On plugin load / enable, `ToolHostMaterializer` writes the embedded host source
   to `<pluginDir>/tool-host.mjs`.
1. Feature enabled **and** ≥1 tool exists → `ToolHostConfig` emits the host stdio
   config (pointing `node` at the materialized path) into Claude's `mcpServers`.
2. Claude SDK spawns `node <pluginDir>/tool-host.mjs` (curated env).
3. Host scans the tools dir, `import()`s each **non-disabled** `.mjs`, registers
   each `manifest`.
4. Model invokes `mcp__specorator-tools__word_count`.
5. Host runs that script's `handler` in-process; returns an MCP result (or
   auto-wrapped string).
6. Result streams back as a normal MCP tool result.
7. Per-tool disable is **keyed by filename** and enforced by **skipping the
   import in both modes** (serve *and* catalog): a disabled tool's top-level code
   never executes — no fs/network side effects, no secret access — anywhere.
   Disabled tools are shown in settings by filename only (they're never imported,
   so no name/description is available until re-enabled). Changing the disabled
   set changes the config env → the host re-spawns next turn.
8. **Secret scoping:** the host reads every `SPECORATOR_SECRET_*` into host-owned
   state and **deletes it from `process.env` before importing any tool**, so a
   tool module can't read another tool's secret off the environment. `ctx.secrets`
   exposes only the subset the calling tool declared in `manifest.secrets`.

## Storage & config

| Path | Contents |
|---|---|
| `.specorator/tools/*.mjs` | User tool scripts (new). |
| `.specorator/tool-host.log` | Host log file written by `ctx.logger` (new). |
| `<pluginDir>/tool-host.mjs` | Host runtime, materialized from the source baked into `main.js` on load (new; not a release artifact). |
| settings store | Opt-in enable flag + per-tool disabled state. |

- **Secrets:** `manifest.secrets` lists SecretStorage-backed ids; the plugin
  resolves them and passes the values into the host's curated env as transport.
  The host **scrubs `SPECORATOR_SECRET_*` from `process.env` into host-owned state
  before importing any tool**, then exposes only the calling tool's declared subset
  via `ctx.secrets`. Reuses the existing `secretEnv` mechanism — secret values
  never land in the script file, and no tool can read another tool's secret off
  the environment.

## Error handling & lifecycle

- **Lazy start** — host spawns only when enabled *and* a tool exists; no idle
  process otherwise.
- **Per-script isolation** — an import/parse failure registers nothing for that
  file and shows an error badge in settings; other tools and the host stay up.
- **Handler faults** — every `handler` call is wrapped in `try/catch` + a
  timeout; a throw or timeout returns `{ isError: true }` to the model rather
  than crashing the host (an uncaught throw must never stop the agent loop).
- **Refresh (no vault watcher)** — `.specorator/` is a dot-folder excluded from
  Obsidian's vault index, so `vault.on(...)` never fires for `.specorator/tools/`
  (documented in `src/features/quickActions/CLAUDE.md`). The tool list and
  declared-secrets cache are re-scanned **explicitly**: on plugin load, on enable,
  on settings-section open, and via a manual **"Reload tools"** button. A full
  re-scan covers create/delete/rename. The host re-scans its own dir on each
  spawn, so after a refresh the next turn picks up added/edited scripts — no app
  restart needed.
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
- `ctx.vault` read/write/exists/list resolve under the root; a traversal path
  (`../outside`, absolute path) is rejected.
- `ctx.logger` appends tool-tagged lines to `.specorator/tool-host.log` and
  mirrors to stderr.

**Plugin (unit):**
- `ToolHostConfig` emission: command, args, curated env, declared secrets.
- Node-missing path keeps the feature off with a message.
- Catalog read → settings list state + declared-secrets cache; explicit reload
  (no `vault.on` — dot-folder). Materializer writes the embedded host only when
  content differs.

**Integration:**
- Host config lands in Claude `mcpServers` when enabled + tool present.
- Disabled file → skipped import in **both** modes (never executes, never reads
  secrets); shown in settings by filename only.

## Open questions for the implementation plan

1. **Node resolution** — reuse Claude's `customSpawn` node-path resolution, or a
   dedicated resolver? (The host is spawned by the Claude SDK from the stdio
   config, so node-path resolution must be baked into `command`.)
2. **Host bundle size** — confirm baking the `@modelcontextprotocol/sdk`-bearing
   host bundle into `main.js` as text is an acceptable `main.js` size increase
   (vs. lazy-materializing from a compressed/base64 blob).
3. **Secret scoping vs. full trust** — secrets are scrubbed from `process.env` into
   host-owned state and scoped per-tool via `ctx.secrets`, which stops casual
   cross-tool env reads. A fully malicious tool still runs with full Node
   privileges (the documented trust model), so this is defense-in-depth, not a
   hard boundary. Worker/iframe isolation remains the deferred stronger option.
</content>
</invoke>
