import type { VueWrapper } from '@vue/test-utils';

/**
 * Shared PageObject for the T-AY-009 icon-only-control leg (TEST-AY-009 mount).
 * Locates an icon-only control by `data-testid` only (ADR-009), then reads its
 * accessible name (`aria-label`) and confirms its decorative glyph carries
 * `aria-hidden="true"` (the decorative glyph is excluded from the accessibility
 * tree; the name comes from the label, not the glyph).
 */
export class IconOnlyControlPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(tid: string): boolean {
		return this.wrapper.find(this.byTid(tid)).exists();
	}

	/** A non-empty `aria-label` is the accessible name for an icon-only control. */
	ariaLabel(tid: string): string {
		return this.wrapper.get(this.byTid(tid)).attributes('aria-label') ?? '';
	}

	/** True iff the control's decorative glyph span is `aria-hidden="true"`. */
	decorativeGlyphHidden(tid: string): boolean {
		const el = this.wrapper.get(this.byTid(tid));
		const hidden = el.findAll('[aria-hidden="true"]');
		return hidden.length > 0;
	}
}
