/**
 * The shared ACP (Agent Client Protocol) JSON-RPC-over-stdio transport (P9,
 * SPEC-PV-010). A thin in-tree wrapper over {@link JsonRpcStdioChannel} (no new
 * runtime dependency, ADR-PV-003 §5) — ported in shape from claudian
 * `providers/acp/{AcpSubprocess,AcpJsonRpcTransport}.ts`. Used by the Opencode
 * runtime (and any future ACP-speaking provider).
 *
 * Posture (SPEC-PV-026):
 * - Bounded explicit spawn with the provider secret/env merged at this boundary
 *   (REQ-PV-031/101); the key is handed in by the owning runtime, never logged.
 * - `initialize` + a prompt request stream the agent's response as `StreamChunk`s;
 *   a per-request timeout/abort → `Result.err` (REQ-PV-051, EC-PV-11).
 * - A dying subprocess → a terminal `{type:'error'}` `StreamChunk` with the stderr
 *   ring-buffer (REQ-PV-052, EC-PV-12).
 * - No turn-steer (`supportsTurnSteer:false` for Opencode, REQ-PV-043).
 * - Graceful shutdown SIGTERM → SIGKILL(3s) (REQ-PV-044).
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — behavioural gate = the
 * manual legs TEST-PV-M2 + TEST-PV-040/044. No `obsidian` symbol leaks past this file.
 */
import type { LoggerPort, StreamChunk } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { JsonRpcStdioChannel, type SpawnSpec } from './JsonRpcStdioChannel';

export interface AcpTransportSpec extends SpawnSpec {
	/** The per-request timeout (ms); defaults to the channel default. */
	readonly requestTimeoutMs?: number;
}

type StreamItem = { kind: 'chunk'; chunk: StreamChunk } | { kind: 'end' };

export class AcpTransport {
	private readonly channel: JsonRpcStdioChannel;
	private queue: StreamItem[] = [];
	private wake: (() => void) | null = null;
	private ended = false;
	private initialized = false;

	constructor(
		private readonly spec: AcpTransportSpec,
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

	/** Spawn the ACP agent subprocess. A spawn fault → `Result.err`. */
	start(): Result<void> {
		return this.channel.start(this.spec);
	}

	/** The ACP `initialize` handshake; `Result.err` on timeout/protocol failure. */
	async initialize(): Promise<Result<unknown>> {
		const result = await this.channel.request(
			'initialize',
			{ protocolVersion: 1 },
			this.spec.requestTimeoutMs,
		);
		if (result.ok) this.initialized = true;
		return result;
	}

	/**
	 * Send a prompt and stream the agent's response (`session/update` notifications)
	 * as `StreamChunk`s. The prompt request is `Result`-typed; a dying subprocess
	 * ends the stream after a terminal error chunk (EC-PV-11/12).
	 */
	async *prompt(text: string): AsyncGenerator<StreamChunk> {
		this.queue = [];
		this.ended = false;
		if (!this.initialized) {
			const init = await this.initialize();
			if (!init.ok) {
				yield { type: 'error', content: init.error.message };
				yield { type: 'done' };
				return;
			}
		}
		const sent = await this.channel.request(
			'session/prompt',
			{ prompt: text },
			this.spec.requestTimeoutMs,
		);
		if (!sent.ok) {
			yield { type: 'error', content: sent.error.message };
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

	/** Gracefully shut the subprocess down SIGTERM → SIGKILL(3s) (REQ-PV-044). */
	shutdown(): void {
		this.channel.shutdown();
	}

	// ── internals ───────────────────────────────────────────────────────────────

	private _onNotification(method: string, params: unknown): void {
		const chunk = AcpTransport._toChunk(method, params);
		if (chunk !== null) this._enqueue({ kind: 'chunk', chunk });
		if (method === 'session/complete') {
			this._enqueue({ kind: 'chunk', chunk: { type: 'done' } });
			this._enqueue({ kind: 'end' });
		}
	}

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

	/** Map an ACP `session/update` notification to the normalized `StreamChunk`. */
	private static _toChunk(method: string, params: unknown): StreamChunk | null {
		if (method !== 'session/update') return null;
		const record =
			typeof params === 'object' && params !== null
				? (params as Record<string, unknown>)
				: {};
		const kind = typeof record.kind === 'string' ? record.kind : '';
		const text = typeof record.text === 'string' ? record.text : '';
		switch (kind) {
			case 'agent_message_delta':
				return { type: 'text', content: text };
			case 'agent_thought_delta':
				return { type: 'thinking', content: text };
			case 'error':
				return { type: 'error', content: text };
			default:
				return null;
		}
	}
}
