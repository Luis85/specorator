/**
 * T-MPS-086 — `MessageActions.vue`: Regenerate visibility is gated by
 * `role === 'assistant' && isLatest === true`. Satisfies REQ-MPS-027.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { MessageActionsPO } from './MessageActions.po';
import { mountMessageActions } from './messageActionsTestHelpers';

describe('MessageActions — Regenerate visibility', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders Regenerate when role=assistant and isLatest=true', () => {
		const po = new MessageActionsPO(
			mountMessageActions({ messageId: 'a-1', role: 'assistant', isLatest: true }),
		);
		expect(po.regenerateButton.exists()).toBe(true);
	});

	it('hides Regenerate when role=assistant but isLatest=false', () => {
		const po = new MessageActionsPO(
			mountMessageActions({ messageId: 'a-1', role: 'assistant', isLatest: false }),
		);
		expect(po.regenerateButton.exists()).toBe(false);
	});

	it('hides Regenerate when role=user (even if isLatest)', () => {
		const po = new MessageActionsPO(
			mountMessageActions({ messageId: 'u-1', role: 'user', isLatest: true }),
		);
		expect(po.regenerateButton.exists()).toBe(false);
	});

	it('emits regenerate with the message id when clicked', async () => {
		const wrapper = mountMessageActions({
			messageId: 'a-9',
			role: 'assistant',
			isLatest: true,
		});
		const po = new MessageActionsPO(wrapper);
		await po.regenerateButton.trigger('click');
		expect(wrapper.emitted('regenerate')?.[0]).toEqual([{ messageId: 'a-9' }]);
	});
});
