/**
 * T-MPS-087 — `MessageActions.vue`: Edit and Regenerate disabled while the
 * turn is streaming; Copy stays enabled. Satisfies REQ-MPS-029, TST-MPS-18.
 *
 * Streaming state lives on `streamingTurnStore.isStreaming` — a derived
 * getter that mirrors `messagesStore.status === 'loading'` (T-MPS-092).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageActions from '@/ui/components/agent/MessageActions.vue';
import { i18n } from '@/ui/i18n';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { MessageActionsPO } from './MessageActions.po';

function mountActions(props: {
	messageId: string;
	role: 'user' | 'assistant';
	isLatest: boolean;
}) {
	const wrapper = mount(MessageActions, {
		global: { plugins: [i18n] },
		props,
	});
	return { wrapper, po: new MessageActionsPO(wrapper) };
}

describe('MessageActions — streaming disables Edit/Regenerate', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('disables Regenerate when isStreaming via aria-disabled and the disabled attribute', () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const { po } = mountActions({
			messageId: 'a-1',
			role: 'assistant',
			isLatest: true,
		});

		expect(po.regenerateButton.attributes('aria-disabled')).toBe('true');
		expect(po.regenerateButton.attributes('disabled')).toBeDefined();
	});

	it('disables Edit when isStreaming via aria-disabled and the disabled attribute', () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const { po } = mountActions({
			messageId: 'u-1',
			role: 'user',
			isLatest: false,
		});

		expect(po.editButton.attributes('aria-disabled')).toBe('true');
		expect(po.editButton.attributes('disabled')).toBeDefined();
	});

	it('keeps Copy enabled while streaming', () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const { po } = mountActions({
			messageId: 'a-1',
			role: 'assistant',
			isLatest: true,
		});

		expect(po.copyButton.attributes('disabled')).toBeUndefined();
	});

	it('does not emit regenerate when clicked while streaming', async () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const { wrapper, po } = mountActions({
			messageId: 'a-1',
			role: 'assistant',
			isLatest: true,
		});

		await po.regenerateButton.trigger('click');
		expect(wrapper.emitted('regenerate')).toBeUndefined();
	});

	it('does not emit edit when clicked while streaming', async () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const { wrapper, po } = mountActions({
			messageId: 'u-1',
			role: 'user',
			isLatest: false,
		});

		await po.editButton.trigger('click');
		expect(wrapper.emitted('edit')).toBeUndefined();
	});

	it('emits regenerate when not streaming', async () => {
		const { wrapper, po } = mountActions({
			messageId: 'a-1',
			role: 'assistant',
			isLatest: true,
		});

		await po.regenerateButton.trigger('click');
		expect(wrapper.emitted('regenerate')?.[0]).toEqual([{ messageId: 'a-1' }]);
	});
});
