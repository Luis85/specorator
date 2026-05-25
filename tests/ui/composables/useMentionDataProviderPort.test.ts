/**
 * T-CP-029 (RED) — `useMentionDataProviderPort()` inject-or-throw (TEST-CP-026 U leg).
 *
 * SPEC-CP-026, REQ-CP-009. Mirrors the `useChatRuntimePort` inject-or-throw
 * pattern (ADR-008 one-port-per-composable, no aggregate): resolves the injected
 * `MENTION_DATA_PROVIDER_PORT` or throws a clear "was not provided" error. No
 * `data-testid` PageObject — the composable mounts no DOM.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useMentionDataProviderPort } from '@/ui/composables/useMentionDataProviderPort';
import { MENTION_DATA_PROVIDER_PORT } from '@/infrastructure/bridge/ports';
import { MockMentionDataProvider } from '@/infrastructure/mock/MockComposerPorts';
import type { MentionDataProviderPort } from '@/domain/ports';

function harness(onResolved: (port: MentionDataProviderPort) => void) {
	return defineComponent({
		name: 'MentionDataHarness',
		setup() {
			onResolved(useMentionDataProviderPort());
			return () => h('div');
		},
	});
}

describe('useMentionDataProviderPort (SPEC-CP-026)', () => {
	it('returns the provided MentionDataProviderPort', () => {
		const port = new MockMentionDataProvider();
		let resolved: MentionDataProviderPort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [MENTION_DATA_PROVIDER_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/MentionDataProviderPort was not provided/);
	});
});
