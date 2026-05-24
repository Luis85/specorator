<script setup lang="ts">
/**
 * A static "context compacted" notice (SPEC-RR-032), rendered when a
 * `{type:'context_compacted'}` content block is present. Render-only (NG1) —
 * NO compaction machinery, no props, no state. Declarative text only; no
 * `v-html` (NFR-RR-006).
 */
</script>

<template>
	<div class="sp-context-compacted" data-testid="context-compacted" role="note">
		Context was compacted to free up space.
	</div>
</template>

<style scoped>
.sp-context-compacted {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-xs);
	font-style: italic;
	padding-block: var(--sp-space-1);
	text-align: center;
}
</style>
