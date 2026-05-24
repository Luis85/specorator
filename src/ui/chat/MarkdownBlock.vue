<script setup lang="ts">
import { h, onMounted, ref, watch, type VNode } from 'vue';
import { useMarkdownRenderPort } from '@/ui/composables/useMarkdownRenderPort';
import type { MarkdownInline, MarkdownNode } from '@/domain/ports';

/**
 * Renders a message's content as structured markdown nodes (SPEC-CC-019, SPEC-RR-011).
 *
 * Per ADR-RR-002 the injected `MarkdownRenderPort.render` is **async**
 * (`Promise<SafeRenderResult>`) so the production Obsidian backing can `await` Obsidian's
 * asynchronous `MarkdownRenderer.render`. This component is therefore async-aware: it holds
 * the resolved `MarkdownNode[]` in reactive state and renders them as a DECLARATIVE VNode
 * tree — `<h1..6>` headings, `<p>` paragraphs, `<pre><code>` fenced blocks, `<ul>/<ol>`
 * lists with nested nodes, and `text`/`code`/`strong`/`em` inline spans. There is NO
 * `v-html`/`innerHTML`, so any literal `<`/`&`/HTML is shown as text, never injected
 * (NFR-CC-008, NFR-RR-006, EC-14).
 *
 * It renders on mount and on every `content` change (streaming accumulate, REQ-CC-004 /
 * NFR-RR-014). While a render is in flight it shows the last-rendered nodes — and on the very
 * first render, the raw text as a single paragraph — so there is never a blank flash.
 *
 * **Streaming cadence (ADR-RR-002 §5 — replace-latest):** each `content` change bumps a
 * monotonic token before awaiting the port; a resolution is committed only when its token is
 * still the latest, so a fast text stream that supersedes an in-flight render drops the stale
 * result instead of queueing unbounded awaits. The pure baseline (Mock/Fixture) resolves on a
 * microtask, so the live block stays responsive; the production Obsidian rich render settles a
 * tick later, replacing the synchronous raw-text seed.
 */
const props = defineProps<{ content: string }>();

const renderPort = useMarkdownRenderPort();

/** Build the synchronous raw-text seed shown before the first async render resolves. */
function rawTextNodes(content: string): MarkdownNode[] {
	return content.trim() === '' ? [] : [{ kind: 'paragraph', spans: [{ kind: 'text', value: content }] }];
}

// Reactive render state — seeded with the raw text so the first paint is never blank.
const nodes = ref<MarkdownNode[]>(rawTextNodes(props.content));

// Replace-latest guard: monotonically increasing per render request. A resolution commits
// only if its token is still the most recent one (drops superseded in-flight renders).
let latestToken = 0;

async function renderContent(content: string): Promise<void> {
	const token = ++latestToken;
	const result = await renderPort.render(content);
	if (token === latestToken) {
		nodes.value = result.nodes;
	}
}

onMounted(() => void renderContent(props.content));
watch(
	() => props.content,
	(content) => {
		// Seed the raw text immediately so streaming shows incremental text without a blank
		// flash, then resolve the rich render and replace-latest.
		nodes.value = rawTextNodes(content);
		void renderContent(content);
	},
);

// ── Declarative VNode rendering (no v-html, NFR-RR-006) ──────────────────────
// Inline spans and nested block nodes recurse, so a render helper is clearer than a
// deeply-nested template. Every leaf value goes through Vue text interpolation (escaped).

function renderInline(span: MarkdownInline, key: number): VNode | string {
	switch (span.kind) {
		case 'text':
			return h('span', { key, class: 'sp-markdown-block__text' }, span.value);
		case 'code':
			return h('code', { key, 'data-testid': 'md-code' }, span.value);
		case 'strong':
			return h(
				'strong',
				{ key, 'data-testid': 'md-strong' },
				span.spans.map((child, i) => renderInline(child, i)),
			);
		case 'em':
			return h(
				'em',
				{ key, 'data-testid': 'md-em' },
				span.spans.map((child, i) => renderInline(child, i)),
			);
	}
}

function renderInlines(spans: MarkdownInline[]): (VNode | string)[] {
	return spans.map((span, i) => renderInline(span, i));
}

function renderNode(node: MarkdownNode, key: number): VNode {
	switch (node.kind) {
		case 'paragraph':
			return h(
				'p',
				{ key, class: 'sp-markdown-block__paragraph', 'data-testid': 'md-paragraph' },
				renderInlines(node.spans),
			);
		case 'heading':
			return h(
				`h${node.level}`,
				{ key, class: 'sp-markdown-block__heading', 'data-testid': 'md-heading' },
				renderInlines(node.spans),
			);
		case 'code_block':
			return h(
				'pre',
				{ key, class: 'sp-markdown-block__code-block', 'data-testid': 'md-code-block' },
				[h('code', node.value)],
			);
		case 'list':
			return h(
				node.ordered ? 'ol' : 'ul',
				{ key, class: 'sp-markdown-block__list' },
				node.items.map((item, i) =>
					h(
						'li',
						{ key: i, 'data-testid': 'md-list-item' },
						item.map((child, j) => renderNode(child, j)),
					),
				),
			);
	}
}

function renderNodes(): VNode[] {
	return nodes.value.map((node, i) => renderNode(node, i));
}
</script>

<template>
	<div class="sp-markdown-block" data-testid="markdown-block">
		<component :is="() => renderNodes()" />
	</div>
</template>

<style scoped>
.sp-markdown-block__paragraph {
	margin: 0 0 var(--sp-space-4);
	line-height: var(--sp-line-height-normal);
}

.sp-markdown-block__paragraph:last-child {
	margin-block-end: 0;
}

.sp-markdown-block__heading {
	margin: var(--sp-space-4) 0 var(--sp-space-2);
	line-height: var(--sp-line-height-tight);
}

.sp-markdown-block__list {
	margin: 0 0 var(--sp-space-4);
	padding-inline-start: var(--sp-space-6);
}

.sp-markdown-block__code-block {
	margin: 0 0 var(--sp-space-4);
	overflow-x: auto;
}

.sp-markdown-block__text {
	white-space: pre-wrap;
}

.sp-markdown-block code {
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
}
</style>
