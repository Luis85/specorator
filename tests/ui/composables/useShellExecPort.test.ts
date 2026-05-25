/**
 * T-CP-029 (RED) — `useShellExecPort()` inject-or-throw (TEST-CP-026 U leg).
 *
 * SPEC-CP-026, REQ-CP-030. Mirrors the `useChatRuntimePort` inject-or-throw
 * pattern (ADR-008 one-port-per-composable, no aggregate).
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useShellExecPort } from '@/ui/composables/useShellExecPort';
import { SHELL_EXEC_PORT } from '@/infrastructure/bridge/ports';
import { MockShellExec } from '@/infrastructure/mock/MockComposerPorts';
import type { ShellExecPort } from '@/domain/ports';

function harness(onResolved: (port: ShellExecPort) => void) {
	return defineComponent({
		name: 'ShellExecHarness',
		setup() {
			onResolved(useShellExecPort());
			return () => h('div');
		},
	});
}

describe('useShellExecPort (SPEC-CP-026)', () => {
	it('returns the provided ShellExecPort', () => {
		const port = new MockShellExec();
		let resolved: ShellExecPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [SHELL_EXEC_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/ShellExecPort was not provided/);
	});
});
