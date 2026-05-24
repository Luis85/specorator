<script setup lang="ts">
import { computed } from 'vue';
import type { ToolCall } from '@/domain/chat/ToolCall';
import { toolName, toolSummary, toolLabel, toolIcon } from '@/application/chat/toolPresentation';
import { parseTodos } from '@/application/chat/renderTodos';
import { trySync } from '@/domain/shared/tryAsync';
import SpCollapsible from './SpCollapsible.vue';
import SpIcon from './SpIcon.vue';
import TodoList from './TodoList.vue';

/**
 * Renders a non-Write/Edit tool call (SPEC-RR-026). Wraps `SpCollapsible`
 * (collapsed by default). Header: per-tool `SpIcon` (`toolIcon`), monospace
 * `toolName(...)`, one-line `toolSummary(...)` (an empty summary renders no
 * summary element), and an end-pinned status indicator coloured + iconned by
 * status via `--sp-status-*` tokens with an `aria-label` (never colour-only —
 * NFR-RR-008). Expanded body = the generic renderer: the tool `input` and
 * `result` as escaped, monospace, pre-wrapped declarative text (`<pre>`/`{{ }}`)
 * — a literal `<script>` shows verbatim (REQ-RR-020a); NO `v-html` (NFR-RR-006).
 * TodoWrite renders `TodoList` in the body; Write/Edit route to `WriteEditBlock`
 * via the dispatcher (SPEC-RR-022), not here. Mirrors claudian-main
 * `ToolCallRenderer` header + generic expanded renderer.
 */
const props = defineProps<{ toolCall: ToolCall }>();

const name = computed(() => toolName(props.toolCall.name, props.toolCall.input));
const summary = computed(() => toolSummary(props.toolCall.name, props.toolCall.input));
const label = computed(() => toolLabel(props.toolCall.name, props.toolCall.input));
const iconName = computed(() => toolIcon(props.toolCall.name));

const isTodoWrite = computed(() => props.toolCall.name === 'TodoWrite');
const todos = computed(() => parseTodos(props.toolCall.input));

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

/** Pretty-print the input object for the generic expanded body (escaped text). */
const inputText = computed(() => {
	const result = trySync(() => JSON.stringify(props.toolCall.input, null, 2));
	return result.ok ? result.value : '';
});
</script>

<template>
	<SpCollapsible :label="label" class="sp-tool-call">
		<template #header>
			<div class="sp-tool-call__header" data-testid="tool-call-header">
				<SpIcon :name="iconName" class="sp-tool-call__icon" />
				<span class="sp-tool-call__name" data-testid="tool-call-name">{{ name }}</span>
				<span
					v-if="summary"
					class="sp-tool-call__summary"
					data-testid="tool-call-summary"
					dir="auto"
					>{{ summary }}</span
				>
				<span
					class="sp-tool-call__status"
					:class="`sp-tool-call__status--${toolCall.status}`"
					data-testid="tool-call-status"
					:aria-label="statusLabel"
				>
					<SpIcon v-if="statusIcon" :name="statusIcon" />
				</span>
			</div>
		</template>

		<div class="sp-tool-call__body" data-testid="tool-call-result">
			<TodoList v-if="isTodoWrite" :todos="todos" />
			<template v-else>
				<pre v-if="inputText" class="sp-tool-call__pre">{{ inputText }}</pre>
				<pre v-if="toolCall.result" class="sp-tool-call__pre" dir="auto">{{ toolCall.result }}</pre>
			</template>
		</div>
	</SpCollapsible>
</template>

<style scoped>
.sp-tool-call__header {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	inline-size: 100%;
}

.sp-tool-call__icon {
	flex: 0 0 auto;
}

.sp-tool-call__name {
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-medium);
}

.sp-tool-call__summary {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
	unicode-bidi: plaintext;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-tool-call__status {
	margin-inline-start: auto;
	display: inline-flex;
	align-items: center;
}

.sp-tool-call__status--running {
	color: var(--sp-status-running);
}

.sp-tool-call__status--completed {
	color: var(--sp-status-completed);
}

.sp-tool-call__status--error {
	color: var(--sp-status-error);
}

.sp-tool-call__status--blocked {
	color: var(--sp-status-blocked);
}

.sp-tool-call__pre {
	margin: 0 0 var(--sp-space-2);
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	max-block-size: var(--sp-diff-max-height);
	overflow: auto;
}

.sp-tool-call__pre:last-child {
	margin-block-end: 0;
}
</style>
