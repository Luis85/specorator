import type { VueWrapper } from '@vue/test-utils';

/** PageObject for `TabBar.vue` (SPEC-TS-020). Queries by `data-testid` only (ADR-009). */
export class TabBarPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	exists(): boolean {
		return this.wrapper.find('[data-testid="tab-bar"]').exists();
	}

	role(): string | undefined {
		return this.wrapper.get('[data-testid="tab-bar"]').attributes('role');
	}

	ariaLabel(): string | undefined {
		return this.wrapper.get('[data-testid="tab-bar"]').attributes('aria-label');
	}

	badges() {
		return this.wrapper.findAll('[data-testid="tab-badge"]');
	}

	badgeCount(): number {
		return this.badges().length;
	}

	/** The visible 1-based numbers, in order (the non-colour cue, NFR-TS-010). */
	badgeNumbers(): string[] {
		return this.wrapper.findAll('[data-testid="tab-number"]').map((b) => b.text().trim());
	}

	badgeRole(index: number): string | undefined {
		return this.badges()[index].attributes('role');
	}

	badgeSelected(index: number): string | undefined {
		return this.badges()[index].attributes('aria-selected');
	}

	badgeTabindex(index: number): string | undefined {
		return this.badges()[index].attributes('tabindex');
	}

	/** The badge's state-machine label (idle | active | streaming | attention). */
	badgeState(index: number): string | undefined {
		return this.badges()[index].attributes('data-state');
	}

	async clickBadge(index: number): Promise<void> {
		await this.badges()[index].trigger('click');
	}

	async keydownBadge(index: number, key: string): Promise<void> {
		await this.badges()[index].trigger('keydown', { key });
	}

	async clickNew(): Promise<void> {
		await this.wrapper.get('[data-testid="tab-new"]').trigger('click');
	}

	async clickClose(index: number): Promise<void> {
		const closes = this.wrapper.findAll('[data-testid="tab-close"]');
		await closes[index].trigger('click');
	}

	hasNew(): boolean {
		return this.wrapper.find('[data-testid="tab-new"]').exists();
	}

	/** Flush a reactive update so a state-driven `data-state` re-render is visible. */
	wrapperNextTick(): Promise<void> {
		return this.wrapper.vm.$nextTick();
	}
}
