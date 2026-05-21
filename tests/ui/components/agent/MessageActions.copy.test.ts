/**
 * T-MPS-084 — `MessageActions.vue`: Copy emits `{ messageId }` so the host can
 * write the message body to `navigator.clipboard.writeText`. Satisfies
 * REQ-MPS-026, TST-MPS-15. The component itself does not call the clipboard
 * API; the host (`MessageList` → `ChatSidebar`) owns the side effect.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageActions from '@/ui/components/agent/MessageActions.vue';
import { i18n } from '@/ui/i18n';
import { MessageActionsPO } from './MessageActions.po';

function mountActions(props: { messageId: string; role: 'user' | 'assistant'; isLatest: boolean }) {
	const wrapper = mount(MessageActions, {
		global: { plugins: [i18n] },
		props,
	});
	return { wrapper, po: new MessageActionsPO(wrapper) };
}

describe('MessageActions — copy emit', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('emits `copy` with the message id when the Copy button is clicked', async () => {
		const { wrapper, po } = mountActions({
			messageId: 'msg-1',
			role: 'assistant',
			isLatest: true,
		});

		await po.copyButton.trigger('click');

		const copyEvents = wrapper.emitted('copy');
		expect(copyEvents).toBeDefined();
		expect(copyEvents).toHaveLength(1);
		expect(copyEvents?.[0]).toEqual([{ messageId: 'msg-1' }]);
	});

	it('emits `copy` for user messages too', async () => {
		const { wrapper, po } = mountActions({
			messageId: 'msg-user-1',
			role: 'user',
			isLatest: false,
		});

		await po.copyButton.trigger('click');

		expect(wrapper.emitted('copy')?.[0]).toEqual([{ messageId: 'msg-user-1' }]);
	});
});
