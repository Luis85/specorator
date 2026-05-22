<script setup lang="ts">
/**
 * CompactBoundary — visual divider for SDK history-compaction events
 * (spec §1.4, Codex P2 on PR #379 → MPS-001 §8).
 *
 * Refresh for AUX WS-5: token-driven divider lines + chevron icon. Replaces
 * the inline `--- compact ---` ASCII divider previously rendered in
 * `MessageList.vue`. Consumes `--sp-compact` from tokens.css.
 */
import SpIcon from '@/ui/components/primitives/SpIcon.vue';

interface CompactBoundaryProps {
	label: string;
}

defineProps<CompactBoundaryProps>();
defineOptions({ name: 'CompactBoundary' });
</script>

<template>
	<div class="sp-compact-boundary" role="status" data-testid="compact-boundary">
		<span class="sp-compact-boundary__line" aria-hidden="true" />
		<SpIcon
			name="chevron-down"
			:size="12"
			class="sp-compact-boundary__icon"
			data-testid="compact-boundary-icon"
		/>
		<span class="sp-compact-boundary__label" data-testid="compact-boundary-label">
			{{ label }}
		</span>
		<span class="sp-compact-boundary__line" aria-hidden="true" />
	</div>
</template>

<style scoped>
.sp-compact-boundary {
	display: flex;
	align-items: center;
	gap: var(--sp-space-3);
	margin-block: var(--sp-space-3);
	color: var(--sp-compact);
	font-size: var(--sp-font-size-sm);
	font-style: italic;
	text-align: center;
}

.sp-compact-boundary__line {
	flex: 1 1 auto;
	block-size: 1px;
	background-color: var(--sp-compact);
	opacity: 0.4;
}

.sp-compact-boundary__icon {
	color: var(--sp-compact);
}

.sp-compact-boundary__label {
	flex: 0 0 auto;
}
</style>
