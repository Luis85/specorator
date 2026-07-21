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
import { TOOL_TODO_WRITE } from '../../../core/tools/toolNames';
import type { ChatMessage, Conversation, SlashCommand, StreamChunk } from '../../../core/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { getVaultPath } from '../../../utils/path';
import type { AcpJsonRpcTransport, AcpSubprocess } from '../../acp';
import {
  AcpClientConnection,
  type AcpNewSessionResponse,
  type AcpPlan,
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
  mapApprovalDecision,
  normalizeApprovalInput,
  selectPermissionOption,
} from '../../acp';
import { CURSOR_PROVIDER_CAPABILITIES } from '../capabilities';
import { CursorAcpCaptureSink } from '../diagnostics/CursorAcpCaptureSink';
import { encodeCursorTurn } from '../prompt/encodeCursorTurn';
import { getCursorState, resolveCursorSessionId } from '../types';
import { registerCursorAcpExtensions } from './cursorAcpExtensions';
import { buildCursorAcpLaunchSpec, startCursorAcpProcess } from './cursorAcpLaunch';
import { buildCursorAcpPromptBlocks } from './cursorAcpPrompt';
import { resolveCursorAcpMode } from './cursorAcpSession';
import { createCursorAcpToolStreamAdapter } from './cursorAcpToolNames';
import { buildCursorAgentEnvironment } from './cursorAgentEnv';
import { runWithCursorAgentSpawnLock } from './cursorAgentSpawnLock';
import { cleanupStaleCursorMcpServer } from './cursorMcpCleanup';
import { CursorModelApplicator } from './CursorModelApplicator';
import { buildCursorModelCatalogCliKey } from './cursorModelCatalog';
import { fromCursorModelValue } from './cursorModelId';
import { cursorModelContextWindow } from './cursorModelWindowCatalog';
import { formatCursorRuntimeError } from './cursorRuntimeErrors';
import { CursorSessionCoordinator } from './CursorSessionCoordinator';
import { CursorSessionModelState } from './CursorSessionModelState';
import { normalizeCursorSessionRoots } from './cursorSessionRoots';
import { mapCursorToolInput } from './cursorToolInputMapping';
import { MAX_CURSOR_TOOL_RESULT_CHARS } from './cursorToolNormalization';
import { APPROVAL_CANCELLED, raceApprovalAgainstCancel, withTimeout } from './cursorTurnRaces';
import { extractCursorUsage } from './cursorUsageMapping';
import { ReadyStateNotifier } from './readyStateNotifier';

interface ActiveTurn {
  queue: AcpStreamChunkQueue;
  sessionId: string;
  // Resolved once at turn start: the model cannot change mid-turn, and usage
  // updates arrive on the streaming hot path where re-resolving would clone the
  // settings snapshot per frame. Null suppresses usage chunks (usage contract:
  // never emit without a model).
  usageModel: string | null;
  usageContextWindow: number;
  // Set by the prompt RPC's settle chain, NOT generator teardown. The cancel
  // escalation reads this instead of this.activeTurn, which a consumer bail-out
  // nulls while the prompt (and agent) is still live.
  promptSettled: boolean;
}

const CURSOR_ACP_INIT_TIMEOUT_MS = 20_000;
// session/cancel is cooperative and the prompt RPC has no timeout; if the agent
// ignores it, the turn is terminated locally after this grace period.
const CURSOR_CANCEL_ESCALATION_MS = 5_000;
// A new turn serializes behind a still-unsettled prior prompt; the ceiling sits
// just above the cancel escalation (which recycles the process and settles the
// prompt) so query() can never hang past it.
const CURSOR_TURN_SERIALIZE_CEILING_MS = CURSOR_CANCEL_ESCALATION_MS + 1_000;
const CURSOR_TURN_BUSY_MESSAGE =
  'Cursor agent is still finishing the previous turn. Stop the current turn or wait a moment, then retry.';
const CURSOR_OLD_CLI_MESSAGE =
  'Cursor CLI does not support ACP (`agent acp`). Update cursor-agent (`cursor-agent update` or reinstall from cursor.com/cli), then retry.';

export class CursorChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'cursor';

  private activeTurn: ActiveTurn | null = null;
  // The prior turn's prompt-settle chain (see ActiveTurn.promptSettled). query()
  // awaits it — bounded by the cancel-escalation window — so turns serialize and a
  // cancelled turn's late blocking requests can't leak into the next turn.
  private pendingPromptSettled: Promise<void> | null = null;
  /** Atomically reserves the next prompt slot across simultaneous query() starts. */
  private promptStartTail: Promise<void> = Promise.resolve();
  private readonly sessionModel = new CursorSessionModelState();
  private readonly modelApplicator: CursorModelApplicator;
  private readonly sessionCoordinator: CursorSessionCoordinator;
  private activeCliKey: string | null = null;
  // Aborts a pending blocking cursor/ask_question await so cancel()/cleanup can
  // answer the still-open RPC instead of leaving the agent stuck on it.
  private askQuestionAbortController: AbortController | null = null;
  // Set by cancel() for the turn currently claiming/waiting on prompt ownership.
  // Consumed once when ownership is granted so a later queued query cannot clear
  // an earlier turn's Stop that arrived during awaitPriorTurnSettled.
  private ownershipCancelRequested = false;
  /** Count of query() callers blocked in awaitPriorTurnSettled. */
  private serializeWaiters = 0;
  private autoApprovePermissions = false;
  // Diagnostics-only, default-off ACP capture sink (wire frames/stderr/lifecycle
  // events; see docs/superpowers/specs/2026-07-11-cursor-acp-capture-design.md).
  // Owns the writer: built per spawn, reconciled live on a captureAcpTraffic
  // toggle, flushed at teardown. Constructed below (needs `plugin`).
  private readonly capture: CursorAcpCaptureSink;
  private connection: AcpClientConnection | null = null;
  private contextUsage: AcpUsageUpdate | null = null;
  /** Conversation explicitly bound to this per-tab runtime. */
  private boundConversationId: string | null = null;
  private currentTurnIsPlan = false;
  private currentTurnSawAssistantContent = false;
  // Set once cursor/create_plan has blocked on the user's decision in-turn
  // (host.exitPlanMode); suppresses the post-turn planCompleted card so the plan
  // isn't prompted a second time.
  private currentTurnPlanDecidedInline = false;
  // The TodoWrite tool-call id synthesized for THIS turn's ACP `plan`
  // session/updates (see emitPlanTodoUpdate). Stays stable for the whole turn so
  // successive plan frames replace the same tool call (mergeExistingToolCallInput
  // in StreamController) instead of stacking a new TodoWrite block per update.
  private currentTurnPlanToolCallId: string | null = null;
  private planTurnCounter = 0;
  private process: AcpSubprocess | null = null;
  private readonly readyState = new ReadyStateNotifier();
  private readonly sessionUpdateNormalizer = new AcpSessionUpdateNormalizer({
    maxToolOutputChars: MAX_CURSOR_TOOL_RESULT_CHARS,
  });
  private staleMcpCleaned = false;
  private readonly toolStreamAdapter = createCursorAcpToolStreamAdapter();
  private transport: AcpJsonRpcTransport | null = null;
  private turnMetadata: ChatTurnMetadata = {};
  private unregisterExtensions: (() => void) | null = null;
  private unregisterTransportClose: (() => void) | null = null;
  /** Bumps on cleanup/restart so stale startup work cannot publish handles. */
  private processGeneration = 0;
  /** Serializes startup, forced restart, and cleanup across concurrent callers. */
  private lifecycleTail: Promise<void> = Promise.resolve();
  /** Dedupes concurrent cold starts while a startup is already in flight. */
  private startupPromise: Promise<boolean> | null = null;

  constructor(
    private readonly plugin: PluginContext,
    private readonly host: RuntimeHost,
  ) {
    this.capture = new CursorAcpCaptureSink(plugin);
    this.modelApplicator = new CursorModelApplicator({
      sessionModel: this.sessionModel,
      plugin,
      capture: this.capture,
      getConnection: () => this.connection,
      getActiveCliKey: () => this.activeCliKey,
    });
    this.sessionCoordinator = new CursorSessionCoordinator({
      getConnection: () => this.connection,
      plugin,
      capture: this.capture,
      sessionModel: this.sessionModel,
      modelApplicator: this.modelApplicator,
      getBoundConversationId: () => this.boundConversationId,
      formatRuntimeError: (error) => this.formatRuntimeError(error),
    });
  }

  // Session identity lives on the coordinator; the runtime proxies each field so
  // its turn/notification code (and the white-box unit suite) keep reading and
  // writing them by name.
  private get sessionId(): string | null { return this.sessionCoordinator.sessionId; }
  private set sessionId(value: string | null) { this.sessionCoordinator.sessionId = value; }
  private get loadedSessionId(): string | null { return this.sessionCoordinator.loadedSessionId; }
  private set loadedSessionId(value: string | null) { this.sessionCoordinator.loadedSessionId = value; }
  private get sessionInvalidated(): boolean { return this.sessionCoordinator.sessionInvalidated; }
  private set sessionInvalidated(value: boolean) { this.sessionCoordinator.sessionInvalidated = value; }
  private get activeSessionRoots(): string[] { return this.sessionCoordinator.activeSessionRoots; }
  private set activeSessionRoots(value: string[]) { this.sessionCoordinator.activeSessionRoots = value; }
  private get currentModeId(): string | null { return this.sessionCoordinator.currentModeId; }
  private set currentModeId(value: string | null) { this.sessionCoordinator.currentModeId = value; }
  private get lastStartupErrorMessage(): string | null { return this.sessionCoordinator.lastStartupErrorMessage; }
  private set lastStartupErrorMessage(value: string | null) { this.sessionCoordinator.lastStartupErrorMessage = value; }

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
    return this.readyState.subscribe(listener);
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(conversation: ChatRuntimeConversationState | null): void {
    this.boundConversationId = conversation?.id ?? null;
    const nextSessionId = conversation ? resolveCursorSessionId(conversation) : null;
    if (this.sessionId !== nextSessionId) {
      this.sessionInvalidated = false;
      this.sessionModel.reset();
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
      this.readyState.set(false);
      return false;
    }

    if (this.startupPromise && options?.force !== true) {
      return this.startupPromise;
    }

    return this.withLifecycleLock(async () => {
      // A forced ensureReady (env/CLI resync) must restart even when the process
      // is alive; startProcess shuts the old one down before the fresh spawn.
      const alive = Boolean(
        this.process?.isAlive() && this.transport && !this.transport.isClosed && this.connection,
      );
      if (alive && options?.force !== true) {
        // The process is reused across turns, so a captureAcpTraffic toggle since
        // the spawn never reached it — reconcile the writer against the current
        // setting here (no respawn; the sink hooks read its writer live).
        await this.capture.reconcile(cli);
        return true;
      }

      if (this.startupPromise && options?.force !== true) {
        return this.startupPromise;
      }

      this.startupPromise = (async () => {
        try {
          await this.startProcess(cli);
          return true;
        } catch (error) {
          this.readyState.set(false);
          this.plugin.logger.scope('cursor.acp').warn('startup failed', error);
          return false;
        } finally {
          this.startupPromise = null;
        }
      })();

      return this.startupPromise;
    });
  }

  // Fresh per-turn abort scope for the blocking ask_question / create_plan RPCs. A
  // Stop during awaitPriorTurnSettled pre-aborts it via cancelDuringClaimWait, since
  // turnSignal didn't exist then for the startup-cancel bail to catch it.
  private beginTurnAbortScope(cancelDuringClaimWait: boolean): AbortSignal {
    this.askQuestionAbortController?.abort();
    const controller = new AbortController();
    if (cancelDuringClaimWait) {
      controller.abort();
    }
    this.askQuestionAbortController = controller;
    return controller.signal;
  }

  private consumeOwnershipCancelRequest(): boolean {
    const requested = this.ownershipCancelRequested;
    this.ownershipCancelRequested = false;
    return requested;
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    const cli = this.plugin.getResolvedProviderCliPath('cursor');
    if (!cli) {
      yield { type: 'error', content: 'Cursor Agent CLI not found. Configure it in Cursor settings.' };
      yield { type: 'done' };
      return;
    }

    // Serialize behind a still-unsettled prior prompt: stop A + immediately send B
    // share one session id, so A's late sessionId-less blocking request could see B's
    // rotated signal and open A's plan into B. Waiting for A to settle BEFORE rotating
    // the controller keeps A's aborted signal current so A's late requests cancel.
    const releasePromptOwnership = await this.claimPromptOwnership();
    if (!releasePromptOwnership) {
      yield { type: 'error', content: CURSOR_TURN_BUSY_MESSAGE };
      yield { type: 'done' };
      return;
    }

    let promptDispatched = false;
    try {
      // Reset AFTER the wait: a cancelled prior turn's finalize runs during it and would else leave stale planCompleted.
      this.turnMetadata = {};

      const cancelDuringClaimWait = this.consumeOwnershipCancelRequest();
      const turnSignal = this.beginTurnAbortScope(cancelDuringClaimWait);

      yield { type: 'user_message_start', content: turn.persistedContent };
      yield { type: 'assistant_message_start' };

      const prep = await this.prepareCursorTurn(turn, conversationHistory, queryOptions);
      if (!prep.ok) {
        yield { type: 'error', content: prep.error };
        yield { type: 'done' };
        return;
      }

      // Stop during startup aborts turnSignal; beginTurnAbortScope also pre-aborts it
      // for a Stop during awaitPriorTurnSettled. Bail before session/prompt fires.
      if (turnSignal.aborted) {
        yield { type: 'done' };
        return;
      }

      const activeTurn = this.startActiveTurn(prep.sessionId, queryOptions);
      const history = prep.shouldBootstrapHistory ? (conversationHistory ?? []) : [];

      promptDispatched = true;
      yield* this.runPromptTurn(
        activeTurn, turn, history, prep.sessionId, queryOptions, releasePromptOwnership,
      );
    } finally {
      if (!promptDispatched) {
        releasePromptOwnership();
      }
    }
  }

  // Runs the post-yield startup path — stale-MCP cleanup, ensureReady, session
  // open, and per-turn session prep — collapsing its guards into one result so
  // query() emits a single error/done pair on any failure.
  private async prepareCursorTurn(
    turn: PreparedChatTurn,
    conversationHistory: ChatMessage[] | undefined,
    queryOptions: ChatRuntimeQueryOptions | undefined,
  ): Promise<
    | { ok: false; error: string }
    | { ok: true; sessionId: string; shouldBootstrapHistory: boolean }
  > {
    if (!this.staleMcpCleaned) {
      this.staleMcpCleaned = true;
      await cleanupStaleCursorMcpServer();
    }

    let startupError: string | null = null;
    if (!(await this.ensureReady())) {
      startupError = this.lastStartupErrorMessage ?? CURSOR_OLD_CLI_MESSAGE;
    }
    if (startupError || !this.connection) {
      return { ok: false, error: startupError ?? 'Cursor ACP runtime is not ready.' };
    }

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const externalRoots = this.resolveTurnExternalRoots(turn, queryOptions);
    // Capture the session id BEFORE ensureSession (which may mint a fresh one): a
    // turn starting without one (fork, provider switch, resume whose native session
    // never loaded) still carries history that must be re-injected into the prompt.
    const sessionIdAtTurnStart = this.sessionId;
    const sessionId = await this.ensureSession(cwd, externalRoots);
    if (!sessionId) {
      return { ok: false, error: this.lastStartupErrorMessage ?? 'Failed to open a Cursor session.' };
    }

    const shouldBootstrapHistory = (conversationHistory?.length ?? 0) > 0
      && (!sessionIdAtTurnStart || this.sessionInvalidated);

    try {
      await this.prepareSessionForPromptTurn(sessionId, queryOptions);
    } catch (error) {
      return { ok: false, error: this.formatRuntimeError(error) };
    }

    return { ok: true, sessionId, shouldBootstrapHistory };
  }

  // Opens a fresh ActiveTurn and resets the per-turn stream/plan/usage state.
  private startActiveTurn(
    sessionId: string,
    queryOptions: ChatRuntimeQueryOptions | undefined,
  ): ActiveTurn {
    this.activeTurn?.queue.close();
    const activeTurn: ActiveTurn = {
      queue: new AcpStreamChunkQueue(),
      sessionId,
      usageContextWindow: cursorModelContextWindow(this.sessionModel.currentValue),
      usageModel: this.modelApplicator.resolveActiveModel(queryOptions),
      promptSettled: false,
    };
    this.activeTurn = activeTurn;
    this.currentTurnSawAssistantContent = false;
    this.currentTurnPlanDecidedInline = false;
    this.currentTurnPlanToolCallId = null;
    this.contextUsage = null;
    this.sessionUpdateNormalizer.reset();
    this.toolStreamAdapter.reset();
    return activeTurn;
  }

  // Fires the ACP prompt off-thread and wires its settlement: final usage/plan
  // metadata on success, a terminal error otherwise, and — always — the
  // prompt-settled flag, activeTurn teardown, and prompt-ownership release.
  private dispatchPromptTurn(
    activeTurn: ActiveTurn,
    turn: PreparedChatTurn,
    history: ChatMessage[],
    sessionId: string,
    queryOptions: ChatRuntimeQueryOptions | undefined,
    releasePromptOwnership: () => void,
  ): Promise<void> {
    return Promise.resolve().then(() => this.connection!.prompt({
      prompt: buildCursorAcpPromptBlocks(turn, history, queryOptions?.boundAgentPrompt),
      sessionId,
    })).then((response) => {
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
      releasePromptOwnership();
    });
  }

  // Dispatches the prompt and relays the ACP stream to the caller, tearing down
  // activeTurn once the queue drains and the prompt settles.
  private async *runPromptTurn(
    activeTurn: ActiveTurn,
    turn: PreparedChatTurn,
    history: ChatMessage[],
    sessionId: string,
    queryOptions: ChatRuntimeQueryOptions | undefined,
    releasePromptOwnership: () => void,
  ): AsyncGenerator<StreamChunk> {
    const promptPromise = this.dispatchPromptTurn(
      activeTurn, turn, history, sessionId, queryOptions, releasePromptOwnership,
    );
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

  private async claimPromptOwnership(): Promise<(() => void) | null> {
    const priorClaim = this.promptStartTail;
    let releaseClaim!: () => void;
    const claimSlot = new Promise<void>((resolve) => {
      releaseClaim = resolve;
    });
    this.promptStartTail = priorClaim.then(() => claimSlot);
    await priorClaim;

    try {
      if (!(await this.awaitPriorTurnSettled())) {
        this.consumeOwnershipCancelRequest();
        return null;
      }
      let releaseReservation!: () => void;
      const reservation = new Promise<void>((resolve) => {
        releaseReservation = resolve;
      });
      this.pendingPromptSettled = reservation;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        releaseReservation();
        if (this.pendingPromptSettled === reservation) {
          this.pendingPromptSettled = null;
        }
      };
    } finally {
      releaseClaim();
    }
  }

  // Bounded serialize wait for a prior turn's prompt (see the call site in query()
  // for the attribution gap this closes). Returns false when the prior prompt is
  // still live after cancel/recycle — callers must not issue a second session/prompt.
  private async awaitPriorTurnSettled(): Promise<boolean> {
    if (!this.pendingPromptSettled) {
      return true;
    }
    this.serializeWaiters += 1;
    try {
      const settled = await withTimeout(
        this.pendingPromptSettled,
        CURSOR_TURN_SERIALIZE_CEILING_MS,
        new Error('cursor turn serialize ceiling'),
      ).then(() => true).catch(() => false);
      if (settled) {
        return true;
      }

      this.cancel();
      await this.recycleProcess();
      return false;
    } finally {
      this.serializeWaiters -= 1;
    }
  }

  cancel(): void {
    if (this.serializeWaiters > 0) {
      this.ownershipCancelRequested = true;
    }
    const turn = this.activeTurn;
    if (this.connection && this.sessionId) {
      this.connection.cancel({ sessionId: this.sessionId });
      this.capture.event('cancel', { sessionId: this.sessionId });
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

  // session/cancel is only a request: a hung agent never settles the prompt.
  // Liveness keys off turn.promptSettled, NOT this.activeTurn — a consumer breaking
  // out of query() on cancel nulls activeTurn while the prompt is still live. If
  // unsettled after the grace period, terminate locally and recycle the process.
  private armCancelEscalation(turn: ActiveTurn): void {
    const generation = this.processGeneration;
    window.setTimeout(() => {
      if (turn.promptSettled || generation !== this.processGeneration) {
        return;
      }
      this.capture.event('cancel_escalation');
      this.pushTurnTermination(turn, [
        { type: 'error', content: 'Cursor agent did not stop after cancel; restarting the agent process.' },
        { type: 'done' },
      ]);
      void this.recycleProcess(generation);
    }, CURSOR_CANCEL_ESCALATION_MS);
  }

  resetSession(): void {
    this.sessionId = null;
    this.loadedSessionId = null;
    this.sessionInvalidated = false;
    this.activeSessionRoots = [];
    this.currentModeId = null;
    this.sessionModel.reset();
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
    return this.readyState.get();
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [];
  }

  async cleanup(): Promise<void> {
    // Supersede immediately, before waiting on the lifecycle lock. An in-flight
    // initialize then disposes its local handles instead of briefly publishing
    // a runtime that cleanup has already invalidated.
    this.processGeneration += 1;
    this.startupPromise = null;
    await this.withLifecycleLock(async () => {
      this.activeTurn?.queue.close();
      this.activeTurn = null;
      // Resolve any pending blocking ask_question before tearing down the process.
      this.askQuestionAbortController?.abort();
      this.askQuestionAbortController = null;
      await this.shutdownProcess();
      this.readyState.clear();
    });
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
    const generation = ++this.processGeneration;
    await this.shutdownProcess();

    this.lastStartupErrorMessage = null;

    const cwd = getVaultPath(this.plugin.app) ?? process.cwd();
    const env = buildCursorAgentEnvironment(this.plugin, cliPath);
    this.activeCliKey = buildCursorModelCatalogCliKey(cliPath, env);
    const spec = buildCursorAcpLaunchSpec(cliPath, cwd, env);

    this.capture.build(cliPath);

    let localProcess: AcpSubprocess | null = null;
    let localTransport: AcpJsonRpcTransport | null = null;
    let localConnection: AcpClientConnection | null = null;
    let unregisterLocalTransportClose: (() => void) | null = null;
    let unregisterLocalExtensions: (() => void) | null = null;

    const disposeLocal = async (): Promise<void> => {
      unregisterLocalExtensions?.();
      unregisterLocalTransportClose?.();
      localConnection?.dispose();
      localTransport?.dispose();
      if (localProcess) {
        this.capture.event('exit');
        await localProcess.shutdown().catch(() => {});
      }
    };

    try {
      // Always wire the sink hooks; the sink no-ops when capture is off and reads
      // its writer dynamically per frame, so a mid-session toggle can flip capture
      // live — `capture.reconcile` builds/drops the writer without a respawn,
      // which the persistent process would otherwise require.
      const { process: proc, transport } = await runWithCursorAgentSpawnLock(
        async () => startCursorAcpProcess(spec, {
          onStderrData: (chunk) => this.capture.stderr(chunk),
          onWireFrame: (direction, rawLine) => this.capture.wireFrame(direction, rawLine),
        }),
      );
      localProcess = proc;
      localTransport = transport;
      if (generation !== this.processGeneration) {
        throw new Error('Cursor ACP startup superseded');
      }

      unregisterLocalTransportClose = transport.onClose(() => this.handleTransportClosed(transport));
      // envKeys only — env VALUES must never reach the capture sink.
      this.capture.event('spawn', { cliPath, args: spec.args, envKeys: Object.keys(spec.env) });

      localConnection = new AcpClientConnection({
        clientInfo: { name: 'specorator', version: this.plugin.manifest?.version ?? '0.0.0' },
        delegate: {
          onSessionNotification: (notification) => this.handleSessionNotification(notification),
          requestPermission: (request) => this.handlePermissionRequest(request),
        },
        transport,
      });
      unregisterLocalExtensions = registerCursorAcpExtensions(transport, {
        askUser: this.host.askUser,
        exitPlanMode: this.host.exitPlanMode,
        getAskSignal: () => this.askQuestionAbortController?.signal,
        emitChunk: (chunk, sessionId) => {
          if (sessionId !== undefined && sessionId !== this.activeTurn?.sessionId) {
            return;
          }
          this.activeTurn?.queue.push(chunk);
        },
        markPlanDecidedInline: (sessionId) => {
          if (sessionId !== undefined && sessionId !== this.activeTurn?.sessionId) {
            return;
          }
          this.currentTurnPlanDecidedInline = true;
        },
        isActiveSession: (sessionId) => sessionId === undefined || sessionId === this.activeTurn?.sessionId,
        requestTurnCancel: () => this.cancel(),
      });

      transport.start();
      const initResult = await withTimeout(
        localConnection.initialize(),
        CURSOR_ACP_INIT_TIMEOUT_MS,
        new Error('ACP initialize timed out'),
      );
      if (generation !== this.processGeneration) {
        throw new Error('Cursor ACP startup superseded');
      }

      this.capture.event('initialize', {
        agentInfo: initResult.agentInfo ?? null,
        capabilities: initResult.agentCapabilities ?? null,
      });

      this.unregisterExtensions?.();
      this.unregisterTransportClose?.();
      this.connection?.dispose();
      this.transport?.dispose();
      if (this.process) {
        await this.process.shutdown().catch(() => {});
      }

      this.process = localProcess;
      this.transport = localTransport;
      this.connection = localConnection;
      this.unregisterTransportClose = unregisterLocalTransportClose;
      this.unregisterExtensions = unregisterLocalExtensions;
      localProcess = null;
      localTransport = null;
      localConnection = null;
      unregisterLocalTransportClose = null;
      unregisterLocalExtensions = null;
      this.readyState.set(true);
    } catch (error) {
      if (generation === this.processGeneration) {
        this.lastStartupErrorMessage = this.describeStartupFailure(error, localProcess);
      }
      this.capture.event('startup_error', {
        message: error instanceof Error ? error.message : String(error),
      });
      await disposeLocal();
      await this.capture.flush();
      throw error;
    }
  }

  private async withLifecycleLock<T>(body: () => Promise<T>): Promise<T> {
    const prior = this.lifecycleTail;
    let release!: () => void;
    const slot = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lifecycleTail = prior.then(() => slot);
    await prior;
    try {
      return await body();
    } finally {
      release();
    }
  }

  private async recycleProcess(expectedGeneration?: number): Promise<void> {
    await this.withLifecycleLock(async () => {
      if (expectedGeneration !== undefined && expectedGeneration !== this.processGeneration) {
        return;
      }
      this.processGeneration += 1;
      this.startupPromise = null;
      await this.shutdownProcess();
    });
  }

  private handleTransportClosed(transport: AcpJsonRpcTransport): void {
    if (this.transport !== transport) {
      return;
    }
    this.capture.event('transport_close');
    this.readyState.set(false);
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

  private describeStartupFailure(_error: unknown, startupProcess?: AcpSubprocess | null): string {
    // Any failure before initialize resolves — immediate exit ("unknown
    // subcommand"), closed transport, or timeout — means the installed
    // cursor-agent predates ACP. One actionable message covers them all.
    const stderr = startupProcess?.getStderrSnapshot()
      ?? this.process?.getStderrSnapshot()
      ?? '';
    return stderr ? `${CURSOR_OLD_CLI_MESSAGE}\n\n${stderr}` : CURSOR_OLD_CLI_MESSAGE;
  }

  private ensureSession(cwd: string, roots: string[] = []): Promise<string | null> {
    return this.sessionCoordinator.ensureSession(cwd, roots);
  }

  private createSession(cwd: string, roots: string[] = []): Promise<string | null> {
    return this.sessionCoordinator.createSession(cwd, roots);
  }

  private adoptFreshSession(response: AcpNewSessionResponse): Promise<string> {
    return this.sessionCoordinator.adoptFreshSession(response);
  }

  private applyMode(sessionId: string, modeId: string): Promise<void> {
    return this.sessionCoordinator.applyMode(sessionId, modeId);
  }

  private async prepareSessionForPromptTurn(
    sessionId: string,
    queryOptions?: ChatRuntimeQueryOptions,
  ): Promise<void> {
    const mode = resolveCursorAcpMode(this.plugin.settings.permissionMode);
    this.autoApprovePermissions = mode.autoApprove;
    // Independent RPCs on the same session — issued concurrently so the turn
    // doesn't pay two sequential round-trips before the prompt is sent.
    await Promise.all([
      this.applyMode(sessionId, mode.modeId),
      this.applySelectedModel(sessionId, queryOptions),
    ]);
    // Arm the plan flag only once plan mode is actually in effect: a requested plan
    // turn whose set_mode failed (applyMode swallows rejections) runs as non-plan so
    // its ordinary assistant text won't spuriously open the post-plan approval card.
    // The cursor/create_plan side-channel still sets planCompleted if the agent plans.
    this.currentTurnIsPlan = mode.modeId === 'plan' && this.currentModeId === 'plan';
  }

  // Thin seam onto the model collaborator: retained because the runtime's
  // white-box unit tests drive model application through `applySelectedModel`.
  private applySelectedModel(sessionId: string, queryOptions?: ChatRuntimeQueryOptions): Promise<void> {
    return this.modelApplicator.applySelectedModel(sessionId, queryOptions);
  }

  // Selected external folders become the ACP session's additionalDirectories so
  // the agent can read sibling files outside the vault cwd — mirroring Claude's
  // externalContextPaths → additionalDirectories mapping.
  private resolveTurnExternalRoots(
    turn: PreparedChatTurn,
    queryOptions?: ChatRuntimeQueryOptions,
  ): string[] {
    return normalizeCursorSessionRoots(
      turn.request.externalContextPaths ?? queryOptions?.externalContextPaths,
    );
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
    if (notification.update.sessionUpdate === 'config_option_update') {
      if (notification.sessionId === this.sessionId) {
        this.modelApplicator.captureAdvertisedModelValues({
          configOptions: notification.update.configOptions,
        });
      }
      return;
    }

    const activeTurn = this.activeTurn;
    if (!activeTurn || notification.sessionId !== activeTurn.sessionId) {
      return;
    }
    const normalized = this.sessionUpdateNormalizer.normalize(notification.update);
    if (normalized.type === 'plan') {
      this.emitPlanTodoUpdate(activeTurn, normalized.plan);
      return;
    }
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
      // query() already yields one synthetic user/assistant_message_start pair per
      // turn (the sole boundaries). The shared normalizer ALSO emits these from each
      // role's first chunk; forwarding them here would duplicate the message frames.
      if (chunk.type === 'user_message_start' || chunk.type === 'assistant_message_start') {
        continue;
      }
      activeTurn.queue.push(chunk);
    }
  }

  // ACP `plan` session/updates report live plan/todo status outside the tool-call
  // channel; reuse cursor/update_todos' coercion (mapCursorToolInput) so they land
  // on the shared todo panel. One id is kept for the whole turn so repeat frames
  // REPLACE the same tool call (mergeExistingToolCallInput merges input by id)
  // rather than stacking a block per frame.
  private emitPlanTodoUpdate(activeTurn: ActiveTurn, plan: AcpPlan): void {
    if (!this.currentTurnPlanToolCallId) {
      this.currentTurnPlanToolCallId = `cursor-plan-${++this.planTurnCounter}`;
    }
    const id = this.currentTurnPlanToolCallId;
    const input = mapCursorToolInput('updateTodosToolCall', { todos: plan.entries }, undefined);
    activeTurn.queue.push({ type: 'tool_use', id, name: TOOL_TODO_WRITE, input });
    activeTurn.queue.push({ type: 'tool_result', id, content: 'Plan updated', isError: false });
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
    // A cancelled turn beats yolo auto-approval: an agent that ignored
    // session/cancel can fire a late request_permission before the 5s escalation,
    // and auto-approving it would run the tool post-cancel. Resolve cancelled first.
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
    // Race the approval card against the per-turn cancel signal: cancel()/
    // handleTransportClosed dismiss the card WITHOUT resolving host.approval(), so
    // without this race the open request_permission RPC would hang until the 5s
    // escalation. On cancel, answer the RPC with the documented `cancelled` outcome.
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

    // Cursor emits no usage_update, so this.contextUsage is usually null and the
    // window comes from the model catalog — pass it as the fallback so a prompt
    // response that DID carry token counts keeps the window/percentage instead of
    // collapsing to contextWindow: 0 on exactly the turns where tokens are known.
    // Strip the namespaced `cursor:` prefix first — the window catalog is keyed by
    // raw ids (the emitted model stays as-is; downstream pricing/meter strip too).
    const fallback = extractCursorUsage({}, fromCursorModelValue(model));
    const fallbackContextWindow = activeTurn.usageContextWindow || fallback.contextWindow;
    const acpUsage = buildAcpUsageInfo({
      contextWindow: this.contextUsage,
      model,
      promptUsage,
      fallbackContextWindowSize: fallbackContextWindow,
    });
    if (acpUsage) {
      activeTurn.queue.push({ sessionId: activeTurn.sessionId, type: 'usage', usage: acpUsage });
      return;
    }

    // Defensive: an authoritative usage_update was seen but buildAcpUsageInfo
    // still built nothing — don't overwrite the real window with the catalog
    // fallback. (Unreachable in practice: a present contextWindow always builds.)
    if (this.contextUsage) {
      return;
    }

    // No ACP usage payload at all (no usage_update AND no prompt usage): emit the
    // catalog window with zero tokens (same shape the stream-json path emitted
    // without usage data). Routed through buildUsageInfo so the emitted shape
    // stays contract-clean (floors, clamps, computed percentage).
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
        contextWindow: fallbackContextWindow,
        contextWindowIsAuthoritative: fallbackContextWindow > 0,
      }),
    });
  }

  private formatRuntimeError(error: unknown): string {
    return formatCursorRuntimeError(error, this.process?.getStderrSnapshot());
  }

  private async shutdownProcess(): Promise<void> {
    this.readyState.set(false);
    this.unregisterExtensions?.();
    this.unregisterExtensions = null;
    this.unregisterTransportClose?.();
    this.unregisterTransportClose = null;
    this.connection?.dispose();
    this.connection = null;
    this.transport?.dispose();
    this.transport = null;
    if (this.process) {
      this.capture.event('exit');
      await this.process.shutdown().catch(() => {}); // best-effort
      this.process = null;
    }
    this.loadedSessionId = null;
    this.currentModeId = null;
    this.sessionModel.reset();
    await this.capture.flush();
  }
}
