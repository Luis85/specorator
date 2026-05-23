/**
 * T-MPS-084 — `MessageActions.vue`: Copy emits `{ messageId }` so the host can
 * write the message body to `navigator.clipboard.writeText`. Satisfies
 * REQ-MPS-026, TST-MPS-15.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { MessageActionsPO } from './MessageActions.po';
import { mountMessageActions } from './messageActionsTestHelpers';

describe('MessageActions — copy emit', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('emits `copy` with the message id when the Copy button is clicked', async () => {
		const wrapper = mountMessageActions({
			messageId: 'msg-1',
			role: 'assistant',
			isLatest: true,
		});
		const po = new MessageActionsPO(wrapper);

		await po.copyButton.trigger('click');

		const copyEvents = wrapper.emitted('copy');
		expect(copyEvents).toBeDefined();
		expect(copyEvents).toHaveLength(1);
		expect(copyEvents?.[0]).toEqual([{ messageId: 'msg-1' }]);
	});

	it('emits `copy` for user messages too', async () => {
		const wrapper = mountMessageActions({
			messageId: 'msg-user-1',
			role: 'user',
			isLatest: false,
		});
		const po = new MessageActionsPO(wrapper);

		await po.copyButton.trigger('click');

		expect(wrapper.emitted('copy')?.[0]).toEqual([{ messageId: 'msg-user-1' }]);
	});
});
