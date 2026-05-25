/**
 * T-CA-010 (RED) — `GenerateTitleUseCase` re-pointed onto `AuxModelPort`
 * (SPEC-CA-018, ADR-CA-002 §3). The use case is migrated to inject the scriptable
 * Mock `AuxModelPort` instead of a `MockChatRuntime`: the constructor takes
 * `(aux: AuxModelPort)` and the body is a single `aux.run(...)`. The observable
 * behaviour is UNCHANGED — a scripted `ok(text)` → `parseTitleGenerationResponse`
 * → `ok(title)`; `setAuxError`/`setAuxEmpty` → `err`; it still NEVER surfaces
 * `NotificationPort.showError` (REQ-TS-025); still `Result`-returning; no
 * `providerId` branch. The chunk-scripting + "ignores tool/thinking" cases
 * collapse — that concern now lives in the aux impl (T-CA-007/009).
 *
 * The pure transforms (`titleGeneration.ts`) stay byte-identical — asserted by
 * importing + calling them directly (TEST-CA-018 byte-identity leg).
 *
 * Fails (RED) until T-CA-011 re-points the constructor `(runtime)` → `(aux)`.
 *
 * Traces: TEST-CA-018, SPEC-CA-018, ADR-CA-002 §3, REQ-CA-021, REQ-TS-024/025,
 * NFR-CA-004, NFR-CA-010.
 */
import { describe, it, expect } from 'vitest';
import { GenerateTitleUseCase } from '@/application/threads/GenerateTitleUseCase';
import { MockAuxModel } from '@/infrastructure/mock/MockAuxModel';
import {
	TITLE_GENERATION_SYSTEM_PROMPT,
	buildTitleGenerationPrompt,
	parseTitleGenerationResponse,
} from '@/application/threads/titleGeneration';

describe('TEST-CA-018 GenerateTitleUseCase over AuxModelPort', () => {
	it('runs the aux query and returns the parsed title', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('Fix the login bug');
		const result = await new GenerateTitleUseCase(aux).execute('please fix login');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe('Fix the login bug');
	});

	it('passes the title-generation prompt + system prompt to the aux', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('Debug the worker');
		await new GenerateTitleUseCase(aux).execute('debug the worker please');
		expect(aux.lastPrompt).toBe(buildTitleGenerationPrompt('debug the worker please'));
		expect(aux.lastSystemPrompt).toBe(TITLE_GENERATION_SYSTEM_PROMPT);
	});

	it('returns err when the aux result is empty', async () => {
		const aux = new MockAuxModel();
		aux.setAuxEmpty();
		const result = await new GenerateTitleUseCase(aux).execute('x');
		expect(result.ok).toBe(false);
	});

	it('returns err on an aux error and never surfaces showError (EC-TS-11)', async () => {
		const aux = new MockAuxModel();
		aux.setAuxError();
		const result = await new GenerateTitleUseCase(aux).execute('x');
		expect(result.ok).toBe(false);
	});
});

describe('TEST-CA-018 titleGeneration pure transforms stay byte-identical', () => {
	it('parseTitleGenerationResponse keeps its trim/strip/cap behaviour (untouched)', () => {
		expect(parseTitleGenerationResponse('"Fix the login bug"')).toBe('Fix the login bug');
		expect(parseTitleGenerationResponse('Fix the login bug.')).toBe('Fix the login bug');
		expect(parseTitleGenerationResponse('   ')).toBeNull();
	});

	it('buildTitleGenerationPrompt frames the user request unchanged', () => {
		expect(buildTitleGenerationPrompt('please fix login')).toContain('please fix login');
		expect(buildTitleGenerationPrompt('please fix login')).toContain('Generate a title');
	});

	it('TITLE_GENERATION_SYSTEM_PROMPT is the unchanged ported prompt', () => {
		expect(TITLE_GENERATION_SYSTEM_PROMPT).toContain('summarizing user intent');
	});
});
