import { Modal, type App } from 'obsidian';
import { type App as VueApp, createApp, h } from 'vue';
import DiffView from '@/ui/chat/DiffView.vue';
import { i18n } from '@/ui/i18n';
import type { NotificationPort } from '@/domain/ports';
import type { ToolDiffData } from '@/domain/chat/diff/Diff';
import type {
	InlineEditUseCase,
	InlineEditOutcome,
	InlineEditExchangeTurn,
} from '@/application/chat/inlineEdit/InlineEditUseCase';
import type { InlineEditDecision } from '@/ui/chat/modalSeam';

/** Labels the launcher passes (all via TranslationPort, NFR-CA-013). */
export interface InlineEditModalLabels {
	readonly title: string;
	readonly promptPlaceholder: string;
	readonly submit: string;
	readonly querying: string;
	readonly accept: string;
	readonly reject: string;
	readonly clarifyReplyPlaceholder: string;
	readonly continueLabel: string;
	readonly failed: string;
}

/**
 * The inline-edit modal (SPEC-CA-024, REQ-CA-020/023/024/025/026/027, NFR-CA-003/008).
 * An Obsidian `Modal` subclass (it imports `obsidian`, so it lives in
 * `src/plugin/`, NOT under `src/ui/**`). Drives the DESIGN-CA-001 A.4 state
 * machine: Prompt → Querying → Preview / Clarify / Failed → Applied / Rejected.
 * Resolves `Promise<InlineEditDecision | null>`:
 *
 * - **Accept** (Preview/Clarify-replacement) → `{ kind:'accept', editedText }` →
 *   the caller replaces the note range (REQ-CA-024).
 * - **Reject / Escape / dismiss** → `{ kind:'reject' }` → note unchanged,
 *   highlight restored (REQ-CA-025).
 * - **Failed** (use case `Result.err`) → a non-blocking `NotificationPort` notice
 *   + resolve `null` (REQ-CA-027, EC-CA-9).
 *
 * The Preview reuses the UNCHANGED `DiffView` (mounted as a tiny Vue app over the
 * `InlineEditOutcome.diff` `ToolDiffData` — the renderer reuse, ADR-CA-004 §3).
 * DOM built with `createEl`/`createDiv`/`setText` — NO `innerHTML`; NEVER
 * `window.confirm`/`prompt`/`alert`. Coverage-excluded → manual leg (TEST-CA-M2).
 */
export class InlineEditModal extends Modal {
	private resolved = false;
	private resolve: ((value: InlineEditDecision | null) => void) | null = null;
	private readonly controller = new AbortController();
	private diffApp: VueApp | null = null;
	private exchange: InlineEditExchangeTurn[] = [];

	constructor(
		app: App,
		private readonly useCase: InlineEditUseCase,
		private readonly notify: NotificationPort,
		private readonly params: { selectedText: string; notePath?: string },
		private readonly labels: InlineEditModalLabels,
	) {
		super(app);
	}

	/** Open the modal pre-bound to the selection and resolve the decision (or null). */
	openAndWait(): Promise<InlineEditDecision | null> {
		return new Promise<InlineEditDecision | null>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.titleEl.setText(this.labels.title);
		this.modalEl.addClass('sp-inline-edit-modal');
		this.renderPrompt();
	}

	override onClose(): void {
		// Dismissing aborts any in-flight aux query (EC-CA-8) and rejects (REQ-CA-025).
		this.controller.abort();
		this.teardownDiff();
		this.contentEl.empty();
		this.settle({ kind: 'reject' });
	}

	// ── Prompt ───────────────────────────────────────────────────────────────────

	private renderPrompt(): void {
		this.contentEl.empty();
		this.teardownDiff();
		const field = this.contentEl.createEl('textarea', {
			cls: 'sp-inline-edit-modal__instruction',
			attr: {
				rows: '3',
				placeholder: this.labels.promptPlaceholder,
				'data-testid': 'inline-edit-instruction',
			},
		});
		const actions = this.contentEl.createDiv({ cls: 'sp-inline-edit-modal__actions' });
		const submit = actions.createEl('button', {
			cls: 'sp-inline-edit-modal__submit mod-cta',
			attr: { type: 'button', 'data-testid': 'inline-edit-submit' },
		});
		submit.setText(this.labels.submit);
		submit.addEventListener('click', () => {
			const instruction = field.value.trim();
			// An empty/whitespace instruction submits nothing (DESIGN-CA-001 C.5).
			if (instruction === '') return;
			void this.runQuery(() =>
				this.useCase.execute(
					this.params.selectedText,
					instruction,
					this.params.notePath,
					this.controller.signal,
				),
			);
		});
	}

	// ── Querying → outcome dispatch ───────────────────────────────────────────────

	private async runQuery(
		query: () => Promise<Awaited<ReturnType<InlineEditUseCase['execute']>>>,
	): Promise<void> {
		this.renderQuerying();
		const result = await query();
		if (this.resolved) return;
		if (!result.ok) {
			this.notify.showError(this.labels.failed);
			this.settle(null);
			this.close();
			return;
		}
		this.renderOutcome(result.value);
	}

	private renderQuerying(): void {
		this.contentEl.empty();
		this.teardownDiff();
		this.contentEl
			.createDiv({
				cls: 'sp-inline-edit-modal__querying',
				attr: { 'data-testid': 'inline-edit-querying' },
			})
			.setText(this.labels.querying);
	}

	private renderOutcome(outcome: InlineEditOutcome): void {
		switch (outcome.kind) {
			case 'replacement':
				this.renderPreview(outcome.text, outcome.diff);
				break;
			case 'insertion':
				// No diff to preview — the inserted text IS the accepted edit.
				this.renderPreview(outcome.text, null);
				break;
			case 'clarification':
				this.renderClarify(outcome.question);
				break;
		}
	}

	// ── Preview (replacement / insertion) ─────────────────────────────────────────

	private renderPreview(editedText: string, diff: ToolDiffData | null): void {
		this.contentEl.empty();
		this.teardownDiff();
		if (diff !== null) {
			const host = this.contentEl.createDiv({
				cls: 'sp-inline-edit-modal__diff',
				attr: { 'data-testid': 'inline-edit-diff-host' },
			});
			const diffApp = createApp({
				name: 'InlineEditDiff',
				render: () => h(DiffView, { diffData: diff }),
			});
			diffApp.use(i18n);
			diffApp.mount(host);
			this.diffApp = diffApp;
		} else {
			this.contentEl
				.createEl('pre', {
					cls: 'sp-inline-edit-modal__inserted',
					attr: { 'data-testid': 'inline-edit-inserted' },
				})
				.setText(editedText);
		}

		const actions = this.contentEl.createDiv({ cls: 'sp-inline-edit-modal__actions' });
		const reject = actions.createEl('button', {
			cls: 'sp-inline-edit-modal__reject',
			attr: { type: 'button', 'data-testid': 'inline-edit-reject' },
		});
		reject.setText(this.labels.reject);
		reject.addEventListener('click', () => {
			this.settle({ kind: 'reject' });
			this.close();
		});
		const accept = actions.createEl('button', {
			cls: 'sp-inline-edit-modal__accept mod-cta',
			attr: { type: 'button', 'data-testid': 'inline-edit-accept' },
		});
		accept.setText(this.labels.accept);
		accept.addEventListener('click', () => {
			this.settle({ kind: 'accept', editedText });
			this.close();
		});
	}

	// ── Clarify ───────────────────────────────────────────────────────────────────

	private renderClarify(question: string): void {
		this.contentEl.empty();
		this.teardownDiff();
		this.contentEl
			.createEl('p', {
				cls: 'sp-inline-edit-modal__question',
				attr: { 'data-testid': 'inline-edit-question' },
			})
			.setText(question);
		const reply = this.contentEl.createEl('textarea', {
			cls: 'sp-inline-edit-modal__reply',
			attr: {
				rows: '2',
				placeholder: this.labels.clarifyReplyPlaceholder,
				'data-testid': 'inline-edit-reply',
			},
		});
		const actions = this.contentEl.createDiv({ cls: 'sp-inline-edit-modal__actions' });
		const cont = actions.createEl('button', {
			cls: 'sp-inline-edit-modal__continue mod-cta',
			attr: { type: 'button', 'data-testid': 'inline-edit-continue' },
		});
		cont.setText(this.labels.continueLabel);
		cont.addEventListener('click', () => {
			const text = reply.value.trim();
			if (text === '') return;
			this.exchange.push({ role: 'assistant', text: question });
			this.exchange.push({ role: 'user', text });
			void this.runQuery(() =>
				this.useCase.continue(
					this.params.selectedText,
					this.exchange,
					text,
					this.controller.signal,
				),
			);
		});
	}

	// ── Lifecycle helpers ─────────────────────────────────────────────────────────

	private teardownDiff(): void {
		this.diffApp?.unmount();
		this.diffApp = null;
	}

	/** Resolve exactly once (the first of an accept/reject choice, a failure, or a dismiss). */
	private settle(value: InlineEditDecision | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.(value);
	}
}
