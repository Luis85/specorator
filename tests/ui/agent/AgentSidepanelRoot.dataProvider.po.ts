import type { VueWrapper } from '@vue/test-utils';

export class AgentSidepanelRootDataProviderPO {
	constructor(private readonly wrapper: VueWrapper) {}

	get rootEl(): HTMLElement {
		return this.wrapper.find<HTMLElement>('[data-testid="agent-sidepanel"]').element;
	}

	dataProvider(): string | null {
		return this.rootEl.getAttribute('data-provider');
	}

	hasSpecoratorRootClass(): boolean {
		return this.rootEl.classList.contains('specorator-root');
	}
}
