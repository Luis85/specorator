import type { VueWrapper } from '@vue/test-utils';

export class TodoListPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('todo-list'));
	}

	get empty() {
		return this.wrapper.find(this.byTid('todo-list-empty'));
	}

	row(id: string) {
		return this.wrapper.find(this.byTid(`todo-row-${id}`));
	}

	rowsCount(): number {
		return this.wrapper.findAll('[data-testid^="todo-row-"]').length;
	}
}
