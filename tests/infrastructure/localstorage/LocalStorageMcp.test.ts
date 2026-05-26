/**
 * T-MC-016/017 — the GitHub Pages `LocalStorageMcpConfigStore` round-trips the
 * `.claude/mcp.json` document text via `localStorage` (load-or-default), and the
 * `LocalStorageMcpClient` is inert (`isAvailable: false`, structured test failure,
 * `Result.err` live methods, idempotent `disconnect`). No Obsidian runtime.
 *
 * Traces: TEST-MC-011, SPEC-MC-011, REQ-MC-002/007/034, NFR-MC-004.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageMcpConfigStore } from '@/infrastructure/localstorage/LocalStorageMcpConfigStore';
import { LocalStorageMcpClient } from '@/infrastructure/localstorage/LocalStorageMcpClient';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';

const server: ManagedMcpServer = {
	name: 'fs',
	config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
	enabled: true,
	contextSaving: false,
};

describe('LocalStorageMcpConfigStore', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('load-or-defaults to [] when no config is stored', async () => {
		const result = await new LocalStorageMcpConfigStore().load();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toEqual([]);
	});

	it('exists() is false before a save, true after', async () => {
		const store = new LocalStorageMcpConfigStore();
		const before = await store.exists();
		expect(before.ok && before.value).toBe(false);
		await store.save([server]);
		const after = await store.exists();
		expect(after.ok && after.value).toBe(true);
	});

	it('round-trips a saved server through load', async () => {
		const store = new LocalStorageMcpConfigStore();
		const saved = await store.save([server]);
		expect(saved.ok).toBe(true);
		const loaded = await store.load();
		expect(loaded.ok).toBe(true);
		if (loaded.ok) {
			expect(loaded.value).toHaveLength(1);
			expect(loaded.value[0]?.name).toBe('fs');
		}
	});
});

describe('LocalStorageMcpClient (inert)', () => {
	const client = new LocalStorageMcpClient();

	it('is unavailable in the browser demo', () => {
		expect(client.isAvailable()).toBe(false);
	});

	it('test resolves a structured failure, never throws', async () => {
		const result = await client.test(server);
		expect(result.success).toBe(false);
		expect(result.tools).toEqual([]);
		expect(result.error).toBeTruthy();
	});

	it('connect / listTools / callTool resolve err; disconnect is an idempotent ok', async () => {
		expect((await client.connect(server)).ok).toBe(false);
		expect((await client.listTools({ id: 'x' })).ok).toBe(false);
		expect((await client.callTool({ id: 'x' }, 'tool', {})).ok).toBe(false);
		expect((await client.disconnect({ id: 'x' })).ok).toBe(true);
	});
});
