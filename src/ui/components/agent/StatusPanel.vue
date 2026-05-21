<script setup lang="ts">
/**
 * `StatusPanel.vue` — collapsible container for agent status (todos + bash
 * history).
 *
 * Reads collapse state from `statusPanelStore.collapsedByThread` keyed on the
 * active `chatThreadsStore.activeThreadId`. Per REQ-MPS-033 the per-thread
 * preference survives thread switches without persisting to disk.
 *
 * Satisfies REQ-MPS-030..033.
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import TodoList from './TodoList.vue';
import BashHistoryList from './BashHistoryList.vue';

const { t } = useI18n();
const statusStore = useStatusPanelStore();
const threadsStore = useChatThreadsStore();
const { collapsedByThread } = storeToRefs(statusStore);
const { activeThreadId } = storeToRefs(threadsStore);

const collapsed = computed<boolean>(() => {
	const id = activeThreadId.value;
	if (id === null) return false;
	return collapsedByThread.value.get(id) === true;
});

const expanded = computed<boolean>(() => !collapsed.value);

function toggle(): void {
	const id = activeThreadId.value;
	if (id === null) return;
	statusStore.setCollapsed(id, !collapsed.value);
}
</script>

<template>
	<section class="sp-status" data-testid="status-panel" :aria-label="t('status.heading')">
		<button
			type="button"
			class="sp-status__header"
			data-testid="status-panel-header"
			:aria-expanded="expanded"
			aria-controls="status-panel-body"
			@click="toggle"
		>
			<span class="sp-status__title">{{ t('status.heading') }}</span>
			<span class="sp-status__chevron" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
		</button>
		<div
			v-if="expanded"
			id="status-panel-body"
			class="sp-status__body"
			data-testid="status-panel-body"
		>
			<TodoList />
			<BashHistoryList />
		</div>
	</section>
</template>

<style scoped>
.sp-status {
	display: flex;
	flex-direction: column;
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	background: var(--background-primary);
}

.sp-status__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	padding: 0.375rem 0.625rem;
	background: transparent;
	border: 0;
	border-radius: 6px;
	cursor: pointer;
	font-size: 0.8125rem;
	color: var(--text-normal);
	text-align: left;
}

.sp-status__header:hover {
	background: var(--background-modifier-hover);
}

.sp-status__title {
	font-weight: 600;
	text-transform: uppercase;
	font-size: 0.75rem;
	letter-spacing: 0.05em;
	color: var(--text-muted);
}

.sp-status__chevron {
	color: var(--text-muted);
	font-size: 0.75rem;
}

.sp-status__body {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding: 0.5rem 0.625rem 0.625rem;
	border-top: 1px solid var(--background-modifier-border);
}
</style>
