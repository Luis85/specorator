/**
 * T-RR-029 (RED) — `ThinkingBlock.vue` timer + freeze + auto-collapse (TEST-RR-016).
 *
 * SPEC-RR-027. Live: a brand-coloured italic `"Thinking Ns…"` label whose
 * second-count increments each second (a 1s interval started on mount).
 * Finalise (`live` → false): the timer stops, the label freezes to
 * `"Thought for Ns"` (no `…`), and the block auto-collapses
 * (`aria-expanded="false"`). The interval is cleared on finalise AND unmount
 * (EC-RR-7 — no leaked interval). Reasoning text renders via `MarkdownBlock`
 * (no `v-html`). Uses fake timers; data-testid only (ADR-009).
 *
 * Traces: REQ-RR-013/014, NFR-RR-006.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ThinkingBlock from '@/ui/chat/ThinkingBlock.vue';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { ThinkingBlockPageObject } from './ThinkingBlock.po';

function mountThinking(props: {
	content?: string;
	live: boolean;
	durationSeconds?: number;
}) {
	const wrapper = mount(ThinkingBlock, {
		props: {
			block: {
				type: 'thinking' as const,
				content: props.content ?? 'Reasoning about the change',
				durationSeconds: props.durationSeconds,
			},
			live: props.live,
		},
		global: { provide: { [MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort } },
	});
	return { wrapper, po: new ThinkingBlockPageObject(wrapper) };
}

describe('ThinkingBlock (TEST-RR-016)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('counts up live each second — "Thinking 0s…" then "Thinking 2s…"', async () => {
		const { wrapper, po } = mountThinking({ live: true });
		expect(po.exists()).toBe(true);
		expect(po.label()).toBe('Thinking 0s…');

		vi.advanceTimersByTime(2000);
		await wrapper.vm.$nextTick();
		expect(po.label()).toBe('Thinking 2s…');
	});

	it('freezes to "Thought for Ns" and auto-collapses on finalise (REQ-RR-014)', async () => {
		const { wrapper, po } = mountThinking({ live: true });
		vi.advanceTimersByTime(3000);
		await wrapper.vm.$nextTick();

		await wrapper.setProps({ live: false });
		await wrapper.vm.$nextTick();

		expect(po.label()).toBe('Thought for 3s');
		expect(po.ariaExpanded()).toBe('false');

		// The timer is stopped — advancing further does not change the frozen label.
		vi.advanceTimersByTime(5000);
		await wrapper.vm.$nextTick();
		expect(po.label()).toBe('Thought for 3s');
	});

	it('EC-RR-7: clears the interval on unmount (no leaked timer)', () => {
		const { wrapper } = mountThinking({ live: true });
		const clearSpy = vi.spyOn(globalThis, 'clearInterval');
		wrapper.unmount();
		expect(clearSpy).toHaveBeenCalled();
	});

	it('renders a stored (non-live) block frozen to its durationSeconds', () => {
		const { po } = mountThinking({ live: false, durationSeconds: 7 });
		expect(po.label()).toBe('Thought for 7s');
		expect(po.ariaExpanded()).toBe('false');
	});
});
