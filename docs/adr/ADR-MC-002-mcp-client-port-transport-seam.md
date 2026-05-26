---
id: ADR-MC-002
title: Expose the MCP transport behind a narrow McpClientPort; real stdio/SSE/HTTP transports live in coverage-excluded Obsidian infra over an externalized @modelcontextprotocol/sdk
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-26
accepted: 2026-05-26    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - planner
  - dev
  - qa
  - ux-ui-designer
supersedes: []
superseded-by: []
tags: [architecture, mcp, transport, ports, security, dependency, claudian-reboot, P8]
---

# ADR-MC-002 — `McpClientPort` transport seam + coverage-excluded SDK transports + the externalized dependency

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-26): architect files, PM
accepts, human defers to one final epic-review gate. Ratifies **CLAR-MC-003** (bundle
`@modelcontextprotocol/sdk`, externalize it, record the rationale) and the partial-tester /
desktop-only posture (CLAR-MC-004 secret half handled by ADR-MC-001). Unblocks `PRD-MC-001`
(REQ-MC-020..023, REQ-MC-030..034, REQ-MC-061..064, REQ-MC-080/081).

## Context

P8 must connect to MCP servers over three transports — **stdio** (a local subprocess), **SSE**, and
**HTTP** — and probe them (connect → list tools → success/error). Claudian's `McpTester`
(`core/mcp/McpTester.ts`) does this with `@modelcontextprotocol/sdk` (`Client`,
`StdioClientTransport`, `StreamableHTTPClientTransport`, the legacy `SSEClientTransport`), a 10-second
`AbortController` timeout, partial-success semantics (connect-ok but `listTools`-fails → success +
empty tools), and a Node `http`/`https`-backed `fetch` to bypass the Electron renderer's CORS while
keeping the SDK transports for protocol semantics.

Three forces:

1. **The SDK + the transports are Node-oriented.** `StdioClientTransport` spawns a subprocess;
   `createNodeFetch` uses `node:http`/`node:https`. None of that runs in the standalone browser build.
   This is exactly the `@codemirror/*` / `@anthropic-ai/claude-agent-sdk` precedent: a Node-oriented
   externalized dep that the plugin build externalizes (`vite.config.ts` `OBSIDIAN_EXTERNALS` +
   `builtinModules`) and the standalone build must NOT bundle (the standalone build sets no `external`,
   so any `node:*` import reaching it breaks `build:web`).
2. **stdio is a security surface** (REQ-MC-061). Spawning a configured command is the same class of
   surface as the P4 `ShellExecPort` — it must be bounded + explicit (parsed `cmd`+`args`, merged
   explicit `env`, enhanced `PATH`, `stderr` suppressed), never a shell-eval of user input.
3. **The narrow-port + 3-bridge + coverage discipline** (ADR-008, REQ-MC-080/081, NFR-MC-006): the
   real transports must live in `src/infrastructure/obsidian/**` (coverage-excluded), with the Mock
   bridge scriptable and the LocalStorage bridge inert, so the automated suite carries the logic and
   the real-transport legs are manual.

## Decision

### 1. `McpClientPort` — a narrow transport seam (connect / listTools / callTool / disconnect / test)

```ts
// src/domain/ports/McpClientPort.ts — new (ADR-008, one consumer = the MCP use cases / runtime)
export interface McpClientPort {
  /** Whether this bridge can actually connect (Node present). false on the browser bridge (REQ-MC-034). */
  isAvailable(): boolean;
  /** Probe a server: connect → list tools → structured result. 10s timeout, partial-success, never throws (REQ-MC-030..034). */
  test(server: ManagedMcpServer): Promise<McpTestResult>;
  /** Open a connection for a turn (stdio/SSE/HTTP); returns a handle or a structured error (REQ-MC-020..023). */
  connect(server: ManagedMcpServer): Promise<Result<McpConnection>>;
  /** List a live connection's tools (REQ-MC-030). */
  listTools(connection: McpConnection): Promise<Result<readonly McpTool[]>>;
  /** Invoke a tool on a live connection (the call the P7 gate guards, REQ-MC-065). */
  callTool(connection: McpConnection, toolName: string, input: unknown): Promise<Result<McpToolResult>>;
  /** Close a live connection (REQ-MC-071, never throws). */
  disconnect(connection: McpConnection): Promise<void>;
}
```

`McpTestResult` = `{ success, serverName?, serverVersion?, tools: McpTool[], error? }` (mirrors
Claudian). `test` NEVER throws — a construct failure, a 10s timeout, or a connection error each return
a structured `{ success:false, … }` (REQ-MC-023/031/033); a connect-ok-but-list-fails returns
`{ success:true, tools:[] }` (REQ-MC-032). `connect`/`listTools`/`callTool` are `Result`-typed for the
turn path. Its own `InjectionKey` (`MCP_CLIENT_PORT`) + composable (`useMcpClientPort`); one consumer,
no aggregate (ADR-008, REQ-MC-081).

### 2. The real transports live in coverage-excluded Obsidian infra (REQ-MC-080)

The real `McpClientPort` implementation lives in `src/infrastructure/obsidian/**` (already
coverage-excluded), wrapping `@modelcontextprotocol/sdk`:

- **stdio** — `StdioClientTransport` with the bounded, explicit spawn (REQ-MC-061): the parsed
  `cmd`+`args` (the pure `parseCommand`/`splitCommandString` regrow in domain — no shell), env
  `{ ...process.env, ...config.env, PATH: enhancedPath }`, `stderr: 'ignore'`. No `shell:true`, no
  string-eval of user input — the same posture as `ShellExecPort` (NFR-MC-002).
- **SSE** — the SDK's legacy `SSEClientTransport`, **HTTP** — `StreamableHTTPClientTransport`, both over
  a Node `http`/`https` `fetch` (the `createNodeFetch` shim) to bypass renderer CORS without disabling
  TLS verification (REQ-MC-064), honouring the 10s abort signal (REQ-MC-031).

The pure, Node-free pieces regrow in **domain** (the `parseCommand` command-split, `getMcpServerType`,
`isValidMcpServerConfig`) so they carry automated coverage; only the SDK + Node transport construction
stays in the coverage-excluded bridge (manual leg TEST-MC-M1).

### 3. The SDK is bundled (plugin) + externalized; the standalone build never sees it (CLAR-MC-003)

`@modelcontextprotocol/sdk` is added as a new **runtime dependency**, bundled into the plugin
`main.js` like `@anthropic-ai/claude-agent-sdk`. Its Node-only entry points (`node:http`/`https`, the
subprocess transport) are covered by the existing plugin-build externals (`builtinModules` +
`node:` forms in `vite.config.ts` `ALL_EXTERNALS`). The **standalone/`build:web` build must never
import it**: the real port lives only in `src/infrastructure/obsidian/**`, which the standalone entry
(`src/ui/main.ts` → `MockBridge`) never imports — so `build:web` (which sets no `external`) never sees
a `node:*` import. If a future build surface reaches the SDK from the standalone path, the SDK is added
to a standalone-side externals/stub list; for P8 the architectural rule (real port only in
`obsidian/**`) is sufficient. Per **AGENTS.md §8**, the dependency rationale (it is the only sanctioned
MCP client/transport implementation; MIT-licensed; actively maintained by Anthropic; no in-tree
alternative) is recorded in the implementing PR description.

### 4. The three-bridge story

- **`ObsidianBridge`** — the real SDK transports (above), coverage-excluded; `isAvailable() → true`.
- **`MockBridge`** — **scriptable**: a canned tool list / test result / `callTool` result per server
  name, plus failure / timeout / partial-success injection, so the manager + UI tests run without
  Node; `isAvailable() → true` (it simulates a Node-capable host).
- **`LocalStorageBridge`** — **inert**: `isAvailable() → false`; `test`/`connect` return the
  "MCP testing requires the desktop app" unavailable result without attempting a connection
  (REQ-MC-034, NFR-MC-012). Config management (ADR-MC-001) still works in the demo; only the live
  transport is unavailable.

`fake-ports.ts` grows an `mcpClient` member (the scriptable Mock client, with the failure/timeout/
partial switches) so the manager + selector + test-modal tests run without Obsidian.

## Considered options

### Option A — one `McpClientPort` (test+connect+listTools+callTool+disconnect) in coverage-excluded infra over the externalized SDK *(chosen)*
- Pros: one narrow seam covers both the tester and the turn-time tool calls; the real transports +
  the Node-only dep stay in coverage-excluded `obsidian/**` (NFR-MC-006); Mock scriptable + LS inert
  carry the automated weight; the standalone build never sees `node:*`; stdio spawn bounded like
  `ShellExecPort`.
- Cons: a single port spans probe + live-call surfaces — acceptable (both are "talk to an MCP server
  over a transport"); the bridge is larger but it is coverage-excluded by design.

### Option B — two ports: an `McpTesterPort` (probe) + an `McpClientPort` (live calls)
- Pros: the tester is a pure-ish one-shot; the live client is stateful.
- Cons: both wrap the same SDK transports and share the same construction + security posture; a second
  port + InjectionKey + composable + three-bridge impl for one consumer kind is churn ADR-008 warns
  against (no port before its consumer earns it). Rejected — one port, both verbs.

### Option C — reuse the P4 `ShellExecPort` for stdio
- Pros: one shell surface.
- Cons: `ShellExecPort` runs a one-shot command and returns its output; MCP stdio is a *long-lived
  framed protocol* over the subprocess's stdio, driven by the SDK client. Different lifecycle.
  Rejected; stdio MCP gets its own bounded spawn inside `McpClientPort`, sharing the security posture
  (bounded/explicit/no-shell-eval) but not the port.

## Consequences

### Positive
- Each transport (stdio/SSE/HTTP) connects + tests with the Claudian success/error/timeout/partial
  semantics (REQ-MC-020..023/030..034); the chat never crashes on a bad server (REQ-MC-071).
- The Node-only SDK + transports stay in coverage-excluded `obsidian/**`; the automated suite runs on
  the scriptable Mock; `build:web` stays green (no `node:*` reaches it).
- stdio spawns are bounded + explicit — the same hardened posture as `ShellExecPort` (NFR-MC-002).

### Negative
- A new runtime dependency (`@modelcontextprotocol/sdk`) enlarges the plugin bundle — justified
  (the only sanctioned MCP client) and rationale-recorded per AGENTS.md §8.
- The real-transport legs are manual (coverage-excluded) — accepted: they accumulate for the single
  final epic review gate (autonomous-drive directive); the Mock carries the automated coverage.

### Neutral
- `manifest.json` identity is untouched (`minAppVersion 1.12.7`); the SDK is a build/runtime concern,
  not a manifest one (NFR-MC-010).

## Compliance

- A test asserts `McpClientPort.test` returns structured `{ success:false, error }` for a construct
  failure / a 10s timeout / a connection error and `{ success:true, tools:[] }` for a connect-ok-but-
  list-fails — never throwing (REQ-MC-023/031/032/033), driven by the scriptable Mock.
- A test asserts the LocalStorage bridge reports `isAvailable() === false` and returns the unavailable
  result without a connection attempt (REQ-MC-034).
- A coverage-config check confirms `src/infrastructure/obsidian/**` (incl. the real MCP transport) is
  excluded; the suite meets 80/70/80/80 on the Mock-driven legs (REQ-MC-080, NFR-MC-006).
- A `build:web` run confirms no `node:*`/SDK import reaches the standalone bundle; ESLint confirms no
  Vue component imports `obsidian`/`node:*` (REQ-MC-081). The PR records the dependency rationale
  (AGENTS.md §8).
- A review check confirms the stdio spawn is the parsed `cmd`+`args` with merged explicit env +
  `stderr:'ignore'`, no `shell:true`, no string-eval (REQ-MC-061, NFR-MC-002).

## References

- PRD-MC-001 — REQ-MC-020..023/030..034/061..064/080/081; CLAR-MC-003; NFR-MC-002/006/010/012.
- `specs/mcp-client/design.md` Part C (C.2/C.4/C.6/C.8).
- **ADR-MC-001** (the config this transport connects), **ADR-MC-003** (the runtime/approval
  composition), ADR-CP-002 (the `ShellExecPort` security posture this mirrors), ADR-008 (narrow ports,
  one per consumer), ADR-004 (`Result`). `vite.config.ts` `ALL_EXTERNALS` (the externalize precedent).
  AGENTS.md §8 (runtime-dependency rationale).
- Claudian reference: `core/mcp/McpTester.ts` (the SDK transports + `createNodeFetch` + 10s timeout +
  partial-success), `utils/mcp.ts` `parseCommand`/`splitCommandString`, `utils/env.ts`
  `getEnhancedPath`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
