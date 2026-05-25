/**
 * T-TC-017 (RED) — `useToolbarCatalogPort()` inject-or-throw (TEST-TC-003 composable
 * leg).
 *
 * SPEC-TC-024, REQ-TC-003/010. Mirrors the `useVaultPort`/`useAuxModelPort`
 * inject-or-throw pattern (ADR-008 one-port-per-composable, no aggregate). In
 * `ChatSurface` the port is injected OPTIONALLY (`inject(TOOLBAR_CATALOG_PORT,
 * undefined)`) so a mount without it degrades to "no toolbar"; this strict
 * composable exists for any consumer that requires it.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useToolbarCatalogPort } from '@/ui/composables/useToolbarCatalogPort';
import { TOOLBAR_CATALOG_PORT } from '@/infrastructure/bridge/ports';
import { MockToolbarCatalog } from '@/infrastructure/mock/MockToolbarCatalog';
import type { ToolbarCatalogPort } from '@/domain/ports';

function harness(onResolved: (port: ToolbarCatalogPort) => void) {
	return defineComponent({
		name: 'ToolbarCatalogHarness',
		setup() {
			onResolved(useToolbarCatalogPort());
			return () => h('div');
		},
	});
}

describe('useToolbarCatalogPort (SPEC-TC-024)', () => {
	it('returns the provided ToolbarCatalogPort', () => {
		const port = new MockToolbarCatalog();
		let resolved: ToolbarCatalogPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [TOOLBAR_CATALOG_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/ToolbarCatalogPort was not provided/);
	});
});
