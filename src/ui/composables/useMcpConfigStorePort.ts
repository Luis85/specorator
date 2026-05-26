import { inject } from 'vue';
import type { McpConfigStorePort } from '@/domain/ports';
import { MCP_CONFIG_STORE_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the MCP config store port (SPEC-MC-019, P8). Mirrors the
 * `useApprovalRuleStorePort`/`useVaultPort` inject-or-throw pattern (ADR-008
 * one-port-per-composable, no aggregate, REQ-MC-081). Throws a clear "was not
 * provided" error when the host forgot to `app.provide` it.
 *
 * The MCP surface injects this OPTIONALLY (`inject(MCP_CONFIG_STORE_PORT,
 * undefined)`) so a mount without it degrades to the P6 empty seam; this strict
 * composable exists for any consumer that requires the port.
 */
export function useMcpConfigStorePort(): McpConfigStorePort {
	const port = inject(MCP_CONFIG_STORE_PORT);
	if (!port) {
		throw new Error(
			'McpConfigStorePort was not provided. Call app.provide(MCP_CONFIG_STORE_PORT, port) before mounting the app.',
		);
	}
	return port;
}
