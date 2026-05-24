/**
 * T-MHP-083 — `DevToolsEnableConfirmModal` interaction tests (Part B §S07–S09).
 *
 * The Batch 2C modal at `src/plugin/settings/DevToolsEnableConfirmModal.ts`
 * already passes the in-flight T-MHP-122 file routed to it; this file is the
 * canonical T-MHP-083 contract — exercises the focus, keyboard, ARIA,
 * inline-error, and `dev:cdp` second-paragraph behaviour required by the
 * planner DoD.
 *
 * Satisfies: REQ-MHP-016, REQ-MHP-017, REQ-MHP-020; Part B §S07..S09;
 *            NFR-MHP-011 (a11y).
 *
 * Element queries use `data-testid` only (ADR-009).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeModulePorts } from '../../__fakes__/fake-ports'
import { DevToolsEnableConfirmModal } from '@/plugin/settings/DevToolsEnableConfirmModal'
import {
  THREAT_PARAGRAPHS_MHP,
  type DevToolsToolId,
} from '@/application/mcp/threatParagraphs'

type HighRiskId = 'dev:dom' | 'dev:cdp' | 'dev:debug' | 'dev:mobile' | 'devtools'

interface ModalLike {
  open(): void
  close(): void
  containerEl: HTMLElement
  contentEl: HTMLElement
}

function requireTid(root: HTMLElement, tid: string): HTMLElement {
  const el = root.querySelector(`[data-testid="${tid}"]`)
  if (el === null) throw new Error(`expected [data-testid="${tid}"] in subtree`)
  return el as HTMLElement
}

function openModal(
  toolId: DevToolsToolId,
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

describe('T-MHP-083 — DevToolsEnableConfirmModal interaction (Part B §S07–S09)', () => {
  beforeEach(() => {
    // Clear any leftover modal nodes from prior tests via DOM API (no innerHTML).
    while (document.body.firstChild !== null) {
      document.body.removeChild(document.body.firstChild)
    }
  })

  // ── S07 — opening / structural ─────────────────────────────────────────
  it('mounts the modal with role=dialog and aria-modal=true (a11y)', () => {
    const modal = openModal('dev:dom')
    expect(modal.containerEl.getAttribute('role')).toBe('dialog')
    expect(modal.containerEl.getAttribute('aria-modal')).toBe('true')
  })

  it('exposes aria-labelledby / aria-describedby for heading + threat body', () => {
    const modal = openModal('dev:dom')
    const heading = requireTid(modal.contentEl, 'devtools-confirm-heading')
    const threat = requireTid(modal.contentEl, 'devtools-confirm-threat')
    expect(modal.containerEl.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(modal.containerEl.getAttribute('aria-describedby')).toBe(threat.id)
  })

  it('moves focus to the heading on open (S07)', () => {
    const modal = openModal('dev:dom')
    const heading = requireTid(modal.contentEl, 'devtools-confirm-heading')
    expect(document.activeElement).toBe(heading)
  })

  it('renders the threat paragraph verbatim from the constant (RISK-MHP-015)', () => {
    const modal = openModal('dev:dom')
    const body = requireTid(modal.contentEl, 'devtools-confirm-threat')
    expect(body.textContent).toBe(THREAT_PARAGRAPHS_MHP['dev:dom'])
  })

  it('primary Enable button carries the mod-warning class (S07 destructive)', () => {
    const modal = openModal('dev:dom')
    const enable = requireTid(modal.contentEl, 'devtools-confirm-enable')
    expect(enable.classList.contains('mod-warning')).toBe(true)
  })

  // ── S08 — keyboard ─────────────────────────────────────────────────────
  it('Esc cancels: closes modal without invoking onConfirm', () => {
    const onConfirm = vi.fn()
    const modal = openModal('dev:dom', onConfirm)
    const closeSpy = vi.spyOn(modal, 'close')
    modal.contentEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(closeSpy).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Tab cycles Cancel ↔ Enable (focus trap, S08)', () => {
    const modal = openModal('dev:dom')
    const cancel = requireTid(modal.contentEl, 'devtools-confirm-cancel')
    const enable = requireTid(modal.contentEl, 'devtools-confirm-enable')
    cancel.focus()
    modal.contentEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    )
    expect(document.activeElement).toBe(enable)
    modal.contentEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    )
    expect(document.activeElement).toBe(cancel)
  })

  it('Enter has no default action — does not invoke onConfirm (S08)', () => {
    const onConfirm = vi.fn()
    const modal = openModal('dev:dom', onConfirm)
    modal.contentEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ── S09 — failure rendering ────────────────────────────────────────────
  it('shows inline error with data-testid="devtools-confirm-error" on confirm rejection (S09)', async () => {
    const failing = vi.fn(async () => {
      throw new Error('registration failed')
    })
    const modal = openModal('dev:dom', failing)
    const enable = requireTid(modal.contentEl, 'devtools-confirm-enable')
    enable.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(failing).toHaveBeenCalled()
    const err = requireTid(modal.contentEl, 'devtools-confirm-error')
    expect(err.hasAttribute('hidden')).toBe(false)
    expect(err.getAttribute('role')).toBe('alert')
  })

  it('S09: the Enable button is re-enabled after a failed confirm so the user can retry', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom')
    })
    const modal = openModal('dev:dom', failing)
    const enable = requireTid(
      modal.contentEl,
      'devtools-confirm-enable',
    ) as HTMLButtonElement
    enable.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(enable.disabled).toBe(false)
  })

  it('successful confirm closes the modal (happy path)', async () => {
    const ok = vi.fn(async () => undefined)
    const modal = openModal('dev:dom', ok)
    const closeSpy = vi.spyOn(modal, 'close')
    const enable = requireTid(modal.contentEl, 'devtools-confirm-enable')
    enable.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(ok).toHaveBeenCalled()
    expect(closeSpy).toHaveBeenCalled()
  })

  // ── REQ-MHP-020 — dev:cdp second-paragraph variant ────────────────────
  it.each([
    'dev:dom',
    'dev:cdp',
    'dev:debug',
    'dev:mobile',
    'devtools',
  ] satisfies HighRiskId[])(
    'every high-risk tool id (%s) opens with its own threat paragraph',
    (toolId) => {
      const modal = openModal(toolId)
      const body = requireTid(modal.contentEl, 'devtools-confirm-threat')
      expect(body.textContent).toBe(THREAT_PARAGRAPHS_MHP[toolId])
    },
  )

  it('dev:cdp body includes the verbatim "always prompts" sentence (REQ-MHP-020 / Part B §S07)', () => {
    const modal = openModal('dev:cdp')
    const text = String(modal.contentEl.textContent)
    expect(text).toContain(
      'every dev:cdp invocation always prompts for approval',
    )
  })
})
