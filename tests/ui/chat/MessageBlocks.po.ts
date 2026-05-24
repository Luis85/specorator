import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'message-blocks',
	block: 'message-block',
} as const;

/**
 * PageObject for `MessageBlocks.vue` (SPEC-RR-022). Queries by `data-testid` only
 * (ADR-009). Each rendered child carries `data-testid="message-block"` plus a
 * `data-block-kind` so the dispatch order is assertable by sequence (TEST-RR-008).
 */
export class MessageBlocksPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	blockCount(): number {
		return this.wrapper.findAll(this.byTid(TID.block)).length;
	}

	/** The ordered list of `data-block-kind` values — the dispatch order (TEST-RR-008). */
	blockKinds(): string[] {
		return this.wrapper.findAll(this.byTid(TID.block)).map((w) => w.attributes('data-block-kind') ?? '');
	}

	hasTestid(tid: string): boolean {
		return this.wrapper.find(this.byTid(tid)).exists();
	}

	countTestid(tid: string): number {
		return this.wrapper.findAll(this.byTid(tid)).length;
	}
}
