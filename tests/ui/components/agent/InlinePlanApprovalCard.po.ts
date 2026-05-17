import type { DOMWrapper, VueWrapper } from '@vue/test-utils';

export class InlinePlanApprovalCardPO {
	constructor(public readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	get root(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('agent-plan-approval'));
	}

	get radiogroup(): DOMWrapper<Element> {
		return this.wrapper.find('[role="radiogroup"]');
	}

	row(name: 'implement' | 'revise' | 'cancel'): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid(`agent-plan-approval-row-${name}`));
	}

	get revise(): DOMWrapper<Element> {
		return this.wrapper.find(this.byTid('agent-plan-approval-revise'));
	}

	rootRole(): string | undefined {
		return this.root.attributes('role');
	}

	rootTabindex(): string | undefined {
		return this.root.attributes('tabindex');
	}

	radiogroupExists(): boolean {
		return this.radiogroup.exists();
	}

	rowRole(name: 'implement' | 'revise' | 'cancel'): string | undefined {
		return this.row(name).attributes('role');
	}

	rowAriaChecked(name: 'implement' | 'revise' | 'cancel'): string | undefined {
		return this.row(name).attributes('aria-checked');
	}

	rowTabindex(name: 'implement' | 'revise' | 'cancel'): string | undefined {
		return this.row(name).attributes('tabindex');
	}

	rootAriaActiveDescendant(): string | undefined {
		return this.root.attributes('aria-activedescendant');
	}

	radiogroupAriaActiveDescendant(): string | undefined {
		return this.radiogroup.attributes('aria-activedescendant');
	}
}
