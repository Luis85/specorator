import type { VueWrapper } from '@vue/test-utils';

const TID = {
	header: 'tool-call-header',
	name: 'tool-call-name',
	summary: 'tool-call-summary',
	status: 'tool-call-status',
	result: 'tool-call-result',
	collapsibleHeader: 'sp-collapsible-header',
} as const;

/** PageObject for `ToolCallBlock.vue` (SPEC-RR-026). Queries by `data-testid` only (ADR-009). */
export class ToolCallBlockPageObject {
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

	summaryExists(): boolean {
		return this.wrapper.find(this.byTid(TID.summary)).exists();
	}

	summary(): string {
		return this.wrapper.get(this.byTid(TID.summary)).text();
	}

	statusLabel(): string {
		return this.wrapper.get(this.byTid(TID.status)).attributes('aria-label') ?? '';
	}

	statusExists(): boolean {
		return this.wrapper.find(this.byTid(TID.status)).exists();
	}

	collapsibleAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.collapsibleHeader)).attributes('aria-label') ?? '';
	}

	async expand(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.collapsibleHeader)).trigger('click');
	}

	resultExists(): boolean {
		return this.wrapper.find(this.byTid(TID.result)).exists();
	}

	resultText(): string {
		return this.wrapper.get(this.byTid(TID.result)).text();
	}

	html(): string {
		return this.wrapper.html();
	}
}
