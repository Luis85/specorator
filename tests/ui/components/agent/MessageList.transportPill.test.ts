/**
 * T-AUX-293 — `MessageList.vue` surfaces `<TransportStatusPill>` at the top
 * of the scroll region whenever `transportStatusStore.kind !== 'idle'`.
 *
 * Satisfies REQ-AUX-016, spec §1.4.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

import MessageList from '@/ui/components/agent/MessageList.vue';
import { i18n } from '@/ui/i18n';
import { useTransportStatusStore } from '@/ui/stores/transportStatusStore';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function listProvides() {
	const bridge = new MockBridge() as unknown as IconPort;
	return {
		[ICON_PORT as symbol]: bridge,
		[LOGGER_PORT as symbol]: fakeLogger(),
	};
}

function mountList(threadId: string | null) {
	return mount(MessageList, {
		global: { plugins: [i18n], provide: listProvides() },
		props: { threadId },
	});
}

describe('MessageList transport pill (REQ-AUX-016)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('T-AUX-293: no pill when transport is idle', () => {
		const messages = useMessagesStore();
		messages.appendMessage({
			id: 'm1',
			threadId: 'thread-A',
			role: 'user',
			text: 'hi',
			createdAt: new Date().toISOString(),
		});
		const wrapper = mountList('thread-A');
		expect(wrapper.find('[data-testid="agent-message-list-transport-pill"]').exists()).toBe(false);
	});

	it('T-AUX-293: renders pill when transport kind is degraded', async () => {
		const messages = useMessagesStore();
		messages.appendMessage({
			id: 'm1',
			threadId: 'thread-A',
			role: 'user',
			text: 'hi',
			createdAt: new Date().toISOString(),
		});
		const provider = useChatProviderStore();
		provider.setResolved({ provider: 'claude', mode: 'cli' });
		const transport = useTransportStatusStore();
		transport.setKind('degraded');
		const wrapper = mountList('thread-A');
		await wrapper.vm.$nextTick();
		const pill = wrapper.find('[data-testid="agent-message-list-transport-pill"]');
		expect(pill.exists()).toBe(true);
		expect(pill.attributes('data-kind')).toBe('degraded');
		const text = wrapper.find('[data-testid="transport-status-pill-text"]').text();
		expect(text).toBe('Claude · CLI is slow to respond.');
	});

	it('T-AUX-293: pill emits retry → store resets to idle', async () => {
		const messages = useMessagesStore();
		messages.appendMessage({
			id: 'm1',
			threadId: 'thread-A',
			role: 'user',
			text: 'hi',
			createdAt: new Date().toISOString(),
		});
		const provider = useChatProviderStore();
		provider.setResolved({ provider: 'claude', mode: 'api' });
		const transport = useTransportStatusStore();
		transport.setKind('offline');
		const wrapper = mountList('thread-A');
		await wrapper.vm.$nextTick();
		const retry = wrapper.find('[data-testid="transport-status-pill-retry"]');
		expect(retry.exists()).toBe(true);
		await retry.trigger('click');
		expect(transport.kind).toBe('idle');
		await wrapper.vm.$nextTick();
		expect(wrapper.find('[data-testid="agent-message-list-transport-pill"]').exists()).toBe(false);
	});
});
