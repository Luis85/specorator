/**
 * T-CA-029 (RED) — `useSelectionSourcePort()` inject-or-throw (TEST-CA-013 composable leg).
 *
 * SPEC-CA-025, REQ-CA-013. Mirrors the `useVaultPort` inject-or-throw pattern
 * (ADR-008 one-port-per-composable, no aggregate).
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useSelectionSourcePort } from '@/ui/composables/useSelectionSourcePort';
import { SELECTION_SOURCE_PORT } from '@/infrastructure/bridge/ports';
import { MockSelectionSource } from '@/infrastructure/mock/MockSelectionPorts';
import type { SelectionSourcePort } from '@/domain/ports';

function harness(onResolved: (port: SelectionSourcePort) => void) {
	return defineComponent({
		name: 'SelectionSourceHarness',
		setup() {
			onResolved(useSelectionSourcePort());
			return () => h('div');
		},
	});
}

describe('useSelectionSourcePort (SPEC-CA-025)', () => {
	it('returns the provided SelectionSourcePort', () => {
		const port = new MockSelectionSource();
		let resolved: SelectionSourcePort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [SELECTION_SOURCE_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/SelectionSourcePort was not provided/);
	});
});
