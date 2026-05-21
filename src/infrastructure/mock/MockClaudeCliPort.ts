import type {
	ChatTransportPort,
	ChatTransportQueryOptions,
	ChatTransportStreamOptions,
	StreamDelta,
} from '@/domain/ports/ChatTransportPort';
import { ChatTransportError } from '@/domain/ports/ChatTransportPort';
import type { TransportLifecyclePort } from '@/domain/ports/TransportLifecyclePort';
import type { SessionId } from '@/domain/chat/SessionId';

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for `ms` milliseconds, but return early as soon as `signal` fires.
 * Used by `queryStream` so streaming-call callers who cancel during a
 * scripted `delayMs` / `streamChunkDelayMs` get prompt feedback rather
 * than waiting out the full sleep (Codex P2 on PR #370 against the
 * subprocess mock — the same race semantics apply here).
 *
 * Pre-aborted signals short-circuit immediately: `AbortSignal` does NOT
 * replay the `abort` event to listeners added after the signal is already
 * aborted, so we must check `signal.aborted` BEFORE installing the
 * listener — otherwise an abort that happened between two streamed
 * chunks (or before the first `interruptibleSleep` call) would block
 * for the full sleep window (Codex P2 on PR #370 second pass).
 */
function interruptibleSleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	if (signal === undefined) return sleep(ms);
	if (signal.aborted) return Promise.resolve();
	return new Promise<void>((resolve) => {
		const t = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(t);
			resolve();
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Stub implementation of ChatTransportPort + TransportLifecyclePort for use in
 * dev mode and unit tests. Satisfies REQ-CCS-022, NFR-CCS-004, SPEC-CCS-001 §6.
 *
 * `available` defaults to false so the standalone browser UI (npm run dev)
 * renders the degraded state without a real subprocess.
 */
export class MockClaudeCliPort implements ChatTransportPort, TransportLifecyclePort {
	/**
	 * Controls the return value of isAvailable() and the no-op branch of queryStream().
	 * Default: false — the standalone browser UI and unit tests start unavailable.
	 */
	available = false;

	/**
	 * Text returned from queryStream() when available === true and queryError === null.
	 */
	cannedResponse = 'Mock response from MockClaudeCliPort.';

	/**
	 * If non-null, queryStream() emits this error instead of cannedResponse.
	 */
	queryError: ChatTransportError | null = null;

	/**
	 * Artificial delay for queryStream(). Unit: milliseconds. Default: 0.
	 */
	delayMs = 0;

	/**
	 * Append-only log of every prompt string passed to queryStream().
	 *
	 * Retained as `queryLog` (not `streamLog`) so the established assertion
	 * vocabulary in UI tests survives WP-12 — the underlying method is now
	 * `queryStream` but the captured prompt history is the same shape.
	 */
	readonly queryLog: string[] = [];

	/**
	 * Append-only log of every options object passed to queryStream().
	 * Parallel to {@link queryLog}: `optionsLog[i]` is the options for
	 * prompt `queryLog[i]`. `undefined` is preserved as-is.
	 *
	 * Added for T-ASM-040 so UI tests can assert the `systemPromptSuffix`
	 * threaded through by `ChatSidebar.handleSend` (REQ-ASM-013, REQ-ASM-018).
	 */
	readonly optionsLog: (ChatTransportQueryOptions | undefined)[] = [];

	/**
	 * Optional scripted deltas. When set via `setNextDelta`, the adapter emits
	 * these verbatim on the next `queryStream` call instead of the canned
	 * response path; consumed once per call (NFR-MPS-014 parity).
	 */
	private _nextDeltas: ReadonlyArray<StreamDelta> | null = null;

	/** Fluent helper — NFR-MPS-014 parity across all four mocks. */
	setAvailability(value: boolean): this {
		this.available = value;
		return this;
	}

	/** Force the next `queryStream` call to terminate with a single error. */
	setError(error: ChatTransportError | null): this {
		this.queryError = error;
		return this;
	}

	/** Script the next `queryStream` call's `StreamDelta` sequence. */
	setNextDelta(deltas: ReadonlyArray<StreamDelta>): this {
		this._nextDeltas = deltas;
		return this;
	}

	async startup(): Promise<void> {
		// No-op. Never throws.
	}

	shutdown(): void {
		// No-op. Never throws.
	}

	async isAvailable(): Promise<boolean> {
		return this.available;
	}

	/**
	 * Streaming-variant log paralleling `queryLog`/`optionsLog`. Allows tests to
	 * assert which prompts went through the streaming path and what options
	 * (including the optional `signal`) were threaded through.
	 */
	readonly streamLog: string[] = [];
	readonly streamOptionsLog: (ChatTransportStreamOptions | undefined)[] = [];

	/**
	 * Optional canned chunks for the streaming response. When non-empty, each
	 * entry is emitted as a separate `text` delta in order, then `done` follows.
	 * When empty (default), the streaming variant emits the full
	 * `cannedResponse` as a single `text` delta. Lets tests exercise both the
	 * "single big chunk" and "fine-grained deltas" paths.
	 */
	cannedStreamChunks: string[] = [];

	/**
	 * Optional canned session-id to emit before the first text delta. Mirrors
	 * the contract that real adapters fire `system/init` exactly once.
	 */
	cannedSessionId: SessionId | null = null;

	/**
	 * Per-chunk delay between emitted text deltas (milliseconds). Combined with
	 * `cannedStreamChunks` to simulate a slow stream.
	 */
	streamChunkDelayMs = 0;

	/** Read `options.signal.aborted` defensively (nullable boolean per strict lint). */
	private static _isAborted(options: ChatTransportStreamOptions | undefined): boolean {
		return options?.signal?.aborted === true;
	}

	private static _abortDelta(): StreamDelta {
		return {
			type: 'error',
			error: new ChatTransportError('QUERY_FAILED', 'MockClaudeCliPort: aborted'),
		};
	}

	/** Fire-and-forget the optional onSessionId callback; swallow throws. */
	private static _fireOnSessionId(
		options: ChatTransportStreamOptions | undefined,
		sessionId: SessionId,
	): void {
		try {
			options?.onSessionId?.(sessionId);
		} catch {
			// Mirror real-adapter contract — callback failures are swallowed.
		}
	}

	async *queryStream(prompt: string, options?: ChatTransportStreamOptions): AsyncIterable<StreamDelta> {
		this.streamLog.push(prompt);
		this.streamOptionsLog.push(options);
		// Mirror to the canonical `queryLog` / `optionsLog` so the established
		// assertion vocabulary (older tests / `collectStream` callers) keeps
		// working without migration.
		this.queryLog.push(prompt);
		this.optionsLog.push(options);

		if (this._nextDeltas !== null) {
			const scripted = this._nextDeltas;
			this._nextDeltas = null;
			for (const d of scripted) yield d;
			return;
		}

		if (!this.available) {
			yield {
				type: 'error',
				error: new ChatTransportError('NOT_INSTALLED', 'MockClaudeCliPort: not available'),
			};
			return;
		}
		// Sleeps race against the abort signal so a user-initiated cancel
		// during `delayMs` returns control promptly rather than waiting out
		// the full sleep (Codex P2, PR #370 — same pattern as the subprocess
		// mock).
		await interruptibleSleep(this.delayMs, options?.signal);
		if (MockClaudeCliPort._isAborted(options)) {
			yield MockClaudeCliPort._abortDelta();
			return;
		}
		if (this.queryError !== null) {
			yield { type: 'error', error: this.queryError };
			return;
		}
		if (this.cannedSessionId !== null) {
			yield { type: 'session-id', sessionId: this.cannedSessionId };
			MockClaudeCliPort._fireOnSessionId(options, this.cannedSessionId);
		}
		yield* this._streamChunks(options);
	}

	/**
	 * Yield each scripted text chunk with an interruptible inter-chunk sleep
	 * and a final abort re-check before the terminal `done`. Extracted from
	 * `queryStream` to keep its cyclomatic complexity below the lint cap.
	 *
	 * Codex P2 on PR #370: the post-loop re-check covers the race where
	 * abort fires during the FINAL chunk's `streamChunkDelayMs` — the loop
	 * has already exited so the top-of-loop guard wouldn't run.
	 */
	private async *_streamChunks(
		options: ChatTransportStreamOptions | undefined,
	): AsyncIterable<StreamDelta> {
		const chunks =
			this.cannedStreamChunks.length > 0 ? this.cannedStreamChunks : [this.cannedResponse];
		for (const chunk of chunks) {
			if (MockClaudeCliPort._isAborted(options)) {
				yield MockClaudeCliPort._abortDelta();
				return;
			}
			yield { type: 'text', text: chunk };
			await interruptibleSleep(this.streamChunkDelayMs, options?.signal);
		}
		if (MockClaudeCliPort._isAborted(options)) {
			yield MockClaudeCliPort._abortDelta();
			return;
		}
		yield { type: 'done' };
	}
}
