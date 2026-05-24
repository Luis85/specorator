/**
 * T-CC-018 — `useMarkdownRenderPort()` inject-or-throw (SPEC-CC-017, REQ-CC-002).
 *
 * Mirrors the `useLoggerPort` pattern: resolves the injected
 * `MARKDOWN_RENDER_PORT` or throws a clear "was not provided" error.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useMarkdownRenderPort } from '@/ui/composables/useMarkdownRenderPort';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import type { MarkdownRenderPort } from '@/domain/ports';

function harness(onResolved: (port: MarkdownRenderPort) => void) {
	return defineComponent({
		name: 'MarkdownRenderHarness',
		setup() {
			onResolved(useMarkdownRenderPort());
			return () => h('div');
		},
	});
}

describe('useMarkdownRenderPort (SPEC-CC-017)', () => {
	it('returns the provided MarkdownRenderPort', () => {
		let resolved: MarkdownRenderPort | null = null;
		mount(
			harness((port) => (resolved = port)),
			{
				global: { provide: { [MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort } },
			},
		);
		expect(resolved).toBe(safeMarkdownRenderPort);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/MarkdownRenderPort was not provided/);
	});
});
