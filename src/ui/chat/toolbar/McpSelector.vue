<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { McpWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';

/**
 * The MCP selector honest seam (SPEC-TC-018, REQ-TC-021/022). Presentational —
 * props in, NO event that connects/toggles a server. Rendered only on a `visible`
 * slice (the strip hides it when `!supportsMcpTools`, REQ-TC-021). The shell shows
 * the MCP icon + a count-0 badge; opening reveals a VISIBLE-EMPTY "coming later"
 * panel (`mcp.empty`) — LISTS NO LIVE SERVER, toggles/connects nothing
 * (REQ-TC-022, SPEC-TC-029). No `obsidian`/`v-html`. Claudian ground-truth:
 * `McpServerSelector`.
 */
const props = defineProps<{ vm: McpWidgetVm }>();

const { t } = useI18n();

const visible = computed(() => props.vm.visibility.kind === 'visible');
const open = ref(false);

function onToggle(): void {
	open.value = !open.value;
}
</script>

<template>
	<div v-if="visible" class="sp-toolbar-mcp">
		<button
			type="button"
			class="sp-toolbar-mcp__shell"
			data-testid="toolbar-mcp"
			:aria-label="t('agent.chat.toolbar.mcp.label')"
			:aria-expanded="open ? 'true' : 'false'"
			@click="onToggle"
		>
			<span aria-hidden="true">🔌</span>
			<span class="sp-toolbar-mcp__badge">0</span>
		</button>
		<div v-if="open" class="sp-toolbar-mcp__empty" data-testid="toolbar-mcp-empty" role="note">
			{{ t('agent.chat.toolbar.mcp.empty') }}
		</div>
	</div>
</template>

<style scoped>
.sp-toolbar-mcp {
	position: relative;
	display: inline-flex;
}

.sp-toolbar-mcp__shell {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1);
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-toggle-track);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-muted);
	padding-inline: var(--sp-space-2);
	opacity: var(--sp-toolbar-disabled-opacity);
	cursor: pointer;
}

.sp-toolbar-mcp__badge {
	font-size: var(--sp-font-size-sm);
}

.sp-toolbar-mcp__empty {
	position: absolute;
	inset-block-end: calc(var(--sp-toolbar-widget-h) + var(--sp-space-1));
	inset-inline-start: 0;
	z-index: var(--sp-z-dropdown);
	min-inline-size: 16ch;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-surface-overlay);
	box-shadow: var(--sp-shadow-dropup);
	padding: var(--sp-space-2);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
