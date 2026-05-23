<script setup lang="ts">
/**
 * StreamingCursor — animated tail glyph for the in-progress assistant bubble
 * (REQ-AUX-008, spec §1.3.6, §3.2).
 *
 * Replaces the literal `▍` previously inlined into `MessageList.vue`.
 * No props, no emits — the parent owns lifecycle gating (mount only while
 * `messagesStore.status === 'streaming'`).
 *
 * Styling contract: 2 px × 1 em, `background: currentColor`, animated by the
 * `streaming-cursor-blink` keyframe from `animations.css`.
 * Reduced-motion: `animation: none` (the element stays static; layout unchanged).
 */
defineOptions({ name: 'StreamingCursor' });
</script>

<template>
	<span class="sp-streaming-cursor" aria-hidden="true" data-testid="streaming-cursor" />
</template>

<style scoped>
.sp-streaming-cursor {
	display: inline-block;
	inline-size: 2px;
	block-size: 1em;
	background-color: currentColor;
	vertical-align: text-bottom;
	margin-inline-start: 2px;
	animation: streaming-cursor-blink 1s steps(2, end) infinite;
}

@media (prefers-reduced-motion: reduce) {
	.sp-streaming-cursor {
		animation: none;
	}
}
</style>
