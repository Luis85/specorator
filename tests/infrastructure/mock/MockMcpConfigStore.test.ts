/**
 * T-MC-014 (RED) — scriptable Mock `McpConfigStorePort` (SPEC-MC-010, ADR-MC-001 §2).
 *
 * The scriptable in-memory document store the `McpServerManager` + settings + selector
 * tests inject instead of a real provider:
 *   - `seedMcpServers(servers)` pre-populates the managed list (drives the list /
 *     selector / active-set tests);
 *   - `load`/`save`/`exists` operate on an in-memory `.claude/mcp.json` document text
 *     **round-tripped through the same pure codec** (so default-pruning + CLI-key
 *     preservation are exercised), all `Promise<Result<…>>`;
 *   - `setMcpStoreFailMode('load' | 'save' | 'none')` forces `load`/`save` to
 *     `Result.err` so the save-fail notice (TEST-MC-072) + the malformed-load
 *     resilience run deterministically;
 *   - total — never throws across the boundary (NFR-MC-006).
 * Exposed on `MockBridge` via a `get mcpConfigStore` accessor mirroring `approvalRuleStore`.
 *
 * Fails until T-MC-015 supplies `@/infrastructure/mock/MockMcpConfigStore` +
 * `MockBridge.mcpConfigStore`.
 *
 * Traces: TEST-MC-001/002/007 (Mock backing), TEST-MC-072 (fail-inject), TEST-MC-080,
 * SPEC-MC-010, REQ-MC-002/007, NFR-MC-006.
 */
import { describe, it, expect } from 'vitest';
import { MockMcpConfigStore } from '@/infrastructure/mock/MockMcpConfigStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { McpConfigStorePort } from '@/domain/ports';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';

function server(name: string, overrides: Partial<ManagedMcpServer> = {}): ManagedMcpServer {
	return {
		name,
		config: { command: 'node', args: ['server.js'] },
		enabled: true,
		contextSaving: true,
		...overrides,
	};
}

describe('MockMcpConfigStore (TEST-MC-010 Mock backing)', () => {
	it('is an McpConfigStorePort with three Result-typed methods', () => {
		const store: McpConfigStorePort = new MockMcpConfigStore();
		expect(typeof store.load).toBe('function');
		expect(typeof store.save).toBe('function');
		expect(typeof store.exists).toBe('function');
	});

	it('load defaults to ok([]) on a fresh store (TEST-MC-002)', async () => {
		const store = new MockMcpConfigStore();
		const res = await store.load();
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.value).toEqual([]);
	});

	it('exists is false on a fresh store and true once saved', async () => {
		const store = new MockMcpConfigStore();
		const before = await store.exists();
		expect(before.ok).toBe(true);
		if (before.ok) expect(before.value).toBe(false);
		await store.save([server('a')]);
		const after = await store.exists();
		expect(after.ok).toBe(true);
		if (after.ok) expect(after.value).toBe(true);
	});

	it('seedMcpServers pre-populates the managed list that load returns (TEST-MC-001)', async () => {
		const store = new MockMcpConfigStore();
		store.seedMcpServers([server('alpha'), server('beta', { enabled: false })]);
		const res = await store.load();
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.value.map((s) => s.name)).toEqual(['alpha', 'beta']);
			expect(res.value.map((s) => s.enabled)).toEqual([true, false]);
		}
	});

	it('save → load round-trips through the pure codec, exercising default-pruning (TEST-MC-007)', async () => {
		const store = new MockMcpConfigStore();
		// `alpha` is all-default → no sidecar; `beta` carries non-default enabled:false.
		await store.save([server('alpha'), server('beta', { enabled: false })]);
		const res = await store.load();
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.value.map((s) => s.name)).toEqual(['alpha', 'beta']);
			expect(res.value.find((s) => s.name === 'beta')?.enabled).toBe(false);
			// default-valued metadata is re-applied on load (alpha stays enabled+contextSaving).
			const alpha = res.value.find((s) => s.name === 'alpha');
			expect(alpha?.enabled).toBe(true);
			expect(alpha?.contextSaving).toBe(true);
		}
	});

	it("setMcpStoreFailMode('load') forces load to Result.err (TEST-MC-072 driver)", async () => {
		const store = new MockMcpConfigStore();
		store.seedMcpServers([server('a')]);
		store.setMcpStoreFailMode('load');
		const res = await store.load();
		expect(res.ok).toBe(false);
	});

	it("setMcpStoreFailMode('save') forces save to Result.err (TEST-MC-072 save-fail notice)", async () => {
		const store = new MockMcpConfigStore();
		store.setMcpStoreFailMode('save');
		const res = await store.save([server('a')]);
		expect(res.ok).toBe(false);
	});

	it("setMcpStoreFailMode('none') restores ok behaviour", async () => {
		const store = new MockMcpConfigStore();
		store.setMcpStoreFailMode('save');
		store.setMcpStoreFailMode('none');
		const res = await store.save([server('a')]);
		expect(res.ok).toBe(true);
	});

	it('never throws across the boundary (total) — even after a forced fail mode', async () => {
		const store = new MockMcpConfigStore();
		store.setMcpStoreFailMode('save');
		await expect(store.save([server('a')])).resolves.toBeDefined();
		await expect(store.load()).resolves.toBeDefined();
	});
});

describe('MockBridge.mcpConfigStore (TEST-MC-010 Mock backing)', () => {
	it('exposes a scriptable McpConfigStorePort via the mcpConfigStore accessor', async () => {
		const bridge = new MockBridge();
		expect(typeof bridge.mcpConfigStore.load).toBe('function');
		bridge.mcpConfigStore.seedMcpServers([server('alpha')]);
		const load = await bridge.mcpConfigStore.load();
		expect(load.ok).toBe(true);
		if (load.ok) expect(load.value).toHaveLength(1);
	});

	it('returns the same stable instance across reads (the bridge IS the port)', () => {
		const bridge = new MockBridge();
		expect(bridge.mcpConfigStore).toBe(bridge.mcpConfigStore);
	});
});
