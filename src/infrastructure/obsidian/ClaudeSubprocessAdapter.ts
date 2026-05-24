/**
 * T-ASM-011 — `ClaudeSubprocessAdapter`: subscription-transport implementation of
 * `ChatTransportPort` driving the user-installed `claude` binary as a short-lived
 * child process per turn. Multi-turn continuity is achieved by forwarding
 * `--resume <sessionId>` argv (REQ-ASM-035) supplied by the caller, NOT by
 * reusing a long-lived process across turns.
 *
 * After WP-11 (Arch review #11) this class is a thin facade that wires
 * together three focused modules:
 *   - `SubprocessLifecycle` — spawn / kill / shutdown registry;
 *   - `NdjsonChannel` — push-channel + line reassembly + 4 MiB stdout cap;
 *   - `runSubprocessStructured` — one-shot structured-output collector.
 *
 * The facade still owns the wire-format translation table (`_ndjsonToRawEvent`
 * family) because it bridges between the NDJSON line surface and the
 * `StreamDeltaReducer` codec seam (WP-1) — both are wire concerns and live
 * together so there is exactly one place to add a new event shape.
 *
 * Satisfies:
 *   - REQ-ASM-001 (transport-agnostic port construction; no I/O in ctor)
 *   - REQ-ASM-006/027/028 (argv invariants delegated to `buildSubprocessArgs`)
 *   - REQ-ASM-009 (graceful degradation when the binary cannot be found)
 *   - REQ-ASM-010 (one subprocess per turn; multi-turn via --resume chaining)
 *   - REQ-ASM-013 (forward `--append-system-prompt` via argv)
 *   - REQ-ASM-029 (chunked stdout reassembled by `NdjsonChannel`)
 *   - REQ-ASM-030 (non-zero exit / `is_error: true` → QUERY_FAILED)
 *   - REQ-ASM-031 (capture `session_id` from `system/init`)
 *   - REQ-ASM-035 (forward `--resume <sessionId>` via argv)
 *   - NFR-ASM-004 (never touches `~/.claude/`)
 *   - NFR-ASM-005, NFR-ASM-012 (log redaction; no prompt, binary path, or $HOME)
 *   - NFR-ASM-006 (startup never throws)
 *   - perf-F-8 (bounded stdout buffer with overflow → error delta + SIGTERM)
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
 * wrapper. WP-12 (Arch review #3) folded `runStructured` onto `ChatTransportPort`
 * itself as an *optional* method — the application layer narrows via
 * `typeof port.runStructured === 'function'`, and the SDK adapter simply
 * does not implement it.
 */
import { createFileEnvelopeJsonSchema as _unusedSchema } from '@/application/chat/createFileEnvelopeSchema';
import {
	StreamDeltaReducer,
	type RawClaudeEvent,
	type RawStreamEventInner,
} from '@/application/chat/StreamDeltaReducer';
import {
	ChatTransportError,
	type ChatTransportPort,
	type ChatTransportStreamOptions,
	type StreamDelta,
	type StructuredCliCallOptions,
	type StructuredCliRawResult,
} from '@/domain/ports/ChatTransportPort';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import type { TransportLifecyclePort } from '@/domain/ports/TransportLifecyclePort';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { type SessionId } from '@/domain/chat/SessionId';
import { err, ok, type Result } from '@/domain/shared/Result';
import { buildSubprocessArgs } from '@/infrastructure/obsidian/buildSubprocessArgs';
import {
	createNdjsonChannel,
	type NdjsonChannel,
} from '@/infrastructure/obsidian/NdjsonChannel';
import { runSubprocessStructured } from '@/infrastructure/obsidian/runSubprocessStructured';
import {
	SubprocessLifecycle,
	type ChildProcessLike,
	type SpawnFn,
} from '@/infrastructure/obsidian/SubprocessLifecycle';

// Re-export so existing call sites that destructure from the adapter keep
// working. WP-11 owns the types; downstream callers may switch later.
export type { SpawnFn };

// Tree-shake guard — keep the schema import path warm so docs:api picks it up.
void _unusedSchema;

export interface ClaudeSubprocessAdapterDeps {
	readonly getSettings: () => PluginSettings;
	readonly logger: LoggerPort;
	readonly resolveCliPath: () => Promise<string | null>;
	readonly spawn: SpawnFn;
	readonly now?: () => number;
	/**
	 * QW-A — vault root forwarded to `child_process.spawn` as `cwd`. Read on
	 * every spawn so the user can switch vaults mid-session without
	 * reinstantiating the adapter. Return `null` (or omit the dep entirely)
	 * to fall back to the renderer cwd.
	 */
	readonly getVaultBasePath?: () => string | null;
	/**
	 * INV-7 — fresh `--mcp-config` JSON payload per spawn. Returning `null`
	 * or `''` omits the flag. The closure is invoked on every turn so toggling
	 * `mcpServerEnabled` or restarting the loopback MCP server takes effect
	 * on the next turn without reinstantiating the adapter.
	 */
	readonly getMcpConfigJson?: () => string | null;
}

/** SPEC §4.3 `_clampTimeout` floor / ceiling. */
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 3_600_000;
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Per-turn streaming-process record. One entry per spawn — short-lived; the
 * child exits as soon as the `result` event arrives (or on error / timeout).
 *
 * The wire→`StreamDelta` translation lives in `StreamDeltaReducer` (ADR-0034).
 * This struct only carries the per-spawn glue: the spawned child, the per-turn
 * reducer, the NDJSON channel that feeds the iterable + the line buffer, and
 * the optional `onSessionId` single-fire callback.
 */
interface TurnProc {
	readonly child: ChildProcessLike;
	readonly reducer: StreamDeltaReducer;
	readonly channel: NdjsonChannel<StreamDelta>;
	sessionId: SessionId | null;
	onSessionId: ((sessionId: SessionId) => void) | null;
	startTimeMs: number;
	/**
	 * Reset the idle-timeout window. Called on every NDJSON line so a turn
	 * that produces output — even tool-heavy ones lasting minutes — only
	 * fires the timeout if the subprocess goes truly silent for the configured
	 * window. Stays `null` until `_installStreamTimeout` returns.
	 */
	resetIdleTimer: (() => void) | null;
}

/**
 * Subscription-transport implementation of `ChatTransportPort`.
 *
 * `kind` is intentionally declared so `selectTransport` can identify this
 * adapter structurally without an `instanceof` check that would force a
 * domain ⇄ infrastructure import. Subscription-capability narrowing in the
 * application layer (`queryStructured()`) keys off the presence of
 * `runStructured` rather than `kind` — see WP-12 (Arch review #3).
 *
 * Also implements `TransportLifecyclePort` (`startup` / `shutdown`) — split
 * off `ChatTransportPort` in WP-12 so the per-turn streaming surface stays
 * narrow per ADR-008 *responsibility* spirit.
 */
export class ClaudeSubprocessAdapter implements ChatTransportPort, TransportLifecyclePort {
	public readonly kind = 'subscription' as const;

	private _available = false;
	private _startupCompleted = false;
	private _binaryPath: string | null = null;
	private _lastResolvedClaudeCliPath: string | null = null;
	private readonly _lifecycle: SubprocessLifecycle;

	private readonly _getSettings: () => PluginSettings;
	private readonly _logger: LoggerPort;
	private readonly _resolveCliPath: () => Promise<string | null>;
	private readonly _getVaultBasePath: () => string | null;
	private readonly _getMcpConfigJson: () => string | null;
	// @ts-expect-error TS6133: reserved for telemetry hooks landing in T-ASM-038.
	private readonly _now: () => number;

	constructor(deps: ClaudeSubprocessAdapterDeps) {
		this._getSettings = deps.getSettings;
		this._logger = deps.logger;
		this._resolveCliPath = deps.resolveCliPath;
		this._lifecycle = new SubprocessLifecycle({ spawn: deps.spawn, logger: deps.logger });
		this._getVaultBasePath = deps.getVaultBasePath ?? ((): string | null => null);
		this._getMcpConfigJson = deps.getMcpConfigJson ?? ((): string | null => null);
		this._now = deps.now ?? Date.now;
	}

	// ── Lifecycle ────────────────────────────────────────────────────────────

	/**
	 * Resolve the binary path and cache it. Idempotent on identical input —
	 * subsequent calls re-run only if `settings.claudeCliPath` has changed
	 * since the last successful resolve.
	 *
	 * Never throws — any resolver failure degrades to `_available = false`.
	 */
	async startup(): Promise<void> {
		const settings = this._getSettings();
		if (this._startupCompleted && this._lastResolvedClaudeCliPath === settings.claudeCliPath) {
			return;
		}
		this._startupCompleted = true;
		this._lastResolvedClaudeCliPath = settings.claudeCliPath;

		const explicit = settings.claudeCliPath.trim();
		if (explicit.length > 0) {
			this._binaryPath = explicit;
		} else {
			try {
				this._binaryPath = await this._resolveCliPath();
			} catch (e: unknown) {
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

	/** Class-only synchronous accessor (SPEC §4.2). */
	isAvailableSync(): boolean {
		return this._available;
	}

	/**
	 * Synchronous SIGTERM ladder over every in-flight child. Idempotent and
	 * safe to call before `startup()`. Never throws.
	 */
	shutdown(): void {
		if (this._lifecycle.shuttingDown) return;
		this._lifecycle.shutdownAll();
		this._available = false;
	}

	/**
	 * Streaming variant of `query()`. Yields `text` / `session-id` / `done` /
	 * `error` deltas as they arrive. Honours `options.signal`. Never throws —
	 * all failure modes surface as a terminal `error` delta.
	 */
	queryStream(prompt: string, options?: ChatTransportStreamOptions): AsyncIterable<StreamDelta> {
		return this._runStream(prompt, options);
	}

	// ── runStructured() — one-shot structured one-shot path ──────────────────

	/**
	 * Structured-output one-shot. Delegates to `runSubprocessStructured`,
	 * which owns the JSON-mode collect/parse pipeline (WP-11).
	 */
	async runStructured(
		prompt: string,
		options: StructuredCliCallOptions,
	): Promise<Result<StructuredCliRawResult, ChatTransportError>> {
		if (!this._available) {
			return err(
				new ChatTransportError(
					'CLI_LAUNCH_FAILED',
					'Subscription transport is not available — Claude CLI binary not found',
				),
			);
		}
		return runSubprocessStructured(
			{
				lifecycle: this._lifecycle,
				logger: this._logger,
				clampTimeout: (raw) => this._clampTimeout(raw),
				emitCompletionTelemetry: (args) => {
					this._emitCompletionTelemetry(args);
				},
				getCwd: () => this._getVaultBasePath(),
				getMcpConfigJson: () => this._getMcpConfigJson(),
			},
			this._binaryPath,
			prompt,
			options,
		);
	}

	// ── Streaming pipeline ───────────────────────────────────────────────────

	/**
	 * Orchestrator for `queryStream`: handles availability + pre-abort
	 * preflight, builds argv, spawns the child via `SubprocessLifecycle`,
	 * wires the `NdjsonChannel` to the reducer, and delegates iteration to
	 * the channel.
	 */
	private async *_runStream(
		prompt: string,
		options?: ChatTransportStreamOptions,
	): AsyncIterable<StreamDelta> {
		const pre = this._preflightStream(options);
		if (pre !== null) {
			yield pre;
			return;
		}

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
		);
		if (!spawned.ok) {
			yield { type: 'error', error: spawned.error };
			return;
		}
		const proc = spawned.value;

		const timeoutMs = this._clampTimeout(options?.timeoutMs);
		const cancelIdleTimer = this._installStreamTimeout(proc, timeoutMs);
		const detachAbort = this._installStreamAbort(proc, options?.signal);

		try {
			yield* proc.channel.iterate();
		} finally {
			cancelIdleTimer();
			detachAbort();
			if (!proc.reducer.terminated) {
				this._lifecycle.kill(proc.child);
				this._lifecycle.release(proc.child);
				proc.channel.complete();
			}
		}
	}

	/**
	 * Synchronous pre-flight gate for `queryStream`. Returns a terminal error
	 * delta when the adapter is unavailable or the signal is already aborted.
	 */
	private _preflightStream(options: ChatTransportStreamOptions | undefined): StreamDelta | null {
		if (!this._available || this._binaryPath === null) {
			return {
				type: 'error',
				error: new ChatTransportError(
					'CLI_LAUNCH_FAILED',
					'Subscription transport is not available — Claude CLI binary not found',
				),
			};
		}
		if (options?.signal?.aborted === true) {
			return {
				type: 'error',
				error: new ChatTransportError('QUERY_FAILED', 'Request was aborted before send'),
			};
		}
		return null;
	}

	/**
	 * Install the per-turn IDLE timeout. The timer fires only if the subprocess
	 * produces no NDJSON output for `timeoutMs` milliseconds — `_handleNdjsonLine`
	 * calls `proc.resetIdleTimer()` on every line, so a long tool-heavy turn that
	 * keeps streaming events never trips this. Without idle semantics the 30 s
	 * default (now 10 min) cut off tool-using turns mid-conversation as a
	 * "took too long" error even though the CLI was actively making progress.
	 *
	 * The returned handle is the most-recent `setTimeout` ID — kept in scope by
	 * the closure inside `reset`, so `clearTimeout(handle)` in the finally block
	 * cancels whichever timer is currently armed.
	 */
	private _installStreamTimeout(proc: TurnProc, timeoutMs: number): () => void {
		const fire = (): void => {
			if (proc.reducer.terminated) return;
			this._lifecycle.kill(proc.child);
			this._emitTerminalError(
				proc,
				new ChatTransportError('TIMEOUT', `Subscription query idle for ${timeoutMs} ms`),
			);
		};
		// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
		let handle: ReturnType<typeof setTimeout> = setTimeout(fire, timeoutMs);
		proc.resetIdleTimer = (): void => {
			// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
			clearTimeout(handle);
			// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
			handle = setTimeout(fire, timeoutMs);
		};
		return () => {
			// eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
			clearTimeout(handle);
			proc.resetIdleTimer = null;
		};
	}

	/**
	 * Wire the caller's abort signal: SIGTERMs the child and emits the
	 * terminal `error` delta. Re-checks `aborted` after attaching because
	 * `AbortSignal` does not replay events.
	 */
	private _installStreamAbort(
		proc: TurnProc,
		signal: AbortSignal | undefined,
	): () => void {
		const onAbort = (): void => {
			if (proc.reducer.terminated) return;
			this._lifecycle.kill(proc.child);
			this._emitTerminalError(proc, new ChatTransportError('QUERY_FAILED', 'Request was aborted'));
		};
		if (signal === undefined) return () => undefined;
		signal.addEventListener('abort', onAbort, { once: true });
		if (signal.aborted) onAbort();
		return () => {
			signal.removeEventListener('abort', onAbort);
		};
	}

	/** Build the argv vector for a `query()` invocation. */
	private _buildArgv(
		prompt: string,
		options: ChatTransportStreamOptions | undefined,
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
			planMode: options?.planMode === true,
			mcpConfigJson: this._getMcpConfigJson(),
		});
	}

	/**
	 * Spawn via `SubprocessLifecycle` and wire `NdjsonChannel` + reducer.
	 * Synchronous throws collapse into `CLI_LAUNCH_FAILED` Results; async
	 * `error` events that fire before a terminal delta become reducer error
	 * deltas. NDJSON events are translated to `RawClaudeEvent`s and pushed
	 * through the reducer.
	 */
	private _spawnChild(
		binaryPath: string,
		argv: readonly string[],
		onSessionId: ((sessionId: SessionId) => void) | null,
		reducer: StreamDeltaReducer,
	): Result<TurnProc, ChatTransportError> {
		const spawned = this._lifecycle.spawn(
			binaryPath,
			argv,
			'spawn.failed',
			this._getVaultBasePath(),
		);
		if (!spawned.ok) return spawned;
		const child = spawned.value;

		// Build the channel first so the overflow callback can refer to it.
		// `proc` is filled in below; `channel` only fires the overflow callback
		// after `pushBytes()` has been called at least once.
		const procRef: { current: TurnProc | null } = { current: null };
		const channel = createNdjsonChannel<StreamDelta>({
			onLine: (line) => {
				if (procRef.current === null) return;
				this._handleNdjsonLine(procRef.current, line);
			},
			onOverflow: (bufferBytes) => {
				if (procRef.current === null) return;
				this._logger.warn('subscription.stdout.overflow', {
					transport: 'subscription',
					event: 'stdout.overflow',
					bufferBytes,
				});
				this._lifecycle.kill(procRef.current.child);
				this._emitTerminalError(
					procRef.current,
					new ChatTransportError(
						'QUERY_FAILED',
						'Claude CLI stdout exceeded the buffer cap without a newline',
					),
				);
			},
		});

		const proc: TurnProc = {
			child,
			reducer,
			channel,
			sessionId: null,
			onSessionId,
			startTimeMs: Date.now(),
			resetIdleTimer: null,
		};
		procRef.current = proc;

		this._wireChildListeners(proc);
		return ok(proc);
	}

	/**
	 * Wire stdout / error / close listeners onto the spawned child. Each
	 * stdout chunk is fed into the `NdjsonChannel`, which performs line
	 * reassembly + cap enforcement and calls `onLine` for every complete line.
	 */
	private _wireChildListeners(proc: TurnProc): void {
		const childLike = proc.child;
		const stdout = childLike.stdout;
		if (stdout !== null) {
			stdout.on('data', (chunk: Buffer | string) => {
				proc.channel.pushBytes(chunk);
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
			this._lifecycle.release(proc.child);
			this._emitTerminalError(
				proc,
				new ChatTransportError(
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
	 * Parse one NDJSON line, translate it, hand the event to the reducer, and
	 * push every emitted delta into the channel. Unparseable lines are
	 * dropped silently (debug log without payload).
	 */
	private _handleNdjsonLine(proc: TurnProc, line: string): void {
		// Any output keeps the idle watchdog quiet — long tool-heavy turns
		// stream system / stream_event / tool deltas continuously, and the
		// idle timeout should only fire when the subprocess goes truly
		// silent for the full window.
		proc.resetIdleTimer?.();
		const event = this._parseNdjsonLine(line);
		if (event === null) return;
		const raw = ClaudeSubprocessAdapter._ndjsonToRawEvent(event);
		if (raw === null) return;
		this._emitFromReducer(proc, raw);
	}

	/**
	 * Translate one NDJSON record into a `RawClaudeEvent`. The single place
	 * that normalises legacy (`system/init`, `assistant/message`) and
	 * SDK-style (`system`/`stream_event`) shapes into the reducer's input
	 * alphabet. Returns `null` for unknown event types (forward-compat).
	 */
	private static _ndjsonToRawEvent(event: Record<string, unknown>): RawClaudeEvent | null {
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
	 * the channel, fire `onSessionId` exactly once when the reducer emits
	 * its `session-id` delta, and complete the channel on termination.
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
		if (terminal) proc.channel.complete();
	}

	/**
	 * Emit a terminal `error` delta through the reducer (so dedup / single-fire
	 * invariants stay in one place) and complete the channel. Safe to call
	 * repeatedly — the reducer is idempotent post-termination.
	 */
	private _emitTerminalError(proc: TurnProc, error: ChatTransportError): void {
		for (const delta of proc.reducer.emitError(error)) {
			proc.channel.push(delta);
		}
		proc.channel.complete();
	}

	/**
	 * REQ-ASM-031 — fire the optional caller-supplied `onSessionId` exactly
	 * once. The callback is cleared after the first invocation so a
	 * misbehaving CLI cannot double-call the caller. The reducer also
	 * enforces session-id single-fire at the delta level (defence-in-depth).
	 */
	private _fireOnSessionId(proc: TurnProc, sid: SessionId): void {
		if (proc.onSessionId === null) return;
		const cb = proc.onSessionId;
		proc.onSessionId = null;
		try {
			cb(sid);
		} catch (e: unknown) {
			this._logger.debug('subscription.onSessionId.threw', {
				transport: 'subscription',
				event: 'onSessionId.threw',
			});
			void e;
		}
	}

	/**
	 * Mint a per-turn id used to namespace `blockId`s within one `queryStream`
	 * call. Falls back to a timestamp + random tuple when `crypto.randomUUID`
	 * is unavailable.
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
	 * Parse one NDJSON line into a plain object, or return `null` (with a
	 * debug log) for blank, non-object, or unparseable lines. Never logs
	 * payload.
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
			this._logger.debug('subscription.ndjson.parse_failed', {
				transport: 'subscription',
				event: 'ndjson.parse_failed',
			});
			return null;
		}
	}

	/**
	 * Subprocess close handler. Non-zero exit while a turn is in flight →
	 * QUERY_FAILED (REQ-ASM-030). The child is removed from the active set
	 * so it no longer counts toward `shutdown()`'s SIGTERM ladder.
	 */
	private _handleClose(proc: TurnProc, exitCode: number | null): void {
		this._lifecycle.release(proc.child);
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
				new ChatTransportError('QUERY_FAILED', `Claude CLI subprocess exited with code ${exitCode}`),
			);
			return;
		}
		this._emitTerminalError(
			proc,
			new ChatTransportError('QUERY_FAILED', 'Subprocess closed before result event'),
		);
	}

	/**
	 * Emit a single completion-telemetry debug event. Payload shape is fixed
	 * to exactly { transport, sessionId, durationMs, exitCode } — verified
	 * by `ClaudeSubprocessAdapter.telemetry.test.ts`. The session id is
	 * deliberately redacted to the literal `'<redacted>'` when present.
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

	/** SPEC §4.3 `_clampTimeout`. */
	private _clampTimeout(raw?: number): number {
		return Math.min(Math.max(raw ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
	}
}
