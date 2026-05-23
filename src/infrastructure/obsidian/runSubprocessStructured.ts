/**
 * WP-11 — `runSubprocessStructured`: one-shot structured-output collector
 * for the subscription transport. Extracted from `ClaudeSubprocessAdapter`
 * (Arch review #11) so the streaming pipeline and the structured pipeline
 * stop sharing 200 LOC of duplicated lifecycle wiring.
 *
 * Spawns a fresh short-lived `claude` subprocess with
 * `--output-format json --json-schema '<schema>'`, buffers stdout, and
 * `JSON.parse`s the whole payload once at close. Never throws — returns
 * `Result<StructuredCliRawResult, ChatTransportError>` (ADR-004).
 *
 * Satisfies REQ-ASM-021 (structured framing), REQ-ASM-049 (one-shot
 * process), REQ-ASM-031 (session-id capture), and the §4.4 error map.
 */
import { createFileEnvelopeJsonSchema } from '@/application/chat/createFileEnvelopeSchema';
import { asSessionId, type SessionId } from '@/domain/chat/SessionId';
import {
	ChatTransportError,
	type StructuredCliCallOptions,
	type StructuredCliRawResult,
} from '@/domain/ports/ChatTransportPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import { err, ok, type Result } from '@/domain/shared/Result';
import { buildSubprocessArgs } from '@/infrastructure/obsidian/buildSubprocessArgs';
import type {
	ChildProcessLike,
	SubprocessLifecycle,
} from '@/infrastructure/obsidian/SubprocessLifecycle';

export interface RunStructuredDeps {
	readonly lifecycle: SubprocessLifecycle;
	readonly logger: LoggerPort;
	readonly clampTimeout: (raw: number | undefined) => number;
	readonly emitCompletionTelemetry: (args: {
		readonly kind: 'structured';
		readonly sessionId: SessionId | null;
		readonly startTimeMs: number;
		readonly exitCode: number | null;
	}) => void;
	/**
	 * QW-A — vault root used as the subprocess `cwd`. Optional; when absent
	 * or returning `null`, the child inherits the renderer cwd.
	 */
	readonly getCwd?: () => string | null;
}

/**
 * Entry point — guards availability, spawns, collects, parses, resolves.
 */
export async function runSubprocessStructured(
	deps: RunStructuredDeps,
	binaryPath: string | null,
	prompt: string,
	options: StructuredCliCallOptions,
): Promise<Result<StructuredCliRawResult, ChatTransportError>> {
	if (binaryPath === null) {
		return err(
			new ChatTransportError(
				'CLI_LAUNCH_FAILED',
				'Subscription transport is not available — Claude CLI binary not found',
			),
		);
	}

	const timeoutMs = deps.clampTimeout(options.timeoutMs);
	const argv = _buildStructuredArgv(prompt, options);

	const cwd = deps.getCwd?.() ?? null;
	const spawned = deps.lifecycle.spawn(binaryPath, argv, 'structured.spawn_failed', cwd);
	if (!spawned.ok) return spawned;

	return _collectStructuredStdout(deps, spawned.value, timeoutMs, options);
}

/**
 * Wire up the one-shot stdout/close/error pipeline and resolve with either
 * a parsed `StructuredCliRawResult` or a mapped `ChatTransportError`.
 */
function _collectStructuredStdout(
	deps: RunStructuredDeps,
	child: ChildProcessLike,
	timeoutMs: number,
	options: StructuredCliCallOptions,
): Promise<Result<StructuredCliRawResult, ChatTransportError>> {
	const startTimeMs = Date.now();
	let capturedSessionId: SessionId | null = null;
	let lastExitCode: number | null = null;
	return new Promise<Result<StructuredCliRawResult, ChatTransportError>>((resolve) => {
		let stdoutBuffer = '';
		let settled = false;

		const settle = (r: Result<StructuredCliRawResult, ChatTransportError>): void => {
			if (settled) return;
			settled = true;
			// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
			clearTimeout(timeoutHandle);
			deps.lifecycle.release(child);
			deps.emitCompletionTelemetry({
				kind: 'structured',
				sessionId: capturedSessionId,
				startTimeMs,
				exitCode: lastExitCode,
			});
			resolve(r);
		};

		// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
		const timeoutHandle = setTimeout(() => {
			if (settled) return;
			deps.lifecycle.kill(child);
			settle(err(new ChatTransportError('TIMEOUT', `Structured query exceeded ${timeoutMs} ms`)));
		}, timeoutMs);

		// Stdout is small and bounded — the structured path emits a single
		// JSON object once, so buffer-and-parse-at-close is simpler and avoids
		// the NDJSON state machine.
		if (child.stdout !== null) {
			child.stdout.on('data', (chunk: Buffer | string) => {
				stdoutBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
			});
		}

		child.on('error', (errArg: unknown) => {
			const code = (errArg as NodeJS.ErrnoException | undefined)?.code;
			deps.logger.warn('subscription.structured.child_error', {
				transport: 'subscription',
				event: 'structured.child_error',
				code: code ?? null,
			});
			settle(
				err(
					new ChatTransportError(
						'CLI_LAUNCH_FAILED',
						'Claude CLI subprocess emitted error before completion',
						errArg,
					),
				),
			);
		});

		child.on('close', (...args: unknown[]) => {
			if (settled) return;
			const exitCode = typeof args[0] === 'number' ? args[0] : null;
			lastExitCode = exitCode;
			const parsed = _parseStructuredStdout(deps, stdoutBuffer, exitCode);
			// REQ-ASM-031 / REQ-ASM-046 — surface `session_id` to the caller so
			// the structured branch can capture it on the active thread before
			// the promise resolves. Best-effort: an `options.onSessionId`
			// callback throwing must not derail the structured result.
			if (parsed.ok) {
				const sid = _extractStructuredSessionId(stdoutBuffer);
				if (sid !== null) {
					capturedSessionId = sid;
					if (options.onSessionId !== undefined) {
						try {
							options.onSessionId(sid);
						} catch {
							// NFR-ASM-005 — never log the session id. Callback
							// failures must not tear down the structured turn.
						}
					}
				}
			}
			settle(parsed);
		});
	});
}

/**
 * Re-parse the structured stdout to extract the top-level `session_id` field
 * for the REQ-ASM-031 capture callback. Returns `null` when absent or
 * non-string. Tolerant — `_parseStructuredStdout` has already resolved
 * success status.
 */
function _extractStructuredSessionId(stdoutBuffer: string): SessionId | null {
	const trimmed = stdoutBuffer.trim();
	if (trimmed.length === 0) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== 'object') return null;
	const record = parsed as Record<string, unknown>;
	const sid = record.session_id;
	if (typeof sid !== 'string' || sid.length === 0) return null;
	return asSessionId(sid);
}

/**
 * Map the buffered stdout + exit code to either a parsed
 * `StructuredCliRawResult` or the appropriate `ChatTransportError`. Pure helper.
 */
function _parseStructuredStdout(
	deps: RunStructuredDeps,
	stdoutBuffer: string,
	exitCode: number | null,
): Result<StructuredCliRawResult, ChatTransportError> {
	if (exitCode !== null && exitCode !== 0) {
		return err(
			new ChatTransportError('QUERY_FAILED', `Claude CLI subprocess exited with code ${exitCode}`),
		);
	}

	const trimmed = stdoutBuffer.trim();
	if (trimmed.length === 0) {
		return err(
			new ChatTransportError('QUERY_FAILED', 'Claude CLI produced no stdout for structured query'),
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch (e: unknown) {
		// SPEC §4.4 — JSON.parse failure on structured stdout → QUERY_FAILED.
		// Never log the stdout body (NFR-ASM-005 / NFR-ASM-012).
		deps.logger.warn('subscription.structured.stdout_invalid_json', {
			transport: 'subscription',
			event: 'structured.stdout_invalid_json',
		});
		return err(
			new ChatTransportError(
				'QUERY_FAILED',
				'Claude CLI produced unparseable JSON for structured query',
				e,
			),
		);
	}

	if (parsed === null || typeof parsed !== 'object') {
		return err(
			new ChatTransportError('QUERY_FAILED', 'Claude CLI structured stdout was not a JSON object'),
		);
	}

	const record = parsed as Record<string, unknown>;
	const resultField = typeof record.result === 'string' ? record.result : '';
	return ok({
		result: resultField,
		structured_output: record.structured_output,
	});
}

/**
 * Build the argv vector for a `runStructured()` invocation. Delegates to
 * the canonical `buildSubprocessArgs` (INV-1…INV-6); the structured-output
 * framing is selected by passing a non-null `jsonSchema`.
 */
function _buildStructuredArgv(
	prompt: string,
	options: StructuredCliCallOptions,
): readonly string[] {
	const resume =
		typeof options.resumeSessionId === 'string' && options.resumeSessionId.length > 0
			? options.resumeSessionId
			: null;
	return buildSubprocessArgs({
		prompt,
		systemPromptSuffix: options.systemPromptSuffix ?? '',
		resumeSessionId: resume,
		jsonSchema: createFileEnvelopeJsonSchema,
	});
}
