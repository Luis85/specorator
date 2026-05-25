import { ok, err, type Result } from '@/domain/shared/Result';
import type { ChatMessage } from '@/domain/ports';

export type RewindMode = 'conversation' | 'code-and-conversation';

export interface RewindResult {
	/** The user message the transcript is truncated back through (inclusive). */
	truncatedThrough: string;
	/** True only for the conversation-only mode that executes (REQ-TS-021). */
	checkpointSet: boolean;
	/**
	 * The following assistant turn id the caller passes to
	 * `runtime.setResumeCheckpoint` (conversation mode); `null` when none / gated.
	 */
	checkpointMessageId: string | null;
	/** Non-blocking notice text for the gated code-and-conversation mode; else `null`. */
	notice: string | null;
}

export interface RewindInput {
	mode: RewindMode;
	/** The tab's current transcript (read-only here). */
	messages: ChatMessage[];
	/** The user message rewound to. */
	userMessageId: string;
}

const CODE_REWIND_GATED_NOTICE = 'Code rollback is not available in this phase.';

/**
 * Orchestrate a conversation rewind (SPEC-TS-014, REQ-TS-021/022). Mirrors
 * claudian-main `ClaudeRewindService.executeClaudeRewind` (`mode === 'conversation'`
 * vs files). Pure orchestration over the passed transcript — it touches NO port;
 * the truncate + checkpoint are the `tabsStore`'s (so this stays pure).
 *
 * - `'conversation'` EXECUTES: finds the assistant turn that followed
 *   `userMessageId` (its `assistantMessageId`) and reports `checkpointSet: true`
 *   so the store truncates to `userMessageId` + calls `setResumeCheckpoint`. No
 *   filesystem touch.
 * - `'code-and-conversation'` is GATED (NG7, EC-TS-9): NO fs/git/`VaultPort`
 *   change (this use case takes no `VaultPort`, so it cannot make one by
 *   construction); returns `checkpointSet: false` + a notice the caller surfaces
 *   via `NotificationPort.showInfo`; the conversation is untouched.
 *
 * `userMessageId` absent → `err`. `Result`-returning (ADR-004); no `providerId`
 * branch (REQ-TS-026).
 */
export class RewindConversationUseCase {
	execute(input: RewindInput): Promise<Result<RewindResult>> {
		const { mode, messages, userMessageId } = input;
		const userIndex = messages.findIndex((m) => m.id === userMessageId && m.role === 'user');
		if (userIndex === -1) {
			return Promise.resolve(
				err(new Error(`rewind target user message not found: ${userMessageId}`)),
			);
		}

		if (mode === 'code-and-conversation') {
			// Gated (NG7): no fs/git change, conversation untouched, non-blocking notice.
			return Promise.resolve(
				ok({
					truncatedThrough: userMessageId,
					checkpointSet: false,
					checkpointMessageId: null,
					notice: CODE_REWIND_GATED_NOTICE,
				}),
			);
		}

		const checkpointMessageId = this.followingAssistantTurnId(messages, userIndex);
		return Promise.resolve(
			ok({
				truncatedThrough: userMessageId,
				checkpointSet: true,
				checkpointMessageId,
				notice: null,
			}),
		);
	}

	/** The id of the assistant turn that followed the user message, or `null`. */
	private followingAssistantTurnId(messages: ChatMessage[], userIndex: number): string | null {
		for (let i = userIndex + 1; i < messages.length; i++) {
			const message = messages[i];
			if (message.role === 'user') return null;
			if (message.assistantMessageId !== undefined && message.assistantMessageId !== '') {
				return message.assistantMessageId;
			}
		}
		return null;
	}
}
