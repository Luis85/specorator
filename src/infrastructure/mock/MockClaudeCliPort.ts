import type {
	ClaudeCliPort,
	ClaudeCliQueryOptions,
	ClaudeCliStreamOptions,
	StreamDelta,
} from '@/domain/ports/ClaudeCliPort';
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
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
 * Stub implementation of ClaudeCliPort for use in dev mode and unit tests.
 * Satisfies REQ-CCS-022, NFR-CCS-004, SPEC-CCS-001 §6.
 *
 * `available` defaults to false so the standalone browser UI (npm run dev)
 * renders the degraded state without a real subprocess.
 */
export class MockClaudeCliPort implements ClaudeCliPort {
	/**
	 * Controls the return value of isAvailable() and the no-op branch of query().
	 * Default: false — the standalone browser UI and unit tests start unavailable.
	 */
	available = false;

	/**
	 * Text returned from query() when available === true and queryError === null.
	 */
	cannedResponse = 'Mock response from MockClaudeCliPort.';

	/**
	 * If non-null, query() returns this error instead of cannedResponse.
	 */
	queryError: ClaudeCliError | null = null;

	/**
	 * Artificial delay for query(). Unit: milliseconds. Default: 0.
	 */
	delayMs = 0;

	/**
	 * Append-only log of every prompt string passed to query().
	 */
	readonly queryLog: string[] = [];

	/**
	 * Append-only log of every options object passed to query(). Parallel to
	 * {@link queryLog}: `optionsLog[i]` is the options for prompt `queryLog[i]`.
	 * `undefined` is preserved as-is (caller passed no options).
	 *
	 * Added for T-ASM-040 so UI tests can assert the `systemPromptSuffix`
	 * threaded through by `ChatSidebar.handleSend` (REQ-ASM-013, REQ-ASM-018).
	 */
	readonly optionsLog: (ClaudeCliQueryOptions | undefined)[] = [];

	async startup(): Promise<void> {
		// No-op. Never throws.
	}

	shutdown(): void {
		// No-op. Never throws.
	}

	async isAvailable(): Promise<boolean> {
		return this.available;
	}

	async query(
		prompt: string,
		options?: ClaudeCliQueryOptions,
	): Promise<Result<string, ClaudeCliError>> {
		this.queryLog.push(prompt);
		this.optionsLog.push(options);

		if (!this.available) {
			return err(new ClaudeCliError('NOT_INSTALLED', 'MockClaudeCliPort: not available'));
		}

		if (this.delayMs > 0) await sleep(this.delayMs);

		if (this.queryError !== null) {
			return err(this.queryError);
		}

		return ok(this.cannedResponse);
	}

	/**
	 * Streaming-variant log paralleling `queryLog`/`optionsLog`. Allows tests to
	 * assert which prompts went through the streaming path and what options
	 * (including the optional `signal`) were threaded through.
	 */
	readonly streamLog: string[] = [];
	readonly streamOptionsLog: (ClaudeCliStreamOptions | undefined)[] = [];

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
	private static _isAborted(options: ClaudeCliStreamOptions | undefined): boolean {
		return options?.signal?.aborted === true;
	}

	private static _abortDelta(): StreamDelta {
		return {
			type: 'error',
			error: new ClaudeCliError('QUERY_FAILED', 'MockClaudeCliPort: aborted'),
		};
	}

	/** Fire-and-forget the optional onSessionId callback; swallow throws. */
	private static _fireOnSessionId(
		options: ClaudeCliStreamOptions | undefined,
		sessionId: SessionId,
	): void {
		try {
			options?.onSessionId?.(sessionId);
		} catch {
			// Mirror real-adapter contract — callback failures are swallowed.
		}
	}

	async *queryStream(prompt: string, options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta> {
		this.streamLog.push(prompt);
		this.streamOptionsLog.push(options);

		if (!this.available) {
			yield {
				type: 'error',
				error: new ClaudeCliError('NOT_INSTALLED', 'MockClaudeCliPort: not available'),
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
		options: ClaudeCliStreamOptions | undefined,
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
