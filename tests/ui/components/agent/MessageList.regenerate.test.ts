/**
 * T-MPS-091 — `MessageList.vue` renders a `MessageActions` row per message and
 * re-emits its `regenerate` event upward to the host (ChatSidebar). The
 * host owns the side effect (drop latest assistant + re-dispatch the same
 * prompt). This test validates the emit chain only — orchestrator wiring
 * is covered separately by `ChatSidebar` tests.
 *
 * Satisfies REQ-MPS-027, TST-MPS-16.
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
	overrides: { id?: string; createdAt?: string } = {},
): ChatMessage {
	return {
		id: overrides.id ?? `m-${role}-${Math.random().toString(36).slice(2)}`,
		threadId,
		role,
		text: `${role} text`,
		createdAt: overrides.createdAt ?? '2026-05-22T00:00:00Z',
	};
}

describe('MessageList — regenerate emit chain', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('re-emits `regenerate` from the latest assistant message', async () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'u1', createdAt: '2026-05-22T00:00:00Z' }));
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1', createdAt: '2026-05-22T00:00:01Z' }));

		const wrapper = mount(MessageList, {
			global: { plugins: [i18n] },
			props: { threadId: 't-A' },
		});
		await nextTick();

		const regen = wrapper.find('[data-testid="message-action-regenerate"]');
		expect(regen.exists()).toBe(true);
		await regen.trigger('click');

		const events = wrapper.emitted('regenerate');
		expect(events).toBeDefined();
		expect(events?.[0]).toEqual([{ messageId: 'a1' }]);
	});

	it('does not render the Regenerate button on the non-latest assistant turn', async () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'u1', createdAt: '2026-05-22T00:00:00Z' }));
		store.appendMessage(
			msg('t-A', 'assistant', { id: 'a-old', createdAt: '2026-05-22T00:00:01Z' }),
		);
		store.appendMessage(msg('t-A', 'user', { id: 'u2', createdAt: '2026-05-22T00:00:02Z' }));
		store.appendMessage(
			msg('t-A', 'assistant', { id: 'a-new', createdAt: '2026-05-22T00:00:03Z' }),
		);

		const wrapper = mount(MessageList, {
			global: { plugins: [i18n] },
			props: { threadId: 't-A' },
		});
		await nextTick();

		const regens = wrapper.findAll('[data-testid="message-action-regenerate"]');
		expect(regens).toHaveLength(1);
	});
});
