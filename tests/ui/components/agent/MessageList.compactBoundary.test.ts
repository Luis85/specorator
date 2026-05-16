/**
 * Tests for the `compact-boundary` notice rendering in `MessageList.vue`
 * (Codex P2 on PR #379 — `agent-sidepanel-v2-tool-rendering`). Confirms the
 * divider renders only when a notice exists, lives in the same `role="log"`
 * aria-live region as messages, surfaces the i18n copy, carries
 * `role="status"`, and interleaves between messages by `createdAt`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageList from '@/ui/components/agent/MessageList.vue';
import { i18n } from '@/ui/i18n';
import { useChatStore } from '@/ui/stores/chatStore';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import { MessageListCompactBoundaryPO } from './MessageList.compactBoundary.po';

function mountList(threadId: string | null) {
	const wrapper = mount(MessageList, {
		global: { plugins: [i18n] },
		props: { threadId },
	});
	return { wrapper, po: new MessageListCompactBoundaryPO(wrapper) };
}

function msg(
	threadId: string,
	role: 'user' | 'assistant',
	overrides: { id?: string; text?: string; createdAt?: string } = {},
): ChatMessage {
	return {
		id: overrides.id ?? `m-${role}-${Math.random().toString(36).slice(2)}`,
		threadId,
		role,
		text: overrides.text ?? `${role} text`,
		createdAt: overrides.createdAt ?? new Date().toISOString(),
	};
}

describe('MessageList — compact-boundary notice', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('does not render a notice when no boundary has been recorded', () => {
		const store = useChatStore();
		const tid = 'thread-noisy';
		store.appendMessage(msg(tid, 'user'));
		const { po } = mountList(tid);
		expect(po.notices()).toHaveLength(0);
	});

	it('renders a notice inside the message list when a boundary exists', () => {
		const store = useChatStore();
		const tid = 'thread-compact';
		store.appendMessage(msg(tid, 'user', { createdAt: '2026-05-16T00:00:00Z' }));
		store.appendCompactBoundaryNotice(tid, { reason: 'auto-compact' });
		const { po } = mountList(tid);
		expect(po.root.exists()).toBe(true);
		expect(po.notices()).toHaveLength(1);
		// Notice is inside the same aria-live="polite" log region.
		expect(po.root.attributes('aria-live')).toBe('polite');
		expect(po.root.attributes('role')).toBe('log');
	});

	it('carries role="status" on the notice element', () => {
		const store = useChatStore();
		const tid = 'thread-role';
		store.appendCompactBoundaryNotice(tid, {});
		const { po } = mountList(tid);
		const all = po.notices();
		expect(all).toHaveLength(1);
		expect(all[0].attributes('role')).toBe('status');
	});

	it('surfaces the i18n notice copy (chat.compactBoundary.notice)', () => {
		const store = useChatStore();
		const tid = 'thread-i18n';
		store.appendCompactBoundaryNotice(tid, {});
		const { po } = mountList(tid);
		const all = po.notices();
		expect(all).toHaveLength(1);
		expect(all[0].text()).toContain('Earlier conversation was summarised');
	});

	it('renders the empty list when threadId is null even if a boundary exists for another thread', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('other-thread', {});
		const { po } = mountList(null);
		expect(po.notices()).toHaveLength(0);
	});

	it('isolates notices by threadId', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('thread-a', {});
		store.appendCompactBoundaryNotice('thread-b', {});
		const { po } = mountList('thread-b');
		expect(po.notices()).toHaveLength(1);
	});

	it('interleaves the notice with messages by createdAt', () => {
		const store = useChatStore();
		const tid = 'thread-interleave';
		store.appendMessage(msg(tid, 'user', { text: 'first', createdAt: '2026-05-16T00:00:00Z' }));
		store.appendMessage(msg(tid, 'assistant', { text: 'second', createdAt: '2026-05-16T00:00:01Z' }));
		// Manually-shaped notice via store mutation; createdAt is generated as
		// "now" so it sorts after the messages above (which are dated 2026-05-16).
		store.appendCompactBoundaryNotice(tid, {});
		store.appendMessage(msg(tid, 'user', { text: 'third', createdAt: '2099-01-01T00:00:00Z' }));

		const { po, wrapper } = mountList(tid);
		const html = wrapper.html();
		const noticeIdx = html.indexOf('compact-boundary-notice');
		const thirdIdx = html.indexOf('third');
		const secondIdx = html.indexOf('second');
		expect(po.notices()).toHaveLength(1);
		expect(noticeIdx).toBeGreaterThan(secondIdx);
		expect(thirdIdx).toBeGreaterThan(noticeIdx);
	});
});
