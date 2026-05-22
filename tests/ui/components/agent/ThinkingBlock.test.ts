/**
 * Tests for `ThinkingBlock.vue` — collapsible extended-thinking display.
 * PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2.
 *
 * WS-AUX-5 (REQ-AUX-013): block now composes `<NestedDetailFrame>` and
 * `<SpIcon>`, so mounting requires the `ICON_PORT` + `LOGGER_PORT`
 * provides. The data-testid contract is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ThinkingBlock from '@/ui/components/agent/ThinkingBlock.vue';
import { i18n } from '@/ui/i18n';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function mountBlock(text: string) {
	const bridge = new MockBridge() as unknown as IconPort;
	const wrapper = mount(ThinkingBlock, {
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		props: { text },
	});
	return wrapper;
}

describe('ThinkingBlock', () => {
	it('renders nothing when text is empty', () => {
		const w = mountBlock('');
		expect(w.find('[data-testid="agent-thinking-block"]').exists()).toBe(false);
	});

	it('renders a collapsible details block when text is non-empty', () => {
		const w = mountBlock('I should consider…');
		expect(w.find('[data-testid="agent-thinking-block"]').exists()).toBe(true);
		expect(w.find('[data-testid="agent-thinking-summary"]').exists()).toBe(true);
		expect(w.find('[data-testid="agent-thinking-text"]').text()).toBe('I should consider…');
	});

	it('shows the localised label in the summary', () => {
		const w = mountBlock('reason');
		expect(w.find('[data-testid="agent-thinking-summary"]').text()).toContain('Thinking');
	});

	it('updates the rendered text when the prop changes', async () => {
		const w = mountBlock('first');
		expect(w.find('[data-testid="agent-thinking-text"]').text()).toBe('first');
		await w.setProps({ text: 'first and second' });
		expect(w.find('[data-testid="agent-thinking-text"]').text()).toBe('first and second');
	});

	it('wraps its body in <NestedDetailFrame> (T-AUX-241)', () => {
		const w = mountBlock('thinking');
		expect(w.find('[data-testid="nested-detail-frame"]').exists()).toBe(true);
	});

	it('removes its own border-indent CSS (T-AUX-240/241)', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/ThinkingBlock.vue'),
			'utf8',
		);
		expect(src).not.toMatch(/border-inline-start:\s*[0-9]/);
		expect(src).not.toMatch(/border:\s*1px\s+solid\s+var\(--background-modifier-border\)/);
	});
});
