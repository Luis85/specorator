import type { VueWrapper } from '@vue/test-utils';

export class ProviderMenuPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`;
	}

	get root() {
		return this.wrapper.find(this.byTid('provider-menu'));
	}

	item(provider: string, mode: string) {
		return this.wrapper.find(this.byTid(`provider-menu-item-${provider}-${mode}`));
	}

	itemAriaDisabled(provider: string, mode: string): string | undefined {
		return this.item(provider, mode).attributes('aria-disabled');
	}

	itemTitle(provider: string, mode: string): string | undefined {
		return this.item(provider, mode).attributes('title');
	}
}
