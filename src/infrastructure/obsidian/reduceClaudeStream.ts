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
 *   - `system` / `subtype:'compact_boundary'` → `context_compacted` (R-RR-001);
 *   - `system` / `subtype:'task_notification'` (`task_id`/`status`/`summary`) →
 *     `async_subagent_result` (R-RR-001);
 *   - `assistant` message content blocks → optional `assistant_message_start`
 *     (at most once, before the first text), then, in arrival order: a `text`
 *     chunk per text block (accumulate — there is no `text-delta` member,
 *     SPEC-CC-002), a `tool_use` chunk per tool_use block (SPEC-RR-001), and a
 *     `thinking` chunk per `thinking`/`redacted_thinking` block (SPEC-RR-001);
 *   - `user` message content blocks → a `tool_result` chunk per tool_result
 *     block, with the structured `toolUseResult` (Write/Edit `structuredPatch`)
 *     attached when the event carries one (SPEC-RR-001/010);
 *   - a blocked/denied `user` message → a warning `notice` (R-RR-001);
 *   - a non-null `parent_tool_use_id` on an `assistant`/`user` message routes its
 *     `tool_use`/`tool_result` to `subagent_tool_use`/`subagent_tool_result`
 *     (R-RR-001); null/absent → the top-level members (current behaviour);
 *   - `result` (final) → optional `usage` (with captured sessionId), then a
 *     single `done`; an error result (`is_error` / error subtype) → an `error`
 *     chunk then `done`;
 *   - a non-JSON / unparseable line → a friendly `error` chunk (never throws);
 *   - a blank line → no chunk.
 *
 * P2 wire-format parity is mirrored from claudian `transformClaudeMessage.ts`:
 * assistant `tool_use`/`thinking`, user `tool_result`, `extractToolResultContent`,
 * `emitToolUse`/`emitToolResult` (subagent routing via `parent_tool_use_id`,
 * :23/:30), `transformTaskNotification` (:48), `system/compact_boundary` (:385),
 * and `isBlockedMessage` (:446). The reduce stays pure, total, never-throws.
 *
 * Wire-format caveat (CLAR-RR-010): `parent_tool_use_id`, `compact_boundary`, and
 * `task_notification` ARE carried by the real `--output-format stream-json` wire
 * (they are part of the public SDK message envelope the CLI emits verbatim, and
 * are read back from the persisted JSONL by claudian `sdkMessageParsing.ts`). The
 * blocked-message `_blocked`/`_blockReason` underscore fields are SDK-internal —
 * claudian injects them in its permission-hook path; they are NOT on the raw CLI
 * stream-json wire. This reducer mirrors that shape faithfully (forward-compatible
 * if a wrapper injects it), but the user-visible blocked rendering on the real CLI
 * path is delivered by the `blocked` tool status (R-RR-008, `isBlockedToolResult`
 * in the store), since the CLI surfaces a hook denial as `tool_result` text.
 */
export class ClaudeStreamReducer {
	private _sessionId: string | null = null;
	private _assistantStarted = false;
	private _terminated = false;
	/**
	 * The per-turn assistant id learned from the `assistant` event envelope
	 * (`uuid`) or its inner message (`message.id`) — surfaced on the terminal
	 * `done` so the store can stamp `ChatMessage.assistantMessageId` and rewind
	 * eligibility renders on the real CLI path (R-TS-001, REQ-TS-019). Mirrors
	 * claudian `sdkMessageParsing.ts:215`.
	 */
	private _assistantMessageId: string | null = null;

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

	/**
	 * Reduce a `system` event: `init` captures the session id (no chunk);
	 * `compact_boundary` → `context_compacted` (claudian :385); `task_notification`
	 * → `async_subagent_result` (claudian `transformTaskNotification` :48). Any
	 * other subtype yields no chunk (forward-compatible).
	 */
	private _reduceSystem(event: Record<string, unknown>): StreamChunk[] {
		if (event.subtype === 'init') {
			const sid = event.session_id;
			if (typeof sid === 'string' && sid.length > 0) this._sessionId = sid;
			return [];
		}
		if (event.subtype === 'compact_boundary') {
			return [{ type: 'context_compacted' }];
		}
		if (event.subtype === 'task_notification') {
			const notification = transformTaskNotification(event);
			return notification !== null ? [notification] : [];
		}
		return [];
	}

	private _reduceAssistant(event: Record<string, unknown>): StreamChunk[] {
		const message = event.message;
		if (message === null || typeof message !== 'object') return [];
		const content = (message as Record<string, unknown>).content;
		if (!Array.isArray(content)) return [];

		// R-TS-001: capture the per-turn assistant id (claudian reads the SDK message
		// `uuid`; the CLI wire carries it on the event envelope `uuid` or the inner
		// `message.id`). The envelope uuid wins. Top-level turns only — a subagent
		// message (non-null parent) is nested activity, not the user-facing turn id.
		const assistantId = assistantMessageIdOf(event, message as Record<string, unknown>);

		// Subagent routing (claudian :396): a non-null parent id sends this turn's
		// tool_use blocks to `subagent_tool_use`. The id may ride the event top-level
		// or the inner message envelope.
		const parentToolUseId = parentToolUseIdOf(event, message as Record<string, unknown>);
		// Only a top-level turn (no parent) sets the user-facing assistant id.
		if (parentToolUseId === null && assistantId !== null) {
			this._assistantMessageId = assistantId;
		}

		const chunks: StreamChunk[] = [];
		for (const block of content) {
			if (block === null || typeof block !== 'object') continue;
			chunks.push(
				...this._reduceAssistantBlock(block as Record<string, unknown>, parentToolUseId),
			);
		}
		return chunks;
	}

	/**
	 * Map one assistant content block to zero-or-more chunks, preserving order:
	 * `text` → optional one-time `assistant_message_start` then `text`; `tool_use`
	 * → `tool_use` OR (when `parentToolUseId` is non-null) `subagent_tool_use`
	 * (input coerced to an object); `thinking`/`redacted_thinking` → `thinking`
	 * (SPEC-RR-001). Any other block kind → none. A subagent's own `text`/`thinking`
	 * is dropped (claudian :406/:409 emit those only at the top level) — only its
	 * tool activity surfaces (rendered nested under the spawning subagent).
	 */
	private _reduceAssistantBlock(
		b: Record<string, unknown>,
		parentToolUseId: string | null,
	): StreamChunk[] {
		if (b.type === 'tool_use') {
			return [
				emitToolUse(parentToolUseId, {
					id: typeof b.id === 'string' ? b.id : '',
					name: typeof b.name === 'string' ? b.name : '',
					input: toInputObject(b.input),
				}),
			];
		}
		// Subagent text/thinking is dropped (claudian :406/:409 emit them only at the
		// top level) — only its tool activity surfaces, nested under the spawn.
		if (parentToolUseId !== null) return [];
		if (b.type === 'text' && typeof b.text === 'string') {
			return this._reduceTextBlock(b.text);
		}
		if (b.type === 'thinking' || b.type === 'redacted_thinking') {
			return [{ type: 'thinking', content: typeof b.thinking === 'string' ? b.thinking : '' }];
		}
		return [];
	}

	/** Emit a top-level text block, prefixed by the one-time `assistant_message_start`. */
	private _reduceTextBlock(text: string): StreamChunk[] {
		const chunks: StreamChunk[] = [];
		if (!this._assistantStarted) {
			this._assistantStarted = true;
			chunks.push({ type: 'assistant_message_start' });
		}
		chunks.push({ type: 'text', content: text });
		return chunks;
	}

	/**
	 * Reduce a `user` event (SPEC-RR-001/010): tool results arrive as `user`
	 * message content blocks (`{type:'tool_result', tool_use_id, content,
	 * is_error?}`). `content` may be a string OR an array of `{type:'text',text}`
	 * blocks — both are flattened to the displayable text (mirrors claudian
	 * `extractToolResultContent`). The structured `toolUseResult` (e.g. a Write/Edit
	 * `structuredPatch`) rides the event top-level and is attached when present.
	 *
	 * Two parity branches (R-RR-001): a blocked/denied message (claudian
	 * `isBlockedMessage` :446) short-circuits to a single warning `notice`; a
	 * non-null `parent_tool_use_id` routes each result to `subagent_tool_result`
	 * (claudian `emitToolResult` :30).
	 */
	private _reduceUser(event: Record<string, unknown>): StreamChunk[] {
		// Blocked/denied (hook-deny) message → notice, then stop (claudian :446-452).
		if (isBlockedMessage(event)) {
			return [{ type: 'notice', content: event._blockReason, level: 'warning' }];
		}

		const message = event.message;
		if (message === null || typeof message !== 'object') return [];
		const content = (message as Record<string, unknown>).content;
		if (!Array.isArray(content)) return [];

		const parentToolUseId = parentToolUseIdOf(event, message as Record<string, unknown>);
		const structured = toToolUseResult(event.toolUseResult);

		const chunks: StreamChunk[] = [];
		for (const block of content) {
			if (block === null || typeof block !== 'object') continue;
			const chunk = reduceToolResultBlock(block as Record<string, unknown>, parentToolUseId, structured);
			if (chunk !== null) chunks.push(chunk);
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

		chunks.push(this._buildDone());
		this._terminated = true;
		return chunks;
	}

	/**
	 * Build the terminal `done`, attaching the captured per-turn `assistantMessageId`
	 * when one was learned (R-TS-001). Absent → a bare `{type:'done'}` (back-compat
	 * with the P1 terminator shape).
	 */
	private _buildDone(): StreamChunk {
		if (this._assistantMessageId !== null && this._assistantMessageId.length > 0) {
			return { type: 'done', assistantMessageId: this._assistantMessageId };
		}
		return { type: 'done' };
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

/** Fields shared by `tool_use`/`subagent_tool_use` emission (claudian `ToolUseFields`). */
interface ToolUseFields {
	id: string;
	name: string;
	input: Record<string, unknown>;
}
/** Fields shared by `tool_result`/`subagent_tool_result` emission. */
interface ToolResultFields {
	id: string;
	content: string;
	isError?: boolean;
	toolUseResult?: ToolUseResult;
}
type AsyncSubagentResultStatus = Extract<StreamChunk, { type: 'async_subagent_result' }>['status'];

/**
 * Read a non-null `parent_tool_use_id` from the event or its inner message
 * envelope (claudian reads `message.parent_tool_use_id` :396/:443). Returns the id
 * string when present + non-empty, else `null` (top-level routing).
 */
function parentToolUseIdOf(
	event: Record<string, unknown>,
	message: Record<string, unknown>,
): string | null {
	const fromEvent = event.parent_tool_use_id;
	if (typeof fromEvent === 'string' && fromEvent.length > 0) return fromEvent;
	const fromMessage = message.parent_tool_use_id;
	if (typeof fromMessage === 'string' && fromMessage.length > 0) return fromMessage;
	return null;
}

/**
 * Read the per-turn assistant id (R-TS-001). The envelope `uuid` is preferred
 * (claudian derives `assistantMessageId` from the SDK message `uuid`,
 * sdkMessageParsing.ts:215); the CLI stream-json wire alternatively carries the
 * Anthropic `message.id`. Returns the first non-empty string, else `null`.
 */
function assistantMessageIdOf(
	event: Record<string, unknown>,
	message: Record<string, unknown>,
): string | null {
	const uuid = event.uuid;
	if (typeof uuid === 'string' && uuid.length > 0) return uuid;
	const messageId = message.id;
	if (typeof messageId === 'string' && messageId.length > 0) return messageId;
	return null;
}

/**
 * Emit a top-level `tool_use` or, under a non-null parent, a `subagent_tool_use`
 * (claudian `emitToolUse` :23).
 */
function emitToolUse(parentToolUseId: string | null, fields: ToolUseFields): StreamChunk {
	if (parentToolUseId === null) return { type: 'tool_use', ...fields };
	return { type: 'subagent_tool_use', subagentId: parentToolUseId, ...fields };
}

/**
 * Emit a top-level `tool_result` or, under a non-null parent, a
 * `subagent_tool_result` (claudian `emitToolResult` :30).
 */
function emitToolResult(parentToolUseId: string | null, fields: ToolResultFields): StreamChunk {
	if (parentToolUseId === null) return { type: 'tool_result', ...fields };
	return { type: 'subagent_tool_result', subagentId: parentToolUseId, ...fields };
}

/**
 * Map one `user` content block to a (subagent-)`tool_result` chunk, or `null`
 * when the block is not a `tool_result`. The structured `toolUseResult` (when the
 * event carried one) is attached. Routes via `emitToolResult` so a non-null parent
 * yields `subagent_tool_result`.
 */
function reduceToolResultBlock(
	b: Record<string, unknown>,
	parentToolUseId: string | null,
	structured: ToolUseResult | undefined,
): StreamChunk | null {
	if (b.type !== 'tool_result') return null;
	return emitToolResult(parentToolUseId, {
		id: typeof b.tool_use_id === 'string' ? b.tool_use_id : '',
		content: extractToolResultContent(b.content),
		isError: b.is_error === true,
		...(structured !== undefined ? { toolUseResult: structured } : {}),
	});
}

/** Normalise a `task_notification.status` to the two-state union (claudian :37). */
function normalizeTaskNotificationStatus(status: unknown): AsyncSubagentResultStatus {
	return status === 'completed' ? 'completed' : 'error';
}

/** Choose the result text, falling back to a status-appropriate phrase (claudian :41). */
function normalizeTaskNotificationResult(status: AsyncSubagentResultStatus, summary: unknown): string {
	if (typeof summary === 'string' && summary.trim().length > 0) return summary.trim();
	return status === 'completed' ? 'Background task completed.' : 'Background task failed.';
}

/**
 * Map a `system/task_notification` event to an `async_subagent_result` chunk
 * (claudian `transformTaskNotification` :48). Requires a non-empty `task_id`;
 * returns `null` when absent so the caller emits no chunk.
 */
function transformTaskNotification(event: Record<string, unknown>): StreamChunk | null {
	const taskId = event.task_id;
	if (typeof taskId !== 'string' || taskId.length === 0) return null;
	const status = normalizeTaskNotificationStatus(event.status);
	return {
		type: 'async_subagent_result',
		agentId: taskId,
		status,
		result: normalizeTaskNotificationResult(status, event.summary),
	};
}

/** A blocked/denied user message (claudian `isBlockedMessage`, sdk/messages.ts:10). */
type BlockedUserMessage = Record<string, unknown> & { _blocked: true; _blockReason: string };

/**
 * Recognise a blocked/denied user message (claudian `isBlockedMessage` :10): a
 * `user` event carrying the SDK-injected `_blocked === true` + a string
 * `_blockReason`. See the CLAR-RR-010 caveat in the class doc — these underscore
 * fields are SDK-internal, so on the raw CLI wire this branch is dormant and the
 * blocked signal arrives instead through `tool_result` text (R-RR-008).
 */
function isBlockedMessage(event: Record<string, unknown>): event is BlockedUserMessage {
	return (
		event._blocked === true &&
		typeof event._blockReason === 'string'
	);
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
