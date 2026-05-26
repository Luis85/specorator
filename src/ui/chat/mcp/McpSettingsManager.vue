<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { McpViewModel } from '@/application/chat/mcp/buildMcpViewModel';
import McpServerRow from './McpServerRow.vue';

/**
 * The managed-server list surface (SPEC-MC-015, REQ-MC-040/041/013/014).
 * Presentational + LIVE — re-renders on `vm` prop change. Renders nothing when
 * `!vm.supported` (the `supportsMcpTools` gate, REQ-MC-041); the empty state +
 * add/paste affordances at `empty-seam` (REQ-MC-040); one `McpServerRow` per
 * server at `live`, re-emitting each row's `edit`/`remove`/`test`/`set-enabled`
 * up to the surface (REQ-MC-013/014). No `obsidian`/`v-html`. Claudian
 * ground-truth: `McpSettingsManager`.
 */
const props = defineProps<{ vm: McpViewModel }>();
const emit = defineEmits<{
	add: [];
	paste: [];
	edit: [name: string];
	remove: [name: string];
	test: [name: string];
	'set-enabled': [name: string, enabled: boolean];
}>();

const { t } = useI18n();

const supported = computed(() => props.vm.supported);
const isEmpty = computed(() => props.vm.kind === 'empty-seam');
</script>

<template>
	<section
		v-if="supported"
		class="sp-mcp-settings"
		data-testid="mcp-settings"
		:aria-label="t('agent.chat.mcp.settings.title')"
	>
		<h3 class="sp-mcp-settings__title">{{ t('agent.chat.mcp.settings.title') }}</h3>

		<p v-if="isEmpty" class="sp-mcp-settings__empty" data-testid="mcp-settings-empty">
			{{ t('agent.chat.mcp.settings.empty') }}
		</p>
		<ul v-else class="sp-mcp-settings__rows">
			<McpServerRow
				v-for="server in vm.servers"
				:key="server.name"
				:server="server"
				@edit="emit('edit', server.name)"
				@remove="emit('remove', server.name)"
				@test="emit('test', server.name)"
				@set-enabled="emit('set-enabled', server.name, $event)"
			/>
		</ul>

		<div class="sp-mcp-settings__actions">
			<button
				type="button"
				class="sp-mcp-settings__action"
				data-testid="mcp-settings-add"
				@click="emit('add')"
			>
				{{ t('agent.chat.mcp.settings.add') }}
			</button>
			<button
				type="button"
				class="sp-mcp-settings__action"
				data-testid="mcp-settings-paste"
				@click="emit('paste')"
			>
				{{ t('agent.chat.mcp.settings.paste') }}
			</button>
		</div>
	</section>
</template>

<style scoped>
.sp-mcp-settings {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
}

.sp-mcp-settings__title {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-semibold);
}

.sp-mcp-settings__empty {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-mcp-settings__rows {
	display: flex;
	flex-direction: column;
	gap: var(--sp-mcp-row-gap);
	margin: 0;
	padding: 0;
	list-style: none;
}

.sp-mcp-settings__actions {
	display: flex;
	gap: var(--sp-space-2);
}

.sp-mcp-settings__action {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: transparent;
	color: var(--sp-text-normal);
	padding-inline: var(--sp-space-2);
	cursor: pointer;
}
</style>
