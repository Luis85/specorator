<script setup lang="ts">
/**
 * Off-screen ARIA live region for the agent sidepanel (WP-7, a11y P1 wave).
 *
 * Pairs with `useA11yAnnouncer` — the parent component creates the announcer,
 * passes its `message` ref in via props, and calls `announce()` on
 * well-defined turn boundaries (generation start, assistant turn complete,
 * proposal decided). The mount renders ONE polite live region; the container
 * itself stays empty across renders so SRs only re-announce when `message`
 * changes.
 *
 * Visually hidden via the `sr-only` style (clip + 1×1 absolute positioning)
 * so it never participates in layout. Not `display: none` — display:none
 * removes the node from the accessibility tree and breaks announcements.
 */
const props = defineProps<{
	/** Reactive announcement text owned by `useA11yAnnouncer`. */
	message: string;
}>();

void props;
</script>

<template>
	<div
		class="sp-a11y-announcer"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="a11y-announcer"
	>
		{{ message }}
	</div>
</template>

<style scoped>
.sp-a11y-announcer {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
