/**
 * The MCP client / transport port (P8, SPEC-MC-008, ADR-MC-002 §1). One narrow port
 * for one consumer kind (the tester + the future non-SDK / Mock-driven path); its
 * own `InjectionKey` + composable, no aggregate (ADR-008). `test` returns a
 * structured `McpTestResult` and **never throws** (the whole body is guarded); the
 * live methods are `Result`-typed (ADR-004). The real SDK stdio/SSE/HTTP transports
 * live in coverage-excluded `src/infrastructure/obsidian/**` (SPEC-MC-009); the Mock
 * is scriptable, the LocalStorage bridge is inert. No class, no `obsidian`, no
 * `node:*` in this declaration.
 */
import type { Result } from '@/domain/shared/Result';
import type { ManagedMcpServer, McpTestResult, McpTool } from '@/domain/chat/mcp/McpTypes';

/** An opaque handle to a live MCP client connection (the SDK Client, hidden behind the port). */
export interface McpConnection {
	readonly id: string;
}

export interface McpClientPort {
	/**
	 * Whether this bridge can run MCP transports (a Node runtime). Obsidian/Mock →
	 * `true`; LocalStorage → `false` (REQ-MC-034). Synchronous + total.
	 */
	isAvailable(): boolean;
	/**
	 * Build the transport for `getMcpServerType(server.config)`, connect with a 10s
	 * `AbortController`, list tools, close (REQ-MC-030..034; SPEC-MC-028):
	 * connect-ok+list-ok → `{ success:true, serverName?, serverVersion?, tools }`;
	 * connect-ok+list-fail → `{ success:true, tools:[] }` (partial, REQ-MC-032);
	 * construct-fail → `{ success:false, tools:[], error:'Missing command' |
	 * 'Invalid server configuration' }` (REQ-MC-023); 10s abort → `{ success:false,
	 * tools:[], error:'Connection timeout (10s)' }` (REQ-MC-031); other failure →
	 * `{ success:false, tools:[], error:<message> }` (REQ-MC-033); `!isAvailable()` →
	 * `{ success:false, tools:[], error:<unavailable> }` (REQ-MC-034). NEVER throws.
	 */
	test(server: ManagedMcpServer): Promise<McpTestResult>;
	/**
	 * Open + retain a connection (the seam for a future non-SDK / Mock-driven path;
	 * OFF the P8 turn-time critical path — the SDK calls tools from the advertised
	 * set). A construct/connect failure ⇒ `err`. The caller must `disconnect`.
	 */
	connect(server: ManagedMcpServer): Promise<Result<McpConnection>>;
	/** List tools on an open connection → `ok(tools)` or `err`. No side effects. */
	listTools(connection: McpConnection): Promise<Result<readonly McpTool[]>>;
	/**
	 * Invoke a tool on an open connection → `ok(result)` or `err`. NOT used at turn
	 * time in P8 (the SDK calls it from the advertised set). The tool's side effects.
	 */
	callTool(
		connection: McpConnection,
		toolName: string,
		input: Record<string, unknown>,
	): Promise<Result<unknown>>;
	/** Close a connection. Idempotent — a missing/closed connection is a no-op `ok()`. */
	disconnect(connection: McpConnection): Promise<Result<void>>;
}
