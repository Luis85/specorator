/**
 * TEST-TS-011 (A leg) — `useProviderHistoryPort()` inject-or-throw (SPEC-TS-021,
 * REQ-TS-010/013). Mirrors the `useChatRuntimePort` pattern: resolves the injected
 * `PROVIDER_HISTORY_PORT` or throws a clear "was not provided" error. No
 * `data-testid` PageObject is needed — the composable mounts no DOM (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useProviderHistoryPort } from '@/ui/composables/useProviderHistoryPort';
import { PROVIDER_HISTORY_PORT } from '@/infrastructure/bridge/ports';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import type { ProviderHistoryPort } from '@/domain/ports';

function harness(onResolved: (port: ProviderHistoryPort) => void) {
	return defineComponent({
		name: 'ProviderHistoryHarness',
		setup() {
			onResolved(useProviderHistoryPort());
			return () => h('div');
		},
	});
}

describe('useProviderHistoryPort (SPEC-TS-021)', () => {
	it('returns the provided ProviderHistoryPort', () => {
		const history = new MockHistoryStore();
		let resolved: ProviderHistoryPort | null = null;
		mount(
			harness((port) => (resolved = port)),
			{
				global: { provide: { [PROVIDER_HISTORY_PORT as symbol]: history } },
			},
		);
		expect(resolved).toBe(history);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/ProviderHistoryPort was not provided/);
	});
});
