import { defineStore } from 'pinia';
import type {
	ChatMessage,
	LoggerPort,
	UsageInfo,
	ProviderHistoryPort,
	ChatRuntimePort,
	ConversationRecord,
	RuntimeCapabilities,
} from '@/domain/ports';
import { CONVERSATION_RECORD_VERSION } from '@/domain/chat/ConversationRecord';
import type { ProviderSessionState } from '@/domain/chat/ConversationRecord';
import type { ChatTurnSink, RunChatTurnInput } from '@/application/chat/RunChatTurnUseCase';
import type { ChatTurnRequest } from '@/domain/chat/ChatTurn';
import type { EnabledMcpServers } from '@/domain/chat/mcp/McpTypes';
import type { TabControls } from '@/domain/chat/toolbar/TabControls';
import { foldControlOptions } from '@/application/chat/toolbar/foldControlOptions';
import type {
	AttachedFileRef,
	AttachedImage,
	CapturedSelection,
} from '@/domain/chat/attachments';
import type { Result } from '@/domain/shared/Result';
import { ForkConversationUseCase } from '@/application/threads/ForkConversationUseCase';
import { RewindConversationUseCase } from '@/application/threads/RewindConversationUseCase';
import { isRewindEligible } from '@/application/threads/rewindEligibility';
import type { ForkTarget } from '@/application/threads/chooseForkTarget';
import type { ToolCall } from '@/domain/chat/ToolCall';
import type { SubagentInfo } from '@/domain/chat/Subagent';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';
import { computeDiff } from '@/application/chat/computeDiff';
import { consolidateSubagent } from '@/application/chat/resolveSubagentLifecycle';
import { isBlockedToolResult } from '@/application/chat/toolStatus';
import type { ChatStatus, ChatTurnRunner, StartFailureNotifier } from './chatStore';

/**
 * The multi-thread tabs store (SPEC-TS-019, ADR-TS-002 §1). Generalises the P1
 * single-thread `chatStore` to N tabs as plain DTOs (`TabState[]` + `activeTabId`),
 * DTO-only (ADR-003, NFR-TS-003). Each P1/P2 sink leg the runner drives now operates
 * on the OWNING tab's `TabState` (resolved by `TabId`, not a store root) → per-tab
 * streaming isolation falls out (REQ-TS-006, EC-TS-3/13). The per-tab runtime +
 * runner + notifier + logger live in a `Map<TabId, TabDeps>` OUTSIDE reactive state
 * — one `ChatRuntimePort` instance per tab. The store never imports `obsidian`.
 */

/** Re-export the P1 status union for tab consumers (the per-tab state machine). */
export type { ChatStatus } from './chatStore';

/** A tab id (`crypto.randomUUID()`). */
export type TabId = string;

/** The title-gen ladder status driving the history-row spin (REQ-TS-025). */
export type TitleStatus = 'none' | 'pending' | 'success' | 'failed';

/** One tab's reactive DTO state (SPEC-TS-019). Plain data only — no instance/function. */
export interface TabState {
	id: TabId;
	conversationId: string | null;
	title: string;
	titleManual: boolean;
	titleStatus: TitleStatus;
	status: ChatStatus;
	messages: ChatMessage[];
	liveAssistantId: string | null;
	interruptedId: string | null;
	usage: UsageInfo | null;
	errorActive: boolean;
	sessionId: string | null;
	needsAttention: boolean;
	/** Set ONCE at creation; preserved across saves so history ordering holds (R-TS-004, REQ-TS-010). */
	createdAt: number;
	/**
	 * The provider-owned lineage/fork bag (opaque DTO). A fork seeds `{ forkSource }`
	 * here so the forked tab resumes the source session (R-TS-003, REQ-TS-018); a
	 * fresh tab carries `{}`. Persisted verbatim — never reset to `{}` on re-save
	 * (R-TS-004). No secret (NFR-TS-013).
	 */
	providerState: ProviderSessionState;
	/**
	 * P6 (SPEC-TC-006/023, ADR-TC-001 §1): the per-tab toolbar control selections
	 * (model/mode/reasoning/serviceTier). A draft-input bag the surface folds into
	 * the next turn on submit; an absent member means "no explicit choice — the
	 * runtime applies its default" so an untouched toolbar turn is byte-identical to
	 * P5 (NFR-TC-001). Plain DTO — crosses the Pinia store boundary (NFR-TC-005).
	 */
	controls: TabControls;
}

/**
 * P5 (SPEC-CA-001/022, R-CA-001): the per-tab context the surface folds into the
 * submitted turn. ADDITIVE — every member is optional, so a `sendMessage(text)`
 * call with no context yields a `{ text }`-only request byte-identical to P1 (G2,
 * SPEC-CA-028). The parent (ChatSurface) owns the reactive sets (ADR-CA-001 §2)
 * and passes a snapshot here; `onConsumed` fires on a SUCCESSFUL submit so the
 * parent clears the sets for the next turn (REQ-CA-004/010/019).
 */
export interface SendMessageContext {
	attachedFiles?: readonly AttachedFileRef[];
	images?: readonly AttachedImage[];
	/** The single captured selection, mapped into the matching request field by `kind`. */
	selection?: CapturedSelection | null;
	/** Invoked once after a successful submit so the parent clears its sets. */
	onConsumed?: () => void;
}

/** The payload a resume/fork loads into a tab (SPEC-TS-022/031). */
export interface TabLoadPayload {
	conversationId: string | null;
	title: string;
	messages: ChatMessage[];
	sessionId: string | null;
	/** The derived/persisted provider lineage bag (fork → forkSource); absent → `{}` (R-TS-003). */
	providerState?: ProviderSessionState;
}

/**
 * The OUTSIDE-reactive-state deps the surface binds (the P1 `bindTurnRunner`
 * pattern generalised). `createRuntime`/`createRunner` build one of each per tab so
 * streaming is isolated by construction (REQ-TS-006). `generateTitle` is the
 * `GenerateTitleUseCase.execute` seam (SPEC-TS-031). No `obsidian`/use-case
 * instance crosses into reactive state.
 */
export interface TabDepsBinding {
	createRuntime(): ChatRuntimePort;
	createRunner(runtime: ChatRuntimePort): ChatTurnRunner;
	notifyStartFailure: StartFailureNotifier;
	notifyInfo: StartFailureNotifier;
	history: ProviderHistoryPort;
	generateTitle(firstUserMessage: string): Promise<Result<string>>;
	getMaxTabs(): number;
	logger?: LoggerPort;
	/**
	 * P4 (R-CP-001, SPEC-CP-011, REQ-CP-018): read the persisted
	 * `customSystemPrompt` (via `SettingsPort`, where it already lives) so a sent
	 * turn carries it as `queryOptions.appendSystemPrompt`. Optional — when absent
	 * the turn omits the system prompt (degrades to P3 behaviour). The
	 * `SettingsPort` read stays in the surface/application layer, not the store.
	 */
	getAppendSystemPrompt?(): Promise<string | undefined>;
	/**
	 * P8 (SPEC-MC-020, REQ-MC-052/082): the guarded enabled-MCP-servers fold. The
	 * surface threads its per-surface `McpServerManager.getEnabledMcpServers(∅)` so a
	 * sent turn carries the active servers + the disallowed-tool list as
	 * `queryOptions.enabledMcpServers`. Optional — when absent (no MCP store port) the
	 * turn omits the field (byte-identical to P7). Returns `undefined` when the active
	 * set is empty, so a no-enabled-server turn also omits it (the pure guarded fold).
	 */
	getEnabledMcpServers?(): EnabledMcpServers | undefined;
}

/** Per-tab runner + runtime + notifier + logger held OUTSIDE reactive state (ADR-003). */
interface TabDeps {
	runtime: ChatRuntimePort;
	runner: ChatTurnRunner;
}

const NOOP_LOGGER: LoggerPort = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

const DIFF_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit']);
const SUBAGENT_SPAWN_TOOLS: ReadonlySet<string> = new Set(['Task', 'Agent']);
const FALLBACK_TITLE = 'New conversation';
const FALLBACK_TITLE_MAX = 40;

function newId(): string {
	return crypto.randomUUID();
}

/** A type-narrowing guard for an optional non-empty string (the append-prompt fold gate). */
function isNonEmptyText(value: string | undefined): value is string {
	return value !== undefined && value.length > 0;
}

function userMessage(content: string): ChatMessage {
	// R-TS-001: stamp the user-turn id at send so the eligibility scan keys on a
	// real conversation (claudian sets `userMessageId` from the SDK message uuid —
	// sdkMessageParsing.ts:214; on our live path the user message's own id is the
	// stable turn id). The following assistant message proves the turn ran.
	const id = newId();
	return { id, role: 'user', content, userMessageId: id, timestamp: Date.now() };
}

function assistantMessage(): ChatMessage {
	return { id: newId(), role: 'assistant', content: '', timestamp: Date.now() };
}

function spawnDescription(input: Record<string, unknown>): string {
	const value = input.description;
	return typeof value === 'string' ? value : '';
}

function spawnPrompt(input: Record<string, unknown>): string | undefined {
	const value = input.prompt;
	return typeof value === 'string' ? value : undefined;
}

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

/** Push or extend a trailing `{type:'text'}` block on `message` (REQ-RR-011). */
function extendTextBlock(message: ChatMessage, content: string): void {
	const blocks = (message.contentBlocks ??= []);
	const last = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
	if (last?.type === 'text') {
		last.content += content;
	} else {
		blocks.push({ type: 'text', content });
	}
}

/** A neutral fallback title derived from the first user message (SPEC-TS-031). */
function fallbackTitleFrom(firstUserMessage: string): string {
	const trimmed = firstUserMessage.trim();
	if (trimmed.length === 0) return FALLBACK_TITLE;
	if (trimmed.length <= FALLBACK_TITLE_MAX) return trimmed;
	return `${trimmed.slice(0, FALLBACK_TITLE_MAX).trimEnd()}…`;
}

/**
 * Fold the present context into the turn request (SPEC-CA-001, R-CA-001). ADDITIVE
 * + GUARDED: a field is written ONLY when it carries content, so an absent/empty
 * context yields a `{ text, currentNotePath? }`-only request byte-identical to P1
 * (G2, SPEC-CA-028). The captured selection maps to the field matching its `kind`
 * — at most one selection field is ever set (REQ-CA-019).
 */
function buildTurnRequest(
	text: string,
	currentNotePath: string | undefined,
	context: SendMessageContext | undefined,
): ChatTurnRequest {
	const request: ChatTurnRequest = { text };
	if (currentNotePath !== undefined) request.currentNotePath = currentNotePath;
	if (context === undefined) return request;
	if ((context.attachedFiles?.length ?? 0) > 0) request.attachedFiles = context.attachedFiles;
	if ((context.images?.length ?? 0) > 0) request.images = context.images;
	foldSelection(request, context.selection ?? null);
	return request;
}

/** Map the single captured selection into the field matching its `kind` (REQ-CA-019). */
function foldSelection(request: ChatTurnRequest, selection: CapturedSelection | null): void {
	if (selection === null) return;
	if (selection.kind === 'editor') request.editorSelection = selection;
	else if (selection.kind === 'canvas') request.canvasSelection = selection;
	else request.browserSelection = selection;
}

function freshTab(): TabState {
	return {
		id: newId(),
		conversationId: null,
		title: '',
		titleManual: false,
		titleStatus: 'none',
		status: 'empty',
		messages: [],
		liveAssistantId: null,
		interruptedId: null,
		usage: null,
		errorActive: false,
		sessionId: null,
		needsAttention: false,
		createdAt: Date.now(),
		providerState: {},
		// P6 (SPEC-TC-023): a fresh tab starts with no explicit control choice.
		controls: {},
	};
}

interface TabsStoreState {
	tabs: TabState[];
	activeTabId: TabId | null;
}

/**
 * The per-tab deps + the binding live OUTSIDE reactive state, keyed by the store
 * instance via a WeakMap so Pinia never makes a runtime/runner reactive (ADR-003).
 */
interface StoreSidecar {
	binding: TabDepsBinding | null;
	deps: Map<TabId, TabDeps>;
}
const sidecar = new WeakMap<object, StoreSidecar>();

function initialState(): TabsStoreState {
	return { tabs: [], activeTabId: null };
}

export const useTabsStore = defineStore('tabs', {
	state: initialState,

	getters: {
		activeTab: (state): TabState | undefined =>
			state.tabs.find((t) => t.id === state.activeTabId),
		isEmpty(): boolean {
			return (this.activeTab?.messages.length ?? 0) === 0;
		},
		isStreaming(): boolean {
			return this.activeTab?.status === 'streaming';
		},
	},

	// The fork/rewind capability of the active tab's runtime is exposed via an
	// action (`activeCapabilities`) rather than a getter so it reads through the
	// OUTSIDE-reactive-state runtime (a getter cannot reach the deps Map cleanly).

	actions: {
		/** Bind the OUTSIDE-reactive-state deps + seed the first empty tab (SPEC-TS-019). */
		bindTabDeps(binding: TabDepsBinding): void {
			sidecar.set(this, { binding, deps: new Map() });
			if (this.tabs.length === 0) this._spawnTab();
		},

		_sidecar(): StoreSidecar {
			let s = sidecar.get(this);
			if (s === undefined) {
				s = { binding: null, deps: new Map() };
				sidecar.set(this, s);
			}
			return s;
		},

		_logger(): LoggerPort {
			return this._sidecar().binding?.logger ?? NOOP_LOGGER;
		},

		/** Create a tab + its per-tab runtime/runner, append it, return its id. */
		_spawnTab(): TabId {
			const tab = freshTab();
			this.tabs.push(tab);
			const binding = this._sidecar().binding;
			if (binding !== null) {
				const runtime = binding.createRuntime();
				const runner = binding.createRunner(runtime);
				this._sidecar().deps.set(tab.id, { runtime, runner });
			}
			this.activeTabId = tab.id;
			return tab.id;
		},

		_deps(tabId: TabId): TabDeps | undefined {
			return this._sidecar().deps.get(tabId);
		},

		_tab(tabId: TabId): TabState | undefined {
			return this.tabs.find((t) => t.id === tabId);
		},

		/** Open a fresh empty tab; clamp to maxTabs (EC-TS-1, non-blocking notice). */
		openTab(): void {
			const binding = this._sidecar().binding;
			const max = binding?.getMaxTabs() ?? 1;
			if (this.tabs.length >= max) {
				this._logger().info('tabs: ceiling reached', { maxTabs: max });
				binding?.notifyInfo('Maximum number of tabs reached.');
				return;
			}
			this._spawnTab();
		},

		/** Activate `id` + clear its attention (REQ-TS-002). Other tabs untouched. */
		switchTab(id: TabId): void {
			const tab = this._tab(id);
			if (tab === undefined) return;
			this.activeTabId = id;
			tab.needsAttention = false;
		},

		/**
		 * Remove `id`, dispose its runner, activate an adjacent tab (previous, or
		 * next-for-first). Closing the last tab leaves one fresh empty tab (EC-TS-2).
		 */
		closeTab(id: TabId): void {
			const index = this.tabs.findIndex((t) => t.id === id);
			if (index === -1) return;
			this._deps(id)?.runner.cancel();
			this._sidecar().deps.delete(id);
			this.tabs.splice(index, 1);

			if (this.tabs.length === 0) {
				this._spawnTab();
				return;
			}
			if (this.activeTabId === id) {
				// Activate the previous neighbour, or the new first tab when the closed
				// tab was first; clamp to the last index so a stale index never overruns.
				const neighbourIndex = Math.min(Math.max(index - 1, 0), this.tabs.length - 1);
				this.activeTabId = this.tabs[neighbourIndex].id;
			}
		},

		/** Set `needsAttention` on a non-active tab whose turn ended (REQ-TS-007). */
		markAttention(tabId: TabId): void {
			if (tabId === this.activeTabId) return;
			const tab = this._tab(tabId);
			if (tab !== undefined) tab.needsAttention = true;
		},

		/** Load a resume/fork payload into an existing tab; bind resume (SPEC-TS-022/031). */
		loadIntoTab(tabId: TabId, payload: TabLoadPayload): void {
			const tab = this._tab(tabId);
			if (tab === undefined) return;
			// R-TS-005: cancel any in-flight turn BEFORE overwriting the transcript so the
			// old runner's closed-over sink (scoped by this tabId) cannot mutate the resumed
			// transcript after the swap. Mirrors claudian's guard: resume does not silently
			// clobber a busy tab (ConversationController.switchTo bails while streaming; the
			// forced path cancels first). The live id is cleared below regardless.
			if (tab.status === 'streaming') {
				this._deps(tabId)?.runner.cancel();
			}
			tab.messages = payload.messages.map((m) => ({ ...m }));
			tab.title = payload.title;
			tab.titleManual = payload.title.length > 0;
			tab.titleStatus = payload.title.length > 0 ? 'success' : 'none';
			tab.conversationId = payload.conversationId;
			tab.sessionId = payload.sessionId;
			// R-TS-003: carry the derived/persisted provider lineage onto the tab so the
			// first persist round-trips it (forked tab resumes the source session).
			tab.providerState = { ...(payload.providerState ?? {}) };
			tab.status = tab.messages.length === 0 ? 'empty' : 'idle';
			tab.liveAssistantId = null;
			tab.interruptedId = null;
			tab.errorActive = false;
			// P6 (SPEC-TC-023, REQ-TC-042): a resumed/forked conversation starts with no
			// explicit control choice — the runtime applies its defaults (parity with the
			// P5 context-set reset).
			tab.controls = {};
			if (payload.sessionId !== null) {
				this._deps(tabId)?.runtime.resumeSession(payload.sessionId);
			}
		},

		/** Open a new tab and load the payload into it (fork → new-tab, SPEC-TS-031). */
		loadIntoNewTab(payload: TabLoadPayload): void {
			const id = this._spawnTab();
			this.loadIntoTab(id, payload);
		},

		/** Remove messages after `userMessageId` (rewind conversation mode, REQ-TS-021). */
		truncateTo(tabId: TabId, userMessageId: string): void {
			const tab = this._tab(tabId);
			if (tab === undefined) return;
			const index = tab.messages.findIndex((m) => m.id === userMessageId);
			if (index === -1) return;
			tab.messages = tab.messages.slice(0, index + 1);
			tab.liveAssistantId = null;
		},

		/**
		 * R-CP-002: the ACTIVE tab's runtime — the same per-tab instance `sendMessage`
		 * streams on (held OUTSIDE reactive state). The composer binds its inline-block
		 * channel + capability reads to this so a streaming-runtime-pulled
		 * ask_user_question / exit_plan_mode / approval_request reaches the rendered
		 * queue (no orphan runtime). `undefined` before the first tab is seeded.
		 */
		activeRuntime(): ChatRuntimePort | undefined {
			const id = this.activeTabId;
			return id === null ? undefined : this._deps(id)?.runtime;
		},

		/** The active tab's runtime fork/rewind capability flags (read through the port). */
		activeCapabilities(): RuntimeCapabilities {
			const id = this.activeTabId;
			const runtime = id === null ? undefined : this._deps(id)?.runtime;
			return (
				runtime?.getCapabilities() ?? {
					supportsFork: false,
					supportsRewind: false,
					// P4 additive (SPEC-CP-002): no runtime → nothing capable.
					supportsPlanMode: false,
					supportsInlineResponse: false,
				}
			);
		},

		/** True iff the active runtime supports fork (gates the per-message control). */
		canForkActive(): boolean {
			return this.activeCapabilities().supportsFork;
		},

		/** True iff a user message is rewind-eligible AND the runtime supports rewind. */
		canRewindMessage(userMessageId: string): boolean {
			const tab = this.activeTab;
			if (tab === undefined) return false;
			return (
				this.activeCapabilities().supportsRewind &&
				isRewindEligible(tab.messages, userMessageId)
			);
		},

		/**
		 * Fork the active conversation at `userMessageId` into the chosen target
		 * (SPEC-TS-013/031). Derives a `ForkPlan` (source untouched, EC-TS-7) then
		 * loads it into the current tab or a new tab. Quiet on a missing source.
		 */
		async forkActive(target: ForkTarget, userMessageId: string): Promise<void> {
			const tab = this.activeTab;
			const binding = this._sidecar().binding;
			if (tab === undefined || binding === null || tab.conversationId === null) return;
			const fork = new ForkConversationUseCase(binding.history);
			const result = await fork.execute(tab.conversationId, userMessageId);
			if (!result.ok) {
				this._logger().warn('[tabsStore] fork failed', { conversationId: tab.conversationId });
				return;
			}
			const payload: TabLoadPayload = {
				conversationId: null,
				title: result.value.sourceTitle,
				messages: result.value.messages,
				sessionId: null,
				// R-TS-003: thread the derived `{ forkSource }` lineage through so the forked
				// tab persists it (instead of cold-starting). Mirrors claudian
				// buildForkProviderState → persisted conversation (ClaudeConversationHistoryService).
				providerState: result.value.providerState,
			};
			if (target === 'new-tab') {
				this.loadIntoNewTab(payload);
			} else {
				this.loadIntoTab(tab.id, payload);
			}
		},

		/**
		 * Rewind the active conversation at `userMessageId` (SPEC-TS-014/024).
		 * `'conversation'` truncates the tab + sets the runtime checkpoint (REQ-TS-021);
		 * `'code-and-conversation'` is gated (NG7) — no fs/git, just a notice (EC-TS-9).
		 */
		async rewindActive(
			mode: 'conversation' | 'code-and-conversation',
			userMessageId: string,
		): Promise<void> {
			const tab = this.activeTab;
			if (tab === undefined) return;
			const rewind = new RewindConversationUseCase();
			const result = await rewind.execute({ mode, messages: tab.messages, userMessageId });
			if (!result.ok) return;
			if (mode === 'code-and-conversation') {
				if (result.value.notice !== null) {
					this._sidecar().binding?.notifyInfo(result.value.notice);
				}
				return;
			}
			this.truncateTo(tab.id, userMessageId);
			if (result.value.checkpointMessageId !== null) {
				this._deps(tab.id)?.runtime.setResumeCheckpoint(result.value.checkpointMessageId);
			}
		},

		/**
		 * Compact the active conversation (SPEC-TS-015). Reuses the existing turn path:
		 * a compaction turn streams a `{type:'context_compacted'}` chunk through the
		 * existing `onContextCompacted` sink leg → the P2 block (no new machinery).
		 */
		async compactActive(): Promise<void> {
			const active = this.activeTab;
			if (active === undefined || active.status === 'streaming') return;
			const deps = this._deps(active.id);
			if (deps === undefined) return;
			const tabId = active.id;
			active.status = 'streaming';
			const history = active.messages.map((m) => ({ ...m }));
			const input: RunChatTurnInput = { request: { text: '/compact' }, history };
			const result = await deps.runner.run(input, this._sink(tabId));
			if (!result.ok && result.error.kind !== 'runtime-throw') {
				this._handleStartFailure(tabId, result.error.message);
			}
		},

		/**
		 * P6 (SPEC-TC-023, REQ-TC-012/014/018/020): set one per-tab toolbar control on
		 * the ACTIVE tab. A DRAFT-INPUT mutation — it does NOT send; the backed widgets
		 * fold into the query options on the next submit (ADR-TC-001). The seam widgets
		 * (permission/MCP/external) never call this (no `controls` member for them).
		 */
		setControl<K extends keyof TabControls>(field: K, value: TabControls[K]): void {
			const active = this.activeTab;
			if (active === undefined) return;
			active.controls = { ...active.controls, [field]: value };
		},

		/** Send-guard: not streaming AND non-empty trimmed text (REQ-CC-007). */
		canSend(text: string): boolean {
			const active = this.activeTab;
			return active !== undefined && active.status !== 'streaming' && text.trim().length > 0;
		},

		/**
		 * R-CP-001 + P6 (SPEC-TC-023): resolve the per-turn `ChatRuntimeQueryOptions`.
		 * Two ADDITIVE + GUARDED folds, coexisting: (1) the P4 `customSystemPrompt` seam
		 * → `appendSystemPrompt`; (2) the P6 toolbar controls → `model`/`mode`/
		 * `reasoning`/`serviceTier` via `foldControlOptions(active.controls)`. Each only
		 * writes a field when an explicit value is present, so an untouched-toolbar turn
		 * with no custom prompt yields `undefined` — byte-identical to P5 (NFR-TC-001,
		 * EC-TC-1/6). The seam widgets fold nothing.
		 */
		async _turnQueryOptions(): Promise<RunChatTurnInput['queryOptions']> {
			const binding = this._sidecar().binding;
			const appendSystemPrompt = await binding?.getAppendSystemPrompt?.();
			// P8 (SPEC-MC-013/020): the pure guarded fold returns `undefined` when no enabled
			// server is active, so a no-server turn omits the field (byte-identical to P7).
			const enabledMcpServers = binding?.getEnabledMcpServers?.();
			// Build the options once from the three additive + guarded folds: each writes a
			// field only when an explicit value is present, so an untouched turn yields an
			// empty object → `undefined` (byte-identical to P5/P7, NFR-TC-001, EC-TC-1/6).
			const options: NonNullable<RunChatTurnInput['queryOptions']> = {
				...foldControlOptions(this.activeTab?.controls ?? {}),
			};
			if (isNonEmptyText(appendSystemPrompt)) {
				options.appendSystemPrompt = appendSystemPrompt;
			}
			if (enabledMcpServers !== undefined) {
				options.enabledMcpServers = enabledMcpServers;
			}
			return Object.keys(options).length > 0 ? options : undefined;
		},

		/**
		 * Send on the ACTIVE tab; the sink legs route to it (REQ-TS-001/006). P5
		 * additive (R-CA-001, SPEC-CA-001/022): the optional `context` folds the
		 * present attached files / images / captured selection into the request and,
		 * on a successful submit, invokes `context.onConsumed` so the parent clears
		 * its sets for the next turn (REQ-CA-004/010/019). With no context the request
		 * is byte-identical to P1/P4 (G2).
		 */
		async sendMessage(
			text: string,
			currentNotePath?: string,
			context?: SendMessageContext,
		): Promise<void> {
			const active = this.activeTab;
			if (active === undefined || !this.canSend(text)) return;
			const deps = this._deps(active.id);
			if (deps === undefined) return;

			const tabId = active.id;
			const isFirstTurn = active.messages.length === 0;
			active.messages.push(userMessage(text));
			active.errorActive = false;
			active.interruptedId = null;
			active.status = 'streaming';

			// R-CP-001: thread the persisted instruction `customSystemPrompt` (read via
			// the binding's SettingsPort seam) into the turn's query options so the
			// runtime feeds it to the agent (CLI `--append-system-prompt`). Omitted when
			// empty/absent so a no-custom-prompt turn runs identically to P3.
			const queryOptions = await this._turnQueryOptions();

			const history = active.messages.map((m) => ({ ...m }));
			const request = buildTurnRequest(text, currentNotePath, context);
			const input: RunChatTurnInput = { request, history, queryOptions };

			const result = await deps.runner.run(input, this._sink(tabId));
			if (!result.ok && result.error.kind !== 'runtime-throw') {
				this._handleStartFailure(tabId, result.error.message);
			}
			// R-CA-001: the turn was accepted (the guard above passed) — clear the
			// parent's context sets for the next turn (REQ-CA-004/010/019). A
			// start-failure does not retain the context (parity with the cleared input).
			context?.onConsumed?.();
			if (isFirstTurn) this._onFirstTurnComplete(tabId, text);
		},

		/** Abort the active tab's in-flight turn; mark its partial interrupted (EC-8). */
		cancelTurn(): void {
			const active = this.activeTab;
			if (active === undefined) return;
			this._deps(active.id)?.runner.cancel();
			if (active.liveAssistantId !== null) active.interruptedId = active.liveAssistantId;
			active.liveAssistantId = null;
			active.status = 'idle';
		},

		// ── per-tab sink legs (carried from SPEC-CC-016 + SPEC-RR-020, scoped by TabId) ──

		_liveMessage(tab: TabState): ChatMessage | undefined {
			if (tab.liveAssistantId === null || tab.status !== 'streaming') return undefined;
			return tab.messages.find((m) => m.id === tab.liveAssistantId);
		},

		_findSubagent(tab: TabState, subagentId: string): SubagentInfo | undefined {
			const live = this._liveMessage(tab);
			return live?.toolCalls?.find((t) => t.subagent?.id === subagentId)?.subagent;
		},

		_handleStartFailure(tabId: TabId, message: string): void {
			const tab = this._tab(tabId);
			if (tab === undefined) return;
			tab.liveAssistantId = null;
			tab.errorActive = true;
			tab.status = 'idle';
			this._sidecar().binding?.notifyStartFailure(message);
		},

		/**
		 * Build the `ChatTurnSink` for the owning tab (scoped by `tabId`). Every leg
		 * resolves "the live message" through the OWNING tab's `TabState`, so a chunk
		 * for tab B mutates only B while tab A is active (per-tab isolation, EC-TS-3/13).
		 */
		_sink(tabId: TabId): ChatTurnSink {
			const logger = this._logger();
			const tabOf = (): TabState | undefined => this._tab(tabId);
			const liveOf = (): ChatMessage | undefined => {
				const tab = tabOf();
				return tab === undefined ? undefined : this._liveMessage(tab);
			};
			return {
				onAssistantStart: () => {
					const tab = tabOf();
					if (tab === undefined) return;
					const message = assistantMessage();
					tab.messages.push(message);
					tab.liveAssistantId = message.id;
				},
				onText: (content) => {
					const live = liveOf();
					if (live === undefined) return;
					live.content += content;
					extendTextBlock(live, content);
				},
				onUsage: (usage) => {
					const tab = tabOf();
					if (tab !== undefined) tab.usage = usage;
				},
				onErrorChunk: (content) => {
					const tab = tabOf();
					if (tab === undefined) return;
					const live = tab.messages.find((m) => m.id === tab.liveAssistantId);
					if (live) {
						live.content += content;
						if (live.contentBlocks !== undefined) extendTextBlock(live, content);
					}
					tab.errorActive = true;
				},
				onDone: (assistantMessageId) => {
					const tab = tabOf();
					if (tab === undefined) return;
					// R-TS-001: stamp the per-turn assistant id so rewind eligibility renders
					// on a real conversation (REQ-TS-019). Use the runtime-surfaced id when the
					// stream carried one (the CLI assistant uuid / message.id via the reducer);
					// otherwise generate a stable id at finalise — its PRESENCE is what proves
					// the turn ran (claudian derives it from the SDK uuid, sdkMessageParsing:215).
					const live = tab.messages.find((m) => m.id === tab.liveAssistantId);
					if (live !== undefined) {
						live.assistantMessageId =
							assistantMessageId !== undefined && assistantMessageId.length > 0
								? assistantMessageId
								: newId();
					}
					tab.liveAssistantId = null;
					tab.status = tab.errorActive ? 'error' : 'idle';
					if (tab.id !== this.activeTabId) this.markAttention(tab.id);
				},
				onToolUse: (id, name, input) => {
					const live = liveOf();
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
				onToolResult: (id, content, isError, result) => {
					const live = liveOf();
					if (live === undefined) return;
					const toolCall = live.toolCalls?.find((t) => t.id === id);
					if (toolCall === undefined) {
						logger.warn(`[tabsStore] tool_result for unknown tool id: ${id}`);
						return;
					}
					toolCall.result = content;
					toolCall.status = resolveToolStatus(content, isError);
					applyToolDiff(toolCall, result);
				},
				onToolOutput: (id, content) => {
					const live = liveOf();
					if (live === undefined) return;
					const toolCall = live.toolCalls?.find((t) => t.id === id);
					if (toolCall === undefined) {
						logger.warn(`[tabsStore] tool_output for unknown tool id: ${id}`);
						return;
					}
					toolCall.result = (toolCall.result ?? '') + content;
				},
				onThinking: (content) => {
					const live = liveOf();
					if (live === undefined) return;
					const blocks = (live.contentBlocks ??= []);
					const last = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
					if (last?.type === 'thinking') {
						last.content += content;
					} else {
						blocks.push({ type: 'thinking', content });
					}
				},
				onSubagentToolUse: (subagentId, id, name, input) => {
					const tab = tabOf();
					if (tab === undefined) return;
					const subagent = this._findSubagent(tab, subagentId);
					if (subagent === undefined) {
						logger.warn(`[tabsStore] subagent_tool_use for unknown subagent: ${subagentId}`);
						return;
					}
					if (subagent.toolCalls.some((t) => t.id === id)) return;
					subagent.toolCalls.push({ id, name, input, status: 'running' });
				},
				onSubagentToolResult: (subagentId, id, content, isError, result) => {
					const tab = tabOf();
					if (tab === undefined) return;
					const subagent = this._findSubagent(tab, subagentId);
					const toolCall = subagent?.toolCalls.find((t) => t.id === id);
					if (toolCall === undefined) {
						logger.warn(
							`[tabsStore] subagent_tool_result for unknown subagent/tool: ${subagentId}/${id}`,
						);
						return;
					}
					toolCall.result = content;
					toolCall.status = resolveToolStatus(content, isError);
					applyToolDiff(toolCall, result);
				},
				onAsyncSubagentResult: (agentId, status, result) => {
					const live = liveOf();
					if (live === undefined) return;
					const toolCall = live.toolCalls?.find(
						(t) => t.subagent?.agentId === agentId || t.subagent?.id === agentId,
					);
					if (toolCall?.subagent === undefined) {
						logger.warn(`[tabsStore] async_subagent_result for unknown agent: ${agentId}`);
						return;
					}
					toolCall.subagent = consolidateSubagent(
						toolCall.subagent,
						result === undefined ? { status } : { status, result },
					);
				},
				onContextCompacted: () => {
					const tab = tabOf();
					if (tab === undefined) return;
					// R-TS-006: the compact boundary is a STANDALONE separator that must render
					// even when the compact turn produced no live assistant message to attach to
					// (the runner may emit `context_compacted` without `onAssistantStart`). Seed a
					// fresh live assistant message in that case so the boundary block always lands
					// (claudian renders the boundary on the turn's assistant msg, StreamController:212;
					// its history store keeps it standalone, ClaudeHistoryStore:91).
					let live = this._liveMessage(tab);
					if (live === undefined) {
						const message = assistantMessage();
						tab.messages.push(message);
						tab.liveAssistantId = message.id;
						live = message;
					}
					(live.contentBlocks ??= []).push({ type: 'context_compacted' });
				},
				onNotice: (content) => {
					const live = liveOf();
					if (live === undefined) return;
					live.content += content;
					if (live.contentBlocks !== undefined) extendTextBlock(live, content);
				},
			};
		},

		// ── persist + title ladder (SPEC-TS-030/031) ────────────────────────────────

		/** On the first completed turn, persist + run the title ladder (fire-and-forget). */
		_onFirstTurnComplete(tabId: TabId, firstUserMessage: string): void {
			void this._persistTab(tabId);
			this._runTitleLadder(tabId, firstUserMessage);
		},

		/** Persist the tab's transcript to history (SPEC-TS-030). Quiet on failure. */
		async _persistTab(tabId: TabId): Promise<void> {
			const binding = this._sidecar().binding;
			const tab = this._tab(tabId);
			if (binding === null || tab === undefined) return;
			const id = tab.conversationId ?? newId();
			tab.conversationId = id;
			const record: ConversationRecord = {
				version: CONVERSATION_RECORD_VERSION,
				meta: {
					id,
					title: tab.title,
					titleManual: tab.titleManual,
					// R-TS-004: createdAt is set ONCE at tab creation and preserved across every
					// save so the history list orders newest-first correctly (REQ-TS-010); only
					// updatedAt advances. Mirrors claudian's partial updateConversation (createdAt
					// is never in the update patch).
					createdAt: tab.createdAt,
					updatedAt: Date.now(),
					providerId: 'claude',
					sessionId: tab.sessionId,
				},
				messages: tab.messages.map((m) => ({ ...m })),
				// R-TS-003/004: persist the tab's provider lineage verbatim (fork → forkSource),
				// never wipe it to `{}` on re-save, so the forked tab resumes the source session.
				providerState: { ...tab.providerState },
			};
			const saved = await binding.history.save(record);
			if (!saved.ok) {
				this._logger().warn('[tabsStore] history save failed', { conversationId: id });
			}
		},

		/**
		 * Title ladder (SPEC-TS-031): set the fallback immediately, then drive the AI
		 * title async — manual-rename wins (titleManual bars overwrite, EC-TS-10);
		 * failure keeps the fallback (status `failed`, no blocking error, EC-TS-11).
		 */
		_runTitleLadder(tabId: TabId, firstUserMessage: string): void {
			const tab = this._tab(tabId);
			const binding = this._sidecar().binding;
			if (tab === undefined || binding === null) return;
			if (!tab.titleManual) {
				tab.title = fallbackTitleFrom(firstUserMessage);
				tab.titleStatus = 'pending';
			}
			void binding.generateTitle(firstUserMessage).then((result) => {
				const current = this._tab(tabId);
				if (current === undefined) return;
				if (current.titleManual) return; // manual wins (EC-TS-10)
				if (result.ok) {
					current.title = result.value;
					current.titleStatus = 'success';
				} else {
					current.titleStatus = 'failed'; // keep the fallback (EC-TS-11)
				}
				void this._persistTab(tabId);
			});
		},

		/** Cancel every tab's in-flight turn and reset to one fresh empty tab (EC-15). */
		$reset(): void {
			const s = this._sidecar();
			for (const [, deps] of s.deps) deps.runner.cancel();
			s.deps.clear();
			this.$patch((state) => {
				Object.assign(state, initialState());
			});
			this._spawnTab();
		},
	},
});
