import type { VueWrapper } from '@vue/test-utils';

/**
 * The RG-5 focus-visible target selector (SPEC-AY-001 / SPEC-AY-008): the set of
 * elements the focus ring reaches. A control is focus-reachable iff its element
 * matches this selector (a custom control carries `tabindex` so it matches
 * `[tabindex]`). Kept in one place so the keyboard/label tests assert it
 * uniformly.
 */
export const RG5_FOCUS_TARGET =
	'button, [role="tab"], [role="option"], [role="switch"], a[href], textarea, input, select, [tabindex]';

/**
 * Shared PageObject for the T-AY-007 keyboard-operability + accessible-name leg
 * (TEST-AY-007 mount / TEST-AY-008). Locates a control by `data-testid` only
 * (ADR-009), then reads its accessible name (visible text, `aria-label`, or an
 * associated `.sr-only` label) and asserts it matches the RG-5 focus target.
 */
export class KeyboardAndLabelsPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(tid: string): boolean {
		return this.wrapper.find(this.byTid(tid)).exists();
	}

	/** The accessible name: a non-empty `aria-label`, else the trimmed visible text. */
	accessibleName(tid: string): string {
		const el = this.wrapper.get(this.byTid(tid));
		const label = el.attributes('aria-label');
		if (label !== undefined && label.trim().length > 0) return label.trim();
		return el.text().trim();
	}

	/** True iff the control's element matches the RG-5 focus-visible target selector. */
	isFocusReachable(tid: string): boolean {
		return this.wrapper.get(this.byTid(tid)).element.matches(RG5_FOCUS_TARGET);
	}

	/** The accessible name of the Nth control sharing a `data-testid`. */
	accessibleNameAt(tid: string, index: number): string {
		const el = this.wrapper.findAll(this.byTid(tid))[index];
		const label = el.attributes('aria-label');
		if (label !== undefined && label.trim().length > 0) return label.trim();
		return el.text().trim();
	}

	count(tid: string): number {
		return this.wrapper.findAll(this.byTid(tid)).length;
	}
}
