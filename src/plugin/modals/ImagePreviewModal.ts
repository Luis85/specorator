import { Modal, type App } from 'obsidian';

/**
 * Full-size image preview (SPEC-CA-024, REQ-CA-008, NFR-CA-003/008). An Obsidian
 * `Modal` subclass (it imports `obsidian`, so it lives in `src/plugin/`, NOT under
 * `src/ui/**`, like `DeleteConfirmModal`). Shows the image via a DECLARATIVE
 * `createEl('img', { attr: { src } })` — NO `innerHTML`/`outerHTML`/
 * `insertAdjacentHTML`; dismissable by Escape (Obsidian's own modal handling) + an
 * explicit close control. NEVER `window.confirm`/`prompt`/`alert`. The resource
 * `src` is the Obsidian-resolved path (the caller resolves it); the modal never
 * touches the base64 payload. Coverage-excluded → manual leg (TEST-CA-M2).
 */
export class ImagePreviewModal extends Modal {
	private resolved = false;
	private resolve: (() => void) | null = null;

	constructor(
		app: App,
		private readonly image: { src: string; alt: string },
		private readonly labels: { title: string; close: string },
	) {
		super(app);
	}

	/** Open the preview and resolve when it is dismissed (REQ-CA-008). */
	openAndWait(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.titleEl.setText(this.labels.title);
		this.modalEl.addClass('sp-image-preview-modal');
		this.contentEl.createEl('img', {
			cls: 'sp-image-preview-modal__img',
			attr: {
				src: this.image.src,
				alt: this.image.alt,
				'data-testid': 'image-preview-img',
			},
		});
		const actions = this.contentEl.createDiv({ cls: 'sp-image-preview-modal__actions' });
		const close = actions.createEl('button', {
			cls: 'sp-image-preview-modal__close mod-cta',
			attr: { type: 'button', 'data-testid': 'image-preview-close' },
		});
		close.setText(this.labels.close);
		close.addEventListener('click', () => {
			this.close();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
		this.settle();
	}

	/** Resolve exactly once (the first of close-control or Escape/dismiss). */
	private settle(): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.();
	}
}
