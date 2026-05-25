/**
 * T-TS-009 (TEST-TS-011 U leg / TEST-TS-012 store U leg) — RED:
 * `MockBridge.createProviderHistoryPort()` returns a `MockHistoryStore` over a
 * `Map<string, ConversationRecord>` implementing the full list/hydrate/save/
 * updateMeta/delete/resolveSessionId/buildForkPlan flow with no vault.
 *
 * listSessions sorts updatedAt DESC, empty store -> ok([]), missing hydrate ->
 * err{not-found}, delete of a missing id -> ok (idempotent), updateMeta patches
 * META ONLY (never messages/providerState, EC-TS-14), resolveSessionId falls back
 * through forkSource -> ok(null) (EC-TS-5); the test helpers seedConversations /
 * getAllConversations exist.
 *
 * RED: createProviderHistoryPort() + the MockHistoryStore do not yet exist.
 *
 * Traces: TEST-TS-011/012 (U leg), SPEC-TS-007, REQ-TS-008/010/012/013/018, NFR-TS-002.
 */
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import {
	CONVERSATION_RECORD_VERSION,
	type ConversationRecord,
} from '@/domain/chat/ConversationRecord';

function record(id: string, updatedAt: number, over: Partial<ConversationRecord> = {}): ConversationRecord {
	return {
		version: CONVERSATION_RECORD_VERSION,
		meta: {
			id,
			title: `title-${id}`,
			titleManual: false,
			createdAt: 1,
			updatedAt,
			providerId: 'claude',
			sessionId: `sess-${id}`,
		},
		messages: [
			{ id: `${id}-m1`, role: 'user', content: 'q', timestamp: 1 },
			{ id: `${id}-m2`, role: 'assistant', content: 'a', timestamp: 2 },
		],
		providerState: { providerSessionId: `sess-${id}` },
		...over,
	};
}

describe('MockHistoryStore (TEST-TS-011/012 U leg)', () => {
	it('providerId is claude', () => {
		const store = new MockBridge().createProviderHistoryPort();
		expect(store.providerId).toBe('claude');
	});

	it('listSessions on an empty store -> ok([])', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		const result = await store.listSessions();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toEqual([]);
	});

	it('save + listSessions sorts updatedAt DESC', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		await store.save(record('a', 10));
		await store.save(record('b', 30));
		await store.save(record('c', 20));
		const result = await store.listSessions();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.map((m) => m.id)).toEqual(['b', 'c', 'a']);
	});

	it('hydrate returns the saved record; a missing id -> err{not-found}', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		await store.save(record('a', 1));
		const hit = await store.hydrate('a');
		expect(hit.ok).toBe(true);
		if (hit.ok) expect(hit.value.meta.id).toBe('a');

		const miss = await store.hydrate('nope');
		expect(miss.ok).toBe(false);
		if (!miss.ok) expect((miss.error as { kind?: string }).kind).toBe('not-found');
	});

	it('delete is idempotent — deleting a missing id -> ok', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		const result = await store.delete('never-saved');
		expect(result.ok).toBe(true);
	});

	it('updateMeta patches meta only, never messages/providerState (EC-TS-14)', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		await store.save(record('a', 1));
		await store.updateMeta('a', { title: 'renamed', titleManual: true, updatedAt: 5 });
		const hit = await store.hydrate('a');
		expect(hit.ok).toBe(true);
		if (hit.ok) {
			expect(hit.value.meta.title).toBe('renamed');
			expect(hit.value.meta.titleManual).toBe(true);
			expect(hit.value.meta.updatedAt).toBe(5);
			// Messages + providerState untouched.
			expect(hit.value.messages.map((m) => m.id)).toEqual(['a-m1', 'a-m2']);
			expect(hit.value.providerState).toEqual({ providerSessionId: 'sess-a' });
		}
	});

	it('updateMeta on a missing id -> err{not-found}', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		const result = await store.updateMeta('nope', { title: 'x' });
		expect(result.ok).toBe(false);
	});

	it('resolveSessionId returns meta.sessionId; falls back to forkSource; else ok(null) (EC-TS-5)', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		await store.save(record('a', 1));
		const direct = await store.resolveSessionId('a');
		expect(direct.ok).toBe(true);
		if (direct.ok) expect(direct.value).toBe('sess-a');

		await store.save(
			record('b', 2, {
				meta: {
					id: 'b',
					title: 'b',
					titleManual: false,
					createdAt: 1,
					updatedAt: 2,
					providerId: 'claude',
					sessionId: null,
				},
				providerState: { forkSource: { sessionId: 'sess-fork', resumeAt: 'b-m1' } },
			}),
		);
		const viaFork = await store.resolveSessionId('b');
		expect(viaFork.ok).toBe(true);
		if (viaFork.ok) expect(viaFork.value).toBe('sess-fork');

		await store.save(
			record('c', 3, {
				meta: {
					id: 'c',
					title: 'c',
					titleManual: false,
					createdAt: 1,
					updatedAt: 3,
					providerId: 'claude',
					sessionId: null,
				},
				providerState: {},
			}),
		);
		const none = await store.resolveSessionId('c');
		expect(none.ok).toBe(true);
		if (none.ok) expect(none.value).toBeNull();
	});

	it('buildForkPlan derives a plan via the pure helper; source untouched (EC-TS-7)', async () => {
		const store = new MockBridge().createProviderHistoryPort();
		await store.save(record('a', 1));
		const plan = await store.buildForkPlan('a', 'a-m1');
		expect(plan.ok).toBe(true);
		if (plan.ok) expect(plan.value.messages.map((m) => m.id)).toEqual(['a-m1']);

		const absent = await store.buildForkPlan('a', 'no-such');
		expect(absent.ok).toBe(false);
		const missingSource = await store.buildForkPlan('nope', 'x');
		expect(missingSource.ok).toBe(false);
	});

	it('seedConversations + getAllConversations test helpers work', () => {
		const bridge = new MockBridge();
		const store = bridge.createProviderHistoryPort();
		store.seedConversations([record('a', 1), record('b', 2)]);
		expect(store.getAllConversations().map((r) => r.meta.id).sort()).toEqual(['a', 'b']);
	});
});
