/**
 * T-ASM-011 — `ClaudeSubprocessAdapter`: subscription-transport implementation of
 * `ClaudeCliPort` driving the user-installed `claude` binary as a short-lived
 * child process per turn. Multi-turn continuity is achieved by forwarding
 * `--resume <sessionId>` argv (REQ-ASM-035) supplied by the caller, NOT by
 * reusing a long-lived process across turns.
 *
 * Why short-lived (Codex P1 fix, PR #325 review):
 *   `claude -p '<prompt>'` is a one-shot invocation — the prompt is baked into
 *   argv and the subprocess exits after responding. Reusing a single child
 *   across turns means turn 2/3/... prompts never reach the subprocess (no one
 *   writes them to stdin), so multi-turn conversations silently drop user input.
 *   The fix is to spawn a fresh child per `query()` call and let the caller
 *   thread `resumeSessionId` from the prior turn's response back into the next
 *   turn's `ClaudeCliQueryOptions`. Session-id ownership lives in chatStore /
 *   PR-ASM-3 session persistence — this adapter is stateless wrt threads.
 *
 * Satisfies:
 *   - REQ-ASM-001 (transport-agnostic port construction; no I/O in ctor)
 *   - REQ-ASM-006/027/028 (argv invariants delegated to `buildSubprocessArgs`)
 *   - REQ-ASM-009 (graceful degradation when the binary cannot be found)
 *   - REQ-ASM-010 (one subprocess per turn; multi-turn via --resume chaining —
 *     see Codex P1 note above; original "one spawn per thread, reused across
 *     turns" reading of REQ-ASM-010 was incompatible with `claude -p` semantics)
 *   - REQ-ASM-013 (forward `--append-system-prompt` via argv)
 *   - REQ-ASM-029 (chunked stdout reassembled via `readline`)
 *   - REQ-ASM-030 (non-zero exit / `is_error: true` → QUERY_FAILED)
 *   - REQ-ASM-031 (capture `session_id` from `system/init`)
 *   - REQ-ASM-035 (forward `--resume <sessionId>` via argv — load-bearing for
 *     multi-turn after the Codex P1 fix)
 *   - NFR-ASM-004 (never touches `~/.claude/`)
 *   - NFR-ASM-005, NFR-ASM-012 (log redaction; no prompt, binary path, or $HOME)
 *   - NFR-ASM-006 (startup never throws)
 *
 * Spec reference: SPEC-ASM-001 §4 (class outline, method table, helpers,
 *                 error map, long-lived vs. short-lived process discipline).
 * Design ref:     design.md §C6 / §C7.
 *
 * ToS posture (NFR-ASM-004, ADR-0031): this class never reads, opens, copies,
 * transmits, persists, or watches `~/.claude/.credentials.json` or any file
 * under the user's home Claude directory. The only interaction is that the
 * spawned `claude` binary, executing under the user's own UID, may read its
 * own credentials. The string literal for that directory is INTENTIONALLY
 * absent from this file; lint enforcement lives in T-ASM-049.
 *
 * `runStructured` is reached through the application-layer `queryStructured()`
 * wrapper. WP-12 (Arch review #3) folded `runStructured` onto `ClaudeCliPort`
 * itself as an *optional* method — the application layer narrows via
 * `typeof port.runStructured === 'function'`, and the SDK adapter simply
 * does not implement it.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process';

import { createFileEnvelopeJsonSchema } from '@/application/chat/createFileEnvelopeSchema';
import {
	StreamDeltaReducer,
	type RawClaudeEvent,
	type RawStreamEventInner,
} from '@/application/chat/StreamDeltaReducer';
import {
	ClaudeCliError,
	type ClaudeCliPort,
	type ClaudeCliStreamOptions,
	type StreamDelta,
	type StructuredCliCallOptions,
	type StructuredCliRawResult,
} from '@/domain/ports/ClaudeCliPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import type { TransportLifecyclePort } from '@/domain/ports/TransportLifecyclePort';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { asSessionId, type SessionId } from '@/domain/chat/SessionId';
import { err, ok, type Result } from '@/domain/shared/Result';
import { buildSubprocessArgs } from '@/infrastructure/obsidian/buildSubprocessArgs';

// -----------------------------------------------------------------------------
// Minimal child-process surface — kept loose so the tests' EventEmitter-based
// fake satisfies it without coercion to the full `ChildProcess` type.
// -----------------------------------------------------------------------------
interface ChildProcessLike {
	readonly stdout: NodeJS.EventEmitter | null;
	readonly stderr: NodeJS.EventEmitter | null;
	readonly stdin?: { write: (chunk: string) => unknown; end: () => unknown } | null;
	kill: (signal?: number | string) => unknown;
	on(event: string, listener: (...args: unknown[]) => void): unknown;
	once?(event: string, listener: (...args: unknown[]) => void): unknown;
	removeAllListeners?(event?: string): unknown;
	killed?: boolean;
	exitCode?: number | null;
}

/** Injectable spawn signature — structurally compatible with `child_process.spawn`. */
export type SpawnFn = (
	command: string,
	args: readonly string[],
	options?: SpawnOptions,
) => ChildProcess;

export interface ClaudeSubprocessAdapterDeps {
	readonly getSettings: () => PluginSettings;
	readonly logger: LoggerPort;
	readonly resolveCliPath: () => Promise<string | null>;
	readonly spawn: SpawnFn;
	readonly now?: () => number;
}

/** SPEC §4.3 `_clampTimeout` floor / ceiling. */
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/** SPEC §4.3 `_kill` SIGTERM → SIGKILL grace window. */
const SIGKILL_GRACE_MS = 200;

// -----------------------------------------------------------------------------
// Push-channel — drives the streaming `queryStream` async iterable from the
// event-emitter-style stdout pump on the child process. Buffers deltas pushed
// before a consumer is iterating; surfaces the terminal-complete signal as the
// iterator's `done: true`. Single-producer/single-consumer; ordering is
// preserved.
// -----------------------------------------------------------------------------
interface PushChannel<T> {
	push: (delta: T) => void;
	complete: () => void;
	iterate: () => AsyncIterable<T>;
}

function createPushChannel<T>(): PushChannel<T> {
	const buffer: T[] = [];
	let completed = false;
	let waiting: ((r: IteratorResult<T>) => void) | null = null;

	const push = (delta: T): void => {
		if (completed) return;
		if (waiting !== null) {
			const resume = waiting;
			waiting = null;
			resume({ value: delta, done: false });
			return;
		}
		buffer.push(delta);
	};

	const complete = (): void => {
		if (completed) return;
		completed = true;
		if (waiting !== null) {
			const resume = waiting;
			waiting = null;
			resume({ value: undefined, done: true });
		}
	};

	const iterate = (): AsyncIterable<T> => ({
		[Symbol.asyncIterator](): AsyncIterator<T> {
			return {
				next(): Promise<IteratorResult<T>> {
					if (buffer.length > 0) {
						const value = buffer.shift() as T;
						return Promise.resolve({ value, done: false });
					}
					if (completed) {
						return Promise.resolve({ value: undefined, done: true });
					}
					return new Promise<IteratorResult<T>>((resolve) => {
						waiting = resolve;
					});
				},
			};
		},
	});

	return { push, complete, iterate };
}

// -----------------------------------------------------------------------------
// Per-turn streaming-process record. One entry per spawn — short-lived; the
// child exits as soon as the `result` event arrives (or on error / timeout).
//
// The wire→`StreamDelta` translation lives in `StreamDeltaReducer` (ADR-0034).
// This struct only carries the per-spawn glue: the spawned child, its stdout
// buffer, the per-turn reducer, the push channel that feeds the iterable, and
// the optional `onSessionId` single-fire callback.
// -----------------------------------------------------------------------------
interface TurnProc {
	readonly child: ChildProcessLike;
	/** Stdout chunk buffer for line-based NDJSON reassembly (REQ-ASM-029). */
	stdoutBuffer: string;
	/** Per-stream codec — owns blockId / messageSeq / usage merge / dedup. */
	readonly reducer: StreamDeltaReducer;
	/** Push channel — each delta emitted by the reducer goes here. */
	readonly channel: PushChannel<StreamDelta>;
	/** Most recently captured session id from a `system/init` event. */
	sessionId: SessionId | null;
	/**
	 * Optional caller-supplied callback invoked exactly once when the first
	 * non-empty `session_id` arrives in a `system/init` event (REQ-ASM-031).
	 * Nulled out after the first invocation to enforce the single-fire contract.
	 */
	onSessionId: ((sessionId: SessionId) => void) | null;
	/** Monotonic clock at spawn time — used for completion-telemetry durationMs (T-ASM-081). */
	startTimeMs: number;
}

/**
 * Implementation note (REQ-ASM-001, REQ-ASM-009, REQ-ASM-010).
 *
 * `kind` is intentionally declared so `selectTransport` can identify this
 * adapter structurally without an `instanceof` check that would force a
 * domain ⇄ infrastructure import. Subscription-capability narrowing in the
 * application layer (`queryStructured()`) keys off the presence of
 * `runStructured` rather than `kind` — see WP-12 (Arch review #3).
 *
 * Also implements `TransportLifecyclePort` (`startup` / `shutdown`) — split
 * off `ClaudeCliPort` in WP-12 so the per-turn streaming surface stays
 * narrow per ADR-008 *responsibility* spirit.
 */
export class ClaudeSubprocessAdapter implements ClaudeCliPort, TransportLifecyclePort {
	public readonly kind = 'subscription' as const;

	// Internal state — all I/O-free at construction time.
	private _available = false;
	private _startupCompleted = false;
	private _binaryPath: string | null = null;
	private _shutdownCalled = false;
	/**
	 * The `settings.claudeCliPath` value used for the most recent resolve. We
	 * re-run `startup()` whenever this differs from the current setting so a
	 * user who configures the CLI path AFTER first load isn't stuck on
	 * `_available = false` until plugin reload (Codex P1).
	 */
	private _lastResolvedClaudeCliPath: string | null = null;
	/**
	 * In-flight short-lived children. We track them only so `shutdown()` can
	 * SIGTERM any subprocess mid-response. On clean close / error / timeout the
	 * child removes itself from this set.
	 */
	private readonly _activeChildren = new Set<ChildProcessLike>();

	private readonly _getSettings: () => PluginSettings;
	private readonly _logger: LoggerPort;
	private readonly _resolveCliPath: () => Promise<string | null>;
	private readonly _spawn: SpawnFn;
	/** Injectable clock — currently unused; reserved for T-ASM-038 latency telemetry. */
	// @ts-expect-error TS6133: reserved for telemetry hooks landing in T-ASM-038.
	private readonly _now: () => number;

	constructor(deps: ClaudeSubprocessAdapterDeps) {
		// REQ-ASM-001 / NFR-ASM-006 — store deps only; never touch the filesystem
		// or PATH from the constructor. All discovery is deferred to startup().
		this._getSettings = deps.getSettings;
		this._logger = deps.logger;
		this._resolveCliPath = deps.resolveCliPath;
		this._spawn = deps.spawn;
		this._now = deps.now ?? Date.now;
	}

	// ── Lifecycle ────────────────────────────────────────────────────────────

	/**
	 * Resolve the binary path and cache it. Idempotent on identical input —
	 * subsequent calls re-run only if `settings.claudeCliPath` has changed
	 * since the last successful resolve. Without this, a user who configures
	 * the CLI path AFTER first plugin load would have `_available === false`
	 * for the rest of the session (Codex P1, PR-ASM-1 review).
	 *
	 * Never throws — any resolver failure degrades to `_available = false`.
	 * Satisfies REQ-ASM-009, NFR-ASM-006.
	 */
	async startup(): Promise<void> {
		const settings = this._getSettings();
		// Short-circuit if we've already resolved against the current setting
		// value. `_lastResolvedClaudeCliPath` is null sentinel for "never resolved".
		if (this._startupCompleted && this._lastResolvedClaudeCliPath === settings.claudeCliPath) {
			return;
		}
		this._startupCompleted = true;
		this._lastResolvedClaudeCliPath = settings.claudeCliPath;

		// Precedence: explicit settings path wins; otherwise call the injected
		// resolver. Empty string == "not configured".
		const explicit = settings.claudeCliPath.trim();

		if (explicit.length > 0) {
			this._binaryPath = explicit;
		} else {
			try {
				this._binaryPath = await this._resolveCliPath();
			} catch (e: unknown) {
				// NFR-ASM-006 — graceful degradation. Log without leaking PATH info.
				this._logger.warn('subscription.startup.resolver_failed', {
					transport: 'subscription',
					event: 'startup.resolver_failed',
				});
				void e;
				this._binaryPath = null;
			}
		}

		this._available = this._binaryPath !== null;

		if (!this._available) {
			this._logger.warn('subscription.startup.binary_not_found', {
				transport: 'subscription',
				event: 'startup.binary_not_found',
			});
		}
	}

	/** REQ-ASM-009 — never throws. */
	async isAvailable(): Promise<boolean> {
		return this._available && this._binaryPath !== null;
	}

	/**
	 * Class-only synchronous accessor (SPEC §4.2). Returns the cached
	 * `_available` flag without any I/O — used by `selectTransport()` at
	 * view-registration time where awaiting is not possible.
	 */
	isAvailableSync(): boolean {
		return this._available;
	}

	/**
	 * Synchronous SIGTERM ladder over every in-flight short-lived child.
	 * Idempotent and safe to call before `startup()`. Never throws.
	 * REQ-CCS-017 family.
	 */
	shutdown(): void {
		if (this._shutdownCalled) return;
		this._shutdownCalled = true;

		for (const child of this._activeChildren) {
			this._killChild(child);
		}
		this._activeChildren.clear();

		this._available = false;
	}

	/**
	 * Streaming variant of `query()` (IDEA-ASV-001 Increment 2, PR-ASV-2-subproc).
	 *
	 * Yields each `assistant/message` event as a `text` delta as it arrives off
	 * stdout, the first `system/init` event as a `session-id` delta, and the
	 * final `result` event as either `done` (`is_error: false`) or `error`
	 * (`is_error: true`). Subprocess spawn failures, non-zero exits, timeouts,
	 * and caller-driven abort all surface as a terminal `error` delta — never
	 * throws.
	 *
	 * Honours `options.signal`:
	 *   - pre-aborted → short-circuits to a single `error` delta without spawning;
	 *   - mid-flight abort → SIGTERMs the child (SIGKILL @ 200ms ladder) and
	 *     emits the terminal `error` delta;
	 *   - the listener-after-pre-flight race window is closed by an explicit
	 *     re-check of `signal.aborted` after `addEventListener` (Codex P2).
	 */
	queryStream(prompt: string, options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta> {
		return this._runStream(prompt, options);
	}

	// ── runStructured() — one-shot structured one-shot path ──────────────────

	/**
	 * Structured-output one-shot. Spawns a fresh short-lived `claude` subprocess
	 * with `--output-format json --json-schema '<schema>'` (INV-4), collects the
	 * entire stdout to a buffer, `JSON.parse`s it once at close, and returns
	 * `{ result, structured_output }`. Never registered as a "streaming" child
	 * (REQ-ASM-049), but tracked in `_activeChildren` so `shutdown()` can
	 * SIGTERM mid-call.
	 *
	 * Never throws. Returns Result<StructuredCliRawResult, ClaudeCliError>; the
	 * envelope parser runs in the application-layer `queryStructured()`
	 * wrapper, which is the only caller.
	 *
	 * Satisfies REQ-ASM-021 (structured framing), REQ-ASM-049 (one-shot
	 * process), and the §4.4 error map (`JSON.parse` failure → QUERY_FAILED;
	 * non-zero exit → QUERY_FAILED).
	 */
	async runStructured(
		prompt: string,
		options: StructuredCliCallOptions,
	): Promise<Result<StructuredCliRawResult, ClaudeCliError>> {
		if (!this._available || this._binaryPath === null) {
			return err(
				new ClaudeCliError(
					'CLI_LAUNCH_FAILED',
					'Subscription transport is not available — Claude CLI binary not found',
				),
			);
		}

		const timeoutMs = this._clampTimeout(options.timeoutMs);
		const argv = this._buildStructuredArgv(prompt, options);

		let child: ChildProcess;
		try {
			child = this._spawn(this._binaryPath, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
		} catch (e: unknown) {
			const code = (e as NodeJS.ErrnoException | undefined)?.code;
			this._logger.warn('subscription.structured.spawn_failed', {
				transport: 'subscription',
				event: 'structured.spawn_failed',
				code: code ?? null,
			});
			return err(
				new ClaudeCliError(
					'CLI_LAUNCH_FAILED',
					'Failed to spawn Claude CLI subprocess for structured output',
					e,
				),
			);
		}

		const childLike = child as unknown as ChildProcessLike;
		if (childLike.stdout === null) {
			return err(
				new ClaudeCliError('CLI_LAUNCH_FAILED', 'Spawned Claude CLI subprocess has no stdout'),
			);
		}

		this._activeChildren.add(childLike);
		return this._collectStructuredStdout(childLike, timeoutMs, options);
	}

	/**
	 * Wire up the one-shot stdout/close/error pipeline and resolve with either
	 * a parsed `StructuredCliRawResult` or a mapped `ClaudeCliError`. Extracted
	 * from `runStructured` to keep cyclomatic complexity below the lint
	 * threshold.
	 */
	private _collectStructuredStdout(
		child: ChildProcessLike,
		timeoutMs: number,
		options: StructuredCliCallOptions,
	): Promise<Result<StructuredCliRawResult, ClaudeCliError>> {
		const startTimeMs = Date.now();
		let capturedSessionId: SessionId | null = null;
		let lastExitCode: number | null = null;
		return new Promise<Result<StructuredCliRawResult, ClaudeCliError>>((resolve) => {
			let stdoutBuffer = '';
			let settled = false;

			const settle = (r: Result<StructuredCliRawResult, ClaudeCliError>): void => {
				if (settled) return;
				settled = true;
				// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
				clearTimeout(timeoutHandle);
				this._activeChildren.delete(child);
				this._emitCompletionTelemetry({
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
				this._killChild(child);
				settle(err(new ClaudeCliError('TIMEOUT', `Structured query exceeded ${timeoutMs} ms`)));
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
				this._logger.warn('subscription.structured.child_error', {
					transport: 'subscription',
					event: 'structured.child_error',
					code: code ?? null,
				});
				settle(
					err(
						new ClaudeCliError(
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
				const parsed = this._parseStructuredStdout(stdoutBuffer, exitCode);
				// REQ-ASM-031 / REQ-ASM-046 — surface `session_id` to the caller so the
				// structured branch can capture it on the active thread before the
				// promise resolves. Best-effort: an `options.onSessionId` callback
				// throwing must not derail the structured result.
				if (parsed.ok) {
					const sid = this._extractStructuredSessionId(stdoutBuffer);
					if (sid !== null) {
						capturedSessionId = sid;
						if (options.onSessionId !== undefined) {
							try {
								options.onSessionId(sid);
							} catch {
								// NFR-ASM-005 — never log the session id. Callback failures must
								// not tear down the structured turn; suppressed silently here
								// (a misbehaving caller cannot be observed by this adapter).
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
	 * for the REQ-ASM-031 capture callback. Returns `null` when the field is
	 * absent or non-string. Kept tolerant — `_parseStructuredStdout` has already
	 * resolved success status; this method only adds the capture side-effect.
	 */
	private _extractStructuredSessionId(stdoutBuffer: string): SessionId | null {
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
	 * `StructuredCliRawResult` or the appropriate `ClaudeCliError`. Pure helper —
	 * no I/O.
	 */
	private _parseStructuredStdout(
		stdoutBuffer: string,
		exitCode: number | null,
	): Result<StructuredCliRawResult, ClaudeCliError> {
		if (exitCode !== null && exitCode !== 0) {
			return err(
				new ClaudeCliError('QUERY_FAILED', `Claude CLI subprocess exited with code ${exitCode}`),
			);
		}

		const trimmed = stdoutBuffer.trim();
		if (trimmed.length === 0) {
			return err(
				new ClaudeCliError('QUERY_FAILED', 'Claude CLI produced no stdout for structured query'),
			);
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch (e: unknown) {
			// SPEC §4.4 — JSON.parse failure on structured stdout → QUERY_FAILED.
			// Never log the stdout body (NFR-ASM-005 / NFR-ASM-012).
			this._logger.warn('subscription.structured.stdout_invalid_json', {
				transport: 'subscription',
				event: 'structured.stdout_invalid_json',
			});
			return err(
				new ClaudeCliError(
					'QUERY_FAILED',
					'Claude CLI produced unparseable JSON for structured query',
					e,
				),
			);
		}

		if (parsed === null || typeof parsed !== 'object') {
			return err(
				new ClaudeCliError('QUERY_FAILED', 'Claude CLI structured stdout was not a JSON object'),
			);
		}

		const record = parsed as Record<string, unknown>;
		const resultField = typeof record.result === 'string' ? record.result : '';
		// Pass `structured_output` through verbatim — the application-layer
		// parser owns the Zod validation. Missing field is fine; the parser
		// falls back to the brace-depth scan of `.result`.
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
	private _buildStructuredArgv(
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

	// ── Streaming pipeline ───────────────────────────────────────────────────

	/**
	 * Orchestrator for `queryStream`: handles availability + pre-abort
	 * preflight, builds argv, spawns the child, wires the abort/timeout
	 * listeners, and delegates the actual iteration to a push-channel-driven
	 * consumer.
	 */
	private async *_runStream(
		prompt: string,
		options?: ClaudeCliStreamOptions,
	): AsyncIterable<StreamDelta> {
		const pre = this._preflightStream(options);
		if (pre !== null) {
			yield pre;
			return;
		}

		const channel = createPushChannel<StreamDelta>();
		const reducer = new StreamDeltaReducer({
			turnId: ClaudeSubprocessAdapter._randomTurnId(),
		});
		const argv = this._buildArgv(prompt, options);

		// _preflightStream above guarantees _binaryPath !== null here.
		const spawned = this._spawnChild(
			this._binaryPath!,
			argv,
			options?.onSessionId ?? null,
			reducer,
			channel,
		);
		if (!spawned.ok) {
			yield { type: 'error', error: spawned.error };
			return;
		}
		const proc = spawned.value;

		const timeoutMs = this._clampTimeout(options?.timeoutMs);
		const timeoutHandle = this._installStreamTimeout(proc, timeoutMs);
		const detachAbort = this._installStreamAbort(proc, options?.signal);

		try {
			yield* channel.iterate();
		} finally {
			// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
			clearTimeout(timeoutHandle);
			detachAbort();
			if (!proc.reducer.terminated) {
				this._killChild(proc.child);
				this._activeChildren.delete(proc.child);
				channel.complete();
			}
		}
	}

	/**
	 * Synchronous pre-flight gate for `queryStream`. Returns a terminal error
	 * delta when the adapter is unavailable or the signal is already aborted,
	 * or `null` to proceed with the spawn.
	 */
	private _preflightStream(options: ClaudeCliStreamOptions | undefined): StreamDelta | null {
		if (!this._available || this._binaryPath === null) {
			return {
				type: 'error',
				error: new ClaudeCliError(
					'CLI_LAUNCH_FAILED',
					'Subscription transport is not available — Claude CLI binary not found',
				),
			};
		}
		if (options?.signal?.aborted === true) {
			return {
				type: 'error',
				error: new ClaudeCliError('QUERY_FAILED', 'Request was aborted before send'),
			};
		}
		return null;
	}

	/**
	 * Install the per-turn timeout. On expiry the child is SIGTERMed and the
	 * reducer emits a terminal `TIMEOUT` error through `_emitTerminalError`.
	 * Returns the timeout handle so the caller can `clearTimeout` once the
	 * stream completes normally.
	 */
	private _installStreamTimeout(
		proc: TurnProc,
		timeoutMs: number,
	): ReturnType<typeof setTimeout> {
		// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
		return setTimeout(() => {
			if (proc.reducer.terminated) return;
			this._killChild(proc.child);
			this._emitTerminalError(
				proc,
				new ClaudeCliError('TIMEOUT', `Subscription query exceeded ${timeoutMs} ms`),
			);
		}, timeoutMs);
	}

	/**
	 * Wire the caller's abort signal: SIGTERMs the child and emits the
	 * terminal `error` delta. Codex P2: re-check `aborted` AFTER attaching the
	 * listener because `AbortSignal` does not replay events. Returns a detach
	 * function safe to call from the orchestrator's `finally` block.
	 */
	private _installStreamAbort(
		proc: TurnProc,
		signal: AbortSignal | undefined,
	): () => void {
		const onAbort = (): void => {
			if (proc.reducer.terminated) return;
			this._killChild(proc.child);
			this._emitTerminalError(
				proc,
				new ClaudeCliError('QUERY_FAILED', 'Request was aborted'),
			);
		};
		if (signal === undefined) return () => undefined;
		signal.addEventListener('abort', onAbort, { once: true });
		if (signal.aborted) onAbort();
		return () => {
			signal.removeEventListener('abort', onAbort);
		};
	}

	// ── Private helpers ──────────────────────────────────────────────────────

	/** Build the argv vector for a `query()` invocation. Extracted for complexity. */
	private _buildArgv(
		prompt: string,
		options: ClaudeCliStreamOptions | undefined,
	): readonly string[] {
		const resume =
			typeof options?.resumeSessionId === 'string' && options.resumeSessionId.length > 0
				? options.resumeSessionId
				: null;
		return buildSubprocessArgs({
			prompt,
			systemPromptSuffix: options?.systemPromptSuffix ?? '',
			resumeSessionId: resume,
			jsonSchema: null,
		});
	}

	/**
	 * Spawn the child and wire up readline + lifecycle listeners. Synchronous
	 * throws (ENOENT) → err({ CLI_LAUNCH_FAILED }). Async `error` events that
	 * fire before a terminal delta become a reducer error delta. NDJSON
	 * events are translated to `RawClaudeEvent`s and handed to the reducer;
	 * every delta the reducer returns is pushed into the channel.
	 */
	private _spawnChild(
		binaryPath: string,
		argv: readonly string[],
		onSessionId: ((sessionId: SessionId) => void) | null,
		reducer: StreamDeltaReducer,
		channel: PushChannel<StreamDelta>,
	): Result<TurnProc, ClaudeCliError> {
		let child: ChildProcess;
		try {
			child = this._spawn(binaryPath, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
		} catch (e: unknown) {
			// NFR-ASM-005 — never log the binary path. Capture only the error code.
			const code = (e as NodeJS.ErrnoException | undefined)?.code;
			this._logger.warn('subscription.spawn.failed', {
				transport: 'subscription',
				event: 'spawn.failed',
				code: code ?? null,
			});
			return err(
				new ClaudeCliError('CLI_LAUNCH_FAILED', 'Failed to spawn Claude CLI subprocess', e),
			);
		}

		const childLike = child as unknown as ChildProcessLike;
		if (childLike.stdout === null) {
			// Defensive: spawn returned without a stdout stream. Treat as launch fail.
			return err(
				new ClaudeCliError('CLI_LAUNCH_FAILED', 'Spawned Claude CLI subprocess has no stdout'),
			);
		}

		const proc: TurnProc = {
			child: childLike,
			stdoutBuffer: '',
			reducer,
			channel,
			sessionId: null,
			onSessionId,
			startTimeMs: Date.now(),
		};

		this._activeChildren.add(childLike);
		this._wireChildListeners(proc);

		return ok(proc);
	}

	/**
	 * Wire stdout / error / close listeners onto the spawned child. Extracted
	 * from `_spawnChild` to keep its cyclomatic complexity below the lint cap.
	 */
	private _wireChildListeners(proc: TurnProc): void {
		const childLike = proc.child;
		const stdout = childLike.stdout;
		if (stdout !== null) {
			// Manual line-based NDJSON reassembly (REQ-ASM-029). The streaming
			// surface our tests inject (and what Obsidian's plugin host hands us
			// in some packaging modes) is a plain EventEmitter without the
			// `.pause/.resume` methods readline requires. Buffer-and-split keeps
			// the semantics identical: chunks split mid-line are concatenated,
			// then any complete `\n`-terminated lines are dispatched in order.
			stdout.on('data', (chunk: Buffer | string) => {
				const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
				proc.stdoutBuffer += text;
				let newlineIdx = proc.stdoutBuffer.indexOf('\n');
				while (newlineIdx !== -1) {
					const line = proc.stdoutBuffer.slice(0, newlineIdx);
					proc.stdoutBuffer = proc.stdoutBuffer.slice(newlineIdx + 1);
					this._handleNdjsonLine(proc, line);
					newlineIdx = proc.stdoutBuffer.indexOf('\n');
				}
			});
		}

		childLike.on('error', (errArg: unknown) => {
			const code = (errArg as NodeJS.ErrnoException | undefined)?.code;
			this._logger.warn('subscription.child.error', {
				transport: 'subscription',
				event: 'child.error',
				code: code ?? null,
			});
			if (proc.reducer.terminated) return;
			this._activeChildren.delete(proc.child);
			this._emitTerminalError(
				proc,
				new ClaudeCliError(
					'CLI_LAUNCH_FAILED',
					'Claude CLI subprocess emitted error before completion',
					errArg,
				),
			);
		});

		childLike.on('close', (...args: unknown[]) => {
			const exitCode = typeof args[0] === 'number' ? args[0] : null;
			this._handleClose(proc, exitCode);
		});
	}

	/**
	 * Parse one NDJSON line, translate it to a `RawClaudeEvent`, hand the
	 * event to the reducer, and push every emitted delta into the channel.
	 * Unparseable lines are dropped silently (debug log without payload).
	 *
	 * The recognised wire shapes are documented on `_ndjsonToRawEvent`. New
	 * wire events should be added there, NOT here.
	 */
	private _handleNdjsonLine(proc: TurnProc, line: string): void {
		const event = this._parseNdjsonLine(line);
		if (event === null) return;
		const raw = ClaudeSubprocessAdapter._ndjsonToRawEvent(event);
		if (raw === null) return;
		this._emitFromReducer(proc, raw);
	}

	/**
	 * Translate one NDJSON record into a `RawClaudeEvent` for the codec seam.
	 * The subprocess transport emits a mix of legacy (`system/init`,
	 * `assistant/message`) and SDK-style (`system`/`stream_event`) shapes;
	 * this is the single place that normalises both into the reducer's
	 * input alphabet.
	 *
	 * Returns `null` for unknown event types (forward-compat with new CLI
	 * events) and for malformed `system` envelopes with no recognised subtype.
	 */
	private static _ndjsonToRawEvent(
		event: Record<string, unknown>,
	): RawClaudeEvent | null {
		const eventType = typeof event.type === 'string' ? event.type : '';
		if (eventType === 'system/init') return ClaudeSubprocessAdapter._systemInitRaw(event);
		if (eventType === 'assistant/message') {
			const text = typeof event.text === 'string' ? event.text : '';
			return { kind: 'assistant-message', text };
		}
		if (eventType === 'result') return ClaudeSubprocessAdapter._resultRaw(event);
		if (eventType === 'system') return ClaudeSubprocessAdapter._systemEnvelopeRaw(event);
		if (eventType === 'stream_event') return ClaudeSubprocessAdapter._streamEventRaw(event);
		return null;
	}

	private static _resultRaw(event: Record<string, unknown>): RawClaudeEvent {
		const subtype = typeof event.subtype === 'string' ? event.subtype : undefined;
		const result = typeof event.result === 'string' ? event.result : undefined;
		const isError = event.is_error === true ? true : undefined;
		return { kind: 'result', subtype, result, is_error: isError };
	}

	private static _streamEventRaw(event: Record<string, unknown>): RawClaudeEvent {
		const inner =
			typeof event.event === 'object' && event.event !== null
				? (event.event as RawStreamEventInner)
				: (event as RawStreamEventInner);
		return { kind: 'stream-event', event: inner };
	}

	private static _systemInitRaw(event: Record<string, unknown>): RawClaudeEvent {
		const sid =
			typeof event.session_id === 'string' && event.session_id.length > 0
				? event.session_id
				: null;
		return { kind: 'system-init', sessionId: sid };
	}

	private static _systemEnvelopeRaw(event: Record<string, unknown>): RawClaudeEvent | null {
		const subtype = typeof event.subtype === 'string' ? event.subtype : '';
		if (subtype === 'init') return ClaudeSubprocessAdapter._systemInitRaw(event);
		if (subtype === 'compact_boundary') {
			const reasonRaw = event.reason ?? event.trigger;
			const reason =
				typeof reasonRaw === 'string' && reasonRaw.length > 0 ? reasonRaw : undefined;
			if (reason === undefined) return { kind: 'system-compact-boundary' };
			return { kind: 'system-compact-boundary', reason };
		}
		return null;
	}

	/**
	 * Hand a `RawClaudeEvent` to the reducer, push every emitted delta into
	 * the channel, fire the `onSessionId` callback exactly once when the
	 * reducer emits its `session-id` delta, capture the session id for
	 * telemetry, and complete the channel when the reducer terminates.
	 */
	private _emitFromReducer(proc: TurnProc, raw: RawClaudeEvent): void {
		if (proc.reducer.terminated) return;
		const deltas = proc.reducer.consume(raw);
		let terminal = false;
		for (const delta of deltas) {
			if (delta.type === 'session-id') {
				proc.sessionId = delta.sessionId;
				this._fireOnSessionId(proc, delta.sessionId);
			}
			if (delta.type === 'done' || delta.type === 'error') terminal = true;
			proc.channel.push(delta);
		}
		// `done` / `error` are always terminal — close the channel so the
		// iterable's caller sees the stream end.
		if (terminal) proc.channel.complete();
	}

	/**
	 * Emit a terminal `error` delta through the reducer (so the dedup /
	 * single-fire invariants stay in one place) and complete the channel.
	 * Safe to call repeatedly — the reducer is idempotent post-termination.
	 */
	private _emitTerminalError(proc: TurnProc, error: ClaudeCliError): void {
		for (const delta of proc.reducer.emitError(error)) {
			proc.channel.push(delta);
		}
		proc.channel.complete();
	}

	/**
	 * REQ-ASM-031 — fire the optional caller-supplied `onSessionId` callback
	 * exactly once. The callback is cleared after the first invocation so a
	 * misbehaving CLI that emits multiple `system/init` events cannot
	 * double-call the caller. The reducer also enforces session-id
	 * single-fire at the delta level (defence-in-depth).
	 */
	private _fireOnSessionId(proc: TurnProc, sid: SessionId): void {
		if (proc.onSessionId === null) return;
		const cb = proc.onSessionId;
		proc.onSessionId = null;
		try {
			cb(sid);
		} catch (e: unknown) {
			// NFR-ASM-005 — never log the session id. Callback failures must
			// not tear down the turn; surface them only as a debug log.
			this._logger.debug('subscription.onSessionId.threw', {
				transport: 'subscription',
				event: 'onSessionId.threw',
			});
			void e;
		}
	}

	/**
	 * Mint a per-turn id used to namespace `blockId`s within one `queryStream`
	 * call. Cryptographic strength is unnecessary — collision across concurrent
	 * turns is the only concern. Falls back to a timestamp + Math.random tuple
	 * when `crypto.randomUUID` is unavailable (e.g. jsdom edge cases). Reads
	 * `crypto` off `window` when present to satisfy `prefer-active-doc`.
	 */
	private static _randomTurnId(): string {
		const c =
			typeof window !== 'undefined'
				? (window as { crypto?: { randomUUID?: () => string } }).crypto
				: undefined;
		if (c !== undefined && typeof c.randomUUID === 'function') {
			return c.randomUUID();
		}
		return `t-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
	}

	/**
	 * Parse one NDJSON line into a plain object, or return `null` (with a debug
	 * log) for blank, non-object, or unparseable lines. Never logs payload.
	 */
	private _parseNdjsonLine(line: string): Record<string, unknown> | null {
		const trimmed = line.trim();
		if (trimmed.length === 0) return null;

		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (parsed === null || typeof parsed !== 'object') {
				this._logger.debug('subscription.ndjson.non_object', {
					transport: 'subscription',
					event: 'ndjson.non_object',
				});
				return null;
			}
			return parsed as Record<string, unknown>;
		} catch {
			// SPEC §4.3 — drop unparseable lines with a debug log. Never log the
			// line content itself (may contain prompt fragments).
			this._logger.debug('subscription.ndjson.parse_failed', {
				transport: 'subscription',
				event: 'ndjson.parse_failed',
			});
			return null;
		}
	}

	/**
	 * Subprocess close handler. Non-zero exit while a turn is in flight →
	 * QUERY_FAILED (REQ-ASM-030). The child is removed from `_activeChildren`
	 * so it no longer counts toward `shutdown()`'s SIGTERM ladder.
	 */
	private _handleClose(proc: TurnProc, exitCode: number | null): void {
		this._activeChildren.delete(proc.child);
		this._emitCompletionTelemetry({
			kind: 'query',
			sessionId: proc.sessionId,
			startTimeMs: proc.startTimeMs,
			exitCode,
		});

		if (proc.reducer.terminated) return;
		if (exitCode !== null && exitCode !== 0) {
			this._emitTerminalError(
				proc,
				new ClaudeCliError(
					'QUERY_FAILED',
					`Claude CLI subprocess exited with code ${exitCode}`,
				),
			);
			return;
		}
		// Clean close with no terminal delta — treat as QUERY_FAILED rather
		// than hanging (mirrors the pre-refactor "Subprocess closed before
		// result event" branch).
		this._emitTerminalError(
			proc,
			new ClaudeCliError('QUERY_FAILED', 'Subprocess closed before result event'),
		);
	}

	/**
	 * Emit a single completion-telemetry debug event (T-ASM-081, NFR-ASM-005,
	 * NFR-ASM-012). The payload shape is fixed:
	 *
	 *   { transport: 'subscription', sessionId: '<redacted>' | null,
	 *     durationMs: number, exitCode: number | null }
	 *
	 * No prompt body, no binary path, no `$HOME`. The session id is
	 * deliberately redacted to the literal `'<redacted>'` when present —
	 * telemetry only needs to know "a session was attached", not the value.
	 */
	private _emitCompletionTelemetry(args: {
		readonly kind: 'query' | 'structured';
		readonly sessionId: SessionId | null;
		readonly startTimeMs: number;
		readonly exitCode: number | null;
	}): void {
		this._logger.debug(`subscription.${args.kind}.complete`, {
			transport: 'subscription',
			sessionId: args.sessionId === null ? null : '<redacted>',
			durationMs: Date.now() - args.startTimeMs,
			exitCode: args.exitCode,
		});
	}

	/** SPEC §4.3 — SIGTERM, then SIGKILL after a short grace window. */
	private _killChild(child: ChildProcessLike): void {
		try {
			child.kill('SIGTERM');
		} catch {
			// Ignore — child may already be gone.
		}
		// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
		const ladder = setTimeout(() => {
			if (child.killed === true) return;
			try {
				child.kill('SIGKILL');
			} catch {
				// Ignore.
			}
		}, SIGKILL_GRACE_MS);
		// Allow Node to exit even if this timer is still pending.
		if (typeof (ladder as { unref?: () => void }).unref === 'function') {
			(ladder as { unref: () => void }).unref();
		}
	}

	/** SPEC §4.3 `_clampTimeout`. */
	private _clampTimeout(raw?: number): number {
		return Math.min(Math.max(raw ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
	}
}
