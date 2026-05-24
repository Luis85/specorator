/**
 * T-CC-023 (RED) — `MarkdownBlock.vue` declarative render (TEST-CC-008, TEST-CC-012,
 * EC-12/EC-14).
 *
 * SPEC-CC-019. Renders `MarkdownNode[]` from the injected `MarkdownRenderPort`
 * declaratively: `<p data-testid="md-paragraph">` per paragraph, inline `code` as
 * `<code data-testid="md-code">`, text spans verbatim. No `v-html`/`innerHTML`, so
 * literal `<`/`&`/`<script>` is carried as text (NFR-CC-008). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-CC-006, NFR-CC-008.
 */
import { describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MarkdownBlock from '@/ui/chat/MarkdownBlock.vue';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MarkdownBlockPageObject } from './MarkdownBlock.po';

function mountBlock(content: string) {
	const wrapper = mount(MarkdownBlock, {
		props: { content },
		global: { provide: { [MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort } },
	});
	return { wrapper, po: new MarkdownBlockPageObject(wrapper) };
}

/** Wait for the async `MarkdownRenderPort.render` to resolve into reactive state (ADR-RR-002). */
async function settle(): Promise<void> {
	await flushPromises();
	await nextTick();
}

describe('MarkdownBlock (TEST-CC-008/012)', () => {
	it('renders a paragraph per blank-line-separated block', async () => {
		const { po } = mountBlock('first para\n\nsecond para');
		await settle();
		expect(po.exists()).toBe(true);
		expect(po.paragraphCount()).toBe(2);
	});

	it('renders inline code as a <code data-testid="md-code"> element', async () => {
		const { po } = mountBlock('use `npm run test` here');
		await settle();
		expect(po.codeSpans()).toEqual(['npm run test']);
	});

	it('carries literal < and & as text, never as HTML (NFR-CC-008, EC-14)', async () => {
		const { po } = mountBlock('a < b && c > d');
		await settle();
		expect(po.text()).toContain('a < b && c > d');
	});

	it('does not inject raw HTML for a <script> payload (no v-html)', async () => {
		const { po } = mountBlock('<script>alert(1)</script>');
		await settle();
		// The literal text is shown; no executable <script> element is created.
		expect(po.text()).toContain('<script>alert(1)</script>');
		expect(po.html()).not.toContain('<script>alert(1)</script>');
	});

	it('renders empty content with no paragraphs (EC-5/EC-14)', async () => {
		const { po } = mountBlock('   ');
		await settle();
		expect(po.paragraphCount()).toBe(0);
	});

	it('re-renders reactively when content grows (streaming accumulate, REQ-CC-004)', async () => {
		const { wrapper, po } = mountBlock('Hel');
		await settle();
		await wrapper.setProps({ content: 'Hello world' });
		await settle();
		expect(po.text()).toContain('Hello world');
	});
});
