/**
 * T-PV-025 (RED) — `useProviderRegistryPort()` inject-or-throw (TEST-PV-112
 * composable leg).
 *
 * SPEC-PV-019, REQ-PV-112. Mirrors the `useVaultPort`/`useToolbarCatalogPort`
 * inject-or-throw pattern (ADR-008 one-port-per-composable, no aggregate). Returns
 * the injected `PROVIDER_REGISTRY_PORT` when provided; throws a clear "was not
 * provided" error otherwise.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useProviderRegistryPort } from '@/ui/composables/useProviderRegistryPort';
import { PROVIDER_REGISTRY_PORT } from '@/infrastructure/bridge/ports';
import { ProviderRegistry } from '@/infrastructure/providers/ProviderRegistry';
import type { ProviderRegistryPort } from '@/domain/ports';

function harness(onResolved: (port: ProviderRegistryPort) => void) {
	return defineComponent({
		name: 'ProviderRegistryHarness',
		setup() {
			onResolved(useProviderRegistryPort());
			return () => h('div');
		},
	});
}

describe('useProviderRegistryPort (SPEC-PV-019)', () => {
	it('returns the provided ProviderRegistryPort', () => {
		const port = new ProviderRegistry();
		let resolved: ProviderRegistryPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [PROVIDER_REGISTRY_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/ProviderRegistryPort was not provided/);
	});
});
