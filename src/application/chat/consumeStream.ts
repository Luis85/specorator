/**
 * Pure stream-delta consumer extracted from `ChatTurnOrchestrator` (Arch #1,
 * WP-2). Drains an `AsyncIterable<StreamDelta>` from `ChatTransportPort.queryStream`
 * to a terminal `done`/`error` delta, dispatching non-terminal deltas to the
 * structural store ports.
 *
 * Pure application layer (ADR-001 / ADR-008): no `obsidian`, no Vue, no
 * Pinia internals beyond the four structural store ports declared by the
 * orchestrator.
 */
import { tryAsync } from '@/domain/shared/tryAsync';
import type {
	ChatTransportErrorCode,
	StreamDelta,
} from '@/domain/ports/ChatTransportPort';
import type { MessagesPort, StreamingPort, ThreadsPort } from './ChatTurnOrchestrator';

/** Internal drain outcome — mirrors the pre-refactor `ChatSidebar` shape. */
type DrainOutcome =
	| { kind: 'done'; text: string }
	| { kind: 'error'; errorCode: ChatTransportErrorCode };

/**
 * Public outcome from `consumeStream`. Never throws — a thrown iterable is
 * normalised to `{ kind: 'error', errorCode: 'QUERY_FAILED' }`.
 */
export type StreamConsumptionOutcome =
	| { readonly kind: 'success'; readonly text: string }
	| { readonly kind: 'error'; readonly errorCode: ChatTransportErrorCode };

export interface ConsumeStreamArgs {
	readonly stream: AsyncIterable<StreamDelta>;
	readonly threadId: string;
	readonly messages: MessagesPort;
	readonly threads: ThreadsPort;
	readonly streaming: StreamingPort;
}

/**
 * Drain `queryStream` to a terminal delta. Accumulates `text` deltas into
 * `streaming.appendStreamingDelta` so `MessageList.vue` can render the
 * in-flight assistant turn token-by-token, and forwards every other
 * non-terminal delta variant to the right store port.
 *
 * Returns:
 *   - `success` with the concatenated text on `done`;
 *   - `error` with the error code on `error`;
 *   - `error` with `QUERY_FAILED` if the iterable throws or ends without a
 *     terminal delta.
 */
export async function consumeStream(args: ConsumeStreamArgs): Promise<StreamConsumptionOutcome> {
	const chunks: string[] = [];
	const drained = await tryAsync(async (): Promise<DrainOutcome | null> => {
		for await (const delta of args.stream) {
			const terminal = applyStreamDelta(delta, chunks, args);
			if (terminal !== null) return terminal;
		}
		return null;
	});
	if (!drained.ok) return { kind: 'error', errorCode: 'QUERY_FAILED' };
	const outcome = drained.value;
	if (outcome === null) return { kind: 'error', errorCode: 'QUERY_FAILED' };
	if (outcome.kind === 'done') return { kind: 'success', text: outcome.text };
	return { kind: 'error', errorCode: outcome.errorCode };
}

/**
 * Dispatch one delta to the structural ports and return a terminal outcome
 * when the stream is over.
 */
function applyStreamDelta(
	delta: StreamDelta,
	chunks: string[],
	args: ConsumeStreamArgs,
): DrainOutcome | null {
	if (delta.type === 'done') return { kind: 'done', text: chunks.join('') };
	if (delta.type === 'error') return { kind: 'error', errorCode: delta.error.errorCode };
	applyNonTerminalDelta(delta, chunks, args);
	return null;
}

function applyNonTerminalDelta(
	delta: Exclude<StreamDelta, { type: 'done' } | { type: 'error' }>,
	chunks: string[],
	args: ConsumeStreamArgs,
): void {
	switch (delta.type) {
		case 'text':
			chunks.push(delta.text);
			args.streaming.appendStreamingDelta(delta.text);
			return;
		case 'session-id':
			args.threads.captureSessionId(args.threadId, delta.sessionId);
			return;
		case 'thinking':
			args.streaming.appendStreamingThinking(delta.text);
			return;
		case 'tool-use-start':
			args.streaming.startStreamingToolCall(delta.blockId, delta.toolName, delta.inputJson);
			return;
		case 'tool-use-input-delta':
			args.streaming.appendStreamingToolCallInput(delta.blockId, delta.inputJson);
			return;
		case 'tool-use-stop':
			args.streaming.finishStreamingToolCall(delta.blockId);
			return;
		case 'usage':
			args.streaming.setLastUsage({
				inputTokens: delta.inputTokens,
				outputTokens: delta.outputTokens,
			});
			return;
		case 'compact-boundary':
			args.messages.appendCompactBoundaryNotice(args.threadId, { reason: delta.reason });
			return;
	}
}
