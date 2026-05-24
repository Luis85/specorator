import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'subagent-block',
	prompt: 'subagent-prompt',
	result: 'subagent-result',
	status: 'subagent-status',
	tool: 'tool-call-header',
	collapsibleHeader: 'sp-collapsible-header',
} as const;

/** PageObject for `SubagentBlock.vue` (SPEC-RR-030). Queries by `data-testid` only (ADR-009). */
export class SubagentBlockPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	statusExists(): boolean {
		return this.wrapper.find(this.byTid(TID.status)).exists();
	}

	statusText(): string {
		return this.wrapper.get(this.byTid(TID.status)).text();
	}

	statusState(): string {
		return this.wrapper.get(this.byTid(TID.status)).attributes('data-state') ?? '';
	}

	promptExists(): boolean {
		return this.wrapper.find(this.byTid(TID.prompt)).exists();
	}

	resultExists(): boolean {
		return this.wrapper.find(this.byTid(TID.result)).exists();
	}

	resultText(): string {
		return this.wrapper.get(this.byTid(TID.result)).text();
	}

	nestedToolCount(): number {
		return this.wrapper.findAll(this.byTid(TID.tool)).length;
	}

	/**
	 * Expand every collapsible header (the outer block + its nested sections).
	 * Nested section headers only mount once their parent expands, so re-query
	 * and click collapsed headers across passes until none remain.
	 */
	async expandAll(): Promise<void> {
		for (let pass = 0; pass < 4; pass++) {
			const collapsed = this.wrapper
				.findAll(this.byTid(TID.collapsibleHeader))
				.filter((h) => h.attributes('aria-expanded') === 'false');
			if (collapsed.length === 0) return;
			for (const header of collapsed) {
				await header.trigger('click');
			}
		}
	}

	html(): string {
		return this.wrapper.html();
	}
}
