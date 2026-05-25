/**
 * T-CA-007 (RED) — `MockAuxModel` (SPEC-CA-008 aux leg, TEST-CA-021 Mock-aux leg).
 *
 * The scriptable Mock `AuxModelPort` the re-pointed title/refine tests (SPEC-CA-018)
 * and the inline-edit tests (SPEC-CA-017) inject instead of a `MockChatRuntime`:
 *   - `setAuxResponse(text)` → `run` resolves `ok(text)`;
 *   - `setAuxError()` → `run` resolves `err`;
 *   - `setAuxEmpty()` (empty / whitespace) → `run` resolves `err`;
 *   - an already-aborted `options.signal` → `err`;
 *   - records the last `prompt` + `options.systemPrompt` for assertion.
 * Never throws across the boundary (NFR-CA-010). No `obsidian`/`node:*`/spawn.
 *
 * Fails until T-CA-008 supplies `@/infrastructure/mock/MockAuxModel`.
 *
 * Traces: TEST-CA-021 (Mock-aux leg), SPEC-CA-008, SPEC-CA-004, REQ-CA-021, NFR-CA-010.
 */
import { describe, it, expect } from 'vitest';
import { MockAuxModel } from '@/infrastructure/mock/MockAuxModel';
import type { AuxModelPort } from '@/domain/ports';

describe('MockAuxModel (TEST-CA-021 Mock-aux leg)', () => {
	it('is an AuxModelPort', () => {
		const aux: AuxModelPort = new MockAuxModel();
		expect(typeof aux.run).toBe('function');
	});

	it('setAuxResponse → run resolves ok(text)', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('Fix the login bug');
		const result = await aux.run('please fix login');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe('Fix the login bug');
	});

	it('setAuxError → run resolves err', async () => {
		const aux = new MockAuxModel();
		aux.setAuxError();
		const result = await aux.run('anything');
		expect(result.ok).toBe(false);
	});

	it('setAuxEmpty (empty) → run resolves err', async () => {
		const aux = new MockAuxModel();
		aux.setAuxEmpty();
		const result = await aux.run('anything');
		expect(result.ok).toBe(false);
	});

	it('setAuxResponse with a whitespace-only text → run resolves err (empty result maps to err)', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('   \n  ');
		const result = await aux.run('anything');
		expect(result.ok).toBe(false);
	});

	it('an already-aborted signal → run resolves err', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('a usable title');
		const controller = new AbortController();
		controller.abort();
		const result = await aux.run('x', { signal: controller.signal });
		expect(result.ok).toBe(false);
	});

	it('records the last prompt + options.systemPrompt for assertion', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('ok');
		await aux.run('the prompt body', { systemPrompt: 'the system prompt' });
		expect(aux.lastPrompt).toBe('the prompt body');
		expect(aux.lastSystemPrompt).toBe('the system prompt');
	});

	it('records an undefined systemPrompt when none is passed', async () => {
		const aux = new MockAuxModel();
		aux.setAuxResponse('ok');
		await aux.run('just the prompt');
		expect(aux.lastPrompt).toBe('just the prompt');
		expect(aux.lastSystemPrompt).toBeUndefined();
	});

	it('never throws across the boundary even with no scripted response (defaults to err)', async () => {
		const aux = new MockAuxModel();
		const result = await aux.run('unscripted');
		expect(result.ok).toBe(false);
	});
});
