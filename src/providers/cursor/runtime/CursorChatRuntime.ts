import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ProviderCapabilities, ProviderId } from '../../../core/providers/types';
import { buildUsageInfo } from '../../../core/providers/usage';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { RuntimeHost } from '../../../core/runtime/RuntimeHost';
import type {
  ChatRuntimeConversationState,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  PreparedChatTurn,
  SessionUpdateResult,
} from '../../../core/runtime/types';
import type { ChatMessage, Conversation, SlashCommand, StreamChunk } from '../../../core/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { asSettingsBag } from '../../../core/types/settings';
import { getVaultPath } from '../../../utils/path';
import type { AcpJsonRpcTransport, AcpSubprocess } from '../../acp';
import {
  AcpClientConnection,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
  type AcpSessionNotification,
  AcpSessionUpdateNormalizer,
  AcpStreamChunkQueue,
  buildAcpApprovalDecisionOptions,
  buildAcpUsageInfo,
  buildActiveTurnEffect,
  mapApprovalDecision,
  normalizeApprovalInput,
  selectPermissionOption,
} from '../../acp';
import { CURSOR_PROVIDER_CAPABILITIES } from '../capabilities';
import { encodeCursorTurn } from '../prompt/encodeCursorTurn';
import { getCursorEnabledModels } from '../settings';
import { getCursorState, resolveCursorSessionId } from '../types';
import { registerCursorAcpExtensions } from './cursorAcpExtensions';
import { buildCursorAcpLaunchSpec, startCursorAcpProcess } from './cursorAcpLaunch';
import { buildCursorAcpPromptBlocks } from './cursorAcpPrompt';
import { resolveCursorAcpMode } from './cursorAcpSession';
import { createCursorAcpToolStreamAdapter } from './cursorAcpToolNames';
import { buildCursorAgentEnvironment } from './cursorAgentEnv';
import { runWithCursorAgentSpawnLock } from './cursorAgentSpawnLock';
import { resolveCursorModelSelectionForCli } from './cursorCliModel';
import { cleanupStaleCursorMcpServer } from './cursorMcpCleanup';
import { getCachedCursorModelIds } from './cursorModelCatalog';
import { extractCursorUsage } from './cursorUsageMapping';

interface ActiveTurn {
  queue: AcpStreamChunkQueue;
  sessionId: string;
}

const CURSOR_ACP_INIT_TIMEOUT_MS = 20_000;
const CURSOR_OLD_CLI_MESSAGE =
  'Cursor CLI does not support ACP (`agent acp`). Update cursor-agent (`cursor-agent update` or reinstall from cursor.com/cli), then retry.';
const CURSOR_LOGIN_MESSAGE =
  'Cursor CLI is not authenticated. Run `cursor-agent login` in a terminal, then retry.';

export class CursorChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'cursor';

  private activeTurn: ActiveTurn | null = null;
  private autoApprovePermissions = false;
  private connection: AcpClientConnection | null = null;
  private currentModeId: string | null = null;
  private currentSessionModelId: string | null = null;
  private currentTurnIsPlan = false;
  private currentTurnSawAssistantContent = false;
  private lastStartupErrorMessage: string | null = null;
  private loadedSessionId: string | null = null;
  private process: AcpSubprocess | null = null;
  private ready = false;
  private readonly readyListeners = new Set<(ready: boolean) => void>();
  private sessionBootstrapNeeded = false;
  private sessionId: string | null = null;
  private sessionInvalidated = false;
  private readonly sessionUpdateNormalizer = new AcpSessionUpdateNormalizer();
  private staleMcpCleaned = false;
  private readonly toolStreamAdapter = createCursorAcpToolStreamAdapter();
  private transport: AcpJsonRpcTransport | null = null;
  private turnMetadata: ChatTurnMetadata = {};
  private unregisterExtensions: (() => void) | null = null;
  private unregisterTransportClose: (() => void) | null = null;

  constructor(
    private readonly plugin: PluginContext,
    private readonly host: RuntimeHost,
  ) {}

  getCapabilities(): Readonly<ProviderCapabilities> {
    return CURSOR_PROVIDER_CAPABILITIES;
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    return encodeCursorTurn(request);
  }

  consumeTurnMetadata(): ChatTurnMetadata {
    const metadata = { ...this.turnMetadata };
    this.turnMetadata = {};
    return metadata;
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(conversation: ChatRuntimeConversationState | null): void {
    const nextSessionId = conversation ? resolveCursorSessionId(conversation) : null;
    if (this.sessionId !== nextSessionId) {
      this.sessionInvalidated = false;
      this.sessionBootstrapNeeded = false;
      this.currentSessionModelId = null;
    }
    this.sessionId = nextSessionId;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const cli = this.plugin.getResolvedProviderCliPath('cursor');
    if (!cli) {
      this.setReady(false);
      return false;
    }

    if (this.process?.isAlive() && this.transport && !this.transport.isClosed && this.connection) {
      return true;
    }

    try {
      await this.startProcess(cli);
      return true;
    } catch (error) {
      this.setReady(false);
      this.plugin.logger.scope('cursor.acp').warn('startup failed', error);
      return false;
    }
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    this.turnMetadata = {};

    const cli = this.plugin.getResolvedProviderCliPath('cursor');
    if (!cli) {
      yield { type: 'error', content: 'Cursor Agent CLI not found. Configure it in Cursor settings.' };
      yield { type: 'done' };
      return;
    }

    yield { type: 'user_message_start', content: turn.persistedContent };
    yield { type: 'assistant_message_start' };

    if (!this.staleMcpCleaned) {
      this.staleMcpCleaned = true;
      await cleanupStaleCursorMcpServer();
    }

    let startupError: string | null = null;
    if (!(await this.ensureReady())) {
      startupError = this.lastStartupErrorMessage ?? CURSOR_OLD_CLI_MESSAGE;
    }
    if (startupError || !this.connection) {
      yield { type: 'error', content: startupError ?? 'Cursor ACP runtime is not ready.' };
      yield { type: 'done' };
      return;
    }

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    // Capture the session id BEFORE ensureSession, which may mint a fresh one.
    // A turn that starts without a session id (fork, provider switch, resume of a
    // conversation whose native session never loaded) still carries history that
    // has to be re-injected into the prompt, or the agent loses all prior context.
    const sessionIdAtTurnStart = this.sessionId;
    const sessionId = await this.ensureSession(cwd);
    if (!sessionId) {
      yield { type: 'error', content: this.lastStartupErrorMessage ?? 'Failed to open a Cursor session.' };
      yield { type: 'done' };
      return;
    }

    const shouldBootstrapHistory = (conversationHistory?.length ?? 0) > 0
      && (!sessionIdAtTurnStart || this.sessionInvalidated || this.sessionBootstrapNeeded);
    this.sessionBootstrapNeeded = false;

    const mode = resolveCursorAcpMode(this.plugin.settings.permissionMode);
    this.autoApprovePermissions = mode.autoApprove;
    this.currentTurnIsPlan = mode.modeId === 'plan';
    await this.applyMode(sessionId, mode.modeId);
    await this.applySelectedModel(sessionId, queryOptions);

    this.activeTurn?.queue.close();
    const activeTurn: ActiveTurn = { queue: new AcpStreamChunkQueue(), sessionId };
    this.activeTurn = activeTurn;
    this.currentTurnSawAssistantContent = false;
    this.sessionUpdateNormalizer.reset();
    this.toolStreamAdapter.reset();

    const history = shouldBootstrapHistory ? (conversationHistory ?? []) : [];

    const promptPromise = this.connection.prompt({
      prompt: buildCursorAcpPromptBlocks(turn, history, queryOptions?.boundAgentPrompt),
      sessionId,
    }).then((response) => {
      this.emitFinalUsage(activeTurn, response.usage ?? null, queryOptions);
      this.finalizePlanTurnMetadata();
      activeTurn.queue.push({ type: 'done' });
      activeTurn.queue.close();
    }).catch((error) => {
      activeTurn.queue.push({ type: 'error', content: this.formatRuntimeError(error) });
      activeTurn.queue.push({ type: 'done' });
      activeTurn.queue.close();
    }).finally(() => {
      if (this.activeTurn === activeTurn) {
        this.activeTurn = null;
      }
    });

    try {
      while (true) {
        const chunk = await activeTurn.queue.next();
        if (!chunk) {
          break;
        }
        yield chunk;
      }
      await promptPromise;
    } finally {
      if (this.activeTurn === activeTurn) {
        this.activeTurn = null;
      }
    }
  }

  cancel(): void {
    if (this.connection && this.sessionId) {
      this.connection.cancel({ sessionId: this.sessionId });
    }
    this.host.dismissApproval();
  }

  resetSession(): void {
    this.sessionId = null;
    this.loadedSessionId = null;
    this.sessionInvalidated = false;
    this.sessionBootstrapNeeded = false;
    this.currentModeId = null;
    this.currentSessionModelId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  consumeSessionInvalidation(): boolean {
    const invalidated = this.sessionInvalidated;
    this.sessionInvalidated = false;
    return invalidated;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [];
  }

  async cleanup(): Promise<void> {
    this.activeTurn?.queue.close();
    this.activeTurn = null;
    await this.shutdownProcess();
    this.readyListeners.clear();
  }

  // rewind() omitted — Cursor Agent does not support rewind
  // (supportsRewind: false). Callers gate on capability; ADR-0001 Phase 2.

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    if (params.sessionInvalidated && params.conversation && !this.sessionId) {
      return { updates: { sessionId: null, providerState: undefined } };
    }

    const sid = this.sessionId;
    const existing = params.conversation ? getCursorState(params.conversation.providerState) : {};
    const providerState: Record<string, unknown> = { ...existing };
    if (sid) {
      providerState.chatSessionId = sid;
    }

    return {
      updates: {
        sessionId: sid,
        providerState: Object.keys(providerState).length > 0 ? providerState : undefined,
      },
    };
  }

  resolveSessionIdForFork(_conversation: Conversation | null): string | null {
    return null;
  }

  private async startProcess(cliPath: string): Promise<void> {
    await this.shutdownProcess();
    this.lastStartupErrorMessage = null;

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const env = buildCursorAgentEnvironment(this.plugin, cliPath);
    const spec = buildCursorAcpLaunchSpec(cliPath, cwd, env);

    // The spawn lock guards ~/.cursor/cli-config.json contention (Windows
    // EPERM under concurrent spawns) — now once per session, not per turn.
    const { process: proc, transport } = await runWithCursorAgentSpawnLock(
      async () => startCursorAcpProcess(spec),
    );
    this.process = proc;
    this.transport = transport;
    this.unregisterTransportClose = transport.onClose(() => {
      if (this.transport === transport) {
        this.setReady(false);
        this.activeTurn?.queue.push({
          type: 'error',
          content: this.formatRuntimeError(new Error('Cursor ACP process exited unexpectedly.')),
        });
        this.activeTurn?.queue.push({ type: 'done' });
        this.activeTurn?.queue.close();
      }
    });

    this.connection = new AcpClientConnection({
      clientInfo: { name: 'specorator', version: this.plugin.manifest?.version ?? '0.0.0' },
      delegate: {
        onSessionNotification: (notification) => this.handleSessionNotification(notification),
        requestPermission: (request) => this.handlePermissionRequest(request),
      },
      transport,
    });
    this.unregisterExtensions = registerCursorAcpExtensions(transport, {
      askUser: this.host.askUser,
      emitChunk: (chunk) => {
        // cursor/create_plan delivers plan text through this side channel rather
        // than a session notification, so mark it as assistant content for the
        // plan-completed gate — otherwise a plan-only turn never sees content.
        if (this.currentTurnIsPlan && chunk.type === 'text') {
          this.currentTurnSawAssistantContent = true;
        }
        this.activeTurn?.queue.push(chunk);
      },
      patchTurnMetadata: (patch) => Object.assign(this.turnMetadata, patch),
    });

    transport.start();
    try {
      await withTimeout(
        this.connection.initialize(),
        CURSOR_ACP_INIT_TIMEOUT_MS,
        new Error('ACP initialize timed out'),
      );
    } catch (error) {
      this.lastStartupErrorMessage = this.describeStartupFailure(error);
      await this.shutdownProcess();
      throw error;
    }
    this.setReady(true);
  }

  private describeStartupFailure(_error: unknown): string {
    // Any failure before initialize resolves — immediate exit ("unknown
    // subcommand"), closed transport, or timeout — means the installed
    // cursor-agent predates ACP. One actionable message covers them all.
    const stderr = this.process?.getStderrSnapshot() ?? '';
    return stderr ? `${CURSOR_OLD_CLI_MESSAGE}\n\n${stderr}` : CURSOR_OLD_CLI_MESSAGE;
  }

  private async ensureSession(cwd: string): Promise<string | null> {
    if (!this.connection) {
      return null;
    }
    if (this.sessionId && this.loadedSessionId === this.sessionId) {
      return this.sessionId;
    }

    if (this.sessionId) {
      try {
        const response = await this.connection.loadSession({
          cwd,
          mcpServers: [],
          sessionId: this.sessionId,
        });
        this.loadedSessionId = response.sessionId;
        this.sessionId = response.sessionId;
        return response.sessionId;
      } catch (error) {
        // Load-bearing no-spike fallback: an id-mapping mismatch degrades to a
        // fresh session with history re-injected on the next prompt.
        this.plugin.logger.scope('cursor.acp').warn('session/load failed; falling back to new session', error);
        this.sessionInvalidated = true;
        this.sessionBootstrapNeeded = true;
        this.sessionId = null;
        this.loadedSessionId = null;
      }
    }

    return this.createSession(cwd);
  }

  private async createSession(cwd: string): Promise<string | null> {
    if (!this.connection) {
      return null;
    }
    try {
      const response = await this.connection.newSession({ cwd, mcpServers: [] });
      this.loadedSessionId = response.sessionId;
      this.sessionId = response.sessionId;
      // A fresh session starts on the agent's default model, so drop any tracked
      // selection to force applySelectedModel to reapply it for this turn.
      this.currentSessionModelId = null;
      return response.sessionId;
    } catch (error) {
      if (await this.tryAuthenticate()) {
        try {
          const response = await this.connection.newSession({ cwd, mcpServers: [] });
          this.loadedSessionId = response.sessionId;
          this.sessionId = response.sessionId;
          this.currentSessionModelId = null;
          return response.sessionId;
        } catch (retryError) {
          this.lastStartupErrorMessage = this.formatRuntimeError(retryError);
          return null;
        }
      }
      this.lastStartupErrorMessage = CURSOR_LOGIN_MESSAGE + '\n\n' + this.formatRuntimeError(error);
      return null;
    }
  }

  private async tryAuthenticate(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }
    try {
      await this.connection.authenticate({ methodId: 'cursor_login' });
      return true;
    } catch {
      return false;
    }
  }

  private async applyMode(sessionId: string, modeId: string): Promise<void> {
    if (!this.connection || this.currentModeId === modeId) {
      return;
    }
    try {
      await this.connection.setMode({ modeId, sessionId });
      this.currentModeId = modeId;
    } catch (error) {
      // Mode setting is best-effort: an agent that rejects setMode still runs
      // the turn in its default mode; approvals remain client-enforced.
      this.plugin.logger.scope('cursor.acp').warn('setMode failed', error);
    }
  }

  private async applySelectedModel(
    sessionId: string,
    queryOptions?: ChatRuntimeQueryOptions,
  ): Promise<void> {
    if (!this.connection) {
      return;
    }
    const model = this.resolveCursorModelForSession(queryOptions);
    if (!model || model === this.currentSessionModelId) {
      return;
    }
    try {
      await this.connection.setConfigOption({
        configId: 'model',
        sessionId,
        type: 'select',
        value: model,
      });
      this.currentSessionModelId = model;
    } catch (error) {
      // Best-effort: whether Cursor's ACP dialect implements
      // session/set_config_option is doc-unknown, so a rejection just leaves the
      // turn on the agent's default model rather than failing the turn.
      this.plugin.logger.scope('cursor.acp').warn('setConfigOption(model) failed', error);
    }
  }

  // Mirrors the pre-ACP CLI launch path (resolveCursorQueryLaunch): the picked
  // model family plus effort mode resolved against the enabled/catalog id sets.
  private resolveCursorModelForSession(queryOptions?: ChatRuntimeQueryOptions): string | undefined {
    const settingsBag = asSettingsBag(this.plugin.settings);
    const snapshot = ProviderSettingsCoordinator.getProviderSettingsSnapshot(settingsBag, 'cursor');
    const familyValue = queryOptions?.model
      ?? (typeof snapshot.model === 'string' && snapshot.model.trim() ? snapshot.model.trim() : undefined);
    const mode = typeof snapshot.effortLevel === 'string' ? snapshot.effortLevel : undefined;
    return resolveCursorModelSelectionForCli(familyValue, mode, {
      catalogIds: getCachedCursorModelIds(),
      enabledIds: getCursorEnabledModels(settingsBag),
    });
  }

  private finalizePlanTurnMetadata(): void {
    // A plan turn only "completed" once the agent actually produced plan
    // content; an empty plan turn must not open the post-plan approval card.
    if (this.currentTurnIsPlan && this.currentTurnSawAssistantContent) {
      this.turnMetadata.planCompleted = true;
    }
  }

  private async handleSessionNotification(notification: AcpSessionNotification): Promise<void> {
    if (!this.activeTurn || notification.sessionId !== this.activeTurn.sessionId) {
      return;
    }
    const normalized = this.sessionUpdateNormalizer.normalize(notification.update);
    if (
      normalized.type !== 'message_chunk'
      && normalized.type !== 'tool_call'
      && normalized.type !== 'tool_call_update'
      && normalized.type !== 'usage'
    ) {
      return;
    }

    const effect = buildActiveTurnEffect(normalized, {
      promptUsage: null,
      resolveUsageModel: () => this.resolveActiveModel() ?? 'cursor',
      sessionId: notification.sessionId,
      toolStreamAdapter: this.toolStreamAdapter,
    });
    if (effect.metadataPatch) {
      Object.assign(this.turnMetadata, effect.metadataPatch);
    }
    if (effect.sawAssistantContent) {
      this.currentTurnSawAssistantContent = true;
    }
    for (const chunk of effect.chunks) {
      // query() already yields a single synthetic user_message_start /
      // assistant_message_start pair per turn, so those are the sole message
      // boundaries. The shared normalizer ALSO emits these from the first
      // message chunk of each role; forwarding them here would double the
      // boundaries and split the transcript into duplicate message frames.
      if (chunk.type === 'user_message_start' || chunk.type === 'assistant_message_start') {
        continue;
      }
      this.activeTurn.queue.push(chunk);
    }
  }

  private async handlePermissionRequest(
    request: AcpRequestPermissionRequest,
  ): Promise<AcpRequestPermissionResponse> {
    if (this.autoApprovePermissions) {
      const auto = selectPermissionOption(request.options, ['allow_always', 'allow_once']);
      if (auto.outcome.outcome === 'selected') {
        return auto;
      }
    }

    const input = normalizeApprovalInput(request.toolCall.rawInput);
    const decision = await this.host.approval(
      request.toolCall.title ?? 'tool',
      input,
      request.toolCall.title ?? '',
      { decisionOptions: buildAcpApprovalDecisionOptions(request.options) },
    );
    return mapApprovalDecision(decision, request.options);
  }

  private emitFinalUsage(
    activeTurn: ActiveTurn,
    promptUsage: Parameters<typeof buildAcpUsageInfo>[0]['promptUsage'],
    queryOptions?: ChatRuntimeQueryOptions,
  ): void {
    const model = this.resolveActiveModel(queryOptions);
    if (!model) {
      return; // usage contract: never emit without a model
    }

    const acpUsage = buildAcpUsageInfo({ contextWindow: null, model, promptUsage });
    if (acpUsage) {
      activeTurn.queue.push({ sessionId: activeTurn.sessionId, type: 'usage', usage: acpUsage });
      return;
    }

    // No ACP usage payload: fall back to the model-window catalog (same
    // zero-token window shape the stream-json path emitted without usage data).
    // Routed through buildUsageInfo so the emitted shape stays contract-clean
    // (floors, clamps, computed percentage) rather than a hand-built object.
    const fallback = extractCursorUsage({}, model);
    activeTurn.queue.push({
      sessionId: activeTurn.sessionId,
      type: 'usage',
      usage: buildUsageInfo({
        model,
        inputTokens: fallback.inputTokens,
        ...(fallback.outputTokens !== undefined ? { outputTokens: fallback.outputTokens } : {}),
        ...(fallback.cacheReadInputTokens !== undefined
          ? { cacheReadInputTokens: fallback.cacheReadInputTokens }
          : {}),
        contextTokens: fallback.contextTokens,
        contextWindow: fallback.contextWindow,
        contextWindowIsAuthoritative: fallback.contextWindowIsAuthoritative,
      }),
    });
  }

  private resolveActiveModel(queryOptions?: ChatRuntimeQueryOptions): string | null {
    if (typeof queryOptions?.model === 'string' && queryOptions.model.trim()) {
      return queryOptions.model.trim();
    }
    const snapshot = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
      asSettingsBag(this.plugin.settings),
      'cursor',
    );
    return typeof snapshot.model === 'string' && snapshot.model.trim() ? snapshot.model.trim() : null;
  }

  private formatRuntimeError(error: unknown): string {
    const baseMessage = error instanceof Error ? error.message : 'Cursor ACP request failed';
    const stderr = this.process?.getStderrSnapshot();
    return stderr ? `${baseMessage}\n\n${stderr}` : baseMessage;
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) {
      return;
    }
    this.ready = ready;
    for (const listener of this.readyListeners) {
      listener(ready);
    }
  }

  private async shutdownProcess(): Promise<void> {
    this.setReady(false);
    this.unregisterExtensions?.();
    this.unregisterExtensions = null;
    this.unregisterTransportClose?.();
    this.unregisterTransportClose = null;
    this.connection?.dispose();
    this.connection = null;
    this.transport?.dispose();
    this.transport = null;
    if (this.process) {
      await this.process.shutdown().catch(() => {}); // best-effort
      this.process = null;
    }
    this.loadedSessionId = null;
    this.currentModeId = null;
    this.currentSessionModelId = null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(timeoutError), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}
