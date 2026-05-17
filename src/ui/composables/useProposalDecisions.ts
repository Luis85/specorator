/**
 * Composable that hosts the Accept / Reject / Retry handlers for
 * `FileWriteProposalCard`. Extracted from `ChatSidebar.vue` during WP-2 to
 * trim the component below the orchestrator-extraction LOC target.
 *
 * Responsibilities:
 *   - guard each decision against re-entrance + cross-decision races (the
 *     same `inFlightDecisions` set covers both Accept and Reject);
 *   - re-validate the envelope path against the CURRENT specsFolder before
 *     any vault mutation (Codex P2, PR #350);
 *   - mirror terminal pre-commit failures to the session log;
 *   - call `commitFileWriteProposal` / `rejectFileWriteProposal` (the only
 *     sanctioned vault-mutation paths for an LLM proposal — NFR-ASM-011).
 *
 * This is intentionally a thin composable, not an application-layer use case:
 * it composes ports + a TranslationPort + the proposal store + an optional
 * `ConfirmModalPort`, all of which already live behind injection keys in the
 * UI layer.
 */
import { ref, type Ref } from 'vue';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal';
import type { CommitProposalErrorCode, PathValidationError } from '@/application/chat/errors';
import { validateProposalPath } from '@/application/chat/validateProposalPath';
import {
	commitFileWriteProposal,
	rejectFileWriteProposal,
} from '@/application/chat/commitFileWriteProposal';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type {
	ConfirmModalPort,
	LoggerPort,
	SettingsPort,
	TranslationPort,
	VaultPort,
} from '@/domain/ports';
import type { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import type { useProposalStore } from '@/ui/stores/proposalStore';
import type { UseSessionLogMirror } from '@/ui/composables/useSessionLogMirror';

export interface UseProposalDecisionsArgs {
	readonly settingsPort: SettingsPort;
	readonly vaultPort: VaultPort;
	readonly loggerPort: LoggerPort;
	readonly confirmModalPort: ConfirmModalPort | undefined;
	readonly sessionLogMirrorFactory: UseSessionLogMirror;
	readonly translator: TranslationPort;
	readonly threadsStore: ReturnType<typeof useChatThreadsStore>;
	readonly proposalStore: ReturnType<typeof useProposalStore>;
	readonly proposalPathErrors: Ref<Map<string, PathValidationError>>;
}

export interface UseProposalDecisions {
	handleAcceptProposal(payload: { proposalId: string }): Promise<void>;
	handleRejectProposal(payload: { proposalId: string }): Promise<void>;
}

export function useProposalDecisions(args: UseProposalDecisionsArgs): UseProposalDecisions {
	const inFlight = ref(new Set<string>());

	function findProposal(proposalId: string): FileWriteProposal | null {
		return args.proposalStore.proposals.get(proposalId) ?? null;
	}

	async function mirrorTerminalProposalFailure(
		proposal: FileWriteProposal,
		thread: ChatThreadRecord,
		context: string,
	): Promise<void> {
		await (async () => {
			const mirror = await args.sessionLogMirrorFactory.getMirror();
			await mirror.mirrorProposalDecision({
				thread,
				proposal: {
					envelope: { path: proposal.envelope.path, rationale: undefined },
				},
				decision: 'failed',
				decidedAt: new Date().toISOString(),
			});
		})().catch((thrown: unknown) => {
			args.loggerPort.warn(`handleAcceptProposal: ${context} audit mirror failed`, {
				proposalId: proposal.proposalId,
				reason: thrown instanceof Error ? thrown.message : String(thrown),
			});
		});
	}

	async function handleAcceptProposal(payload: { proposalId: string }): Promise<void> {
		if (inFlight.value.has(payload.proposalId)) return;
		const proposal = findProposal(payload.proposalId);
		if (proposal === null) return;
		if (proposal.status !== 'pending') return;
		const thread = args.threadsStore.chatThreads.get(proposal.threadId);
		if (thread === undefined) return;
		inFlight.value.add(payload.proposalId);
		await (async () => {
			const settingsResult = await tryAsync(() => args.settingsPort.getSettings());
			if (!settingsResult.ok) {
				args.loggerPort.warn(
					'handleAcceptProposal: settingsPort.getSettings() failed during revalidation',
					{
						proposalId: payload.proposalId,
						reason: settingsResult.error.message,
					},
				);
				await mirrorTerminalProposalFailure(proposal, thread, 'settings-read-failed');
				args.proposalStore.setProposalStatus(payload.proposalId, 'failed', 'WRITE_FAILED');
				return;
			}
			const currentSettings = settingsResult.value;
			const revalidation = validateProposalPath(proposal.envelope, currentSettings.specsFolder);
			if (!revalidation.ok) {
				const next = new Map(args.proposalPathErrors.value);
				next.set(payload.proposalId, revalidation.error);
				args.proposalPathErrors.value = next;
				await mirrorTerminalProposalFailure(proposal, thread, 'revalidation-failed');
				args.proposalStore.setProposalStatus(payload.proposalId, 'failed', 'WRITE_FAILED');
				return;
			}
			const mirror = await args.sessionLogMirrorFactory.getMirror();
			const result = await commitFileWriteProposal(proposal, thread, {
				vault: args.vaultPort,
				logger: args.loggerPort,
				sessionLog: mirror,
				confirmModal: args.confirmModalPort,
				i18n: args.translator,
				nowIso: () => new Date().toISOString(),
			});
			if (result.ok) {
				args.proposalStore.setProposalStatus(payload.proposalId, 'accepted');
			} else {
				const code: CommitProposalErrorCode = result.error.errorCode;
				args.proposalStore.setProposalStatus(payload.proposalId, 'failed', code);
			}
		})().finally(() => {
			inFlight.value.delete(payload.proposalId);
		});
	}

	async function handleRejectProposal(payload: { proposalId: string }): Promise<void> {
		if (inFlight.value.has(payload.proposalId)) return;
		const proposal = findProposal(payload.proposalId);
		if (proposal === null) return;
		if (proposal.status !== 'pending') return;
		const thread = args.threadsStore.chatThreads.get(proposal.threadId);
		if (thread === undefined) {
			args.proposalStore.setProposalStatus(payload.proposalId, 'rejected');
			return;
		}
		inFlight.value.add(payload.proposalId);
		await (async () => {
			const mirror = await args.sessionLogMirrorFactory.getMirror();
			await rejectFileWriteProposal(proposal, thread, {
				sessionLog: mirror,
				logger: args.loggerPort,
				nowIso: () => new Date().toISOString(),
			});
			args.proposalStore.setProposalStatus(payload.proposalId, 'rejected');
		})().finally(() => {
			inFlight.value.delete(payload.proposalId);
		});
	}

	return { handleAcceptProposal, handleRejectProposal };
}
