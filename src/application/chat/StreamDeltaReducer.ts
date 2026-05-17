/**
 * StreamDeltaReducer — single codec seam between Claude transport adapters and
 * the chat store (ADR-0034, extends ADR-0033 codec-seam precedent).
 *
 * Both `ClaudeCliAdapter` (SDK) and `ClaudeSubprocessAdapter` (NDJSON) used to
 * independently translate `content_block_start` / `content_block_delta` /
 * `message_delta` / `compact_boundary` events into `StreamDelta`s. The two
 * code paths drifted: Codex P1 (PR #378) `messageSeq` blockId-collision and
 * Codex P2 (PR #386) partial-usage-merge had to ship twice — once per
 * adapter. The subprocess transport also independently dispatched both
 * `assistant/message` (whole-message text) AND `content_block_delta`
 * (per-token `text_delta`), producing duplicate text in the store
 * (Perf review F-2, mirrors Claudian PR #510 pattern).
 *
 * This reducer is the one place that owns the wire→delta translation. Both
 * adapters now feed it `RawClaudeEvent`s and emit only the `StreamDelta`s
 * the reducer returns. Per-stream mutable state (`turnId`, `messageSeq`,
 * `blockKinds`, `lastUsage`, `sessionIdEmitted`, `textDeltaSeenForMessage`)
 * lives here, not in the adapters.
 *
 * Architectural notes:
 *   - Pure application-layer module (no `obsidian` / SDK imports).
 *   - Returns `Result`-style error deltas; never throws.
 *   - One reducer instance per `queryStream()` call. Call `reset()` to reuse.
 *   - Emits at most one `session-id` delta per stream (REQ-ASM-031 parity).
 *   - Emits exactly one terminal `done` or `error` once consumed; subsequent
 *     events are no-ops.
 */

import {
	ClaudeCliError,
	type StreamDelta,
} from '@/domain/ports/ClaudeCliPort';
import { asSessionId, type SessionId } from '@/domain/chat/SessionId';

// -----------------------------------------------------------------------------
// Wire shapes — loose, structural. Mirrors the union the two adapters
// actually read (SDK `SDKMessage` + Anthropic `RawMessageStreamEvent` +
// subprocess NDJSON envelopes).
// -----------------------------------------------------------------------------

/**
 * Loosely-typed view of one inner SDK / NDJSON `stream_event` payload.
 */
export interface RawStreamEventInner {
	readonly type?: string;
	readonly index?: number;
	readonly content_block?: {
		readonly type?: string;
		readonly name?: string;
		readonly input?: unknown;
	};
	readonly delta?: {
		readonly type?: string;
		readonly text?: string;
		readonly thinking?: string;
		readonly partial_json?: string;
	};
	readonly usage?: {
		readonly input_tokens?: number;
		readonly output_tokens?: number;
	};
	readonly message?: {
		readonly usage?: {
			readonly input_tokens?: number;
			readonly output_tokens?: number;
		};
	};
}

/**
 * Discriminated union of the wire events the two transport adapters emit.
 * Kept structurally close to the raw shapes so adapters do minimal
 * translation before handing them to the reducer.
 *
 * Variants:
 *   - `system-init` — both `{type:'system',subtype:'init'}` (SDK + NDJSON
 *      modern form) and `{type:'system/init'}` (NDJSON legacy form) flatten
 *      into this variant on the adapter side. Session id carried as
 *      `sessionId`.
 *   - `system-compact-boundary` — `{type:'system',subtype:'compact_boundary'}`.
 *   - `stream-event` — wraps either the SDK's `{type:'stream_event',event:…}`
 *      or the NDJSON flatter form. The adapter passes the inner event verbatim.
 *   - `assistant-message` — the subprocess-specific whole-message text event
 *      `{type:'assistant/message',text}`. The SDK adapter never emits this.
 *   - `result` — `{type:'result',subtype?,result?,is_error?}` — terminal.
 */
export type RawClaudeEvent =
	| {
			readonly kind: 'system-init';
			/** The session id captured from the wire — `null` if absent. */
			readonly sessionId: string | null;
	  }
	| {
			readonly kind: 'system-compact-boundary';
			readonly reason?: string;
	  }
	| {
			readonly kind: 'stream-event';
			readonly event: RawStreamEventInner;
	  }
	| {
			readonly kind: 'assistant-message';
			readonly text: string;
	  }
	| {
			readonly kind: 'result';
			/** SDK uses 'success' | 'error_*'; subprocess uses `is_error`. */
			readonly subtype?: string;
			/** Fallback whole-result text. */
			readonly result?: string;
			/** Subprocess transport's failure flag. */
			readonly is_error?: boolean;
	  };

/**
 * Per-message tracking: each `content_block_*` event carries an `index` that
 * is scoped to the current message. Multi-step tool loops reset the index
 * back to 0 on each `message_start` event, so we namespace block ids with a
 * monotonic `messageSeq` AND the per-turn `turnId` (Codex P1 PR #378).
 */
interface BlockEntry {
	readonly kind: 'text' | 'thinking' | 'tool_use';
	readonly blockId: string;
}

/**
 * Public stream-shaped options the reducer needs at construction time. Kept
 * deliberately tiny — the reducer doesn't know about transport timeouts,
 * abort signals, or argv builders.
 */
export interface StreamDeltaReducerOptions {
	/**
	 * Stable per-stream identifier used to mint `blockId`s of the form
	 * `${turnId}-${messageSeq}-${index}`. Adapters generate this with
	 * `crypto.randomUUID()` per `queryStream()` call.
	 */
	readonly turnId: string;
}

/**
 * Single-stream reducer. Construct one per `queryStream()` call, feed each
 * wire event through `consume()`, yield every returned delta to the consumer.
 * `consume()` returns a frozen tuple to make accidental mutation by the
 * caller a type error.
 */
export class StreamDeltaReducer {
	private readonly _turnId: string;
	/**
	 * Monotonic message counter — bumped on every `message_start` so the
	 * blockId namespace resets per-message. Codex P1 PR #378.
	 */
	private _messageSeq = 0;
	/**
	 * Map from `content_block_*` `.index` → tracking entry. Cleared on every
	 * `message_start` because the SDK's content-block indices reset to 0
	 * each message in multi-step tool loops.
	 */
	private _blockKinds = new Map<number, BlockEntry>();
	/**
	 * `session-id` single-fire flag — the port contract demands at most one
	 * `session-id` delta per stream regardless of how many `system/init`
	 * events the wire emits.
	 */
	private _sessionIdEmitted = false;
	/**
	 * True after at least one `text` delta has been emitted. Used by the
	 * `result` handler to decide whether to fall back to the whole-result
	 * `result.result` text.
	 */
	private _textEmitted = false;
	/**
	 * Subprocess dedup invariant: once a `text_delta` content_block_delta
	 * event has been seen for the current message, any subsequent
	 * `assistant-message` whole-message text envelope for that message is
	 * dropped. This closes the double-push gap that Perf review F-2 / Claudian
	 * PR #510 identified.
	 *
	 * Reset on every `message_start` because each message is its own dedup
	 * scope. Also set true by `assistant-message` itself so a stray late
	 * `text_delta` after an explicit whole-message text doesn't double-render
	 * either.
	 */
	private _textDeltaSeenForCurrentMessage = false;
	/**
	 * Last-emitted usage frame. Codex P2 PR #386: partial `message_delta.usage`
	 * frames often include only the field(s) that changed; missing fields
	 * mean "unchanged from prior", NOT zero. Merge against this snapshot.
	 */
	private _lastUsage: { input: number; output: number } | null = null;
	/**
	 * True after the terminal `done` or `error` delta has been emitted.
	 * Subsequent `consume()` calls return an empty array.
	 */
	private _terminated = false;

	constructor(options: StreamDeltaReducerOptions) {
		this._turnId = options.turnId;
	}

	/**
	 * Stable per-stream identifier. Exposed for adapter telemetry that wants
	 * to log the same id the reducer mints into blockIds.
	 */
	get turnId(): string {
		return this._turnId;
	}

	/** True after the terminal `done` / `error` delta has been emitted. */
	get terminated(): boolean {
		return this._terminated;
	}

	/** True if at least one `text` delta has been emitted on this stream. */
	hasText(): boolean {
		return this._textEmitted;
	}

	/**
	 * Reset all per-stream mutable state. Used by tests and by adapters that
	 * recycle a reducer across retries (currently nobody — kept for symmetry).
	 */
	reset(): void {
		this._messageSeq = 0;
		this._blockKinds = new Map<number, BlockEntry>();
		this._sessionIdEmitted = false;
		this._textEmitted = false;
		this._textDeltaSeenForCurrentMessage = false;
		this._lastUsage = null;
		this._terminated = false;
	}

	/**
	 * Consume one wire event and return the resulting deltas to yield. The
	 * returned array may be empty (event was understood but produced no delta —
	 * e.g. a `content_block_start` for a text block) or contain multiple
	 * entries (e.g. a `result` with no preceding text yields `[text, done]`).
	 * After the terminal delta is emitted, subsequent calls return `[]`.
	 */
	consume(event: RawClaudeEvent): readonly StreamDelta[] {
		if (this._terminated) return [];
		switch (event.kind) {
			case 'system-init':
				return this._consumeSystemInit(event);
			case 'system-compact-boundary':
				return this._consumeCompactBoundary(event);
			case 'stream-event':
				return this._consumeStreamEvent(event.event);
			case 'assistant-message':
				return this._consumeAssistantMessage(event);
			case 'result':
				return this._consumeResult(event);
		}
	}

	/**
	 * Emit a terminal `error` delta out-of-band — used by adapters when a
	 * transport-level failure (subprocess close, timeout, abort) needs to
	 * surface through the same channel as wire-level errors. Idempotent.
	 */
	emitError(error: ClaudeCliError): readonly StreamDelta[] {
		if (this._terminated) return [];
		this._terminated = true;
		return [{ type: 'error', error }];
	}

	// ── Private dispatch helpers ────────────────────────────────────────────

	private _consumeSystemInit(event: {
		readonly sessionId: string | null;
	}): readonly StreamDelta[] {
		if (this._sessionIdEmitted) return [];
		const raw = event.sessionId;
		if (raw === null || raw.length === 0) return [];
		this._sessionIdEmitted = true;
		const sid: SessionId = asSessionId(raw);
		return [{ type: 'session-id', sessionId: sid }];
	}

	private _consumeCompactBoundary(event: {
		readonly reason?: string;
	}): readonly StreamDelta[] {
		if (event.reason !== undefined && event.reason.length > 0) {
			return [{ type: 'compact-boundary', reason: event.reason }];
		}
		return [{ type: 'compact-boundary' }];
	}

	private _consumeStreamEvent(inner: RawStreamEventInner): readonly StreamDelta[] {
		if (inner.type === 'message_start' || inner.type === 'message_delta') {
			return this._handleMessageFrame(inner);
		}
		if (inner.type === 'content_block_start') {
			return this._handleBlockStart(inner);
		}
		if (inner.type === 'content_block_delta') {
			return this._handleBlockDelta(inner);
		}
		if (inner.type === 'content_block_stop') {
			return this._handleBlockStop(inner);
		}
		return [];
	}

	private _handleMessageFrame(inner: RawStreamEventInner): readonly StreamDelta[] {
		// Codex P1 PR #378 — bump `messageSeq` AND reset `blockKinds` on every
		// `message_start` so content-block indices that restart at 0 per
		// message get a fresh blockId namespace. Also reset the dedup flag so
		// each message gets its own text-delta-vs-whole-message decision.
		if (inner.type === 'message_start') {
			this._messageSeq++;
			this._blockKinds = new Map<number, BlockEntry>();
			this._textDeltaSeenForCurrentMessage = false;
		}
		const usage = this._extractUsage(inner);
		return usage === null ? [] : [usage];
	}

	private _handleBlockStart(inner: RawStreamEventInner): readonly StreamDelta[] {
		const index = typeof inner.index === 'number' ? inner.index : -1;
		const block = inner.content_block;
		if (index < 0 || block === undefined) return [];
		const blockId = `${this._turnId}-${this._messageSeq}-${index}`;
		// Codex P2 PR #378 — any block whose `type` ends with `tool_use`
		// participates in the tool-use lifecycle (covers `tool_use`,
		// `server_tool_use`, future variants).
		if (typeof block.type === 'string' && block.type.endsWith('tool_use')) {
			this._blockKinds.set(index, { kind: 'tool_use', blockId });
			return [
				{
					type: 'tool-use-start',
					blockId,
					toolName: typeof block.name === 'string' ? block.name : 'unknown',
					// Codex P1 PR #378 — do NOT seed `inputJson` with the
					// `content_block_start` placeholder (commonly `{}`). The real
					// payload arrives via `input_json_delta`.
					inputJson: '',
				},
			];
		}
		if (block.type === 'thinking') {
			this._blockKinds.set(index, { kind: 'thinking', blockId });
			return [];
		}
		// Text blocks need no start delta — `text_delta` carries everything.
		this._blockKinds.set(index, { kind: 'text', blockId });
		return [];
	}

	private _handleBlockDelta(inner: RawStreamEventInner): readonly StreamDelta[] {
		const delta = inner.delta;
		const index = typeof inner.index === 'number' ? inner.index : -1;
		if (delta === undefined || index < 0) return [];
		if (delta.type === 'text_delta') return this._handleTextDelta(delta);
		if (delta.type === 'thinking_delta') return StreamDeltaReducer._handleThinkingDelta(delta);
		if (delta.type === 'input_json_delta') return this._handleInputJsonDelta(delta, index);
		return [];
	}

	private _handleTextDelta(
		delta: NonNullable<RawStreamEventInner['delta']>,
	): readonly StreamDelta[] {
		const text = typeof delta.text === 'string' ? delta.text : '';
		if (text.length === 0) return [];
		this._textEmitted = true;
		this._textDeltaSeenForCurrentMessage = true;
		return [{ type: 'text', text }];
	}

	private static _handleThinkingDelta(
		delta: NonNullable<RawStreamEventInner['delta']>,
	): readonly StreamDelta[] {
		const text = typeof delta.thinking === 'string' ? delta.thinking : '';
		if (text.length === 0) return [];
		return [{ type: 'thinking', text }];
	}

	private _handleInputJsonDelta(
		delta: NonNullable<RawStreamEventInner['delta']>,
		index: number,
	): readonly StreamDelta[] {
		const tracked = this._blockKinds.get(index);
		if (tracked?.kind !== 'tool_use') return [];
		const partial = typeof delta.partial_json === 'string' ? delta.partial_json : '';
		return [
			{
				type: 'tool-use-input-delta',
				blockId: tracked.blockId,
				inputJson: partial,
			},
		];
	}

	private _handleBlockStop(inner: RawStreamEventInner): readonly StreamDelta[] {
		const index = typeof inner.index === 'number' ? inner.index : -1;
		if (index < 0) return [];
		const tracked = this._blockKinds.get(index);
		this._blockKinds.delete(index);
		if (tracked?.kind === 'tool_use') {
			return [{ type: 'tool-use-stop', blockId: tracked.blockId }];
		}
		return [];
	}

	/**
	 * Subprocess `assistant/message` envelope — whole-message text. Subject
	 * to the per-message dedup invariant: if a `text_delta` was already
	 * emitted for the current message, drop this whole-message text (Perf
	 * review F-2 / Claudian PR #510). The dedup flag is set ONLY by
	 * `text_delta` consumption — multiple consecutive `assistant/message`
	 * events without any preceding `text_delta` are passed through verbatim
	 * (CLI streams that emit whole-message events incrementally rely on
	 * this).
	 */
	private _consumeAssistantMessage(event: {
		readonly text: string;
	}): readonly StreamDelta[] {
		if (this._textDeltaSeenForCurrentMessage) return [];
		const text = event.text;
		if (text.length === 0) return [];
		this._textEmitted = true;
		return [{ type: 'text', text }];
	}

	private _consumeResult(event: {
		readonly subtype?: string;
		readonly result?: string;
		readonly is_error?: boolean;
	}): readonly StreamDelta[] {
		// SDK form: non-`'success'` subtype → terminal error.
		if (typeof event.subtype === 'string' && event.subtype !== 'success') {
			this._terminated = true;
			return [
				{
					type: 'error',
					error: new ClaudeCliError(
						'QUERY_FAILED',
						`SDK returned result error: ${event.subtype}`,
					),
				},
			];
		}
		// Subprocess form: `is_error: true` → terminal error.
		if (event.is_error === true) {
			this._terminated = true;
			return [
				{
					type: 'error',
					error: new ClaudeCliError(
						'QUERY_FAILED',
						'Claude CLI returned result event with is_error=true',
					),
				},
			];
		}
		const out: StreamDelta[] = [];
		if (!this._textEmitted) {
			const fallback = typeof event.result === 'string' ? event.result : '';
			if (fallback.length > 0) {
				this._textEmitted = true;
				out.push({ type: 'text', text: fallback });
			}
		}
		out.push({ type: 'done' });
		this._terminated = true;
		return out;
	}

	private _extractUsage(inner: RawStreamEventInner): StreamDelta | null {
		const usage = inner.usage ?? inner.message?.usage;
		if (usage === undefined) return null;
		const partial = StreamDeltaReducer._readPartialUsage(usage);
		if (partial === null) return null;
		// Read possibly-partial usage. Missing fields mean "unchanged from
		// prior" (Codex P2 PR #386), not zero. Merge against `_lastUsage`.
		const prior = this._lastUsage ?? { input: 0, output: 0 };
		const merged = {
			input: partial.input ?? prior.input,
			output: partial.output ?? prior.output,
		};
		if (StreamDeltaReducer._shouldSuppressUsage(merged, this._lastUsage)) return null;
		this._lastUsage = merged;
		return { type: 'usage', inputTokens: merged.input, outputTokens: merged.output };
	}

	private static _readPartialUsage(
		usage: NonNullable<RawStreamEventInner['usage']>,
	): { input: number | null; output: number | null } | null {
		const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
		const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
		if (input === null && output === null) return null;
		return { input, output };
	}

	private static _shouldSuppressUsage(
		merged: { input: number; output: number },
		prior: { input: number; output: number } | null,
	): boolean {
		// Skip zero-zero noise (some endpoints push usage on `message_start`
		// before any tokens have been produced).
		if (merged.input === 0 && merged.output === 0) return true;
		// Suppress redundant emits — a `message_delta` that brings no new
		// info shouldn't generate a delta.
		if (prior !== null && merged.input === prior.input && merged.output === prior.output) {
			return true;
		}
		return false;
	}
}
