import { describe, it, expect, vi } from 'vitest';
import { SubmitBangBashUseCase } from '@/application/chat/composer/SubmitBangBashUseCase';
import { MockShellExec } from '@/infrastructure/mock/MockComposerPorts';
import { err } from '@/domain/shared/Result';
import type { LoggerPort, ShellExecPort, ShellExecRequest, ShellExecResult } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';

/**
 * TEST-CP-013 / TEST-CP-028 — SubmitBangBashUseCase (SPEC-CP-016/033,
 * REQ-CP-030/031/032). execute(command) calls shell.run({command}) verbatim
 * (S2 — no rewrite/augment/chain); ok(ShellExecResult) → ok(BangBashOutput); a
 * non-zero exit is ok with the code (REQ-CP-031); a spawn failure / unavailable →
 * err (EC-CP-5). The use case NEVER logs stdout/stderr content — only the command
 * + exit code may be logged (S3).
 */
function spyLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('TEST-CP-013 SubmitBangBashUseCase', () => {
	it('runs the command verbatim and maps ok(ShellExecResult) → ok(BangBashOutput)', async () => {
		const shell = new MockShellExec();
		const runSpy = vi.spyOn(shell, 'run');
		const result = await new SubmitBangBashUseCase(shell).execute('echo hi');
		expect(runSpy).toHaveBeenCalledWith({ command: 'echo hi' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			command: 'echo hi',
			stdout: 'echo hi',
			stderr: '',
			exitCode: 0,
			truncated: false,
			notice: undefined,
		});
	});

	it('returns ok with a non-zero exit code (REQ-CP-031)', async () => {
		const shell = new MockShellExec();
		shell.seed('false', {
			command: 'false',
			stdout: '',
			stderr: 'failed',
			exitCode: 1,
			truncated: false,
		});
		const result = await new SubmitBangBashUseCase(shell).execute('false');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.exitCode).toBe(1);
	});

	it('returns err when the shell run is unavailable / spawn fails (EC-CP-5)', async () => {
		const unavailable: ShellExecPort = {
			run(_req: ShellExecRequest): Promise<Result<ShellExecResult, Error>> {
				return Promise.resolve(err(new Error('shell execution is not available')));
			},
		};
		const result = await new SubmitBangBashUseCase(unavailable).execute('ls');
		expect(result.ok).toBe(false);
	});

	it('never logs stdout/stderr content (S3, TEST-CP-028)', async () => {
		const shell = new MockShellExec();
		shell.seed('echo secret', {
			command: 'echo secret',
			stdout: 'TOP_SECRET_OUTPUT',
			stderr: 'SECRET_ERR',
			exitCode: 0,
			truncated: false,
		});
		const logger = spyLogger();
		await new SubmitBangBashUseCase(shell, logger).execute('echo secret');
		for (const level of [logger.debug, logger.info, logger.warn, logger.error]) {
			for (const call of (level as ReturnType<typeof vi.fn>).mock.calls) {
				const serialised = JSON.stringify(call);
				expect(serialised).not.toContain('TOP_SECRET_OUTPUT');
				expect(serialised).not.toContain('SECRET_ERR');
			}
		}
	});
});
