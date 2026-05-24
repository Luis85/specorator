/* eslint-disable no-warning-comments -- the domain noun "todo" (TodoList, TodoItem, renderTodos) trips the 'todo' term scanner; not a deferral marker. */
/**
 * T-RR-027 (RED) — `TodoList.vue` (TEST-RR-017 A leg, EC-RR-6).
 *
 * SPEC-RR-028. One row per `renderTodos` item: a status icon (`SpIcon`) and the
 * row text (`activeForm` gerund when `in_progress`, else `content`); per-status
 * colour via `--sp-todo-*` tokens applied by a status class (never raw colour).
 * Empty list → no rows (EC-RR-6). Text via `{{ }}` declarative spans (no
 * `v-html`). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-022, NFR-RR-006/007.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TodoList from '@/ui/chat/TodoList.vue';
import type { TodoItem } from '@/domain/chat/TodoItem';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { TodoListPageObject } from './TodoList.po';

function mountList(todos: TodoItem[]) {
	const wrapper = mount(TodoList, {
		props: { todos },
		global: { provide: { [ICON_PORT as symbol]: staticIconPort } },
	});
	return { wrapper, po: new TodoListPageObject(wrapper) };
}

const todos: TodoItem[] = [
	{ content: 'Write tests', activeForm: 'Writing tests', status: 'completed' },
	{ content: 'Implement', activeForm: 'Implementing', status: 'in_progress' },
	{ content: 'Review', activeForm: 'Reviewing', status: 'pending' },
];

describe('TodoList (TEST-RR-017 A leg)', () => {
	it('renders one row per todo with the correct text mapping', () => {
		const { po } = mountList(todos);
		expect(po.exists()).toBe(true);
		expect(po.rowCount()).toBe(3);
		// completed → content; in_progress → activeForm gerund; pending → content.
		expect(po.rowTexts()).toEqual(['Write tests', 'Implementing', 'Review']);
	});

	it('exposes per-row status so the token colour class is verifiable', () => {
		const { po } = mountList(todos);
		expect(po.rowStatuses()).toEqual(['completed', 'in_progress', 'pending']);
	});

	it('EC-RR-6: an empty list renders no rows', () => {
		const { po } = mountList([]);
		expect(po.rowCount()).toBe(0);
	});
});
