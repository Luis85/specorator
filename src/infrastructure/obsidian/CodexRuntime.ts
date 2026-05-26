/**
 * The Codex `ChatRuntimePort` (P9, SPEC-PV-009). Owns the Codex app-server
 * JSON-RPC-over-stdio transport ({@link CodexRpcTransport}, SPEC-PV-010). Reads the
 * provider key via `SecretStorePort.getSecret(providerSecretKey('codex'))` into the
 * subprocess env **at the turn boundary** (REQ-PV-071/101) — the key never crosses
 * into the UI/store/DTO/notice/log (NFR-PV-002). JSONL history reads go through the
 * `HomeFsPort` (SPEC-PV-034). Exposes the frozen `CODEX_DESCRIPTOR` capability bag —
 * the BACKED caps wired, the GATED-OFF reported `false` (REQ-PV-034/043).
 *
 * Error convention (ADR-CC-001 §1): `query` streams; a dying transport → a terminal
 * `{type:'error'}` `StreamChunk`, not a throw. Construction is the honest gate: a
 * missing key (secret-store unavailable) / a missing CLI → the registry returns
 * `Result.err` before this runtime is handed out (SPEC-PV-025).
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is
 * the MANUAL leg TEST-PV-M1. No `obsidian` symbol leaks past this file.
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
	LoggerPort,
	SecretStorePort,
	SettingsPort,
	HomeFsPort,
} from '@/domain/ports';
import { providerSecretKey } from '@/domain/ports';
import { buildScopeEnv } from './buildScopeEnv';
import type {
	AskUserQuestionRequest,
	AskUserQuestionAnswer,
	ExitPlanModeRequest,
	ExitPlanModeDecision,
	ApprovalRequest,
	ApprovalDecision,
} from '@/domain/chat/inline';
import { CODEX_DESCRIPTOR } from '@/domain/chat/providers';
import { CodexRpcTransport } from './CodexRpcTransport';

export interface CodexRuntimeDeps {
	readonly secretStore: SecretStorePort;
	readonly homeFs: HomeFsPort;
	readonly cwd?: string | null;
	readonly command?: string;
	readonly logger?: LoggerPort;
	/**
	 * The device-local `SettingsPort` (P10, SPEC-SS-013). When present, the applied
	 * `envScopes['shared']` + `envScopes['provider:codex']` are resolved + merged into
	 * the subprocess env at the turn boundary (REQ-SS-065). Optional — absent leaves
	 * the P9 env untouched (byte-identical P9, NFR-SS-001).
	 */
	readonly settings?: SettingsPort;
}

const DEFAULT_CODEX_COMMAND = 'codex';

export class CodexRuntime implements ChatRuntimePort {
	readonly providerId: ProviderId = 'codex';

	private readonly capabilities = CODEX_DESCRIPTOR.capabilities;
	private transport: CodexRpcTransport | null = null;
	private sessionId: string | null = null;
	private ready = false;
	private readonly readyListeners = new Set<(ready: boolean) => void>();

	constructor(private readonly deps: CodexRuntimeDeps) {}

	prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
		return {
			request,
			persistedContent: request.text,
			prompt: request.text,
			isCompact: false,
			mcpMentions: new Set<string>(),
		};
	}

	async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
		// A key-needing provider is ready only when the secret store can hand a key.
		const stored = await this.deps.secretStore.getSecret(providerSecretKey('codex'));
		const resolved = stored.ok && stored.value !== null && stored.value !== '';
		this._setReady(resolved);
		return resolved;
	}

	async *query(
		turn: PreparedChatTurn,
		_conversationHistory?: ChatMessage[],
		_queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk> {
		const key = await this.deps.secretStore.getSecret(providerSecretKey('codex'));
		if (!key.ok || key.value === null || key.value === '') {
			yield { type: 'error', content: 'keyRequired' };
			yield { type: 'done' };
			return;
		}
		// P10 (SPEC-SS-013, REQ-SS-065): merge the applied env scopes (inline values +
		// secretRefs resolved via getSecret) over the provider key — the key + the
		// env-scope secret values are read ONLY here at the spawn boundary, never logged
		// or returned to the UI/DTO (NFR-SS-002). Absent settings → the bare key env.
		const baseEnv = { CODEX_API_KEY: key.value };
		const env =
			this.deps.settings !== undefined
				? await buildScopeEnv(baseEnv, 'codex', this.deps.settings, this.deps.secretStore)
				: baseEnv;
		const transport = new CodexRpcTransport(
			{
				command: this.deps.command ?? DEFAULT_CODEX_COMMAND,
				args: ['app-server'],
				cwd: this.deps.cwd,
				env,
			},
			this.deps.logger,
		);
		const started = transport.start();
		if (!started.ok) {
			yield { type: 'error', content: started.error.message };
			yield { type: 'done' };
			return;
		}
		this.transport = transport;
		yield* transport.query(turn.prompt);
	}

	cancel(): void {
		this.transport?.shutdown();
		this.transport = null;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	resetSession(): void {
		this.sessionId = null;
		this.transport?.shutdown();
		this.transport = null;
	}

	onReadyStateChange(listener: (ready: boolean) => void): Unsubscriber {
		this.readyListeners.add(listener);
		return () => {
			this.readyListeners.delete(listener);
		};
	}

	isReady(): boolean {
		return this.ready;
	}

	resumeSession(sessionId: string): void {
		this.sessionId = sessionId.length > 0 ? sessionId : null;
	}

	setResumeCheckpoint(_assistantMessageId: string): void {
		// Rewind is GATED-OFF for Codex (REQ-PV-022); the method stays on the port.
	}

	getCapabilities(): RuntimeCapabilities {
		return {
			supportsFork: this.capabilities.supportsFork,
			supportsRewind: this.capabilities.supportsRewind,
			supportsPlanMode: this.capabilities.supportsPlanMode,
			supportsInlineResponse: this.capabilities.supportsPlanMode,
		};
	}

	getToolbarCapabilities(): ToolbarCapabilities {
		return {
			supportsMcpTools: this.capabilities.supportsMcpTools,
			reasoningControl: this.capabilities.reasoningControl,
			// Codex ships the service-tier fast-mode toggle (the only BACKED tier provider).
			hasServiceTier: this.capabilities.supportsTurnSteer,
			hasModeToggle: this.capabilities.supportsPlanMode,
			permissionMode: 'normal',
		};
	}

	/** Inject a steer message into the in-progress turn (REQ-PV-033, BACKED). */
	steer(message: string): void {
		this.transport?.steer(message);
	}

	setAskUserQuestionCallback(
		_cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>,
	): void {
		// no-op: inline-block round-trip is not wired for Codex in P9.
	}

	setExitPlanModeCallback(
		_cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>,
	): void {
		// no-op
	}

	setApprovalCallback(_cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>): void {
		// no-op
	}

	private _setReady(next: boolean): void {
		if (this.ready === next) return;
		this.ready = next;
		for (const listener of this.readyListeners) listener(next);
	}
}
