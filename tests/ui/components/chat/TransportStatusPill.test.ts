/**
 * T-ASM-071 — Tests: TransportStatusPill — renders only when
 * kind === 'subscription'; verifies ARIA and plain-language copy.
 * Mirrors SPEC §7.1 and DESIGN §B3 (REQ-ASM-002, REQ-ASM-055, NFR-ASM-008,
 * NFR-CCS-012 inheritance).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TransportStatusPill from '@/ui/components/chat/TransportStatusPill.vue'
import type { TransportKind } from '@/domain/chat/TransportKind'
import { TransportStatusPillPO } from './TransportStatusPill.po'

function mountPill(kind: TransportKind) {
	const wrapper = mount(TransportStatusPill, {
		props: { kind },
	})
	return { wrapper, po: new TransportStatusPillPO(wrapper) }
}

describe('TransportStatusPill', () => {
	describe('subscription variant', () => {
		it('renders the pill with data-testid="chat-transport-status"', () => {
			const { po } = mountPill('subscription')
			expect(po.exists()).toBe(true)
		})

		it('renders the plain-language status copy', () => {
			const { po } = mountPill('subscription')
			expect(po.text()).toBe('Using your installed Claude tool.')
		})

		it('exposes role="status" and aria-live="polite"', () => {
			const { po } = mountPill('subscription')
			expect(po.role()).toBe('status')
			expect(po.ariaLive()).toBe('polite')
		})
	})

	describe('hidden variants', () => {
		it('does not render when kind === "api-key"', () => {
			const { po } = mountPill('api-key')
			expect(po.exists()).toBe(false)
		})

		it('does not render when kind === "degraded"', () => {
			const { po } = mountPill('degraded')
			expect(po.exists()).toBe(false)
		})

		it('does not render when kind === "auto"', () => {
			const { po } = mountPill('auto')
			expect(po.exists()).toBe(false)
		})
	})

	describe('reactive transitions', () => {
		it('mounts and unmounts the pill as kind toggles around "subscription"', async () => {
			const { wrapper, po } = mountPill('api-key')
			expect(po.exists()).toBe(false)

			await wrapper.setProps({ kind: 'subscription' })
			expect(po.exists()).toBe(true)
			expect(po.text()).toBe('Using your installed Claude tool.')

			await wrapper.setProps({ kind: 'degraded' })
			expect(po.exists()).toBe(false)

			await wrapper.setProps({ kind: 'subscription' })
			expect(po.exists()).toBe(true)
		})
	})

	describe('plain-language guarantee (NFR-CCS-012 inheritance)', () => {
		it('rendered copy contains no AI/SDK jargon', () => {
			const { po } = mountPill('subscription')
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
})
