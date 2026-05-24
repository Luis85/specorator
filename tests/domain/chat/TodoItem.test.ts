/* eslint-disable no-warning-comments -- the type name TodoItem trips the 'todo' term scanner; not a deferral marker. */
/**
 * T-RR-002 (TEST-RR-002) — RED: `TodoItem` + the `isValidTodoItem` guard match
 * claudian-main `core/tools/todo.ts:9/17`.
 *
 * Fails `npx vue-tsc --noEmit -p tsconfig.lint.json` until T-RR-005 declares
 * `TodoItem` + `isValidTodoItem` under `src/domain/chat/TodoItem.ts`.
 *
 * Traces: TEST-RR-002, SPEC-RR-007, REQ-RR-022, REQ-RR-023; ADR-RR-001 §1.
 */
import { describe, it, expect } from 'vitest';
import type { TodoItem } from '@/domain/chat/TodoItem';
import { isValidTodoItem } from '@/domain/chat/TodoItem';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _todoItem: Equals<
	TodoItem,
	{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }
> = true;
void _todoItem;

describe('TodoItem + isValidTodoItem (TEST-RR-002)', () => {
	it('declares content/status/activeForm', () => {
		const item: TodoItem = { content: 'Run tests', status: 'pending', activeForm: 'Running tests' };
		expect(item.status).toBe('pending');
	});

	it('isValidTodoItem accepts a well-formed item', () => {
		expect(
			isValidTodoItem({ content: 'Run tests', status: 'in_progress', activeForm: 'Running tests' }),
		).toBe(true);
	});

	it('isValidTodoItem rejects empty content / activeForm / bad status (parity todo.ts:17)', () => {
		expect(isValidTodoItem({ content: '', status: 'pending', activeForm: 'x' })).toBe(false);
		expect(isValidTodoItem({ content: 'x', status: 'pending', activeForm: '' })).toBe(false);
		expect(isValidTodoItem({ content: 'x', status: 'nope', activeForm: 'y' })).toBe(false);
		expect(isValidTodoItem(null)).toBe(false);
		expect(isValidTodoItem('not-an-object')).toBe(false);
	});
});
