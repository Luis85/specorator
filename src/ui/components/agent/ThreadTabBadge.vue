<script setup lang="ts">
/**
 * `ThreadTabBadge.vue` — 24×24 status badge rendered inside each `ThreadTab`.
 * Border colour is driven by `data-state`; the `streaming` state animates the
 * border via the shared `thinking-pulse` keyframe (see `animations.css`).
 *
 * Spec §1.3.8 + §3.4 (state → token map). Satisfies REQ-AUX-019.
 */
type ThreadTabBadgeState = 'active' | 'streaming' | 'attention' | 'idle'

interface ThreadTabBadgeProps {
	state: ThreadTabBadgeState
	digit: number | string
}
defineProps<ThreadTabBadgeProps>()
</script>

<template>
	<span
		class="sp-thread-tab-badge"
		:data-state="state"
		:data-testid="'thread-tab-badge'"
		aria-hidden="true"
	>
		{{ digit }}
	</span>
</template>

<style scoped>
.sp-thread-tab-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: var(--sp-radius-sm);
	border: 2px solid var(--sp-border);
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--text-normal);
	box-sizing: border-box;
	background: transparent;
}

.sp-thread-tab-badge[data-state='active'] {
	border-color: var(--sp-interactive-accent);
}

.sp-thread-tab-badge[data-state='streaming'] {
	border-color: var(--sp-brand);
	animation: thinking-pulse 1.4s ease-in-out infinite;
}

.sp-thread-tab-badge[data-state='attention'] {
	border-color: var(--sp-error);
}

.sp-thread-tab-badge[data-state='idle'] {
	border-color: var(--sp-border);
}

@media (prefers-reduced-motion: reduce) {
	.sp-thread-tab-badge[data-state='streaming'] {
		animation: none;
	}
}
</style>
