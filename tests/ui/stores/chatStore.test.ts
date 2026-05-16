/**
 * T-CCS-012 — Tests for useChatStore() — state shape, all actions, deduplication, setActiveFile.
 * Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-013, REQ-CCS-014, REQ-CCS-016.
 * Maps to: TEST-CCS-009, TEST-CCS-STORE-001, TEST-CCS-STORE-002.
 *
 * T-ASM-051 — Tests for the SPEC-ASM-001 §8.1 store extensions
 * (chatThreads, activeThreadId, proposals, streamingText, cliStartingUp,
 *  sessionResumed plus the matching actions).
 * Satisfies REQ-ASM-031, REQ-ASM-035, REQ-ASM-037, REQ-ASM-041, REQ-ASM-043,
 *           REQ-ASM-045, NFR-ASM-002, R-ASM-003.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/ui/stores/chatStore';
import type { ContextFileEntry } from '@/ui/stores/chatStore';
import { asSessionId } from '@/domain/chat/SessionId';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema';

function makeFile(path: string, label?: string, isAuto = false): ContextFileEntry {
	return { path, label: label ?? path, isAuto };
}

describe('useChatStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('initial state', () => {
		it('contextFiles is empty', () => {
			const store = useChatStore();
			expect(store.contextFiles).toHaveLength(0);
		});

		it('userText is empty string', () => {
			const store = useChatStore();
			expect(store.userText).toBe('');
		});

		it('response is null', () => {
			const store = useChatStore();
			expect(store.response).toBeNull();
		});

		it('status is idle', () => {
			const store = useChatStore();
			expect(store.status).toBe('idle');
		});

		it('errorType is null', () => {
			const store = useChatStore();
			expect(store.errorType).toBeNull();
		});

		it('truncated is false', () => {
			const store = useChatStore();
			expect(store.truncated).toBe(false);
		});
	});

	describe('addContextFile', () => {
		it('appends a file to contextFiles', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes.md', 'notes.md'));
			expect(store.contextFiles).toHaveLength(1);
			expect(store.contextFiles[0].path).toBe('notes.md');
		});

		it('REQ-CCS-009: deduplication — second addContextFile with same path is no-op', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes.md', 'notes.md'));
			store.addContextFile(makeFile('notes.md', 'notes.md'));
			expect(store.contextFiles).toHaveLength(1);
		});

		it('appends different files independently', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('a.md'));
			store.addContextFile(makeFile('b.md'));
			expect(store.contextFiles).toHaveLength(2);
		});
	});

	describe('removeContextFile', () => {
		it('removes the entry with the matching path', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes.md'));
			store.removeContextFile('notes.md');
			expect(store.contextFiles).toHaveLength(0);
		});

		it('is a no-op when path is not found', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes.md'));
			store.removeContextFile('other.md');
			expect(store.contextFiles).toHaveLength(1);
		});
	});

	describe('setActiveFile', () => {
		// TEST-CCS-STORE-001: replaces existing auto entry
		it('REQ-CCS-005: replaces existing auto entry at index 0', () => {
			const store = useChatStore();
			store.setActiveFile(makeFile('old.md', 'old.md', true));
			store.setActiveFile(makeFile('new.md', 'new.md', true));
			expect(store.contextFiles).toHaveLength(1);
			expect(store.contextFiles[0].path).toBe('new.md');
		});

		it('inserts auto file at index 0 when no auto entry exists', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(makeFile('auto.md', 'auto.md', true));
			expect(store.contextFiles[0].path).toBe('auto.md');
			expect(store.contextFiles[0].isAuto).toBe(true);
		});

		it('forces isAuto=true on the inserted entry', () => {
			const store = useChatStore();
			// Even if caller passes isAuto: false, setActiveFile forces it true
			store.setActiveFile({ path: 'file.md', label: 'file.md', isAuto: false });
			expect(store.contextFiles[0].isAuto).toBe(true);
		});

		it('does not affect manual entries when setting active file', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(makeFile('auto.md', 'auto.md', true));
			expect(store.contextFiles).toHaveLength(2);
			expect(store.contextFiles[1].path).toBe('manual.md');
		});

		// TEST-CCS-STORE-002: setActiveFile(null) removes auto entry
		it('REQ-CCS-006: setActiveFile(null) removes the auto entry', () => {
			const store = useChatStore();
			store.setActiveFile(makeFile('auto.md', 'auto.md', true));
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(null);
			expect(store.contextFiles).toHaveLength(1);
			expect(store.contextFiles[0].isAuto).toBe(false);
		});

		it('is a no-op when called with null and no auto entry exists', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('manual.md'));
			store.setActiveFile(null);
			expect(store.contextFiles).toHaveLength(1);
		});

		it('keeps unrelated manual entries when promoting a different file (Codex P2, PR #350)', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes/a.md', 'a.md', false));
			store.addContextFile(makeFile('notes/b.md', 'b.md', false));
			// Focus a file that does NOT match either manual entry.
			store.setActiveFile(makeFile('notes/c.md', 'c.md', true));

			expect(store.contextFiles).toHaveLength(3);
			expect(store.contextFiles[0]).toMatchObject({ path: 'notes/c.md', isAuto: true });
			expect(store.contextFiles.slice(1).map((f) => f.path)).toEqual(['notes/a.md', 'notes/b.md']);
		});

		it('preserves a same-path manual entry across active-file changes (Codex P2 follow-up, PR #351)', () => {
			const store = useChatStore();
			// Manual entry for X.
			store.addContextFile(makeFile('notes/x.md', 'x.md', false));

			// Focus X — the manual entry must NOT be deleted, just hidden behind
			// the auto slot for `effectiveContextFiles` consumers.
			store.setActiveFile(makeFile('notes/x.md', 'x.md', true));
			expect(store.contextFiles).toHaveLength(2);
			expect(store.contextFiles.some((f) => f.isAuto && f.path === 'notes/x.md')).toBe(true);
			expect(store.contextFiles.some((f) => !f.isAuto && f.path === 'notes/x.md')).toBe(true);

			// Clear the auto slot — the manual entry resurfaces.
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
			const store = useChatStore();
			store.addContextFile(makeFile('notes/x.md', 'x.md', false));
			store.setActiveFile(makeFile('notes/x.md', 'x.md', true));

			// One chip / one prompt-body inclusion.
			expect(store.effectiveContextFiles).toHaveLength(1);
			// Auto wins — the deduped view exposes the auto-styled entry so the
			// chip renders without a remove button.
			expect(store.effectiveContextFiles[0]).toMatchObject({
				path: 'notes/x.md',
				isAuto: true,
			});
		});

		it('keeps distinct-path manual + auto entries side-by-side', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes/manual.md', 'manual.md', false));
			store.setActiveFile(makeFile('notes/auto.md', 'auto.md', true));

			expect(store.effectiveContextFiles).toHaveLength(2);
			expect(store.effectiveContextFiles.map((f) => f.path)).toEqual([
				'notes/auto.md',
				'notes/manual.md',
			]);
		});

		it('exposes the manual entry again after the auto slot is cleared', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes/x.md', 'x.md', false));
			store.setActiveFile(makeFile('notes/x.md', 'x.md', true));
			expect(store.effectiveContextFiles[0]?.isAuto).toBe(true);

			store.setActiveFile(null);

			// Auto gone, manual surfaces in the deduped view.
			expect(store.effectiveContextFiles).toHaveLength(1);
			expect(store.effectiveContextFiles[0]).toMatchObject({
				path: 'notes/x.md',
				isAuto: false,
			});
		});
	});

	describe('setUserText', () => {
		it('sets userText', () => {
			const store = useChatStore();
			store.setUserText('hello world');
			expect(store.userText).toBe('hello world');
		});
	});

	describe('beginRequest', () => {
		it('REQ-CCS-014: sets status to loading', () => {
			const store = useChatStore();
			store.beginRequest();
			expect(store.status).toBe('loading');
		});

		it('clears response', () => {
			const store = useChatStore();
			store.setResponse('old response', false);
			store.beginRequest();
			expect(store.response).toBeNull();
		});

		it('clears errorType', () => {
			const store = useChatStore();
			store.setError('timeout');
			store.beginRequest();
			expect(store.errorType).toBeNull();
		});

		it('clears truncated', () => {
			const store = useChatStore();
			store.setResponse('text', true);
			store.beginRequest();
			expect(store.truncated).toBe(false);
		});
	});

	describe('setResponse', () => {
		it('REQ-CCS-013: sets status to idle', () => {
			const store = useChatStore();
			store.beginRequest();
			store.setResponse('Hello world', false);
			expect(store.status).toBe('idle');
		});

		it('stores the response text', () => {
			const store = useChatStore();
			store.setResponse('Hello world', false);
			expect(store.response).toBe('Hello world');
		});

		it('stores the truncated flag', () => {
			const store = useChatStore();
			store.setResponse('text', true);
			expect(store.truncated).toBe(true);
		});
	});

	describe('setError', () => {
		it('REQ-CCS-016: sets status to error for timeout', () => {
			const store = useChatStore();
			store.setError('timeout');
			expect(store.status).toBe('error');
			expect(store.errorType).toBe('timeout');
		});

		it('sets status to error for query_failed', () => {
			const store = useChatStore();
			store.setError('query_failed');
			expect(store.status).toBe('error');
			expect(store.errorType).toBe('query_failed');
		});

		it('clears response', () => {
			const store = useChatStore();
			store.setResponse('old', false);
			store.setError('timeout');
			expect(store.response).toBeNull();
		});
	});

	describe('clearResponse', () => {
		it('resets to idle state', () => {
			const store = useChatStore();
			store.setError('timeout');
			store.clearResponse();
			expect(store.status).toBe('idle');
			expect(store.errorType).toBeNull();
			expect(store.response).toBeNull();
			expect(store.truncated).toBe(false);
		});
	});

	describe('reset', () => {
		it('restores initial state completely', () => {
			const store = useChatStore();
			store.addContextFile(makeFile('notes.md'));
			store.setUserText('some text');
			store.setResponse('resp', true);
			store.reset();
			expect(store.contextFiles).toHaveLength(0);
			expect(store.userText).toBe('');
			expect(store.response).toBeNull();
			expect(store.status).toBe('idle');
			expect(store.errorType).toBeNull();
			expect(store.truncated).toBe(false);
		});
	});

	// ── T-ASM-051: SPEC-ASM-001 §8.1 store extensions ─────────────────────────
	describe('ASM §8.1 extensions', () => {
		function makeThread(
			threadId: string,
			overrides: Partial<ChatThreadRecord> = {},
		): ChatThreadRecord {
			return {
				threadId,
				sessionId: null,
				feature: null,
				logPath: `specs/_chat/${threadId}.md`,
				transport: 'subscription',
				createdAt: '2026-05-14T00:00:00.000Z',
				lastUsedAt: '2026-05-14T00:00:00.000Z',
				...overrides,
			};
		}

		function makeEnvelope(path = 'specs/x/idea.md', content = 'body'): CreateFileEnvelope {
			return { action: 'createFile', path, content };
		}

		function makeProposal(
			proposalId: string,
			overrides: Partial<FileWriteProposal> = {},
		): FileWriteProposal {
			return {
				proposalId,
				threadId: 't1',
				envelope: makeEnvelope(),
				status: 'pending',
				proposedAt: '2026-05-14T00:00:00.000Z',
				decidedAt: null,
				failureReason: null,
				originPrompt: '/create-file t1.md',
				...overrides,
			};
		}

		describe('initial state', () => {
			it('REQ-ASM-037: chatThreads is an empty Map', () => {
				const store = useChatStore();
				expect(store.chatThreads).toBeInstanceOf(Map);
				expect(store.chatThreads.size).toBe(0);
			});

			it('REQ-ASM-031: activeThreadId is null', () => {
				const store = useChatStore();
				expect(store.activeThreadId).toBeNull();
			});

			it('REQ-ASM-041: proposals is an empty Map', () => {
				const store = useChatStore();
				expect(store.proposals).toBeInstanceOf(Map);
				expect(store.proposals.size).toBe(0);
			});

			it('NFR-ASM-002: streamingText is empty string', () => {
				const store = useChatStore();
				expect(store.streamingText).toBe('');
			});

			it('R-ASM-003: cliStartingUp is false', () => {
				const store = useChatStore();
				expect(store.cliStartingUp).toBe(false);
			});

			it('REQ-ASM-035: sessionResumed is false', () => {
				const store = useChatStore();
				expect(store.sessionResumed).toBe(false);
			});
		});

		describe('upsertThread', () => {
			it('REQ-ASM-037: adds a new ChatThreadRecord keyed by threadId', () => {
				const store = useChatStore();
				const record = makeThread('t1');
				store.upsertThread(record);
				expect(store.chatThreads.size).toBe(1);
				expect(store.chatThreads.get('t1')).toEqual(record);
			});

			it('replaces an existing record with the same threadId', () => {
				const store = useChatStore();
				store.upsertThread(makeThread('t1', { feature: 'a' }));
				store.upsertThread(makeThread('t1', { feature: 'b' }));
				expect(store.chatThreads.size).toBe(1);
				expect(store.chatThreads.get('t1')?.feature).toBe('b');
			});

			it('keeps unrelated threads intact when upserting another', () => {
				const store = useChatStore();
				store.upsertThread(makeThread('t1'));
				store.upsertThread(makeThread('t2'));
				expect(store.chatThreads.size).toBe(2);
				expect(store.chatThreads.has('t1')).toBe(true);
				expect(store.chatThreads.has('t2')).toBe(true);
			});
		});

		describe('setActiveThreadId', () => {
			it('REQ-ASM-031: switches the active thread', () => {
				const store = useChatStore();
				store.setActiveThreadId('t1');
				expect(store.activeThreadId).toBe('t1');
			});

			it('clears streamingText and sessionResumed when switching threads', () => {
				const store = useChatStore();
				store.appendStreamingDelta('partial reply');
				store.setSessionResumed(true);
				store.setActiveThreadId('t2');
				expect(store.streamingText).toBe('');
				expect(store.sessionResumed).toBe(false);
			});

			it('null clears the active thread and still resets transients', () => {
				const store = useChatStore();
				store.setActiveThreadId('t1');
				store.appendStreamingDelta('hi');
				store.setActiveThreadId(null);
				expect(store.activeThreadId).toBeNull();
				expect(store.streamingText).toBe('');
			});
		});

		describe('captureSessionId', () => {
			it('REQ-ASM-031: stores sessionId on the matching ChatThreadRecord', () => {
				const store = useChatStore();
				store.upsertThread(makeThread('t1'));
				store.captureSessionId('t1', asSessionId('sess-abc'));
				expect(store.chatThreads.get('t1')?.sessionId).toBe('sess-abc');
			});

			it('is a no-op when the thread is unknown', () => {
				const store = useChatStore();
				store.captureSessionId('ghost', asSessionId('sess-xyz'));
				expect(store.chatThreads.size).toBe(0);
			});
		});

		describe('markThreadUsed', () => {
			it('REQ-ASM-037: updates lastUsedAt on the matching thread', () => {
				const store = useChatStore();
				store.upsertThread(makeThread('t1', { lastUsedAt: '2020-01-01T00:00:00.000Z' }));
				const before = store.chatThreads.get('t1')!.lastUsedAt;
				store.markThreadUsed('t1');
				const after = store.chatThreads.get('t1')!.lastUsedAt;
				expect(after).not.toBe(before);
				expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
			});

			it('is a no-op when the thread is unknown', () => {
				const store = useChatStore();
				store.markThreadUsed('ghost');
				expect(store.chatThreads.size).toBe(0);
			});
		});

		describe('appendStreamingDelta + resetStreaming', () => {
			it('NFR-ASM-002: accumulates streaming deltas', () => {
				const store = useChatStore();
				store.appendStreamingDelta('Hello ');
				store.appendStreamingDelta('world');
				expect(store.streamingText).toBe('Hello world');
			});

			it('resetStreaming clears streamingText and sessionResumed', () => {
				const store = useChatStore();
				store.appendStreamingDelta('partial');
				store.setSessionResumed(true);
				store.resetStreaming();
				expect(store.streamingText).toBe('');
				expect(store.sessionResumed).toBe(false);
			});
		});

		describe('addProposal + setProposalStatus', () => {
			afterEach(() => {
				vi.useRealTimers();
			});

			it('REQ-ASM-041: addProposal stores a proposal keyed by proposalId', () => {
				const store = useChatStore();
				const proposal = makeProposal('p1');
				store.addProposal(proposal);
				expect(store.proposals.size).toBe(1);
				expect(store.proposals.get('p1')).toEqual(proposal);
			});

			it('addProposal replaces a prior proposal with the same id (idempotent)', () => {
				const store = useChatStore();
				store.addProposal(makeProposal('p1', { threadId: 'old' }));
				store.addProposal(makeProposal('p1', { threadId: 'new' }));
				expect(store.proposals.size).toBe(1);
				expect(store.proposals.get('p1')?.threadId).toBe('new');
			});

			it('REQ-ASM-043: setProposalStatus transitions to accepted and stamps decidedAt', () => {
				vi.useFakeTimers();
				vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));
				const store = useChatStore();
				store.addProposal(makeProposal('p1'));
				store.setProposalStatus('p1', 'accepted');
				const after = store.proposals.get('p1')!;
				expect(after.status).toBe('accepted');
				expect(after.decidedAt).toBe('2026-05-14T12:00:00.000Z');
				expect(after.failureReason).toBeNull();
			});

			it('REQ-ASM-045: setProposalStatus records failureReason when failed', () => {
				const store = useChatStore();
				store.addProposal(makeProposal('p1'));
				store.setProposalStatus('p1', 'failed', 'WRITE_FAILED');
				const after = store.proposals.get('p1')!;
				expect(after.status).toBe('failed');
				expect(after.failureReason).toBe('WRITE_FAILED');
				expect(after.decidedAt).not.toBeNull();
			});

			it('setProposalStatus clears failureReason on non-failed transitions', () => {
				const store = useChatStore();
				store.addProposal(
					makeProposal('p1', {
						status: 'failed',
						failureReason: 'WRITE_FAILED',
					}),
				);
				store.setProposalStatus('p1', 'rejected');
				expect(store.proposals.get('p1')?.failureReason).toBeNull();
			});

			it('setProposalStatus on pending keeps decidedAt null', () => {
				const store = useChatStore();
				store.addProposal(
					makeProposal('p1', {
						status: 'accepted',
						decidedAt: '2020-01-01T00:00:00.000Z',
					}),
				);
				store.setProposalStatus('p1', 'pending');
				expect(store.proposals.get('p1')?.decidedAt).toBeNull();
			});

			it('setProposalStatus is a no-op when the proposal is unknown', () => {
				const store = useChatStore();
				store.setProposalStatus('ghost', 'accepted');
				expect(store.proposals.size).toBe(0);
			});
		});

		describe('setCliStartingUp / setSessionResumed', () => {
			it('R-ASM-003: setCliStartingUp toggles cliStartingUp', () => {
				const store = useChatStore();
				store.setCliStartingUp(true);
				expect(store.cliStartingUp).toBe(true);
				store.setCliStartingUp(false);
				expect(store.cliStartingUp).toBe(false);
			});

			it('REQ-ASM-035: setSessionResumed toggles sessionResumed', () => {
				const store = useChatStore();
				store.setSessionResumed(true);
				expect(store.sessionResumed).toBe(true);
				store.setSessionResumed(false);
				expect(store.sessionResumed).toBe(false);
			});
		});

		describe('reset (extended)', () => {
			it('reset clears all ASM §8.1 slots', () => {
				const store = useChatStore();
				store.upsertThread(makeThread('t1'));
				store.setActiveThreadId('t1');
				store.addProposal(makeProposal('p1'));
				store.appendStreamingDelta('hi');
				store.setCliStartingUp(true);
				store.setSessionResumed(true);
				store.reset();
				expect(store.chatThreads.size).toBe(0);
				expect(store.activeThreadId).toBeNull();
				expect(store.proposals.size).toBe(0);
				expect(store.streamingText).toBe('');
				expect(store.cliStartingUp).toBe(false);
				expect(store.sessionResumed).toBe(false);
			});
		});

		describe('regression: existing CCS actions still work after ASM additions', () => {
			it('addContextFile + setUserText + beginRequest + setResponse round-trip', () => {
				const store = useChatStore();
				store.addContextFile(makeFile('notes.md'));
				store.setUserText('ping');
				store.beginRequest();
				expect(store.status).toBe('loading');
				store.setResponse('pong', false);
				expect(store.status).toBe('idle');
				expect(store.response).toBe('pong');
				expect(store.userText).toBe('ping');
				expect(store.contextFiles).toHaveLength(1);
			});
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

		it('initial state has an empty messages Map', () => {
			const store = useChatStore();
			expect(store.messages.size).toBe(0);
		});

		it('appendMessage creates a fresh bucket for a new thread', () => {
			const store = useChatStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'm1' }));
			expect(store.messages.get('t-A')).toHaveLength(1);
			expect(store.messages.get('t-A')?.[0]?.id).toBe('m1');
		});

		it('appendMessage preserves insertion order across roles', () => {
			const store = useChatStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'u1' }));
			store.appendMessage(makeMessage('t-A', 'assistant', { id: 'a1' }));
			store.appendMessage(makeMessage('t-A', 'user', { id: 'u2' }));
			const bucket = store.messages.get('t-A') ?? [];
			expect(bucket.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
		});

		it('appendMessage is idempotent on id collision (no double-record on retry)', () => {
			const store = useChatStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'same' }));
			store.appendMessage(makeMessage('t-A', 'user', { id: 'same', text: 'second copy' }));
			const bucket = store.messages.get('t-A') ?? [];
			expect(bucket).toHaveLength(1);
			expect(bucket[0]?.text).toBe('user text');
		});

		it('appendMessage isolates messages between threads', () => {
			const store = useChatStore();
			store.appendMessage(makeMessage('t-A', 'user', { id: 'a-user' }));
			store.appendMessage(makeMessage('t-B', 'user', { id: 'b-user' }));
			expect(store.messages.get('t-A')).toHaveLength(1);
			expect(store.messages.get('t-B')).toHaveLength(1);
			expect(store.messages.get('t-A')?.[0]?.id).toBe('a-user');
		});

		it('clearThreadMessages drops the bucket for the named thread only', () => {
			const store = useChatStore();
			store.appendMessage(makeMessage('t-A', 'user'));
			store.appendMessage(makeMessage('t-B', 'user'));
			store.clearThreadMessages('t-A');
			expect(store.messages.has('t-A')).toBe(false);
			expect(store.messages.get('t-B')).toHaveLength(1);
		});

		it('clearThreadMessages is a no-op for unknown thread ids', () => {
			const store = useChatStore();
			store.appendMessage(makeMessage('t-A', 'user'));
			const before = store.messages.size;
			store.clearThreadMessages('does-not-exist');
			expect(store.messages.size).toBe(before);
		});

		it('reset() clears the messages Map', () => {
			const store = useChatStore();
			store.appendMessage(makeMessage('t-A', 'user'));
			store.appendMessage(makeMessage('t-B', 'user'));
			store.reset();
			expect(store.messages.size).toBe(0);
		});
	});

	describe('Codex P2 (PR #369) — structuredFail store residency', () => {
		it('initial state is false', () => {
			const store = useChatStore();
			expect(store.structuredFail).toBe(false);
		});

		it('setStructuredFail toggles the flag', () => {
			const store = useChatStore();
			store.setStructuredFail(true);
			expect(store.structuredFail).toBe(true);
			store.setStructuredFail(false);
			expect(store.structuredFail).toBe(false);
		});

		it('clearResponse() also resets structuredFail', () => {
			const store = useChatStore();
			store.setStructuredFail(true);
			store.clearResponse();
			expect(store.structuredFail).toBe(false);
		});

		it('reset() clears structuredFail', () => {
			const store = useChatStore();
			store.setStructuredFail(true);
			store.reset();
			expect(store.structuredFail).toBe(false);
		});
	});

	describe('Codex P2 (PR #369, fourth review) — clearThreadProposals', () => {
		function makeP(proposalId: string, threadId: string) {
			return {
				proposalId,
				threadId,
				envelope: { action: 'createFile' as const, path: `specs/${proposalId}.md`, content: 'x' },
				status: 'pending' as const,
				proposedAt: '2026-05-16T00:00:00Z',
				decidedAt: null,
				failureReason: null,
				originPrompt: '/create',
			}
		}

		it('drops only the proposals scoped to the given thread', () => {
			const store = useChatStore()
			store.addProposal(makeP('p1', 'thread-A'))
			store.addProposal(makeP('p2', 'thread-A'))
			store.addProposal(makeP('p3', 'thread-B'))
			store.clearThreadProposals('thread-A')
			expect(store.proposals.size).toBe(1)
			expect(store.proposals.has('p3')).toBe(true)
			expect(store.proposals.has('p1')).toBe(false)
			expect(store.proposals.has('p2')).toBe(false)
		})

		it('is a no-op when no proposals match the thread id', () => {
			const store = useChatStore()
			store.addProposal(makeP('p1', 'thread-A'))
			const before = store.proposals
			store.clearThreadProposals('unknown')
			// Same map reference — no rebuild happened.
			expect(store.proposals).toBe(before)
		})

		it('is a no-op when the store has zero proposals', () => {
			const store = useChatStore()
			store.clearThreadProposals('any')
			expect(store.proposals.size).toBe(0)
		})
	})
});
