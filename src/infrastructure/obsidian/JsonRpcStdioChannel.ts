/**
 * A thin, in-tree line-delimited JSON-RPC 2.0 channel over a child process's stdio
 * (P9, SPEC-PV-010, ADR-PV-003 §5). **No new runtime dependency** — the Codex
 * app-server transport (`CodexRpcTransport`) and the shared ACP transport
 * (`AcpTransport`) both build on this. Mirrors `ClaudeCliChatRuntime`'s bounded
 * explicit spawn + the `SdkMcpClient` enhanced-PATH/merged-env posture.
 *
 * Posture (SPEC-PV-026 state model):
 * - **Bounded explicit spawn** — explicit cmd+args, a bounded merged env
 *   `{ ...process.env, <provider secret/env>, PATH: enhancedPath }`, `windowsHide`,
 *   **no `shell:true` / string-eval**; Windows `.cmd` quoting via `cmd.exe /d /s /c`
 *   + `windowsVerbatimArguments` (REQ-PV-031/101).
 * - **Line-delimited JSON-RPC 2.0** — one newline-terminated JSON message per frame;
 *   client→server requests (with a per-request timeout + `AbortController`),
 *   notifications, and server→client request handlers (REQ-PV-050).
 * - **Timeout / abort → `Result.err`** — a request that does not resolve within its
 *   timeout aborts and resolves `err`; the channel stays usable (REQ-PV-051, EC-PV-11).
 * - **A dying subprocess** surfaces through `onClose` so the owning runtime can yield
 *   a terminal `{type:'error'}` `StreamChunk` carrying the captured stderr ring-buffer
 *   (REQ-PV-052, EC-PV-12).
 * - **Graceful shutdown** — `shutdown()` aborts in-flight requests then SIGTERM →
 *   SIGKILL after a bounded 3s grace (REQ-PV-035/044); never leaks a process.
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is
 * the manual legs TEST-PV-M1/M2 + TEST-PV-030/031/033/035/040/044/101. No
 * `obsidian` symbol leaks past this file.
 */
import {
	spawn,
	type ChildProcess,
	type SpawnOptions,
} from 'node:child_process';
import { delimiter as PATH_DELIMITER } from 'node:path';

import type { LoggerPort } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/** A JSON-RPC 2.0 id (string or number). */
export type JsonRpcId = string | number;

/** A parsed JSON-RPC 2.0 frame (request, response, or notification). */
export interface JsonRpcMessage {
	jsonrpc?: '2.0';
	id?: JsonRpcId;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

/** A server→client request handler: resolves the `result` (or throws to error). */
export type ServerRequestHandler = (method: string, params: unknown) => Promise<unknown>;

/** The bounded spawn description (explicit cmd+args; no shell). */
export interface SpawnSpec {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string | null;
	/** Extra env merged over `process.env` (e.g. the provider secret/env). */
	readonly env?: Readonly<Record<string, string>>;
}

/** Channel lifecycle callbacks the owning runtime wires. */
export interface ChannelHandlers {
	/** Handle a server→client request; absent → method-not-found error reply. */
	onServerRequest?: ServerRequestHandler;
	/** Handle a server→client notification (fire-and-forget). */
	onNotification?: (method: string, params: unknown) => void;
	/** Called once when the subprocess closes/errs, with the captured stderr detail. */
	onClose?: (detail: string) => void;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_GRACE_MS = 3_000;
const STDERR_RING_BYTES = 8_192;

interface PendingRequest {
	resolve: (value: Result<unknown>) => void;
	timer: number;
	controller: AbortController;
}

export class JsonRpcStdioChannel {
	private child: ChildProcess | null = null;
	private buffer = '';
	private idSeq = 0;
	private stderrRing = '';
	private closed = false;
	private readonly pending = new Map<JsonRpcId, PendingRequest>();

	constructor(
		private readonly handlers: ChannelHandlers = {},
		private readonly logger?: LoggerPort,
	) {}

	/** Spawn the subprocess with a bounded explicit env (no shell). Total — `Result`. */
	start(spec: SpawnSpec): Result<void> {
		try {
			const { command, args } = JsonRpcStdioChannel._windowsQuote(spec);
			const opts = JsonRpcStdioChannel._spawnOptions(spec, command);
			const child = spawn(command, args, opts);
			this.child = child;
			this._wireStreams(child);
			return ok(undefined);
		} catch (e: unknown) {
			return err(e instanceof Error ? e : new Error('failed to spawn provider process'));
		}
	}

	/**
	 * Send a client→server request and resolve its response within `timeoutMs`
	 * (default 30s). A timeout/abort → `Result.err` and the channel stays usable
	 * (REQ-PV-051). Never throws.
	 */
	request(
		method: string,
		params?: unknown,
		timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
	): Promise<Result<unknown>> {
		if (this.child === null || this.closed) {
			return Promise.resolve(err(new Error('channel is not connected')));
		}
		const id: JsonRpcId = (this.idSeq += 1);
		return new Promise<Result<unknown>>((resolve) => {
			const controller = new AbortController();
			const timer = activeWindow.setTimeout(() => {
				this._settle(id, err(new Error(`request '${method}' timed out`)));
				controller.abort();
			}, timeoutMs);
			this.pending.set(id, { resolve, timer, controller });
			const written = this._write({ jsonrpc: '2.0', id, method, params });
			if (!written.ok) {
				this._settle(id, err(written.error));
			}
		});
	}

	/** Send a fire-and-forget notification (no response expected). Never throws. */
	notify(method: string, params?: unknown): Result<void> {
		if (this.child === null || this.closed) {
			return err(new Error('channel is not connected'));
		}
		return this._write({ jsonrpc: '2.0', method, params });
	}

	/**
	 * Abort in-flight requests then shut the subprocess down SIGTERM → SIGKILL after a
	 * bounded 3s grace (REQ-PV-035/044). Idempotent; never leaks a process; never throws.
	 */
	shutdown(): void {
		for (const [id, request] of this.pending) {
			activeWindow.clearTimeout(request.timer);
			request.controller.abort();
			request.resolve(err(new Error('channel shut down')));
			this.pending.delete(id);
		}
		const child = this.child;
		if (child === null) return;
		this.child = null;
		this.closed = true;
		try {
			child.kill('SIGTERM');
		} catch {
			// already gone — kill is best-effort.
		}
		const grace = activeWindow.setTimeout(() => {
			try {
				child.kill('SIGKILL');
			} catch {
				// already gone.
			}
		}, SHUTDOWN_GRACE_MS);
		child.once('close', () => {
			activeWindow.clearTimeout(grace);
		});
	}

	/** The captured stderr ring-buffer detail (for the terminal error chunk). */
	getStderrDetail(): string {
		return this.stderrRing.trim();
	}

	// ── internals ───────────────────────────────────────────────────────────────

	private _wireStreams(child: ChildProcess): void {
		child.stdout?.on('data', (data: Buffer | string) => {
			this.buffer += typeof data === 'string' ? data : data.toString('utf8');
			this._drainLines();
		});
		child.stderr?.on('data', (data: Buffer | string) => {
			const text = typeof data === 'string' ? data : data.toString('utf8');
			this.stderrRing = (this.stderrRing + text).slice(-STDERR_RING_BYTES);
		});
		const onGone = (reason: string): void => {
			if (this.closed) return;
			this.closed = true;
			this._failAllPending(reason);
			this.handlers.onClose?.(this.getStderrDetail() || reason);
		};
		child.on('close', () => {
			onGone('provider process closed');
		});
		child.on('error', (e: Error) => {
			this.logger?.debug('provider-rpc.process_error', { detail: e.message });
			onGone(e.message);
		});
	}

	private _drainLines(): void {
		let nl = this.buffer.indexOf('\n');
		while (nl !== -1) {
			const line = this.buffer.slice(0, nl).trim();
			this.buffer = this.buffer.slice(nl + 1);
			if (line.length > 0) this._handleLine(line);
			nl = this.buffer.indexOf('\n');
		}
	}

	private _handleLine(line: string): void {
		let message: JsonRpcMessage;
		try {
			message = JSON.parse(line) as JsonRpcMessage;
		} catch {
			this.logger?.debug('provider-rpc.bad_frame', { detail: line.slice(0, 200) });
			return;
		}
		const id = message.id;
		const method = message.method;
		if (id !== undefined && method === undefined) {
			this._handleResponse(message);
		} else if (id !== undefined && method !== undefined) {
			void this._handleServerRequest(id, method, message.params);
		} else if (method !== undefined) {
			this.handlers.onNotification?.(method, message.params);
		}
	}

	/** Resolve a pending client request from a JSON-RPC response frame. */
	private _handleResponse(message: JsonRpcMessage): void {
		const id = message.id;
		if (id === undefined || !this.pending.has(id)) return;
		if (message.error !== undefined) {
			this._settle(id, err(new Error(message.error.message)));
		} else {
			this._settle(id, ok(message.result));
		}
	}

	private async _handleServerRequest(
		id: JsonRpcId,
		method: string,
		params: unknown,
	): Promise<void> {
		const handler = this.handlers.onServerRequest;
		if (handler === undefined) {
			this._write({
				jsonrpc: '2.0',
				id,
				error: { code: -32601, message: 'method not found' },
			});
			return;
		}
		try {
			const result = await handler(method, params);
			this._write({ jsonrpc: '2.0', id, result });
		} catch (e: unknown) {
			this._write({
				jsonrpc: '2.0',
				id,
				error: { code: -32603, message: e instanceof Error ? e.message : 'handler error' },
			});
		}
	}

	private _settle(id: JsonRpcId, result: Result<unknown>): void {
		const pending = this.pending.get(id);
		if (pending === undefined) return;
		activeWindow.clearTimeout(pending.timer);
		this.pending.delete(id);
		pending.resolve(result);
	}

	private _failAllPending(reason: string): void {
		for (const [id, request] of this.pending) {
			activeWindow.clearTimeout(request.timer);
			request.resolve(err(new Error(reason)));
			this.pending.delete(id);
		}
	}

	private _write(message: JsonRpcMessage): Result<void> {
		const stdin = this.child?.stdin;
		if (stdin === null || stdin === undefined) {
			return err(new Error('channel stdin is not writable'));
		}
		try {
			stdin.write(`${JSON.stringify(message)}\n`);
			return ok(undefined);
		} catch (e: unknown) {
			return err(e instanceof Error ? e : new Error('failed to write to provider stdin'));
		}
	}

	/**
	 * Build the bounded merged env (no secret logged) + `windowsHide`, never a shell.
	 * A Windows `.cmd`/`.bat` launch routed through `cmd.exe` sets
	 * `windowsVerbatimArguments` so the already-quoted argv is not re-processed
	 * (REQ-PV-031).
	 */
	private static _spawnOptions(spec: SpawnSpec, command: string): SpawnOptions {
		const env: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (typeof value === 'string') env[key] = value;
		}
		if (spec.env !== undefined) Object.assign(env, spec.env);
		env.PATH = JsonRpcStdioChannel._enhancedPath();
		const base: SpawnOptions = {
			stdio: ['pipe', 'pipe', 'pipe'],
			env,
			windowsHide: true,
			shell: false,
		};
		if (command.toLowerCase() === 'cmd.exe') {
			base.windowsVerbatimArguments = true;
		}
		if (typeof spec.cwd === 'string' && spec.cwd.length > 0) base.cwd = spec.cwd;
		return base;
	}

	/**
	 * Windows `.cmd`/`.bat` launchers must run through `cmd.exe /d /s /c` so the OS
	 * resolves the batch wrapper, never `shell:true`/string-eval (REQ-PV-031/101).
	 * Other platforms (and bare executables) pass through unchanged. Arguments are
	 * quoted verbatim (the SpawnOptions set `windowsVerbatimArguments`).
	 */
	private static _windowsQuote(spec: SpawnSpec): { command: string; args: string[] } {
		const isWindowsBatch =
			process.platform === 'win32' && /\.(cmd|bat)$/i.test(spec.command);
		if (!isWindowsBatch) {
			return { command: spec.command, args: [...spec.args] };
		}
		const quoted = [spec.command, ...spec.args].map((part) =>
			/[\s"]/.test(part) ? `"${part.replace(/"/g, '""')}"` : part,
		);
		return { command: 'cmd.exe', args: ['/d', '/s', '/c', ...quoted] };
	}

	/** Enhanced PATH so a GUI-launched Obsidian can find user-installed binaries. */
	private static _enhancedPath(): string {
		const extra = [
			'/usr/local/bin',
			'/opt/homebrew/bin',
			`${process.env.HOME ?? ''}/.local/bin`,
		];
		const current = process.env.PATH ?? '';
		return [current, ...extra].filter((p) => p.length > 0).join(PATH_DELIMITER);
	}
}
