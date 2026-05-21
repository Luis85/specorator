import type { VueWrapper } from '@vue/test-utils';

export class BashHistoryListPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('bash-history'));
	}

	get empty() {
		return this.wrapper.find(this.byTid('bash-history-empty'));
	}

	row(id: string) {
		return this.wrapper.find(this.byTid(`bash-row-${id}`));
	}

	toggle(id: string) {
		return this.wrapper.find(this.byTid(`bash-row-toggle-${id}`));
	}

	rowsCount(): number {
		return this.wrapper.findAll('[data-testid^="bash-row-"]').filter((el) => {
			const tid = el.attributes('data-testid') ?? '';
			return !tid.startsWith('bash-row-toggle-');
		}).length;
	}
}
