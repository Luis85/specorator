/**
 * WP-11 — `NdjsonChannel`: line-reassembly + push-channel surface for the
 * subscription transport's stdout pump. Extracted from
 * `ClaudeSubprocessAdapter` (Arch review #11) and hardened against
 * perf-F-8 (unbounded stdout buffer).
 *
 * Responsibilities:
 *   - Buffer chunked stdout (REQ-ASM-029); dispatch complete `\n`-terminated
 *     lines to the wire-format translator;
 *   - Provide a single-producer / single-consumer `AsyncIterable` for the
 *     delta stream — no readline coupling so the EventEmitter shape used by
 *     tests and Obsidian's plugin host both work;
 *   - Enforce a configurable stdout-buffer cap (default 4 MiB, perf-F-8) and
 *     surface overflow as an out-of-band callback that the adapter wires to
 *     `kill child + emit terminal error delta`;
 *   - Track an `overflowCount` so the adapter can include it in its
 *     auxiliary telemetry without widening the canonical completion payload.
 *
 * Not responsible for:
 *   - JSON parsing or wire→`RawClaudeEvent` translation (lives on the
 *     adapter facade — single translation surface);
 *   - subprocess spawn / kill (lives in `SubprocessLifecycle`).
 */

/** SPEC perf-F-8 — 4 MiB stdout-buffer cap. */
export const DEFAULT_STDOUT_MAX_BYTES = 4 * 1024 * 1024;

export interface NdjsonChannelOptions {
	/** Called for every `\n`-terminated line as it is reassembled. */
	readonly onLine: (line: string) => void;
	/**
	 * Optional caller-supplied callback invoked the first time the unflushed
	 * buffer exceeds `maxBufferBytes`. Wired by the adapter to "kill the
	 * subprocess + push a terminal error delta". After the callback returns
	 * the buffer is reset to empty so a long pathological producer cannot
	 * keep the process pinned at the cap.
	 */
	readonly onOverflow?: (bufferBytes: number) => void;
	/** Override the 4 MiB default cap. Tests use a smaller value. */
	readonly maxBufferBytes?: number;
}

export interface NdjsonChannel<T> {
	/** Push a value to the iterator (or buffer it until a consumer arrives). */
	push: (value: T) => void;
	/** Signal end-of-stream — the iterator's `done: true` after the buffer drains. */
	complete: () => void;
	/** Async-iterate the channel exactly once. */
	iterate: () => AsyncIterable<T>;
	/** Feed raw stdout bytes; complete `\n`-terminated lines dispatch to `onLine`. */
	pushBytes: (chunk: Buffer | string) => void;
	/** Cumulative count of times the stdout buffer cap was breached. */
	readonly overflowCount: number;
}

/**
 * Create a fresh push channel + line-reassembly buffer.
 *
 * The channel preserves ordering: values pushed before a consumer is iterating
 * are buffered, and the iterator's `done: true` only fires after the buffer
 * has drained.
 */
export function createNdjsonChannel<T>(opts: NdjsonChannelOptions): NdjsonChannel<T> {
	const buffer: T[] = [];
	let completed = false;
	let waiting: ((r: IteratorResult<T>) => void) | null = null;

	const push = (value: T): void => {
		if (completed) return;
		if (waiting !== null) {
			const resume = waiting;
			waiting = null;
			resume({ value, done: false });
			return;
		}
		buffer.push(value);
	};

	const complete = (): void => {
		if (completed) return;
		completed = true;
		if (waiting !== null) {
			const resume = waiting;
			waiting = null;
			resume({ value: undefined, done: true });
		}
	};

	const iterate = (): AsyncIterable<T> => ({
		[Symbol.asyncIterator](): AsyncIterator<T> {
			return {
				next(): Promise<IteratorResult<T>> {
					if (buffer.length > 0) {
						const value = buffer.shift() as T;
						return Promise.resolve({ value, done: false });
					}
					if (completed) {
						return Promise.resolve({ value: undefined, done: true });
					}
					return new Promise<IteratorResult<T>>((resolve) => {
						waiting = resolve;
					});
				},
			};
		},
	});

	// ── Line-reassembly state — single-threaded by Node's event loop ─────────
	let stdoutBuffer = '';
	let overflowCount = 0;
	let overflowed = false;
	const maxBytes = opts.maxBufferBytes ?? DEFAULT_STDOUT_MAX_BYTES;

	const pushBytes = (chunk: Buffer | string): void => {
		// If we've already overflowed once for this channel, drop further
		// chunks on the floor — the consumer has been notified and the
		// subprocess will be killed; we must not keep growing the buffer.
		if (overflowed) return;

		const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
		stdoutBuffer += text;

		// Dispatch every complete line first — the cap only applies to the
		// UNFLUSHED tail (one >4 MiB line without a newline is the pathology
		// we are protecting against, not 4 MiB worth of legitimate lines).
		let newlineIdx = stdoutBuffer.indexOf('\n');
		while (newlineIdx !== -1) {
			const line = stdoutBuffer.slice(0, newlineIdx);
			stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
			opts.onLine(line);
			newlineIdx = stdoutBuffer.indexOf('\n');
		}

		// Cap enforcement — measure UTF-8 byte length, not JS string char count.
		// Non-ASCII content (emoji, CJK) can have a chars-to-bytes ratio of 1:4,
		// so a pathological 4-MiB-of-chars CJK blob is up to 16 MiB on the wire.
		// Measuring bytes (`Buffer.byteLength(..., 'utf8')`) keeps the cap honest
		// against the real wire-payload size that perf-F-8 was protecting against.
		const bufferBytes = Buffer.byteLength(stdoutBuffer, 'utf8');
		if (bufferBytes > maxBytes) {
			overflowed = true;
			overflowCount += 1;
			stdoutBuffer = '';
			if (opts.onOverflow !== undefined) {
				try {
					opts.onOverflow(bufferBytes);
				} catch {
					// Callback errors must not crash the stdout pump.
				}
			}
		}
	};

	return {
		push,
		complete,
		iterate,
		pushBytes,
		get overflowCount(): number {
			return overflowCount;
		},
	};
}
