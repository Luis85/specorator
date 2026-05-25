import type { VueWrapper } from '@vue/test-utils';

const TID = {
	row: 'mention-row',
	name: 'mention-row-name',
	detail: 'mention-row-detail',
	icon: 'mention-row-icon',
} as const;

/** PageObject for `MentionRow.vue` (SPEC-CP-020). Queries by `data-testid` only (ADR-009). */
export class MentionRowPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.row)).exists();
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.row));
	}

	name(): string {
		return this.wrapper.get(this.byTid(TID.name)).text();
	}

	hasDetail(): boolean {
		return this.wrapper.find(this.byTid(TID.detail)).exists();
	}

	detail(): string {
		return this.wrapper.get(this.byTid(TID.detail)).text();
	}

	hasIcon(): boolean {
		return this.wrapper.find(this.byTid(TID.icon)).exists();
	}

	/** True when the row renders the two-line (name + description) layout. */
	isTwoLine(): boolean {
		return this.root.classes().some((c) => c.includes('two-line'));
	}

	/** The full rendered text (used to assert verbatim-script-text, EC-CP-13). */
	text(): string {
		return this.root.text();
	}

	/** Raw HTML of the row — to assert NO live <script> element was injected (EC-CP-13). */
	html(): string {
		return this.root.html();
	}
}
