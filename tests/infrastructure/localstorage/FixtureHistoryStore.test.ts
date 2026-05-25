/**
 * T-TS-009 (TEST-TS-012 store U leg) — RED: `LocalStorageBridge.createProviderHistoryPort()`
 * returns a fixture-seeded store (two or three canned records with distinct
 * updatedAt) whose writes mutate the in-memory fixture (non-durable, NFR-TS-002).
 *
 * RED: createProviderHistoryPort() on LocalStorageBridge does not yet exist.
 *
 * Traces: TEST-TS-012 (store U leg), SPEC-TS-008, REQ-TS-010, NFR-TS-002.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';

beforeEach(() => {
	localStorage.clear();
});

describe('FixtureHistoryStore (TEST-TS-012 store U leg)', () => {
	it('providerId is claude', () => {
		const store = new LocalStorageBridge().createProviderHistoryPort();
		expect(store.providerId).toBe('claude');
	});

	it('seeds a populated history list sorted updatedAt DESC', async () => {
		const store = new LocalStorageBridge().createProviderHistoryPort();
		const result = await store.listSessions();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.length).toBeGreaterThanOrEqual(2);
			const updatedAts = result.value.map((m) => m.updatedAt);
			const descending = [...updatedAts].sort((a, b) => b - a);
			expect(updatedAts).toEqual(descending);
		}
	});

	it('hydrate returns a seeded record', async () => {
		const store = new LocalStorageBridge().createProviderHistoryPort();
		const list = await store.listSessions();
		expect(list.ok).toBe(true);
		if (list.ok) {
			const firstId = list.value[0]?.id ?? '';
			const hit = await store.hydrate(firstId);
			expect(hit.ok).toBe(true);
			if (hit.ok) expect(hit.value.meta.id).toBe(firstId);
		}
	});

	it('writes mutate the in-memory fixture for the session (non-durable)', async () => {
		const store = new LocalStorageBridge().createProviderHistoryPort();
		const before = await store.listSessions();
		const firstId = before.ok ? (before.value[0]?.id ?? '') : '';

		await store.updateMeta(firstId, { title: 'renamed-in-demo', titleManual: true });
		const hit = await store.hydrate(firstId);
		expect(hit.ok).toBe(true);
		if (hit.ok) expect(hit.value.meta.title).toBe('renamed-in-demo');

		await store.delete(firstId);
		const after = await store.hydrate(firstId);
		expect(after.ok).toBe(false);

		// A fresh store re-seeds (non-durable — the mutation did not persist).
		const fresh = new LocalStorageBridge().createProviderHistoryPort();
		const reseeded = await fresh.hydrate(firstId);
		expect(reseeded.ok).toBe(true);
	});
});
