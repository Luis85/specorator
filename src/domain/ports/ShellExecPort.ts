import type { Result } from '@/domain/shared/Result';

/**
 * Bang-bash shell-execution port (SPEC-CP-005/008, ADR-CP-002 §3). The
 * security-bounded seam for the `!cmd` run-bash mode. The S1–S5 posture
 * (SPEC-CP-033) binds every impl: user-explicit only (never a `ChatRuntimePort`
 * member); verbatim passthrough (no rewrite/augment/chain); no plugin secret in
 * the child env or logs; bounded 30 s / 1 MB → `exitCode 124` + `truncated`;
 * the result is a render-only DTO (never persisted). No `obsidian`/Vue.
 */
export interface ShellExecRequest {
	/** EXACTLY the user's typed text (S2 — verbatim passthrough). */
	readonly command: string;
}

export interface ShellExecResult {
	readonly command: string;
	readonly stdout: string;
	readonly stderr: string;
	/** 124 = timeout / maxbuffer breach (Claudian parity). */
	readonly exitCode: number;
	/** Hit the 1 MB output cap. */
	readonly truncated: boolean;
	/** 'timed out' / 'output exceeded 1MB'. */
	readonly notice?: string;
}

export interface ShellExecPort {
	/**
	 * Run one command. Resolves a `Result`; a NON-ZERO exit is `ok(result)` (it
	 * ran), only a SPAWN failure / unavailable transport is `err` (REQ-CP-031,
	 * SPEC-CP-016).
	 */
	run(request: ShellExecRequest): Promise<Result<ShellExecResult, Error>>;
}
