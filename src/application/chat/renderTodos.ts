/* eslint-disable no-warning-comments -- the domain noun "todo" (TodoItem, renderTodos, input.todos) trips the 'todo' term scanner; not a deferral marker. */
import { isValidTodoItem, type TodoItem } from '@/domain/chat/TodoItem';

/**
 * `renderTodos` / `parseTodos` — pure presentation for the TodoWrite tool's rows
 * (SPEC-RR-016).
 *
 * Reproduces claudian-main `getTodoStatusIcon`/`getTodoDisplayText`
 * (`todoUtils.ts:5/9`) + `parseTodoInput` (`todo.ts:30`). Returns the icon NAME
 * only (the IconPort resolves it to a node — NFR-RR-006); never touches the DOM.
 * **Pure, total, never throws** (NFR-RR-003/005): malformed/absent input yields
 * an empty list (EC-RR-6). No `obsidian`/Vue import.
 */
export interface TodoRow {
	/** Status icon NAME for the IconPort (`'check'` when completed, else `'dot'`). */
	iconName: 'check' | 'dot';
	status: TodoItem['status'];
	/** Gerund (`activeForm`) when in_progress, else `content` (`todoUtils.ts:9`). */
	text: string;
}

/** Map each item to its display row (parity `getTodoStatusIcon`/`getTodoDisplayText`). */
export function renderTodos(todos: TodoItem[]): TodoRow[] {
	return todos.map((todo) => ({
		iconName: todo.status === 'completed' ? 'check' : 'dot',
		status: todo.status,
		text: todo.status === 'in_progress' ? todo.activeForm : todo.content,
	}));
}

/**
 * Read `input.todos`, keeping only guard-valid items (SPEC-RR-007 guard); returns
 * `[]` when absent, non-array, or all-invalid (EC-RR-6, no throw).
 */
export function parseTodos(input: Record<string, unknown>): TodoItem[] {
	const raw = input.todos;
	if (!Array.isArray(raw)) return [];
	return raw.filter(isValidTodoItem);
}
