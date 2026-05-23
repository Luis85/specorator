import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'mode-indicators',
	plan: 'mode-indicator-plan',
	bangBash: 'mode-indicator-bang-bash',
	instruction: 'mode-indicator-instruction',
} as const;

/**
 * PageObject for `<ModeIndicators>`. Queries by `data-testid` only.
 */
export class ModeIndicatorsPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	planChipClasses(): string {
		const el = this.wrapper.find(this.byTid(TID.plan));
		return el.exists() ? (el.element as HTMLElement).getAttribute('class') ?? '' : '';
	}

	bangBashChipClasses(): string {
		const el = this.wrapper.find(this.byTid(TID.bangBash));
		return el.exists() ? (el.element as HTMLElement).getAttribute('class') ?? '' : '';
	}

	instructionChipClasses(): string {
		const el = this.wrapper.find(this.byTid(TID.instruction));
		return el.exists() ? (el.element as HTMLElement).getAttribute('class') ?? '' : '';
	}
}
