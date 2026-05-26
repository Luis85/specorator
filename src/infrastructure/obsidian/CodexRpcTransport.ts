/**
 * The Codex app-server JSON-RPC-over-stdio transport (P9, SPEC-PV-010). A thin
 * in-tree wrapper over {@link JsonRpcStdioChannel} (no new runtime dependency,
 * ADR-PV-003 §5) — ported in shape from claudian
 * `providers/codex/runtime/{CodexAppServerProcess,CodexRpcTransport}.ts`.
 *
 * Posture (SPEC-PV-026):
 * - Bounded explicit spawn of the `codex` app-server with the provider secret/env
 *   merged in at this boundary (REQ-PV-031/101) — the key is read by the owning
 *   runtime via `SecretStorePort.getSecret` and handed here, never logged.
 * - A turn streams as server→client notifications mapped to `StreamChunk`s; a
 *   per-request timeout/abort on the start request → `Result.err` (REQ-PV-051).
 * - A dying subprocess → a terminal `{type:'error'}` `StreamChunk` carrying the
 *   captured stderr ring-buffer (REQ-PV-052, EC-PV-12); the host stays responsive.
 * - Turn-steer (`supportsTurnSteer:true`, REQ-PV-033) injects a steer message into
 *   the in-progress turn via a notification.
 * - Graceful shutdown SIGTERM → SIGKILL(3s) (REQ-PV-035/044).
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is
 * the manual legs TEST-PV-M1 + TEST-PV-030/031/033/035/101. No `obsidian` symbol
 * leaks past this file.
 */
import type { LoggerPort, StreamChunk } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { JsonRpcStdioChannel, type SpawnSpec } from './JsonRpcStdioChannel';

/** The bounded spawn + the per-turn timeout the Codex app-server uses. */
export interface CodexTransportSpec extends SpawnSpec {
	/** The per-turn request timeout (ms); defaults to the channel default. */
	readonly turnTimeoutMs?: number;
}

/** A queued stream item: a chunk or the terminal sentinel. */
type StreamItem = { kind: 'chunk'; chunk: StreamChunk } | { kind: 'end' };

export class CodexRpcTransport {
	private readonly channel: JsonRpcStdioChannel;
	private queue: StreamItem[] = [];
	private wake: (() => void) | null = null;
	private ended = false;

	constructor(
		private readonly spec: CodexTransportSpec,
		logger?: LoggerPort,
	) {
		this.channel = new JsonRpcStdioChannel(
			{
				onNotification: (method, params) => {
					this._onNotification(method, params);
				},
				onClose: (detail) => {
					this._onClose(detail);
				},
			},
			logger,
		);
	}

	/** Spawn the app-server. A spawn fault → `Result.err` (the runtime surfaces it). */
	start(): Result<void> {
		return this.channel.start(this.spec);
	}

	/**
	 * Start a turn and stream the server's response as `StreamChunk`s. The start
	 * request is `Result`-typed — a timeout/abort yields a terminal error chunk; a
	 * dying subprocess ends the stream after the terminal error chunk (EC-PV-11/12).
	 */
	async *query(prompt: string): AsyncGenerator<StreamChunk> {
		this.queue = [];
		this.ended = false;
		const started = await this.channel.request(
			'turn/start',
			{ prompt },
			this.spec.turnTimeoutMs,
		);
		if (!started.ok) {
			yield { type: 'error', content: started.error.message };
			yield { type: 'done' };
			return;
		}
		for (;;) {
			const item = this.queue.shift();
			if (item !== undefined) {
				if (item.kind === 'end') return;
				yield item.chunk;
				continue;
			}
			if (this._isEnded()) return;
			await new Promise<void>((resolve) => {
				this.wake = resolve;
			});
		}
	}

	/** Opaque read of the terminal flag so the stream loop sees live state. */
	private _isEnded(): boolean {
		return this.ended;
	}

	/** Inject a steer message into the in-progress turn (REQ-PV-033). Never throws. */
	steer(message: string): Result<void> {
		return this.channel.notify('turn/steer', { message });
	}

	/** Gracefully shut the subprocess down SIGTERM → SIGKILL(3s) (REQ-PV-035). */
	shutdown(): void {
		this.channel.shutdown();
	}

	// ── internals ───────────────────────────────────────────────────────────────

	/** Map a server→client notification to a `StreamChunk` and enqueue it. */
	private _onNotification(method: string, params: unknown): void {
		const chunk = CodexRpcTransport._toChunk(method, params);
		if (chunk !== null) this._enqueue({ kind: 'chunk', chunk });
		if (method === 'turn/completed') {
			this._enqueue({ kind: 'chunk', chunk: { type: 'done' } });
			this._enqueue({ kind: 'end' });
		}
	}

	/** A dying subprocess → a terminal error chunk + end (EC-PV-12). */
	private _onClose(detail: string): void {
		if (this.ended) return;
		this._enqueue({ kind: 'chunk', chunk: { type: 'error', content: detail } });
		this._enqueue({ kind: 'chunk', chunk: { type: 'done' } });
		this._enqueue({ kind: 'end' });
	}

	private _enqueue(item: StreamItem): void {
		if (item.kind === 'end') this.ended = true;
		this.queue.push(item);
		const wake = this.wake;
		this.wake = null;
		if (wake !== null) wake();
	}

	/** Map the Codex app-server notification shape to the normalized `StreamChunk`. */
	private static _toChunk(method: string, params: unknown): StreamChunk | null {
		const record =
			typeof params === 'object' && params !== null
				? (params as Record<string, unknown>)
				: {};
		const text = typeof record.text === 'string' ? record.text : '';
		switch (method) {
			case 'turn/delta':
				return { type: 'text', content: text };
			case 'turn/thinking':
				return { type: 'thinking', content: text };
			case 'turn/error':
				return { type: 'error', content: text };
			default:
				return null;
		}
	}
}
