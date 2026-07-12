import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TodoItem } from '@/core/tools/todo';
import TodoListView from '@/features/chat/ui/vue/transcript/blocks/TodoListView.vue';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TodoListView', () => {
  it('renders one .specorator-todo-item per todo with status class + display text', async () => {
    const todos: TodoItem[] = [
      { status: 'completed', content: 'Task 1', activeForm: 'Doing task 1' },
      { status: 'in_progress', content: 'Task 2', activeForm: 'Doing task 2' },
      { status: 'pending', content: 'Task 3', activeForm: 'Doing task 3' },
    ];
    const { container } = render(TodoListView, { props: { todos } });
    await flushPromises();

    const items = container.querySelectorAll('.specorator-todo-item');
    expect(items).toHaveLength(3);

    expect(items[0].classList.contains('specorator-todo-completed')).toBe(true);
    expect(items[0].querySelector('.specorator-todo-text')?.textContent).toBe('Task 1');
    expect(setIcon).toHaveBeenCalledWith(items[0].querySelector('.specorator-todo-status-icon'), 'check');

    // in_progress uses activeForm, not content.
    expect(items[1].classList.contains('specorator-todo-in_progress')).toBe(true);
    expect(items[1].querySelector('.specorator-todo-text')?.textContent).toBe('Doing task 2');
    expect(setIcon).toHaveBeenCalledWith(items[1].querySelector('.specorator-todo-status-icon'), 'dot');

    expect(items[2].classList.contains('specorator-todo-pending')).toBe(true);
    expect(items[2].querySelector('.specorator-todo-text')?.textContent).toBe('Task 3');
    expect(setIcon).toHaveBeenCalledWith(items[2].querySelector('.specorator-todo-status-icon'), 'dot');

    for (const icon of container.querySelectorAll('.specorator-todo-status-icon')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders "Tasks updated" fallback text when todos is undefined', async () => {
    const { container } = render(TodoListView, { props: { todos: undefined } });
    await flushPromises();

    expect(container.querySelectorAll('.specorator-todo-item')).toHaveLength(0);
    const fallback = container.querySelector('.specorator-tool-result-item');
    expect(fallback?.textContent).toBe('Tasks updated');
  });

  it('renders nothing (no items, no fallback) for an empty todos array', async () => {
    const { container } = render(TodoListView, { props: { todos: [] } });
    await flushPromises();

    expect(container.querySelectorAll('.specorator-todo-item')).toHaveLength(0);
    expect(container.querySelector('.specorator-tool-result-item')).toBeNull();
  });
});
