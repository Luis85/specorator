<script setup lang="ts">
import { computed } from 'vue';
import { useMarkdownRenderPort } from '@/ui/composables/useMarkdownRenderPort';

/**
 * Renders a message's content as structured markdown nodes (SPEC-CC-019). Calls the
 * injected `MarkdownRenderPort` (P1 backing = `safeMarkdownRender`) and renders the
 * `MarkdownNode[]` DECLARATIVELY — `<p>` per paragraph, `<code>` per inline-code
 * span, text spans verbatim with `white-space: pre-wrap` for line breaks. There is
 * NO `v-html`/`innerHTML`, so any literal `<`/`&`/HTML is shown as text, never
 * injected (NFR-CC-008, EC-14). Re-renders reactively as `content` accumulates
 * during streaming (REQ-CC-004); the render seam lets P2 reintroduce throttling.
 */
const props = defineProps<{ content: string }>();

const renderPort = useMarkdownRenderPort();
// The pure P1 backing emits only `paragraph` nodes; P2 widened `MarkdownNode`
// into a union (SPEC-RR-011). Narrow to paragraphs here so this P1 component is
// behaviour-identical (the richer block kinds render via SPEC-RR-022 in the UI
// batch). No assertion or output changes for the existing paragraph path.
const paragraphs = computed(() =>
	renderPort.render(props.content).nodes.filter((node) => node.kind === 'paragraph'),
);
</script>

<template>
	<div class="sp-markdown-block" data-testid="markdown-block">
		<p
			v-for="(node, paragraphIndex) in paragraphs"
			:key="paragraphIndex"
			class="sp-markdown-block__paragraph"
			data-testid="md-paragraph"
		>
			<template v-for="(span, spanIndex) in node.spans" :key="spanIndex">
				<code v-if="span.kind === 'code'" data-testid="md-code">{{ span.value }}</code>
				<span v-else-if="span.kind === 'text'" class="sp-markdown-block__text">{{
					span.value
				}}</span>
			</template>
		</p>
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

.sp-markdown-block__text {
	white-space: pre-wrap;
}

.sp-markdown-block code {
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
}
</style>
