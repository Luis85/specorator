import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter as PATH_DELIMITER, join as pathJoin } from 'node:path';

import type {
	ChatRuntimePort,
	ProviderId,
	StreamChunk,
	ChatMessage,
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
	Unsubscriber,
	LoggerPort,
	RuntimeCapabilities,
	ToolbarCapabilities,
} from '@/domain/ports';
import type {
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalRequest,
	ApprovalDecision,
} from '@/domain/chat/inline';
import { ClaudeStreamReducer } from './reduceClaudeStream';

/**
 * Production `ChatRuntimePort` (SPEC-CC-010) — the **only** subprocess spawner in
 * P1. A clean reimplementation referencing (not copying) the deleted P0
 * `ClaudeSubprocessAdapter` / `SubprocessLifecycle` / `NdjsonChannel` shape on
 * `develop` history. Lives under `src/infrastructure/obsidian/**`
 * (coverage-excluded, §10): its sole behavioural gate is the **manual**
 * TEST-CC-017 (real `claude` CLI in Obsidian). The pure NDJSON→`StreamChunk`
 * reduce is unit-tested in isolation via {@link ClaudeStreamReducer}.
 *
 * Posture:
 * - Spawns the resolved `claude` CLI with `--print --output-format stream-json
 *   --verbose` on the user's own login. **Reads no API key/token/secret and
 *   writes none** (NFR-CC-006, REQ-CC-013) — there is no `data.json` /
 *   `SecretStorePort` access in this file.
 * - `cancel()` kills the child **manually** (`child.kill()`), reproducing the
 *   Electron `customSpawn` gotcha — it does not pass an `AbortSignal` to `spawn`.
 * - `query` **never throws across the port**: an unexpected fault yields a
 *   synthetic `error` chunk then `done` and returns (ADR-CC-001 §1, EC-13).
 */
export class ClaudeCliChatRuntime implements ChatRuntimePort {
	readonly providerId: ProviderId = 'claude';

	private sessionId: string | null = null;
	private ready = false;
	private cancelled = false;
	private child: ChildProcess | null = null;
	private readonly readyListeners = new Set<(ready: boolean) => void>();
	// P4 (SPEC-CP-011): the registered inline-block callbacks. Stored so the stream
	// reducer's emitted request chunk can route a response back (T-CP-014); the CLI
	// transport gates the answerable affordance off (`supportsInlineResponse:false`).
	private askUserQuestionCallback:
		| ((req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>)
		| null = null;
	private exitPlanModeCallback:
		| ((req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>)
		| null = null;
	private approvalCallback:
		| ((req: ApprovalRequest) => Promise<ApprovalDecision | null>)
		| null = null;

	constructor(
		private readonly logger?: LoggerPort,
		private readonly cwd?: string | null,
	) {}

	prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
		return {
			request,
			persistedContent: request.text,
			prompt: request.text,
			isCompact: false,
			mcpMentions: new Set<string>(),
		};
	}

	async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
		// Probe CLI resolvability. The user's `claude` login is the auth source;
		// we read no secret. An *expected* unavailability resolves `false` (the
		// use case surfaces the start-fail path) — it never rejects.
		const resolved = this._resolveBinary() !== null;
		this._setReady(resolved);
		return Promise.resolve(resolved);
	}

	async *query(
		turn: PreparedChatTurn,
		_conversationHistory?: ChatMessage[],
		queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk> {
		this.cancelled = false;
		const reducer = new ClaudeStreamReducer();
		const binary = this._resolveBinary();
		if (binary === null) {
			yield* this._yieldEach(reducer.synthesizeError('the `claude` CLI was not found on PATH.'));
			return;
		}

		const argv = this._buildArgs(queryOptions);
		const lines = this._spawnAndStreamLines(binary, argv, turn.prompt);
		try {
			yield* this._consumeLines(reducer, lines);
			// Terminal guarantee (Codex review #433, EC-13): if the stream ended
			// without a `result` event (early exit / stderr-only), emit a synthetic
			// error+done so the consumer leaves `streaming`. No-op on a clean
			// completion (the reducer already emitted `done`) or on cancel.
			if (!this._isCancelled()) {
				yield* this._yieldEach(reducer.finalize());
			}
		} catch (e: unknown) {
			// Unexpected fault (broken pipe, spawn race) — synthesize, never rethrow.
			const detail = e instanceof Error ? e.message : 'unknown stream fault';
			this.logger?.error('claude-cli.stream_fault', e);
			yield* this._yieldEach(reducer.synthesizeError(detail));
		} finally {
			this._killChild();
		}
	}

	/**
	 * Reduce the spawned CLI's stdout lines to `StreamChunk`s, honouring the live
	 * cancel flag at both the line and chunk boundary. Extracted from {@link query}
	 * so the orchestration there stays within the complexity budget.
	 */
	private async *_consumeLines(
		reducer: ClaudeStreamReducer,
		lines: AsyncIterable<string>,
	): AsyncGenerator<StreamChunk> {
		for await (const line of lines) {
			if (this._isCancelled()) return;
			for (const chunk of reducer.consumeLine(line)) {
				if (this._isCancelled()) return;
				if (chunk.type === 'usage') this.sessionId = reducer.sessionId;
				// P4 (SPEC-CP-011/017): where the wire surfaced an inline-block request,
				// the reducer emits the matching request member; route it back through
				// the registered callback (the response transport). The one-shot
				// `--print` CLI gates `supportsInlineResponse: false`, so today this is
				// a forward-compatible no-effect call (the UI renders read-only); a
				// future interactive transport flips the flag and the same path resolves.
				this._routeInlineRequest(chunk);
				yield chunk;
			}
		}
	}

	/**
	 * Route a reducer-emitted inline-block request chunk to the registered callback
	 * (ADR-CP-004 §1). Fire-and-forget — the CLI does not await the answer (the
	 * one-shot turn has already produced its output); the routing exists so a later
	 * interactive transport reuses the identical wiring. No-op when no callback was
	 * registered.
	 */
	private _routeInlineRequest(chunk: StreamChunk): void {
		if (chunk.type === 'ask_user_question') {
			void this.askUserQuestionCallback?.({ requestId: chunk.requestId, questions: chunk.questions });
		} else if (chunk.type === 'exit_plan_mode') {
			void this.exitPlanModeCallback?.({
				requestId: chunk.requestId,
				plan: chunk.plan,
				allowedPrompts: chunk.allowedPrompts,
			});
		} else if (chunk.type === 'approval_request') {
			void this.approvalCallback?.({
				requestId: chunk.requestId,
				tool: chunk.tool,
				context: chunk.context,
				options: chunk.options,
			});
		}
	}

	cancel(): void {
		this.cancelled = true;
		this._killChild();
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	resetSession(): void {
		this.sessionId = null;
	}

	onReadyStateChange(listener: (ready: boolean) => void): Unsubscriber {
		this.readyListeners.add(listener);
		return () => {
			this.readyListeners.delete(listener);
		};
	}

	isReady(): boolean {
		return this.ready;
	}

	// ── P3 additive members (SPEC-TS-003/009, ADR-TS-002 §3) ────────────────────
	// `resumeSession` maps to the CLI `--resume <sessionId>` seam (mirrors
	// claudian-main's SessionManager.setSessionId). `setResumeCheckpoint` is a
	// no-op-by-transport here (ADR-TS-004) — see below. Bound setters — no stream,
	// no Result.

	resumeSession(sessionId: string): void {
		// Bind the next `--resume` to this session id (an empty id cold-starts the
		// next turn — EC-TS-5).
		this.sessionId = sessionId.length > 0 ? sessionId : null;
	}

	setResumeCheckpoint(_assistantMessageId: string): void {
		// No-op-by-transport (ADR-TS-004): rewind-to-turn is an Agent-SDK capability
		// (`Options.resumeSessionAt` over a persistent MessageChannel), NOT exposed
		// faithfully by the one-shot `claude --print` subprocess. The method stays on
		// the port (ADR-TS-002 §3) but applies no checkpoint here — `getCapabilities`
		// reports `supportsRewind: false`, so the capability-gated UI never offers
		// rewind on this transport and never calls this with intent to rewind.
	}

	getCapabilities(): RuntimeCapabilities {
		// Fork derives lineage via `--resume <forkSource.sessionId>` (supported).
		// Rewind-to-turn is gated OFF — it is an Agent-SDK-transport capability the
		// `--print` subprocess cannot honour faithfully (ADR-TS-004, R-TS-002).
		// P4 CLI honesty (SPEC-CP-011, ADR-CP-004 §3): the one-shot `claude --print`
		// transport cannot round-trip a mid-turn interactive answer, so it reports
		// `supportsInlineResponse: false` (and plan-mode off — both depend on the
		// interactive round-trip). When a later interactive transport (Agent-SDK /
		// ACP) ships it flips these flags and the same UI lights up — no UI change.
		return {
			supportsFork: true,
			supportsRewind: false,
			supportsPlanMode: false,
			supportsInlineResponse: false,
		};
	}

	// P6 (SPEC-TC-005/007, ADR-TC-003 §2): the REAL Claude toolbar flags (T-TC-012,
	// coverage-excluded — behavioural gate is the MANUAL leg TEST-TC-M1).
	// - `supportsMcpTools`: the `claude --print` one-shot transport ships no live MCP
	//   tool backing in P6 (MCP arrives in P8, NG2), so the honest CLI capability is
	//   `false` — the MCP selector stays capability-hidden, the same honest-gating
	//   posture as `getCapabilities().supportsInlineResponse: false` (ADR-TS-004).
	// - `reasoningControl: 'effort'`: Claude uses the adaptive-effort vocabulary (high/
	//   medium/low), not a token budget.
	// - `hasServiceTier: false`: no Codex fast-mode on Claude — the toggle collapses.
	// - `hasModeToggle: true`: the catalog ships a mode descriptor (SPEC-TC-007).
	// - `permissionMode`: mirrors the active P4 plan state (display only — P6 does not
	//   own plan mode, NG6). The one-shot `--print` transport reports `supportsPlanMode:
	//   false` (no interactive plan round-trip), so the displayed permission mode stays
	//   `'default'` until an interactive transport flips it.
	// Synchronous + total; never throws. No `providerId` branch.
	getToolbarCapabilities(): ToolbarCapabilities {
		return {
			supportsMcpTools: false,
			reasoningControl: 'effort',
			hasServiceTier: false,
			hasModeToggle: true,
			permissionMode: 'default',
		};
	}

	// ── P4 additive members (SPEC-CP-002/011, ADR-CP-004 §1) ────────────────────
	// The setters STORE the registered callbacks; the CLI stream reducer emits the
	// matching request chunk where the wire surfaces one (T-CP-014), and the
	// response flows back via the stored callback (SPEC-CP-017). Because
	// `supportsInlineResponse` is false, the answerable affordance is gated off and
	// the inline block renders read-only — the callback is registered but the UI
	// never resolves it (honest gating).

	setAskUserQuestionCallback(
		cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>,
	): void {
		this.askUserQuestionCallback = cb;
	}

	setExitPlanModeCallback(
		cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>,
	): void {
		this.exitPlanModeCallback = cb;
	}

	setApprovalCallback(cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>): void {
		this.approvalCallback = cb;
	}

	// ── internals ─────────────────────────────────────────────────────────────

	/** Opaque read of the cancel flag so the streaming loop checks live state. */
	private _isCancelled(): boolean {
		return this.cancelled;
	}

	private _setReady(next: boolean): void {
		if (this.ready === next) return;
		this.ready = next;
		for (const listener of this.readyListeners) listener(next);
	}

	private _buildArgs(queryOptions?: ChatRuntimeQueryOptions): string[] {
		const argv = ['--print', '--output-format', 'stream-json', '--verbose'];
		// P3 (SPEC-TS-009): a forceColdStart query ignores any bound session for
		// this single query — no `--resume` (so the title side-query does not steer
		// the tab's main stream).
		const coldStart = queryOptions?.forceColdStart === true;
		if (!coldStart && this.sessionId !== null && this.sessionId.length > 0) {
			argv.push('--resume', this.sessionId);
		}
		argv.push(...this._optionArgs(queryOptions));
		return argv;
	}

	/**
	 * The per-turn `--model` / `--append-system-prompt` flags derived from the query
	 * options (extracted from {@link _buildArgs} for the complexity budget). P4
	 * (R-CP-001): `--append-system-prompt <text>` feeds the instruction-appended
	 * `customSystemPrompt` to the agent (the real `claude` CLI flag, the parity
	 * counterpart of Claudian's SDK `systemPrompt`). An empty/absent value emits no
	 * flag, so a no-custom-prompt turn runs identically to P3.
	 */
	private _optionArgs(queryOptions?: ChatRuntimeQueryOptions): string[] {
		const argv: string[] = [];
		const model = queryOptions?.model;
		if (model !== undefined && model.length > 0) {
			argv.push('--model', model);
		}
		const appendSystemPrompt = queryOptions?.appendSystemPrompt;
		if (appendSystemPrompt !== undefined && appendSystemPrompt.length > 0) {
			argv.push('--append-system-prompt', appendSystemPrompt);
		}
		return argv;
	}

	/**
	 * Spawn the CLI and surface its stdout as `\n`-terminated lines. The prompt
	 * is written to stdin and the stream closed, so the CLI runs non-interactively.
	 * Yields each complete line; the reducer translates them to chunks.
	 */
	private async *_spawnAndStreamLines(
		binary: string,
		argv: readonly string[],
		prompt: string,
	): AsyncGenerator<string> {
		const opts: SpawnOptions =
			typeof this.cwd === 'string' && this.cwd.length > 0
				? { stdio: ['pipe', 'pipe', 'pipe'], cwd: this.cwd, env: this._buildEnv() }
				: { stdio: ['pipe', 'pipe', 'pipe'], env: this._buildEnv() };
		const child = spawn(binary, [...argv], opts);
		this.child = child;

		// EPIPE guard (Codex review #433): if the CLI exits before/while consuming
		// stdin (immediate startup failure, early termination), writing the prompt
		// emits an 'error' on the stdin stream. Unhandled, that EPIPE crashes the
		// process. Swallow it — the child 'close'/'error' handlers below end the
		// stream and the reducer's finalize() still yields a terminal chunk.
		const stdin = child.stdin;
		if (stdin !== null) {
			stdin.on('error', (e: unknown) => {
				this.logger?.debug('claude-cli.stdin_error', {
					detail: e instanceof Error ? e.message : String(e),
				});
			});
			stdin.write(prompt);
			stdin.end();
		}

		const state = { queue: [] as string[], buffer: '', finished: false };
		let resolveNext: (() => void) | null = null;

		const wake = (): void => {
			const r = resolveNext;
			resolveNext = null;
			if (r !== null) r();
		};

		child.stdout?.on('data', (data: Buffer | string) => {
			state.buffer += typeof data === 'string' ? data : data.toString('utf8');
			let nl = state.buffer.indexOf('\n');
			while (nl !== -1) {
				state.queue.push(state.buffer.slice(0, nl));
				state.buffer = state.buffer.slice(nl + 1);
				nl = state.buffer.indexOf('\n');
			}
			wake();
		});
		child.on('close', () => {
			if (state.buffer.length > 0) {
				state.queue.push(state.buffer);
				state.buffer = '';
			}
			state.finished = true;
			wake();
		});
		child.on('error', () => {
			state.finished = true;
			wake();
		});

		for (;;) {
			const next = state.queue.shift();
			if (next !== undefined) {
				yield next;
				continue;
			}
			if (state.finished) return;
			await new Promise<void>((resolve) => {
				resolveNext = resolve;
			});
		}
	}

	private _killChild(): void {
		const child = this.child;
		if (child === null) return;
		this.child = null;
		try {
			child.kill();
		} catch {
			// Child may already be gone — kill is best-effort and never throws.
		}
	}

	private async *_yieldEach(chunks: readonly StreamChunk[]): AsyncGenerator<StreamChunk> {
		for (const chunk of chunks) yield chunk;
	}

	/**
	 * Build the child environment with an augmented PATH so a GUI-launched
	 * Obsidian (which inherits a sparse PATH on macOS/Linux) can still find a
	 * user-installed `claude`. No secret is injected — auth is the CLI's own login.
	 */
	private _buildEnv(): NodeJS.ProcessEnv {
		const env = { ...process.env };
		const extra = ['/usr/local/bin', '/opt/homebrew/bin', `${process.env.HOME ?? ''}/.local/bin`];
		const current = env.PATH ?? '';
		const merged = [current, ...extra].filter((p) => p.length > 0).join(PATH_DELIMITER);
		env.PATH = merged;
		return env;
	}

	/**
	 * Resolve the `claude` binary (no separate port — SPEC-CC-010 "Port
	 * placement"). Scans common install locations plus every PATH directory for a
	 * `claude` executable. Returns the absolute path when found, else `null` so
	 * `ensureReady()` can report `false` before a turn starts (EC-7). A late /
	 * environment-specific failure still surfaces as the spawn `error` event →
	 * synthetic `error` chunk.
	 */
	private _resolveBinary(): string | null {
		const home = process.env.HOME ?? '';
		const names =
			process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude'];
		const dirs = [
			'/usr/local/bin',
			'/opt/homebrew/bin',
			home.length > 0 ? pathJoin(home, '.local', 'bin') : '',
			home.length > 0 ? pathJoin(home, '.claude', 'local') : '',
			...(process.env.PATH ?? '').split(PATH_DELIMITER),
		].filter((d) => d.length > 0);
		for (const dir of dirs) {
			for (const name of names) {
				const candidate = pathJoin(dir, name);
				if (existsSync(candidate)) return candidate;
			}
		}
		return null;
	}
}
