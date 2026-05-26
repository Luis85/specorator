import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'mcp-test-modal',
	running: 'mcp-test-running',
	success: 'mcp-test-success',
	tool: 'mcp-test-tool',
	toolToggle: 'mcp-test-tool-toggle',
	error: 'mcp-test-error',
	unavailable: 'mcp-test-unavailable',
	close: 'mcp-test-close',
} as const;

/** PageObject for `McpTestModal.vue` (SPEC-MC-017). Queries by `data-testid` only (ADR-009). */
export class McpTestModalPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	runningShown(): boolean {
		return this.wrapper.find(this.byTid(TID.running)).exists();
	}

	successShown(): boolean {
		return this.wrapper.find(this.byTid(TID.success)).exists();
	}

	errorShown(): boolean {
		return this.wrapper.find(this.byTid(TID.error)).exists();
	}

	errorText(): string {
		return this.wrapper.get(this.byTid(TID.error)).text();
	}

	unavailableShown(): boolean {
		return this.wrapper.find(this.byTid(TID.unavailable)).exists();
	}

	successText(): string {
		return this.wrapper.get(this.byTid(TID.success)).text();
	}

	toolCount(): number {
		return this.wrapper.findAll(this.byTid(TID.tool)).length;
	}

	liveRegionText(): string {
		const el = this.wrapper.find('[aria-live]');
		return el.exists() ? el.text() : '';
	}

	async toggleToolAt(index: number): Promise<void> {
		const toggle = this.wrapper.findAll(this.byTid(TID.toolToggle))[index];
		(toggle.element as HTMLInputElement).checked = !(toggle.element as HTMLInputElement).checked;
		await toggle.trigger('change');
	}

	async clickClose(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.close)).trigger('click');
	}
}
