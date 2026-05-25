import { Modal, type App } from 'obsidian';
import type { InstructionConfirmResult } from '@/ui/chat/modalSeam';

/**
 * The instruction-confirm modal (SPEC-CP-027, REQ-CP-017/018, NFR-CP-003). An
 * Obsidian `Modal` subclass (it imports `obsidian`, so it lives in `src/plugin/`,
 * NOT under `src/ui/**`, like `ForkTargetModal`) presenting the (refined or raw)
 * instruction in an editable field + Accept / Reject. Resolves
 * `Promise<InstructionConfirmResult | null>`:
 *
 * - **Accept** → `{ kind: 'accept'; instruction }` (the possibly-edited text) →
 *   the caller appends it to `customSystemPrompt` (never overwrites).
 * - **Reject / Escape / dismiss** → `{ kind: 'reject' }` — persist nothing.
 *
 * DOM built with `createEl`/`createDiv`/`setText` — NO `innerHTML`/`v-html`
 * (NFR-CP-003, SPEC-CP-030); NEVER `window.confirm`/`prompt`/`alert`. The visual
 * render + Promise resolution are proven on the manual leg (TEST-CP-M2).
 */
export class InstructionConfirmModal extends Modal {
	private resolved = false;
	private resolve: ((value: InstructionConfirmResult | null) => void) | null = null;
	private field: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		private readonly instruction: string,
		private readonly labels: { title: string; accept: string; reject: string },
	) {
		super(app);
	}

	/** Open the modal and resolve with the user's decision (or reject on dismiss). */
	confirm(): Promise<InstructionConfirmResult | null> {
		return new Promise<InstructionConfirmResult | null>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.titleEl.setText(this.labels.title);
		this.modalEl.addClass('sp-instruction-confirm-modal');
		const field = this.contentEl.createEl('textarea', {
			cls: 'sp-instruction-confirm-modal__field',
			attr: { 'data-testid': 'instruction-confirm-field', rows: '6' },
		});
		field.value = this.instruction;
		this.field = field;

		const actions = this.contentEl.createDiv({ cls: 'sp-instruction-confirm-modal__actions' });
		const reject = actions.createEl('button', {
			cls: 'sp-instruction-confirm-modal__reject',
			attr: { type: 'button', 'data-testid': 'instruction-confirm-reject' },
		});
		reject.setText(this.labels.reject);
		reject.addEventListener('click', () => {
			this.settle({ kind: 'reject' });
			this.close();
		});
		const accept = actions.createEl('button', {
			cls: 'sp-instruction-confirm-modal__accept mod-cta',
			attr: { type: 'button', 'data-testid': 'instruction-confirm-accept' },
		});
		accept.setText(this.labels.accept);
		accept.addEventListener('click', () => {
			this.settle({ kind: 'accept', instruction: this.field?.value ?? this.instruction });
			this.close();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
		// Dismiss without a choice rejects (persist nothing) exactly once.
		this.settle({ kind: 'reject' });
	}

	/** Resolve exactly once (the first of a click choice or a dismiss). */
	private settle(value: InstructionConfirmResult | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.(value);
	}
}
