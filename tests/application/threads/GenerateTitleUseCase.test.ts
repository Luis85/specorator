import { describe, it, expect } from 'vitest';
import { GenerateTitleUseCase } from '@/application/threads/GenerateTitleUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type { MockChatScriptEntry } from '@/infrastructure/mock/MockChatRuntime';

/**
 * TEST-TS-020 (use-case U leg) — `GenerateTitleUseCase` (SPEC-TS-016, ADR-TS-003,
 * REQ-TS-024/025, EC-TS-11). Drives a cold-start side-query
 * (`query(turn, [], { forceColdStart: true })`), accumulates `text` (ignoring
 * tool/thinking), `done` terminates, `parseTitleGenerationResponse` → Result.
 * A null/parse-fail or an `error` chunk → err; NEVER surfaces showError. The
 * cold-start flag does not steer the main stream (recorded on the runtime).
 */
describe('TEST-TS-020 GenerateTitleUseCase', () => {
	it('accumulates text and returns the parsed title', async () => {
		const runtime = new MockChatRuntime(['Fix the ', 'login bug']);
		const result = await new GenerateTitleUseCase(runtime).execute('please fix login');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe('Fix the login bug');
		expect(runtime.getLastForceColdStart()).toBe(true);
	});

	it('ignores tool / thinking chunks when accumulating', async () => {
		const script: MockChatScriptEntry[] = [
			{ type: 'thinking', content: 'pondering' },
			{ type: 'text', content: 'Debug the worker' },
			{ type: 'tool_use', id: 't1', name: 'Read', input: {} },
		];
		const result = await new GenerateTitleUseCase(new MockChatRuntime(script)).execute('x');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe('Debug the worker');
	});

	it('returns err when the accumulated text parses to null (empty)', async () => {
		const result = await new GenerateTitleUseCase(new MockChatRuntime([''])).execute('x');
		expect(result.ok).toBe(false);
	});

	it('returns err on an error chunk and never surfaces showError (EC-TS-11)', async () => {
		const script: MockChatScriptEntry[] = [{ type: 'error', content: 'backend down' }];
		const result = await new GenerateTitleUseCase(new MockChatRuntime(script)).execute('x');
		expect(result.ok).toBe(false);
	});
});
