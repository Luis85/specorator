import type { McpClientPort, McpConnection } from '@/domain/ports';
import type { ManagedMcpServer, McpTestResult, McpTool } from '@/domain/chat/mcp/McpTypes';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** The SPEC-MC-028 test-result mode the scriptable `test` returns. */
export type MockMcpClientMode = 'success' | 'partial' | 'timeout' | 'error' | 'unavailable';

/** Default canned tools for the `success` mode. */
const DEFAULT_TOOLS: readonly McpTool[] = [
	{ name: 'echo', description: 'Echo the input' },
	{ name: 'search', description: 'Search a corpus' },
];

/**
 * Scriptable `McpClientPort` (SPEC-MC-010, ADR-MC-002 §1) for unit tests + `npm run
 * dev`. Drives the full SPEC-MC-028 test-result matrix without a real transport:
 *
 *   - `isAvailable() → true` (a Node-capable bridge);
 *   - `scriptTestResult(serverName, result)` queues a canned `McpTestResult` per server
 *     name — highest precedence, so a test can pin an exact success-with-tools / partial
 *     shape (TEST-MC-030/032);
 *   - `setClientMode('success' | 'partial' | 'timeout' | 'error' | 'unavailable')`
 *     drives `test` to return the matching `McpTestResult` (TEST-MC-030..034);
 *   - `connect`/`listTools`/`callTool`/`disconnect` return canned `Result`s (the
 *     future-non-SDK / Mock-driven seam, off the P8 turn-time path).
 *
 * Total — `test` never throws (NFR-MC-006). No `obsidian`, no `node:*`.
 */
export class MockMcpClient implements McpClientPort {
	private mode: MockMcpClientMode = 'success';
	private readonly scripted = new Map<string, McpTestResult>();
	private toolsByConnection = new Map<string, readonly McpTool[]>();
	private idSeq = 0;

	/** Test hook: queue a canned `McpTestResult` for a server name (overrides the mode). */
	scriptTestResult(serverName: string, result: McpTestResult): void {
		this.scripted.set(serverName, result);
	}

	/** Test hook: select the SPEC-MC-028 state `test` returns for an un-scripted server. */
	setClientMode(mode: MockMcpClientMode): void {
		this.mode = mode;
	}

	isAvailable(): boolean {
		return true;
	}

	test(server: ManagedMcpServer): Promise<McpTestResult> {
		const scripted = this.scripted.get(server.name);
		if (scripted !== undefined) return Promise.resolve(scripted);
		return Promise.resolve(MockMcpClient._forMode(this.mode, server.name));
	}

	connect(_server: ManagedMcpServer): Promise<Result<McpConnection>> {
		if (this.mode === 'unavailable') {
			return Promise.resolve(err(new Error('MCP transport unavailable')));
		}
		const id = `mock-mcp-conn-${(this.idSeq += 1)}`;
		this.toolsByConnection.set(id, DEFAULT_TOOLS);
		return Promise.resolve(ok({ id }));
	}

	listTools(connection: McpConnection): Promise<Result<readonly McpTool[]>> {
		const tools = this.toolsByConnection.get(connection.id);
		if (tools === undefined) return Promise.resolve(err(new Error('MCP connection not found')));
		return Promise.resolve(ok(tools));
	}

	callTool(
		connection: McpConnection,
		toolName: string,
		_input: Record<string, unknown>,
	): Promise<Result<unknown>> {
		if (!this.toolsByConnection.has(connection.id)) {
			return Promise.resolve(err(new Error('MCP connection not found')));
		}
		return Promise.resolve(ok({ tool: toolName, content: `mock result for ${toolName}` }));
	}

	disconnect(connection: McpConnection): Promise<Result<void>> {
		this.toolsByConnection.delete(connection.id);
		return Promise.resolve(ok(undefined));
	}

	/** Map a mode → the canned `McpTestResult` (the SPEC-MC-028 matrix). */
	private static _forMode(mode: MockMcpClientMode, serverName: string): McpTestResult {
		switch (mode) {
			case 'success':
				return {
					success: true,
					serverName,
					serverVersion: '1.0.0',
					tools: [...DEFAULT_TOOLS],
				};
			case 'partial':
				return { success: true, serverName, serverVersion: '1.0.0', tools: [] };
			case 'timeout':
				return { success: false, tools: [], error: 'Connection timeout (10s)' };
			case 'unavailable':
				return { success: false, tools: [], error: 'MCP transport unavailable' };
			case 'error':
			default:
				return { success: false, tools: [], error: 'Connection refused' };
		}
	}
}
