/**
 * T-MC-014 (RED) — scriptable Mock `McpClientPort` (SPEC-MC-010, ADR-MC-002 §1).
 *
 * The scriptable client the tester + manager tests inject instead of a real transport:
 *   - `isAvailable() → true` (a Node-capable bridge);
 *   - `scriptTestResult(serverName, result)` queues a canned `McpTestResult` per server
 *     name (highest precedence — drives the success-with-tools / partial cases);
 *   - `setClientMode('success' | 'partial' | 'timeout' | 'error' | 'unavailable')`
 *     drives `test` to return the matching `McpTestResult` (the full SPEC-MC-028 matrix,
 *     TEST-MC-030..034) without a real transport;
 *   - `connect`/`listTools`/`callTool`/`disconnect` return canned `Result`s;
 *   - total — `test` never throws (NFR-MC-006).
 * Exposed on `MockBridge` via a `get mcpClient` accessor.
 *
 * Fails until T-MC-015 supplies `@/infrastructure/mock/MockMcpClient` +
 * `MockBridge.mcpClient`.
 *
 * Traces: TEST-MC-030/031/032/033/034 (Mock backing), TEST-MC-080, SPEC-MC-010/028,
 * REQ-MC-004/030..033/080, NFR-MC-006.
 */
import { describe, it, expect } from 'vitest';
import { MockMcpClient } from '@/infrastructure/mock/MockMcpClient';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { McpClientPort } from '@/domain/ports';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';

function server(name = 'srv'): ManagedMcpServer {
	return {
		name,
		config: { command: 'node', args: ['x.js'] },
		enabled: true,
		contextSaving: true,
	};
}

describe('MockMcpClient (TEST-MC-030..034 Mock backing, SPEC-MC-028 matrix)', () => {
	it('is an McpClientPort with the six verbs', () => {
		const client: McpClientPort = new MockMcpClient();
		expect(typeof client.isAvailable).toBe('function');
		expect(typeof client.test).toBe('function');
		expect(typeof client.connect).toBe('function');
		expect(typeof client.listTools).toBe('function');
		expect(typeof client.callTool).toBe('function');
		expect(typeof client.disconnect).toBe('function');
	});

	it('isAvailable is true (a Node-capable bridge)', () => {
		expect(new MockMcpClient().isAvailable()).toBe(true);
	});

	it("setClientMode('success') → test resolves success with tools (TEST-MC-030)", async () => {
		const client = new MockMcpClient();
		client.setClientMode('success');
		const res = await client.test(server());
		expect(res.success).toBe(true);
		expect(res.tools.length).toBeGreaterThan(0);
	});

	it("setClientMode('partial') → connect-ok+list-fail = success with empty tools (TEST-MC-032)", async () => {
		const client = new MockMcpClient();
		client.setClientMode('partial');
		const res = await client.test(server());
		expect(res.success).toBe(true);
		expect(res.tools).toEqual([]);
	});

	it("setClientMode('timeout') → success:false + 'Connection timeout (10s)' (TEST-MC-031)", async () => {
		const client = new MockMcpClient();
		client.setClientMode('timeout');
		const res = await client.test(server());
		expect(res.success).toBe(false);
		expect(res.error).toBe('Connection timeout (10s)');
		expect(res.tools).toEqual([]);
	});

	it("setClientMode('error') → success:false with a friendly error (TEST-MC-033)", async () => {
		const client = new MockMcpClient();
		client.setClientMode('error');
		const res = await client.test(server());
		expect(res.success).toBe(false);
		expect(typeof res.error).toBe('string');
		expect(res.error).toBeTruthy();
	});

	it("setClientMode('unavailable') → success:false unavailable (TEST-MC-034)", async () => {
		const client = new MockMcpClient();
		client.setClientMode('unavailable');
		const res = await client.test(server());
		expect(res.success).toBe(false);
		expect(res.tools).toEqual([]);
	});

	it('scriptTestResult queues a per-server canned result that overrides the mode', async () => {
		const client = new MockMcpClient();
		client.setClientMode('error');
		client.scriptTestResult('srv', {
			success: true,
			serverName: 'srv',
			serverVersion: '9.9',
			tools: [{ name: 'do-thing' }],
		});
		const res = await client.test(server('srv'));
		expect(res.success).toBe(true);
		expect(res.serverVersion).toBe('9.9');
		expect(res.tools.map((t) => t.name)).toEqual(['do-thing']);
	});

	it('connect/listTools/callTool/disconnect return canned Results', async () => {
		const client = new MockMcpClient();
		const conn = await client.connect(server());
		expect(conn.ok).toBe(true);
		if (!conn.ok) return;
		const tools = await client.listTools(conn.value);
		expect(tools.ok).toBe(true);
		const called = await client.callTool(conn.value, 'do-thing', {});
		expect(called.ok).toBe(true);
		const closed = await client.disconnect(conn.value);
		expect(closed.ok).toBe(true);
	});

	it('test never throws (total) for any mode', async () => {
		const client = new MockMcpClient();
		for (const mode of ['success', 'partial', 'timeout', 'error', 'unavailable'] as const) {
			client.setClientMode(mode);
			await expect(client.test(server())).resolves.toBeDefined();
		}
	});
});

describe('MockBridge.mcpClient (TEST-MC-030..034 Mock backing)', () => {
	it('exposes a scriptable McpClientPort via the mcpClient accessor', async () => {
		const bridge = new MockBridge();
		expect(bridge.mcpClient.isAvailable()).toBe(true);
		bridge.mcpClient.setClientMode('success');
		const res = await bridge.mcpClient.test(server());
		expect(res.success).toBe(true);
	});

	it('returns the same stable instance across reads (the bridge IS the port)', () => {
		const bridge = new MockBridge();
		expect(bridge.mcpClient).toBe(bridge.mcpClient);
	});
});
