<script setup lang="ts">
/**
 * `TodoList.vue` — agent sidepanel status-panel child component.
 *
 * Renders the latest task-tracker snapshot from `statusPanelStore.todos`
 * (REQ-MPS-030). Each row exposes its row-id testid so PageObject tests can
 * assert per-item behaviour without reaching for CSS selectors (ADR-009).
 */
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';

const { t } = useI18n();
const store = useStatusPanelStore();
const { todos } = storeToRefs(store);
</script>

<template>
	<div class="sp-status__todos" data-testid="todo-list">
		<h3 class="sp-status__heading">{{ t('status.todosHeading') }}</h3>
		<p
			v-if="todos.length === 0"
			class="sp-status__empty"
			data-testid="todo-list-empty"
		>
			{{ t('status.todosEmpty') }}
		</p>
		<ul v-else class="sp-status__todo-list">
			<li
				v-for="todo in todos"
				:key="todo.id"
				class="sp-status__todo-row"
				:class="`sp-status__todo-row--${todo.status}`"
				:data-testid="`todo-row-${todo.id}`"
			>
				<span class="sp-status__todo-status">{{ todo.status }}</span>
				<span class="sp-status__todo-title">{{ todo.title }}</span>
				<span
					v-if="todo.description"
					class="sp-status__todo-description"
				>{{ todo.description }}</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.sp-status__todos {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.sp-status__heading {
	margin: 0;
	font-size: 0.75rem;
	font-weight: 600;
	text-transform: uppercase;
	color: var(--sp-text-muted);
	letter-spacing: 0.05em;
}

.sp-status__empty {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--sp-text-muted);
	font-style: italic;
}

.sp-status__todo-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.sp-status__todo-row {
	display: grid;
	grid-template-columns: auto 1fr auto;
	gap: 0.375rem;
	padding: 0.25rem 0.375rem;
	border-radius: 4px;
	font-size: 0.8125rem;
}

.sp-status__todo-row--done {
	color: var(--sp-text-muted);
	text-decoration: line-through;
}

.sp-status__todo-row--in-progress {
	background: var(--sp-interactive-hover);
}

.sp-status__todo-status {
	font-size: 0.6875rem;
	text-transform: uppercase;
	color: var(--sp-text-faint, var(--sp-text-muted));
	letter-spacing: 0.04em;
}

.sp-status__todo-description {
	color: var(--sp-text-muted);
	font-size: 0.75rem;
}
</style>
