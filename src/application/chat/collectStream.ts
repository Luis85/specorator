/**
 * `collectStream` — pure helper that drains a `ChatTransportPort.queryStream`
 * iterable into a single `Result<string, ChatTransportError>`. Replaces the
 * legacy `port.query()` method (deleted in WP-12) and the
 * `streamFromQuery` shim it relied on.
 *
 * Why this lives in `application/chat`:
 *   - It consumes a streaming `AsyncIterable<StreamDelta>`, which is the
 *     port-layer contract.
 *   - It converges that stream into the same `Result<string, ChatTransportError>`
 *     shape the deleted `query()` method returned.
 *   - It has no Obsidian / SDK dependencies — pure async iteration.
 *
 * Semantics (mirrors the deleted `ClaudeCliAdapter.query` / `ClaudeSubprocessAdapter.query`):
 *   - Concatenate every `text` delta in order; ignore everything else
 *     except `error` / `done`.
 *   - On `error`, return `err(delta.error)` and stop reading.
 *   - On `done`, return `ok(concatenatedText)`.
 *   - If the iterable exhausts without ever emitting `done` or `error`,
 *     return `err(ChatTransportError{ QUERY_FAILED, "Stream closed before terminal delta" })`.
 *     This branch matches the pre-WP-12 adapters' defensive "No result
 *     message" / "Subprocess closed before result event" fallbacks.
 *
 * Never throws.
 */
import { ChatTransportError, type StreamDelta } from '@/domain/ports/ChatTransportPort';
import { err, ok, type Result } from '@/domain/shared/Result';

export async function collectStream(
	stream: AsyncIterable<StreamDelta>,
): Promise<Result<string, ChatTransportError>> {
	const chunks: string[] = [];
	for await (const delta of stream) {
		if (delta.type === 'text') {
			chunks.push(delta.text);
			continue;
		}
		if (delta.type === 'error') {
			return err(delta.error);
		}
		if (delta.type === 'done') {
			return ok(chunks.join(''));
		}
		// Other delta variants (`session-id`, `thinking`, tool-use, `usage`,
		// `compact-boundary`) are observable side-channels for streaming
		// consumers; the converge-to-string path simply ignores them.
	}
	return err(new ChatTransportError('QUERY_FAILED', 'Stream closed before terminal delta'));
}
