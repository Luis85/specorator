<script setup lang="ts">
import { computed, h, type VNode } from 'vue';
import type { IconNode } from '@/domain/ports';
import { useIconPort } from '@/ui/composables/useIconPort';

/**
 * Renders an `IconNode` (resolved from `useIconPort()`) DECLARATIVELY as a
 * recursive Vue VNode tree (`h(node.tag, node.attrs, children)`) — NEVER
 * `v-html`/`innerHTML` (SPEC-RR-025, NFR-RR-006). An unknown name falls back to
 * the generic `wrench` icon (REQ-RR-019); when even the fallback is unavailable
 * nothing renders. The icon is decorative (`aria-hidden`) — status meaning rides
 * the accompanying label (NFR-RR-008). The wrapper carries `data-testid`.
 */
const props = defineProps<{ name: string }>();

const iconPort = useIconPort();

/** Resolve the icon, falling back to `wrench` for an unknown name (REQ-RR-019). */
const iconNode = computed<IconNode | null>(
	() => iconPort.setIcon(props.name) ?? iconPort.setIcon('wrench'),
);

/** Recursively build the VNode tree from the declarative `IconNode` — no v-html. */
function renderNode(node: IconNode): VNode {
	return h(
		node.tag,
		{ ...node.attrs },
		node.children.map(renderNode),
	);
}

const vnode = computed<VNode | null>(() =>
	iconNode.value === null ? null : renderNode(iconNode.value),
);
</script>

<template>
	<span class="sp-icon" data-testid="sp-icon" aria-hidden="true">
		<component :is="vnode" v-if="vnode" />
	</span>
</template>

<style scoped>
.sp-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 1em;
	block-size: 1em;
}

.sp-icon :deep(svg) {
	inline-size: 1em;
	block-size: 1em;
}
</style>
