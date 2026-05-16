/**
 * Tests for `MessageList.vue` — multi-turn message history rendering for the
 * dedicated agent sidepanel (IDEA-ASV-001, specs/agent-sidepanel-v2). Covers
 * the empty state, role-tagged rendering, the per-message trim notice, the
 * empty-text placeholder (assistant turn that produced only a proposal), and
 * thread isolation (a different `threadId` prop shows only that thread's
 * messages).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageList from '@/ui/components/agent/MessageList.vue';
import { i18n } from '@/ui/i18n';
import { useChatStore } from '@/ui/stores/chatStore';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import { MessageListPO } from './MessageList.po';

function mountList(threadId: string | null) {
	const wrapper = mount(MessageList, {
		global: { plugins: [i18n] },
		props: { threadId },
	});
	return { wrapper, po: new MessageListPO(wrapper) };
}

function msg(
	threadId: string,
	role: 'user' | 'assistant',
	overrides: Partial<ChatMessage> = {},
): ChatMessage {
	return {
		id: overrides.id ?? `m-${Math.random().toString(36).slice(2)}`,
		threadId,
		role,
		text: overrides.text ?? `${role} text`,
		createdAt: overrides.createdAt ?? new Date().toISOString(),
		truncated: overrides.truncated,
	};
}

describe('MessageList', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders the empty-state copy when threadId is null', () => {
		const { po } = mountList(null);
		expect(po.empty.exists()).toBe(true);
		expect(po.root.exists()).toBe(false);
		expect(po.empty.text()).toContain('your conversation will appear here');
	});

	it('renders the empty-state copy when the thread has no messages', () => {
		const { po } = mountList('thread-empty');
		expect(po.empty.exists()).toBe(true);
		expect(po.root.exists()).toBe(false);
	});

	it('renders user and assistant turns for the active thread', async () => {
		const store = useChatStore();
		const tid = 'thread-1';
		store.appendMessage(msg(tid, 'user', { text: 'Hi there.' }));
		store.appendMessage(msg(tid, 'assistant', { text: 'Hello!' }));

		const { po } = mountList(tid);
		expect(po.root.exists()).toBe(true);
		expect(po.userMessages()).toHaveLength(1);
		expect(po.assistantMessages()).toHaveLength(1);
		expect(po.userMessages()[0].text()).toContain('Hi there.');
		expect(po.assistantMessages()[0].text()).toContain('Hello!');
	});

	it('renders the per-message trim notice when an assistant turn was truncated', () => {
		const store = useChatStore();
		const tid = 'thread-trim';
		store.appendMessage(msg(tid, 'user', { text: 'Q' }));
		store.appendMessage(msg(tid, 'assistant', { text: 'A', truncated: true }));

		const { po } = mountList(tid);
		expect(po.trimNotes()).toHaveLength(1);
	});

	it('renders the empty-text placeholder when an assistant turn has no body', () => {
		const store = useChatStore();
		const tid = 'thread-proposal-only';
		store.appendMessage(msg(tid, 'user', { text: 'Make me a file' }));
		store.appendMessage(msg(tid, 'assistant', { text: '' }));

		const { po } = mountList(tid);
		expect(po.emptyAssistantPlaceholders()).toHaveLength(1);
	});

	it('only renders messages from the active thread (isolation)', () => {
		const store = useChatStore();
		store.appendMessage(msg('thread-a', 'user', { text: 'A-user' }));
		store.appendMessage(msg('thread-a', 'assistant', { text: 'A-assistant' }));
		store.appendMessage(msg('thread-b', 'user', { text: 'B-user' }));

		const { po } = mountList('thread-b');
		expect(po.userMessages()).toHaveLength(1);
		expect(po.assistantMessages()).toHaveLength(0);
		expect(po.userMessages()[0].text()).toContain('B-user');
	});

	it('exposes role="log" with the aria-live="polite" hint on the scroll container', () => {
		const store = useChatStore();
		const tid = 'thread-aria';
		store.appendMessage(msg(tid, 'user'));
		const { po } = mountList(tid);
		expect(po.root.attributes('role')).toBe('log');
		expect(po.root.attributes('aria-live')).toBe('polite');
	});
});
