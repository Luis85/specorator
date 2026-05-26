import type { McpClientPort, McpConnection } from '@/domain/ports';
import type { ManagedMcpServer, McpTestResult, McpTool } from '@/domain/chat/mcp/McpTypes';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** Friendly message for the unavailable browser-demo transport (REQ-MC-034). */
const UNAVAILABLE = 'MCP transports require the desktop app (not available in the browser demo).';

/**
 * Inert browser `McpClientPort` (SPEC-MC-011, ADR-MC-002) for the GitHub Pages demo:
 * there is no Node runtime, so no stdio/SSE/HTTP transport can run. `isAvailable()`
 * is `false`; `test` resolves a structured failure (never throws); the live methods
 * resolve `Result.err`. `disconnect` is the idempotent no-op `ok()`. No `obsidian`,
 * no `node:*`.
 */
export class LocalStorageMcpClient implements McpClientPort {
	isAvailable(): boolean {
		return false;
	}

	test(_server: ManagedMcpServer): Promise<McpTestResult> {
		return Promise.resolve({ success: false, tools: [], error: UNAVAILABLE });
	}

	connect(_server: ManagedMcpServer): Promise<Result<McpConnection>> {
		return Promise.resolve(err(new Error(UNAVAILABLE)));
	}

	listTools(_connection: McpConnection): Promise<Result<readonly McpTool[]>> {
		return Promise.resolve(err(new Error(UNAVAILABLE)));
	}

	callTool(
		_connection: McpConnection,
		_toolName: string,
		_input: Record<string, unknown>,
	): Promise<Result<unknown>> {
		return Promise.resolve(err(new Error(UNAVAILABLE)));
	}

	disconnect(_connection: McpConnection): Promise<Result<void>> {
		return Promise.resolve(ok(undefined));
	}
}
