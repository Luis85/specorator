import { Modal, type App } from 'obsidian';
import { chooseForkTarget, type ForkTarget } from '@/application/threads/chooseForkTarget';

/**
 * The fork-target chooser (SPEC-TS-023, NFR-TS-007). An Obsidian `Modal` subclass
 * (it imports `obsidian`, so it lives in `src/plugin/`, NOT under `src/ui/**`)
 * presenting a small option list — "New tab" (the primary/default) and "Current
 * tab". Resolves `Promise<ForkTarget | null>` (`null` on Escape/dismiss). DOM built
 * with `createEl`/`createDiv`/`setText` — NO `innerHTML`/`v-html` (NFR-TS-006);
 * NEVER `window.confirm`/`prompt`/`alert` (NFR-TS-007). The pure option-resolution
 * (`chooseForkTarget`) is unit-tested (TEST-TS-014); the visual render is proven on
 * the manual leg (TEST-TS-M2).
 */
export class ForkTargetModal extends Modal {
	private resolved = false;
	private resolve: ((value: ForkTarget | null) => void) | null = null;

	constructor(
		app: App,
		private readonly labels: { title: string; newTab: string; currentTab: string },
	) {
		super(app);
	}

	/** Open the modal and resolve when the user chooses an option or dismisses it. */
	choose(): Promise<ForkTarget | null> {
		return new Promise<ForkTarget | null>((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.titleEl.setText(this.labels.title);
		this.modalEl.addClass('sp-fork-target-modal');
		const list = this.contentEl.createDiv({ cls: 'sp-fork-target-modal__options' });
		this.addOption(list, this.labels.newTab, 'new-tab', true);
		this.addOption(list, this.labels.currentTab, 'current-tab', false);
	}

	override onClose(): void {
		this.contentEl.empty();
		// Dismiss without a choice resolves null exactly once (Escape / click-out).
		this.settle(null);
	}

	private addOption(
		parent: HTMLElement,
		label: string,
		option: string,
		primary: boolean,
	): void {
		const testId = option === 'new-tab' ? 'fork-target-new' : 'fork-target-current';
		const button = parent.createEl('button', {
			cls: primary
				? 'sp-fork-target-modal__option sp-fork-target-modal__option--primary'
				: 'sp-fork-target-modal__option',
			attr: { type: 'button', 'data-testid': testId },
		});
		button.setText(label);
		button.addEventListener('click', () => {
			this.settle(chooseForkTarget(option));
			this.close();
		});
	}

	/** Resolve exactly once (the first of a click choice or a dismiss). */
	private settle(value: ForkTarget | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve?.(value);
	}
}
