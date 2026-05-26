/**
 * The Opencode `ChatRuntimePort` (P9, SPEC-PV-009). Owns the shared ACP transport
 * ({@link AcpTransport}, SPEC-PV-010). Reads the provider key via
 * `SecretStorePort.getSecret(providerSecretKey('opencode'))` into the subprocess env
 * **at the turn boundary** (REQ-PV-071/101) — the key never crosses into the
 * UI/store/DTO/notice/log (NFR-PV-002). ACP `loadSession` history reads go through
 * the `HomeFsPort` (SPEC-PV-034). Exposes the frozen `OPENCODE_DESCRIPTOR` capability
 * bag — the BACKED caps wired, the GATED-OFF (rewind/fork/steer/MCP) reported `false`
 * (REQ-PV-043).
 *
 * Error convention (ADR-CC-001 §1): `query` streams; a dying transport → a terminal
 * `{type:'error'}` `StreamChunk`, not a throw. A missing key / CLI is the honest
 * construct gate (the registry returns `Result.err` before this runtime is handed
 * out, SPEC-PV-025).
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is
 * the MANUAL leg TEST-PV-M2. No `obsidian` symbol leaks past this file.
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
import { OPENCODE_DESCRIPTOR } from '@/domain/chat/providers';
import { AcpTransport } from './AcpTransport';

export interface OpencodeRuntimeDeps {
	readonly secretStore: SecretStorePort;
	readonly homeFs: HomeFsPort;
	readonly cwd?: string | null;
	readonly command?: string;
	readonly logger?: LoggerPort;
	/**
	 * The device-local `SettingsPort` (P10, SPEC-SS-013). When present, the applied
	 * `envScopes['shared']` + `envScopes['provider:opencode']` are resolved + merged
	 * into the subprocess env at the turn boundary (REQ-SS-065). Optional — absent
	 * leaves the P9 env untouched (byte-identical P9, NFR-SS-001).
	 */
	readonly settings?: SettingsPort;
}

const DEFAULT_OPENCODE_COMMAND = 'opencode';

export class OpencodeRuntime implements ChatRuntimePort {
	readonly providerId: ProviderId = 'opencode';

	private readonly capabilities = OPENCODE_DESCRIPTOR.capabilities;
	private transport: AcpTransport | null = null;
	private sessionId: string | null = null;
	private ready = false;
	private readonly readyListeners = new Set<(ready: boolean) => void>();

	constructor(private readonly deps: OpencodeRuntimeDeps) {}

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
		const stored = await this.deps.secretStore.getSecret(providerSecretKey('opencode'));
		const resolved = stored.ok && stored.value !== null && stored.value !== '';
		this._setReady(resolved);
		return resolved;
	}

	async *query(
		turn: PreparedChatTurn,
		_conversationHistory?: ChatMessage[],
		_queryOptions?: ChatRuntimeQueryOptions,
	): AsyncGenerator<StreamChunk> {
		const key = await this.deps.secretStore.getSecret(providerSecretKey('opencode'));
		if (!key.ok || key.value === null || key.value === '') {
			yield { type: 'error', content: 'keyRequired' };
			yield { type: 'done' };
			return;
		}
		// P10 (SPEC-SS-013, REQ-SS-065): merge the applied env scopes (inline values +
		// secretRefs resolved via getSecret) over the provider key — read ONLY here at
		// the spawn boundary, never logged or returned to the UI/DTO (NFR-SS-002). Absent
		// settings → the bare key env.
		const baseEnv = { OPENCODE_API_KEY: key.value };
		const env =
			this.deps.settings !== undefined
				? await buildScopeEnv(baseEnv, 'opencode', this.deps.settings, this.deps.secretStore)
				: baseEnv;
		const transport = new AcpTransport(
			{
				command: this.deps.command ?? DEFAULT_OPENCODE_COMMAND,
				args: ['acp'],
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
		yield* transport.prompt(turn.prompt);
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
		// Rewind is GATED-OFF for Opencode (REQ-PV-023); the method stays on the port.
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
			// No service-tier on Opencode (turn-steer is GATED-OFF, REQ-PV-043).
			hasServiceTier: this.capabilities.supportsTurnSteer,
			hasModeToggle: this.capabilities.supportsPlanMode,
			permissionMode: 'normal',
		};
	}

	setAskUserQuestionCallback(
		_cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>,
	): void {
		// no-op
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
