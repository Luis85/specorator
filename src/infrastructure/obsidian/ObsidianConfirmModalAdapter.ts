import { ButtonComponent, Modal } from 'obsidian'
import type { App } from 'obsidian'
import type { ConfirmModalPort, ConfirmModalRequest } from '@/domain/ports/ConfirmModalPort'

/**
 * Production implementation of {@link ConfirmModalPort} that wraps an
 * Obsidian {@link Modal} subclass.
 *
 * Satisfies REQ-ASM-044 (ADR-0032). The CLAUDE.md DOM-construction discipline
 * forbids `window.confirm` / `window.alert` / `window.prompt` and
 * `innerHTML` / `insertAdjacentHTML`. This adapter therefore builds the DOM
 * exclusively through Obsidian's `createEl` / `createDiv` / `setText`
 * helpers, which are XSS-safe by construction.
 *
 * Resolution model:
 * - Confirm button click → resolves `true`.
 * - Cancel button click → resolves `false`.
 * - Escape / dismiss (any close not triggered by the buttons) → resolves `false`.
 *
 * The promise is resolved at most once; subsequent close events are no-ops.
 * `show()` never throws.
 */
export class ObsidianConfirmModalAdapter implements ConfirmModalPort {
	private readonly _app: App

	constructor(app: App) {
		this._app = app
	}

	show(args: ConfirmModalRequest): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			let settled = false
			const settle = (value: boolean): void => {
				if (settled) return
				settled = true
				resolve(value)
			}

			const modal = new (class extends Modal {
				onOpen(): void {
					this.titleEl.setText(args.title)

					this.contentEl.empty()
					const bodyEl = this.contentEl.createDiv({
						cls: 'specorator-confirm-modal-body',
					})
					bodyEl.setText(args.body)

					const buttonRow = this.contentEl.createDiv({
						cls: 'modal-button-container specorator-confirm-modal-buttons',
					})

					new ButtonComponent(buttonRow)
						.setButtonText(args.cancelLabel)
						.onClick(() => {
							settle(false)
							this.close()
						})

					new ButtonComponent(buttonRow)
						.setButtonText(args.confirmLabel)
						.setCta()
						.onClick(() => {
							settle(true)
							this.close()
						})
				}

				onClose(): void {
					this.contentEl.empty()
					// Resolves `false` for Escape / outside-click dismissals.
					// No-op if a button already settled the promise.
					settle(false)
				}
			})(this._app)

			modal.open()
		})
	}
}
