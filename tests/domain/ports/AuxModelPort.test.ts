/**
 * T-CA-005 (TEST-CA-021 shape leg) — RED: `AuxModelPort` exposes
 * `run(prompt, options?) -> Promise<Result<string>>` with `AuxModelRunOptions`
 * (`systemPrompt?` / `model?` / `signal?`); `AUX_MODEL_PORT` is its own
 * InjectionKey; the barrel re-exports `AuxModelPort` + `AuxModelRunOptions`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CA-006 supplies the port.
 *
 * Traces: TEST-CA-021 (shape leg), SPEC-CA-004, REQ-CA-021, ADR-CA-002 §1, NFR-CA-001.
 */
import { describe, it, expect } from 'vitest';
import type { AuxModelPort, AuxModelRunOptions } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok } from '@/domain/shared/Result';
import { AUX_MODEL_PORT } from '@/infrastructure/bridge/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- AuxModelRunOptions = { readonly systemPrompt?; readonly model?; readonly signal? } ----
const _options: Equals<
	AuxModelRunOptions,
	{
		readonly systemPrompt?: string;
		readonly model?: string;
		readonly signal?: AbortSignal;
	}
> = true;
void _options;

// ---- run(prompt, options?) -> Promise<Result<string>> ----
const _run: Equals<
	AuxModelPort['run'],
	(prompt: string, options?: AuxModelRunOptions) => Promise<Result<string>>
> = true;
const _exact: Equals<keyof AuxModelPort, 'run'> = true;
void _run;
void _exact;

describe('AuxModelPort (TEST-CA-021 shape leg)', () => {
	it('a structural impl resolves a Result<string>', async () => {
		const port: AuxModelPort = {
			run: async (prompt: string, options?: AuxModelRunOptions) =>
				ok(options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt),
		};
		const result = await port.run('hello', { systemPrompt: 'sys' });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe('sys\n\nhello');
	});

	it('exposes its own AUX_MODEL_PORT InjectionKey', () => {
		expect(typeof AUX_MODEL_PORT).toBe('symbol');
	});
});
