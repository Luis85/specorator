/**
 * T-CP-010 (TEST-CP-016) — RED: `LocalStorageBridge.createMentionDataProvider()` +
 * `createProviderCommandCatalog()` return FIXTURE lists (so the palettes work in
 * the browser demo); `LocalStorageBridge.shellExec.run(...)` resolves
 * `err(new Error('shell execution is not available in the browser demo'))` (honest
 * gating, no silent dead path); the demo runtime reports `supportsPlanMode:false`
 * + `supportsInlineResponse:false`.
 *
 * Fails until T-CP-011 implements the LocalStorage composer ports.
 *
 * Traces: TEST-CP-016, SPEC-CP-010, REQ-CP-012, NFR-CP-007.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';

beforeEach(() => {
	localStorage.clear();
});

describe('LocalStorageBridge composer ports (TEST-CP-016)', () => {
	it('createMentionDataProvider returns a fixture list (palette works in the demo)', async () => {
		const provider = new LocalStorageBridge().createMentionDataProvider();
		const all = await provider.query('');
		expect(all.length).toBeGreaterThan(0);
		expect(all.every((r) => r.mentionText.length > 0)).toBe(true);
	});

	it('createProviderCommandCatalog returns fixture command + skill lists', async () => {
		const catalog = new LocalStorageBridge().createProviderCommandCatalog();
		expect((await catalog.getEntries('command')).length).toBeGreaterThan(0);
		expect((await catalog.getEntries('skill')).length).toBeGreaterThan(0);
	});

	it('shellExec.run resolves err("shell execution is not available in the browser demo")', async () => {
		const result = await new LocalStorageBridge().shellExec.run({ command: 'echo hi' });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error.message).toBe('shell execution is not available in the browser demo');
		}
	});

	it('the demo runtime reports supportsPlanMode:false + supportsInlineResponse:false', () => {
		const runtime = new LocalStorageBridge().createChatRuntime();
		const caps = runtime.getCapabilities();
		expect(caps.supportsPlanMode).toBe(false);
		expect(caps.supportsInlineResponse).toBe(false);
	});
});
