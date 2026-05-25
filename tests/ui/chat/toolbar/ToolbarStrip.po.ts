import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'toolbar-strip',
	model: 'toolbar-model',
	mode: 'toolbar-mode',
	permission: 'toolbar-permission',
	thinking: 'toolbar-thinking',
	serviceTier: 'toolbar-service-tier',
	mcp: 'toolbar-mcp',
	external: 'toolbar-external',
	usage: 'toolbar-usage',
	modeRoot: 'toolbar-mode',
} as const;

/** PageObject for `ToolbarStrip.vue` (SPEC-TC-012). Queries by `data-testid` only (ADR-009). */
export class ToolbarStripPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	rootExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	has(tid: keyof typeof TID): boolean {
		return this.wrapper.find(this.byTid(TID[tid])).exists();
	}

	/** The ordered list of present widget testids (for the Claudian-order assertion). */
	widgetOrder(): string[] {
		const order = [
			TID.model,
			TID.mode,
			TID.permission,
			TID.thinking,
			TID.serviceTier,
			TID.mcp,
			TID.external,
			TID.usage,
		];
		const html = this.wrapper.get(this.byTid(TID.root)).html();
		return order.filter((tid) => html.includes(`data-testid="${tid}"`));
	}

	async clickModelButton(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.model)).trigger('click');
	}

	async clickModelOption(index: number): Promise<void> {
		await this.wrapper.findAll('[data-testid="toolbar-model-option"]')[index].trigger('click');
	}

	async clickMode(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.mode)).trigger('click');
	}

	async clickServiceTier(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.serviceTier)).trigger('click');
	}
}
