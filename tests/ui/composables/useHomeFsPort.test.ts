/**
 * T-PV-025 (RED) — `useHomeFsPort()` inject-or-throw (TEST-PV-112 composable leg).
 *
 * SPEC-PV-019, REQ-PV-112. Mirrors the `useVaultPort` inject-or-throw pattern
 * (ADR-008 one-port-per-composable, no aggregate). Returns the injected
 * `HOME_FS_PORT` when provided; throws a clear "was not provided" error otherwise.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useHomeFsPort } from '@/ui/composables/useHomeFsPort';
import { HOME_FS_PORT } from '@/infrastructure/bridge/ports';
import { MockHomeFs } from '@/infrastructure/mock/MockHomeFs';
import type { HomeFsPort } from '@/domain/ports';

function harness(onResolved: (port: HomeFsPort) => void) {
	return defineComponent({
		name: 'HomeFsHarness',
		setup() {
			onResolved(useHomeFsPort());
			return () => h('div');
		},
	});
}

describe('useHomeFsPort (SPEC-PV-019)', () => {
	it('returns the provided HomeFsPort', () => {
		const port = new MockHomeFs();
		let resolved: HomeFsPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [HOME_FS_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/HomeFsPort was not provided/);
	});
});
