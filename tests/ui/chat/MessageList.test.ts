/**
 * T-CC-023 (RED) — `MessageList.vue` keyed render + accumulate (TEST-CC-005 render
 * leg, TEST-CC-008).
 *
 * SPEC-CC-019. Scroll region rendering one `MessageTurn` per `chatStore.messages`
 * entry, keyed by id; the live assistant turn grows as `onText` accumulates. Reads
 * the store directly (a UI component). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CC-004, 006.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MessageList from '@/ui/chat/MessageList.vue';
import { useChatStore } from '@/ui/stores/chatStore';
import { i18n } from '@/ui/i18n';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MessageListPageObject } from './MessageList.po';

function mountList() {
	const wrapper = mount(MessageList, {
		global: {
			plugins: [i18n],
			provide: { [MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort },
		},
	});
	return { wrapper, po: new MessageListPageObject(wrapper) };
}

describe('MessageList (TEST-CC-005/008)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders one turn per store message', () => {
		const store = useChatStore();
		store.messages.push({ id: 'u1', role: 'user', content: 'Hi', timestamp: 0 });
		store.messages.push({ id: 'a1', role: 'assistant', content: 'Hello', timestamp: 1 });
		const { po } = mountList();
		expect(po.exists()).toBe(true);
		expect(po.turnCount()).toBe(2);
	});

	it('reflects accumulated assistant content reactively (REQ-CC-004)', async () => {
		const store = useChatStore();
		store.messages.push({ id: 'a1', role: 'assistant', content: 'Hel', timestamp: 0 });
		const { wrapper, po } = mountList();
		store.messages[0].content = 'Hello world';
		await wrapper.vm.$nextTick();
		expect(po.assistantText()).toContain('Hello world');
	});
});
