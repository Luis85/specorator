/* eslint-disable no-warning-comments -- the domain noun "todo" (renderTodos, TodoItem, input.todos) trips the 'todo' term scanner; not a deferral marker. */
/**
 * TEST-RR-017 (U leg) — `renderTodos` + `parseTodos` pure transform.
 *
 * SPEC-RR-016: `renderTodos` maps each TodoItem -> {iconName, status, text}
 * (gerund when in_progress, else content); `parseTodos` reads input.todos and
 * keeps only guard-valid items (todo.ts:30), returns [] when absent/all-invalid
 * (EC-RR-6, no throw). Mirrors claudian getTodoStatusIcon/getTodoDisplayText
 * (todoUtils.ts:5/9).
 *
 * Traces: TEST-RR-017, SPEC-RR-016, REQ-RR-022, NFR-RR-003/005, EC-RR-6.
 */
import { describe, it, expect } from 'vitest';
import { renderTodos, parseTodos } from '@/application/chat/renderTodos';
import type { TodoItem } from '@/domain/chat/TodoItem';

describe('renderTodos (TEST-RR-017)', () => {
	it('completed -> check icon + content text', () => {
		const todos: TodoItem[] = [{ content: 'Run tests', activeForm: 'Running tests', status: 'completed' }];
		expect(renderTodos(todos)).toEqual([
			{ iconName: 'check', status: 'completed', text: 'Run tests' },
		]);
	});

	it('in_progress -> dot icon + activeForm gerund text', () => {
		const todos: TodoItem[] = [{ content: 'Run tests', activeForm: 'Running tests', status: 'in_progress' }];
		expect(renderTodos(todos)).toEqual([
			{ iconName: 'dot', status: 'in_progress', text: 'Running tests' },
		]);
	});

	it('pending -> dot icon + content text', () => {
		const todos: TodoItem[] = [{ content: 'Run tests', activeForm: 'Running tests', status: 'pending' }];
		expect(renderTodos(todos)).toEqual([
			{ iconName: 'dot', status: 'pending', text: 'Run tests' },
		]);
	});

	it('maps a mixed list preserving order', () => {
		const todos: TodoItem[] = [
			{ content: 'A', activeForm: 'Aing', status: 'completed' },
			{ content: 'B', activeForm: 'Bing', status: 'in_progress' },
			{ content: 'C', activeForm: 'Cing', status: 'pending' },
		];
		expect(renderTodos(todos)).toEqual([
			{ iconName: 'check', status: 'completed', text: 'A' },
			{ iconName: 'dot', status: 'in_progress', text: 'Bing' },
			{ iconName: 'dot', status: 'pending', text: 'C' },
		]);
	});

	it('empty list -> no rows (EC-RR-6)', () => {
		expect(renderTodos([])).toEqual([]);
	});
});

describe('parseTodos (TEST-RR-017)', () => {
	it('reads input.todos and keeps guard-valid items', () => {
		const input = {
			todos: [
				{ content: 'A', activeForm: 'Aing', status: 'completed' },
				{ content: 'B', activeForm: 'Bing', status: 'pending' },
			],
		};
		expect(parseTodos(input)).toEqual([
			{ content: 'A', activeForm: 'Aing', status: 'completed' },
			{ content: 'B', activeForm: 'Bing', status: 'pending' },
		]);
	});

	it('drops invalid items, keeps valid ones', () => {
		const input = {
			todos: [
				{ content: 'A', activeForm: 'Aing', status: 'completed' },
				{ content: '', activeForm: 'Bad', status: 'pending' }, // empty content
				{ nope: true }, // missing fields
				42,
				null,
				{ content: 'C', activeForm: 'Cing', status: 'bogus' }, // bad status
			],
		};
		expect(parseTodos(input)).toEqual([
			{ content: 'A', activeForm: 'Aing', status: 'completed' },
		]);
	});

	it('absent todos -> [] (EC-RR-6)', () => {
		expect(parseTodos({})).toEqual([]);
	});

	it('non-array todos -> [] (EC-RR-6)', () => {
		expect(parseTodos({ todos: 'oops' })).toEqual([]);
	});

	it('all-invalid todos -> [] (EC-RR-6, no throw)', () => {
		expect(() => parseTodos({ todos: [42, null, {}] })).not.toThrow();
		expect(parseTodos({ todos: [42, null, {}] })).toEqual([]);
	});
});
