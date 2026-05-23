import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'context-meter',
	track: 'context-meter-track',
	progress: 'context-meter-progress',
	label: 'context-meter-label',
} as const;

/**
 * PageObject for `<ContextMeter>` (REQ-AUX-004, spec §1.3.4).
 * Queries by `data-testid` only.
 */
export class ContextMeterPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	root(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement;
	}

	progressEl(): SVGCircleElement {
		return this.wrapper.get(this.byTid(TID.progress)).element as unknown as SVGCircleElement;
	}

	trackEl(): SVGCircleElement {
		return this.wrapper.get(this.byTid(TID.track)).element as unknown as SVGCircleElement;
	}

	strokeDashoffsetAttr(): string {
		return this.progressEl().getAttribute('stroke-dashoffset') ?? '';
	}

	strokeAttr(): string {
		return this.progressEl().getAttribute('stroke') ?? '';
	}

	isWarning(): boolean {
		return this.root().getAttribute('data-warning') === 'true';
	}

	tooltipText(): string {
		return this.root().getAttribute('title') ?? '';
	}
}
