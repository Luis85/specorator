/**
 * T-CCS-024 — Tests: ChatResponse — all 6 state variants and ARIA live regions.
 * Satisfies REQ-CCS-012, REQ-CCS-016, NFR-CCS-009, SPEC-CCS-001 §7.6.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatResponse from '@/ui/components/chat/ChatResponse.vue'
import { ChatResponsePO } from './ChatResponse.po'

type ResponseState = 'idle' | 'loading' | 'success' | 'trimmed-success' | 'timeout' | 'error'

function mountResponse(state: ResponseState, text?: string) {
	const wrapper = mount(ChatResponse, {
		props: { state, text },
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
})
