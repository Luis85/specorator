/**
 * Tests for `ThinkingBlock.vue` — collapsible extended-thinking display.
 * PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ThinkingBlock from '@/ui/components/agent/ThinkingBlock.vue';
import { i18n } from '@/ui/i18n';

function mountBlock(text: string) {
	const wrapper = mount(ThinkingBlock, {
		global: { plugins: [i18n] },
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
});
