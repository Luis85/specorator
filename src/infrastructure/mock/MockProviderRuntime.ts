/**
 * Scriptable Mock provider runtime + runtime registry (P9, SPEC-PV-011). Drives the
 * SPEC-PV-025 honest-gate construct matrix + the SPEC-PV-026 transport-state matrix
 * (stream / timeout / error-chunk) for unit tests + `npm run dev` — no subprocess,
 * no `node:*`, no `obsidian`. Total: never throws across a port boundary; a failed
 * construct is `Result.err`, an in-flight transport failure is a terminal
 * `{type:'error'}` `StreamChunk` (the P1 streaming-error convention, ADR-CC-001 §1).
 *
 * The runtime exposes the provider's frozen `getCapabilities()` /
 * `getToolbarCapabilities()` (derived from the descriptor's capability bag) so the
 * capability-gated view-model runs without a real process (REQ-PV-013/024).
 */
import type {
	ChatRuntimePort,
	ProviderId,
	StreamChunk,
	ChatMessage,
	ChatTurnRequest,
	PreparedChatTurn,
	ChatRuntimeQueryOptions,
	ChatRuntimeEnsureReadyOptions,
	Unsubscriber,
	RuntimeCapabilities,
	ToolbarCapabilities,
	ProviderCapabilities,
} from '@/domain/ports';
import type {
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalRequest,
	ApprovalDecision,
} from '@/domain/chat/inline';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { PROVIDER_DESCRIPTORS, DEFAULT_CHAT_PROVIDER_ID } from '@/domain/chat/providers';
import { MockChatRuntime } from './MockChatRuntime';

/** The SPEC-PV-025 construct-gate mode a provider's `createChatRuntime` resolves. */
export type MockProviderConstructMode = 'ok' | 'no-key' | 'no-cli' | 'unavailable';

/** The SPEC-PV-026 transport-state mode a provider's `query` stream realises. */
export type MockProviderTransportMode = 'stream' | 'timeout' | 'error-chunk';

/** The honest reason an `err` construct carries (no key/value substring). */
const CONSTRUCT_REASON: Record<Exclude<MockProviderConstructMode, 'ok'>, string> = {
	'no-key': 'keyRequired',
	'no-cli': 'cliNotFound',
	unavailable: 'unavailable',
};

const CAPABILITIES_BY_ID: ReadonlyMap<ProviderId, ProviderCapabilities> = new Map(
	PROVIDER_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor.capabilities]),
);

function capabilitiesFor(providerId: ProviderId): ProviderCapabilities {
	return CAPABILITIES_BY_ID.get(providerId) ?? PROVIDER_DESCRIPTORS[0].capabilities;
}

/**
 * A scriptable in-memory `ChatRuntimePort` for a single provider (SPEC-PV-011). The
 * frozen capability bag drives the `RuntimeCapabilities`/`ToolbarCapabilities`
 * getters (BACKED true, GATED-OFF false per SPEC-PV-022) so the capability-gated
 * view-model exercises the per-provider affordances without a real process.
 */
export class MockProviderRuntime implements ChatRuntimePort {
	readonly providerId: ProviderId;

	private readonly capabilities: ProviderCapabilities;
	private script: StreamChunk[] = [];
	private transportMode: MockProviderTransportMode = 'stream';
	private sessionId: string | null;
	private cancelled = false;

	constructor(providerId: ProviderId) {
		this.providerId = providerId;
		this.capabilities = capabilitiesFor(providerId);
		this.sessionId = `mock-${providerId}-session`;
	}

	/** Test hook: queue the canned `StreamChunk`s the next `query` yields. */
	scriptStream(chunks: readonly StreamChunk[]): void {
		this.script = chunks.filter((chunk) => chunk.type !== 'done');
	}

	/** Test hook: drive the SPEC-PV-026 transport state the next `query` realises. */
	setTransportMode(mode: MockProviderTransportMode): void {
		this.transportMode = mode;
	}

	prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
		return {
			request,
			persistedContent: request.text,
			prompt: request.text,
			isCompact: false,
			mcpMentions: new Set<string>(),
		};
	}

	ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
		return Promise.resolve(true);
	}

	async *query(
		_turn: PreparedChatTurn,
		_conversationHistory?: ChatMessage[],
		_queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk> {
		this.cancelled = false;
		// 'timeout' is observed by the transport (request/response) path, NOT the
		// turn stream — a turn never starts when the request times out. The Mock
		// models it as an immediate terminal error so the stream stays total.
		if (this.transportMode === 'timeout') {
			await Promise.resolve();
			if (this.isCancelled()) return;
			yield { type: 'error', content: 'timeout' };
			yield { type: 'done' };
			return;
		}
		for (const chunk of this.script) {
			await Promise.resolve();
			if (this.isCancelled()) return;
			yield chunk;
		}
		await Promise.resolve();
		if (this.isCancelled()) return;
		if (this.transportMode === 'error-chunk') {
			// A dying subprocess → a terminal error chunk carrying captured detail,
			// then a clean `done` (the host stays responsive, EC-PV-12).
			yield { type: 'error', content: 'transport closed unexpectedly' };
		}
		yield { type: 'done' };
	}

	cancel(): void {
		this.cancelled = true;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	resetSession(): void {
		this.sessionId = null;
	}

	onReadyStateChange(_listener: (ready: boolean) => void): Unsubscriber {
		return () => undefined;
	}

	isReady(): boolean {
		return true;
	}

	resumeSession(sessionId: string): void {
		this.sessionId = sessionId.length > 0 ? sessionId : this.sessionId;
	}

	setResumeCheckpoint(_assistantMessageId: string): void {
		// Recorded no-op (rewind is GATED-OFF for the non-Claude providers).
	}

	getCapabilities(): RuntimeCapabilities {
		return {
			supportsFork: this.capabilities.supportsFork,
			supportsRewind: this.capabilities.supportsRewind,
			supportsPlanMode: this.capabilities.supportsPlanMode,
			// The inline-response affordance rides plan-mode for the Mock runtime.
			supportsInlineResponse: this.capabilities.supportsPlanMode,
		};
	}

	getToolbarCapabilities(): ToolbarCapabilities {
		return {
			supportsMcpTools: this.capabilities.supportsMcpTools,
			reasoningControl: this.capabilities.reasoningControl,
			// The service-tier toggle rides the per-provider turn-steer/Codex config.
			hasServiceTier: this.capabilities.supportsTurnSteer,
			hasModeToggle: this.capabilities.supportsPlanMode,
			permissionMode: 'normal',
		};
	}

	setAskUserQuestionCallback(
		_cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>,
	): void {
		// no-op: the Mock runtime gates inline response off for non-capable providers.
	}

	setExitPlanModeCallback(
		_cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>,
	): void {
		// no-op
	}

	setApprovalCallback(_cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>): void {
		// no-op
	}

	/** Opaque read of the cancel flag so the streaming loop checks live state. */
	private isCancelled(): boolean {
		return this.cancelled;
	}
}

/**
 * The scriptable Mock runtime registry the bridge exposes through the widened
 * `createChatRuntime(providerId): Result<ChatRuntimePort>` factory (SPEC-PV-011).
 * `setProviderConstructMode` drives the SPEC-PV-025 honest-gate matrix; the
 * constructed runtime is scriptable per provider via `scriptProviderStream` +
 * `setTransportMode`. Total — never throws.
 */
export class MockProviderRuntimeRegistry {
	private readonly constructMode = new Map<ProviderId, MockProviderConstructMode>();
	private readonly transportMode = new Map<ProviderId, MockProviderTransportMode>();
	private readonly scripts = new Map<ProviderId, readonly StreamChunk[]>();

	/** Test hook: drive the construct path for `providerId` (SPEC-PV-025). */
	setProviderConstructMode(providerId: ProviderId, mode: MockProviderConstructMode): void {
		this.constructMode.set(providerId, mode);
	}

	/** Test hook: queue the canned stream the next constructed runtime for `providerId` yields. */
	scriptProviderStream(providerId: ProviderId, chunks: readonly StreamChunk[]): void {
		this.scripts.set(providerId, chunks);
	}

	/** Test hook: drive the SPEC-PV-026 transport state for `providerId`. */
	setTransportMode(providerId: ProviderId, mode: MockProviderTransportMode): void {
		this.transportMode.set(providerId, mode);
	}

	/**
	 * The data-driven per-provider builder table (the registry-construction choice,
	 * mirroring `ObsidianProviderRuntimeRegistry`). Construction dispatches through a map
	 * lookup, never a behavioural `providerId` branch (NFR-PV-014). The **claude** entry
	 * REUSES the P1 `MockChatRuntime` (the `supportsMcpTools:false` Claude-shaped demo
	 * runtime the standalone entry used before P9 — byte-identical P8, SPEC-PV-031,
	 * NFR-PV-001), exactly as the Obsidian table reuses `ClaudeCliChatRuntime`; the
	 * non-Claude entries build the scriptable `MockProviderRuntime`.
	 */
	private readonly builders: ReadonlyMap<ProviderId, () => ChatRuntimePort> = new Map<
		ProviderId,
		() => ChatRuntimePort
	>([
		[DEFAULT_CHAT_PROVIDER_ID, () => this._buildClaudeReuse()],
		...PROVIDER_DESCRIPTORS.filter((d) => d.id !== DEFAULT_CHAT_PROVIDER_ID).map(
			(d): [ProviderId, () => ChatRuntimePort] => [d.id, () => this._buildScriptable(d.id)],
		),
	]);

	/**
	 * Construct the runtime for `providerId` (the widened factory body) via the builder
	 * table. A non-`ok` construct mode → `Result.err(<honest reason>)`; otherwise the
	 * built runtime → `Result.ok`. Total — never throws.
	 */
	createChatRuntime(providerId: ProviderId): Result<ChatRuntimePort> {
		const mode = this.constructMode.get(providerId) ?? 'ok';
		if (mode !== 'ok') {
			return err(new Error(CONSTRUCT_REASON[mode]));
		}
		const builder = this.builders.get(providerId);
		if (builder === undefined) return err(new Error('unavailable'));
		return ok(builder());
	}

	/** Build the Claude reuse runtime (the P1 demo runtime, byte-identical P8). */
	private _buildClaudeReuse(): ChatRuntimePort {
		const script = this.scripts.get(DEFAULT_CHAT_PROVIDER_ID);
		return script === undefined ? new MockChatRuntime() : new MockChatRuntime([...script]);
	}

	/** Build a scriptable non-Claude runtime wired with its queued stream + transport mode. */
	private _buildScriptable(providerId: ProviderId): ChatRuntimePort {
		const runtime = new MockProviderRuntime(providerId);
		const script = this.scripts.get(providerId);
		if (script !== undefined) runtime.scriptStream(script);
		const transport = this.transportMode.get(providerId);
		if (transport !== undefined) runtime.setTransportMode(transport);
		return runtime;
	}
}
