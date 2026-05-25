/**
 * T-CP-029 (RED) — `useProviderCommandCatalogPort()` inject-or-throw (TEST-CP-026 U leg).
 *
 * SPEC-CP-026, REQ-CP-004. Mirrors the `useChatRuntimePort` inject-or-throw
 * pattern (ADR-008 one-port-per-composable, no aggregate).
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useProviderCommandCatalogPort } from '@/ui/composables/useProviderCommandCatalogPort';
import { PROVIDER_COMMAND_CATALOG_PORT } from '@/infrastructure/bridge/ports';
import { MockProviderCommandCatalog } from '@/infrastructure/mock/MockComposerPorts';
import type { ProviderCommandCatalogPort } from '@/domain/ports';

function harness(onResolved: (port: ProviderCommandCatalogPort) => void) {
	return defineComponent({
		name: 'CommandCatalogHarness',
		setup() {
			onResolved(useProviderCommandCatalogPort());
			return () => h('div');
		},
	});
}

describe('useProviderCommandCatalogPort (SPEC-CP-026)', () => {
	it('returns the provided ProviderCommandCatalogPort', () => {
		const port = new MockProviderCommandCatalog();
		let resolved: ProviderCommandCatalogPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [PROVIDER_COMMAND_CATALOG_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(
			/ProviderCommandCatalogPort was not provided/,
		);
	});
});
