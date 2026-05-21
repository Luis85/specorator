/**
 * T-MPS-080 — Delete-thread confirmation composable.
 *
 * Satisfies REQ-MPS-022 + TST-MPS-12: on confirm, the in-memory record is
 * removed AND the session-log file is deleted via `VaultPort.deleteFile`.
 * On cancel/dismiss, neither side-effect runs.
 *
 * The composable wraps the existing `ConfirmModalPort` (REQ-ASM-044,
 * ADR-0032) so no native `window.confirm` is introduced. The Modal subclass
 * lives in `ObsidianConfirmModalAdapter` (already in production); reusing
 * it satisfies the "or equivalent narrow-port-wrapped modal" clause on
 * T-MPS-080.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useDeleteThreadConfirmation } from '@/ui/composables/useDeleteThreadConfirmation';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { ConfirmModalPort } from '@/domain/ports/ConfirmModalPort';
import type { VaultPort } from '@/domain/ports/VaultPort';
import type { TranslationPort } from '@/domain/ports/TranslationPort';

function makeThread(threadId: string, overrides: Partial<ChatThreadRecord> = {}): ChatThreadRecord {
	return {
		threadId,
		sessionId: null,
		feature: null,
		logPath: `specs/_chat/${threadId}.md`,
		transport: { provider: 'claude', mode: 'cli' },
		title: '',
		forkParent: null,
		createdAt: '2026-05-14T00:00:00.000Z',
		lastUsedAt: '2026-05-14T00:00:00.000Z',
		...overrides,
	};
}

function makeDeps(modalReturn: boolean) {
	const confirmModal: ConfirmModalPort = {
		show: vi.fn(async () => modalReturn),
	};
	const vault: Pick<VaultPort, 'deleteFile' | 'fileExists'> = {
		deleteFile: vi.fn(async () => undefined),
		fileExists: vi.fn(async () => true),
	};
	const t: TranslationPort = { t: vi.fn((key: string) => key) };
	return { confirmModal, vault: vault as VaultPort, t };
}

describe('useDeleteThreadConfirmation (REQ-MPS-022, TST-MPS-12)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('opens the Obsidian Modal via ConfirmModalPort.show', async () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		const deps = makeDeps(true);
		const composable = useDeleteThreadConfirmation(deps);
		await composable.confirmDelete('t1');
		expect(deps.confirmModal.show).toHaveBeenCalledTimes(1);
	});

	it('uses the localised title + body keys from the spec table (§A3)', async () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		const deps = makeDeps(true);
		const composable = useDeleteThreadConfirmation(deps);
		await composable.confirmDelete('t1');
		expect(deps.t.t).toHaveBeenCalledWith('thread.delete.confirmTitle');
		expect(deps.t.t).toHaveBeenCalledWith('thread.delete.confirmBody');
	});

	it('removes the record from the store and deletes the log file on confirm', async () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { logPath: 'specs/_chat/t1.md' }));
		const deps = makeDeps(true);
		const composable = useDeleteThreadConfirmation(deps);
		const outcome = await composable.confirmDelete('t1');
		expect(outcome).toBe(true);
		expect(store.chatThreads.has('t1')).toBe(false);
		expect(deps.vault.deleteFile).toHaveBeenCalledWith('specs/_chat/t1.md');
	});

	it('does NOT mutate the store nor delete the file on cancel', async () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { logPath: 'specs/_chat/t1.md' }));
		const deps = makeDeps(false);
		const composable = useDeleteThreadConfirmation(deps);
		const outcome = await composable.confirmDelete('t1');
		expect(outcome).toBe(false);
		expect(store.chatThreads.has('t1')).toBe(true);
		expect(deps.vault.deleteFile).not.toHaveBeenCalled();
	});

	it('is a no-op (returns false, no modal) when the thread is unknown', async () => {
		const deps = makeDeps(true);
		const composable = useDeleteThreadConfirmation(deps);
		const outcome = await composable.confirmDelete('ghost');
		expect(outcome).toBe(false);
		expect(deps.confirmModal.show).not.toHaveBeenCalled();
		expect(deps.vault.deleteFile).not.toHaveBeenCalled();
	});

	it('swallows VaultPort.deleteFile rejections (file may have been removed externally)', async () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1', { logPath: 'specs/_chat/t1.md' }));
		const deps = makeDeps(true);
		(deps.vault.deleteFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('ENOENT'),
		);
		const composable = useDeleteThreadConfirmation(deps);
		const outcome = await composable.confirmDelete('t1');
		// Store mutation still wins because the in-memory record is the
		// source of truth; the file-delete is best-effort.
		expect(outcome).toBe(true);
		expect(store.chatThreads.has('t1')).toBe(false);
	});
});
