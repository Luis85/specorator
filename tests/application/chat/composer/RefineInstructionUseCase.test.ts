import { describe, it, expect } from 'vitest';
import { RefineInstructionUseCase } from '@/application/chat/composer/RefineInstructionUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { MockChatScriptEntry } from '@/infrastructure/mock/MockChatRuntime';

/**
 * TEST-CP-011 (refine use-case leg) — RefineInstructionUseCase (SPEC-CP-015,
 * REQ-CP-016, EC-CP-9). Drives a cold-start side-query
 * (query(turn, [], {forceColdStart:true})), accumulates `text` (ignoring
 * tool/thinking), `done` terminates, parseRefineResponse → Result<RefineOutcome>.
 * An empty/parse-fail or an error chunk → err; on err the caller falls through to
 * the raw instruction and NEVER surfaces showError (the use case returns a Result,
 * never throws / notifies). The cold-start flag does not steer the main stream.
 */
describe('TEST-CP-011 RefineInstructionUseCase', () => {
	it('accumulates text and returns a refined outcome', async () => {
		const runtime = new MockChatRuntime([
			'<instruction>- **Style**: be ',
			'concise.</instruction>',
		]);
		const result = await new RefineInstructionUseCase(runtime).execute('be concise', '');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ kind: 'refined', instruction: '- **Style**: be concise.' });
		expect(runtime.getLastForceColdStart()).toBe(true);
	});

	it('returns a clarification outcome for a plain-text response', async () => {
		const runtime = new MockChatRuntime(['What behaviour do you want to change?']);
		const result = await new RefineInstructionUseCase(runtime).execute('that thing', '');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			kind: 'clarification',
			question: 'What behaviour do you want to change?',
		});
	});

	it('ignores tool / thinking chunks when accumulating', async () => {
		const script: MockChatScriptEntry[] = [
			{ type: 'thinking', content: 'pondering' },
			{ type: 'text', content: '<instruction>use tabs</instruction>' },
			{ type: 'tool_use', id: 't1', name: 'Read', input: {} },
		];
		const result = await new RefineInstructionUseCase(new MockChatRuntime(script)).execute('x', '');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ kind: 'refined', instruction: 'use tabs' });
	});

	it('returns err when the accumulated text parses to null (empty) — caller keeps the raw (EC-CP-9)', async () => {
		const result = await new RefineInstructionUseCase(new MockChatRuntime([''])).execute('x', '');
		expect(result.ok).toBe(false);
	});

	it('returns err on an error chunk and never throws (EC-CP-9)', async () => {
		const script: MockChatScriptEntry[] = [{ type: 'error', content: 'backend down' }];
		const result = await new RefineInstructionUseCase(new MockChatRuntime(script)).execute('x', '');
		expect(result.ok).toBe(false);
	});
});
