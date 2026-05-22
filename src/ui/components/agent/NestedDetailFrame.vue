<script setup lang="ts">
/**
 * NestedDetailFrame — shared 2px inline-start border + indent shell for
 * collapsible nested blocks (REQ-AUX-013, spec §1.3.7).
 *
 * Owns the ONLY place the inline-start border + indent values exist;
 * ThinkingBlock, ToolCallBlock, SubagentBlock all consume this primitive
 * via the default slot.
 *
 * Props:
 *   - icon            Lucide name rendered via SpIcon (REQ-AUX-001).
 *   - label           Required summary label.
 *   - summary         Optional secondary text shown next to the label.
 *   - status          'idle' | 'running' | 'complete' | 'error' — driver for
 *                     visual state via `data-status` attr on the root.
 *   - defaultExpanded When true (default), `<details open>`.
 *
 * Emits `expand-change` with `{ expanded }` whenever the user toggles the
 * native `<details>` element.
 */
import SpIcon from '@/ui/components/primitives/SpIcon.vue';

type NestedDetailFrameStatus = 'idle' | 'running' | 'complete' | 'error';

interface NestedDetailFrameProps {
	icon: string;
	label: string;
	summary?: string;
	status?: NestedDetailFrameStatus;
	defaultExpanded?: boolean;
}

const props = withDefaults(defineProps<NestedDetailFrameProps>(), {
	status: 'idle',
	defaultExpanded: true,
});

const emit = defineEmits<{
	'expand-change': [payload: { expanded: boolean }];
}>();

defineOptions({ name: 'NestedDetailFrame' });

function onToggle(event: Event): void {
	const target = event.target as HTMLDetailsElement | null;
	if (target === null) return;
	emit('expand-change', { expanded: target.open });
}
</script>

<template>
	<details
		class="sp-nested-detail"
		:data-status="status"
		:open="defaultExpanded"
		data-testid="nested-detail-frame"
		@toggle="onToggle"
	>
		<summary class="sp-nested-detail__summary" data-testid="nested-detail-frame-summary">
			<slot name="summary">
				<SpIcon :name="icon" :size="14" data-testid="nested-detail-frame-icon" />
				<span class="sp-nested-detail__label" data-testid="nested-detail-frame-label">
					{{ label }}
				</span>
				<span
					v-if="props.summary !== undefined && props.summary.length > 0"
					class="sp-nested-detail__summary-text"
					data-testid="nested-detail-frame-summary-text"
				>
					{{ summary }}
				</span>
			</slot>
		</summary>
		<div class="sp-nested-detail__body" data-testid="nested-detail-frame-body">
			<slot />
		</div>
	</details>
</template>

<style scoped>
.sp-nested-detail {
	border-inline-start: 2px solid var(--sp-border);
	padding-inline-start: var(--sp-space-5);
	padding-block: var(--sp-space-2);
	margin-block: var(--sp-space-2);
	font-size: var(--sp-font-size-md);
	color: var(--sp-text-normal);
}

.sp-nested-detail[data-status='running'] {
	border-inline-start-color: var(--sp-interactive-accent);
}

.sp-nested-detail[data-status='complete'] {
	border-inline-start-color: var(--sp-success);
}

.sp-nested-detail[data-status='error'] {
	border-inline-start-color: var(--sp-error);
}

.sp-nested-detail__summary {
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-3);
	list-style: none;
	color: var(--sp-text-muted);
}

.sp-nested-detail__summary::-webkit-details-marker {
	display: none;
}

.sp-nested-detail__label {
	font-weight: var(--sp-font-weight-medium);
	color: var(--sp-text-normal);
}

.sp-nested-detail__summary-text {
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-nested-detail__body {
	margin-block-start: var(--sp-space-3);
}
</style>
