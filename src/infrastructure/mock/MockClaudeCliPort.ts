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
		if (this.delayMs > 0) await sleep(this.delayMs);
		if (this.queryError !== null) {
			yield { type: 'error', error: this.queryError };
			return;
		}
		if (MockClaudeCliPort._isAborted(options)) {
			yield MockClaudeCliPort._abortDelta();
			return;
		}
		if (this.cannedSessionId !== null) {
			yield { type: 'session-id', sessionId: this.cannedSessionId };
			MockClaudeCliPort._fireOnSessionId(options, this.cannedSessionId);
		}
		const chunks =
			this.cannedStreamChunks.length > 0 ? this.cannedStreamChunks : [this.cannedResponse];
		for (const chunk of chunks) {
			if (MockClaudeCliPort._isAborted(options)) {
				yield MockClaudeCliPort._abortDelta();
				return;
			}
			yield { type: 'text', text: chunk };
			if (this.streamChunkDelayMs > 0) await sleep(this.streamChunkDelayMs);
		}
		yield { type: 'done' };
	}
}
