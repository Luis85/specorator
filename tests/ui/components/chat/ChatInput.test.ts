/**
 * T-CCS-022 — Tests: ChatInput — v-model, disabled state, send via Ctrl+Enter, button states.
 * Satisfies REQ-CCS-013, REQ-CCS-014, REQ-CCS-015, NFR-CCS-009, SPEC-CCS-001 §7.5.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatInput from '@/ui/components/chat/ChatInput.vue'
import { ChatInputPO } from './ChatInput.po'

function mountChatInput(props: { modelValue: string; disabled: boolean; loading: boolean }) {
	const wrapper = mount(ChatInput, { props })
	return new ChatInputPO(wrapper)
}

describe('ChatInput', () => {
	it('renders data-testid="chat-input-textarea"', () => {
		const po = mountChatInput({ modelValue: '', disabled: false, loading: false })
		expect(po.hasTextarea()).toBe(true)
	})

	it('renders data-testid="chat-send-button"', () => {
		const po = mountChatInput({ modelValue: '', disabled: false, loading: false })
		expect(po.hasSendButton()).toBe(true)
	})

	describe('v-model binding', () => {
		it('modelValue prop sets textarea value', () => {
			const po = mountChatInput({ modelValue: 'Hello', disabled: false, loading: false })
			expect(po.textareaValue()).toBe('Hello')
		})

		it('typing in textarea emits update:modelValue', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false })
			await po.typeInTextarea('new text')
			const emitted = po.emitted('update:modelValue') as string[][]
			expect(emitted).toBeTruthy()
			expect(emitted[emitted.length - 1][0]).toBe('new text')
		})
	})

	describe('keyboard send', () => {
		it('REQ-CCS-013: Ctrl+Enter emits send when not disabled and not loading', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: false })
			await po.triggerSendKey(true)
			expect(po.emitted('send')).toBeTruthy()
		})

		it('Cmd+Enter emits send when not disabled and not loading', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: false })
			await po.triggerSendKey(false)
			expect(po.emitted('send')).toBeTruthy()
		})

		it('Enter alone does not emit send', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: false })
			await po.triggerEnterOnly()
			expect(po.emitted('send')).toBeFalsy()
		})

		it('Ctrl+Enter does not emit send when disabled=true', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: true, loading: false })
			await po.triggerSendKey(true)
			expect(po.emitted('send')).toBeFalsy()
		})

		it('Ctrl+Enter does not emit send when loading=true', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: true })
			await po.triggerSendKey(true)
			expect(po.emitted('send')).toBeFalsy()
		})
	})

	describe('disabled state', () => {
		it('REQ-CCS-014: when disabled=true, textarea has readonly attribute', () => {
			const po = mountChatInput({ modelValue: '', disabled: true, loading: false })
			expect(po.isTextareaReadonly()).toBe(true)
		})

		it('when disabled=true, send button has native disabled attribute', () => {
			const po = mountChatInput({ modelValue: '', disabled: true, loading: false })
			expect(po.isSendButtonDisabled()).toBe(true)
		})

		it('when disabled=false, textarea is not readonly', () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false })
			expect(po.isTextareaReadonly()).toBe(false)
		})
	})

	describe('button label', () => {
		it('when loading=false, button shows "Ask" label', () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false })
			expect(po.sendButtonText()).toContain('Ask')
		})

		it('when loading=true, button shows "Asking…" label', () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: true })
			expect(po.sendButtonText()).toContain('Asking')
		})
	})
})
