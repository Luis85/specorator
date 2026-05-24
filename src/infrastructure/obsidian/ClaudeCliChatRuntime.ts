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
} from '@/domain/ports';
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
			for await (const line of lines) {
				if (this._isCancelled()) break;
				for (const chunk of reducer.consumeLine(line)) {
					if (this._isCancelled()) break;
					if (chunk.type === 'usage') this.sessionId = reducer.sessionId;
					yield chunk;
				}
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
		if (this.sessionId !== null && this.sessionId.length > 0) {
			argv.push('--resume', this.sessionId);
		}
		if (queryOptions?.model !== undefined && queryOptions.model.length > 0) {
			argv.push('--model', queryOptions.model);
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

		child.stdin?.write(prompt);
		child.stdin?.end();

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
