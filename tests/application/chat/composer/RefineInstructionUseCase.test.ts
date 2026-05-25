/**
 * T-CA-010 (RED) — `RefineInstructionUseCase` re-pointed onto `AuxModelPort`
 * (SPEC-CA-018, ADR-CA-002 §3). The use case is migrated to inject the scriptable
 * Mock `AuxModelPort` instead of a `MockChatRuntime`: the constructor takes
 * `(aux: AuxModelPort)` and the body is a single `aux.run(...)`. The observable
 * behaviour is UNCHANGED — refined / clarification outcomes preserved; on an aux
 * `err` the caller falls through to the raw instruction with NO `showError`
 * (EC-CP-9). Still `Result`-returning; no `providerId` branch. The chunk-scripting
 * + "ignores tool/thinking" cases collapse — that concern now lives in the aux
 * impl (T-CA-007/009).
 *
 * The pure transforms (`instructionRefine.ts`) stay byte-identical — asserted by
 * importing + calling them directly (TEST-CA-018 byte-identity leg).
 *
 * Fails (RED) until T-CA-011 re-points the constructor `(runtime)` → `(aux)`.
 *
 * Traces: TEST-CA-018, SPEC-CA-018, ADR-CA-002 §3, REQ-CA-021, REQ-CP-016,
 * NFR-CA-004, NFR-CA-010.
 */
import { describe, it, expect } from 'vitest';
import { RefineInstructionUseCase } from '@/application/chat/composer/RefineInstructionUseCase';
import { MockAuxModel } from '@/infrastructure/mock/MockAuxModel';
import {
	buildRefineSystemPrompt,
	parseRefineResponse,
} from '@/application/chat/composer/instructionRefine';

describe('TEST-CA-018 RefineInstructionUseCase over AuxModelPort', () => {
	it('runs the aux query and returns a refined outcome', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('<instruction>- **Style**: be concise.</instruction>');
		const result = await new RefineInstructionUseCase(aux).execute('be concise', '');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ kind: 'refined', instruction: '- **Style**: be concise.' });
	});

	it('returns a clarification outcome for a plain-text response', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('What behaviour do you want to change?');
		const result = await new RefineInstructionUseCase(aux).execute('that thing', '');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			kind: 'clarification',
			question: 'What behaviour do you want to change?',
		});
	});

	it('passes the raw instruction + the refine system prompt to the aux', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('<instruction>use tabs</instruction>');
		await new RefineInstructionUseCase(aux).execute('use tabs', 'EXISTING');
		expect(aux.lastPrompt).toBe('use tabs');
		expect(aux.lastSystemPrompt).toBe(buildRefineSystemPrompt('EXISTING'));
	});

	it('returns err when the aux result is empty — caller keeps the raw (EC-CP-9)', async () => {
		const aux = new MockAuxModel();
		aux.setAuxEmpty();
		const result = await new RefineInstructionUseCase(aux).execute('x', '');
		expect(result.ok).toBe(false);
	});

	it('returns err on an aux error and never throws / notifies (EC-CP-9)', async () => {
		const aux = new MockAuxModel();
		aux.setAuxError();
		const result = await new RefineInstructionUseCase(aux).execute('x', '');
		expect(result.ok).toBe(false);
	});
});

describe('TEST-CA-018 instructionRefine pure transforms stay byte-identical', () => {
	it('parseRefineResponse keeps its block/clarification/null behaviour (untouched)', () => {
		expect(parseRefineResponse('<instruction>use tabs</instruction>')).toEqual({
			kind: 'refined',
			instruction: 'use tabs',
		});
		expect(parseRefineResponse('What did you mean?')).toEqual({
			kind: 'clarification',
			question: 'What did you mean?',
		});
		expect(parseRefineResponse('   ')).toBeNull();
	});

	it('buildRefineSystemPrompt frames the prompt + folds existing instructions unchanged', () => {
		expect(buildRefineSystemPrompt('')).toContain('expert Prompt Engineer');
		expect(buildRefineSystemPrompt('USE TYPESCRIPT')).toContain('USE TYPESCRIPT');
	});
});
