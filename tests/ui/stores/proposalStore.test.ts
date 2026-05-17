/**
 * Tests for `useProposalStore()` — the cross-cutting file-write-proposal slice
 * extracted from the former monolithic `chatStore` (WP-3, Arch review #4).
 *
 * Cases migrated from `tests/ui/stores/chatStore.test.ts` (T-ASM-051,
 * REQ-ASM-041, REQ-ASM-043, REQ-ASM-045).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProposalStore } from '@/ui/stores/proposalStore';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema';

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

describe('useProposalStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('initial state', () => {
		it('REQ-ASM-041: proposals is an empty Map', () => {
			const store = useProposalStore();
			expect(store.proposals).toBeInstanceOf(Map);
			expect(store.proposals.size).toBe(0);
		});
	});

	describe('addProposal', () => {
		it('REQ-ASM-041: stores a proposal keyed by proposalId', () => {
			const store = useProposalStore();
			const proposal = makeProposal('p1');
			store.addProposal(proposal);
			expect(store.proposals.size).toBe(1);
			expect(store.proposals.get('p1')).toEqual(proposal);
		});

		it('replaces a prior proposal with the same id (idempotent)', () => {
			const store = useProposalStore();
			store.addProposal(makeProposal('p1', { threadId: 'old' }));
			store.addProposal(makeProposal('p1', { threadId: 'new' }));
			expect(store.proposals.size).toBe(1);
			expect(store.proposals.get('p1')?.threadId).toBe('new');
		});
	});

	describe('setProposalStatus', () => {
		it('REQ-ASM-043: transitions to accepted and stamps decidedAt', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));
			const store = useProposalStore();
			store.addProposal(makeProposal('p1'));
			store.setProposalStatus('p1', 'accepted');
			const after = store.proposals.get('p1')!;
			expect(after.status).toBe('accepted');
			expect(after.decidedAt).toBe('2026-05-14T12:00:00.000Z');
			expect(after.failureReason).toBeNull();
		});

		it('REQ-ASM-045: records failureReason when failed', () => {
			const store = useProposalStore();
			store.addProposal(makeProposal('p1'));
			store.setProposalStatus('p1', 'failed', 'WRITE_FAILED');
			const after = store.proposals.get('p1')!;
			expect(after.status).toBe('failed');
			expect(after.failureReason).toBe('WRITE_FAILED');
			expect(after.decidedAt).not.toBeNull();
		});

		it('clears failureReason on non-failed transitions', () => {
			const store = useProposalStore();
			store.addProposal(
				makeProposal('p1', {
					status: 'failed',
					failureReason: 'WRITE_FAILED',
				}),
			);
			store.setProposalStatus('p1', 'rejected');
			expect(store.proposals.get('p1')?.failureReason).toBeNull();
		});

		it('keeps decidedAt null when transitioning to pending', () => {
			const store = useProposalStore();
			store.addProposal(
				makeProposal('p1', {
					status: 'accepted',
					decidedAt: '2020-01-01T00:00:00.000Z',
				}),
			);
			store.setProposalStatus('p1', 'pending');
			expect(store.proposals.get('p1')?.decidedAt).toBeNull();
		});

		it('is a no-op when the proposal is unknown', () => {
			const store = useProposalStore();
			store.setProposalStatus('ghost', 'accepted');
			expect(store.proposals.size).toBe(0);
		});
	});

	describe('clearThreadProposals (Codex P2, PR #369 fourth review)', () => {
		it('drops only the proposals scoped to the given thread', () => {
			const store = useProposalStore();
			store.addProposal(makeProposal('p1', { threadId: 'thread-A' }));
			store.addProposal(makeProposal('p2', { threadId: 'thread-A' }));
			store.addProposal(makeProposal('p3', { threadId: 'thread-B' }));
			store.clearThreadProposals('thread-A');
			expect(store.proposals.size).toBe(1);
			expect(store.proposals.has('p3')).toBe(true);
			expect(store.proposals.has('p1')).toBe(false);
			expect(store.proposals.has('p2')).toBe(false);
		});

		it('is a no-op when no proposals match the thread id', () => {
			const store = useProposalStore();
			store.addProposal(makeProposal('p1', { threadId: 'thread-A' }));
			const before = store.proposals;
			store.clearThreadProposals('unknown');
			// Same map reference — no rebuild happened.
			expect(store.proposals).toBe(before);
		});

		it('is a no-op when the store has zero proposals', () => {
			const store = useProposalStore();
			store.clearThreadProposals('any');
			expect(store.proposals.size).toBe(0);
		});
	});

	describe('reset', () => {
		it('drops every proposal', () => {
			const store = useProposalStore();
			store.addProposal(makeProposal('p1'));
			store.addProposal(makeProposal('p2'));
			store.reset();
			expect(store.proposals.size).toBe(0);
		});
	});
});
