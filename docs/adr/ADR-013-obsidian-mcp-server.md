---
id: ADR-013
title: Native Obsidian MCP server with proposal-queued writes
status: accepted
date: 2026-05-10
references:
  - src/domain/ports/obsidian-mcp-server-port.ts
  - src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
  - src/infrastructure/obsidian/ProposalStore.ts
  - src/core/plugin-core.ts
---

# ADR-013 — Native Obsidian MCP server with proposal-queued writes

## Decision

The plugin runs a Model Context Protocol (MCP) server in-process inside Obsidian, exposing the vault as a typed agent tool surface. The contract lives in `ObsidianMcpServerPort` (`src/domain/ports/obsidian-mcp-server-port.ts`):

```ts
interface ObsidianMcpServerPort {
  start(): Promise<{ port: number }>
  stop(): Promise<void>
  getConnectionConfig(): McpConnectionConfig
}
```

Three commitments shape the implementation in `ObsidianMcpServerAdapter`:

1. **Loopback HTTP transport with a dynamic port.** A Node `http.Server` binds to `127.0.0.1:0` so the OS chooses a free port; the adapter rejects requests whose `Host` header is not `127.0.0.1` or `localhost` (HTTP 421). Each request is handled by a fresh `McpServer` from `@modelcontextprotocol/sdk` connected to a `StreamableHTTPServerTransport` with no session ID. `getConnectionConfig()` returns `{ transport: 'http', url: 'http://127.0.0.1:<port>/mcp' }` for the Claude CLI subprocess to consume.

2. **Tool registration is grouped, not scattered.** Six register-functions split tools into vault, workflow, metadata, links, canvas, and bases groups. Read tools wrap port methods directly; **write tools never mutate** — they call `proposalStore.queue(toolName, params, mutate)` and return `{ proposalId, status: 'pending' }`. The mutator closure is invoked only when the user accepts the proposal.

3. **`ProposalStore` is the write boundary.** A single in-memory map of pending proposals indexed by UUID. `queue` returns the ID synchronously; `accept(id)` flips status to `accepted` and runs the captured mutator (rolls back to `pending` on failure); `reject(id)` flips status to `rejected` and runs nothing. `getAll()` returns deep-cloned snapshots so UI code cannot mutate stored params. The chat-sidebar module reads pending proposals from the adapter via off-port methods (`acceptProposal`, `rejectProposal`, `getProposals`) — these methods exist on the concrete adapter, not on `ObsidianMcpServerPort`, by design.

`PluginCore` owns server start/stop (ADR-012). Modules **cannot** register MCP tools themselves; the tool surface is a fixed contract owned by the adapter, and module-level extensions go through events or off-port adapter methods.

## Rationale

- **Native (in-process) over external sidecar.** An MCP server that lives inside the plugin shares vault access through `VaultPort` and respects every narrow-port invariant — overwrite protection, vault-path normalisation, settings — without having to re-authenticate or re-implement the rules. An external sidecar would need its own auth boundary and copy of the same logic.
- **Loopback-only listener with a `Host`-header gate.** Binding to `127.0.0.1` is the OS-level seal. Checking the `Host` header rejects DNS-rebinding-style attempts where a remote attacker tricks a browser into sending a request to a local socket — the request body would be HTTP/1.1 valid but `Host` would not be `localhost`. Combined with dynamic port assignment (no scannable default), the attack surface is the local machine only.
- **Dynamic port, not a fixed one.** A fixed port would conflict with other MCP implementations on the same machine and create a guessable target. The port is published only through `getConnectionConfig()`, which the chat-sidebar reads when starting the Claude CLI subprocess.
- **Proposal queue, not direct vault writes.** v1 explicitly defers live agent runtime behind a review boundary (ADR-007). Agents propose, humans accept. Implementing this as a queue in front of every write tool keeps the contract uniform across vault, workflow, links, canvas, and bases tools — there is no "this tool is safe so we skip the queue" exception.
- **Per-request `McpServer` instance.** Each HTTP request constructs a new `McpServer` and `StreamableHTTPServerTransport`; this matches the transport's stateless-session model (`sessionIdGenerator: undefined`) and avoids leaking listener state across calls. The 35-tool registration cost per request is negligible compared to the round-trip.
- **Off-port accept/reject is intentional.** The chat-sidebar UI needs to read pending proposals and act on them; exposing those methods on `ObsidianMcpServerPort` would put UI-shaped methods on a port that an MCP client never calls. They live on the concrete adapter and are passed to the sidebar module via construction, not via the port interface.

## Consequences

- The plugin opens a localhost listener while loaded. The bind is loopback-only and the `Host` header gate is mandatory. The chosen port is not advertised anywhere outside the running plugin — the chat-sidebar reads it through `getConnectionConfig()`.
- **Every** write tool returns a proposal receipt, not a success/error. Callers must wait for human accept/reject. There is no "trusted tool" bypass.
- A pending proposal that the user closes Obsidian on is lost. Proposals are in-memory; they do not persist across reloads. v2 may persist them; v1 does not.
- Tool surface is closed to module-side registration. A module that needs a new agent-callable tool files an issue against the adapter; the registration goes in the appropriate `register*Tools` function. This keeps the audit story honest: every tool is visible in one place.
- The MCP server starts after all modules init and stops before they tear down. Tool calls that race the very start or end of the plugin lifecycle see "server not started" errors from `getConnectionConfig()`.
- Tools that depend on Obsidian-only APIs (`MetadataCachePort`, `CanvasPort`) work because those ports are real adapters in production and mocked in tests; the MCP server itself does not import `obsidian` directly.

## Alternatives considered

- **stdio transport (subprocess pipes).** Rejected: Obsidian is the parent process; spawning a child to host the MCP server reverses the natural dependency direction, complicates lifecycle (who restarts whom), and breaks vault access without a serialisation layer between processes.
- **WebSocket transport.** Rejected: HTTP+SSE via `StreamableHTTPServerTransport` is the documented transport for `@modelcontextprotocol/sdk` and matches the Claude CLI's expectations without bespoke framing.
- **Direct vault writes from MCP write tools.** Rejected per ADR-007 — agent acceptance must be a human governance event in v1. The proposal queue is the implementation of that decision.
- **Static well-known port (e.g., 7777).** Rejected: collisions with other MCP servers and a stable scan target. Dynamic port + loopback-only is strictly better.
- **Letting modules register tools.** Rejected: agent capability surface is a security-relevant contract. Centralising it in the adapter keeps the audit story tractable; the trade-off is module authors file an issue against the adapter when they need a new tool.

## Notes for downstream work

- The chat-sidebar module (#197/#198/#199) reads `getConnectionConfig()` on startup to point the Claude CLI subprocess at the running server, and registers a UI panel that lists pending proposals via `getProposals()`.
- v2 agentonomous orchestrator may persist proposals (durable queue), add a `proposal_status_changed` event, and expose proposal acceptance as an HTTP endpoint protected by a per-session token. The current in-memory store is the v1 floor.
- A future `tool_capabilities` MCP method will let clients introspect the registered tool surface; today the registration is visible only by reading `register*Tools` source.
