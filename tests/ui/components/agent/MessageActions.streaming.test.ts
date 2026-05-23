/**
 * T-MPS-087 — `MessageActions.vue`: Edit and Regenerate disabled while the
 * turn is streaming; Copy stays enabled. Satisfies REQ-MPS-029, TST-MPS-18.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { MessageActionsPO } from './MessageActions.po';
import { mountMessageActions } from './messageActionsTestHelpers';

describe('MessageActions — streaming disables Edit/Regenerate', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('disables Regenerate when isStreaming via aria-disabled and the disabled attribute', () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const po = new MessageActionsPO(
			mountMessageActions({ messageId: 'a-1', role: 'assistant', isLatest: true }),
		);

		expect(po.regenerateButton.attributes('aria-disabled')).toBe('true');
		expect(po.regenerateButton.attributes('disabled')).toBeDefined();
	});

	it('disables Edit when isStreaming via aria-disabled and the disabled attribute', () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const po = new MessageActionsPO(
			mountMessageActions({ messageId: 'u-1', role: 'user', isLatest: false }),
		);

		expect(po.editButton.attributes('aria-disabled')).toBe('true');
		expect(po.editButton.attributes('disabled')).toBeDefined();
	});

	it('keeps Copy enabled while streaming', () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const po = new MessageActionsPO(
			mountMessageActions({ messageId: 'a-1', role: 'assistant', isLatest: true }),
		);

		expect(po.copyButton.attributes('disabled')).toBeUndefined();
	});

	it('does not emit regenerate when clicked while streaming', async () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const wrapper = mountMessageActions({
			messageId: 'a-1',
			role: 'assistant',
			isLatest: true,
		});
		const po = new MessageActionsPO(wrapper);

		await po.regenerateButton.trigger('click');
		expect(wrapper.emitted('regenerate')).toBeUndefined();
	});

	it('does not emit edit when clicked while streaming', async () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const wrapper = mountMessageActions({
			messageId: 'u-1',
			role: 'user',
			isLatest: false,
		});
		const po = new MessageActionsPO(wrapper);

		await po.editButton.trigger('click');
		expect(wrapper.emitted('edit')).toBeUndefined();
	});

	it('emits regenerate when not streaming', async () => {
		const wrapper = mountMessageActions({
			messageId: 'a-1',
			role: 'assistant',
			isLatest: true,
		});
		const po = new MessageActionsPO(wrapper);

		await po.regenerateButton.trigger('click');
		expect(wrapper.emitted('regenerate')?.[0]).toEqual([{ messageId: 'a-1' }]);
	});
});
