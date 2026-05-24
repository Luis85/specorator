/**
 * T-CC-018 — `useChatRuntimePort()` inject-or-throw (SPEC-CC-017, REQ-CC-002).
 *
 * Mirrors the `useLoggerPort` pattern: resolves the injected `CHAT_RUNTIME_PORT`
 * or throws a clear "was not provided" error. No `data-testid` PageObject is
 * needed — the composable mounts no DOM (ADR-009 applies to mountable components).
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useChatRuntimePort } from '@/ui/composables/useChatRuntimePort';
import { CHAT_RUNTIME_PORT } from '@/infrastructure/bridge/ports';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { ChatRuntimePort } from '@/domain/ports';

function harness(onResolved: (port: ChatRuntimePort) => void) {
	return defineComponent({
		name: 'ChatRuntimeHarness',
		setup() {
			onResolved(useChatRuntimePort());
			return () => h('div');
		},
	});
}

describe('useChatRuntimePort (SPEC-CC-017)', () => {
	it('returns the provided ChatRuntimePort', () => {
		const runtime = new MockChatRuntime();
		let resolved: ChatRuntimePort | null = null;
		mount(
			harness((port) => (resolved = port)),
			{
				global: { provide: { [CHAT_RUNTIME_PORT as symbol]: runtime } },
			},
		);
		expect(resolved).toBe(runtime);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/ChatRuntimePort was not provided/);
	});
});
