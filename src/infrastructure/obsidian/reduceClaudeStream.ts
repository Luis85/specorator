import type { StreamChunk } from '@/domain/chat/StreamChunk';
import type { UsageInfo } from '@/domain/chat/UsageInfo';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';

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
 *   - `assistant` message content blocks → optional `assistant_message_start`
 *     (at most once, before the first text), then, in arrival order: a `text`
 *     chunk per text block (accumulate — there is no `text-delta` member,
 *     SPEC-CC-002), a `tool_use` chunk per tool_use block (SPEC-RR-001), and a
 *     `thinking` chunk per `thinking`/`redacted_thinking` block (SPEC-RR-001);
 *   - `user` message content blocks → a `tool_result` chunk per tool_result
 *     block, with the structured `toolUseResult` (Write/Edit `structuredPatch`)
 *     attached when the event carries one (SPEC-RR-001/010);
 *   - `result` (final) → optional `usage` (with captured sessionId), then a
 *     single `done`; an error result (`is_error` / error subtype) → an `error`
 *     chunk then `done`;
 *   - a non-JSON / unparseable line → a friendly `error` chunk (never throws);
 *   - a blank line → no chunk.
 *
 * P2 wire-format parity is mirrored from claudian `transformClaudeMessage.ts`
 * (assistant `tool_use`/`thinking`, user `tool_result`) and its
 * `extractToolResultContent` helper. The reduce stays pure, total, never-throws.
 */
export class ClaudeStreamReducer {
	private _sessionId: string | null = null;
	private _assistantStarted = false;
	private _terminated = false;

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
			case 'user':
				return this._reduceUser(event);
			case 'result':
				return this._reduceResult(event);
			default:
				// Unknown / future event (e.g. `stream_event`) — ignored, forward-compatible.
				return [];
		}
	}

	/**
	 * Build the terminal chunk pair for an unexpected fault (spawn ENOENT, broken
	 * pipe, non-zero exit). The runtime calls this then returns — it never throws
	 * across the port (ADR-CC-001 §1, EC-13).
	 */
	synthesizeError(detail: string): StreamChunk[] {
		this._terminated = true;
		return [{ type: 'error', content: `Claude CLI failed: ${detail}` }, { type: 'done' }];
	}

	/**
	 * Terminal guarantee (Codex review #433, EC-13). The CLI line stream can end
	 * without ever emitting a `result` event — early process exit, an stderr-only
	 * failure, or a killed child. In that case no `done` was produced and the
	 * consumer (`RunChatTurnUseCase` → store) would hang in `streaming`, blocking
	 * the next turn. `query()` calls this once after the line loop completes
	 * normally: it returns a synthetic `error` + `done` pair when no terminal has
	 * been emitted yet, and `[]` otherwise (idempotent).
	 */
	finalize(): StreamChunk[] {
		if (this._terminated) return [];
		return this.synthesizeError('the Claude CLI stream ended without completing the turn.');
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
			chunks.push(...this._reduceAssistantBlock(block as Record<string, unknown>));
		}
		return chunks;
	}

	/**
	 * Map one assistant content block to zero-or-more chunks, preserving order:
	 * `text` → optional one-time `assistant_message_start` then `text`; `tool_use`
	 * → `tool_use` (input coerced to an object); `thinking`/`redacted_thinking` →
	 * `thinking` (SPEC-RR-001). Any other block kind → none.
	 */
	private _reduceAssistantBlock(b: Record<string, unknown>): StreamChunk[] {
		if (b.type === 'text' && typeof b.text === 'string') {
			const chunks: StreamChunk[] = [];
			if (!this._assistantStarted) {
				this._assistantStarted = true;
				chunks.push({ type: 'assistant_message_start' });
			}
			chunks.push({ type: 'text', content: b.text });
			return chunks;
		}
		if (b.type === 'tool_use') {
			return [
				{
					type: 'tool_use',
					id: typeof b.id === 'string' ? b.id : '',
					name: typeof b.name === 'string' ? b.name : '',
					input: toInputObject(b.input),
				},
			];
		}
		if (b.type === 'thinking' || b.type === 'redacted_thinking') {
			return [{ type: 'thinking', content: typeof b.thinking === 'string' ? b.thinking : '' }];
		}
		return [];
	}

	/**
	 * Reduce a `user` event (SPEC-RR-001/010): tool results arrive as `user`
	 * message content blocks (`{type:'tool_result', tool_use_id, content,
	 * is_error?}`). `content` may be a string OR an array of `{type:'text',text}`
	 * blocks — both are flattened to the displayable text (mirrors claudian
	 * `extractToolResultContent`). The structured `toolUseResult` (e.g. a Write/Edit
	 * `structuredPatch`) rides the event top-level and is attached when present.
	 */
	private _reduceUser(event: Record<string, unknown>): StreamChunk[] {
		const message = event.message;
		if (message === null || typeof message !== 'object') return [];
		const content = (message as Record<string, unknown>).content;
		if (!Array.isArray(content)) return [];

		const structured = toToolUseResult(event.toolUseResult);

		const chunks: StreamChunk[] = [];
		for (const block of content) {
			if (block === null || typeof block !== 'object') continue;
			const b = block as Record<string, unknown>;
			if (b.type !== 'tool_result') continue;
			const chunk: Extract<StreamChunk, { type: 'tool_result' }> = {
				type: 'tool_result',
				id: typeof b.tool_use_id === 'string' ? b.tool_use_id : '',
				content: extractToolResultContent(b.content),
				isError: b.is_error === true,
			};
			if (structured !== undefined) chunk.toolUseResult = structured;
			chunks.push(chunk);
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
		this._terminated = true;
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

/**
 * Coerce a `tool_use.input` to an object (mirrors claudian `getToolInput`):
 * absent, non-object, or array → `{}`; otherwise the object verbatim.
 */
function toInputObject(input: unknown): Record<string, unknown> {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) return {};
	return input as Record<string, unknown>;
}

/**
 * Coerce the event-level `toolUseResult` to the domain `ToolUseResult` when it is
 * a usable object (Write/Edit carry a `structuredPatch`); otherwise `undefined`
 * so the chunk omits the key. The `[key:string]: unknown` bag on `ToolUseResult`
 * keeps this permissive for non-diff tools (SPEC-RR-002).
 */
function toToolUseResult(raw: unknown): ToolUseResult | undefined {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
	return raw as ToolUseResult;
}

/**
 * Flatten a `tool_result.content` to displayable text (mirrors claudian
 * `extractToolResultContent`): a string passes through; an array keeps the
 * `{type:'text',text}` blocks joined by newlines, falling back to a JSON dump of
 * the array; any other value is JSON-stringified; `null`/`undefined` → `''`.
 * Pure, total, never throws.
 */
function extractToolResultContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (content === null || content === undefined) return '';
	if (Array.isArray(content)) {
		const textParts = content
			.filter(isTextBlock)
			.map((block) => block.text);
		if (textParts.length > 0) return textParts.join('\n');
		if (content.length > 0) return safeStringify(content);
		return '';
	}
	return safeStringify(content);
}

function isTextBlock(block: unknown): block is { type: 'text'; text: string } {
	if (block === null || typeof block !== 'object') return false;
	const record = block as Record<string, unknown>;
	return record.type === 'text' && typeof record.text === 'string';
}

/** JSON.stringify that never throws (circular refs degrade to `''`). */
function safeStringify(value: unknown): string {
	try {
		const json = JSON.stringify(value, null, 2);
		return typeof json === 'string' ? json : '';
	} catch {
		return '';
	}
}
