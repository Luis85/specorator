/* eslint-disable no-warning-comments -- the domain noun "todo" (TodoItem, input.todos, todo.ts) trips the 'todo' term scanner; not a deferral marker. */
/**
 * Todo tool item (SPEC-RR-007). Mirrors claudian-main `core/tools/todo.ts:9/17`.
 * Pure data + a total type guard: no `obsidian`, no `node:*`, no class.
 */
export interface TodoItem {
	/** Imperative description (e.g. "Run tests"). */
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
	/** Present-continuous form (e.g. "Running tests"). */
	activeForm: string;
}

const TODO_STATUSES: readonly TodoItem['status'][] = ['pending', 'in_progress', 'completed'];

/**
 * Total type guard for a single todo item (parity `todo.ts:17`): a valid
 * `TodoItem` has a non-empty `content`, a non-empty `activeForm`, and a
 * `status` in the three values. `renderTodos`/`toolPresentation` parse
 * `input.todos` via this guard and DROP invalid entries (never throw, EC-RR-6).
 */
export function isValidTodoItem(item: unknown): item is TodoItem {
	if (typeof item !== 'object' || item === null) return false;
	const record = item as Record<string, unknown>;
	return (
		typeof record.content === 'string' &&
		record.content.length > 0 &&
		typeof record.activeForm === 'string' &&
		record.activeForm.length > 0 &&
		typeof record.status === 'string' &&
		(TODO_STATUSES as readonly string[]).includes(record.status)
	);
}
