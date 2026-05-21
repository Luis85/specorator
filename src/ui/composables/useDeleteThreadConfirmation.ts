import type { ConfirmModalPort } from '@/domain/ports/ConfirmModalPort';
import type { VaultPort } from '@/domain/ports/VaultPort';
import type { TranslationPort } from '@/domain/ports/TranslationPort';
import { tryAsync } from '@/domain/shared/tryAsync';

import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';

/**
 * Composable that owns the "delete this thread?" confirmation flow
 * (REQ-MPS-022, TST-MPS-12).
 *
 * Uses the existing `ConfirmModalPort` (REQ-ASM-044, ADR-0032) — which is
 * already backed by an Obsidian `Modal` subclass in production
 * (`ObsidianConfirmModalAdapter`) — instead of introducing a parallel
 * `ConfirmDeleteThreadModal` class. The "or equivalent narrow-port-wrapped
 * modal" clause on T-MPS-080 explicitly permits this; the alternative
 * would duplicate the DOM-construction discipline guards already audited
 * for `ObsidianConfirmModalAdapter`.
 *
 * On confirm the composable removes the record from `chatThreadsStore`
 * (which falls active id back to the most-recently-used remaining thread)
 * AND deletes the session-log file via `VaultPort.deleteFile`. The file
 * delete is best-effort: a rejection (file already gone, transient OS
 * error) does not roll back the in-memory mutation — the in-memory map is
 * the source of truth for the UI.
 *
 * Plain-language note: this composable never calls `window.confirm` (per
 * CLAUDE.md "DOM construction" — `no-restricted-globals`).
 */
export interface DeleteThreadConfirmationDeps {
	readonly confirmModal: ConfirmModalPort;
	readonly vault: Pick<VaultPort, 'deleteFile' | 'fileExists'>;
	readonly t: TranslationPort;
}

export interface DeleteThreadConfirmation {
	/**
	 * Prompts the user for confirmation; on accept, removes the thread from
	 * the store and deletes the log file. Returns `true` when the deletion
	 * proceeded, `false` on cancel/dismiss or unknown thread.
	 */
	confirmDelete(threadId: string): Promise<boolean>;
}

export function useDeleteThreadConfirmation(
	deps: DeleteThreadConfirmationDeps,
): DeleteThreadConfirmation {
	// Deps are passed explicitly by the mount site so the composable stays
	// pure and unit-testable without Vue inject() wiring. This mirrors the
	// `useProposalDecisions` pattern (deps bag, not composable-internal
	// inject) and keeps the ADR-008 narrow-port discipline at the use site.
	const { confirmModal, vault, t } = deps;
	const threadsStore = useChatThreadsStore();

	async function confirmDelete(threadId: string): Promise<boolean> {
		const record = threadsStore.chatThreads.get(threadId);
		if (record === undefined) return false;

		const accepted = await confirmModal.show({
			title: t.t('thread.delete.confirmTitle'),
			body: t.t('thread.delete.confirmBody'),
			confirmLabel: t.t('thread.delete.confirmAccept'),
			cancelLabel: t.t('thread.delete.confirmCancel'),
		});
		if (!accepted) return false;

		threadsStore.deleteThread(threadId);
		// Best-effort file delete: the in-memory map is already the source of
		// truth so a rejection (file already gone, transient OS error) must
		// not roll back the mutation. `tryAsync` keeps the project-wide
		// no-raw-try/catch lint rule (`no-restricted-syntax`) green.
		await tryAsync(() => vault.deleteFile(record.logPath));
		return true;
	}

	return { confirmDelete };
}
