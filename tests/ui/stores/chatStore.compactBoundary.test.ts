/**
 * Tests for the per-thread compact-boundary notice log on `useChatStore()`
 * (Codex P2 on PR #379 — `agent-sidepanel-v2-tool-rendering`).
 *
 * Validates that `appendCompactBoundaryNotice(threadId, payload)` pushes a
 * `CompactBoundaryNoticeDto` into the per-thread bucket, that the bucket is
 * isolated across threads, that `reset()` clears it, and that
 * `clearThreadMessages(threadId)` drops the boundary log alongside the
 * matching message bucket.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore, type CompactBoundaryNoticeDto } from '@/ui/stores/chatStore';

function lastNoticeFor(
	store: ReturnType<typeof useChatStore>,
	threadId: string,
): CompactBoundaryNoticeDto | undefined {
	const bucket = store.compactBoundaries.get(threadId) ?? [];
	return bucket[bucket.length - 1];
}

describe('useChatStore() — compact-boundary notices', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('initial state has an empty compactBoundaries Map', () => {
		const store = useChatStore();
		expect(store.compactBoundaries.size).toBe(0);
	});

	it('appendCompactBoundaryNotice creates a fresh bucket for a new thread', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('t-A', { reason: 'auto-compact' });
		expect(store.compactBoundaries.get('t-A')).toHaveLength(1);
		const notice = lastNoticeFor(store, 't-A');
		expect(notice?.threadId).toBe('t-A');
		expect(notice?.reason).toBe('auto-compact');
		expect(typeof notice?.id).toBe('string');
		expect(notice?.id.length ?? 0).toBeGreaterThan(0);
		expect(typeof notice?.createdAt).toBe('string');
	});

	it('appendCompactBoundaryNotice accepts an absent reason', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('t-A', {});
		const notice = lastNoticeFor(store, 't-A');
		expect(notice?.reason).toBeUndefined();
	});

	it('appendCompactBoundaryNotice appends multiple entries in insertion order', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('t-A', { reason: 'r1' });
		store.appendCompactBoundaryNotice('t-A', { reason: 'r2' });
		const bucket = store.compactBoundaries.get('t-A') ?? [];
		expect(bucket.map((n) => n.reason)).toEqual(['r1', 'r2']);
	});

	it('appendCompactBoundaryNotice isolates buckets per threadId', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('t-A', { reason: 'r-A' });
		store.appendCompactBoundaryNotice('t-B', { reason: 'r-B' });
		expect(store.compactBoundaries.get('t-A')).toHaveLength(1);
		expect(store.compactBoundaries.get('t-B')).toHaveLength(1);
		expect(lastNoticeFor(store, 't-A')?.reason).toBe('r-A');
		expect(lastNoticeFor(store, 't-B')?.reason).toBe('r-B');
	});

	it('generates a unique id per notice', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('t-A', {});
		store.appendCompactBoundaryNotice('t-A', {});
		const bucket = store.compactBoundaries.get('t-A') ?? [];
		expect(bucket).toHaveLength(2);
		expect(bucket[0]?.id).not.toBe(bucket[1]?.id);
	});

	it('clearThreadMessages drops the matching compact-boundary bucket only', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('t-A', { reason: 'r-A' });
		store.appendCompactBoundaryNotice('t-B', { reason: 'r-B' });
		store.clearThreadMessages('t-A');
		expect(store.compactBoundaries.has('t-A')).toBe(false);
		expect(store.compactBoundaries.get('t-B')).toHaveLength(1);
	});

	it('reset() clears all compact-boundary notices', () => {
		const store = useChatStore();
		store.appendCompactBoundaryNotice('t-A', { reason: 'r' });
		store.appendCompactBoundaryNotice('t-B', { reason: 'r' });
		store.reset();
		expect(store.compactBoundaries.size).toBe(0);
	});
});
