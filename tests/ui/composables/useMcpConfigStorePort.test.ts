/**
 * T-MC-022 (RED) — `useMcpConfigStorePort()` inject-or-throw (TEST-MC-081
 * composable leg).
 *
 * SPEC-MC-019, REQ-MC-081, NFR-MC-005. Mirrors the `useApprovalRuleStorePort`/
 * `useVaultPort` inject-or-throw pattern (ADR-008 one-port-per-composable, no
 * aggregate): returns the injected `MCP_CONFIG_STORE_PORT` when provided, throws
 * a clear "was not provided" error when the host forgot to `app.provide` it.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useMcpConfigStorePort } from '@/ui/composables/useMcpConfigStorePort';
import { MCP_CONFIG_STORE_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { McpConfigStorePort } from '@/domain/ports';

function harness(onResolved: (port: McpConfigStorePort) => void) {
	return defineComponent({
		name: 'McpConfigStoreHarness',
		setup() {
			onResolved(useMcpConfigStorePort());
			return () => h('div');
		},
	});
}

describe('useMcpConfigStorePort (SPEC-MC-019, TEST-MC-081 composable leg)', () => {
	it('returns the provided McpConfigStorePort', () => {
		const port: McpConfigStorePort = new MockBridge().mcpConfigStore;
		let resolved: McpConfigStorePort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [MCP_CONFIG_STORE_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/McpConfigStorePort was not provided/);
	});
});
