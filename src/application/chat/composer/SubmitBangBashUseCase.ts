import { ok, type Result } from '@/domain/shared/Result';
import type { LoggerPort, ShellExecPort, ShellExecResult } from '@/domain/ports';

/**
 * The render-only output block for a bang-bash run (SPEC-CP-016). Mirrors
 * `ShellExecResult` — a plain DTO the UI renders (no persistence here, S5).
 */
export interface BangBashOutput {
	readonly command: string;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly truncated: boolean;
	readonly notice?: string;
}

/**
 * SubmitBangBashUseCase (SPEC-CP-016/033, REQ-CP-030/031/032). Runs EXACTLY the
 * user's command and maps the `Result` to a render-only output-block DTO.
 *
 * - **Verbatim passthrough (S2):** `shell.run({ command })` runs the command with
 *   no rewrite/augment/chain (REQ-CP-030).
 * - **Non-zero exit is ok (REQ-CP-031):** it ran; the block indicates the non-zero
 *   exit. Only a spawn failure / unavailable transport is `err` (the UI surfaces the
 *   notice, EC-CP-5).
 * - **No output in logs (S3, SPEC-CP-036):** only the command + exit code are
 *   logged — NEVER `stdout`/`stderr` content.
 *
 * The caller (`useComposerMode`) invokes `execute` ONLY on an explicit Enter — never
 * on paste/programmatic set (S1, REQ-CP-032, SPEC-CP-018). `Result`-returning
 * (ADR-004); no provider branch; no `obsidian`/`node:*`/Vue import.
 */
export class SubmitBangBashUseCase {
	constructor(
		private readonly shell: ShellExecPort,
		private readonly logger?: LoggerPort,
	) {}

	async execute(command: string): Promise<Result<BangBashOutput>> {
		const result = await this.shell.run({ command });
		if (!result.ok) {
			this.logger?.warn('bang-bash: shell run failed', { command });
			return result;
		}
		this.logger?.debug('bang-bash: command completed', {
			command,
			exitCode: result.value.exitCode,
		});
		return ok(this.toOutput(result.value));
	}

	/** Map the shell result to the render-only output DTO (no content logged here). */
	private toOutput(result: ShellExecResult): BangBashOutput {
		return {
			command: result.command,
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
			truncated: result.truncated,
			notice: result.notice,
		};
	}
}
