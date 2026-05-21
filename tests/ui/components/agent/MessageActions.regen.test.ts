/**
 * T-MPS-086 — `MessageActions.vue`: Regenerate visibility is gated by
 * `role === 'assistant' && isLatest === true`. Satisfies REQ-MPS-027. The
 * control must NOT render on user messages or on older assistant turns.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageActions from '@/ui/components/agent/MessageActions.vue';
import { i18n } from '@/ui/i18n';
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

describe('MessageActions — Regenerate visibility', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders Regenerate when role=assistant and isLatest=true', () => {
		const { po } = mountActions({ messageId: 'a-1', role: 'assistant', isLatest: true });
		expect(po.regenerateButton.exists()).toBe(true);
	});

	it('hides Regenerate when role=assistant but isLatest=false', () => {
		const { po } = mountActions({ messageId: 'a-1', role: 'assistant', isLatest: false });
		expect(po.regenerateButton.exists()).toBe(false);
	});

	it('hides Regenerate when role=user (even if isLatest)', () => {
		const { po } = mountActions({ messageId: 'u-1', role: 'user', isLatest: true });
		expect(po.regenerateButton.exists()).toBe(false);
	});

	it('emits regenerate with the message id when clicked', async () => {
		const { wrapper, po } = mountActions({
			messageId: 'a-9',
			role: 'assistant',
			isLatest: true,
		});
		await po.regenerateButton.trigger('click');
		expect(wrapper.emitted('regenerate')?.[0]).toEqual([{ messageId: 'a-9' }]);
	});
});
