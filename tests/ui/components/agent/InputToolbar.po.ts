import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'input-toolbar',
	model: 'input-toolbar-model',
	mode: 'input-toolbar-mode',
	permission: 'input-toolbar-permission',
	thinking: 'input-toolbar-thinking',
	mcp: 'input-toolbar-mcp',
	contextMeter: 'input-toolbar-context-meter',
	send: 'input-toolbar-send',
} as const;

/**
 * PageObject for `<InputToolbar>` (REQ-AUX-004, spec §1.3.3).
 * Queries by `data-testid` only.
 */
export class InputToolbarPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	root(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.root)).element as HTMLElement;
	}

	/** Returns the source order of the toolbar children by `data-testid`. */
	childOrder(): string[] {
		const root = this.root();
		const known = new Set<string>(Object.values(TID).filter((t) => t !== TID.root));
		const out: string[] = [];
		const all = root.querySelectorAll<HTMLElement>('[data-testid]');
		for (const el of Array.from(all)) {
			const tid = el.getAttribute('data-testid') ?? '';
			if (known.has(tid)) out.push(tid);
		}
		return out;
	}

	sendEl(): HTMLElement {
		return this.wrapper.get(this.byTid(TID.send)).element as HTMLElement;
	}

	sendButton(): HTMLButtonElement {
		const span = this.wrapper.get(this.byTid(TID.send));
		const btn = span.element.querySelector('button');
		if (!btn) throw new Error('input-toolbar-send has no button child');
		return btn;
	}

	sendIcon(): string {
		return this.sendEl().getAttribute('data-icon-name') ?? '';
	}

	sendAriaLabel(): string {
		return this.sendButton().getAttribute('aria-label') ?? '';
	}

	isNarrow(): boolean {
		return this.root().getAttribute('data-narrow') === 'true';
	}

	sendVariant(): string {
		return this.sendEl().getAttribute('data-send-variant') ?? '';
	}
}
