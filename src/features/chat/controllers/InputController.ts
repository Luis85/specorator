import { Notice } from 'obsidian';

import type {
  BuiltInCommand,
} from '../../../core/commands/builtInCommands';
import {
  detectBuiltInCommand,
  isBuiltInCommandSupported,
} from '../../../core/commands/builtInCommands';
import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import {
  DEFAULT_CHAT_PROVIDER_ID,
  type InstructionRefineService,
  type ProviderCapabilities,
  type ProviderId,
  type TitleGenerationService,
} from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import {
  cloneChatTurnRequest,
} from '../../../core/runtime/QueuedTurn';
import type {
  ApprovalCallbackOptions,
  ChatRuntimeQueryOptions,
  ChatTurnRequest,
} from '../../../core/runtime/types';
import type { ApprovalDecision, ChatMessage, ExitPlanModeDecision, StreamChunk } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type { TranslationKey } from '../../../i18n/types';
import type SpecoratorPlugin from '../../../main';
import type { BrowserSelectionContext } from '../../../utils/browser';
import type { CanvasSelectionContext } from '../../../utils/canvas';
import type { EditorSelectionContext } from '../../../utils/editor';
import { dedupeExternalContextPaths, filterRedundantExternalContextPaths } from '../../../utils/externalContextTurn';
import type { SubagentManager } from '../services/SubagentManager';
import { applyTitleGenerationResult } from '../services/titleGenerationResult';
import type { ChatState } from '../state/ChatState';
import type { FileContextManager } from '../ui/FileContext';
import type { ImageContextManager } from '../ui/ImageContext';
import type { InstructionModeManager } from '../ui/InstructionModeManager';
import type { AddExternalContextResult, McpServerSelector } from '../ui/toolbar/shared';
import { resolveBoundAgentQueryOptions } from './boundAgentQueryOptions';
import type { BrowserSelectionController } from './BrowserSelectionController';
import type { CanvasSelectionController } from './CanvasSelectionController';
import {
  applyPlanApprovalDecision,
  bakeResponseDurationFooter,
  beginStreamingTurnState,
  captureComposerRollbackSnapshot,
  clearConsumedComposerInput,
  completeApprovedNewSessionPlanToolCalls,
  type ComposerSendContext,
  type ComposerTurnOptions,
  confirmDmAgentOrRestoreComposer,
  createAssistantPlaceholderMessage,
  createOutgoingUserMessage,
  type DispatchedTurnContext,
  type FinishedTurn,
  normalizeTabModelOverride,
  type OutgoingTurn,
  persistComposerImagesOrRestore,
  type PlanApprovalOutcome,
  resolveComposerSend,
  resolveComposerSourceImages,
  restoreResumeCheckpointIfNeeded,
  rollbackOptimisticOutgoingTurn,
} from './composerSendPhases';
import type { ConversationController } from './ConversationController';
import type { InlineCardMounter } from './inlineCardMount';
import { InlinePromptController } from './InlinePromptController';
import { runInstructionRefineFlow } from './instructionRefineFlow';
import { QueuedMessageController } from './QueuedMessageController';
import { ResumeSessionDropdownCoordinator, type ResumeSessionDropdownDeps } from './ResumeSessionDropdownCoordinator';
import type { SelectionController } from './SelectionController';
import type { StreamController } from './StreamController';
import { activateStreamingAssistantMessage, discardStreamingAssistantMessage } from './streamingMessageLifecycle';
import { isTeamChatSurfaceConversation, teamChatDmBoundAgentId } from './teamChatSurface';

export interface InputControllerDeps {
  plugin: SpecoratorPlugin;
  state: ChatState;
  /** Mounts the inline-prompt Vue cards (approval / ask / exit-plan / post-plan). */
  mountInlineCard: InlineCardMounter;
  /** Re-projects the transcript snapshot into the Vue store (per-tab). */
  emitTranscript?: () => void;
  /** Re-projects a single message (fresh identity) — see `completeFinishedTurn`. */
  refreshTranscriptMessage?: (messageId: string) => void;
  streamController: StreamController;
  selectionController: SelectionController;
  browserSelectionController?: BrowserSelectionController;
  canvasSelectionController: CanvasSelectionController;
  conversationController: ConversationController;
  getInputEl: () => HTMLTextAreaElement;
  getMessagesEl: () => HTMLElement;
  getFileContextManager: () => FileContextManager | null;
  getImageContextManager: () => ImageContextManager | null;
  getMcpServerSelector: () => McpServerSelector | null;
  getExternalContextSelector: () => {
    getExternalContexts: () => string[];
    addExternalContext: (path: string) => AddExternalContextResult;
  } | null;
  getInstructionModeManager: () => InstructionModeManager | null;
  getInstructionRefineService: () => InstructionRefineService | null;
  getTitleGenerationService: () => TitleGenerationService | null;
  getInputContainerEl: () => HTMLElement;
  /** Chat dropdown coordinator the resume dropdown delegates render/keyboard to. */
  getDropdownCoordinator?: ResumeSessionDropdownDeps['getDropdownCoordinator'];
  generateId: () => string;
  resetInputHeight: () => void;
  getAuxiliaryModel?: () => string | null;
  getAgentService?: () => ChatRuntime | null;
  getSubagentManager: () => SubagentManager;
  /** Tab-level provider fallback for blank tabs (derived from draft model). */
  getTabProviderId?: () => ProviderId;
  /**
   * Roster agent id to bind to the lazily-created conversation for this tab
   * (e.g. `roster:foo`). Set for Agent Board task-run tabs whose work order
   * assigned a roster agent; absent for normal chat tabs. Once consumed by
   * `triggerTitleGeneration`, the tab clears it so subsequent rebinds don't
   * carry the stale id.
   */
  getBoundAgentId?: () => string | null | undefined;
  /**
   * Tab-pinned model that should override the provider's global `settings.model`
   * on the next send. Returns the work-order's selected model for Agent Board
   * task runs (and the draft model for blank tabs that haven't committed yet);
   * returns null/empty when no override applies. Captured BEFORE
   * `ensureServiceInitialized` runs because the tab lifecycle clears the draft
   * model during init.
   */
  getTabModelOverride?: () => string | null;
  /** Returns true if ready. */
  ensureServiceInitialized?: () => Promise<boolean>;
  openConversation?: (conversationId: string) => Promise<void>;
  onForkAll?: () => Promise<void>;
  restorePrePlanPermissionModeIfNeeded?: () => void;
}

/** Result returned for programmatic sends (e.g. Agent Board task runs). User sends ignore it. */
export interface ProgrammaticSendResult {
  ok: boolean;
  finalAssistantContent: string;
  error?: string;
  /**
   * The turn was accepted but queued behind a still-streaming turn; it will run
   * (and stream its own end) once the current turn finishes. Distinguishes the
   * streaming-queue branch from a `void` return that means "not sent" (e.g. a
   * built-in command or a conversation switch), so callers can wait for queued
   * turns but fail fast on no-ops.
   */
  queued?: boolean;
}

export class InputController {
  private deps: InputControllerDeps;
  private readonly resumeDropdown: ResumeSessionDropdownCoordinator;
  private readonly queuedMessages: QueuedMessageController;
  private readonly inlinePrompts: InlinePromptController;
  private activeStreamingAssistantMessage: ChatMessage | null = null;
  private pendingProviderUserMessages: Array<{
    displayContent: string;
    persistedContent?: string;
    currentNote?: string;
    images?: ChatMessage['images'];
  }> = [];
  private sawInitialProviderUserMessage = false;
  private awaitingProviderAssistantStart = false;
  /** Last dispatched turn, retained so a runtime-error card can re-dispatch it. */
  private lastTurnSubmission: {
    turnRequest: ChatTurnRequest;
    displayContent: string;
    images?: ChatMessage['images'];
  } | null = null;

  constructor(deps: InputControllerDeps) {
    this.deps = deps;
    this.resumeDropdown = new ResumeSessionDropdownCoordinator({
      getInputContainerEl: () => this.deps.getInputContainerEl(),
      getInputEl: () => this.deps.getInputEl(),
      getConversations: () => this.deps.plugin.getConversationList(),
      getCurrentConversationId: () => this.deps.state.currentConversationId,
      openConversation: (id) => this.deps.openConversation?.(id) ?? this.deps.conversationController.switchTo(id),
      getDropdownCoordinator: () => this.deps.getDropdownCoordinator?.() ?? null,
      // Team Chat DMs bind one fixed thread per agent, so `$` resume is suppressed
      // on that surface (surface-driven; non-team-chat and blank tabs unchanged).
      isResumeDisabled: () => isTeamChatSurfaceConversation(this.deps.plugin, this.deps.state.currentConversationId),
    });
    this.queuedMessages = new QueuedMessageController({
      state: deps.state,
      plugin: deps.plugin,
      getAgentService: () => this.getAgentService(),
      getActiveCapabilities: () => this.getActiveCapabilities(),
      getInputEl: deps.getInputEl,
      getImageContextManager: deps.getImageContextManager,
      getFileContextManager: deps.getFileContextManager,
      resetInputHeight: deps.resetInputHeight,
      requestSend: (options) => {
        void this.sendMessage(options);
      },
      onSteerCommitted: (message) => {
        this.pendingProviderUserMessages.push(message);
      },
    });
    this.inlinePrompts = new InlinePromptController({
      state: deps.state,
      getInputContainerEl: () => this.deps.getInputContainerEl(),
      mountInlineCard: deps.mountInlineCard,
      hideThinkingIndicator: () => this.deps.streamController.hideThinkingIndicator(),
      getPlanPathPrefix: () => this.getActiveCapabilities().planPathPrefix,
    });
  }

  /** Re-projects the transcript snapshot (per-tab). No-op when unwired (tests). */
  private emit(): void {
    this.deps.emitTranscript?.();
  }

  private getAgentService(): ChatRuntime | null {
    return this.deps.getAgentService?.() ?? null;
  }

  private getAuxiliaryModel(): string | null {
    return this.deps.getAuxiliaryModel?.() ?? this.getAgentService()?.getAuxiliaryModel?.() ?? null;
  }

  private getActiveProviderId(): ProviderId {
    const agentService = this.getAgentService();
    const conversationId = this.deps.state.currentConversationId;
    if (!conversationId) {
      return this.deps.getTabProviderId?.() ?? agentService?.providerId ?? DEFAULT_CHAT_PROVIDER_ID;
    }

    if (agentService?.providerId) {
      return agentService.providerId;
    }

    return this.deps.plugin.getConversationSync(conversationId)?.providerId ?? DEFAULT_CHAT_PROVIDER_ID;
  }

  private getActiveCapabilities(): ProviderCapabilities {
    const providerId = this.getActiveProviderId();
    const agentService = this.getAgentService();
    if (agentService?.providerId === providerId) {
      return agentService.getCapabilities();
    }

    return ProviderRegistry.getCapabilities(providerId);
  }

  // ============================================
  // Message Sending
  // ============================================

  async sendMessage(options?: {
    editorContextOverride?: EditorSelectionContext | null;
    browserContextOverride?: BrowserSelectionContext | null;
    canvasContextOverride?: CanvasSelectionContext | null;
    content?: string;
    images?: ChatMessage['images'];
    /** Fold the unsent composer draft into a content-override send and clear the composer. */
    includeComposerDraft?: boolean;
    turnRequestOverride?: ChatTurnRequest;
  }): Promise<ProgrammaticSendResult | void> {
    const { state } = this.deps;

    // During conversation creation/switching/hydration, don't send - input is
    // preserved so the user can retry once the target conversation is ready.
    if (this.isConversationBusy()) return;

    const send = resolveComposerSend({
      inputEl: this.deps.getInputEl(),
      imageContextManager: this.deps.getImageContextManager(),
      fileContextManager: this.deps.getFileContextManager(),
      overrides: options,
    });
    const emptyResult = this.resolveEmptyComposerSend(send);
    if (emptyResult !== 'proceed') return emptyResult;

    // Check for built-in commands first (e.g., /clear, /new, /add-dir)
    const builtInCmd = detectBuiltInCommand(send.content);
    if (builtInCmd) {
      clearConsumedComposerInput(send, () => this.deps.resetInputHeight());
      await this.executeBuiltInCommand(builtInCmd.command, builtInCmd.args);
      return;
    }

    // Consume the composer EXACTLY once, up front. Reads send.content (captured at resolve), so
    // clearing the textarea now can't affect the turn built later — and consuming BEFORE the DM
    // roster read below reserves it, so a draft typed during that await isn't erased and a second
    // submit in the window reads an empty composer (no data loss / duplicate). Non-DM sends keep
    // their prior behavior: the consume is a no-op relative to the turn, and the `&&` short-circuit
    // means they never await the roster read (no added microtask).
    clearConsumedComposerInput(send, () => this.deps.resetInputHeight());

    // A Team Chat DM whose agent was deleted from the roster is read-only: block the turn (it would
    // otherwise run WITHOUT the agent's persona/model) and tell the user. The composer was reserved
    // (consumed) above, so a removed agent restores it. Self-healing: a re-created agent resumes.
    const dmAgentId = teamChatDmBoundAgentId(this.deps.plugin, this.deps.state.currentConversationId);
    if (dmAgentId && !(await confirmDmAgentOrRestoreComposer(send, dmAgentId, {
      agentRosterStore: this.deps.plugin.agentRosterStore,
      logger: this.deps.plugin.logger,
      resetInputHeight: () => this.deps.resetInputHeight(),
    }))) return;

    // Persist any pasted/dropped images to the vault BEFORE the queue branch — both the streaming-queue
    // (state.queuedMessage) and steer-then-commit paths reuse this image snapshot (else queued/steered
    // images land in ConversationStore.save with `data` cleared and no `path`). On a vault-write
    // rejection, restore the reserved composer draft and abort with a Notice — the up-front consume
    // must not silently drop the user's text (mirrors the removed-agent guard above).
    if (send.hasImages && !(await persistComposerImagesOrRestore(send, {
      app: this.deps.plugin.app,
      logger: this.deps.plugin.logger,
      resetInputHeight: () => this.deps.resetInputHeight(),
    }))) return;

    // If agent is working, queue the message instead of dropping it
    if (state.isStreaming) {
      return this.queueComposerSendWhileStreaming(send);
    }

    return this.dispatchComposerTurn(send, options);
  }

  private isConversationBusy(): boolean {
    const { state } = this.deps;
    return state.isCreatingConversation
      || state.isSwitchingConversation
      || state.isHydrating;
  }

  /**
   * Classifies an empty composer send: `'proceed'` when there is content or images to send,
   * otherwise the early result to return — an error result for a programmatic no-content send
   * (`!shouldUseInput`), or `undefined` to silently drop an empty user send. Extracted so the
   * self-contained empty-send branches don't inflate `sendMessage`'s complexity.
   */
  private resolveEmptyComposerSend(
    send: ComposerSendContext,
  ): ProgrammaticSendResult | undefined | 'proceed' {
    if (send.content || send.hasImages) return 'proceed';
    if (!send.shouldUseInput) return { ok: false, finalAssistantContent: '', error: 'No content to send' };
    return undefined;
  }

  private queueComposerSendWhileStreaming(send: ComposerSendContext): ProgrammaticSendResult {
    const {
      state,
      selectionController,
      browserSelectionController,
      canvasSelectionController,
    } = this.deps;

    const images = send.hasImages ? [...resolveComposerSourceImages(send)] : undefined;
    const editorContext = selectionController.getContext();
    const browserContext = browserSelectionController?.getContext() ?? null;
    const canvasContext = canvasSelectionController.getContext();
    const { displayContent, turnRequest } = this.buildTurnSubmission({
      content: send.content,
      images,
      editorContextOverride: editorContext,
      browserContextOverride: browserContext,
      canvasContextOverride: canvasContext,
    });
    state.queuedMessage = this.queuedMessages.mergeQueuedMessages(
      state.queuedMessage,
      this.queuedMessages.createQueuedMessage(displayContent, turnRequest),
    );

    // Pill mentions were folded into the queued turnRequest above; clear them now
    // so they don't linger in the composer after the user hits send while streaming.
    send.fileContextManager?.clearAttachedPills();

    // The composer text is consumed once in sendMessage (before this branch); images are consumed
    // here since they're read live off the manager for the queued turn above.
    if (send.shouldUseInput || send.consumesComposerDraft) {
      send.imageContextManager?.clearImages();
    }
    this.queuedMessages.updateQueueIndicator();
    // Signal "accepted but queued" so programmatic callers (Agent Board
    // follow-ups) wait for the queued turn's stream end instead of mistaking
    // this for a not-sent no-op. User-driven sends ignore the return.
    return { ok: true, finalAssistantContent: '', queued: true };
  }

  private async dispatchComposerTurn(
    send: ComposerSendContext,
    options?: ComposerTurnOptions,
  ): Promise<ProgrammaticSendResult | void> {
    // The composer is consumed once in sendMessage (before this branch), so a DM reserve doesn't
    // re-clear a draft typed during the roster await; nothing to consume here.
    // Bug — selected work-order model didn't reach the runtime: capture the
    // tab-pinned model BEFORE `ensureServiceInitialized` runs, since the tab
    // lifecycle clears `draftModel` during init. Plumbed into `query()` as
    // `queryOptions.model` so the provider's per-turn override beats the
    // global `settings.model` snapshot.
    const tabModelOverride = normalizeTabModelOverride(this.deps.getTabModelOverride?.());
    const composerRollback = captureComposerRollbackSnapshot(send);
    const streamGeneration = beginStreamingTurnState(this.deps.state, send, this.deps);

    const outgoing = this.buildOutgoingTurn(send, options);
    const { userMsg, assistantMsg, deferredAiTitleGeneration } = await this.presentOutgoingTurn(outgoing);

    const acquired = await this.acquireTurnRuntime(
      tabModelOverride,
      deferredAiTitleGeneration,
      composerRollback,
      send,
      userMsg.id,
      assistantMsg.id,
    );
    if (!acquired) return;
    const { agentService, queryOptions } = acquired;

    // Deferred from buildOutgoingTurn: mark only after the runtime is acquired.
    send.fileContextManager?.markCurrentNoteSent();

    await restoreResumeCheckpointIfNeeded(agentService, this.deps.state, this.deps.plugin);

    const ctx: DispatchedTurnContext = {
      agentService,
      send,
      turnRequest: outgoing.turnRequest,
      userMsg,
      assistantMsg,
      streamGeneration,
      tabModelOverride,
      queryOptions,
      deferredAiTitleGeneration,
    };

    let wasInterrupted = false;
    let wasInvalidated = false;
    // Set for programmatic (content-override) sends so callers like Agent Board can
    // observe the final assistant content. User-driven sends leave this undefined.
    let programmaticResult: ProgrammaticSendResult | undefined;
    try {
      const streamOutcome = await this.streamPreparedTurn(ctx);
      wasInterrupted = streamOutcome.wasInterrupted;
      wasInvalidated = streamOutcome.wasInvalidated;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.deps.streamController.appendText(
        `\n\n**Error:** ${errorMsg}`,
        this.activeStreamingAssistantMessage ?? ctx.assistantMsg,
      );
    } finally {
      programmaticResult = await this.finalizeTurn(ctx, { wasInterrupted, wasInvalidated });
    }

    return programmaticResult;
  }

  private buildOutgoingTurn(
    send: ComposerSendContext,
    options?: ComposerTurnOptions,
  ): OutgoingTurn {
    // Slash commands are passed directly to SDK for handling
    // SDK handles expansion, $ARGUMENTS, @file references, and frontmatter options.
    // Image persistence already ran above (covers queue + steer paths too).
    const images = resolveComposerSourceImages(send);
    const imagesForMessage = images.length > 0 ? [...images] : undefined;
    const isCompact = /^\/compact(\s|$)/i.test(send.content);

    // Only clear images if we consumed user input — either a plain user send or a
    // content-override send that folded the composer draft in (quick actions).
    if (send.shouldUseInput || send.consumesComposerDraft) {
      send.imageContextManager?.clearImages();
    }

    const { displayContent, turnRequest } = this.resolveTurnSubmission(send, imagesForMessage, options);

    // Remember this turn so an actionable runtime-error card can re-dispatch it
    // verbatim via retryLastTurn() (UX-F/UX-J). Cloned so later mutation of the
    // live request can't change what a retry would re-send.
    this.lastTurnSubmission = {
      turnRequest: cloneChatTurnRequest(turnRequest),
      displayContent,
      images: imagesForMessage ? [...imagesForMessage] : undefined,
    };

    // markCurrentNoteSent() is deferred to dispatchComposerTurn (post-runtime) so an init-failure rollback keeps the current-note state for retry.
    // Added file/folder pills are consumed by this turn; clear them (keeps the current note).
    send.fileContextManager?.clearAttachedPills();

    return { displayContent, turnRequest, imagesForMessage, isCompact };
  }

  private resolveTurnSubmission(
    send: ComposerSendContext,
    imagesForMessage: ChatMessage['images'],
    options?: ComposerTurnOptions,
  ): { displayContent: string; turnRequest: ChatTurnRequest } {
    if (options?.turnRequestOverride) {
      return {
        displayContent: send.content,
        turnRequest: cloneChatTurnRequest(options.turnRequestOverride),
      };
    }
    return this.buildTurnSubmission({
      content: send.content,
      images: imagesForMessage,
      editorContextOverride: options?.editorContextOverride,
      browserContextOverride: options?.browserContextOverride,
      canvasContextOverride: options?.canvasContextOverride,
    });
  }

  private async presentOutgoingTurn(outgoing: OutgoingTurn): Promise<{
    userMsg: ChatMessage;
    assistantMsg: ChatMessage;
    deferredAiTitleGeneration: (() => void) | null;
  }> {
    const { state, streamController } = this.deps;
    const { displayContent, imagesForMessage, isCompact } = outgoing;

    const userMsg = createOutgoingUserMessage(this.deps.generateId(), displayContent, imagesForMessage);
    // Pure data: `addMessage` fires onMessagesChanged → the transcript projects.
    state.addMessage(userMsg);
    state.hasPendingConversationSave = true;

    const deferredAiTitleGeneration = await this.triggerTitleGeneration();

    const assistantMsg = createAssistantPlaceholderMessage(this.deps.generateId());
    state.addMessage(assistantMsg);
    this.activeStreamingAssistantMessage = assistantMsg;
    activateStreamingAssistantMessage(state, assistantMsg);
    this.pendingProviderUserMessages = [{
      displayContent,
      images: imagesForMessage,
    }];
    this.sawInitialProviderUserMessage = false;
    this.awaitingProviderAssistantStart = true;

    streamController.showThinkingIndicator(
      isCompact ? 'Compacting...' : undefined,
      isCompact ? 'specorator-thinking--compact' : undefined,
    );
    state.responseStartTime = performance.now();
    // Project the freshly-activated stream (messageId + start time) so the Vue
    // indicator appears before the first chunk lands.
    this.emit();

    return { userMsg, assistantMsg, deferredAiTitleGeneration };
  }

  /**
   * Lazy initialization: ensure the runtime is ready AND resolve the bound-agent turn options,
   * BEFORE the first chunk. Resolving the options here (not mid-stream) is load-bearing: the strict
   * roster read now THROWS on a transient I/O error (Round-63), and a throw here reuses the
   * init-failure rollback — optimistic placeholders drop and the composer draft/pills/images are
   * restored — so the turn BLOCKS instead of running under the wrong identity (no persona/model) or
   * losing the draft to the mid-stream `**Error:**` path. A genuinely-gone agent does NOT throw
   * (options fall back to base) and runs unbound as before. Returns null to abort the send.
   */
  private async acquireTurnRuntime(
    tabModelOverride: string | null,
    deferredAiTitleGeneration: (() => void) | null,
    composerRollback: ReturnType<typeof captureComposerRollbackSnapshot>,
    send: ComposerSendContext,
    userMsgId: string,
    assistantMsgId: string,
  ): Promise<{ agentService: ChatRuntime; queryOptions: ChatRuntimeQueryOptions } | null> {
    const { state, streamController } = this.deps;
    const failAndRollback = (noticeKey: TranslationKey): null => {
      new Notice(t(noticeKey));
      streamController.hideThinkingIndicator();
      this.activeStreamingAssistantMessage = null;
      this.resetProviderMessageBoundaryState();
      deferredAiTitleGeneration?.();
      rollbackOptimisticOutgoingTurn(state, composerRollback, send, userMsgId, assistantMsgId, () => this.deps.resetInputHeight());
      this.emit();
      return null;
    };
    if (this.deps.ensureServiceInitialized) {
      const ready = await this.deps.ensureServiceInitialized();
      if (!ready) return failAndRollback('chat.input.initFailed');
    }
    const agentService = this.getAgentService();
    if (!agentService) return failAndRollback('chat.input.serviceUnavailable');

    try {
      const queryOptions = await resolveBoundAgentQueryOptions(this.deps.plugin, state.currentConversationId, tabModelOverride);
      return { agentService, queryOptions };
    } catch (error) {
      this.deps.plugin.logger.scope('input').error('bound-agent query-option resolution failed; blocking turn', error);
      return failAndRollback('chat.input.initFailed');
    }
  }

  private async streamPreparedTurn(
    ctx: DispatchedTurnContext,
  ): Promise<{ wasInterrupted: boolean; wasInvalidated: boolean }> {
    const { state, streamController } = this.deps;
    let wasInterrupted = false;
    let wasInvalidated = false;

    const preparedTurn = ctx.agentService.prepareTurn(ctx.turnRequest);
    // Fall back to request.text when persistedContent is empty (OpenCode keeps
    // content in the prompt), then refresh so the card's @mentions render.
    ctx.userMsg.content = preparedTurn.persistedContent || preparedTurn.request.text;
    ctx.userMsg.currentNote = preparedTurn.isCompact
      ? undefined
      : preparedTurn.request.currentNotePath;
    this.deps.refreshTranscriptMessage?.(ctx.userMsg.id);

    // Pass history WITHOUT current turn (userMsg + assistantMsg we just added)
    // This prevents duplication when rebuilding context for new sessions
    const previousMessages = state.messages.slice(0, -2);
    // queryOptions were resolved in acquireTurnRuntime (before the first chunk) so a strict-roster
    // read throw blocks the turn with the draft-preserving rollback, not here mid-stream.
    for await (const chunk of ctx.agentService.query(preparedTurn, previousMessages, ctx.queryOptions)) {
      if (state.streamGeneration !== ctx.streamGeneration) {
        wasInvalidated = true;
        break;
      }
      if (state.cancelRequested) {
        wasInterrupted = true;
        break;
      }

      if (await this.handleProviderMessageBoundaryChunk(chunk)) {
        continue;
      }

      await streamController.handleStreamChunk(
        chunk,
        this.activeStreamingAssistantMessage ?? ctx.assistantMsg,
      );
    }

    return { wasInterrupted, wasInvalidated };
  }

  private async finalizeTurn(
    ctx: DispatchedTurnContext,
    flags: { wasInterrupted: boolean; wasInvalidated: boolean },
  ): Promise<ProgrammaticSendResult | undefined> {
    const { state } = this.deps;
    const finalAssistantMsg = this.activeStreamingAssistantMessage ?? ctx.assistantMsg;
    const turnMetadata = ctx.agentService.consumeTurnMetadata();
    ctx.userMsg.userMessageId = turnMetadata.userMessageId ?? ctx.userMsg.userMessageId;
    finalAssistantMsg.assistantMessageId = turnMetadata.assistantMessageId ?? finalAssistantMsg.assistantMessageId;

    // ALWAYS clear the timer interval, even on stream invalidation (prevents memory leaks)
    state.clearFlavorTimerInterval();

    let programmaticResult: ProgrammaticSendResult | undefined;
    // Skip remaining cleanup if stream was invalidated (tab closed or conversation switched)
    if (!flags.wasInvalidated && state.streamGeneration === ctx.streamGeneration) {
      programmaticResult = await this.completeFinishedTurn(ctx, {
        finalAssistantMsg,
        turnMetadata,
        didEnqueueToSdk: turnMetadata.wasSent === true,
        planCompleted: turnMetadata.planCompleted === true,
        wasInterrupted: flags.wasInterrupted,
      });
    }

    if (flags.wasInvalidated) {
      this.queuedMessages.clearPendingSteerState();
      this.queuedMessages.updateQueueIndicator();
    }

    this.activeStreamingAssistantMessage = null;
    this.resetProviderMessageBoundaryState();
    ctx.deferredAiTitleGeneration?.();
    return programmaticResult;
  }

  private async completeFinishedTurn(
    ctx: DispatchedTurnContext,
    turn: FinishedTurn,
  ): Promise<ProgrammaticSendResult | undefined> {
    const { state, streamController, conversationController } = this.deps;
    const { finalAssistantMsg } = turn;
    const didCancelThisTurn = turn.wasInterrupted || state.cancelRequested;
    if (didCancelThisTurn && !state.pendingNewSessionPlan) {
      await streamController.appendText(
        '\n\n<span class="specorator-interrupted">Interrupted</span> <span class="specorator-interrupted-hint">· What should Specorator do instead?</span>',
        finalAssistantMsg,
      );
    }
    streamController.hideThinkingIndicator();
    state.isStreaming = false;
    state.cancelRequested = false;
    this.queuedMessages.restorePendingSteerMessageToQueue();

    // Capture response duration before resetting state (skip for interrupted responses and compaction)
    bakeResponseDurationFooter(state, finalAssistantMsg, didCancelThisTurn);

    state.currentContentEl = null;
    // The turn is over; drop the reactive-stream message pointer so the snapshot
    // reads null. `activeBlockIndex` is left for the finalize calls below to
    // close their open block, then reset.
    state.activeMessageId = null;

    await streamController.finalizeCurrentThinkingBlock(finalAssistantMsg);
    await streamController.finalizeCurrentTextBlock(finalAssistantMsg);
    // The finalize calls above mutate `finalAssistantMsg` in place (interrupted
    // marker / `**Error:**` / a collapsed response's withheld body) AFTER
    // `activeMessageId` was cleared, so the active-message identity refresh no
    // longer covers it; mark it dirty or a keyed MessageBubble reuses the same
    // object and hides the finalized text until reload.
    this.deps.refreshTranscriptMessage?.(finalAssistantMsg.id);
    this.deps.getSubagentManager().resetStreamingState();

    let programmaticResult: ProgrammaticSendResult | undefined;
    if (!ctx.send.shouldUseInput) {
      programmaticResult = didCancelThisTurn
        ? { ok: false, finalAssistantContent: finalAssistantMsg.content, error: 'Canceled' }
        : { ok: true, finalAssistantContent: finalAssistantMsg.content };
    }

    // Auto-hide completed todo panel on response end
    // Panel reappears only when new TodoWrite tool is called
    if (state.currentTodos && state.currentTodos.every(t => t.status === 'completed')) {
      state.currentTodos = null;
    }
    this.syncScrollToBottomAfterRenderUpdates();

    // approve-new-session: the tool_result chunk is dropped because cancelRequested
    // was set before the stream loop could process it — manually set the result so
    // the saved conversation renders correctly when revisited
    completeApprovedNewSessionPlanToolCalls(state, finalAssistantMsg);

    // Persist usage and message state BEFORE the plan-approval branches. This ensures
    // a cancelled stream still saves the last usage chunk; without this, cancellation
    // during the post-plan approval await (or any future invalidated branch) would
    // drop `state.usage` on the floor. updateLastResponse=false on cancel keeps the
    // partial assistant content from being claimed as a finished response, while
    // state.usage and message state still land in the meta file.
    // Only clear resumeAtMessageId if enqueue succeeded; preserve checkpoint on failure for retry.
    const saveExtras = turn.didEnqueueToSdk ? { resumeAtMessageId: undefined } : undefined;
    await conversationController.save(!didCancelThisTurn, saveExtras);

    await this.runPostTurnFollowUps(ctx, turn, didCancelThisTurn);
    return programmaticResult;
  }

  private async runPostTurnFollowUps(
    ctx: DispatchedTurnContext,
    turn: FinishedTurn,
    didCancelThisTurn: boolean,
  ): Promise<void> {
    const { state } = this.deps;

    // Provider-agnostic post-plan approval: show UI and await decision before auto-send
    const approval = await this.resolvePlanApprovalOutcome(ctx, turn, didCancelThisTurn);
    if (approval.invalidated) return;

    // The leading save above already wrote message state and usage. Plan-approval
    // branches re-run sendMessage() (auto-implement / approve-new-session — both
    // call sendMessage which saves itself) or just update the input UI (revise /
    // cancel) — neither needs an extra save here.

    // Per-message actions (rewind/fork/work-order) are Vue-side now, resolved
    // live through `TranscriptCallbacks.getMessageActions`; no imperative refresh.
    this.emit();

    // Auto-implement takes precedence over both approve-new-session and queued input
    if (approval.autoSendContent) {
      this.autoResumeWith(approval.autoSendContent);
    } else if (turn.turnMetadata.autoFollowUpText && !didCancelThisTurn && !turn.planCompleted) {
      // Cursor's one-shot AskUserQuestion answer, resumed as a follow-up — only when no plan
      // completed, since each plan-approval outcome owns it (implement merges, revise/cancel hold).
      this.autoResumeWith(turn.turnMetadata.autoFollowUpText);
    } else {
      // approve-new-session: create fresh conversation and send plan content
      // Must be inside the invalidation guard — if the tab was closed or
      // conversation switched, we must not create a new session on stale state.
      const planContent = state.pendingNewSessionPlan;
      if (planContent) {
        state.pendingNewSessionPlan = null;
        await this.resumeApprovedPlanFromExitMode(planContent);
      } else if (approval.shouldProcessQueuedMessage) {
        this.queuedMessages.processQueuedMessage();
      }
    }
  }

  /**
   * Implements an "Approve (new session)" exit-plan decision. On the sidebar it does
   * what the label says — a fresh conversation, then the plan auto-resumes there. On a
   * Team Chat DM (one fixed thread per agent) a new session would UNBIND the DM and leak
   * the transcript into ordinary chat history, so the approved plan is implemented in
   * THIS thread instead (surface-scoped; the sidebar path is byte-identical to before).
   */
  private async resumeApprovedPlanFromExitMode(planContent: string): Promise<void> {
    if (!isTeamChatSurfaceConversation(this.deps.plugin, this.deps.state.currentConversationId)) {
      await this.deps.conversationController.createNew();
    }
    this.autoResumeWith(planContent);
  }

  private async resolvePlanApprovalOutcome(
    ctx: DispatchedTurnContext,
    turn: FinishedTurn,
    didCancelThisTurn: boolean,
  ): Promise<PlanApprovalOutcome> {
    if (!turn.planCompleted || didCancelThisTurn) {
      return { autoSendContent: null, invalidated: false, shouldProcessQueuedMessage: true };
    }

    const { decision, invalidated } = await this.inlinePrompts.showPlanApproval();

    // Re-check invalidation after async approval prompt
    if (this.deps.state.streamGeneration !== ctx.streamGeneration || invalidated) {
      return { autoSendContent: null, invalidated: true, shouldProcessQueuedMessage: true };
    }

    return applyPlanApprovalDecision(decision, turn.turnMetadata, this.deps);
  }

  /**
   * Seeds the composer with draft text WITHOUT sending. Used by the library
   * "prompt as draft" flows (loops) so the user can append a task before
   * sending. Fires an `input` event so autosize/validation update, and focuses
   * the composer so the user lands on the seeded draft (the target tab may not
   * be visually obvious). With `keepExisting`, a non-empty existing draft is
   * preserved above the seeded content rather than clobbered.
   */
  seedComposerDraft(content: string, opts?: { keepExisting?: boolean }): void {
    const el = this.deps.getInputEl();
    const existing = opts?.keepExisting ? el.value.trim() : '';
    el.value = existing ? `${existing}\n\n${content}` : content;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  /** Auto-sends `content` as the next (resumed) turn — shared by plan auto-implement,
   * approve-new-session, and Cursor's AskUserQuestion answer follow-up. */
  private autoResumeWith(content: string): void {
    this.seedComposerDraft(content);
    this.sendMessage().catch((err: unknown) => {
      this.deps.plugin.logger.scope('input').error('sendMessage failed unexpectedly', err);
    });
  }

  /** Whether a previously-dispatched turn is available to retry. */
  hasRetryableTurn(): boolean {
    return this.lastTurnSubmission !== null;
  }

  /**
   * Drops the retained last-turn submission so a runtime-error card rendered
   * after a conversation load/switch has nothing to retry. Without this the
   * retained turn survives a conversation switch (the InputController is per-tab,
   * not per-conversation), so a reloaded/persisted `runtime_error` card would
   * either no-op (nothing dispatched yet this session) or silently re-dispatch
   * the previous conversation's turn.
   */
  clearRetryableTurn(): void {
    this.lastTurnSubmission = null;
  }

  /**
   * Re-dispatches the last turn after a runtime error (UX-F/UX-J). Reuses the
   * normal {@link sendMessage} path via `turnRequestOverride`, so the retry runs
   * through the same prepare/query/stream plumbing — not a fabricated send path.
   * No-ops while streaming or when there is nothing to retry.
   */
  retryLastTurn(): void {
    const last = this.lastTurnSubmission;
    if (!last || this.deps.state.isStreaming) return;

    void this.sendMessage({
      content: last.displayContent,
      images: last.images,
      turnRequestOverride: last.turnRequest,
    }).catch((err: unknown) => {
      this.deps.plugin.logger.scope('input').error('retryLastTurn failed unexpectedly', err);
    });
  }

  // ============================================
  // Queue Management
  // ============================================
  //
  // The queued-message / steering state machine lives in QueuedMessageController.
  // These thin delegates preserve the public entry points other code calls
  // (StreamController, ConversationController, tab wiring, UI).

  updateQueueIndicator(): void {
    this.queuedMessages.updateQueueIndicator();
  }

  clearQueuedMessage(): void {
    this.queuedMessages.clearQueuedMessage();
  }

  private restorePendingMessagesToInput(): void {
    this.queuedMessages.restorePendingMessagesToInput();
  }

  private processQueuedMessage(): void {
    this.queuedMessages.processQueuedMessage();
  }

  private buildTurnSubmission(options: {
    content: string;
    images?: ChatMessage['images'];
    editorContextOverride?: EditorSelectionContext | null;
    browserContextOverride?: BrowserSelectionContext | null;
    canvasContextOverride?: CanvasSelectionContext | null;
  }): {
    displayContent: string;
    turnRequest: ChatTurnRequest;
  } {
    const {
      selectionController,
      browserSelectionController,
      canvasSelectionController,
    } = this.deps;

    const fileContextManager = this.deps.getFileContextManager();
    const mcpServerSelector = this.deps.getMcpServerSelector();
    const externalContextSelector = this.deps.getExternalContextSelector();

    const currentNotePath = fileContextManager?.getCurrentNotePath() || null;
    const shouldSendCurrentNote = fileContextManager?.shouldSendCurrentNote(currentNotePath) ?? false;

    const editorContext = options.editorContextOverride !== undefined
      ? options.editorContextOverride
      : selectionController.getContext();
    const browserContext = options.browserContextOverride !== undefined
      ? options.browserContextOverride
      : (browserSelectionController?.getContext() ?? null);
    const canvasContext = options.canvasContextOverride !== undefined
      ? options.canvasContextOverride
      : canvasSelectionController.getContext();

    const externalContextPaths = externalContextSelector?.getExternalContexts();
    const attachedFiles = fileContextManager?.getAttachedFiles?.() ?? [];
    const resolvedExternalPaths = filterRedundantExternalContextPaths(
      dedupeExternalContextPaths(externalContextPaths),
      attachedFiles,
    );
    const isCompact = /^\/compact(\s|$)/i.test(options.content);
    // Fold pill mentions (attached files/folders) into the content sent to the provider.
    // getAttachedMentionSuffix() already excludes the current note; /compact must pass
    // through unchanged so the provider recognises its built-in command.
    const mentionSuffix = !isCompact && fileContextManager
      ? fileContextManager.getAttachedMentionSuffix()
      : '';
    const foldedContent = options.content + mentionSuffix;
    const transformedText = !isCompact && fileContextManager
      ? fileContextManager.transformContextMentions(foldedContent)
      : options.content;
    const enabledMcpServers = mcpServerSelector?.getEnabledServers();


    return {
      displayContent: options.content,
      turnRequest: {
        text: transformedText,
        images: options.images,
        currentNotePath: shouldSendCurrentNote && currentNotePath ? currentNotePath : undefined,
        editorSelection: editorContext,
        browserSelection: browserContext,
        canvasSelection: canvasContext,
        externalContextPaths: resolvedExternalPaths,
        enabledMcpServers: enabledMcpServers && enabledMcpServers.size > 0
          ? enabledMcpServers
          : undefined,
      },
    };
  }

  private resetProviderMessageBoundaryState(): void {
    this.pendingProviderUserMessages = [];
    this.sawInitialProviderUserMessage = false;
    this.awaitingProviderAssistantStart = false;
  }

  private async handleProviderMessageBoundaryChunk(chunk: StreamChunk): Promise<boolean> {
    switch (chunk.type) {
      case 'user_message_start':
        await this.handleProviderUserMessageStart(chunk);
        return true;
      case 'assistant_message_start':
        await this.handleProviderAssistantMessageStart();
        return true;
      default:
        return false;
    }
  }

  private async handleProviderUserMessageStart(
    chunk: Extract<StreamChunk, { type: 'user_message_start' }>,
  ): Promise<void> {
    const expected = this.pendingProviderUserMessages.shift();
    if (!this.sawInitialProviderUserMessage) {
      this.sawInitialProviderUserMessage = true;
      return;
    }

    this.queuedMessages.clearPendingSteerState();
    this.queuedMessages.updateQueueIndicator();

    const previousAssistant = this.activeStreamingAssistantMessage;
    const shouldDiscardPlaceholder = this.shouldDiscardPendingAssistantPlaceholder(previousAssistant);
    if (previousAssistant) {
      if (shouldDiscardPlaceholder) {
        discardStreamingAssistantMessage(this.deps.state, previousAssistant.id);
      } else {
        await this.deps.streamController.finalizeCurrentThinkingBlock(previousAssistant);
        await this.deps.streamController.finalizeCurrentTextBlock(previousAssistant);
      }
    }
    this.deps.streamController.hideThinkingIndicator();

    const displayContent = expected?.displayContent ?? chunk.content;
    const persistedContent = expected?.persistedContent ?? displayContent;
    const images = expected?.images;
    if (displayContent || (images?.length ?? 0) > 0) {
      const userMessage: ChatMessage = {
        id: this.deps.generateId(),
        role: 'user',
        content: persistedContent,
        displayContent,
        timestamp: Date.now(),
        currentNote: expected?.currentNote,
        images,
      };
      this.deps.state.addMessage(userMessage);
    }

    const assistantMessage = createAssistantPlaceholderMessage(this.deps.generateId());
    this.deps.state.addMessage(assistantMessage);
    this.activeStreamingAssistantMessage = assistantMessage;
    activateStreamingAssistantMessage(this.deps.state, assistantMessage);
    this.deps.streamController.showThinkingIndicator();
    this.deps.state.responseStartTime = performance.now();
    this.awaitingProviderAssistantStart = true;
    this.emit();
  }

  private async handleProviderAssistantMessageStart(): Promise<void> {
    if (this.awaitingProviderAssistantStart) {
      this.awaitingProviderAssistantStart = false;
      return;
    }

    const previousAssistant = this.activeStreamingAssistantMessage;
    if (previousAssistant) {
      await this.deps.streamController.finalizeCurrentThinkingBlock(previousAssistant);
      await this.deps.streamController.finalizeCurrentTextBlock(previousAssistant);
    }

    const assistantMessage = createAssistantPlaceholderMessage(this.deps.generateId());
    this.deps.state.addMessage(assistantMessage);
    this.activeStreamingAssistantMessage = assistantMessage;
    activateStreamingAssistantMessage(this.deps.state, assistantMessage);
    this.deps.streamController.showThinkingIndicator();
    this.emit();
  }

  private shouldDiscardPendingAssistantPlaceholder(message: ChatMessage | null): boolean {
    return this.awaitingProviderAssistantStart
      && !!message
      && !message.content.trim()
      && (message.toolCalls?.length ?? 0) === 0
      && (message.contentBlocks?.length ?? 0) === 0;
  }

  // ============================================
  // Title Generation
  // ============================================

  /**
   * Triggers AI title generation after first user message.
   * Handles setting fallback title, firing async generation, and updating UI.
   */
  private async triggerTitleGeneration(): Promise<(() => void) | null> {
    const { plugin, state, conversationController } = this.deps;

    if (state.messages.length !== 1) {
      return null;
    }

    if (!state.currentConversationId) {
      const sessionId = this.getAgentService()?.getSessionId() ?? undefined;
      const boundAgentId = this.deps.getBoundAgentId?.() ?? undefined;
      const conversation = await plugin.createConversation({
        providerId: this.getActiveProviderId(),
        sessionId,
        boundAgentId,
      });
      state.currentConversationId = conversation.id;
    }

    // Find first user message by role (not by index)
    const firstUserMsg = state.messages.find(m => m.role === 'user');

    if (!firstUserMsg) {
      return null;
    }

    const userContent = firstUserMsg.displayContent || firstUserMsg.content;

    // Set immediate fallback title
    const fallbackTitle = conversationController.generateFallbackTitle(userContent);
    await plugin.renameConversation(state.currentConversationId, fallbackTitle);

    if (!plugin.settings.enableAutoTitleGeneration) {
      return null;
    }

    // Fire async AI title generation only if service available
    const titleService = this.deps.getTitleGenerationService();
    if (!titleService) {
      // No titleService, just keep the fallback title with no status
      return null;
    }

    // Mark as pending only when we're actually starting generation
    await plugin.updateConversation(state.currentConversationId, { titleGenerationStatus: 'pending' });
    plugin.events.emit('conversation:title-status-changed', { conversationId: state.currentConversationId });

    const convId = state.currentConversationId;
    const expectedTitle = fallbackTitle; // Store to check if user renamed during generation

    return () => {
      titleService.generateTitle(
        convId,
        userContent,
        (conversationId, result) => applyTitleGenerationResult(plugin, conversationId, expectedTitle, result),
      ).catch(() => {
        // Silently ignore title generation errors
      });
    };
  }

  // ============================================
  // Streaming Control
  // ============================================

  cancelStreaming(): void {
    const { state, streamController } = this.deps;
    if (!state.isStreaming) return;
    state.cancelRequested = true;
    // Restore queued message to input instead of discarding
    this.restorePendingMessagesToInput();
    this.getAgentService()?.cancel();
    streamController.hideThinkingIndicator();
  }

  private syncScrollToBottomAfterRenderUpdates(): void {
    const { plugin, state } = this.deps;
    if (!(plugin.settings.enableAutoScroll ?? true)) return;
    if (!state.autoScrollEnabled) return;

    window.requestAnimationFrame(() => {
      if (!(this.deps.plugin.settings.enableAutoScroll ?? true)) return;
      if (!this.deps.state.autoScrollEnabled) return;

      const messagesEl = this.deps.getMessagesEl();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ============================================
  // Instruction Mode
  // ============================================

  async handleInstructionSubmit(rawInstruction: string): Promise<void> {
    const instructionRefineService = this.deps.getInstructionRefineService();
    if (!instructionRefineService) return;

    await runInstructionRefineFlow(rawInstruction, {
      plugin: this.deps.plugin,
      instructionRefineService,
      instructionModeManager: this.deps.getInstructionModeManager(),
      getAuxiliaryModel: () => this.getAuxiliaryModel(),
    });
  }

  // ============================================
  // Approval Dialogs
  // ============================================

  handleApprovalRequest(
    toolName: string,
    input: Record<string, unknown>,
    description: string,
    approvalOptions?: ApprovalCallbackOptions,
  ): Promise<ApprovalDecision> {
    return this.inlinePrompts.handleApprovalRequest(toolName, input, description, approvalOptions);
  }

  handleAskUserQuestion(
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, string | string[]> | null> {
    return this.inlinePrompts.handleAskUserQuestion(input, signal);
  }

  handleExitPlanMode(
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ExitPlanModeDecision | null> {
    return this.inlinePrompts.handleExitPlanMode(input, signal);
  }

  dismissPendingApprovalPrompt(): void {
    this.inlinePrompts.dismissPendingApprovalPrompt();
  }

  dismissPendingApproval(): void {
    this.inlinePrompts.dismissPendingApproval();
  }

  // ============================================
  // Built-in Commands
  // ============================================

  /**
   * `/clear` starts a fresh conversation — but on a Team Chat DM (one fixed thread per
   * agent) that would mint an unbound conversation and leak into ordinary chat history,
   * so it is disabled there. Extracted from the command switch to keep that gate's branch
   * out of the already-complex `executeBuiltInCommand`.
   */
  private async runClearCommand(): Promise<void> {
    if (isTeamChatSurfaceConversation(this.deps.plugin, this.deps.state.currentConversationId)) {
      new Notice(t('teamChat.actionUnavailableInDm'));
      return;
    }
    await this.deps.conversationController.createNew();
  }

  private async executeBuiltInCommand(command: BuiltInCommand, args: string): Promise<void> {
    const capabilities = this.getActiveCapabilities();

    if (!isBuiltInCommandSupported(command, capabilities)) {
      new Notice(t('chat.input.commandUnsupported', { command: command.name }));
      return;
    }

    switch (command.action) {
      case 'clear':
        await this.runClearCommand();
        break;
      case 'add-dir': {
        const externalContextSelector = this.deps.getExternalContextSelector();
        if (!externalContextSelector) {
          new Notice(t('chat.input.externalContextUnavailable'));
          return;
        }
        const result = externalContextSelector.addExternalContext(args);
        if (result.success) {
          new Notice(t('chat.input.externalContextAdded', { path: result.normalizedPath }));
        } else {
          new Notice(result.error);
        }
        break;
      }
      case 'resume':
        this.resumeDropdown.show();
        break;
      case 'fork': {
        if (!this.getActiveCapabilities().supportsFork) {
          new Notice(t('chat.input.forkUnsupported'));
          return;
        }
        if (!this.deps.onForkAll) {
          new Notice(t('chat.input.forkUnavailable'));
          return;
        }
        await this.deps.onForkAll();
        break;
      }
      default: {
        // Unknown command - notify user
        const unknownAction = typeof (command as { action?: unknown }).action === 'string'
          ? (command as { action: string }).action
          : 'unknown';
        new Notice(t('chat.input.unknownCommand', { command: unknownAction }));
        break;
      }
    }
  }

  // ============================================
  // Resume Session Dropdown
  // ============================================

  handleResumeKeydown(e: KeyboardEvent): boolean {
    return this.resumeDropdown.handleKeydown(e);
  }

  isResumeDropdownVisible(): boolean {
    return this.resumeDropdown.isVisible();
  }

  destroyResumeDropdown(): void {
    this.resumeDropdown.destroy();
  }
}
