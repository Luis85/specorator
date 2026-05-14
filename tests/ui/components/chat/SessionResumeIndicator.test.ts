/**
 * T-ASM-055 — Tests: SessionResumeIndicator — visible/hidden binary state,
 * ARIA label, and aria-hidden glyph (REQ-ASM-035, NFR-ASM-001, NFR-ASM-008).
 * Mirrors SPEC §7.3 and DESIGN §B3.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionResumeIndicator from '@/ui/components/chat/SessionResumeIndicator.vue'
import { SessionResumeIndicatorPO } from './SessionResumeIndicator.po'

function mountIndicator(resumed: boolean) {
	const wrapper = mount(SessionResumeIndicator, {
		props: { resumed },
	})
	return new SessionResumeIndicatorPO(wrapper)
}

describe('SessionResumeIndicator', () => {
	describe('hidden state (resumed === false)', () => {
		it('does not render the indicator element', () => {
			const po = mountIndicator(false)
			expect(po.exists()).toBe(false)
		})
	})

	describe('visible state (resumed === true)', () => {
		it('renders data-testid="chat-session-resume"', () => {
			const po = mountIndicator(true)
			expect(po.exists()).toBe(true)
		})

		it('exposes aria-label with the plain-language resume copy', () => {
			const po = mountIndicator(true)
			expect(po.ariaLabel()).toBe('Continuing prior conversation')
		})

		it('marks the visual glyph as aria-hidden', () => {
			const po = mountIndicator(true)
			expect(po.glyphAriaHidden()).toBe('true')
		})

		it('renders the ↻ glyph as the visible content', () => {
			const po = mountIndicator(true)
			expect(po.glyphText()).toBe('↻')
		})

		it('contains no AI/SDK jargon in aria-label (NFR-CCS-012 inheritance)', () => {
			const po = mountIndicator(true)
			const label = (po.ariaLabel() ?? '').toLowerCase()
			for (const term of [
				'subprocess',
				'oauth',
				'session_id',
				'stream-json',
				'schema',
				'zod',
				'envelope',
				'api key',
				'system prompt',
				'token',
			]) {
				expect(label).not.toContain(term)
			}
		})
	})

	describe('reactive toggle', () => {
		it('mounts and unmounts the badge when resumed flips', async () => {
			const wrapper = mount(SessionResumeIndicator, {
				props: { resumed: false },
			})
			const po = new SessionResumeIndicatorPO(wrapper)
			expect(po.exists()).toBe(false)

			await wrapper.setProps({ resumed: true })
			expect(po.exists()).toBe(true)

			await wrapper.setProps({ resumed: false })
			expect(po.exists()).toBe(false)
		})
	})
})
