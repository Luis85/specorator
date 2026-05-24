import type { VueWrapper } from '@vue/test-utils';

const TID = {
	header: 'write-edit-header',
	name: 'write-edit-name',
	summary: 'write-edit-summary',
	status: 'write-edit-status',
	stats: 'write-edit-stats',
	statAdded: 'write-edit-stat-added',
	statRemoved: 'write-edit-stat-removed',
	body: 'write-edit-body',
	diffView: 'diff-view',
	generic: 'write-edit-generic',
	collapsibleHeader: 'sp-collapsible-header',
} as const;

/** PageObject for `WriteEditBlock.vue` (SPEC-RR-029). Queries by `data-testid` only (ADR-009). */
export class WriteEditBlockPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	headerExists(): boolean {
		return this.wrapper.find(this.byTid(TID.header)).exists();
	}

	name(): string {
		return this.wrapper.get(this.byTid(TID.name)).text();
	}

	summary(): string {
		return this.wrapper.get(this.byTid(TID.summary)).text();
	}

	statusLabel(): string {
		return this.wrapper.get(this.byTid(TID.status)).attributes('aria-label') ?? '';
	}

	statsExists(): boolean {
		return this.wrapper.find(this.byTid(TID.stats)).exists();
	}

	addedExists(): boolean {
		return this.wrapper.find(this.byTid(TID.statAdded)).exists();
	}

	addedText(): string {
		return this.wrapper.get(this.byTid(TID.statAdded)).text();
	}

	removedExists(): boolean {
		return this.wrapper.find(this.byTid(TID.statRemoved)).exists();
	}

	removedText(): string {
		return this.wrapper.get(this.byTid(TID.statRemoved)).text();
	}

	collapsibleAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.collapsibleHeader)).attributes('aria-label') ?? '';
	}

	async expand(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.collapsibleHeader)).trigger('click');
	}

	diffViewExists(): boolean {
		return this.wrapper.find(this.byTid(TID.diffView)).exists();
	}

	genericExists(): boolean {
		return this.wrapper.find(this.byTid(TID.generic)).exists();
	}

	genericText(): string {
		return this.wrapper.get(this.byTid(TID.generic)).text();
	}
}
