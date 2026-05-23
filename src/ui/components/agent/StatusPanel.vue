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
const { collapsedByThread, todos, bashHistory } = storeToRefs(statusStore);
const { activeThreadId } = storeToRefs(threadsStore);

const collapsed = computed<boolean>(() => {
	const id = activeThreadId.value;
	if (id === null) return false;
	return collapsedByThread.value.get(id) === true;
});

const expanded = computed<boolean>(() => !collapsed.value);

/**
 * G5 polish — Claudian parity: don't render the status panel chrome when
 * there is nothing to show. The panel only earns its screen real estate
 * when the agent has emitted at least one task OR one bash invocation on
 * the active thread. Side benefit: the empty-state welcome view no longer
 * has a vestigial "STATUS" stripe glued to the bottom that pushed the
 * composer off-screen.
 */
const hasContent = computed<boolean>(() => {
	return todos.value.length > 0 || bashHistory.value.length > 0;
});

function toggle(): void {
	const id = activeThreadId.value;
	if (id === null) return;
	statusStore.setCollapsed(id, !collapsed.value);
}
</script>

<template>
	<section
		v-if="hasContent"
		class="sp-status"
		data-testid="status-panel"
		:aria-label="t('status.heading')"
	>
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
/*
 * WS-AUX-7 (REQ-AUX-011): StatusPanel now lives inside a shared
 * `.sp-composer-group` container with AttachmentStrip + ChatInput so the
 * three render as a single bordered region. The panel itself drops its own
 * border (the group draws the chrome) and owns its body scroll so a long
 * todo / bash-history list never pushes the composer off-screen.
 */
.sp-status {
	display: flex;
	flex-direction: column;
	background: transparent;
	color: var(--sp-text-normal, var(--sp-text-normal));
}

.sp-status__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--sp-space-2, 0.5rem);
	padding-block: var(--sp-space-2, 0.375rem);
	padding-inline: var(--sp-space-3, 0.625rem);
	background: transparent;
	border: 0;
	border-radius: var(--sp-radius-sm, 6px);
	cursor: pointer;
	font-size: var(--sp-font-size-sm, 0.8125rem);
	color: var(--sp-text-normal, var(--sp-text-normal));
	text-align: start;
}

.sp-status__header:hover {
	background: var(--sp-bg-hover, var(--sp-interactive-hover));
}

.sp-status__title {
	font-weight: 600;
	text-transform: uppercase;
	font-size: var(--sp-font-size-xs, 0.75rem);
	letter-spacing: 0.05em;
	color: var(--sp-text-muted, var(--sp-text-muted));
}

.sp-status__chevron {
	color: var(--sp-text-muted, var(--sp-text-muted));
	font-size: var(--sp-font-size-xs, 0.75rem);
}

.sp-status__body {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-3, 0.75rem);
	padding-block-start: var(--sp-space-2, 0.5rem);
	padding-block-end: var(--sp-space-3, 0.625rem);
	padding-inline: var(--sp-space-3, 0.625rem);
	border-block-start: 1px solid var(--sp-border, var(--sp-border));
	/*
	 * Own scroll container — the panel can grow large with many todos /
	 * bash entries, but must not push the composer off-screen. Cap at
	 * min(40vh, 320px); contain overscroll so wheel events don't bleed
	 * into the parent message list.
	 */
	max-height: min(40vh, 320px);
	overflow-y: auto;
	overscroll-behavior: contain;
}
</style>
