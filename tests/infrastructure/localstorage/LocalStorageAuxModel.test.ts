/**
 * T-CA-007 (RED) — `LocalStorageAuxModel` (SPEC-CA-009 aux leg).
 *
 * A browser-safe canned/echo `AuxModelPort` stand-in for the (deferred) GitHub
 * Pages demo: no subprocess, never throws. `run` always resolves `ok` so the
 * standalone demo never crashes when a title/refine/inline-edit side-query fires.
 *
 * Fails until T-CA-008 supplies the LocalStorage aux impl.
 *
 * Traces: SPEC-CA-009, SPEC-CA-004, REQ-CA-021, NFR-CA-010.
 */
import { describe, it, expect } from 'vitest';
import { LocalStorageAuxModel } from '@/infrastructure/localstorage/LocalStorageComposerPorts';
import type { AuxModelPort } from '@/domain/ports';

describe('LocalStorageAuxModel (SPEC-CA-009 aux leg)', () => {
	it('is an AuxModelPort', () => {
		const aux: AuxModelPort = new LocalStorageAuxModel();
		expect(typeof aux.run).toBe('function');
	});

	it('resolves ok and never throws (browser-safe canned/echo)', async () => {
		const aux = new LocalStorageAuxModel();
		const result = await aux.run('summarise this');
		expect(result.ok).toBe(true);
		if (result.ok) expect(typeof result.value).toBe('string');
	});

	it('resolves ok even with a system prompt + a model override', async () => {
		const aux = new LocalStorageAuxModel();
		const result = await aux.run('refine this', {
			systemPrompt: 'you are a prompt engineer',
			model: 'demo-model',
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.length).toBeGreaterThan(0);
	});
});
