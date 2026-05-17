import type { DOMWrapper, VueWrapper } from '@vue/test-utils';

export class A11yAnnouncerPO {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	get root(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('a11y-announcer'));
	}

	exists(): boolean {
		return this.root.exists();
	}

	role(): string | undefined {
		return this.root.attributes('role');
	}

	ariaLive(): string | undefined {
		return this.root.attributes('aria-live');
	}

	ariaAtomic(): string | undefined {
		return this.root.attributes('aria-atomic');
	}

	text(): string {
		return this.root.text();
	}
}
