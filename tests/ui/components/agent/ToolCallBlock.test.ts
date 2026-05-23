/**
 * Tests for `ToolCallBlock.vue` — inline tool-call display.
 * PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2.
 *
 * WS-AUX-5 (REQ-AUX-013): block now composes `<NestedDetailFrame>` and
 * `<SpIcon>`, so mounting requires the `ICON_PORT` + `LOGGER_PORT`
 * provides. The data-testid contract is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolCallBlock from '@/ui/components/agent/ToolCallBlock.vue';
import { i18n } from '@/ui/i18n';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function mountBlock(props: { toolName: string; inputJson: string; done: boolean }) {
	const bridge = new MockBridge() as unknown as IconPort;
	const wrapper = mount(ToolCallBlock, {
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		props,
	});
	return wrapper;
}

describe('ToolCallBlock', () => {
	it('renders the tool name in the summary', () => {
		const w = mountBlock({ toolName: 'Bash', inputJson: '', done: false });
		expect(w.find('[data-testid="agent-tool-call-summary"]').text()).toContain('Bash');
	});

	it('shows the streaming indicator while not done', () => {
		const w = mountBlock({ toolName: 'Read', inputJson: '', done: false });
		const summary = w.find('[data-testid="agent-tool-call-summary"]');
		expect(summary.text()).toContain('⏳');
		expect(summary.text()).not.toContain('✓');
	});

	it('shows the done indicator once the call finishes', () => {
		const w = mountBlock({ toolName: 'Read', inputJson: '{"path":"foo.md"}', done: true });
		const summary = w.find('[data-testid="agent-tool-call-summary"]');
		expect(summary.text()).toContain('✓');
		expect(summary.text()).not.toContain('⏳');
	});

	it('renders the partial JSON verbatim while streaming', () => {
		const w = mountBlock({ toolName: 'Edit', inputJson: '{"path":"f', done: false });
		expect(w.find('[data-testid="agent-tool-call-input"]').text()).toBe('{"path":"f');
	});

	it('renders pretty-printed JSON once the call finishes', () => {
		const w = mountBlock({
			toolName: 'Write',
			inputJson: '{"path":"a.md","content":"hi"}',
			done: true,
		});
		const text = w.find('[data-testid="agent-tool-call-input"]').text();
		expect(text).toContain('"path"');
		expect(text).toContain('a.md');
		expect(text).toContain('\n');
	});

	it('falls back to raw text if the completed input is malformed JSON', () => {
		const w = mountBlock({ toolName: 'Bash', inputJson: '{not-valid}', done: true });
		expect(w.find('[data-testid="agent-tool-call-input"]').text()).toBe('{not-valid}');
	});

	it('shows the waiting placeholder when input is still empty mid-stream', () => {
		const w = mountBlock({ toolName: 'Bash', inputJson: '', done: false });
		expect(w.find('[data-testid="agent-tool-call-placeholder"]').exists()).toBe(true);
		expect(w.find('[data-testid="agent-tool-call-input"]').exists()).toBe(false);
	});

	it('exposes the tool name as data-tool-name for selector-based queries', () => {
		const w = mountBlock({ toolName: 'TodoWrite', inputJson: '', done: false });
		expect(w.find('[data-testid="agent-tool-call"]').attributes('data-tool-name')).toBe(
			'TodoWrite',
		);
	});

	it('wraps its body in <NestedDetailFrame> (T-AUX-243)', () => {
		const w = mountBlock({ toolName: 'Bash', inputJson: '', done: false });
		expect(w.find('[data-testid="nested-detail-frame"]').exists()).toBe(true);
	});

	it('removes its own border CSS (T-AUX-242/243)', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/ToolCallBlock.vue'),
			'utf8',
		);
		expect(src).not.toMatch(/border:\s*1px\s+solid\s+var\(--background-modifier-border\)/);
		expect(src).not.toMatch(/border-color:\s*var\(--interactive-accent\)/);
	});
});
