/**
 * T-CP-008 (TEST-CP-003 Mock fixtures leg + TEST-CP-012 catalog delay) — RED:
 * `MockBridge.createMentionDataProvider()` returns a fixture provider over an
 * in-memory referent list (files + one subagent; MCP `[]`); `query(filter)`
 * filters case-insensitively, empty filter → the unfiltered capped list, empty
 * source → `[]` no throw. `MockBridge.createProviderCommandCatalog()` returns a
 * fixture `getEntries(kind)` with a `seedCatalogDelay(ms)` hook so a test can fire
 * a stale + a fresh response (request-id guard backing, REQ-CP-004).
 *
 * Fails until T-CP-009 implements the Mock fixtures + factories.
 *
 * Traces: TEST-CP-003 (Mock leg), TEST-CP-012, SPEC-CP-009, REQ-CP-004/012.
 */
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

describe('MockBridge.createMentionDataProvider (TEST-CP-003 Mock leg)', () => {
	it('lists fixture file + folder + subagent referents on an empty filter', async () => {
		const provider = new MockBridge().createMentionDataProvider();
		const all = await provider.query('');
		const kinds = all.map((r) => r.kind);
		expect(kinds).toContain('file');
		expect(kinds).toContain('subagent');
		// MCP source is no-op [] in P4 (P8/NG4) — no mcp-server referent.
		expect(kinds).not.toContain('mcp-server');
	});

	it('filters case-insensitively by name/detail', async () => {
		const provider = new MockBridge().createMentionDataProvider();
		const hits = await provider.query('NOTE');
		expect(hits.length).toBeGreaterThan(0);
		expect(hits.every((r) => `${r.name}${r.detail ?? ''}`.toLowerCase().includes('note'))).toBe(
			true,
		);
	});

	it('an empty/no-match filter returns [] without throwing', async () => {
		const provider = new MockBridge().createMentionDataProvider();
		await expect(provider.query('zzz-no-such-referent')).resolves.toEqual([]);
	});

	it('each referent carries a mentionText insertion', async () => {
		const provider = new MockBridge().createMentionDataProvider();
		const all = await provider.query('');
		expect(all.every((r) => r.mentionText.length > 0)).toBe(true);
	});
});

describe('MockBridge.createProviderCommandCatalog (TEST-CP-012)', () => {
	it('returns a scripted command list and a scripted skill list', async () => {
		const catalog = new MockBridge().createProviderCommandCatalog();
		const commands = await catalog.getEntries('command');
		const skills = await catalog.getEntries('skill');
		expect(commands.every((e) => e.kind === 'command' && e.prefix === '/' && !e.builtIn)).toBe(
			true,
		);
		expect(skills.every((e) => e.kind === 'skill' && e.prefix === '$' && !e.builtIn)).toBe(true);
		expect(commands.length).toBeGreaterThan(0);
		expect(skills.length).toBeGreaterThan(0);
	});

	it('seedCatalogDelay(ms) lets a stale response resolve after a fresh one (request-id guard backing)', async () => {
		const catalog = new MockBridge().createProviderCommandCatalog();
		catalog.seedCatalogDelay(40);
		const stalePromise = catalog.getEntries('command'); // delayed
		catalog.seedCatalogDelay(0);
		const fresh = await catalog.getEntries('command'); // resolves first
		const stale = await stalePromise; // resolves second
		expect(fresh.length).toBeGreaterThan(0);
		expect(stale.length).toBeGreaterThan(0);
	});
});
