import type { StreamChunk } from '@/domain/chat/StreamChunk';
import type { UsageInfo } from '@/domain/chat/UsageInfo';

/**
 * Pure, deterministic NDJSON → `StreamChunk` reducer for `ClaudeCliChatRuntime`
 * (SPEC-CC-010 "NDJSON → `StreamChunk` reduce"). The CLI is invoked with
 * `--output-format stream-json`, emitting one JSON object per stdout line. This
 * reducer is the testable seam (the spawn + child lifecycle is the manual
 * TEST-CC-017): it is the *only* place CLI wire-format is translated, it never
 * throws, and it is exercised by `reduceClaudeStream.test.ts` with canned event
 * fixtures.
 *
 * Reduce rules:
 *   - `system` / `subtype:'init'` → capture `session_id` (no chunk);
 *   - `assistant` message text blocks → optional `assistant_message_start`
 *     (at most once), then a `text` chunk per text block (accumulate — there is
 *     no `text-delta` member, SPEC-CC-002);
 *   - `result` (final) → optional `usage` (with captured sessionId), then a
 *     single `done`; an error result (`is_error` / error subtype) → an `error`
 *     chunk then `done`;
 *   - a non-JSON / unparseable line → a friendly `error` chunk (never throws);
 *   - a blank line → no chunk.
 */
export class ClaudeStreamReducer {
	private _sessionId: string | null = null;
	private _assistantStarted = false;

	/** The session id learned from the CLI stream (`system/init` or `result`). */
	get sessionId(): string | null {
		return this._sessionId;
	}

	/**
	 * Reduce one NDJSON stdout line to zero-or-more `StreamChunk`s. Total and
	 * never-throwing: an unparseable line yields a synthetic `error` chunk.
	 */
	consumeLine(line: string): StreamChunk[] {
		const trimmed = line.trim();
		if (trimmed === '') return [];

		let event: Record<string, unknown>;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (parsed === null || typeof parsed !== 'object') {
				return [{ type: 'error', content: 'Claude CLI emitted a non-object stream line.' }];
			}
			event = parsed as Record<string, unknown>;
		} catch {
			return [{ type: 'error', content: 'Claude CLI emitted an unparseable stream line.' }];
		}

		const type = typeof event.type === 'string' ? event.type : '';
		switch (type) {
			case 'system':
				return this._reduceSystem(event);
			case 'assistant':
				return this._reduceAssistant(event);
			case 'result':
				return this._reduceResult(event);
			default:
				// Unknown / future event (e.g. `user`, `stream_event`) — ignored in P1.
				return [];
		}
	}

	/**
	 * Build the terminal chunk pair for an unexpected fault (spawn ENOENT, broken
	 * pipe, non-zero exit). The runtime calls this then returns — it never throws
	 * across the port (ADR-CC-001 §1, EC-13).
	 */
	synthesizeError(detail: string): StreamChunk[] {
		return [{ type: 'error', content: `Claude CLI failed: ${detail}` }, { type: 'done' }];
	}

	private _reduceSystem(event: Record<string, unknown>): StreamChunk[] {
		if (event.subtype === 'init') {
			const sid = event.session_id;
			if (typeof sid === 'string' && sid.length > 0) this._sessionId = sid;
		}
		return [];
	}

	private _reduceAssistant(event: Record<string, unknown>): StreamChunk[] {
		const message = event.message;
		if (message === null || typeof message !== 'object') return [];
		const content = (message as Record<string, unknown>).content;
		if (!Array.isArray(content)) return [];

		const chunks: StreamChunk[] = [];
		for (const block of content) {
			if (block === null || typeof block !== 'object') continue;
			const b = block as Record<string, unknown>;
			if (b.type === 'text' && typeof b.text === 'string') {
				if (!this._assistantStarted) {
					this._assistantStarted = true;
					chunks.push({ type: 'assistant_message_start' });
				}
				chunks.push({ type: 'text', content: b.text });
			}
		}
		return chunks;
	}

	private _reduceResult(event: Record<string, unknown>): StreamChunk[] {
		const sid = event.session_id;
		if (typeof sid === 'string' && sid.length > 0) this._sessionId = sid;

		const chunks: StreamChunk[] = [];

		const isError =
			event.is_error === true ||
			(typeof event.subtype === 'string' && event.subtype.startsWith('error'));
		if (isError) {
			const detail =
				typeof event.result === 'string' && event.result.length > 0
					? event.result
					: 'the Claude CLI reported an error completing the turn.';
			chunks.push({ type: 'error', content: detail });
		} else {
			const usage = this._extractUsage(event.usage);
			if (usage !== null) {
				chunks.push({ type: 'usage', usage, sessionId: this._sessionId });
			}
		}

		chunks.push({ type: 'done' });
		return chunks;
	}

	/**
	 * Map the CLI `usage` object (snake_case token counts) to the domain
	 * `UsageInfo` (SPEC-CC-003). Returns `null` when no usable token data exists.
	 * P1 stores but does not render usage (NG4), so missing context-window data
	 * is filled with safe zeros rather than dropped.
	 */
	private _extractUsage(raw: unknown): UsageInfo | null {
		if (raw === null || typeof raw !== 'object') return null;
		const u = raw as Record<string, unknown>;
		const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
		const inputTokens = num(u.input_tokens);
		const cacheCreation = num(u.cache_creation_input_tokens);
		const cacheRead = num(u.cache_read_input_tokens);
		const contextTokens = inputTokens + num(u.output_tokens) + cacheCreation + cacheRead;
		return {
			inputTokens,
			cacheCreationInputTokens: cacheCreation,
			cacheReadInputTokens: cacheRead,
			contextWindow: 0,
			contextTokens,
			percentage: 0,
		};
	}
}
