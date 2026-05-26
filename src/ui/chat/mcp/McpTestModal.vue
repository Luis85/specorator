<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ManagedMcpServer, McpTestResult } from '@/domain/chat/mcp/McpTypes';
import { useMcpClientPort } from '@/ui/composables/useMcpClientPort';

/**
 * The MCP test-result modal with the SPEC-MC-028 state machine (SPEC-MC-017,
 * REQ-MC-016/023/030..034/044/070/072). On mount it runs the probe through the
 * injected `McpClientPort` and renders one of five states: running → success
 * (server header + per-tool enable/disable toggles) / partial (success, empty
 * tool list) / timeout / error / unavailable. A per-tool toggle emits
 * `set-tool-disabled:[tool, disabled]` (the surface calls `setToolDisabled`,
 * REQ-MC-016); a polite live region announces the running → result transition
 * (REQ-MC-070, NFR-MC-008). NO server secret (env/auth value) appears in any
 * rendered text — only the tool names + the friendly category message
 * (REQ-MC-072). No `obsidian`/`v-html`. Claudian ground-truth: `McpTestModal`.
 */
const props = defineProps<{ server: ManagedMcpServer }>();
const emit = defineEmits<{
	'set-tool-disabled': [tool: string, disabled: boolean];
	close: [];
}>();

const { t } = useI18n();
const client = useMcpClientPort();

type TestState = 'running' | 'success' | 'timeout' | 'error' | 'unavailable';

const state = ref<TestState>('running');
const result = ref<McpTestResult | null>(null);

const disabledTools = computed(() => new Set(props.server.disabledTools ?? []));

const serverHeader = computed(() => {
	const r = result.value;
	if (r === null) return '';
	return t('agent.chat.mcp.test.server', {
		name: r.serverName ?? props.server.name,
		version: r.serverVersion ?? '',
	}).trim();
});

const errorMessage = computed(() => result.value?.error ?? '');

const liveMessage = computed(() => {
	switch (state.value) {
		case 'running':
			return t('agent.chat.mcp.test.running');
		case 'success':
			return t('agent.chat.mcp.test.successTitle');
		case 'timeout':
			return t('agent.chat.mcp.test.timeout');
		case 'unavailable':
			return t('agent.chat.mcp.test.unavailable');
		case 'error':
		default:
			return errorMessage.value;
	}
});

function classify(r: McpTestResult): TestState {
	if (r.success) return 'success';
	const error = (r.error ?? '').toLowerCase();
	if (error.includes('timeout')) return 'timeout';
	if (error.includes('unavailable')) return 'unavailable';
	return 'error';
}

onMounted(() => {
	if (!client.isAvailable()) {
		state.value = 'unavailable';
		return;
	}
	void client.test(props.server).then((r) => {
		result.value = r;
		state.value = classify(r);
	});
});

function isToolEnabled(tool: string): boolean {
	return !disabledTools.value.has(tool);
}

function onToggleTool(tool: string, event: Event): void {
	const enabled = (event.target as HTMLInputElement).checked;
	emit('set-tool-disabled', tool, !enabled);
}
</script>

<template>
	<div
		class="sp-mcp-test"
		data-testid="mcp-test-modal"
		role="dialog"
		aria-modal="true"
		:aria-label="t('agent.chat.mcp.test.title')"
	>
		<p class="sp-mcp-test__live" aria-live="polite" role="status">{{ liveMessage }}</p>

		<p v-if="state === 'running'" class="sp-mcp-test__running" data-testid="mcp-test-running">
			{{ t('agent.chat.mcp.test.running') }}
		</p>

		<section
			v-else-if="state === 'success'"
			class="sp-mcp-test__success"
			data-testid="mcp-test-success"
		>
			<p class="sp-mcp-test__header">{{ serverHeader }}</p>
			<p v-if="(result?.tools.length ?? 0) === 0" class="sp-mcp-test__partial">
				{{ t('agent.chat.mcp.test.partial') }}
			</p>
			<ul v-else class="sp-mcp-test__tools">
				<li v-for="tool in result?.tools ?? []" :key="tool.name" data-testid="mcp-test-tool">
					<label class="sp-mcp-test__tool">
						<input
							type="checkbox"
							data-testid="mcp-test-tool-toggle"
							:checked="isToolEnabled(tool.name)"
							:aria-label="t('agent.chat.mcp.test.toolToggle', { tool: tool.name })"
							@change="onToggleTool(tool.name, $event)"
						/>
						<span dir="auto">{{ tool.name }}</span>
					</label>
				</li>
			</ul>
		</section>

		<p
			v-else-if="state === 'unavailable'"
			class="sp-mcp-test__unavailable"
			data-testid="mcp-test-unavailable"
		>
			{{ t('agent.chat.mcp.test.unavailable') }}
		</p>

		<p v-else class="sp-mcp-test__error" data-testid="mcp-test-error" role="alert">
			{{ state === 'timeout' ? t('agent.chat.mcp.test.timeout') : errorMessage }}
		</p>

		<div class="sp-mcp-test__actions">
			<button type="button" data-testid="mcp-test-close" @click="emit('close')">
				{{ t('agent.chat.mcp.test.close') }}
			</button>
		</div>
	</div>
</template>

<style scoped>
.sp-mcp-test {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
}

.sp-mcp-test__live {
	position: absolute;
	inline-size: 1px;
	block-size: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}

.sp-mcp-test__running {
	margin: 0;
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-mcp-test__header {
	margin: 0;
	font-weight: var(--sp-font-weight-semibold);
	color: var(--sp-mcp-status-ok);
}

.sp-mcp-test__partial {
	margin: 0;
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-mcp-test__tools {
	display: flex;
	flex-direction: column;
	gap: var(--sp-mcp-row-gap);
	margin: 0;
	padding: 0;
	list-style: none;
}

.sp-mcp-test__tool {
	display: flex;
	align-items: center;
	gap: var(--sp-space-1);
	font-size: var(--sp-font-size-sm);
}

.sp-mcp-test__error {
	margin: 0;
	color: var(--sp-mcp-status-error);
	font-size: var(--sp-font-size-sm);
}

.sp-mcp-test__unavailable {
	margin: 0;
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-mcp-test__actions {
	display: flex;
	justify-content: flex-end;
}
</style>
