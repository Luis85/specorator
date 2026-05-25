import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-permission',
	plan: 'toolbar-permission-plan',
	option: 'toolbar-permission-option',
} as const;

/**
 * PageObject for `PermissionToggle.vue` (SPEC-TC-015 P6 seam + SPEC-AS-012 P7 live
 * three-mode). Queries by `data-testid` only (ADR-009).
 */
export class PermissionTogglePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	toggleExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	planExists(): boolean {
		return this.wrapper.find(this.byTid(TID.plan)).exists();
	}

	planText(): string {
		return this.wrapper.get(this.byTid(TID.plan)).text();
	}

	role(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('role') ?? '';
	}

	ariaDisabled(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-disabled') ?? '';
	}

	ariaLabel(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	async click(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('click');
	}

	// ── P7 live three-mode (SPEC-AS-012) ──────────────────────────────────────────

	/** True iff a mode option with the given `data-mode` value is rendered. */
	optionFor(mode: string): boolean {
		return this.wrapper.find(`${this.byTid(TID.option)}[data-mode="${mode}"]`).exists();
	}

	/** The `data-mode` of the option whose `aria-selected` is `"true"` (`''` when none). */
	selectedMode(): string {
		const options = this.wrapper.findAll(this.byTid(TID.option));
		const selected = options.find((o) => o.attributes('aria-selected') === 'true');
		return selected?.attributes('data-mode') ?? '';
	}

	async clickOption(mode: string): Promise<void> {
		await this.wrapper.get(`${this.byTid(TID.option)}[data-mode="${mode}"]`).trigger('click');
	}

	async pressArrowDown(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('keydown', { key: 'ArrowDown' });
	}

	async pressArrowUp(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('keydown', { key: 'ArrowUp' });
	}

	async pressEnter(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.root)).trigger('keydown', { key: 'Enter' });
	}
}
