import type { VueWrapper } from '@vue/test-utils';

const TID = {
	composer: 'chat-composer',
	textarea: 'composer-textarea',
	send: 'composer-send',
	dropdown: 'composer-dropdown',
	planIndicator: 'plan-indicator',
	bangBashOutput: 'bang-bash-output',
	inlineAsk: 'inline-ask',
	inlineExitPlan: 'inline-exit-plan',
	inlinePlanApproval: 'inline-plan-approval',
	// P5 context-attachments extension (SPEC-CA-022).
	contextBar: 'composer-context-bar',
	fileChips: 'file-chips',
	fileChipRemove: 'file-chip-remove',
	fileChipLink: 'file-chip-link',
	imageContextBar: 'image-context-bar',
	imageThumbRemove: 'image-thumb-remove',
	imageThumbPreview: 'image-thumb-preview',
	selectionIndicator: 'selection-indicator',
	selectionClear: 'selection-indicator-clear',
	attach: 'composer-attach',
	// P6 toolbar-controls extension (SPEC-TC-021).
	toolbar: 'composer-toolbar',
	toolbarStrip: 'toolbar-strip',
	toolbarModel: 'toolbar-model',
	toolbarMode: 'toolbar-mode',
} as const;

/** PageObject for `ChatComposer.vue` (SPEC-CC-021). Queries by `data-testid` only (ADR-009). */
export class ChatComposerPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.composer)).exists();
	}

	get textarea() {
		return this.wrapper.get(this.byTid(TID.textarea));
	}

	get send() {
		return this.wrapper.get(this.byTid(TID.send));
	}

	async setValue(value: string): Promise<void> {
		await this.textarea.setValue(value);
	}

	value(): string {
		return (this.textarea.element as HTMLTextAreaElement).value;
	}

	sendDisabled(): boolean {
		return (this.send.element as HTMLButtonElement).disabled;
	}

	sendLabel(): string {
		return this.send.attributes('aria-label') ?? '';
	}

	async pressEnter(
		modifiers: { shift?: boolean; composing?: boolean } = {},
	): Promise<KeyboardEvent> {
		const event = new KeyboardEvent('keydown', {
			key: 'Enter',
			shiftKey: modifiers.shift ?? false,
			cancelable: true,
		});
		if (modifiers.composing) Object.defineProperty(event, 'isComposing', { value: true });
		this.textarea.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}

	async pressEsc(): Promise<void> {
		await this.textarea.trigger('keydown', { key: 'Escape' });
	}

	async clickSend(): Promise<void> {
		await this.send.trigger('click');
	}

	// ── P4 composer-power extension (SPEC-CP-019) ───────────────────────────────

	textareaExists(): boolean {
		return this.wrapper.find(this.byTid(TID.textarea)).exists();
	}

	placeholder(): string {
		return this.textarea.attributes('placeholder') ?? '';
	}

	textareaRole(): string {
		return this.textarea.attributes('role') ?? '';
	}

	ariaExpanded(): string {
		return this.textarea.attributes('aria-expanded') ?? '';
	}

	/** The mode-border class set on the composer wrapper (instruction/bang-bash/plan). */
	composerClasses(): string {
		return this.wrapper.get(this.byTid(TID.composer)).attributes('class') ?? '';
	}

	hasDropdown(): boolean {
		return this.wrapper.find(this.byTid(TID.dropdown)).exists();
	}

	hasPlanIndicator(): boolean {
		return this.wrapper.find(this.byTid(TID.planIndicator)).exists();
	}

	hasBangBashOutput(): boolean {
		return this.wrapper.find(this.byTid(TID.bangBashOutput)).exists();
	}

	hasInlineAsk(): boolean {
		return this.wrapper.find(this.byTid(TID.inlineAsk)).exists();
	}

	hasInlineExitPlan(): boolean {
		return this.wrapper.find(this.byTid(TID.inlineExitPlan)).exists();
	}

	hasInlinePlanApproval(): boolean {
		return this.wrapper.find(this.byTid(TID.inlinePlanApproval)).exists();
	}

	/** Type into the textarea and fire `input` so the arbiter re-classifies. */
	async typeValue(value: string): Promise<void> {
		await this.textarea.setValue(value);
		await this.textarea.trigger('input');
	}

	// ── P5 context-attachments extension (SPEC-CA-022) ──────────────────────────

	hasContextBar(): boolean {
		return this.wrapper.find(this.byTid(TID.contextBar)).exists();
	}

	hasFileChips(): boolean {
		return this.wrapper.find(this.byTid(TID.fileChips)).exists();
	}

	hasImageContextBar(): boolean {
		return this.wrapper.find(this.byTid(TID.imageContextBar)).exists();
	}

	hasSelectionIndicator(): boolean {
		return this.wrapper.find(this.byTid(TID.selectionIndicator)).exists();
	}

	async clickFirstFileRemove(): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.fileChipRemove))[0].trigger('click');
	}

	async clickFirstFileLink(): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.fileChipLink))[0].trigger('click');
	}

	async clickFirstImageRemove(): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.imageThumbRemove))[0].trigger('click');
	}

	async clickFirstImagePreview(): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.imageThumbPreview))[0].trigger('click');
	}

	async clickSelectionClear(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.selectionClear)).trigger('click');
	}

	// ── FIX-2.3 drop / paste (SPEC-CA-022) ──────────────────────────────────────

	/** Fire a `drop` on the composer root carrying `files` via a stubbed DataTransfer. */
	async dropFiles(files: File[]): Promise<DragEvent> {
		const event = new Event('drop', { cancelable: true, bubbles: true }) as DragEvent;
		Object.defineProperty(event, 'dataTransfer', { value: { files } });
		this.wrapper.get(this.byTid(TID.composer)).element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}

	/** Fire a `paste` on the textarea carrying image `files` via stubbed clipboard items. */
	async pasteFiles(files: File[]): Promise<ClipboardEvent> {
		const items = files.map((file) => ({
			kind: 'file',
			type: file.type,
			getAsFile: () => file,
		}));
		const event = new Event('paste', { cancelable: true, bubbles: true }) as ClipboardEvent;
		Object.defineProperty(event, 'clipboardData', { value: { files, items } });
		this.textarea.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}

	// ── FIX-2.2 attach button (SPEC-CA-022) ─────────────────────────────────────

	hasAttach(): boolean {
		return this.wrapper.find(this.byTid(TID.attach)).exists();
	}

	attachLabel(): string {
		return this.wrapper.get(this.byTid(TID.attach)).attributes('aria-label') ?? '';
	}

	async clickAttach(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.attach)).trigger('click');
	}

	// ── P6 toolbar-controls extension (SPEC-TC-021) ─────────────────────────────

	hasToolbar(): boolean {
		return this.wrapper.find(this.byTid(TID.toolbar)).exists();
	}

	hasToolbarStrip(): boolean {
		return this.wrapper.find(this.byTid(TID.toolbarStrip)).exists();
	}

	async clickToolbarMode(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.toolbarMode)).trigger('click');
	}

	/** Fire a `paste` carrying plain text only (no files). */
	async pasteText(_text: string): Promise<ClipboardEvent> {
		const event = new Event('paste', { cancelable: true, bubbles: true }) as ClipboardEvent;
		Object.defineProperty(event, 'clipboardData', {
			value: { files: [], items: [{ kind: 'string', type: 'text/plain' }] },
		});
		this.textarea.element.dispatchEvent(event);
		await this.wrapper.vm.$nextTick();
		return event;
	}
}
