/**
 * Tests for `useMessagesStore()` — the chat-panel UI surface + per-thread
 * message log slice extracted from the former monolithic `chatStore` (WP-3,
 * Arch review #4).
 *
 * Cases migrated from `tests/ui/stores/chatStore.test.ts` covering:
 *   T-CCS-012 (state shape, all actions, dedup, setActiveFile),
 *   IDEA-ASV-001 (per-thread message log),
 *   Codex P2 PR #369 (structuredFail residency).
 * Maps to REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-010, REQ-CCS-013,
 * REQ-CCS-014, REQ-CCS-016, REQ-ASM-025.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import type { ContextFileEntry } from '@/ui/stores/messagesStore';

function makeFile(path: string, label?: string, isAuto = false): ContextFileEntry {
	return { path, label: label ?? path, isAuto };
}

describe('useMessagesStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('initial state', () => {
		it('contextFiles is empty', () => {
			const store = useMessagesStore();
			expect(store.contextFiles).toHaveLength(0);
		});

		it('userText is empty string', () => {
			const store = useMessagesStore();
			expect(store.userText).toBe('');
		});

		it('response is null', () => {
			const store = useMessagesStore();
			expect(store.response).toBeNull();
		});

		it('status is idle', () => {
			const store = useMessagesStore();
			expect(store.status).toBe('idle');
		});

		it('errorType is null', () => {
			const store = useMessagesStore();
			expect(store.errorType).toBeNull();
		});

		it('truncated is false', () => {
			const store = useMessagesStore();
			expect(store.truncated).toBe(false);
		});

		it('structuredFail is false', () => {
			const store = useMessagesStore();
			expect(store.structuredFail).toBe(false);
		});

		it('messages is an empty Map', () => {
			const store = useMessagesStore();
			expect(store.messages).toBeInstanceOf(Map);
			expect(store.messages.size).toBe(0);
		});

		it('compactBoundaries is an empty Map', () => {
			const store = useMessagesStore();
			expect(store.compactBoundaries).toBeInstanceOf(Map);
			expect(store.compactBoundaries.size).toBe(0);
		});
	});

	describe('addContextFile', () => {
		it('appends a file to contextFiles', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes.md', 'notes.md'));
			expect(store.contextFiles).toHaveLength(1);
			expect(store.contextFiles[0].path).toBe('notes.md');
		});

		it('REQ-CCS-009: deduplication — second addContextFile with same path is no-op', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes.md', 'notes.md'));
			store.addContextFile(makeFile('notes.md', 'notes.md'));
			expect(store.contextFiles).toHaveLength(1);
		});

		it('appends different files independently', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('a.md'));
			store.addContextFile(makeFile('b.md'));
			expect(store.contextFiles).toHaveLength(2);
		});
	});

	describe('removeContextFile', () => {
		it('removes the entry with the matching path', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes.md'));
			store.removeContextFile('notes.md');
			expect(store.contextFiles).toHaveLength(0);
		});

		it('is a no-op when path is not found', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes.md'));
			store.removeContextFile('other.md');
			expect(store.contextFiles).toHaveLength(1);
		});
	});

	describe('setActiveFile', () => {
		it('REQ-CCS-005: replaces existing auto entry at index 0', () => {
			const store = useMessagesStore();
			store.setActiveFile(makeFile('old.md', 'old.md', true));
			store.setActiveFile(makeFile('new.md', 'new.md', true));
			expect(store.contextFiles).toHaveLength(1);
			expect(store.contextFiles[0].path).toBe('new.md');
		});

		it('inserts auto file at index 0 when no auto entry exists', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(makeFile('auto.md', 'auto.md', true));
			expect(store.contextFiles[0].path).toBe('auto.md');
			expect(store.contextFiles[0].isAuto).toBe(true);
		});

		it('forces isAuto=true on the inserted entry', () => {
			const store = useMessagesStore();
			store.setActiveFile({ path: 'file.md', label: 'file.md', isAuto: false });
			expect(store.contextFiles[0].isAuto).toBe(true);
		});

		it('does not affect manual entries when setting active file', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(makeFile('auto.md', 'auto.md', true));
			expect(store.contextFiles).toHaveLength(2);
			expect(store.contextFiles[1].path).toBe('manual.md');
		});

		it('REQ-CCS-006: setActiveFile(null) removes the auto entry', () => {
			const store = useMessagesStore();
			store.setActiveFile(makeFile('auto.md', 'auto.md', true));
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(null);
			expect(store.contextFiles).toHaveLength(1);
			expect(store.contextFiles[0].isAuto).toBe(false);
		});

		it('is a no-op when called with null and no auto entry exists', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(null);
			expect(store.contextFiles).toHaveLength(1);
		});

		it('keeps unrelated manual entries when promoting a different file (Codex P2, PR #350)', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes/a.md', 'a.md', false));
			store.addContextFile(makeFile('notes/b.md', 'b.md', false));
			store.setActiveFile(makeFile('notes/c.md', 'c.md', true));

			expect(store.contextFiles).toHaveLength(3);
			expect(store.contextFiles[0]).toMatchObject({ path: 'notes/c.md', isAuto: true });
			expect(store.contextFiles.slice(1).map((f) => f.path)).toEqual([
				'notes/a.md',
				'notes/b.md',
			]);
		});

		it('preserves a same-path manual entry across active-file changes (Codex P2 follow-up, PR #351)', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes/x.md', 'x.md', false));

			store.setActiveFile(makeFile('notes/x.md', 'x.md', true));
			expect(store.contextFiles).toHaveLength(2);
			expect(store.contextFiles.some((f) => f.isAuto && f.path === 'notes/x.md')).toBe(true);
			expect(store.contextFiles.some((f) => !f.isAuto && f.path === 'notes/x.md')).toBe(true);

			store.setActiveFile(null);
			expect(store.contextFiles).toHaveLength(1);
			expect(store.contextFiles[0]).toMatchObject({
				path: 'notes/x.md',
				isAuto: false,
			});
		});
	});

	describe('effectiveContextFiles (Codex P2 follow-up, PR #351)', () => {
		it('dedupes by path when a manual and auto entry share the same vault path', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes/x.md', 'x.md', false));
			store.setActiveFile(makeFile('notes/x.md', 'x.md', true));

			expect(store.effectiveContextFiles).toHaveLength(1);
			expect(store.effectiveContextFiles[0]).toMatchObject({
				path: 'notes/x.md',
				isAuto: true,
			});
		});

		it('keeps distinct-path manual + auto entries side-by-side', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes/manual.md', 'manual.md', false));
			store.setActiveFile(makeFile('notes/auto.md', 'auto.md', true));

			expect(store.effectiveContextFiles).toHaveLength(2);
			expect(store.effectiveContextFiles.map((f) => f.path)).toEqual([
				'notes/auto.md',
				'notes/manual.md',
			]);
		});

		it('exposes the manual entry again after the auto slot is cleared', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes/x.md', 'x.md', false));
			store.setActiveFile(makeFile('notes/x.md', 'x.md', true));
			expect(store.effectiveContextFiles[0]?.isAuto).toBe(true);

			store.setActiveFile(null);

			expect(store.effectiveContextFiles).toHaveLength(1);
			expect(store.effectiveContextFiles[0]).toMatchObject({
				path: 'notes/x.md',
				isAuto: false,
			});
		});
	});

	describe('setUserText', () => {
		it('sets userText', () => {
			const store = useMessagesStore();
			store.setUserText('hello world');
			expect(store.userText).toBe('hello world');
		});
	});

	describe('beginRequest', () => {
		it('REQ-CCS-014: sets status to loading', () => {
			const store = useMessagesStore();
			store.beginRequest();
			expect(store.status).toBe('loading');
		});

		it('clears response', () => {
			const store = useMessagesStore();
			store.setResponse('old response', false);
			store.beginRequest();
			expect(store.response).toBeNull();
		});

		it('clears errorType', () => {
			const store = useMessagesStore();
			store.setError('timeout');
			store.beginRequest();
			expect(store.errorType).toBeNull();
		});

		it('clears truncated', () => {
			const store = useMessagesStore();
			store.setResponse('text', true);
			store.beginRequest();
			expect(store.truncated).toBe(false);
		});
	});

	describe('setResponse', () => {
		it('REQ-CCS-013: sets status to idle', () => {
			const store = useMessagesStore();
			store.beginRequest();
			store.setResponse('Hello world', false);
			expect(store.status).toBe('idle');
		});

		it('stores the response text', () => {
			const store = useMessagesStore();
			store.setResponse('Hello world', false);
			expect(store.response).toBe('Hello world');
		});

		it('stores the truncated flag', () => {
			const store = useMessagesStore();
			store.setResponse('text', true);
			expect(store.truncated).toBe(true);
		});
	});

	describe('setError', () => {
		it('REQ-CCS-016: sets status to error for timeout', () => {
			const store = useMessagesStore();
			store.setError('timeout');
			expect(store.status).toBe('error');
			expect(store.errorType).toBe('timeout');
		});

		it('sets status to error for query_failed', () => {
			const store = useMessagesStore();
			store.setError('query_failed');
			expect(store.status).toBe('error');
			expect(store.errorType).toBe('query_failed');
		});

		it('clears response', () => {
			const store = useMessagesStore();
			store.setResponse('old', false);
			store.setError('timeout');
			expect(store.response).toBeNull();
		});
	});

	describe('clearResponse', () => {
		it('resets to idle state', () => {
			const store = useMessagesStore();
			store.setError('timeout');
			store.clearResponse();
			expect(store.status).toBe('idle');
			expect(store.errorType).toBeNull();
			expect(store.response).toBeNull();
			expect(store.truncated).toBe(false);
		});

		it('also resets structuredFail', () => {
			const store = useMessagesStore();
			store.setStructuredFail(true);
			store.clearResponse();
			expect(store.structuredFail).toBe(false);
		});
	});

	describe('Codex P2 (PR #369) — structuredFail store residency', () => {
		it('setStructuredFail toggles the flag', () => {
			const store = useMessagesStore();
			store.setStructuredFail(true);
			expect(store.structuredFail).toBe(true);
			store.setStructuredFail(false);
			expect(store.structuredFail).toBe(false);
		});

		it('reset() clears structuredFail', () => {
			const store = useMessagesStore();
			store.setStructuredFail(true);
			store.reset();
			expect(store.structuredFail).toBe(false);
		});
	});

	describe('reset', () => {
		it('restores initial state completely', () => {
			const store = useMessagesStore();
			store.addContextFile(makeFile('notes.md'));
			store.setUserText('some text');
			store.setResponse('resp', true);
			store.setStructuredFail(true);
			store.appendMessage({
				id: 'm1',
				threadId: 't-A',
				role: 'user',
				text: 'hi',
				createdAt: '2026-05-16T00:00:00Z',
			});
			store.appendCompactBoundaryNotice('t-A', { reason: 'r' });
			store.reset();
			expect(store.contextFiles).toHaveLength(0);
			expect(store.userText).toBe('');
			expect(store.response).toBeNull();
			expect(store.status).toBe('idle');
			expect(store.errorType).toBeNull();
			expect(store.truncated).toBe(false);
			expect(store.structuredFail).toBe(false);
			expect(store.messages.size).toBe(0);
			expect(store.compactBoundaries.size).toBe(0);
		});
	});

	describe('IDEA-ASV-001 — multi-turn message log', () => {
		function makeMessage(
			threadId: string,
			role: 'user' | 'assistant',
			overrides: { id?: string; text?: string; truncated?: boolean } = {},
		) {
			return {
				id: overrides.id ?? `m-${role}-${threadId}-${Math.random().toString(36).slice(2)}`,
				threadId,
				role,
				text: overrides.text ?? `${role} text`,
				createdAt: '2026-05-16T00:00:00Z',
				truncated: overrides.truncated,
			} as const;
		}

		it('appendMessage creates a fresh bucket for a new thread', () => {
			const store = useMessagesStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'm1' }));
			expect(store.messages.get('t-A')).toHaveLength(1);
			expect(store.messages.get('t-A')?.[0]?.id).toBe('m1');
		});

		it('appendMessage preserves insertion order across roles', () => {
			const store = useMessagesStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'u1' }));
			store.appendMessage(makeMessage('t-A', 'assistant', { id: 'a1' }));
			store.appendMessage(makeMessage('t-A', 'user', { id: 'u2' }));
			const bucket = store.messages.get('t-A') ?? [];
			expect(bucket.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
		});

		it('appendMessage is idempotent on id collision (no double-record on retry)', () => {
			const store = useMessagesStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'same' }));
			store.appendMessage(makeMessage('t-A', 'user', { id: 'same', text: 'second copy' }));
			const bucket = store.messages.get('t-A') ?? [];
			expect(bucket).toHaveLength(1);
			expect(bucket[0]?.text).toBe('user text');
		});

		it('appendMessage isolates messages between threads', () => {
			const store = useMessagesStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'a-user' }));
			store.appendMessage(makeMessage('t-B', 'user', { id: 'b-user' }));
			expect(store.messages.get('t-A')).toHaveLength(1);
			expect(store.messages.get('t-B')).toHaveLength(1);
			expect(store.messages.get('t-A')?.[0]?.id).toBe('a-user');
		});

		it('clearThreadMessages drops the bucket for the named thread only', () => {
			const store = useMessagesStore();
			store.appendMessage(makeMessage('t-A', 'user'));
			store.appendMessage(makeMessage('t-B', 'user'));
			store.clearThreadMessages('t-A');
			expect(store.messages.has('t-A')).toBe(false);
			expect(store.messages.get('t-B')).toHaveLength(1);
		});

		it('clearThreadMessages is a no-op for unknown thread ids', () => {
			const store = useMessagesStore();
			store.appendMessage(makeMessage('t-A', 'user'));
			const before = store.messages.size;
			store.clearThreadMessages('does-not-exist');
			expect(store.messages.size).toBe(before);
		});
	});
});
