import type { VueWrapper } from '@vue/test-utils';

const TID = {
	empty: 'agent-panel-empty',
} as const;

/** PageObject for the empty P0 agent panel (SPEC-PSR-006). */
export class AgentPanelRootPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	get empty() {
		return this.wrapper.get(this.byTid(TID.empty));
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.empty)).exists();
	}

	text(): string {
		return this.empty.text();
	}
}
