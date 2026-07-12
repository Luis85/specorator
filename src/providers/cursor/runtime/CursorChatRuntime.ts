import * as path from 'node:path';

import { SPECORATOR_STORAGE_PATH } from '../../../core/bootstrap/StoragePaths';
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
  type AcpLoadSessionResponse,
  type AcpNewSessionResponse,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
  type AcpSessionNotification,
  AcpSessionUpdateNormalizer,
  AcpStreamChunkQueue,
  type AcpUsageUpdate,
  type ActiveTurnEffect,
  buildAcpApprovalDecisionOptions,
  buildAcpUsageInfo,
  buildActiveTurnEffect,
  extractAcpSessionModelState,
  mapApprovalDecision,
  normalizeApprovalInput,
  selectPermissionOption,
} from '../../acp';
import { CURSOR_PROVIDER_CAPABILITIES } from '../capabilities';
import { CursorAcpCaptureWriter } from '../diagnostics/CursorAcpCaptureWriter';
import { encodeCursorTurn } from '../prompt/encodeCursorTurn';
import { getCursorEnabledModels, getCursorProviderSettings } from '../settings';
import { getCursorState, resolveCursorSessionId } from '../types';
import { registerCursorAcpExtensions } from './cursorAcpExtensions';
import { buildCursorAcpLaunchSpec, startCursorAcpProcess } from './cursorAcpLaunch';
import { buildCursorAcpPromptBlocks } from './cursorAcpPrompt';
import { resolveCursorAcpMode } from './cursorAcpSession';
import { createCursorAcpToolStreamAdapter } from './cursorAcpToolNames';
import { matchAdvertisedModelValue } from './cursorAdvertisedModels';
import { buildCursorAgentEnvironment } from './cursorAgentEnv';
import { runWithCursorAgentSpawnLock } from './cursorAgentSpawnLock';
import { resolveCursorModelSelectionForCli } from './cursorCliModel';
import { cleanupStaleCursorMcpServer } from './cursorMcpCleanup';
import { getCachedCursorModelIds } from './cursorModelCatalog';
import { MAX_CURSOR_TOOL_RESULT_CHARS } from './cursorToolNormalization';
import { extractCursorUsage } from './cursorUsageMapping';

interface ActiveTurn {
  queue: AcpStreamChunkQueue;
  sessionId: string;
  // Resolved once at turn start: the model cannot change mid-turn, and usage
  // updates arrive on the streaming hot path where re-resolving would clone the
  // settings snapshot per frame. Null suppresses usage chunks (usage contract:
  // never emit without a model).
  usageModel: string | null;
  // Set by the prompt RPC's settle chain, NOT generator teardown. The cancel
  // escalation reads this instead of this.activeTurn, which a consumer bail-out
  // nulls while the prompt (and agent) is still live.
  promptSettled: boolean;
}

const CURSOR_ACP_INIT_TIMEOUT_MS = 20_000;
// session/cancel is cooperative and the prompt RPC has no timeout; if the agent
// ignores it, the turn is terminated locally after this grace period.
const CURSOR_CANCEL_ESCALATION_MS = 5_000;
const CURSOR_OLD_CLI_MESSAGE =
  'Cursor CLI does not support ACP (`agent acp`). Update cursor-agent (`cursor-agent update` or reinstall from cursor.com/cli), then retry.';
const CURSOR_LOGIN_MESSAGE =
  'Cursor CLI is not authenticated. Run `cursor-agent login` in a terminal, then retry.';

export class CursorChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'cursor';

  private activeTurn: ActiveTurn | null = null;
  // Wire ids from the session's advertised model `configOptions`/`models`. Cursor
  // ACP rejects a bare CLI id (`gpt-5.4-medium`) that is not one of these exact
  // values — it can report the model as selected yet fail the next prompt with
  // "AI Model Not Found". applySelectedModel only sends an advertised value.
  private advertisedModelValues: string[] | null = null;
  // Aborts a pending blocking cursor/ask_question await so cancel()/cleanup can
  // answer the still-open RPC instead of leaving the agent stuck on it.
  private askQuestionAbortController: AbortController | null = null;
  private autoApprovePermissions = false;
  // Diagnostics-only, default-off sink for ACP wire frames/stderr/lifecycle
  // events (see docs/superpowers/specs/2026-07-11-cursor-acp-capture-design.md).
  // Built fresh per spawn in startProcess when the setting is on; flushed and
  // dropped in shutdownProcess so a toggle change takes effect on next spawn.
  private captureWriter: CursorAcpCaptureWriter | null = null;
  private connection: AcpClientConnection | null = null;
  private contextUsage: AcpUsageUpdate | null = null;
  private currentModeId: string | null = null;
  private currentSessionModelId: string | null = null;
  private currentTurnIsPlan = false;
  private currentTurnSawAssistantContent = false;
  // Set once cursor/create_plan has blocked on the user's decision in-turn
  // (host.exitPlanMode); suppresses the post-turn planCompleted card so the plan
  // isn't prompted a second time.
  private currentTurnPlanDecidedInline = false;
  private lastStartupErrorMessage: string | null = null;
  private loadedSessionId: string | null = null;
  private process: AcpSubprocess | null = null;
  private ready = false;
  private readonly readyListeners = new Set<(ready: boolean) => void>();
  private sessionId: string | null = null;
  private sessionInvalidated = false;
  private readonly sessionUpdateNormalizer = new AcpSessionUpdateNormalizer({
    maxToolOutputChars: MAX_CURSOR_TOOL_RESULT_CHARS,
  });
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
      this.currentSessionModelId = null;
      this.advertisedModelValues = null;
      // The next session has no mode/model applied yet; clearing the caches
      // forces applyMode/applySelectedModel to re-issue set_mode/set_config for
      // it. Without the mode reset, a plan-mode UI can early-return against a
      // stale cache and silently run the new session on the agent's default.
      this.currentModeId = null;
    }
    this.sessionId = nextSessionId;
  }

  async reloadMcpServers(): Promise<void> {}

  async ensureReady(options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const cli = this.plugin.getResolvedProviderCliPath('cursor');
    if (!cli) {
      this.setReady(false);
      return false;
    }

    // A forced ensureReady (env/CLI resync) must restart even when the process
    // is alive; startProcess shuts the old one down before the fresh spawn.
    const alive = Boolean(
      this.process?.isAlive() && this.transport && !this.transport.isClosed && this.connection,
    );
    if (alive && options?.force !== true) {
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
    // Fresh per-turn abort scope for the blocking ask_question / create_plan RPCs
    // and for the startup-cancel check below; aborting a controller left over from
    // a prior turn is a no-op for this turn's await.
    this.askQuestionAbortController?.abort();
    this.askQuestionAbortController = new AbortController();
    const turnSignal = this.askQuestionAbortController.signal;

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
      && (!sessionIdAtTurnStart || this.sessionInvalidated);

    const mode = resolveCursorAcpMode(this.plugin.settings.permissionMode);
    this.autoApprovePermissions = mode.autoApprove;
    // Independent RPCs on the same session — issued concurrently so the turn
    // doesn't pay two sequential round-trips before the prompt is sent.
    await Promise.all([
      this.applyMode(sessionId, mode.modeId),
      this.applySelectedModel(sessionId, queryOptions),
    ]);
    // Arm the plan flag only once plan mode is actually in effect. applyMode
    // records currentModeId on a successful set_mode (or leaves it 'plan' when
    // plan was already applied earlier in the session) and swallows rejections —
    // so a requested plan turn whose set_mode failed runs as non-plan and its
    // ordinary assistant text won't spuriously open the post-plan approval card.
    // The cursor/create_plan side-channel still sets planCompleted if the agent
    // genuinely plans.
    this.currentTurnIsPlan = mode.modeId === 'plan' && this.currentModeId === 'plan';

    // Stop pressed during startup (ensureReady / ensureSession / mode+model
    // setup) aborts the per-turn signal but has no activeTurn for cancel() to
    // interrupt; bail before creating the turn so session/prompt never fires.
    if (turnSignal.aborted) {
      yield { type: 'done' };
      return;
    }

    this.activeTurn?.queue.close();
    const activeTurn: ActiveTurn = {
      queue: new AcpStreamChunkQueue(),
      sessionId,
      usageModel: this.resolveActiveModel(queryOptions),
      promptSettled: false,
    };
    this.activeTurn = activeTurn;
    this.currentTurnSawAssistantContent = false;
    this.currentTurnPlanDecidedInline = false;
    this.contextUsage = null;
    this.sessionUpdateNormalizer.reset();
    this.toolStreamAdapter.reset();

    const history = shouldBootstrapHistory ? (conversationHistory ?? []) : [];

    const promptPromise = this.connection.prompt({
      prompt: buildCursorAcpPromptBlocks(turn, history, queryOptions?.boundAgentPrompt),
      sessionId,
    }).then((response) => {
      this.emitFinalUsage(activeTurn, response.usage ?? null);
      this.finalizePlanTurnMetadata();
      this.pushTurnTermination(activeTurn, [{ type: 'done' }]);
    }).catch((error) => {
      this.pushTurnTermination(activeTurn, [{ type: 'error', content: this.formatRuntimeError(error) }, { type: 'done' }]);
    }).finally(() => {
      // Prompt settled: the one signal that stands the escalation timer down.
      // Set before nulling activeTurn so the timer can't see a nulled activeTurn
      // paired with an unsettled prompt.
      activeTurn.promptSettled = true;
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
    const turn = this.activeTurn;
    if (this.connection && this.sessionId) {
      this.connection.cancel({ sessionId: this.sessionId });
      this.captureEvent('cancel', { sessionId: this.sessionId });
      if (turn) {
        this.armCancelEscalation(turn);
      }
    }
    // Abort the blocking ask/approval await and leave it aborted through turn end
    // (query() mints the fresh controller). Recreating it here would hand a late
    // request_permission/ask_question a live signal, reopening cancelled UI.
    this.askQuestionAbortController?.abort();
    this.host.dismissApproval();
  }

  // session/cancel is only a request: a hung agent never settles the prompt, and
  // without escalation the drain loop awaits the queue forever. Liveness keys off
  // turn.promptSettled, NOT this.activeTurn — a consumer breaking out of query()
  // on cancel nulls activeTurn while the prompt is still live, and checking it
  // here would silently no-op the escalation on a wedged agent. If unsettled
  // after the grace period, terminate locally (terminal push no-ops on a closed
  // queue) and recycle the process — the next send respawns.
  private armCancelEscalation(turn: ActiveTurn): void {
    window.setTimeout(() => {
      if (turn.promptSettled) {
        return;
      }
      this.captureEvent('cancel_escalation');
      this.pushTurnTermination(turn, [
        { type: 'error', content: 'Cursor agent did not stop after cancel; restarting the agent process.' },
        { type: 'done' },
      ]);
      void this.shutdownProcess();
    }, CURSOR_CANCEL_ESCALATION_MS);
  }

  resetSession(): void {
    this.sessionId = null;
    this.loadedSessionId = null;
    this.sessionInvalidated = false;
    this.currentModeId = null;
    this.currentSessionModelId = null;
    this.advertisedModelValues = null;
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
    // Resolve any pending blocking ask_question before tearing down the process.
    this.askQuestionAbortController?.abort();
    this.askQuestionAbortController = null;
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

    this.captureWriter = this.buildCaptureWriter(cliPath);
    const captureWriter = this.captureWriter;

    // The spawn lock guards ~/.cursor/cli-config.json contention (Windows
    // EPERM under concurrent spawns) — now once per session, not per turn.
    const { process: proc, transport } = await runWithCursorAgentSpawnLock(
      async () => startCursorAcpProcess(spec, captureWriter ? {
        onStderrData: (chunk) => captureWriter.stderr(chunk),
        onWireFrame: (direction, rawLine) => captureWriter.wireFrame(direction, rawLine),
      } : undefined),
    );
    this.process = proc;
    this.transport = transport;
    this.unregisterTransportClose = transport.onClose(() => this.handleTransportClosed(transport));
    // envKeys only — env VALUES must never reach the capture sink.
    this.captureEvent('spawn', { cliPath, args: spec.args, envKeys: Object.keys(spec.env) });

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
      exitPlanMode: this.host.exitPlanMode,
      getAskSignal: () => this.askQuestionAbortController?.signal,
      emitChunk: (chunk, sessionId) => {
        // A blocking extension request (create_plan / update_todos) can resolve
        // just as the turn rolls over; drop its chunk when it names a session
        // that is no longer the active turn's, or it would misroute into the
        // next turn's queue. An absent id keeps the prior unconditional path.
        if (sessionId !== undefined && sessionId !== this.activeTurn?.sessionId) {
          return;
        }
        this.activeTurn?.queue.push(chunk);
      },
      markPlanDecidedInline: (sessionId) => {
        // Same guard as emitChunk: a stale create_plan that resolves against a
        // superseded turn names its old session, so ignore it — only the active
        // turn's in-turn plan decision may suppress its own post-turn card.
        if (sessionId !== undefined && sessionId !== this.activeTurn?.sessionId) {
          return;
        }
        this.currentTurnPlanDecidedInline = true;
      },
      // approve-new-session abandons this turn for a fresh session; the host only
      // sets cancelRequested (unwinds the consumer loop, never reaches the agent),
      // so fire session/cancel here or the agent keeps implementing the plan.
      requestTurnCancel: () => this.cancel(),
    });

    transport.start();
    try {
      const initResult = await withTimeout(
        this.connection.initialize(),
        CURSOR_ACP_INIT_TIMEOUT_MS,
        new Error('ACP initialize timed out'),
      );
      this.captureEvent('initialize', {
        agentInfo: initResult.agentInfo ?? null,
        capabilities: initResult.agentCapabilities ?? null,
      });
    } catch (error) {
      this.lastStartupErrorMessage = this.describeStartupFailure(error);
      await this.shutdownProcess();
      throw error;
    }
    this.setReady(true);
  }

  // Diagnostics only — default off. Returns null when the setting is off or the
  // vault path is unavailable (headless/test contexts). Never throws: writer
  // construction failures self-disable via onDisabled, per CursorAcpCaptureWriter.
  private buildCaptureWriter(cliPath: string): CursorAcpCaptureWriter | null {
    const { captureAcpTraffic } = getCursorProviderSettings(asSettingsBag(this.plugin.settings));
    if (!captureAcpTraffic) {
      return null;
    }
    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) {
      return null;
    }
    const baseDir = path.join(vaultPath, SPECORATOR_STORAGE_PATH, 'captures', 'cursor');
    return new CursorAcpCaptureWriter({
      baseDir,
      meta: {
        // No cheap `cursor-agent --version` probe exists at spawn time; the
        // CLI path is the fallback identity signal for the session.
        cliVersion: cliPath,
        pluginVersion: this.plugin.manifest?.version ?? '0.0.0',
        platform: process.platform,
        startedAt: new Date().toISOString(),
      },
      onDisabled: (error) => {
        this.plugin.logger.scope('cursor.capture').warn('ACP capture disabled after a write failure', error);
      },
    });
  }

  private captureEvent(kind: string, data: Record<string, unknown> = {}): void {
    this.captureWriter?.event(kind, data);
  }

  private handleTransportClosed(transport: AcpJsonRpcTransport): void {
    if (this.transport !== transport) {
      return;
    }
    this.captureEvent('transport_close');
    this.setReady(false);
    // The agent behind any pending blocking ask/approval is gone: abort the
    // in-flight cursor/ask_question (which unmounts its card and restores the
    // composer) and drop the approval card, or both stay stranded.
    this.askQuestionAbortController?.abort();
    this.askQuestionAbortController = null;
    this.host.dismissApproval();
    if (this.activeTurn) {
      const content = this.formatRuntimeError(new Error('Cursor ACP process exited unexpectedly.'));
      this.pushTurnTermination(this.activeTurn, [{ type: 'error', content }, { type: 'done' }]);
    }
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
        this.captureAdvertisedModelValues(response);
        this.captureEvent('session_load', { sessionId: response.sessionId });
        return response.sessionId;
      } catch (error) {
        // Load-bearing no-spike fallback: an id-mapping mismatch degrades to a
        // fresh session with history re-injected on the next prompt.
        this.plugin.logger.scope('cursor.acp').warn('session/load failed; falling back to new session', error);
        this.captureEvent('session_load_fallback');
        this.sessionInvalidated = true;
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
      return this.adoptFreshSession(await this.connection.newSession({ cwd, mcpServers: [] }));
    } catch (error) {
      if (await this.tryAuthenticate()) {
        try {
          return this.adoptFreshSession(await this.connection.newSession({ cwd, mcpServers: [] }));
        } catch (retryError) {
          this.lastStartupErrorMessage = this.formatRuntimeError(retryError);
          return null;
        }
      }
      this.lastStartupErrorMessage = CURSOR_LOGIN_MESSAGE + '\n\n' + this.formatRuntimeError(error);
      return null;
    }
  }

  // Adopts a freshly minted session: a new session starts on the agent's default
  // model and mode, so drop the tracked selections to force applyMode/
  // applySelectedModel to reapply, and record its advertised model wire ids.
  private adoptFreshSession(response: AcpNewSessionResponse): string {
    this.loadedSessionId = response.sessionId;
    this.sessionId = response.sessionId;
    this.currentModeId = null;
    this.currentSessionModelId = null;
    this.captureAdvertisedModelValues(response);
    this.captureEvent('session_new', { sessionId: response.sessionId });
    return response.sessionId;
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
      this.captureEvent('mode_apply', { modeId, ok: true });
    } catch (error) {
      // Mode setting is best-effort: an agent that rejects setMode still runs
      // the turn in its default mode; approvals remain client-enforced.
      this.plugin.logger.scope('cursor.acp').warn('setMode failed', error);
      this.captureEvent('mode_apply', { modeId, ok: false });
    }
  }

  // Records the session's advertised model wire ids from a session/new or
  // session/load response so applySelectedModel can send an exact-matching value
  // (Cursor ACP rejects bare CLI ids). Config-driven `configOptions` win over the
  // legacy `models` state, mirroring extractAcpSessionModelState's precedence.
  private captureAdvertisedModelValues(
    response: AcpNewSessionResponse | AcpLoadSessionResponse,
  ): void {
    const state = extractAcpSessionModelState({
      configOptions: response.configOptions,
      models: response.models,
    });
    this.advertisedModelValues = state.availableModels.map((model) => model.id);
  }

  private async applySelectedModel(
    sessionId: string,
    queryOptions?: ChatRuntimeQueryOptions,
  ): Promise<void> {
    if (!this.connection) {
      return;
    }
    const resolved = this.resolveCursorModelForSession(queryOptions);
    if (!resolved) {
      return;
    }
    const wireValue = matchAdvertisedModelValue(this.advertisedModelValues, resolved);
    if (!wireValue) {
      // No advertised value matches: sending the bare id here would let Cursor
      // report it selected yet break the next prompt ("AI Model Not Found"), so
      // stay on the session's current model instead.
      this.plugin.logger.scope('cursor.acp')
        .warn('no advertised model value matches selection; skipping setConfigOption', resolved);
      return;
    }
    if (wireValue === this.currentSessionModelId) {
      return;
    }
    try {
      await this.connection.setConfigOption({
        configId: 'model',
        sessionId,
        type: 'select',
        value: wireValue,
      });
      this.currentSessionModelId = wireValue;
      this.captureEvent('model_apply', { value: wireValue, ok: true });
    } catch (error) {
      // Best-effort: whether Cursor's ACP dialect implements
      // session/set_config_option is doc-unknown, so a rejection just leaves the
      // turn on the agent's default model rather than failing the turn.
      this.plugin.logger.scope('cursor.acp').warn('setConfigOption(model) failed', error);
      this.captureEvent('model_apply', { value: wireValue, ok: false });
    }
  }

  // Mirrors the retired pre-ACP stream-json launch path: the picked model
  // family plus effort mode resolved against the enabled/catalog id sets.
  private resolveCursorModelForSession(queryOptions?: ChatRuntimeQueryOptions): string | undefined {
    const settingsBag = asSettingsBag(this.plugin.settings);
    const snapshot = ProviderSettingsCoordinator.getProviderSettingsSnapshot(settingsBag, 'cursor');
    const familyValue = this.resolveActiveModel(queryOptions) ?? undefined;
    const mode = typeof snapshot.effortLevel === 'string' ? snapshot.effortLevel : undefined;
    return resolveCursorModelSelectionForCli(familyValue, mode, {
      catalogIds: getCachedCursorModelIds(),
      enabledIds: getCursorEnabledModels(settingsBag),
    });
  }

  // First terminal writer wins: the racing paths (resolved/rejected prompt,
  // transport onClose, cancel escalation) all funnel here, and the closed queue
  // makes later calls no-ops so a mid-turn crash can't emit a second error+done.
  private pushTurnTermination(activeTurn: ActiveTurn, chunks: StreamChunk[]): void {
    if (activeTurn.queue.isClosed) {
      return;
    }
    for (const chunk of chunks) {
      activeTurn.queue.push(chunk);
    }
    activeTurn.queue.close();
  }

  private finalizePlanTurnMetadata(): void {
    // A plan turn only "completed" once the agent produced plan content (an empty
    // plan turn must not open the card) AND create_plan did not already settle the
    // decision in-turn via host.exitPlanMode (which would double-prompt). This
    // gated finalize is the path for plan turns that plan via plain assistant text
    // without ever calling create_plan.
    if (this.currentTurnIsPlan && this.currentTurnSawAssistantContent && !this.currentTurnPlanDecidedInline) {
      this.turnMetadata.planCompleted = true;
    }
  }

  private async handleSessionNotification(notification: AcpSessionNotification): Promise<void> {
    // Agent-initiated mode switches (e.g. leaving plan mode after an accepted
    // cursor/create_plan) must refresh the cache even between turns, or
    // applyMode early-returns against stale state and the next plan turn runs
    // in the agent's current server-side mode. Checked on the raw update so
    // out-of-turn notifications never touch the per-turn normalizer state.
    if (notification.update.sessionUpdate === 'current_mode_update') {
      if (notification.sessionId === this.sessionId) {
        this.currentModeId = notification.update.currentModeId;
      }
      return;
    }

    const activeTurn = this.activeTurn;
    if (!activeTurn || notification.sessionId !== activeTurn.sessionId) {
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
      resolveUsageModel: () => activeTurn.usageModel,
      sessionId: notification.sessionId,
      toolStreamAdapter: this.toolStreamAdapter,
    });
    this.applyActiveTurnEffectState(effect);
    for (const chunk of effect.chunks) {
      // query() already yields a single synthetic user_message_start /
      // assistant_message_start pair per turn, so those are the sole message
      // boundaries. The shared normalizer ALSO emits these from the first
      // message chunk of each role; forwarding them here would double the
      // boundaries and split the transcript into duplicate message frames.
      if (chunk.type === 'user_message_start' || chunk.type === 'assistant_message_start') {
        continue;
      }
      activeTurn.queue.push(chunk);
    }
  }

  // Turn-scoped state writes fanned out from the shared ActiveTurnEffect; keeping
  // them here (rather than inline) lets handleSessionNotification stay focused on
  // chunk forwarding. contextUsage is the authoritative window an earlier
  // usage_update carried, threaded into the final usage chunk by emitFinalUsage.
  private applyActiveTurnEffectState(effect: ActiveTurnEffect): void {
    if (effect.metadataPatch) {
      Object.assign(this.turnMetadata, effect.metadataPatch);
    }
    if (effect.sawAssistantContent) {
      this.currentTurnSawAssistantContent = true;
    }
    if (effect.contextUsage !== undefined) {
      this.contextUsage = effect.contextUsage;
    }
  }

  private async handlePermissionRequest(
    request: AcpRequestPermissionRequest,
  ): Promise<AcpRequestPermissionResponse> {
    const signal = this.askQuestionAbortController?.signal;
    // A cancelled turn beats yolo auto-approval. An agent that ignored
    // session/cancel can fire a late session/request_permission before the 5s
    // escalation restarts it; auto-approving that would run the tool
    // post-cancel. Resolve cancelled first — ahead of the yolo branch and the
    // manual card path (which also races this same signal below).
    if (signal?.aborted) {
      return { outcome: { outcome: 'cancelled' } };
    }

    if (this.autoApprovePermissions) {
      // Prefer the one-turn grant: a yolo turn should not silently persist an
      // allow_always rule, so allow_always is used only when it's the sole
      // allow option the agent offers.
      const auto = selectPermissionOption(request.options, ['allow_once', 'allow_always']);
      if (auto.outcome.outcome === 'selected') {
        return auto;
      }
    }

    const input = normalizeApprovalInput(request.toolCall.rawInput);
    // Race the approval card against the per-turn cancel signal. cancel()/
    // handleTransportClosed abort it and call host.dismissApproval(), which
    // destroys the card WITHOUT resolving host.approval() — so without this race
    // the still-open session/request_permission RPC would hang until the 5s
    // cancel escalation restarts the process. On cancel, answer the RPC with the
    // documented ACP `cancelled` outcome so the turn ends promptly and cleanly.
    const decision = await raceApprovalAgainstCancel(
      this.host.approval(
        request.toolCall.title ?? 'tool',
        input,
        request.toolCall.title ?? '',
        { decisionOptions: buildAcpApprovalDecisionOptions(request.options) },
      ),
      signal,
    );
    if (decision === APPROVAL_CANCELLED) {
      return { outcome: { outcome: 'cancelled' } };
    }
    return mapApprovalDecision(decision, request.options);
  }

  private emitFinalUsage(
    activeTurn: ActiveTurn,
    promptUsage: Parameters<typeof buildAcpUsageInfo>[0]['promptUsage'],
  ): void {
    const model = activeTurn.usageModel;
    if (!model) {
      return; // usage contract: never emit without a model
    }

    const acpUsage = buildAcpUsageInfo({ contextWindow: this.contextUsage, model, promptUsage });
    if (acpUsage) {
      activeTurn.queue.push({ sessionId: activeTurn.sessionId, type: 'usage', usage: acpUsage });
      return;
    }

    // An authoritative usage_update chunk already carried the real context window
    // earlier this turn; the zero-window catalog fallback would overwrite it, so
    // when we've seen one but buildAcpUsageInfo still returned null, emit nothing.
    if (this.contextUsage) {
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
      this.captureEvent('exit');
      await this.process.shutdown().catch(() => {}); // best-effort
      this.process = null;
    }
    this.loadedSessionId = null;
    this.currentModeId = null;
    this.currentSessionModelId = null;
    this.advertisedModelValues = null;
    if (this.captureWriter) {
      await this.captureWriter.flush();
      this.captureWriter = null;
    }
  }
}

// Sentinel resolved by the approval race when the per-turn cancel signal fires
// before the user decides. ApprovalDecision is a string|object union, so a
// symbol can never collide with a real decision.
const APPROVAL_CANCELLED = Symbol('cursor-approval-cancelled');

function raceApprovalAgainstCancel<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T | typeof APPROVAL_CANCELLED> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.resolve(APPROVAL_CANCELLED);
  }
  return new Promise<T | typeof APPROVAL_CANCELLED>((resolve, reject) => {
    const onAbort = () => resolve(APPROVAL_CANCELLED);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
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
