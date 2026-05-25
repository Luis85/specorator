import { exec, type ExecException } from 'node:child_process';
import { delimiter as PATH_DELIMITER } from 'node:path';

import type {
	ShellExecPort,
	ShellExecRequest,
	ShellExecResult,
	LoggerPort,
} from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 1_048_576; // 1 MB
const TIMEOUT_EXIT_CODE = 124;

/**
 * Obsidian `ShellExecPort` (SPEC-CP-008/033, coverage-excluded — manual leg
 * TEST-CP-M2). **The sole real shell-execution path in the plugin** and the only
 * `node:*` shell import outside the existing CLI runtime (S1). Wraps node
 * `child_process.exec` with the Claudian `BangBashService` options.
 *
 * Security posture (S1–S5, SPEC-CP-033):
 * - **S1** user-explicit only — invoked solely from the explicit-Enter bang-bash
 *   branch (SPEC-CP-018); NEVER a `ChatRuntimePort` member, never model-reachable.
 * - **S2** verbatim passthrough — `request.command` runs exactly as typed (no
 *   prefix/suffix/augment/chain).
 * - **S3** no plugin secret in the child env (enhanced PATH only) and no
 *   `stdout`/`stderr` content logged — only `command` + `exitCode`.
 * - **S4** bounded `timeout: 30 s` + `maxBuffer: 1 MB`; a breach -> `ok({exitCode:
 *   124, truncated: true, notice})` (never unbounded, never a throw across the port).
 * - **S5** the result is a render-only DTO (no persistence here).
 *
 * cwd = the vault adapter base path (resolved by the bridge via
 * `FileSystemAdapter.getBasePath()`); a non-FS adapter (mobile) -> `err`. `run`
 * resolves `ok(ShellExecResult)` for any completed run (incl. non-zero exit);
 * only a spawn failure -> `err`.
 */
export class ObsidianShellExec implements ShellExecPort {
	constructor(
		private readonly getVaultBasePath: () => string | null,
		private readonly logger?: LoggerPort,
	) {}

	run(request: ShellExecRequest): Promise<Result<ShellExecResult, Error>> {
		const cwd = this.getVaultBasePath();
		if (cwd === null) {
			// Non-FileSystemAdapter (e.g. mobile) — honest degrade (parity browser-unavailable).
			return Promise.resolve(err(new Error('shell execution is not available on this platform')));
		}
		const command = request.command; // S2: verbatim, no rewrite/augment/chain.
		return new Promise((resolve) => {
			exec(
				command,
				{
					cwd,
					env: { ...process.env, PATH: this._enhancedPath() }, // S3: no plugin secret injected
					timeout: TIMEOUT_MS,
					maxBuffer: MAX_BUFFER,
					shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
				},
				(error: ExecException | null, stdout: string, stderr: string) => {
					const result = this._toResult(command, error, stdout, stderr);
					// S3: log only the command + exit code — NEVER stdout/stderr content.
					this.logger?.debug('bang-bash.run', { command, exitCode: result.exitCode });
					resolve(ok(result));
				},
			);
		});
	}

	/**
	 * Map the exec callback to a `ShellExecResult`. A timeout / maxbuffer breach
	 * (the error is `killed` / `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`) -> `exitCode
	 * 124` + `truncated: true` + a notice (S4). A normal non-zero exit keeps its
	 * code. Only a spawn failure would reject the exec — handled by the caller's
	 * `err` path (the `error` here is a completed-run error, surfaced as a code).
	 */
	private _toResult(
		command: string,
		error: ExecException | null,
		stdout: string,
		stderr: string,
	): ShellExecResult {
		if (error !== null && error.killed === true) {
			return {
				command,
				stdout,
				stderr,
				exitCode: TIMEOUT_EXIT_CODE,
				truncated: true,
				notice: boundsBreachNotice(error),
			};
		}
		return { command, stdout, stderr, exitCode: completedExitCode(error), truncated: false };
	}

	/**
	 * Build an enhanced PATH so a GUI-launched Obsidian (sparse PATH on macOS/Linux)
	 * can still find user-installed tools. NO plugin secret is injected (S3) —
	 * mirrors `ClaudeCliChatRuntime._buildEnv`.
	 */
	private _enhancedPath(): string {
		const extra = ['/usr/local/bin', '/opt/homebrew/bin', `${process.env.HOME ?? ''}/.local/bin`];
		const current = process.env.PATH ?? '';
		return [current, ...extra].filter((p) => p.length > 0).join(PATH_DELIMITER);
	}
}

/** The bounds-breach notice for a killed child (maxbuffer vs timeout, S4). */
function boundsBreachNotice(error: ExecException): string {
	const isMaxBuffer = (error.code as unknown) === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
	return isMaxBuffer ? 'output exceeded 1MB' : `command timed out after ${TIMEOUT_MS / 1000}s`;
}

/** The exit code of a completed run: the numeric code, else 1 on error, else 0. */
function completedExitCode(error: ExecException | null): number {
	if (error === null) return 0;
	return typeof error.code === 'number' ? error.code : 1;
}
