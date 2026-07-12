<script setup lang="ts">
import type { TodoItem } from '../../../../../../core/tools/todo';
import { getTodoDisplayText, getTodoStatusIcon } from '../../../../rendering/todoUtils';
import IconSpan from '../IconSpan.vue';

/**
 * Reproduces `rendering/todoUtils.ts`'s `renderTodoItems` DOM contract. The
 * parent `ToolCall.vue` owns the container classes
 * (`.specorator-todo-panel-content` / `.specorator-todo-list-container`,
 * mirroring `renderTodoWriteResult`'s `container.addClass(...)` calls before
 * delegating here) since this component renders items as roots with no
 * wrapper element of its own, matching the legacy renderer appending items
 * directly into that same container.
 */
defineProps<{ todos: TodoItem[] | undefined }>();
</script>

<template>
  <template v-if="todos">
    <div
      v-for="(todo, i) in todos"
      :key="i"
      class="specorator-todo-item"
      :class="`specorator-todo-${todo.status}`"
    >
      <IconSpan
        :icon="getTodoStatusIcon(todo.status)"
        css-class="specorator-todo-status-icon"
        :aria-hidden="true"
      />
      <span class="specorator-todo-text">{{ getTodoDisplayText(todo) }}</span>
    </div>
  </template>
  <span
    v-else
    class="specorator-tool-result-item"
  >Tasks updated</span>
</template>
