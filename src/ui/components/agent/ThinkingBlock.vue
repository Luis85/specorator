<script setup lang="ts">
/**
 * Collapsible thinking-mode display for extended-thinking model turns
 * (PR-ASV-2-tool-rendering, agent-sidepanel-v2 Increment 2). Driven by
 * `chatStore.streamingThinking`, populated by the SDK adapter's
 * `thinking` `StreamDelta` variant.
 *
 * Renders nothing when text is empty. When non-empty, shows a
 * collapsed `<details>` block with the streamed thinking text inside.
 * Users can expand to see the model's reasoning without it dominating
 * the chat surface.
 *
 * Visual reference: Claudian's `ThinkingBlockRenderer.ts`
 * (https://github.com/YishenTu/claudian).
 */
import { useI18n } from 'vue-i18n';

defineProps<{
	/** Accumulated thinking text from the active turn. */
	text: string;
}>();

const { t } = useI18n();
</script>

<template>
	<details v-if="text.length > 0" class="sp-thinking-block" data-testid="agent-thinking-block">
		<summary class="sp-thinking-block__summary" data-testid="agent-thinking-summary">
			<span class="sp-thinking-block__icon" aria-hidden="true">💭</span>
			<span class="sp-thinking-block__label">{{ t('agent.thinking') }}</span>
		</summary>
		<pre class="sp-thinking-block__text" data-testid="agent-thinking-text">{{ text }}</pre>
	</details>
</template>

<style scoped>
.sp-thinking-block {
	margin: 0 0 0.5rem;
	padding: 0.375rem 0.5rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-secondary-alt, var(--background-secondary));
	font-size: 0.8125rem;
}

.sp-thinking-block__summary {
	cursor: pointer;
	color: var(--text-muted);
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	list-style: none;
}

.sp-thinking-block__summary::-webkit-details-marker {
	display: none;
}

.sp-thinking-block__icon {
	font-size: 0.875rem;
}

.sp-thinking-block__label {
	font-weight: 500;
}

.sp-thinking-block__text {
	margin: 0.375rem 0 0;
	padding: 0.375rem 0.5rem;
	background: var(--background-primary);
	border-radius: 3px;
	font-family: var(--font-monospace, ui-monospace, monospace);
	font-size: 0.75rem;
	color: var(--text-muted);
	white-space: pre-wrap;
	word-break: break-word;
	max-height: 240px;
	overflow-y: auto;
}
</style>
