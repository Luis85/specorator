import { describe, it, expect, vi } from 'vitest';
import { fakeModulePorts } from '../../__fakes__/fake-ports';
import { RewindConversationUseCase } from '@/application/threads/RewindConversationUseCase';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

/**
 * TEST-TS-016 (use-case U leg) + TEST-TS-017 (U leg) — `RewindConversationUseCase`
 * (SPEC-TS-014, REQ-TS-021/022, EC-TS-9).
 *
 * - conversation mode EXECUTES: returns `{ truncatedThrough: userMessageId,
 *   checkpointSet: true, checkpointMessageId: <following assistant id> }` (the
 *   store does the truncate + setResumeCheckpoint).
 * - code-and-conversation mode is GATED (NG7): `{ truncatedThrough, checkpointSet:
 *   false }` + a non-blocking notice; performs NO `VaultPort`/fs call; the
 *   conversation is untouched.
 * - `userMessageId` absent → err.
 */
function user(id: string): ChatMessage {
	return { id, role: 'user', content: id, timestamp: 1 };
}
function assistant(id: string, turnId: string): ChatMessage {
	return { id, role: 'assistant', content: id, timestamp: 2, assistantMessageId: turnId };
}

const transcript: ChatMessage[] = [
	user('u1'),
	assistant('a1', 'turn-1'),
	user('u2'),
	assistant('a2', 'turn-2'),
];

describe('TEST-TS-016/017 RewindConversationUseCase', () => {
	it('conversation mode returns truncatedThrough + checkpoint of the following assistant turn', async () => {
		const result = await new RewindConversationUseCase().execute({
			mode: 'conversation',
			messages: transcript,
			userMessageId: 'u1',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.truncatedThrough).toBe('u1');
		expect(result.value.checkpointSet).toBe(true);
		expect(result.value.checkpointMessageId).toBe('turn-1');
		expect(result.value.notice).toBeNull();
	});

	it('code-and-conversation mode is gated: checkpointSet=false + a notice, NO VaultPort/fs call (EC-TS-9)', async () => {
		const ports = fakeModulePorts();
		const writeSpy = vi.spyOn(ports.vault, 'writeFile');
		const deleteSpy = vi.spyOn(ports.vault, 'deleteFile');
		const before = JSON.stringify(transcript);

		const result = await new RewindConversationUseCase().execute({
			mode: 'code-and-conversation',
			messages: transcript,
			userMessageId: 'u1',
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.truncatedThrough).toBe('u1');
		expect(result.value.checkpointSet).toBe(false);
		expect(result.value.checkpointMessageId).toBeNull();
		expect(result.value.notice).not.toBeNull();
		// No fs / VaultPort touch; conversation untouched.
		expect(writeSpy).not.toHaveBeenCalled();
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(JSON.stringify(transcript)).toBe(before);
	});

	it('returns err when userMessageId is absent', async () => {
		const result = await new RewindConversationUseCase().execute({
			mode: 'conversation',
			messages: transcript,
			userMessageId: 'nope',
		});
		expect(result.ok).toBe(false);
	});
});
