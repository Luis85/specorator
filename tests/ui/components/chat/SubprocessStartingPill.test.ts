/**
 * T-ASM-055 — Tests: SubprocessStartingPill — visible/hidden binary state
 * and ARIA live region (REQ-ASM-035, NFR-ASM-001, NFR-ASM-008).
 * Mirrors SPEC §7.2 and DESIGN §B3 (R-ASM-003 mitigation).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SubprocessStartingPill from '@/ui/components/chat/SubprocessStartingPill.vue'
import { SubprocessStartingPillPO } from './SubprocessStartingPill.po'

function mountPill(visible: boolean) {
	const wrapper = mount(SubprocessStartingPill, {
		props: { visible },
	})
	return new SubprocessStartingPillPO(wrapper)
}

describe('SubprocessStartingPill', () => {
	describe('hidden state (visible === false)', () => {
		it('does not render the pill element', () => {
			const po = mountPill(false)
			expect(po.exists()).toBe(false)
		})
	})

	describe('visible state (visible === true)', () => {
		it('renders data-testid="chat-subprocess-starting"', () => {
			const po = mountPill(true)
			expect(po.exists()).toBe(true)
		})

		it('has role="status"', () => {
			const po = mountPill(true)
			expect(po.role()).toBe('status')
		})

		it('has aria-live="polite"', () => {
			const po = mountPill(true)
			expect(po.ariaLive()).toBe('polite')
		})

		it('shows plain-language starting copy', () => {
			const po = mountPill(true)
			expect(po.text()).toContain('Starting up the Claude tool')
		})

		it('contains no AI/SDK jargon in body copy (NFR-CCS-012 inheritance)', () => {
			const po = mountPill(true)
			const copy = po.text().toLowerCase()
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
				expect(copy).not.toContain(term)
			}
		})
	})

	describe('reactive toggle', () => {
		it('mounts and unmounts the pill when visible flips', async () => {
			const wrapper = mount(SubprocessStartingPill, {
				props: { visible: false },
			})
			const po = new SubprocessStartingPillPO(wrapper)
			expect(po.exists()).toBe(false)

			await wrapper.setProps({ visible: true })
			expect(po.exists()).toBe(true)

			await wrapper.setProps({ visible: false })
			expect(po.exists()).toBe(false)
		})
	})
})
