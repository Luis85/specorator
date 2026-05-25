/**
 * T-TS-007 (TEST-TS-014 codec/fork-derive U leg) — RED: the pure `buildForkPlan`
 * helper.
 *
 * SPEC-TS-006/013: truncate `messages` THROUGH the matching id (inclusive) ->
 * derived {forkSource:{sessionId,resumeAt}} providerState (not a copy) +
 * sourceTitle; fork at M3 of M1..M5 -> M1..M3 + forkSource{resumeAt:M3}; SOURCE
 * UNTOUCHED; fork at the first user message -> M1; an absent id -> an error result
 * (EC-TS-7).
 *
 * RED: fails because `buildForkPlan` does not yet exist.
 *
 * Traces: TEST-TS-014, SPEC-TS-006 (pure fork-derive), SPEC-TS-013, REQ-TS-018,
 * NFR-TS-013/014.
 */
import { describe, it, expect } from 'vitest';
import { buildForkPlan } from '@/infrastructure/history/buildForkPlan';
import {
	CONVERSATION_RECORD_VERSION,
	type ConversationRecord,
	type ClaudeProviderState,
} from '@/domain/chat/ConversationRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

function makeSource(): ConversationRecord {
	const messages: ChatMessage[] = [
		{ id: 'm1', role: 'user', content: 'q1', timestamp: 1 },
		{ id: 'm2', role: 'assistant', content: 'a1', timestamp: 2 },
		{ id: 'm3', role: 'user', content: 'q2', timestamp: 3 },
		{ id: 'm4', role: 'assistant', content: 'a2', timestamp: 4 },
		{ id: 'm5', role: 'user', content: 'q3', timestamp: 5 },
	];
	return {
		version: CONVERSATION_RECORD_VERSION,
		meta: {
			id: 'src',
			title: 'Source title',
			titleManual: false,
			createdAt: 1,
			updatedAt: 5,
			providerId: 'claude',
			sessionId: 'sess-src',
		},
		messages,
		providerState: { providerSessionId: 'sess-src' },
	};
}

describe('buildForkPlan (TEST-TS-014)', () => {
	it('truncates through the matching id (inclusive): fork at M3 of M1..M5 -> M1..M3', () => {
		const result = buildForkPlan(makeSource(), 'm3');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
			expect(result.value.sourceTitle).toBe('Source title');
		}
	});

	it('derives a forkSource providerState (not a transcript copy)', () => {
		const result = buildForkPlan(makeSource(), 'm3');
		expect(result.ok).toBe(true);
		if (result.ok) {
			const state = result.value.providerState as ClaudeProviderState;
			expect(state.forkSource).toEqual({ sessionId: 'sess-src', resumeAt: 'm3' });
			// Not a transcript copy: the providerState bag does not carry messages.
			expect((result.value.providerState as Record<string, unknown>).messages).toBeUndefined();
		}
	});

	it('leaves the source record untouched (EC-TS-7)', () => {
		const source = makeSource();
		buildForkPlan(source, 'm3');
		expect(source.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
		expect(source.providerState).toEqual({ providerSessionId: 'sess-src' });
	});

	it('forks at the first user message -> M1 only', () => {
		const result = buildForkPlan(makeSource(), 'm1');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.messages.map((m) => m.id)).toEqual(['m1']);
	});

	it('returns an error when the resumeAtMessageId is absent (EC-TS-7)', () => {
		const result = buildForkPlan(makeSource(), 'does-not-exist');
		expect(result.ok).toBe(false);
	});

	it('uses providerState.providerSessionId when meta.sessionId is null', () => {
		const source = makeSource();
		const noMetaSession: ConversationRecord = {
			...source,
			meta: { ...source.meta, sessionId: null },
			providerState: { providerSessionId: 'sess-from-state' },
		};
		const result = buildForkPlan(noMetaSession, 'm2');
		expect(result.ok).toBe(true);
		if (result.ok) {
			const state = result.value.providerState as ClaudeProviderState;
			expect(state.forkSource?.sessionId).toBe('sess-from-state');
		}
	});
});
