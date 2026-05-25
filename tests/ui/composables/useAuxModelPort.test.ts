/**
 * T-CA-029 (RED) — `useAuxModelPort()` inject-or-throw (TEST-CA-013 composable leg).
 *
 * SPEC-CA-025, REQ-CA-021. Mirrors the `useVaultPort`/`useShellExecPort`
 * inject-or-throw pattern (ADR-008 one-port-per-composable, no aggregate).
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useAuxModelPort } from '@/ui/composables/useAuxModelPort';
import { AUX_MODEL_PORT } from '@/infrastructure/bridge/ports';
import { MockAuxModel } from '@/infrastructure/mock/MockAuxModel';
import type { AuxModelPort } from '@/domain/ports';

function harness(onResolved: (port: AuxModelPort) => void) {
	return defineComponent({
		name: 'AuxModelHarness',
		setup() {
			onResolved(useAuxModelPort());
			return () => h('div');
		},
	});
}

describe('useAuxModelPort (SPEC-CA-025)', () => {
	it('returns the provided AuxModelPort', () => {
		const port = new MockAuxModel();
		let resolved: AuxModelPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [AUX_MODEL_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/AuxModelPort was not provided/);
	});
});
