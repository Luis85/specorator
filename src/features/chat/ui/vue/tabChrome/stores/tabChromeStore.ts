import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { TodoItem } from '../../../../../../core/tools/todo';
import type { PanelBashOutput } from '../../../../state/BashOutputStore';

/**
 * Reactive read-model over one tab's chrome (todos + bang-bash outputs). Truth
 * + I/O stay in ChatState.currentTodos / BashOutputStore; every setter replaces
 * a whole value/array (shallowRef). Mirrors useComposerStore's contract.
 */
export const useTabChromeStore = defineStore('tab-chrome', () => {
  const todos = shallowRef<TodoItem[] | null>(null);
  const bashOutputs = shallowRef<PanelBashOutput[]>([]);

  function setTodos(next: TodoItem[] | null): void { todos.value = next; }
  function setBashOutputs(next: PanelBashOutput[]): void { bashOutputs.value = next; }

  return { todos, bashOutputs, setTodos, setBashOutputs };
});
