/**
 * T-MC-022 (RED) — `useMcpClientPort()` inject-or-throw (TEST-MC-081 composable
 * leg).
 *
 * SPEC-MC-019, REQ-MC-081, NFR-MC-005. Mirrors the `useApprovalRuleStorePort`/
 * `useVaultPort` inject-or-throw pattern (ADR-008 one-port-per-composable, no
 * aggregate): returns the injected `MCP_CLIENT_PORT` when provided, throws a
 * clear "was not provided" error when the host forgot to `app.provide` it.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useMcpClientPort } from '@/ui/composables/useMcpClientPort';
import { MCP_CLIENT_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { McpClientPort } from '@/domain/ports';

function harness(onResolved: (port: McpClientPort) => void) {
	return defineComponent({
		name: 'McpClientHarness',
		setup() {
			onResolved(useMcpClientPort());
			return () => h('div');
		},
	});
}

describe('useMcpClientPort (SPEC-MC-019, TEST-MC-081 composable leg)', () => {
	it('returns the provided McpClientPort', () => {
		const port: McpClientPort = new MockBridge().mcpClient;
		let resolved: McpClientPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [MCP_CLIENT_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/McpClientPort was not provided/);
	});
});
