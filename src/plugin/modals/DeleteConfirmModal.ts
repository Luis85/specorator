import { Modal, type App } from 'obsidian';

/**
 * A destructive-delete confirmation (SPEC-TS-024, NFR-TS-007). An Obsidian `Modal`
 * subclass (it imports `obsidian`, so it lives in `src/plugin/`, NOT under
 * `src/ui/**`) resolving `Promise<boolean>` — `true` to proceed, `false` on
 * Cancel/Escape/dismiss. DOM built with `createEl`/`createDiv`/`setText` — NO
 * `innerHTML`/`v-html` (NFR-TS-006); NEVER `window.confirm`/`prompt`/`alert`
 * (NFR-TS-007). The visual render is proven on the manual leg (TEST-TS-M2).
 */
export class DeleteConfirmModal extends Modal {
	private resolved = false;
	private resolve: ((value: boolean) => void) | null = null;

	constructor(
		app: App,
		private readonly labels: { message: string; confirm: string; cancel: string },
	) {
		super(app);
	}

	/** Open the modal and resolve `true` on confirm, `false` otherwise. */
	confirm(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.modalEl.addClass('sp-delete-confirm-modal');
		this.contentEl.createEl('p', { cls: 'sp-delete-confirm-modal__message' }).setText(
			this.labels.message,
		);
		const actions = this.contentEl.createDiv({ cls: 'sp-delete-confirm-modal__actions' });
		const cancel = actions.createEl('button', {
			cls: 'sp-delete-confirm-modal__cancel',
			attr: { type: 'button', 'data-testid': 'delete-cancel' },
		});
		cancel.setText(this.labels.cancel);
		cancel.addEventListener('click', () => {
			this.settle(false);
			this.close();
		});
		const confirm = actions.createEl('button', {
			cls: 'sp-delete-confirm-modal__confirm mod-warning',
			attr: { type: 'button', 'data-testid': 'delete-confirm' },
		});
		confirm.setText(this.labels.confirm);
		confirm.addEventListener('click', () => {
			this.settle(true);
			this.close();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
		this.settle(false);
	}

	private settle(value: boolean): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.(value);
	}
}
