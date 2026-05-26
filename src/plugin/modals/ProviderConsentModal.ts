import { Modal, type App } from 'obsidian';

/**
 * The one-time beyond-vault consent prompt (P9, SPEC-PV-014/024, REQ-PV-082/113). An
 * Obsidian `Modal` subclass (it imports `obsidian`, so it lives in `src/plugin/`, NOT
 * under `src/ui/**`) resolving `Promise<boolean>` — `true` when the user allows the
 * provider's beyond-vault home-dir history read, `false` on decline/Escape/dismiss. A
 * decline disables that provider's history honestly (the gate never re-prompts,
 * EC-PV-6). DOM built with `createEl`/`createDiv`/`setText` — NO `innerHTML`/`v-html`
 * (NFR-PV-008); NEVER `window.confirm`/`prompt`/`alert` (REQ-PV-113). The visual render
 * is proven on the manual leg (TEST-PV-M4).
 */
export class ProviderConsentModal extends Modal {
	private resolved = false;
	private resolve: ((value: boolean) => void) | null = null;

	constructor(
		app: App,
		private readonly labels: {
			title: string;
			body: string;
			allow: string;
			decline: string;
		},
	) {
		super(app);
	}

	/** Open the modal and resolve `true` on allow, `false` otherwise. */
	confirm(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.modalEl.addClass('sp-provider-consent-modal');
		this.titleEl.setText(this.labels.title);
		this.contentEl
			.createEl('p', { cls: 'sp-provider-consent-modal__body' })
			.setText(this.labels.body);
		const actions = this.contentEl.createDiv({ cls: 'sp-provider-consent-modal__actions' });
		const decline = actions.createEl('button', {
			cls: 'sp-provider-consent-modal__decline',
			attr: { type: 'button', 'data-testid': 'provider-consent-decline' },
		});
		decline.setText(this.labels.decline);
		decline.addEventListener('click', () => {
			this.settle(false);
			this.close();
		});
		const allow = actions.createEl('button', {
			cls: 'sp-provider-consent-modal__allow mod-cta',
			attr: { type: 'button', 'data-testid': 'provider-consent-allow' },
		});
		allow.setText(this.labels.allow);
		allow.addEventListener('click', () => {
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
