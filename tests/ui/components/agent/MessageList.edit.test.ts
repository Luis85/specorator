/**
 * T-MPS-093 — `MessageList.vue` re-emits the `edit` event from `MessageActions`
 * for user messages, carrying the messageId AND its index in the transcript
 * so the host (ChatSidebar) can truncate the trailing turns before
 * re-dispatching.
 *
 * Satisfies REQ-MPS-028, TST-MPS-17.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import MessageList from '@/ui/components/agent/MessageList.vue';
import { i18n } from '@/ui/i18n';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

function msg(
	threadId: string,
	role: 'user' | 'assistant',
	overrides: { id?: string; createdAt?: string; text?: string } = {},
): ChatMessage {
	return {
		id: overrides.id ?? `m-${role}-${Math.random().toString(36).slice(2)}`,
		threadId,
		role,
		text: overrides.text ?? `${role} text`,
		createdAt: overrides.createdAt ?? '2026-05-22T00:00:00Z',
	};
}

describe('MessageList — edit emit chain', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('re-emits `edit` with messageId + transcript index for a user message', async () => {
		const store = useMessagesStore();
		store.appendMessage(
			msg('t-A', 'user', {
				id: 'u1',
				createdAt: '2026-05-22T00:00:00Z',
				text: 'first ask',
			}),
		);
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1', createdAt: '2026-05-22T00:00:01Z' }));
		store.appendMessage(
			msg('t-A', 'user', {
				id: 'u2',
				createdAt: '2026-05-22T00:00:02Z',
				text: 'second ask',
			}),
		);

		const wrapper = mount(MessageList, {
			global: { plugins: [i18n] },
			props: { threadId: 't-A' },
		});
		await nextTick();

		const editButtons = wrapper.findAll('[data-testid="message-action-edit"]');
		// One per user message; the assistant message has no Edit affordance.
		expect(editButtons).toHaveLength(2);

		await editButtons[0]!.trigger('click');

		const events = wrapper.emitted('edit');
		expect(events).toBeDefined();
		expect(events?.[0]).toEqual([
			{ messageId: 'u1', index: 0, text: 'first ask' },
		]);
	});

	it('does not render Edit on assistant messages', async () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1' }));

		const wrapper = mount(MessageList, {
			global: { plugins: [i18n] },
			props: { threadId: 't-A' },
		});
		await nextTick();

		expect(wrapper.findAll('[data-testid="message-action-edit"]')).toHaveLength(0);
	});
});
