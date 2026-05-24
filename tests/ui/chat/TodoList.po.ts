import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'todo-list',
	row: 'todo-row',
	rowText: 'todo-row-text',
} as const;

/** PageObject for `TodoList.vue` (SPEC-RR-028). Queries by `data-testid` only (ADR-009). */
export class TodoListPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	rowCount(): number {
		return this.wrapper.findAll(this.byTid(TID.row)).length;
	}

	rowTexts(): string[] {
		return this.wrapper.findAll(this.byTid(TID.rowText)).map((w) => w.text());
	}

	rowStatuses(): string[] {
		return this.wrapper
			.findAll(this.byTid(TID.row))
			.map((w) => w.attributes('data-status') ?? '');
	}
}
