<script setup lang="ts">
import { computed } from 'vue';
import { useChatStore } from '@/ui/stores/chatStore';

/**
 * Turn-level token usage (SPEC-RR-031) — NOT a content block. Reads
 * `chatStore.usage` (the DTO P1 stored, SPEC-CC-016) and renders the context
 * tokens used, ~percentage of the context window, and an optional model name as
 * `--sp-*`-tokened declarative text (REQ-RR-024). EC-RR-12 / REQ-RR-024a: when
 * `usage === null` the component renders NOTHING (no element, no zero-token
 * placeholder). When `contextWindow` is missing/zero the percentage is omitted
 * gracefully and tokens show alone. This is the simple inline token display, NOT
 * the P6 240° arc context-meter widget (NG5). Declarative text only — no
 * `v-html` (NFR-RR-006). Mirrors claudian-main `utils/usageInfo`.
 */
const store = useChatStore();

const usage = computed(() => store.usage);

const hasPercentage = computed(() => (usage.value?.contextWindow ?? 0) > 0);
</script>

<template>
	<div v-if="usage" class="sp-usage" data-testid="usage-info">
		<span class="sp-usage__tokens" data-testid="usage-tokens"
			>{{ usage.contextTokens }} tokens</span
		>
		<span v-if="hasPercentage" class="sp-usage__percentage" data-testid="usage-percentage"
			>{{ usage.percentage }}%</span
		>
		<span v-if="usage.model" class="sp-usage__model" data-testid="usage-model" dir="auto">{{
			usage.model
		}}</span>
	</div>
</template>

<style scoped>
.sp-usage {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-xs);
}

.sp-usage__model {
	unicode-bidi: plaintext;
}
</style>
