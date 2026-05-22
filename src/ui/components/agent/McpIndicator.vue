<script setup lang="ts">
/**
 * `McpIndicator.vue` — small chip showing whether one or more MCP
 * (Model Context Protocol) servers are active. Glows with the
 * `mcp-glow` keyframe while `mcpStatusStore.active` is true.
 *
 * REQ-AUX-004, SPEC-AUX-001 §1.3 / animations.css `mcp-glow`.
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

import { useMcpStatusStore } from '@/ui/stores/mcpStatusStore';
import SpIcon from '@/ui/components/primitives/SpIcon.vue';

const { t } = useI18n();
const store = useMcpStatusStore();
const { active, count } = storeToRefs(store);

const tooltip = computed<string>(() => t('agent.composer.mcp.label'));
</script>

<template>
	<span
		class="sp-mcp-indicator"
		data-testid="mcp-indicator"
		:data-active="active ? 'true' : 'false'"
		:title="tooltip"
		role="status"
		:aria-label="tooltip"
	>
		<SpIcon name="zap" :size="12" />
		<span
			v-if="count > 0"
			class="sp-mcp-indicator__count"
			data-testid="mcp-indicator-count"
		>{{ count }}</span>
	</span>
</template>

<style>
.sp-mcp-indicator {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1);
	padding-block: 2px;
	padding-inline: var(--sp-space-2);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-pill);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-xs);
	line-height: 1;
}
.sp-mcp-indicator[data-active='true'] {
	border-color: var(--sp-brand);
	color: var(--sp-brand);
	animation: mcp-glow 1.6s var(--sp-ease) infinite;
}
.sp-mcp-indicator__count {
	font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
	.sp-mcp-indicator[data-active='true'] {
		animation: none;
	}
}
</style>
