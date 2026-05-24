import { defineStore } from 'pinia';
import type { ChatMessage, LoggerPort, UsageInfo } from '@/domain/ports';
import type {
	ChatTurnSink,
	RunChatTurnInput,
	ChatTurnError,
} from '@/application/chat/RunChatTurnUseCase';
import type { Result } from '@/domain/shared/Result';
import type { ToolCall } from '@/domain/chat/ToolCall';
import type { SubagentInfo } from '@/domain/chat/Subagent';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';
import { computeDiff } from '@/application/chat/computeDiff';
import { consolidateSubagent } from '@/application/chat/resolveSubagentLifecycle';
import { isBlockedToolResult } from '@/application/chat/toolStatus';

/**
 * The single-thread chat store (SPEC-CC-016). Holds plain `ChatMessage` DTOs only —
 * no domain class instance crosses the boundary (ADR-003). It implements the
 * `ChatTurnSink` legs the use case drives, plus `sendMessage`/`cancelTurn`/`$reset`.
 * The store NEVER imports `obsidian`; it is bound to a `RunChatTurnUseCase`-shaped
 * runner (the surface instantiates it from `useChatRuntimePort()`) and to a
 * start-failure notice callback (the `FeedbackService` seam — EC-7).
 */

/** The five-status surface state machine (SPEC-CC-016 §6). */
export type ChatStatus = 'empty' | 'idle' | 'streaming' | 'error' | 'interrupted';

/** The `RunChatTurnUseCase` subset the store depends on (structural). */
export interface ChatTurnRunner {
	run(input: RunChatTurnInput, sink: ChatTurnSink): Promise<Result<void, ChatTurnError>>;
	cancel(): void;
}

/** Surface a start-failure to the user (sticky notice via `FeedbackService`, EC-7). */
export type StartFailureNotifier = (message: string) => void;

/** Tools that diff their result/input into a `DiffLine[]` (SPEC-RR-020). */
const DIFF_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit']);

/** Tools that spawn a subagent on `tool_use` (Claude `Task`/`Agent` path, SPEC-RR-017). */
const SUBAGENT_SPAWN_TOOLS: ReadonlySet<string> = new Set(['Task', 'Agent']);

/** A no-op logger so a store bound without one never faults on a `warn` leg. */
const NOOP_LOGGER: LoggerPort = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

function newId(): string {
	return crypto.randomUUID();
}

function userMessage(content: string): ChatMessage {
	return { id: newId(), role: 'user', content, timestamp: Date.now() };
}

function assistantMessage(): ChatMessage {
	return { id: newId(), role: 'assistant', content: '', timestamp: Date.now() };
}

/** Read the spawning Task/Agent tool's description/prompt off its input (best-effort). */
function spawnDescription(input: Record<string, unknown>): string {
	const value = input.description;
	return typeof value === 'string' ? value : '';
}

function spawnPrompt(input: Record<string, unknown>): string | undefined {
	const value = input.prompt;
	return typeof value === 'string' ? value : undefined;
}

/**
 * Set `toolCall.diffData` for a Write/Edit tool when `computeDiff` yields a usable
 * diff (EC-RR-3 leaves it unset otherwise). Shared by the top-level and nested
 * (subagent) result legs (SPEC-RR-020). Mutates the passed `ToolCall` in place.
 */
/**
 * Resolve a tool's terminal status (R-RR-008): `error` when the runtime flagged
 * it, else `blocked` when the result text is a permission denial
 * (`isBlockedToolResult`), else `completed`. `isError` keeps precedence (claudian
 * StreamController :611-617). Shared by the top-level and nested (subagent) legs.
 */
function resolveToolStatus(content: string, isError: boolean): ToolCall['status'] {
	if (isError) return 'error';
	return isBlockedToolResult(content, isError) ? 'blocked' : 'completed';
}

function applyToolDiff(toolCall: ToolCall, result: ToolUseResult | undefined): void {
	if (!DIFF_TOOLS.has(toolCall.name)) return;
	const { lines, stats } = computeDiff(result, toolCall);
	if (lines.length === 0) return;
	const filePath =
		(typeof result?.filePath === 'string' && result.filePath) ||
		(typeof toolCall.input.file_path === 'string' && toolCall.input.file_path) ||
		'file';
	toolCall.diffData = { filePath, diffLines: lines, stats };
}

interface ChatStoreState {
	messages: ChatMessage[];
	status: ChatStatus;
	liveAssistantId: string | null;
	interruptedId: string | null;
	usage: UsageInfo | null;
	errorActive: boolean;
}

/**
 * The bound turn runner + start-failure notifier live OUTSIDE reactive state so the
 * store holds plain DTOs only (ADR-003) and Pinia never tries to make a use-case
 * instance reactive. Keyed by the store instance via a WeakMap.
 */
interface ChatDeps {
	runner: ChatTurnRunner;
	notifyStartFailure: StartFailureNotifier;
	/** Console-only `LoggerPort` for the EC-RR-1/2/9 degrade `warn`s (§8). Optional. */
	logger: LoggerPort;
}
const deps = new WeakMap<object, ChatDeps>();

function initialState(): ChatStoreState {
	return {
		messages: [],
		status: 'empty',
		liveAssistantId: null,
		interruptedId: null,
		usage: null,
		errorActive: false,
	};
}

export const useChatStore = defineStore('chat', {
	state: initialState,

	getters: {
		/** Welcome state — drives `WelcomeGreeting` (REQ-CC-011). */
		isEmpty: (state): boolean => state.messages.length === 0,
		/** Drives composer-disabled + the busy indicator (REQ-CC-009). */
		isStreaming: (state): boolean => state.status === 'streaming',
	},

	actions: {
		/**
		 * Bind the turn runner + the start-failure notifier (and an optional
		 * `LoggerPort` for the P2 degrade `warn`s — SPEC-RR-020 §8). The surface calls
		 * this on mount with a `RunChatTurnUseCase` built from `useChatRuntimePort()`,
		 * the `FeedbackService.showError` seam (SPEC-CC-018), and `useLoggerPort()`.
		 */
		bindTurnRunner(
			runner: ChatTurnRunner,
			notifyStartFailure: StartFailureNotifier,
			logger: LoggerPort = NOOP_LOGGER,
		): void {
			deps.set(this, { runner, notifyStartFailure, logger });
		},

		/** The bound logger, or a no-op so a degrade `warn` never faults (SPEC-RR-020 §8). */
		_logger(): LoggerPort {
			return deps.get(this)?.logger ?? NOOP_LOGGER;
		},

		/** Send-guard: not streaming AND non-empty trimmed text (REQ-CC-007). */
		canSend(text: string): boolean {
			return this.status !== 'streaming' && text.trim().length > 0;
		},

		/**
		 * Append the user turn, capture history, start one turn (REQ-CC-003). Empty /
		 * whitespace text or a runner-less / streaming store is a no-op (EC-1, EC-4).
		 */
		async sendMessage(text: string, currentNotePath?: string): Promise<void> {
			const bound = deps.get(this);
			if (!this.canSend(text) || bound === undefined) return;

			this.messages.push(userMessage(text));
			this.errorActive = false;
			this.interruptedId = null;
			this.status = 'streaming';

			// History BEFORE the assistant reply includes the just-appended user message.
			const history = this.messages.map((m) => ({ ...m }));
			const input: RunChatTurnInput = { request: { text, currentNotePath }, history };

			const result = await bound.runner.run(input, this._sink());
			// Only a PRE-STREAM start failure needs the sticky notice + reset: the sink was
			// never driven, so the store is still mid-`streaming`. A `'runtime-throw'` already
			// emitted an inline error + `done` through the sink (onDone resolved status to
			// 'error'), so re-handling it here would flip status back to idle and raise a
			// duplicate notice (Codex review #433). Skip it.
			if (!result.ok && result.error.kind !== 'runtime-throw') {
				this._handleStartFailure(result.error);
			}
		},

		/** Abort the in-flight turn; mark the partial assistant message interrupted (EC-8). */
		cancelTurn(): void {
			deps.get(this)?.runner.cancel();
			if (this.liveAssistantId !== null) this.interruptedId = this.liveAssistantId;
			this.liveAssistantId = null;
			this.status = 'idle';
		},

		// ── ChatTurnSink legs (driven by the use case) ────────────────────────────

		/**
		 * The live assistant message, or `undefined` when the turn is not streaming
		 * (every sink leg no-ops in that case — parity with `onText`, EC-9/EC-RR).
		 */
		_liveMessage(): ChatMessage | undefined {
			if (this.liveAssistantId === null || this.status !== 'streaming') return undefined;
			return this.messages.find((m) => m.id === this.liveAssistantId);
		},

		/** Create the empty live assistant message (REQ-CC-004). */
		onAssistantStart(): void {
			const message = assistantMessage();
			this.messages.push(message);
			this.liveAssistantId = message.id;
		},

		/**
		 * Append incremental content to the live message; ignored after cancel (EC-9).
		 * P2 (REQ-RR-011): also push/extend a trailing `{type:'text'}` content block so
		 * order is preserved across interleaved text/tool/thinking. Consecutive text is
		 * coalesced onto one block (SPEC-RR-020).
		 */
		onText(content: string): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			live.content += content;
			this._extendTextBlock(live, content);
		},

		/**
		 * Push or extend a trailing `{type:'text'}` content block on `message` so the
		 * ordered block render (SPEC-RR-022/023) stays complete and order-preserving
		 * (REQ-RR-011). Consecutive text coalesces onto one block. Only the in-block
		 * tail is touched here; `content` accumulation is the caller's responsibility.
		 */
		_extendTextBlock(message: ChatMessage, content: string): void {
			const blocks = (message.contentBlocks ??= []);
			const last = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
			if (last?.type === 'text') {
				last.content += content;
			} else {
				blocks.push({ type: 'text', content });
			}
		},

		/** Store the usage DTO; no content mutation (REQ-CC-005a, EC-10). */
		onUsage(usage: UsageInfo): void {
			this.usage = usage;
		},

		/**
		 * Append a streaming error inline and flag the turn errored (EC-6, REQ-CC-012).
		 * When the live message already renders via ordered blocks (P2 fork,
		 * SPEC-RR-023), mirror the inline error onto the trailing text block so the
		 * block-rendered view shows it too (REQ-RR-011). A pure-P1 turn that emitted no
		 * blocks keeps the plain `content`-only path untouched.
		 */
		onErrorChunk(content: string): void {
			const live = this.messages.find((m) => m.id === this.liveAssistantId);
			if (live) {
				live.content += content;
				if (live.contentBlocks !== undefined) this._extendTextBlock(live, content);
			}
			this.errorActive = true;
		},

		/** Finalise: live id cleared; status resolves to error (transient) or idle (REQ-CC-005). */
		onDone(): void {
			this.liveAssistantId = null;
			this.status = this.errorActive ? 'error' : 'idle';
		},

		// ── P2 sink legs (SPEC-RR-020): block/tool/subagent state ──────────────────

		/**
		 * Create a `ToolCall{running}` + a top-level content block, or merge `input`
		 * on a repeat for the same id (no duplicate block, parity `StreamController:262`).
		 * A `Task`/`Agent` spawn ALSO seeds its `SubagentInfo` (so nested-tool legs
		 * correlate by the spawn id, SPEC-RR-017/020) and records a
		 * `{type:'subagent', subagentId}` block — NOT a `{type:'tool_use'}` block — so
		 * `MessageBlocks` routes it to `SubagentBlock` (parity claudian
		 * `StreamController.recordSubagentInMessage` :1008; SPEC-RR-004/022, CLAR-RR-008).
		 * Every other tool records a `{type:'tool_use'}` block. REQ-RR-002.
		 */
		onToolUse(id: string, name: string, input: Record<string, unknown>): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			const tools = (live.toolCalls ??= []);
			const blocks = (live.contentBlocks ??= []);

			const existing = tools.find((t) => t.id === id);
			if (existing) {
				existing.input = { ...existing.input, ...input };
				return;
			}

			const toolCall: ToolCall = { id, name, input, status: 'running' };
			if (SUBAGENT_SPAWN_TOOLS.has(name)) {
				const subagent: SubagentInfo = {
					id,
					description: spawnDescription(input),
					status: 'running',
					toolCalls: [],
				};
				const prompt = spawnPrompt(input);
				if (prompt !== undefined) subagent.prompt = prompt;
				toolCall.subagent = subagent;
				tools.push(toolCall);
				blocks.push({ type: 'subagent', subagentId: id });
				return;
			}
			tools.push(toolCall);
			blocks.push({ type: 'tool_use', toolId: id });
		},

		/**
		 * Match the `ToolCall` by id, set its result + status, and (for Write/Edit)
		 * compute `diffData`. A permission-denied result text resolves to `blocked`
		 * rather than `completed` (R-RR-008, `isBlockedToolResult`); `isError` keeps
		 * precedence (claudian StreamController :611-617). Unknown id / out-of-order
		 * before its `tool_use` → `warn` + ignore, no buffer (EC-RR-1/2). REQ-RR-003/026.
		 */
		onToolResult(id: string, content: string, isError: boolean, result?: ToolUseResult): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			const toolCall = live.toolCalls?.find((t) => t.id === id);
			if (toolCall === undefined) {
				this._logger().warn(`[chatStore] tool_result for unknown tool id: ${id}`);
				return;
			}

			toolCall.result = content;
			toolCall.status = resolveToolStatus(content, isError);
			applyToolDiff(toolCall, result);
		},

		/** Append interim output to the matched tool's result (EC-RR-1 unknown id → ignore). */
		onToolOutput(id: string, content: string): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			const toolCall = live.toolCalls?.find((t) => t.id === id);
			if (toolCall === undefined) {
				this._logger().warn(`[chatStore] tool_output for unknown tool id: ${id}`);
				return;
			}
			toolCall.result = (toolCall.result ?? '') + content;
		},

		/**
		 * Accumulate onto a trailing `thinking` block, or push a new one when a
		 * different block intervened (preserves stream order, REQ-RR-004/011).
		 */
		onThinking(content: string): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			const blocks = (live.contentBlocks ??= []);
			const last = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
			if (last?.type === 'thinking') {
				last.content += content;
			} else {
				blocks.push({ type: 'thinking', content });
			}
		},

		/**
		 * Push a nested running `ToolCall` under the spawning subagent (matched by
		 * `subagentId`). No top-level block. Unknown `subagentId` → `warn` + ignore
		 * (EC-RR-9). REQ-RR-006.
		 */
		onSubagentToolUse(
			subagentId: string,
			id: string,
			name: string,
			input: Record<string, unknown>,
		): void {
			const subagent = this._findSubagent(subagentId);
			if (subagent === undefined) {
				this._logger().warn(`[chatStore] subagent_tool_use for unknown subagent: ${subagentId}`);
				return;
			}
			if (subagent.toolCalls.some((t) => t.id === id)) return;
			subagent.toolCalls.push({ id, name, input, status: 'running' });
		},

		/**
		 * Set a nested tool's result + status within its subagent (+ Write/Edit diff).
		 * Unknown subagentId / id → ignore + `warn` (EC-RR-9). REQ-RR-006.
		 */
		onSubagentToolResult(
			subagentId: string,
			id: string,
			content: string,
			isError: boolean,
			result?: ToolUseResult,
		): void {
			const subagent = this._findSubagent(subagentId);
			const toolCall = subagent?.toolCalls.find((t) => t.id === id);
			if (toolCall === undefined) {
				this._logger().warn(
					`[chatStore] subagent_tool_result for unknown subagent/tool: ${subagentId}/${id}`,
				);
				return;
			}
			toolCall.result = content;
			toolCall.status = resolveToolStatus(content, isError);
			applyToolDiff(toolCall, result);
		},

		/**
		 * Consolidate an async subagent's spawn with its result (matched by `agentId`,
		 * which defaults to the spawn tool id). EC-RR-10: an `error` with no `result`
		 * keeps the result unset. Unknown `agentId` → ignore. REQ-RR-006/021a.
		 */
		onAsyncSubagentResult(agentId: string, status: 'completed' | 'error', result?: string): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			const toolCall = live.toolCalls?.find(
				(t) => t.subagent?.agentId === agentId || t.subagent?.id === agentId,
			);
			if (toolCall?.subagent === undefined) {
				this._logger().warn(
					`[chatStore] async_subagent_result for unknown agent: ${agentId}`,
				);
				return;
			}
			toolCall.subagent = consolidateSubagent(
				toolCall.subagent,
				result === undefined ? { status } : { status, result },
			);
		},

		/** Push the render-only context-compacted block (NG1). */
		onContextCompacted(): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			(live.contentBlocks ??= []).push({ type: 'context_compacted' });
		},

		/**
		 * Render-only notice: append the text inline onto the live message (reuses the
		 * P1 inline-text path — no thread machinery). No-op when not streaming.
		 */
		onNotice(content: string, _level?: 'info' | 'warning'): void {
			const live = this._liveMessage();
			if (live === undefined) return;
			live.content += content;
			if (live.contentBlocks !== undefined) this._extendTextBlock(live, content);
		},

		/** Resolve a `SubagentInfo` on the live message by its spawn id (SPEC-RR-020). */
		_findSubagent(subagentId: string): SubagentInfo | undefined {
			const live = this._liveMessage();
			return live?.toolCalls?.find((t) => t.subagent?.id === subagentId)?.subagent;
		},

		/** Cancel any in-flight turn and clear all state (EC-15, on view close). */
		$reset(): void {
			deps.get(this)?.runner.cancel();
			// Mutator form of `$patch`: the object form's `_DeepPartial` overload no
			// longer resolves once `ChatMessage` grows the recursive `contentBlocks`/
			// `toolCalls` fields (SPEC-RR-008). Assigning each top-level key from a
			// fresh `initialState()` keeps the identical reset behaviour.
			this.$patch((state) => {
				Object.assign(state, initialState());
			});
		},

		/** EC-7: surface a sticky start-failure notice; leave no dangling live message. */
		_handleStartFailure(error: ChatTurnError): void {
			this.liveAssistantId = null;
			this.errorActive = true;
			this.status = 'idle';
			deps.get(this)?.notifyStartFailure(error.message);
		},

		/**
		 * The `ChatTurnSink` the use case drives — bound to this store's actions. The
		 * P1 legs plus the P2 block/tool/subagent legs (SPEC-RR-020) are wired below.
		 */
		_sink(): ChatTurnSink {
			return {
				onAssistantStart: () => {
					this.onAssistantStart();
				},
				onText: (content) => {
					this.onText(content);
				},
				onUsage: (usage) => {
					this.onUsage(usage);
				},
				onErrorChunk: (content) => {
					this.onErrorChunk(content);
				},
				onDone: () => {
					this.onDone();
				},
				// ---- P2 legs (SPEC-RR-020) ----
				onToolUse: (id, name, input) => {
					this.onToolUse(id, name, input);
				},
				onToolResult: (id, content, isError, result) => {
					this.onToolResult(id, content, isError, result);
				},
				onToolOutput: (id, content) => {
					this.onToolOutput(id, content);
				},
				onThinking: (content) => {
					this.onThinking(content);
				},
				onSubagentToolUse: (subagentId, id, name, input) => {
					this.onSubagentToolUse(subagentId, id, name, input);
				},
				onSubagentToolResult: (subagentId, id, content, isError, result) => {
					this.onSubagentToolResult(subagentId, id, content, isError, result);
				},
				onAsyncSubagentResult: (agentId, status, result) => {
					this.onAsyncSubagentResult(agentId, status, result);
				},
				onContextCompacted: () => {
					this.onContextCompacted();
				},
				onNotice: (content, level) => {
					this.onNotice(content, level);
				},
			};
		},
	},
});
