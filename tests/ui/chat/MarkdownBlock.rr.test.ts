/**
 * TEST-RR-028 (RED) — `MarkdownBlock.vue` async-aware rich render (ADR-RR-002).
 *
 * SPEC-RR-011 / SPEC-RR-022 amendment: `MarkdownRenderPort.render` is now **async**
 * (`Promise<SafeRenderResult>`). `MarkdownBlock.vue` holds the resolved nodes in reactive
 * state and renders any node kind DECLARATIVELY — heading + strong + list (and code_block) —
 * from the resolved DTO. There is NO `v-html`/`innerHTML` (NFR-RR-006). On first render it
 * shows the raw text synchronously (no blank flash); the resolved rich nodes appear after the
 * async resolve (`flushPromises`/`nextTick`). A superseded in-flight render is dropped when a
 * newer `content` has already arrived (replace-latest streaming cadence).
 *
 * Mock-backed: the port resolves `Promise.resolve(richResult)` — the pattern the three bridges
 * use (`Promise.resolve(safeMarkdownRender(...))` for Mock/LocalStorage; the awaited Obsidian
 * walk for production). The pure `safeMarkdownRender` itself stays synchronous (asserted in
 * `safeMarkdownRenderPort.test.ts`).
 *
 * Traces: TEST-RR-028, REQ-RR-020a, NFR-RR-006, NFR-RR-014, ADR-RR-002.
 */
import { describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MarkdownBlock from '@/ui/chat/MarkdownBlock.vue';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import type { MarkdownRenderPort, SafeRenderResult } from '@/domain/ports';
import { MarkdownBlockPageObject } from './MarkdownBlock.po';

/**
 * A fake async `MarkdownRenderPort` that resolves a fixed rich `SafeRenderResult`
 * (heading + strong + list + code_block) on a microtask — proving `MarkdownBlock`
 * renders the full additive node-kind union after the async resolve.
 */
function richPort(result: SafeRenderResult): MarkdownRenderPort {
	return { render: () => Promise.resolve(result) };
}

const RICH_RESULT: SafeRenderResult = {
	nodes: [
		{ kind: 'heading', level: 2, spans: [{ kind: 'text', value: 'Title' }] },
		{
			kind: 'paragraph',
			spans: [
				{ kind: 'text', value: 'this is ' },
				{ kind: 'strong', spans: [{ kind: 'text', value: 'bold' }] },
				{ kind: 'text', value: ' and ' },
				{ kind: 'em', spans: [{ kind: 'text', value: 'italic' }] },
			],
		},
		{
			kind: 'list',
			ordered: false,
			items: [
				[{ kind: 'paragraph', spans: [{ kind: 'text', value: 'one' }] }],
				[{ kind: 'paragraph', spans: [{ kind: 'text', value: 'two' }] }],
			],
		},
		{ kind: 'code_block', language: 'ts', value: 'const x = 1;' },
	],
};

function mountBlock(port: MarkdownRenderPort, content: string) {
	const wrapper = mount(MarkdownBlock, {
		props: { content },
		global: { provide: { [MARKDOWN_RENDER_PORT as symbol]: port } },
	});
	return { wrapper, po: new MarkdownBlockPageObject(wrapper) };
}

describe('MarkdownBlock async rich render (TEST-RR-028, ADR-RR-002)', () => {
	it('shows the raw text synchronously on first render (no blank flash)', () => {
		const { po } = mountBlock(richPort(RICH_RESULT), '# Title');
		// Before the async render resolves, the block already shows the raw text.
		expect(po.exists()).toBe(true);
		expect(po.text()).toContain('# Title');
	});

	it('renders heading + strong + em + list + code_block from the resolved DTO', async () => {
		const { po } = mountBlock(richPort(RICH_RESULT), '# Title\n\n**bold**');
		await flushPromises();
		await nextTick();
		expect(po.headings()).toEqual(['Title']);
		expect(po.strongSpans()).toEqual(['bold']);
		expect(po.emSpans()).toEqual(['italic']);
		expect(po.listItemCount()).toBe(2);
		expect(po.listItems()).toEqual(['one', 'two']);
		expect(po.codeBlocks()).toEqual(['const x = 1;']);
	});

	it('does not inject raw HTML — no v-html (NFR-RR-006)', async () => {
		const scriptResult: SafeRenderResult = {
			nodes: [
				{
					kind: 'paragraph',
					spans: [{ kind: 'text', value: '<script>alert(1)</script>' }],
				},
			],
		};
		const { po } = mountBlock(richPort(scriptResult), 'x');
		await flushPromises();
		await nextTick();
		expect(po.text()).toContain('<script>alert(1)</script>');
		expect(po.html()).not.toContain('<script>alert(1)</script>');
	});

	it('re-renders on content change (streaming accumulate, NFR-RR-014)', async () => {
		const first: SafeRenderResult = {
			nodes: [{ kind: 'heading', level: 1, spans: [{ kind: 'text', value: 'first' }] }],
		};
		const second: SafeRenderResult = {
			nodes: [{ kind: 'heading', level: 1, spans: [{ kind: 'text', value: 'second' }] }],
		};
		let next = first;
		const port: MarkdownRenderPort = { render: () => Promise.resolve(next) };
		const { wrapper, po } = mountBlock(port, 'a');
		await flushPromises();
		await nextTick();
		expect(po.headings()).toEqual(['first']);

		next = second;
		await wrapper.setProps({ content: 'ab' });
		await flushPromises();
		await nextTick();
		expect(po.headings()).toEqual(['second']);
	});

	it('replace-latest: drops a stale resolution when content changed again', async () => {
		// Resolve order is deterministic via the queued promises; the block must end
		// on the LATEST content's result, never a superseded one.
		const resultFor = (content: string): SafeRenderResult => ({
			nodes: [{ kind: 'heading', level: 1, spans: [{ kind: 'text', value: content }] }],
		});
		const port: MarkdownRenderPort = {
			render: (markdown: string) => Promise.resolve(resultFor(markdown)),
		};
		const { wrapper, po } = mountBlock(port, 'v1');
		// Fire a rapid succession of content changes before flushing.
		await wrapper.setProps({ content: 'v2' });
		await wrapper.setProps({ content: 'v3' });
		await flushPromises();
		await nextTick();
		expect(po.headings()).toEqual(['v3']);
	});
});
