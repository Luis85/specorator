/**
 * T-MHP-122 — DevTools enable confirm-modal flow tests.
 *
 * NOTE on task-ID vs path mapping: the user's task brief for T-MHP-122 names
 * the DevTools confirm-modal flow at this path. The tasks.md entry for
 * T-MHP-122 itself is the AutoAcceptReceipt render tests; the DevTools
 * confirm-modal tests are tracked there as T-MHP-083. Per the user's explicit
 * routing, this file covers the DevTools confirm-modal contract per
 * spec.md Part B §S07–S09 + REQ-MHP-016, REQ-MHP-017, REQ-MHP-020 +
 * NFR-MHP-011 (a11y). Flagged in the qa hand-off note.
 *
 * Satisfies: REQ-MHP-016, REQ-MHP-017, REQ-MHP-020; Part B §S07..S09;
 *            NFR-MHP-011 (a11y).
 *
 * The contract under test:
 *   - DevToolsEnableConfirmModal opens with focus on its heading.
 *   - Esc cancels (no enable, no settings save).
 *   - Tab cycles Cancel ↔ Enable (focus trap).
 *   - Enter does NOT trigger default action (no autofocus on primary).
 *   - Primary action is styled `mod-warning`.
 *   - Threat paragraph is rendered verbatim from the imported constant.
 *   - On registration failure (S09), inline error with
 *     data-testid="devtools-confirm-error" is shown.
 *   - For `dev:cdp`, body includes the second-paragraph "always prompts"
 *     sentence.
 *
 * All element queries use `data-testid` only per ADR-009.
 *
 * This test MUST fail before the modal implementation lands (TDD).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeModulePorts } from '../../../__fakes__/fake-ports'

// The SUT and the threat-paragraph constants module do not exist yet — the
// imports themselves should fail until T-MHP-084 ships.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — module does not exist yet (TDD): production code to be written for T-MHP-084.
import { DevToolsEnableConfirmModal } from '@/plugin/settings/DevToolsEnableConfirmModal'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — module does not exist yet (TDD): threat constants per RISK-MHP-015.
import { THREAT_PARAGRAPHS_MHP } from '@/application/mcp/threatParagraphs'

type DevToolsHighRiskToolId = 'dev:dom' | 'dev:cdp' | 'dev:debug' | 'dev:mobile' | 'devtools'

interface ModalLike {
	open(): void
	close(): void
	containerEl: HTMLElement
	contentEl: HTMLElement
}

function byTid(root: HTMLElement, tid: string): HTMLElement | null {
	return root.querySelector(`[data-testid="${tid}"]`)
}

function requireTid(root: HTMLElement, tid: string): HTMLElement {
	const el = byTid(root, tid)
	if (el === null) {
		throw new Error(`expected element [data-testid="${tid}"] to exist`)
	}
	return el
}

function openModal(
	toolId: DevToolsHighRiskToolId,
	onConfirm: () => Promise<void> | void = vi.fn(),
): ModalLike {
	const ports = fakeModulePorts()
	const modal = new DevToolsEnableConfirmModal({
		app: { workspace: {} },
		toolId,
		threatParagraph: THREAT_PARAGRAPHS_MHP[toolId],
		onConfirm,
		ports,
	}) as ModalLike
	modal.open()
	return modal
}

describe('T-MHP-122 — DevToolsEnableConfirmModal (Part B §S07..S09)', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	// ── S07 — opening behaviour ───────────────────────────────────────────────
	it('moves focus to the heading on open (S07)', () => {
		const modal = openModal('dev:dom')
		const heading = requireTid(modal.contentEl, 'devtools-confirm-heading')
		expect(document.activeElement).toBe(heading)
	})

	it('uses mod-warning class on the primary Enable button (S07)', () => {
		const modal = openModal('dev:dom')
		const enable = requireTid(modal.contentEl, 'devtools-confirm-enable')
		expect(enable.classList.contains('mod-warning')).toBe(true)
	})

	it('renders the threat paragraph verbatim from constant (S07, RISK-MHP-015)', () => {
		const modal = openModal('dev:dom')
		const body = requireTid(modal.contentEl, 'devtools-confirm-threat')
		expect(body.textContent).toBe(THREAT_PARAGRAPHS_MHP['dev:dom'])
	})

	// ── S08 — keyboard behaviour ──────────────────────────────────────────────
	it('Esc closes the modal and does not invoke onConfirm (S08)', () => {
		const onConfirm = vi.fn()
		const modal = openModal('dev:dom', onConfirm)
		const closeSpy = vi.spyOn(modal, 'close')
		modal.contentEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		expect(onConfirm).not.toHaveBeenCalled()
		expect(closeSpy).toHaveBeenCalled()
	})

	it('Tab cycles Cancel ↔ Enable (focus trap, S08)', () => {
		const modal = openModal('dev:dom')
		const cancel = requireTid(modal.contentEl, 'devtools-confirm-cancel')
		const enable = requireTid(modal.contentEl, 'devtools-confirm-enable')
		cancel.focus()
		expect(document.activeElement).toBe(cancel)
		modal.contentEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
		expect(document.activeElement).toBe(enable)
		modal.contentEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
		expect(document.activeElement).toBe(cancel)
	})

	it('Enter on the body does NOT trigger Enable (no implicit default, S08)', () => {
		const onConfirm = vi.fn()
		const modal = openModal('dev:dom', onConfirm)
		modal.contentEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(onConfirm).not.toHaveBeenCalled()
	})

	// ── S09 — failure rendering ───────────────────────────────────────────────
	it('shows inline error with data-testid="devtools-confirm-error" on registration failure (S09)', async () => {
		const failingConfirm = vi.fn(async () => {
			throw new Error('registration failed')
		})
		const modal = openModal('dev:dom', failingConfirm)
		const enable = requireTid(modal.contentEl, 'devtools-confirm-enable')
		enable.click()
		// Allow the async confirm handler + DOM update to flush.
		await Promise.resolve()
		await Promise.resolve()
		expect(failingConfirm).toHaveBeenCalled()
		const err = requireTid(modal.contentEl, 'devtools-confirm-error')
		expect(err).not.toBeNull()
		// Inline error must be visible (not display: none).
		expect(err.hasAttribute('hidden')).toBe(false)
	})

	// ── REQ-MHP-020 — dev:cdp second-paragraph variant ───────────────────────
	it('dev:cdp body includes the "always prompts" sentence (REQ-MHP-020)', () => {
		const modal = openModal('dev:cdp')
		const text = modal.contentEl.textContent ?? ''
		// The verbatim sentence per REQ-MHP-020 / Part B §S07 second paragraph.
		expect(text.toLowerCase()).toContain('always prompts')
	})
})
