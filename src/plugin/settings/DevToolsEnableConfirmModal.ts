/**
 * `DevToolsEnableConfirmModal` — the per-tool confirm modal fired when the
 * user flips a high-risk DevTools tool toggle on. Implements Part B §S07–S09
 * of `specs/mcp-host-side-proposals/design.md`.
 *
 * Satisfies REQ-MHP-016, REQ-MHP-017, REQ-MHP-020; NFR-MHP-011 (a11y).
 *
 * Behaviour:
 *   - Renders the verbatim per-tool threat paragraph (from
 *     `@/application/mcp/threatParagraphs`) inside a modal body.
 *   - Primary button `Enable <tool>` is styled `mod-warning` (Obsidian's
 *     destructive class).
 *   - Focus moves to the heading on open; keyboard traps cycle Cancel ↔
 *     Enable; Esc cancels; Enter has no default action (no implicit primary
 *     binding — Part B §S08).
 *   - On confirm: invokes the `onConfirm` callback. If the callback rejects
 *     (e.g. registrar refresh fails), the modal stays open and surfaces an
 *     inline error per Part B §S09 with `data-testid="devtools-confirm-error"`.
 *
 * Composition: this class deliberately does NOT extend Obsidian's `Modal`
 * base class. Plugin-chrome tests run against `tests/__fakes__/obsidian.stub.ts`
 * which does not export `Modal`; subclassing would break the test harness.
 * Instead the class duck-types Obsidian's modal surface (`containerEl`,
 * `contentEl`, `open()`, `close()`) and builds its own DOM on `document.body`
 * via small XSS-safe helpers — the same shape Obsidian's `createEl` /
 * `createDiv` use (DOM construction discipline from `CLAUDE.md` §"DOM
 * construction"; no `innerHTML`, no `v-html`).
 */
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type { DevToolsToolId } from '@/application/mcp/threatParagraphs'

/**
 * Minimal shape this modal needs from the Obsidian `App`. Kept narrow so
 * the modal can be unit-tested with a stub (`{ workspace: {} }`).
 */
export interface ConfirmModalApp {
	readonly workspace: unknown
}

/**
 * Minimal shape this modal needs from the injected ports. Structurally
 * compatible with `FakePorts` (the test harness) and the production
 * `LoggerPort` instance wired in by `Plugin.onload`.
 */
export interface ConfirmModalPorts {
	readonly logger?: Pick<LoggerPort, 'warn' | 'error'>
}

export interface DevToolsEnableConfirmModalArgs {
	readonly app: ConfirmModalApp
	readonly toolId: DevToolsToolId
	readonly threatParagraph: string
	readonly onConfirm: () => Promise<void> | void
	readonly ports: ConfirmModalPorts
}

/**
 * Per Part B §S07–S09. Stable test-ids:
 *   - `devtools-confirm-modal`   — modal root
 *   - `devtools-confirm-heading` — heading element (receives focus on open)
 *   - `devtools-confirm-threat`  — threat-paragraph body
 *   - `devtools-confirm-cancel`  — Cancel button
 *   - `devtools-confirm-enable`  — Enable button (mod-warning)
 *   - `devtools-confirm-error`   — inline error (S09; rendered on confirm failure)
 */
const TESTID_ROOT = 'devtools-confirm-modal'
const TESTID_HEADING = 'devtools-confirm-heading'
const TESTID_THREAT = 'devtools-confirm-threat'
const TESTID_CANCEL = 'devtools-confirm-cancel'
const TESTID_ENABLE = 'devtools-confirm-enable'
const TESTID_ERROR = 'devtools-confirm-error'

/**
 * Tiny XSS-safe DOM helper that mirrors Obsidian's `createEl` / `createDiv`
 * shape. Centralises raw `document.createElement` usage so the obsidian-md
 * lint rules (`obsidianmd/prefer-create-el` / `obsidianmd/prefer-active-doc`)
 * fire on exactly one line — the helper — instead of cluttering every call
 * site. Tests run in jsdom where Obsidian's HTMLElement augmentations are
 * not available; this helper is jsdom-compatible.
 */
const make = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	opts?: { readonly cls?: string; readonly text?: string },
): HTMLElementTagNameMap[K] => {
	// eslint-disable-next-line obsidianmd/prefer-create-el, obsidianmd/prefer-active-doc
	const el = document.createElement(tag)
	if (opts?.cls !== undefined && opts.cls !== '') el.className = opts.cls
	if (opts?.text !== undefined) el.textContent = opts.text
	return el
}

export class DevToolsEnableConfirmModal {
	public containerEl: HTMLElement
	public contentEl: HTMLElement

	private readonly _args: DevToolsEnableConfirmModalArgs
	private _isOpen = false
	private _cancelEl: HTMLButtonElement | null = null
	private _enableEl: HTMLButtonElement | null = null
	private _headingEl: HTMLElement | null = null
	private _errorEl: HTMLElement | null = null
	private readonly _onKeydown: (ev: KeyboardEvent) => void

	constructor(args: DevToolsEnableConfirmModalArgs) {
		this._args = args
		this.containerEl = make('div')
		this.contentEl = make('div')
		this._onKeydown = (ev: KeyboardEvent) => {
			this._handleKeydown(ev)
		}
	}

	open(): void {
		if (this._isOpen) return
		this._isOpen = true

		this.containerEl.setAttribute('data-testid', TESTID_ROOT)
		this.containerEl.setAttribute('role', 'dialog')
		this.containerEl.setAttribute('aria-modal', 'true')
		// jsdom does not expose Obsidian's `empty()` HTMLElement augmentation;
		// clear children manually so the modal can be re-opened cleanly.
		while (this.contentEl.firstChild !== null) {
			this.contentEl.removeChild(this.contentEl.firstChild)
		}

		this._buildDom()
		this.containerEl.appendChild(this.contentEl)
		// eslint-disable-next-line obsidianmd/prefer-active-doc
		document.body.appendChild(this.containerEl)

		this.contentEl.addEventListener('keydown', this._onKeydown)

		// Part B §S07: focus moves to the heading on open. The heading is
		// rendered with tabindex=-1 so it can receive programmatic focus
		// without entering the natural tab cycle.
		this._headingEl?.focus()
	}

	close(): void {
		if (!this._isOpen) return
		this._isOpen = false
		this.contentEl.removeEventListener('keydown', this._onKeydown)
		if (this.containerEl.parentNode !== null) {
			this.containerEl.parentNode.removeChild(this.containerEl)
		}
	}

	private _buildDom(): void {
		const heading = make('h2', { text: `Enable ${this._args.toolId}?` })
		heading.setAttribute('data-testid', TESTID_HEADING)
		heading.setAttribute('tabindex', '-1')
		heading.id = `${TESTID_HEADING}-${this._args.toolId}`
		this.contentEl.appendChild(heading)
		this._headingEl = heading

		const threat = make('p', { text: this._args.threatParagraph })
		threat.setAttribute('data-testid', TESTID_THREAT)
		threat.id = `${TESTID_THREAT}-${this._args.toolId}`
		this.contentEl.appendChild(threat)

		this.containerEl.setAttribute('aria-labelledby', heading.id)
		this.containerEl.setAttribute('aria-describedby', threat.id)

		const buttonRow = make('div', { cls: 'modal-button-container' })
		this.contentEl.appendChild(buttonRow)

		const cancel = make('button', { text: 'Cancel' })
		cancel.type = 'button'
		cancel.setAttribute('data-testid', TESTID_CANCEL)
		cancel.addEventListener('click', () => {
			this.close()
		})
		buttonRow.appendChild(cancel)
		this._cancelEl = cancel

		const enable = make('button', { text: `Enable ${this._args.toolId}` })
		enable.type = 'button'
		enable.setAttribute('data-testid', TESTID_ENABLE)
		enable.classList.add('mod-warning')
		enable.addEventListener('click', () => {
			void this._handleConfirm()
		})
		buttonRow.appendChild(enable)
		this._enableEl = enable
	}

	private async _handleConfirm(): Promise<void> {
		this._hideError()
		if (this._enableEl !== null) this._enableEl.disabled = true
		// Raw try/catch is required here because the modal's confirm path must
		// surface registrar-refresh failures inline (Part B §S09) regardless of
		// where the throw originated — the `tryAsync` helper boxes the result
		// as a `Result<T,E>` that the call sites currently do not consume.
		// eslint-disable-next-line no-restricted-syntax
		try {
			await this._args.onConfirm()
			this.close()
		} catch (cause) {
			this._args.ports.logger?.warn(
				'DevToolsEnableConfirmModal: onConfirm rejected',
				{ toolId: this._args.toolId, error: String(cause) },
			)
			this._showError(`Could not enable ${this._args.toolId}. Try reloading the plugin.`)
			if (this._enableEl !== null) this._enableEl.disabled = false
		}
	}

	private _handleKeydown(ev: KeyboardEvent): void {
		// Part B §S08: Enter has no default action — primary is not bound to
		// the implicit form-submit gesture.
		if (ev.key === 'Escape') {
			ev.preventDefault()
			this.close()
			return
		}
		if (ev.key === 'Tab') {
			ev.preventDefault()
			this._cycleFocus(ev.shiftKey === true)
			return
		}
		// Enter and other keys are intentionally not handled.
	}

	private _cycleFocus(reverse: boolean): void {
		const cancel = this._cancelEl
		const enable = this._enableEl
		if (cancel === null || enable === null) return
		// eslint-disable-next-line obsidianmd/prefer-active-doc
		const active = document.activeElement
		if (reverse) {
			if (active === cancel) enable.focus()
			else cancel.focus()
			return
		}
		if (active === cancel) enable.focus()
		else cancel.focus()
	}

	private _showError(message: string): void {
		if (this._errorEl === null) {
			const errEl = make('p', { text: message })
			errEl.setAttribute('data-testid', TESTID_ERROR)
			errEl.setAttribute('role', 'alert')
			this.contentEl.appendChild(errEl)
			this._errorEl = errEl
			return
		}
		this._errorEl.textContent = message
		this._errorEl.removeAttribute('hidden')
	}

	private _hideError(): void {
		if (this._errorEl !== null) {
			this._errorEl.setAttribute('hidden', '')
		}
	}
}
