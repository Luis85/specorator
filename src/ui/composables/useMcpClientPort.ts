import { inject } from 'vue';
import type { McpClientPort } from '@/domain/ports';
import { MCP_CLIENT_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the MCP client / transport port (SPEC-MC-019, P8). Mirrors the
 * `useApprovalRuleStorePort`/`useVaultPort` inject-or-throw pattern (ADR-008
 * one-port-per-composable, no aggregate, REQ-MC-081). Throws a clear "was not
 * provided" error when the host forgot to `app.provide` it.
 *
 * The MCP surface injects this OPTIONALLY (`inject(MCP_CLIENT_PORT, undefined)`)
 * so a mount without it degrades to the P6 empty seam; this strict composable
 * exists for any consumer that requires the port.
 */
export function useMcpClientPort(): McpClientPort {
	const port = inject(MCP_CLIENT_PORT);
	if (!port) {
		throw new Error(
			'McpClientPort was not provided. Call app.provide(MCP_CLIENT_PORT, port) before mounting the app.',
		);
	}
	return port;
}
