<script setup lang="ts">
/**
 * Inline tool-call display for streaming and completed tool_use blocks
 * (PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2).
 *
 * WS-AUX-5 refactor (REQ-AUX-013): wraps the body in `<NestedDetailFrame>`
 * so the 2 px inline-start border + indent live in one place. Per-block
 * border CSS removed.
 *
 * Renders a generic collapsible card per tool call: tool name in the
 * summary with a status indicator (⏳ in-flight, ✓ done), and the
 * accumulated `inputJson` rendered as pretty-printed JSON when complete
 * or as raw partial text while streaming.
 *
 * Visual reference: Claudian's `ToolCallRenderer.ts`
 * (https://github.com/YishenTu/claudian).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import NestedDetailFrame from '@/ui/components/agent/NestedDetailFrame.vue';
import SpIcon from '@/ui/components/primitives/SpIcon.vue';
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

const displayInput = computed<{ text: string; parsed: boolean }>(() => {
	if (props.inputJson.length === 0) return { text: '', parsed: false };
	if (!props.done) return { text: props.inputJson, parsed: false };
	const parsed = trySync(() => JSON.parse(props.inputJson) as unknown);
	if (!parsed.ok) return { text: props.inputJson, parsed: false };
	return { text: JSON.stringify(parsed.value, null, 2), parsed: true };
});

const statusLabel = computed(() => (props.done ? '✓' : '⏳'));
const frameStatus = computed<'running' | 'complete'>(() => (props.done ? 'complete' : 'running'));
</script>

<template>
	<div class="sp-tool-call-host" data-testid="agent-tool-call" :data-tool-name="toolName">
		<NestedDetailFrame
			class="sp-tool-call"
			icon="wrench"
			:label="toolName"
			:status="frameStatus"
			:default-expanded="!done"
		>
			<template #summary>
				<span class="sp-tool-call__summary" data-testid="agent-tool-call-summary">
					<SpIcon name="wrench" :size="14" class="sp-tool-call__icon" />
					<span class="sp-tool-call__name">{{ toolName }}</span>
					<span
						class="sp-tool-call__status"
						:aria-label="done ? t('agent.toolDone') : t('agent.toolStreaming')"
					>
						{{ statusLabel }}
					</span>
				</span>
			</template>
			<pre
				v-if="displayInput.text.length > 0"
				class="sp-tool-call__input"
				data-testid="agent-tool-call-input"
				>{{ displayInput.text }}</pre
			>
			<p
				v-else-if="!done"
				class="sp-tool-call__placeholder"
				data-testid="agent-tool-call-placeholder"
			>
				{{ t('agent.toolWaitingForInput') }}
			</p>
		</NestedDetailFrame>
	</div>
</template>

<style scoped>
.sp-tool-call-host {
	margin-block-end: var(--sp-space-3);
}

.sp-tool-call__summary {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-3);
	font-size: var(--sp-font-size-md);
	color: var(--sp-text-normal);
}

.sp-tool-call__icon {
	color: var(--sp-text-muted);
}

.sp-tool-call__name {
	font-weight: var(--sp-font-weight-semibold);
	font-family: var(--sp-font-mono);
}

.sp-tool-call__status {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-tool-call__input {
	margin: 0;
	padding: var(--sp-space-3) var(--sp-space-4);
	background-color: var(--sp-bg-primary);
	border-radius: var(--sp-radius-xs);
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	white-space: pre-wrap;
	word-break: break-word;
	max-block-size: 240px;
	overflow-y: auto;
}

.sp-tool-call__placeholder {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
	font-style: italic;
}
</style>
