<script setup lang="ts">
/* eslint-disable no-warning-comments -- the domain noun "todo" (TodoList, TodoItem, TodoWrite, renderTodos) trips the 'todo' term scanner; not a deferral marker. */
import { computed } from 'vue';
import type { TodoItem } from '@/domain/chat/TodoItem';
import { renderTodos } from '@/application/chat/renderTodos';
import SpIcon from './SpIcon.vue';

/**
 * Renders the TodoWrite rows (SPEC-RR-028) — one row per `renderTodos` item: a
 * status icon (`SpIcon` from the `iconName`) and the row text (`activeForm`
 * gerund when `in_progress`, else `content`). Per-status colour rides a status
 * class over `--sp-todo-pending`/`--sp-todo-active`/`--sp-todo-done` tokens
 * (never raw colour, NFR-RR-007); status is also exposed as `data-status` so it
 * is never colour-only (NFR-RR-008). Empty list → no rows (EC-RR-6). Text via
 * `{{ }}` declarative spans — no `v-html` (NFR-RR-006). Mirrors claudian-main
 * `todoUtils.renderTodoItems`.
 */
const props = defineProps<{ todos: TodoItem[] }>();

const rows = computed(() => renderTodos(props.todos));
</script>

<template>
	<div class="sp-todo-list" data-testid="todo-list">
		<div
			v-for="(row, index) in rows"
			:key="index"
			class="sp-todo-list__row"
			:class="`sp-todo-list__row--${row.status}`"
			:data-status="row.status"
			data-testid="todo-row"
		>
			<SpIcon :name="row.iconName" class="sp-todo-list__icon" />
			<span class="sp-todo-list__text" data-testid="todo-row-text" dir="auto">{{ row.text }}</span>
		</div>
	</div>
</template>

<style scoped>
.sp-todo-list {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
}

.sp-todo-list__row {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
}

.sp-todo-list__icon {
	flex: 0 0 auto;
}

.sp-todo-list__row--pending {
	color: var(--sp-todo-pending);
}

.sp-todo-list__row--in_progress {
	color: var(--sp-todo-active);
	font-weight: var(--sp-font-weight-medium);
}

.sp-todo-list__row--completed {
	color: var(--sp-todo-done);
}

.sp-todo-list__row--pending .sp-todo-list__icon,
.sp-todo-list__row--in_progress .sp-todo-list__icon {
	scale: var(--sp-todo-dot-scale);
}

.sp-todo-list__text {
	unicode-bidi: plaintext;
}
</style>
