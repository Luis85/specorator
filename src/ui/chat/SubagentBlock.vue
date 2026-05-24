<script setup lang="ts">
import { computed } from 'vue';
import type { SubagentInfo } from '@/domain/chat/Subagent';
import { resolveSubagentLifecycle } from '@/application/chat/resolveSubagentLifecycle';
import SpCollapsible from './SpCollapsible.vue';
import SpIcon from './SpIcon.vue';
import ToolCallBlock from './ToolCallBlock.vue';
import MarkdownBlock from './MarkdownBlock.vue';

/**
 * Renders a Claude `Task`/`Agent` subagent (SPEC-RR-030). Wraps `SpCollapsible`
 * (accent `bot` icon) and contains its own collapsible prompt/result sections
 * plus the nested `toolCalls`, each rendered via `ToolCallBlock` (smaller
 * `--sp-font-size-xs` scale, reusing the primitive). The result body scrolls
 * within `--sp-subagent-result-max-height`.
 *
 * The async status pill (`data-testid="subagent-status"`) is coloured by the
 * resolved `asyncStatus` via `--sp-state-*` tokens and NAMES the state (never
 * colour-only — NFR-RR-008); the sync-vs-async lifecycle is classified by
 * `resolveSubagentLifecycle` (SPEC-RR-017) — sync subagents show their nested
 * tools inline with no pill. EC-RR-10: an `error` + no result yields the error
 * pill with an empty result section. EC-RR-11: a spawn with no result by turn
 * end is `orphaned`. Declarative text + `MarkdownBlock` only — no `v-html`
 * (NFR-RR-006). Mirrors claudian-main `SubagentRenderer`.
 */
const props = defineProps<{ subagent: SubagentInfo }>();

const lifecycle = computed(() => resolveSubagentLifecycle(props.subagent));

/** The async pill state, or `null` for a sync subagent (no pill). */
const asyncStatus = computed(() =>
	lifecycle.value.mode === 'async' ? lifecycle.value.asyncStatus : null,
);

const label = computed(() => props.subagent.description || 'Subagent');

const hasPrompt = computed(() => Boolean(props.subagent.prompt));
const hasResult = computed(() => Boolean(props.subagent.result));
</script>

<template>
	<div class="sp-subagent" data-testid="subagent-block">
		<SpCollapsible :label="label">
			<template #header>
				<div class="sp-subagent__header">
					<SpIcon name="bot" class="sp-subagent__icon" />
					<span class="sp-subagent__name" dir="auto">{{ label }}</span>
					<span
						v-if="asyncStatus"
						class="sp-subagent__status"
						:class="`sp-subagent__status--${asyncStatus}`"
						:data-state="asyncStatus"
						data-testid="subagent-status"
						>{{ asyncStatus }}</span
					>
				</div>
			</template>

			<div class="sp-subagent__body">
				<SpCollapsible v-if="hasPrompt" label="Prompt">
					<template #header>
						<span class="sp-subagent__section-label">Prompt</span>
					</template>
					<div data-testid="subagent-prompt">
						<MarkdownBlock :content="subagent.prompt ?? ''" />
					</div>
				</SpCollapsible>

				<SpCollapsible label="Result">
					<template #header>
						<span class="sp-subagent__section-label">Result</span>
					</template>
					<div class="sp-subagent__result" data-testid="subagent-result" dir="auto">
						<MarkdownBlock v-if="hasResult" :content="subagent.result ?? ''" />
					</div>
				</SpCollapsible>

				<div v-if="subagent.toolCalls.length > 0" class="sp-subagent__tools">
					<ToolCallBlock
						v-for="tool in subagent.toolCalls"
						:key="tool.id"
						:tool-call="tool"
					/>
				</div>
			</div>
		</SpCollapsible>
	</div>
</template>

<style scoped>
.sp-subagent__header {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	inline-size: 100%;
}

.sp-subagent__icon {
	flex: 0 0 auto;
	color: var(--sp-accent);
}

.sp-subagent__name {
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-medium);
	unicode-bidi: plaintext;
}

.sp-subagent__status {
	margin-inline-start: auto;
	font-size: var(--sp-font-size-xs);
	font-weight: var(--sp-font-weight-medium);
	padding-inline: var(--sp-space-2);
	border-radius: var(--sp-radius-sm);
}

.sp-subagent__status--pending {
	color: var(--sp-state-pending);
}

.sp-subagent__status--running {
	color: var(--sp-state-running);
}

.sp-subagent__status--completed {
	color: var(--sp-state-completed);
}

.sp-subagent__status--error {
	color: var(--sp-state-error);
}

.sp-subagent__status--orphaned {
	color: var(--sp-state-orphaned);
}

.sp-subagent__body {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
}

.sp-subagent__section-label {
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-subagent__result {
	max-block-size: var(--sp-subagent-result-max-height);
	overflow: auto;
}

.sp-subagent__tools {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	font-size: var(--sp-font-size-xs);
}
</style>
