import type {
	ChatTransportPort,
	ChatTransportStreamOptions,
	StreamDelta,
} from '@/domain/ports/ChatTransportPort'
import { ChatTransportError } from '@/domain/ports/ChatTransportPort'

/**
 * Test / dev fake for `CursorApiAdapter` (NFR-MPS-014).
 *
 * Mirrors the configuration knob shape of `MockClaudeCliPort`: callers may
 * either set the public field directly (`available`, `cannedResponse`,
 * `queryError`, `delayMs`, `cannedStreamChunks`) or use the fluent helper
 * methods `setAvailability` / `setNextDelta` / `setError` for ergonomics.
 *
 * Defaults to `available = false` so the standalone browser UI and unit
 * tests boot in the degraded state, matching the Claude mock.
 */
export class MockCursorApiAdapter implements ChatTransportPort {
	/** Controls `isAvailable()`. Default false so dev mode boots degraded. */
	available = false

	/** Single-chunk text emitted when no `cannedStreamChunks` are set. */
	cannedResponse = 'Mock response from MockCursorApiAdapter.'

	/** When non-null, `queryStream` emits this error in place of any text. */
	queryError: ChatTransportError | null = null

	/** Artificial delay before the first delta. Milliseconds. */
	delayMs = 0

	/** Inter-chunk delay. Milliseconds. */
	streamChunkDelayMs = 0

	/** Optional canned text chunks; emitted in order followed by `done`. */
	cannedStreamChunks: string[] = []

	/** Append-only log of prompts (mirrors `MockClaudeCliPort.queryLog`). */
	readonly queryLog: string[] = []
	readonly optionsLog: (ChatTransportStreamOptions | undefined)[] = []

	/**
	 * Optional scripted deltas. When set via `setNextDelta`, the adapter emits
	 * these verbatim on the next `queryStream` call **instead of** the canned
	 * response / chunks path; the queue is consumed once per call so successive
	 * calls fall back to the default behaviour unless re-scripted.
	 */
	private _nextDeltas: ReadonlyArray<StreamDelta> | null = null

	async isAvailable(): Promise<boolean> {
		return this.available
	}

	/** Fluent helper — `setAvailability(true)` parallels the Claude-side mock. */
	setAvailability(value: boolean): this {
		this.available = value
		return this
	}

	/**
	 * Script the exact `StreamDelta` sequence the next `queryStream` call
	 * yields. The script is consumed once and then cleared; the caller may
	 * re-script before the next call.
	 */
	setNextDelta(deltas: ReadonlyArray<StreamDelta>): this {
		this._nextDeltas = deltas
		return this
	}

	/** Force the next `queryStream` call to terminate with a single error. */
	setError(error: ChatTransportError | null): this {
		this.queryError = error
		return this
	}

	async *queryStream(
		prompt: string,
		options?: ChatTransportStreamOptions,
	): AsyncIterable<StreamDelta> {
		this.queryLog.push(prompt)
		this.optionsLog.push(options)
		if (this._nextDeltas !== null) {
			const scripted = this._nextDeltas
			this._nextDeltas = null
			for (const d of scripted) yield d
			return
		}
		const early = this._preflightDelta()
		if (early !== null) {
			yield early
			yield { type: 'done' }
			return
		}
		yield* this._streamCanned(options)
	}

	private _preflightDelta(): StreamDelta | null {
		if (!this.available) {
			return {
				type: 'error',
				error: new ChatTransportError('NOT_INSTALLED', 'MockCursorApiAdapter: not available'),
			}
		}
		if (this.queryError !== null) {
			return { type: 'error', error: this.queryError }
		}
		return null
	}

	private async *_streamCanned(
		options: ChatTransportStreamOptions | undefined,
	): AsyncGenerator<StreamDelta> {
		await MockCursorApiAdapter._sleep(this.delayMs, options?.signal)
		if (options?.signal?.aborted === true) {
			yield {
				type: 'error',
				error: new ChatTransportError('QUERY_FAILED', 'MockCursorApiAdapter: aborted'),
			}
			yield { type: 'done' }
			return
		}
		const chunks =
			this.cannedStreamChunks.length > 0 ? this.cannedStreamChunks : [this.cannedResponse]
		for (const chunk of chunks) {
			yield { type: 'text', text: chunk }
			await MockCursorApiAdapter._sleep(this.streamChunkDelayMs, options?.signal)
		}
		yield { type: 'done' }
	}

	private static _sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
		if (ms <= 0) return Promise.resolve()
		if (signal?.aborted === true) return Promise.resolve()
		return new Promise<void>((resolve) => {
			const t = setTimeout(() => {
				signal?.removeEventListener('abort', onAbort)
				resolve()
			}, ms)
			const onAbort = (): void => {
				clearTimeout(t)
				resolve()
			}
			signal?.addEventListener('abort', onAbort, { once: true })
		})
	}
}
