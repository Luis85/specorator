<script setup lang="ts">
/**
 * Collapsible thinking-mode display for extended-thinking model turns
 * (PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2).
 *
 * WS-AUX-5 refactor (REQ-AUX-013): wraps the body in `<NestedDetailFrame>`
 * so the 2 px inline-start border + indent live in one place. Per-block
 * border/indent CSS removed.
 *
 * Renders nothing when text is empty.
 *
 * Visual reference: Claudian's `ThinkingBlockRenderer.ts`
 * (https://github.com/YishenTu/claudian).
 */
import { useI18n } from 'vue-i18n';
import NestedDetailFrame from '@/ui/components/agent/NestedDetailFrame.vue';
import SpIcon from '@/ui/components/primitives/SpIcon.vue';

defineProps<{
	/** Accumulated thinking text from the active turn. */
	text: string;
}>();

const { t } = useI18n();
</script>

<template>
	<div v-if="text.length > 0" class="sp-thinking-block-host" data-testid="agent-thinking-block">
		<NestedDetailFrame
			class="sp-thinking-block"
			icon="brain"
			:label="t('agent.thinking')"
			status="running"
		>
			<template #summary>
				<span class="sp-thinking-block__summary" data-testid="agent-thinking-summary">
					<SpIcon name="brain" :size="14" class="sp-thinking-block__icon" />
					<span class="sp-thinking-block__label">{{ t('agent.thinking') }}</span>
				</span>
			</template>
			<pre class="sp-thinking-block__text" data-testid="agent-thinking-text">{{ text }}</pre>
		</NestedDetailFrame>
	</div>
</template>

<style scoped>
.sp-thinking-block {
	font-size: var(--sp-font-size-md);
}

.sp-thinking-block__summary {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-3);
}

.sp-thinking-block__icon {
	color: var(--sp-text-muted);
}

.sp-thinking-block__label {
	font-weight: var(--sp-font-weight-medium);
	color: var(--sp-text-normal);
}

.sp-thinking-block__text {
	margin: 0;
	padding: var(--sp-space-3) var(--sp-space-4);
	background-color: var(--sp-bg-primary);
	border-radius: var(--sp-radius-xs);
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
	white-space: pre-wrap;
	word-break: break-word;
	max-block-size: 240px;
	overflow-y: auto;
}
</style>
