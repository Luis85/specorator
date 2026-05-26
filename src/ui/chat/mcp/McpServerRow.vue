<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { McpServerVm } from '@/application/chat/mcp/buildMcpViewModel';

/**
 * One managed-server row (SPEC-MC-015, REQ-MC-013/014/070). Presentational —
 * props in (`server: McpServerVm`), events out (`set-enabled:[enabled]` /
 * `edit` / `remove` / `test`). Renders the server name, the transport type as
 * TEXT (not colour-alone, NFR-MC-008), an enabled checkbox toggle, and the
 * edit/remove/test actions — each a focusable control with an accessible name
 * carrying the server name (REQ-MC-070). No `obsidian`/`v-html`. Claudian
 * ground-truth: `McpSettingsManager` row.
 */
const props = defineProps<{ server: McpServerVm }>();
const emit = defineEmits<{
	'set-enabled': [enabled: boolean];
	edit: [];
	remove: [];
	test: [];
}>();

const { t } = useI18n();

const typeLabel = computed(() => t(`agent.chat.mcp.row.type.${props.server.type}`));
const enabledLabel = computed(() => t('agent.chat.mcp.row.enabled', { name: props.server.name }));
const editLabel = computed(() => t('agent.chat.mcp.row.edit', { name: props.server.name }));
const removeLabel = computed(() => t('agent.chat.mcp.row.remove', { name: props.server.name }));
const testLabel = computed(() => t('agent.chat.mcp.row.test', { name: props.server.name }));

function onToggle(event: Event): void {
	emit('set-enabled', (event.target as HTMLInputElement).checked);
}
</script>

<template>
	<li class="sp-mcp-row" data-testid="mcp-server-row">
		<label class="sp-mcp-row__toggle">
			<input
				type="checkbox"
				data-testid="mcp-server-enabled"
				:checked="server.enabled"
				:aria-label="enabledLabel"
				@change="onToggle"
			/>
		</label>
		<span class="sp-mcp-row__name" data-testid="mcp-server-name" dir="auto">{{ server.name }}</span>
		<span class="sp-mcp-row__type" data-testid="mcp-server-type">{{ typeLabel }}</span>
		<span class="sp-mcp-row__actions">
			<button
				type="button"
				class="sp-mcp-row__action"
				data-testid="mcp-server-test"
				:aria-label="testLabel"
				@click="emit('test')"
			>
				{{ testLabel }}
			</button>
			<button
				type="button"
				class="sp-mcp-row__action"
				data-testid="mcp-server-edit"
				:aria-label="editLabel"
				@click="emit('edit')"
			>
				{{ editLabel }}
			</button>
			<button
				type="button"
				class="sp-mcp-row__action"
				data-testid="mcp-server-remove"
				:aria-label="removeLabel"
				@click="emit('remove')"
			>
				{{ removeLabel }}
			</button>
		</span>
	</li>
</template>

<style scoped>
.sp-mcp-row {
	display: flex;
	align-items: center;
	gap: var(--sp-mcp-row-gap);
	font-size: var(--sp-font-size-sm);
}

.sp-mcp-row__toggle {
	display: inline-flex;
	align-items: center;
}

.sp-mcp-row__name {
	font-weight: var(--sp-font-weight-semibold);
}

.sp-mcp-row__type {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	padding-inline: var(--sp-space-1);
	color: var(--sp-text-muted);
	font-family: var(--sp-font-mono);
}

.sp-mcp-row__actions {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1);
	margin-inline-start: auto;
}

.sp-mcp-row__action {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
}
</style>
