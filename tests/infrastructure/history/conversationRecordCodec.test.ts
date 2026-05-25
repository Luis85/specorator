/**
 * T-TS-007 (TEST-TS-010) — RED: the pure `conversationRecordCodec`.
 *
 * SPEC-TS-010: `serialise` always stamps `version:1` + writes meta/messages/
 * providerState and STRIPS any non-contract field (a secret-bearing input is
 * stripped); `deserialise` round-trips, parses inside try/catch, a corrupt JSON
 * or structurally-invalid record (missing meta.id, non-array messages) ->
 * {ok:false,reason:'corrupt'} with NO throw, a record with any/missing version is
 * ACCEPTED (load-or-default), a P1-shaped messages[] (no contentBlocks) is valid
 * (EC-RR-13); NO `if (version === 0)` migration branch.
 *
 * RED: fails because `conversationRecordCodec` does not yet exist.
 *
 * Traces: TEST-TS-010, SPEC-TS-010, REQ-TS-008, NFR-TS-013/014.
 */
import { describe, it, expect } from 'vitest';
import { serialise, deserialise } from '@/infrastructure/history/conversationRecordCodec';
import {
	CONVERSATION_RECORD_VERSION,
	type ConversationRecord,
} from '@/domain/chat/ConversationRecord';

function makeRecord(over: Partial<ConversationRecord> = {}): ConversationRecord {
	return {
		version: CONVERSATION_RECORD_VERSION,
		meta: {
			id: 'c1',
			title: 'A conversation',
			titleManual: false,
			createdAt: 1,
			updatedAt: 2,
			providerId: 'claude',
			sessionId: 'sess-1',
		},
		messages: [
			{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 },
			{ id: 'm2', role: 'assistant', content: 'hello', timestamp: 2 },
		],
		providerState: { providerSessionId: 'sess-1' },
		...over,
	};
}

describe('conversationRecordCodec.serialise (TEST-TS-010)', () => {
	it('always stamps version:1 and writes meta/messages/providerState', () => {
		const raw = serialise(makeRecord({ version: 99 }));
		const parsed = JSON.parse(raw) as ConversationRecord;
		expect(parsed.version).toBe(1);
		expect(parsed.meta.id).toBe('c1');
		expect(parsed.messages).toHaveLength(2);
		expect(parsed.providerState).toEqual({ providerSessionId: 'sess-1' });
	});

	it('strips any non-contract (secret-bearing) field on serialise', () => {
		const dirty = { ...makeRecord(), apiKey: 'sk-leak', token: 'secret' };
		const raw = serialise(dirty as ConversationRecord);
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		expect(parsed.apiKey).toBeUndefined();
		expect(parsed.token).toBeUndefined();
		expect(Object.keys(parsed).sort()).toEqual(['messages', 'meta', 'providerState', 'version']);
	});
});

describe('conversationRecordCodec.deserialise (TEST-TS-010)', () => {
	it('round-trips a record through serialise', () => {
		const record = makeRecord();
		const result = deserialise(serialise(record));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.record.meta.id).toBe('c1');
			expect(result.record.messages).toHaveLength(2);
		}
	});

	it('returns {ok:false,reason:corrupt} on invalid JSON, never throws', () => {
		expect(() => deserialise('not-json{')).not.toThrow();
		const result = deserialise('not-json{');
		expect(result).toEqual({ ok: false, reason: 'corrupt' });
	});

	it('returns corrupt on a structurally invalid record (missing meta.id)', () => {
		const noId = JSON.stringify({
			version: 1,
			meta: { title: 'x', titleManual: false, createdAt: 1, updatedAt: 2, providerId: 'claude', sessionId: null },
			messages: [],
			providerState: {},
		});
		expect(deserialise(noId)).toEqual({ ok: false, reason: 'corrupt' });
	});

	it('returns corrupt on a non-array messages field', () => {
		const badMessages = JSON.stringify({
			version: 1,
			meta: { id: 'c1', title: 'x', titleManual: false, createdAt: 1, updatedAt: 2, providerId: 'claude', sessionId: null },
			messages: 'nope',
			providerState: {},
		});
		expect(deserialise(badMessages)).toEqual({ ok: false, reason: 'corrupt' });
	});

	it('accepts a record with any/missing version (load-or-default, no migration branch)', () => {
		const noVersion = JSON.stringify({
			meta: { id: 'c1', title: 'x', titleManual: false, createdAt: 1, updatedAt: 2, providerId: 'claude', sessionId: null },
			messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
			providerState: {},
		});
		const result = deserialise(noVersion);
		expect(result.ok).toBe(true);

		const oldVersion = JSON.stringify({
			version: 0,
			meta: { id: 'c2', title: 'y', titleManual: false, createdAt: 1, updatedAt: 2, providerId: 'claude', sessionId: null },
			messages: [],
			providerState: {},
		});
		expect(deserialise(oldVersion).ok).toBe(true);
	});

	it('accepts a P1-shaped messages[] with no contentBlocks (EC-RR-13)', () => {
		const p1 = JSON.stringify({
			version: 1,
			meta: { id: 'c1', title: 'x', titleManual: false, createdAt: 1, updatedAt: 2, providerId: 'claude', sessionId: null },
			messages: [{ id: 'm1', role: 'assistant', content: 'plain', timestamp: 1 }],
			providerState: {},
		});
		const result = deserialise(p1);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.record.messages[0]?.contentBlocks).toBeUndefined();
	});
});
