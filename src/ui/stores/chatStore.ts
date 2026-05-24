import { defineStore } from 'pinia';
import type { ChatMessage, UsageInfo } from '@/domain/ports';
import type {
	ChatTurnSink,
	RunChatTurnInput,
	ChatTurnError,
} from '@/application/chat/RunChatTurnUseCase';
import type { Result } from '@/domain/shared/Result';

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

function newId(): string {
	return crypto.randomUUID();
}

function userMessage(content: string): ChatMessage {
	return { id: newId(), role: 'user', content, timestamp: Date.now() };
}

function assistantMessage(): ChatMessage {
	return { id: newId(), role: 'assistant', content: '', timestamp: Date.now() };
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
		 * Bind the turn runner + the start-failure notifier. The surface calls this on
		 * mount with a `RunChatTurnUseCase` built from `useChatRuntimePort()` and the
		 * `FeedbackService.showError` seam (SPEC-CC-018).
		 */
		bindTurnRunner(runner: ChatTurnRunner, notifyStartFailure: StartFailureNotifier): void {
			deps.set(this, { runner, notifyStartFailure });
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
			if (!result.ok) this._handleStartFailure(result.error);
		},

		/** Abort the in-flight turn; mark the partial assistant message interrupted (EC-8). */
		cancelTurn(): void {
			deps.get(this)?.runner.cancel();
			if (this.liveAssistantId !== null) this.interruptedId = this.liveAssistantId;
			this.liveAssistantId = null;
			this.status = 'idle';
		},

		// ── ChatTurnSink legs (driven by the use case) ────────────────────────────

		/** Create the empty live assistant message (REQ-CC-004). */
		onAssistantStart(): void {
			const message = assistantMessage();
			this.messages.push(message);
			this.liveAssistantId = message.id;
		},

		/** Append incremental content to the live message; ignored after cancel (EC-9). */
		onText(content: string): void {
			if (this.liveAssistantId === null || this.status !== 'streaming') return;
			const live = this.messages.find((m) => m.id === this.liveAssistantId);
			if (live) live.content += content;
		},

		/** Store the usage DTO; no content mutation (REQ-CC-005a, EC-10). */
		onUsage(usage: UsageInfo): void {
			this.usage = usage;
		},

		/** Append a streaming error inline and flag the turn errored (EC-6, REQ-CC-012). */
		onErrorChunk(content: string): void {
			const live = this.messages.find((m) => m.id === this.liveAssistantId);
			if (live) live.content += content;
			this.errorActive = true;
		},

		/** Finalise: live id cleared; status resolves to error (transient) or idle (REQ-CC-005). */
		onDone(): void {
			this.liveAssistantId = null;
			this.status = this.errorActive ? 'error' : 'idle';
		},

		/** Cancel any in-flight turn and clear all state (EC-15, on view close). */
		$reset(): void {
			deps.get(this)?.runner.cancel();
			this.$patch(initialState());
		},

		/** EC-7: surface a sticky start-failure notice; leave no dangling live message. */
		_handleStartFailure(error: ChatTurnError): void {
			this.liveAssistantId = null;
			this.errorActive = true;
			this.status = 'idle';
			deps.get(this)?.notifyStartFailure(error.message);
		},

		/** The `ChatTurnSink` the use case drives — bound to this store's actions. */
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
			};
		},
	},
});
