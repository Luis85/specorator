<script setup lang="ts">
/**
 * Inline tool-call display for streaming and completed tool_use blocks
 * (PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2). Driven by
 * `chatStore.streamingToolCalls`, populated by the SDK adapter's
 * `tool-use-start` / `tool-use-input-delta` / `tool-use-stop`
 * `StreamDelta` variants.
 *
 * Renders a generic collapsible card per tool call: tool name in the
 * summary with a status indicator (⏳ in-flight, ✓ done), and the
 * accumulated `inputJson` rendered as pretty-printed JSON when
 * complete or as raw partial text while streaming. Per-tool
 * specialised renderers (Edit diff, Write preview, TodoWrite list)
 * land in a follow-up — this one covers all tool names generically.
 *
 * Visual reference: Claudian's `ToolCallRenderer.ts`
 * (https://github.com/YishenTu/claudian).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { trySync } from '@/domain/shared/tryAsync';

const props = defineProps<{
	/** Name of the tool the model invoked, e.g. `Bash`, `Read`, `Edit`. */
	toolName: string;
	/** Accumulated partial JSON for the tool's `input` field. */
	inputJson: string;
	/** True once `tool-use-stop` arrived — `inputJson` is now complete. */
	done: boolean;
}>();

const { t } = useI18n();

/**
 * Pretty-print the input. While streaming, the JSON is partial and may
 * not parse — fall back to the raw string in that case. Once `done`,
 * the JSON should always parse; if it doesn't (provider sent malformed
 * input), show the raw string with a small warning.
 */
const displayInput = computed<{ text: string; parsed: boolean }>(() => {
	if (props.inputJson.length === 0) return { text: '', parsed: false };
	if (!props.done) return { text: props.inputJson, parsed: false };
	const parsed = trySync(() => JSON.parse(props.inputJson) as unknown);
	if (!parsed.ok) return { text: props.inputJson, parsed: false };
	return { text: JSON.stringify(parsed.value, null, 2), parsed: true };
});

const statusLabel = computed(() => (props.done ? '✓' : '⏳'));
const statusClass = computed(() => (props.done ? 'sp-tool-call--done' : 'sp-tool-call--streaming'));
</script>

<template>
	<details
		class="sp-tool-call"
		:class="statusClass"
		:open="!done"
		data-testid="agent-tool-call"
		:data-tool-name="toolName"
	>
		<summary class="sp-tool-call__summary" data-testid="agent-tool-call-summary">
			<span class="sp-tool-call__icon" aria-hidden="true">🔧</span>
			<span class="sp-tool-call__name">{{ toolName }}</span>
			<span class="sp-tool-call__status" :aria-label="done ? t('agent.toolDone') : t('agent.toolStreaming')">
				{{ statusLabel }}
			</span>
		</summary>
		<pre
			v-if="displayInput.text.length > 0"
			class="sp-tool-call__input"
			data-testid="agent-tool-call-input"
		>{{ displayInput.text }}</pre>
		<p
			v-else-if="!done"
			class="sp-tool-call__placeholder"
			data-testid="agent-tool-call-placeholder"
		>
			{{ t('agent.toolWaitingForInput') }}
		</p>
	</details>
</template>

<style scoped>
.sp-tool-call {
	margin: 0 0 0.375rem;
	padding: 0.375rem 0.5rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-secondary-alt, var(--background-secondary));
}

.sp-tool-call--streaming {
	border-color: var(--interactive-accent);
}

.sp-tool-call__summary {
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8125rem;
	color: var(--text-normal);
	list-style: none;
}

.sp-tool-call__summary::-webkit-details-marker {
	display: none;
}

.sp-tool-call__icon {
	font-size: 0.875rem;
}

.sp-tool-call__name {
	font-weight: 600;
	font-family: var(--font-monospace, ui-monospace, monospace);
}

.sp-tool-call__status {
	color: var(--text-muted);
	font-size: 0.75rem;
}

.sp-tool-call__input {
	margin: 0.375rem 0 0;
	padding: 0.375rem 0.5rem;
	background: var(--background-primary);
	border-radius: 3px;
	font-family: var(--font-monospace, ui-monospace, monospace);
	font-size: 0.75rem;
	white-space: pre-wrap;
	word-break: break-word;
	max-height: 240px;
	overflow-y: auto;
}

.sp-tool-call__placeholder {
	margin: 0.375rem 0 0;
	font-size: 0.75rem;
	color: var(--text-muted);
	font-style: italic;
}
</style>
