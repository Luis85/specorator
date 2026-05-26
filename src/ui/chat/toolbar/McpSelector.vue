<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { McpViewModel } from '@/application/chat/mcp/buildMcpViewModel';

/**
 * The MCP selector (SPEC-MC-018, extends the P6 SPEC-TC-018 seam). Presentational —
 * props in (`vm: McpViewModel`, replacing the P6 `McpWidgetVm`), `set-enabled:[name,
 * enabled]` out. Hidden when `!vm.supported` (the P6 `supportsMcpTools` gate,
 * REQ-MC-041). At `empty-seam` (no server configured) the P6 VISIBLE-EMPTY seam is
 * KEPT byte-identical: the 🔌 shell + a count-0 badge + the
 * `agent.chat.toolbar.mcp.empty` "coming later" panel on open, no live server, no
 * emit (REQ-MC-082, EC-MC-1). At `live` (≥ 1 server) the dropdown lists every server
 * with its enabled toggle + transport type, the badge shows `vm.enabledCount` via
 * `agent.chat.mcp.selector.badge`, and toggling emits `set-enabled` (REQ-MC-050/051,
 * EC-MC-8). Keeps the P6 `aria-expanded`; each toggle is keyboard-operable + exposes
 * its enabled state (REQ-MC-070, NFR-MC-008). No `obsidian`/`v-html`. Claudian
 * ground-truth: `McpServerSelector`.
 */
const props = defineProps<{ vm: McpViewModel }>();
const emit = defineEmits<{ 'set-enabled': [name: string, enabled: boolean] }>();

const { t } = useI18n();

const visible = computed(() => props.vm.supported);
const isLive = computed(() => props.vm.kind === 'live');
const badgeText = computed(() =>
	isLive.value ? t('agent.chat.mcp.selector.badge', { count: props.vm.enabledCount }) : '0',
);
const open = ref(false);

function onToggle(): void {
	open.value = !open.value;
}

function onToggleServer(name: string, event: Event): void {
	emit('set-enabled', name, (event.target as HTMLInputElement).checked);
}
</script>

<template>
	<div v-if="visible" class="sp-toolbar-mcp">
		<button
			type="button"
			class="sp-toolbar-mcp__shell"
			:class="{ 'sp-toolbar-mcp__shell--empty': !isLive }"
			data-testid="toolbar-mcp"
			:aria-label="t('agent.chat.toolbar.mcp.label')"
			:aria-expanded="open ? 'true' : 'false'"
			@click="onToggle"
		>
			<span aria-hidden="true">🔌</span>
			<span class="sp-toolbar-mcp__badge" data-testid="mcp-selector-badge">{{ badgeText }}</span>
		</button>

		<div
			v-if="open && !isLive"
			class="sp-toolbar-mcp__empty"
			data-testid="toolbar-mcp-empty"
			role="note"
		>
			{{ t('agent.chat.toolbar.mcp.empty') }}
		</div>

		<ul v-else-if="open" class="sp-toolbar-mcp__list" role="group">
			<li
				v-for="server in vm.servers"
				:key="server.name"
				class="sp-toolbar-mcp__server"
				data-testid="mcp-selector-server"
			>
				<label class="sp-toolbar-mcp__server-label">
					<input
						type="checkbox"
						data-testid="mcp-selector-toggle"
						:checked="server.enabled"
						:aria-label="t('agent.chat.mcp.row.enabled', { name: server.name })"
						@change="onToggleServer(server.name, $event)"
					/>
					<span class="sp-toolbar-mcp__server-name" dir="auto">{{ server.name }}</span>
					<span class="sp-toolbar-mcp__server-type">{{
						t(`agent.chat.mcp.row.type.${server.type}`)
					}}</span>
				</label>
			</li>
		</ul>
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
	cursor: pointer;
}

.sp-toolbar-mcp__shell--empty {
	opacity: var(--sp-toolbar-disabled-opacity);
}

.sp-toolbar-mcp__badge {
	font-size: var(--sp-font-size-sm);
	color: var(--sp-mcp-selector-badge);
}

.sp-toolbar-mcp__empty,
.sp-toolbar-mcp__list {
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

.sp-toolbar-mcp__list {
	display: flex;
	flex-direction: column;
	gap: var(--sp-mcp-row-gap);
	margin: 0;
	list-style: none;
}

.sp-toolbar-mcp__server-label {
	display: flex;
	align-items: center;
	gap: var(--sp-space-1);
}

.sp-toolbar-mcp__server-name {
	font-weight: var(--sp-font-weight-semibold);
}

.sp-toolbar-mcp__server-type {
	font-family: var(--sp-font-mono);
	margin-inline-start: auto;
}
</style>
