<script setup lang="ts">
import { computed } from 'vue';
import type { ToolCall } from '@/domain/chat/ToolCall';
import { toolName, toolSummary, toolLabel, toolIcon } from '@/application/chat/toolPresentation';
import SpCollapsible from './SpCollapsible.vue';
import SpIcon from './SpIcon.vue';
import DiffView from './DiffView.vue';

/**
 * Renders a Write/Edit tool call (SPEC-RR-029). Wraps `SpCollapsible` (collapsed
 * by default). Header: a file `SpIcon`, the tool name, the filename summary
 * (`toolSummary`), an end-pinned status indicator coloured + iconned by status
 * via `--sp-status-*` tokens with an `aria-label` (never colour-only —
 * NFR-RR-008), and a stat chip — `+N` in `--sp-diff-add-fg`, `-N` in
 * `--sp-diff-del-fg`, monospace — with ONLY non-zero counts shown (parity
 * `renderDiffStats`, REQ-RR-027). The expanded body embeds `DiffView` with
 * `toolCall.diffData`; EC-RR-3: when `diffData` is absent it degrades to a
 * generic result body (no diff), never a crash. NO `v-html` (NFR-RR-006).
 * Mirrors claudian-main `WriteEditRenderer`.
 */
const props = defineProps<{ toolCall: ToolCall }>();

const name = computed(() => toolName(props.toolCall.name, props.toolCall.input));
const summary = computed(() => toolSummary(props.toolCall.name, props.toolCall.input));
const label = computed(() => toolLabel(props.toolCall.name, props.toolCall.input));
const iconName = computed(() => toolIcon(props.toolCall.name));

const diffData = computed(() => props.toolCall.diffData);
const stats = computed(() => diffData.value?.stats ?? null);

/** Status → terminal icon name (running has no terminal icon). */
const statusIcon = computed<string | null>(() => {
	switch (props.toolCall.status) {
		case 'completed':
			return 'check';
		case 'error':
			return 'x';
		case 'blocked':
			return 'shield-off';
		default:
			return null;
	}
});

const statusLabel = computed(() => `Status: ${props.toolCall.status}`);
</script>

<template>
	<SpCollapsible :label="label" class="sp-write-edit">
		<template #header>
			<div class="sp-write-edit__header" data-testid="write-edit-header">
				<SpIcon :name="iconName" class="sp-write-edit__icon" />
				<span class="sp-write-edit__name" data-testid="write-edit-name">{{ name }}</span>
				<span
					v-if="summary"
					class="sp-write-edit__summary"
					data-testid="write-edit-summary"
					dir="auto"
					>{{ summary }}</span
				>
				<span
					v-if="stats && (stats.added > 0 || stats.removed > 0)"
					class="sp-write-edit__stats"
					data-testid="write-edit-stats"
				>
					<span
						v-if="stats.added > 0"
						class="sp-write-edit__stat sp-write-edit__stat--added"
						data-testid="write-edit-stat-added"
						>+{{ stats.added }}</span
					>
					<span
						v-if="stats.removed > 0"
						class="sp-write-edit__stat sp-write-edit__stat--removed"
						data-testid="write-edit-stat-removed"
						>-{{ stats.removed }}</span
					>
				</span>
				<span
					class="sp-write-edit__status"
					:class="`sp-write-edit__status--${toolCall.status}`"
					data-testid="write-edit-status"
					:aria-label="statusLabel"
				>
					<SpIcon v-if="statusIcon" :name="statusIcon" />
				</span>
			</div>
		</template>

		<div class="sp-write-edit__body" data-testid="write-edit-body">
			<DiffView v-if="diffData" :diff-data="diffData" />
			<pre
				v-else
				class="sp-write-edit__generic"
				data-testid="write-edit-generic"
				dir="auto"
				>{{ toolCall.result || 'DONE' }}</pre
			>
		</div>
	</SpCollapsible>
</template>

<style scoped>
.sp-write-edit__header {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	inline-size: 100%;
}

.sp-write-edit__icon {
	flex: 0 0 auto;
}

.sp-write-edit__name {
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-medium);
}

.sp-write-edit__summary {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
	unicode-bidi: plaintext;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-write-edit__stats {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-2);
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
}

.sp-write-edit__stat--added {
	color: var(--sp-diff-add-fg);
}

.sp-write-edit__stat--removed {
	color: var(--sp-diff-del-fg);
}

.sp-write-edit__status {
	margin-inline-start: auto;
	display: inline-flex;
	align-items: center;
}

.sp-write-edit__status--running {
	color: var(--sp-status-running);
}

.sp-write-edit__status--completed {
	color: var(--sp-status-completed);
}

.sp-write-edit__status--error {
	color: var(--sp-status-error);
}

.sp-write-edit__status--blocked {
	color: var(--sp-status-blocked);
}

.sp-write-edit__generic {
	margin: 0;
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	max-block-size: var(--sp-diff-max-height);
	overflow: auto;
}
</style>
