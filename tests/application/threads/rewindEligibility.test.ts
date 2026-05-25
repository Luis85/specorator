import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import { isRewindEligible } from '@/application/threads/rewindEligibility';

/**
 * TEST-TS-021 — `rewindEligibility.isRewindEligible` pure scan (SPEC-TS-018,
 * REQ-TS-019, NFR-TS-005, EC-TS-8). Mirrors claudian-main
 * `features/chat/rewind.ts findRewindContext` (the forward `hasResponse` leg): a
 * user message is rewind-eligible iff a FOLLOWING assistant message (before the
 * next user message) bears a non-empty `assistantMessageId`. Pure/total — an
 * unknown id → false; never throws.
 */
function user(id: string, extra: Partial<ChatMessage> = {}): ChatMessage {
	return { id, role: 'user', content: `u:${id}`, timestamp: 1, ...extra };
}
function assistant(id: string, extra: Partial<ChatMessage> = {}): ChatMessage {
	return { id, role: 'assistant', content: `a:${id}`, timestamp: 2, ...extra };
}

describe('TEST-TS-021 isRewindEligible', () => {
	it('is eligible when a following assistant bears an assistantMessageId', () => {
		const messages: ChatMessage[] = [
			user('u1'),
			assistant('a1', { assistantMessageId: 'turn-1' }),
		];
		expect(isRewindEligible(messages, 'u1')).toBe(true);
	});

	it('is NOT eligible when the following assistant has no assistantMessageId (EC-TS-8)', () => {
		const messages: ChatMessage[] = [user('u1'), assistant('a1')];
		expect(isRewindEligible(messages, 'u1')).toBe(false);
	});

	it('is NOT eligible when no assistant follows the user message (EC-TS-8)', () => {
		const messages: ChatMessage[] = [user('u1')];
		expect(isRewindEligible(messages, 'u1')).toBe(false);
	});

	it('stops at the next user message (no turn-id-bearing assistant in this turn)', () => {
		const messages: ChatMessage[] = [
			user('u1'),
			user('u2'),
			assistant('a2', { assistantMessageId: 'turn-2' }),
		];
		// u1's own turn has no assistant before u2 → not eligible.
		expect(isRewindEligible(messages, 'u1')).toBe(false);
		// u2 has a turn-id-bearing assistant → eligible.
		expect(isRewindEligible(messages, 'u2')).toBe(true);
	});

	it('treats an empty assistantMessageId as not eligible', () => {
		const messages: ChatMessage[] = [user('u1'), assistant('a1', { assistantMessageId: '' })];
		expect(isRewindEligible(messages, 'u1')).toBe(false);
	});

	it('returns false for an unknown id', () => {
		const messages: ChatMessage[] = [
			user('u1'),
			assistant('a1', { assistantMessageId: 'turn-1' }),
		];
		expect(isRewindEligible(messages, 'nope')).toBe(false);
	});

	it('returns false when the id resolves to an assistant message (not a user turn)', () => {
		const messages: ChatMessage[] = [
			user('u1'),
			assistant('a1', { assistantMessageId: 'turn-1' }),
		];
		expect(isRewindEligible(messages, 'a1')).toBe(false);
	});

	it('returns false for an empty transcript and never throws', () => {
		expect(() => isRewindEligible([], 'u1')).not.toThrow();
		expect(isRewindEligible([], 'u1')).toBe(false);
	});
});
