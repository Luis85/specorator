import type { ChatMessage } from '@/domain/chat/ChatMessage';

/**
 * Pure rewind-eligibility scan (SPEC-TS-018, REQ-TS-019). Mirrors the forward
 * `hasResponse` leg of claudian-main `features/chat/rewind.ts findRewindContext`.
 *
 * A user message is rewind-eligible **iff** the next `role === 'assistant'`
 * message in its own turn (before the following user message) bears a non-empty
 * `assistantMessageId` — the presence of that id proves the runtime processed the
 * turn (REQ-TS-019). The UI further gates on
 * `runtime.getCapabilities().supportsRewind` (SPEC-TS-025); capability is a
 * runtime concern, NOT part of this pure scan. Pure/total: an unknown id, an
 * empty transcript, or a user turn with no turn-id-bearing assistant → `false`;
 * never throws (NFR-TS-005).
 */
export function isRewindEligible(messages: ChatMessage[], userMessageId: string): boolean {
	const userIndex = messages.findIndex(
		(m) => m.id === userMessageId && m.role === 'user',
	);
	if (userIndex === -1) return false;

	for (let i = userIndex + 1; i < messages.length; i++) {
		const message = messages[i];
		if (message.role === 'user') return false;
		// Past the user guard, this is an assistant message in the same turn.
		if (message.assistantMessageId !== undefined && message.assistantMessageId !== '') {
			return true;
		}
	}
	return false;
}
