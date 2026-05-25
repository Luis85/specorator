/**
 * T-CA-029 (RED) — `useSelectionHighlightPort()` inject-or-throw (TEST-CA-013 composable leg).
 *
 * SPEC-CA-025, REQ-CA-013. Mirrors the `useVaultPort` inject-or-throw pattern
 * (ADR-008 one-port-per-composable, no aggregate).
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useSelectionHighlightPort } from '@/ui/composables/useSelectionHighlightPort';
import { SELECTION_HIGHLIGHT_PORT } from '@/infrastructure/bridge/ports';
import { MockSelectionHighlight } from '@/infrastructure/mock/MockSelectionPorts';
import type { SelectionHighlightPort } from '@/domain/ports';

function harness(onResolved: (port: SelectionHighlightPort) => void) {
	return defineComponent({
		name: 'SelectionHighlightHarness',
		setup() {
			onResolved(useSelectionHighlightPort());
			return () => h('div');
		},
	});
}

describe('useSelectionHighlightPort (SPEC-CA-025)', () => {
	it('returns the provided SelectionHighlightPort', () => {
		const port = new MockSelectionHighlight();
		let resolved: SelectionHighlightPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [SELECTION_HIGHLIGHT_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(
			/SelectionHighlightPort was not provided/,
		);
	});
});
