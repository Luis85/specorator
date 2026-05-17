/**
 * T-CCS-024 — Tests: ChatResponse — all 7 state variants and ARIA live regions.
 * Satisfies REQ-CCS-012, REQ-CCS-016, NFR-CCS-009, SPEC-CCS-001 §7.6.
 * T-ASM-042 extends with the `structured-fail` state (REQ-ASM-025) plus
 * the `proposalCard` named slot.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatResponse from '@/ui/components/chat/ChatResponse.vue'
import { ChatResponsePO } from './ChatResponse.po'

type ResponseState =
	| 'idle'
	| 'loading'
	| 'success'
	| 'trimmed-success'
	| 'timeout'
	| 'error'
	| 'structured-fail'

function mountResponse(state: ResponseState, text?: string) {
	// WP-2: `legacyMode=true` exercises the original (full) state machine —
	// idle placeholder, loading copy, success-text body. The agent sidepanel
	// uses `legacyMode=false`; UX-#1 / UX-#2 suppress those branches there
	// because `MessageList` owns the rendering surface. The integration
	// behaviour of the new mode is asserted in `ChatSidebar.test.ts`.
	const wrapper = mount(ChatResponse, {
		props: { state, text, legacyMode: true },
	})
	return new ChatResponsePO(wrapper)
}

describe('ChatResponse', () => {
	describe('idle state', () => {
		it('renders data-testid="chat-response-idle"', () => {
			const po = mountResponse('idle')
			expect(po.hasIdle()).toBe(true)
		})

		it('does not render loading, text, or error elements', () => {
			const po = mountResponse('idle')
			expect(po.hasLoading()).toBe(false)
			expect(po.hasText()).toBe(false)
			expect(po.hasError()).toBe(false)
		})
	})

	describe('loading state', () => {
		it('renders data-testid="chat-response-loading"', () => {
			const po = mountResponse('loading')
			expect(po.hasLoading()).toBe(true)
		})

		it('loading element has role="status"', () => {
			const po = mountResponse('loading')
			expect(po.loadingRole()).toBe('status')
		})

		it('loading element has aria-live="polite"', () => {
			const po = mountResponse('loading')
			expect(po.loadingAriaLive()).toBe('polite')
		})
	})

	describe('success state', () => {
		it('renders data-testid="chat-response-text" with the text content', () => {
			const po = mountResponse('success', 'Hello world')
			expect(po.hasText()).toBe(true)
			expect(po.textContent()).toContain('Hello world')
		})

		it('does not render trim notice', () => {
			const po = mountResponse('success', 'Hello world')
			expect(po.hasTrimNotice()).toBe(false)
		})
	})

	describe('trimmed-success state', () => {
		it('renders trim notice alongside text', () => {
			const po = mountResponse('trimmed-success', 'Some answer')
			expect(po.hasTrimNotice()).toBe(true)
			expect(po.hasText()).toBe(true)
		})

		it('trim notice has role="status"', () => {
			const po = mountResponse('trimmed-success', 'Some answer')
			expect(po.trimNoticeRole()).toBe('status')
		})
	})

	describe('timeout state', () => {
		it('renders data-testid="chat-response-error"', () => {
			const po = mountResponse('timeout')
			expect(po.hasError()).toBe(true)
		})

		it('error element has role="alert"', () => {
			const po = mountResponse('timeout')
			expect(po.errorRole()).toBe('alert')
		})

		it('error element has aria-live="assertive"', () => {
			const po = mountResponse('timeout')
			expect(po.errorAriaLive()).toBe('assertive')
		})

		it('shows timeout-specific copy', () => {
			const po = mountResponse('timeout')
			expect(po.errorContent()).toContain('That took too long')
		})
	})

	describe('error state', () => {
		it('renders data-testid="chat-response-error"', () => {
			const po = mountResponse('error')
			expect(po.hasError()).toBe(true)
		})

		it('error element has role="alert" and aria-live="assertive"', () => {
			const po = mountResponse('error')
			expect(po.errorRole()).toBe('alert')
			expect(po.errorAriaLive()).toBe('assertive')
		})

		it('shows generic error copy', () => {
			const po = mountResponse('error')
			expect(po.errorContent()).toContain('Something went wrong')
		})
	})

	describe('structured-fail state (T-ASM-042, REQ-ASM-025)', () => {
		it('renders data-testid="chat-response-structured-fail"', () => {
			const po = mountResponse('structured-fail')
			expect(po.hasStructuredFail()).toBe(true)
		})

		it('structured-fail element has role="alert"', () => {
			const po = mountResponse('structured-fail')
			expect(po.structuredFailRole()).toBe('alert')
		})

		it('structured-fail element has aria-live="assertive"', () => {
			const po = mountResponse('structured-fail')
			expect(po.structuredFailAriaLive()).toBe('assertive')
		})

		it('shows plain-language copy with no jargon (NFR-ASM-009 / NFR-CCS-012)', () => {
			const po = mountResponse('structured-fail')
			const copy = po.structuredFailContent().toLowerCase()
			expect(copy).toContain('unexpected response')
			// Forbidden terms per SPEC §10.3 / DESIGN §B3.
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
			]) {
				expect(copy).not.toContain(term)
			}
		})

		it('does not render any other state element', () => {
			const po = mountResponse('structured-fail')
			expect(po.hasIdle()).toBe(false)
			expect(po.hasLoading()).toBe(false)
			expect(po.hasText()).toBe(false)
			expect(po.hasTrimNotice()).toBe(false)
			expect(po.hasError()).toBe(false)
		})

		it('other states do not render the structured-fail element (mutual exclusion regression)', () => {
			for (const state of [
				'idle',
				'loading',
				'success',
				'trimmed-success',
				'timeout',
				'error',
			] as const) {
				const po = mountResponse(state, 'Hello world')
				expect(po.hasStructuredFail()).toBe(false)
			}
		})
	})

	describe('proposalCard named slot (T-ASM-042)', () => {
		it('renders slot content alongside the success text', () => {
			const wrapper = mount(ChatResponse, {
				props: { state: 'success', text: 'Reply body', legacyMode: true },
				slots: {
					proposalCard: '<div data-testid="stub-proposal-card">card</div>',
				},
			})
			expect(wrapper.find('[data-testid="chat-response-text"]').exists()).toBe(true)
			expect(wrapper.find('[data-testid="stub-proposal-card"]').exists()).toBe(true)
		})

		it('renders slot content alongside trimmed-success', () => {
			const wrapper = mount(ChatResponse, {
				props: { state: 'trimmed-success', text: 'Reply body', legacyMode: true },
				slots: {
					proposalCard: '<div data-testid="stub-proposal-card">card</div>',
				},
			})
			expect(wrapper.find('[data-testid="chat-response-trim-notice"]').exists()).toBe(true)
			expect(wrapper.find('[data-testid="stub-proposal-card"]').exists()).toBe(true)
		})

		it('non-legacy mode (agent sidepanel) does not render the success text body — UX-#1', () => {
			const wrapper = mount(ChatResponse, {
				props: { state: 'success', text: 'Reply body', legacyMode: false },
				slots: {
					proposalCard: '<div data-testid="stub-proposal-card">card</div>',
				},
			})
			// UX-#1: MessageList is the rendering surface in non-legacy mode.
			expect(wrapper.find('[data-testid="chat-response-text"]').exists()).toBe(false)
			// Proposal card slot must still be hosted here.
			expect(wrapper.find('[data-testid="stub-proposal-card"]').exists()).toBe(true)
		})

		it('non-legacy mode does not render the loading "Thinking…" copy — UX-#2', () => {
			const wrapper = mount(ChatResponse, {
				props: { state: 'loading', legacyMode: false },
			})
			// UX-#2: MessageList's streaming bubble carries the in-flight signal.
			expect(wrapper.find('[data-testid="chat-response-loading"]').exists()).toBe(false)
		})
	})
})
