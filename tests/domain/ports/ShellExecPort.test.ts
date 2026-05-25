/**
 * T-CP-005 (TEST-CP-005 shell leg) — RED: `ShellExecPort` exposes
 * `run(request) -> Promise<Result<ShellExecResult, Error>>` with the
 * `ShellExecRequest` / `ShellExecResult` shapes (`exitCode` / `truncated` /
 * `notice`); `SHELL_EXEC_PORT` is its own InjectionKey; the barrel re-exports
 * the port + its types.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CP-007.
 *
 * Traces: TEST-CP-005, SPEC-CP-005, REQ-CP-030/031, ADR-CP-002 §3.
 */
import { describe, it, expect } from 'vitest';
import type { ShellExecPort, ShellExecRequest, ShellExecResult } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok } from '@/domain/shared/Result';
import { SHELL_EXEC_PORT } from '@/infrastructure/bridge/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _request: Equals<ShellExecRequest, { readonly command: string }> = true;
void _request;

const _result: Equals<
	ShellExecResult,
	{
		readonly command: string;
		readonly stdout: string;
		readonly stderr: string;
		readonly exitCode: number;
		readonly truncated: boolean;
		readonly notice?: string;
	}
> = true;
void _result;

const _run: Equals<
	ShellExecPort['run'],
	(request: ShellExecRequest) => Promise<Result<ShellExecResult, Error>>
> = true;
const _exact: Equals<keyof ShellExecPort, 'run'> = true;
void _run;
void _exact;

describe('ShellExecPort (TEST-CP-005)', () => {
	it('a structural impl resolves a Result<ShellExecResult>', async () => {
		const port: ShellExecPort = {
			run: async (request: ShellExecRequest) =>
				ok<ShellExecResult>({
					command: request.command,
					stdout: request.command,
					stderr: '',
					exitCode: 0,
					truncated: false,
				}),
		};
		const result = await port.run({ command: 'echo hi' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.exitCode).toBe(0);
			expect(result.value.truncated).toBe(false);
		}
	});

	it('SHELL_EXEC_PORT is a unique symbol injection key', () => {
		expect(typeof SHELL_EXEC_PORT).toBe('symbol');
		expect(SHELL_EXEC_PORT.toString()).toContain('ShellExec');
	});
});
