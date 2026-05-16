/**
 * Tests for `ToolCallBlock.vue` — inline tool-call display.
 * PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolCallBlock from '@/ui/components/agent/ToolCallBlock.vue';
import { i18n } from '@/ui/i18n';

function mountBlock(props: { toolName: string; inputJson: string; done: boolean }) {
	const wrapper = mount(ToolCallBlock, {
		global: { plugins: [i18n] },
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
		// Pretty-print inserts a newline between the two top-level keys.
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
});
