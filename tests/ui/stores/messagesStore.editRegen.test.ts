/**
 * T-MPS-089 — Tests for the `removeLatestAssistant(threadId)` and
 * `truncateAfter(threadId, index)` mutations on `useMessagesStore()`.
 *
 * Satisfies REQ-MPS-027, REQ-MPS-028, TST-MPS-16, TST-MPS-17.
 *
 * These primitives back the Regenerate and Edit-and-resend per-message actions
 * (`MessageActions.vue` + `ChatSidebar` handlers, WS-7).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

function msg(
	threadId: string,
	role: 'user' | 'assistant',
	overrides: { id?: string; text?: string } = {},
): ChatMessage {
	return {
		id: overrides.id ?? `m-${role}-${Math.random().toString(36).slice(2)}`,
		threadId,
		role,
		text: overrides.text ?? `${role} text`,
		createdAt: '2026-05-22T00:00:00Z',
	};
}

describe('messagesStore.removeLatestAssistant', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('removes the trailing assistant message when present', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'u1' }));
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1' }));

		store.removeLatestAssistant('t-A');

		const bucket = store.messages.get('t-A') ?? [];
		expect(bucket.map((m) => m.id)).toEqual(['u1']);
	});

	it('is a no-op when the trailing message is a user turn', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1' }));
		store.appendMessage(msg('t-A', 'user', { id: 'u1' }));

		store.removeLatestAssistant('t-A');

		const bucket = store.messages.get('t-A') ?? [];
		expect(bucket.map((m) => m.id)).toEqual(['a1', 'u1']);
	});

	it('is a no-op for unknown thread ids', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1' }));

		store.removeLatestAssistant('does-not-exist');

		expect(store.messages.get('t-A')).toHaveLength(1);
	});

	it('is a no-op for an empty bucket', () => {
		const store = useMessagesStore();
		expect(() => store.removeLatestAssistant('t-empty')).not.toThrow();
		expect(store.messages.has('t-empty')).toBe(false);
	});
});

describe('messagesStore.truncateAfter', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('drops every message after the given index, keeping the message AT the index', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'u1' }));
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1' }));
		store.appendMessage(msg('t-A', 'user', { id: 'u2' }));
		store.appendMessage(msg('t-A', 'assistant', { id: 'a2' }));

		store.truncateAfter('t-A', 0);

		const bucket = store.messages.get('t-A') ?? [];
		expect(bucket.map((m) => m.id)).toEqual(['u1']);
	});

	it('is a no-op when index points at the last entry', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'u1' }));
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1' }));

		store.truncateAfter('t-A', 1);

		const bucket = store.messages.get('t-A') ?? [];
		expect(bucket.map((m) => m.id)).toEqual(['u1', 'a1']);
	});

	it('is a no-op for unknown thread ids', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'u1' }));

		store.truncateAfter('does-not-exist', 0);

		expect(store.messages.get('t-A')).toHaveLength(1);
	});

	it('is a no-op for negative indices', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'u1' }));
		store.appendMessage(msg('t-A', 'assistant', { id: 'a1' }));

		store.truncateAfter('t-A', -1);

		expect(store.messages.get('t-A')).toHaveLength(2);
	});

	it('isolates truncation to the named thread', () => {
		const store = useMessagesStore();
		store.appendMessage(msg('t-A', 'user', { id: 'a-u1' }));
		store.appendMessage(msg('t-A', 'assistant', { id: 'a-a1' }));
		store.appendMessage(msg('t-B', 'user', { id: 'b-u1' }));
		store.appendMessage(msg('t-B', 'assistant', { id: 'b-a1' }));

		store.truncateAfter('t-A', 0);

		expect(store.messages.get('t-A')?.map((m) => m.id)).toEqual(['a-u1']);
		expect(store.messages.get('t-B')?.map((m) => m.id)).toEqual(['b-u1', 'b-a1']);
	});
});
