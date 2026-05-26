/**
 * T-PV-015/016 — the GitHub Pages demo runtime registry (SPEC-PV-012). Claude →
 * `Result.ok` (the bundled `FixtureChatRuntime`, unchanged P1); a non-Claude
 * provider has no Node subprocess in the browser demo → `Result.err` "unavailable"
 * (degrades, never errors).
 *
 * Traces: TEST-PV-100 (LS leg); SPEC-PV-012; REQ-PV-100; NFR-PV-012; EC-PV-8.
 */
import { describe, it, expect } from 'vitest';
import { LocalStorageProviderRuntimeRegistry } from '@/infrastructure/localstorage/LocalStorageProviderRuntime';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';
import { FixtureChatRuntime } from '@/infrastructure/localstorage/FixtureChatRuntime';

describe('LocalStorageProviderRuntimeRegistry (TEST-PV-100 LS leg, EC-PV-8)', () => {
	it("createChatRuntime('claude') → ok with a FixtureChatRuntime", () => {
		const registry = new LocalStorageProviderRuntimeRegistry();
		const result = registry.createChatRuntime('claude');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBeInstanceOf(FixtureChatRuntime);
			expect(result.value.providerId).toBe('claude');
		}
	});

	it("createChatRuntime('codex') → err 'unavailable' (no Node subprocess, NFR-PV-012)", () => {
		const registry = new LocalStorageProviderRuntimeRegistry();
		const result = registry.createChatRuntime('codex');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toBe('unavailable');
	});

	it("createChatRuntime('opencode') → err 'unavailable'", () => {
		const registry = new LocalStorageProviderRuntimeRegistry();
		const result = registry.createChatRuntime('opencode');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).toBe('unavailable');
	});

	it('the bridge exposes the registry + the shared descriptor table', () => {
		const bridge = new LocalStorageBridge();
		expect(bridge.providerRegistry.listRegisteredProviders().map((d) => d.id)).toEqual([
			'claude',
			'codex',
			'opencode',
		]);
		expect(bridge.providerRuntimeRegistry.createChatRuntime('codex').ok).toBe(false);
	});
});
