import { Notice } from 'obsidian';

import type { ConversationSwitchResult, TitleGenerationService } from '../../../core/providers/types';
import { isHydrationCommitReady } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { ChatRewindMode } from '../../../core/runtime/types';
import type { ChatMessage, Conversation } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { confirm } from '../../../shared/modals/ConfirmModal';
import { cleanupThinkingBlock } from '../rendering/ThinkingBlockRenderer';
import type { SubagentManager } from '../services/SubagentManager';
import type { ChatState } from '../state/ChatState';
import { ConversationHistoryView, type HistoryRenderOptions } from '../ui/ConversationHistoryView';
import type { FileContextManager } from '../ui/FileContext';
import type { ImageContextManager } from '../ui/ImageContext';
import type { ExternalContextSelector, McpServerSelector } from '../ui/InputToolbar';
import type { StatusPanel } from '../ui/StatusPanel';
import { deriveEditedFilesFromMessages } from '../utils/editedFiles';
import {
  captureComposerSwitchDraft,
  type ComposerSwitchDraftSnapshot,
  restoreComposerSwitchDraft,
} from './composerSendPhases';
import {
  resolveRewindTarget,
  rewindConfirmMessage,
  rewindSaveFailedNotice,
  rewindSuccessNotice,
  runRewind,
} from './rewindHelpers';
import {
  buildConversationUpdates,
  collectSaveSelections,
  ensureConversationForSave,
  resolveSessionUpdates,
} from './saveHelpers';

export type { HistoryConversationOpenState } from '../ui/ConversationHistoryView';

export interface ConversationCallbacks {
  onNewConversation?: () => void;
  onConversationLoaded?: () => void;
  onConversationSwitched?: () => void;
}

export interface ConversationControllerDeps {
  plugin: SpecoratorPlugin;
  state: ChatState;
  subagentManager: SubagentManager;
  /** Pushes the welcome greeting into the Vue transcript store (empty hides it). */
  setTranscriptGreeting: (greeting: string) => void;
  /** Sets/clears the hydration spinner text in the Vue transcript store. */
  setTranscriptLoading: (loadingText: string | null) => void;
  /** Sets/clears the history-hydration failure banner in the Vue transcript store. */
  setTranscriptHydrationError: (error: { code: string; message: string } | null) => void;
  /** Re-projects the Vue transcript from the current ChatState snapshot. */
  emitTranscript?: () => void;
  getHistoryDropdown: () => HTMLElement | null;
  getMessagesEl: () => HTMLElement;
  getInputEl: () => HTMLTextAreaElement;
  getFileContextManager: () => FileContextManager | null;
  getImageContextManager: () => ImageContextManager | null;
  getMcpServerSelector: () => McpServerSelector | null;
  getExternalContextSelector: () => ExternalContextSelector | null;
  clearQueuedMessage: () => void;
  /** Drops the retained retryable turn when (re)binding/switching conversations. */
  clearRetryableTurn: () => void;
  getTitleGenerationService: () => TitleGenerationService | null;
  getStatusPanel: () => StatusPanel | null;
  getAgentService?: () => ChatRuntime | null;
  ensureServiceForConversation?: (conversation: Conversation | null) => Promise<void>;
  dismissPendingInlinePrompts?: () => void;
  /** Returns and clears a hydration failure recorded for the conversation while it was being opened. */
  consumePendingHydrationError?: (conversationId: string) => { code: string; message: string } | null;
  /**
   * Resolves the work-order note path linked to this tab's current conversation,
   * if any. Wired to `tab.workOrderPath` so `save()` can persist it on the
   * durable `Conversation` and let the chat-display splitter re-fire after
   * reopen/restart. Returns `null` for normal (non-work-order) tabs.
   */
  getWorkOrderPath?: () => string | null;
}

type SaveOptions = {
  resumeAtMessageId?: string;
};

export class ConversationController {
  private deps: ConversationControllerDeps;
  private callbacks: ConversationCallbacks;
  /**
   * Tracks the in-flight transcript hydration so a follow-up tab switch can
   * cancel the previous load instead of letting two hydrations race for the
   * same renderer. Null when no hydration is active.
   */
  private hydrationAbort: AbortController | null = null;
  /**
   * Resolves when the active hydration's post-load restore lands (or aborts).
   * Exposed via {@link whenHydrated} for tests and integration code that need
   * to observe the post-hydrate state. Null when no hydration is in flight.
   */
  private hydrationPromise: Promise<void> | null = null;
  /** Conversation currently being hydrated by {@link hydrationPromise}. */
  private pendingHydrationId: string | null = null;
  /** Outgoing composer draft held until target hydration commits or fails. */
  private pendingSwitchDraft: ComposerSwitchDraftSnapshot | null = null;
  private lifecycleGeneration = 0;
  private historyView: ConversationHistoryView;

  constructor(deps: ConversationControllerDeps, callbacks: ConversationCallbacks = {}) {
    this.deps = deps;
    this.callbacks = callbacks;
    this.historyView = new ConversationHistoryView({
      plugin: deps.plugin,
      state: deps.state,
      // Read the getters live off `this.deps` so callers that swap them after
      // construction (and tests that do) see the current value, matching the
      // pre-extraction `this.deps.X()` reads.
      getHistoryDropdown: () => this.deps.getHistoryDropdown(),
      getTitleGenerationService: () => this.deps.getTitleGenerationService(),
      onSelectConversation: (id) => this.switchTo(id),
      onReloadAfterActiveDelete: () => this.loadActive(),
    });
  }

  /** Aborts in-flight hydration and invalidates late async callbacks. */
  dispose(): void {
    this.lifecycleGeneration += 1;
    this.cancelPendingHydration();
  }

  /**
   * Aborts any in-flight background hydration (`switchTo`'s Phase B) and clears
   * its bookkeeping so a late `hydrateAndRender` cannot rebind the tab to the
   * superseded conversation. Used by reset (New Chat) and re-switch paths.
   */
  private cancelPendingHydration(): void {
    this.hydrationAbort?.abort();
    this.hydrationAbort = null;
    this.hydrationPromise = null;
    this.pendingHydrationId = null;
    this.deps.state.isHydrating = false;
  }

  private getAgentService(): ChatRuntime | null {
    return this.deps.getAgentService?.() ?? null;
  }

  /**
   * Clears per-conversation state back to the entry point (no conversation)
   * and resets the agent service session. Passes persistent paths so stale
   * external contexts don't leak into the next conversation.
   */
  private resetToEntryPointState(): void {
    const { plugin, state } = this.deps;
    state.currentConversationId = null;
    state.clearMessages();
    state.usage = null;
    state.currentTodos = null;
    state.clearEditedFiles();
    state.pendingNewSessionPlan = null;
    state.planFilePath = null;
    state.prePlanPermissionMode = null;
    state.autoScrollEnabled = plugin.settings.enableAutoScroll ?? true;
    state.hasPendingConversationSave = false;

    this.getAgentService()?.syncConversationState(
      null,
      plugin.settings.persistentExternalContextPaths || []
    );
  }

  /**
   * Rebuilds the "files changed by the agent" strip from the current transcript,
   * honoring the opt-out: when `showAgentEditedFiles` is disabled the list is
   * cleared instead, so opting out also suppresses it on reload/switch (matching
   * the live-recording skip in StreamController).
   */
  private rebuildEditedFiles(): void {
    const { plugin, state } = this.deps;
    if (plugin.settings.showAgentEditedFiles === false) {
      state.clearEditedFiles();
      return;
    }
    state.setEditedFiles(deriveEditedFilesFromMessages(plugin.app, state.messages));
  }

  // ============================================
  // Conversation Lifecycle
  // ============================================

  /**
   * Resets to entry point state (New Chat).
   *
   * Entry point is a blank UI state - no conversation is created until the
   * first message is sent. This prevents empty conversations cluttering history.
   */
  async createNew(options: { force?: boolean } = {}): Promise<void> {
    const { plugin, state, subagentManager } = this.deps;
    const force = !!options.force;
    if (state.isStreaming && !force) return;
    if (state.isCreatingConversation) return;
    if (state.isSwitchingConversation) return;

    // Set flag to block message sending during reset
    state.isCreatingConversation = true;

    try {
      this.deps.dismissPendingInlinePrompts?.();

      // Abort an in-flight switchTo hydration so its late restoreConversation
      // can't rebind this tab over the blank New Chat we're building. Drop the
      // abandoned switch's draft too: New Chat blanks the composer, so leaving it
      // would make the next switchTo skip capturing and restore a stale draft.
      this.cancelPendingHydration();
      this.pendingSwitchDraft = null;

      if (force && state.isStreaming) {
        state.cancelRequested = true;
        state.bumpStreamGeneration();
        this.getAgentService()?.cancel();
      }

      // Save current conversation if it has messages
      if (state.currentConversationId && state.messages.length > 0) {
        await this.save();
      }

      subagentManager.orphanAllActive();
      subagentManager.clear();

      // Clear streaming state and related DOM references
      cleanupThinkingBlock(state.currentThinkingState);
      state.currentContentEl = null;
      state.currentTextEl = null;
      state.currentTextContent = '';
      state.currentThinkingState = null;
      state.isStreaming = false;

      // Reset to entry point state - no conversation created yet
      this.resetToEntryPointState();

      // The Vue transcript owns the message list + welcome banner; clearing
      // `state.messages` (above) re-projects an empty transcript, and this shows
      // the welcome greeting again. Never `.empty()` the Vue-owned scroll host.
      this.deps.setTranscriptGreeting(this.getGreeting());

      // Remount StatusPanel to restore state for new conversation
      this.deps.getStatusPanel()?.remount();

      this.deps.getInputEl().value = '';

      const fileCtx = this.deps.getFileContextManager();
      fileCtx?.resetForNewConversation();
      fileCtx?.autoAttachActiveFile();

      this.deps.getImageContextManager()?.clearImages();
      this.deps.getMcpServerSelector()?.clearEnabled();
      // Pass current settings to ensure we have the most up-to-date persistent paths
      this.deps.getExternalContextSelector()?.clearExternalContexts(
        plugin.settings.persistentExternalContextPaths || []
      );
      this.deps.clearQueuedMessage();
      this.deps.clearRetryableTurn();

      this.callbacks.onNewConversation?.();
    } finally {
      state.isCreatingConversation = false;
    }
  }

  /**
   * Loads the current tab conversation, or starts at entry point if none.
   *
   * Entry point (no conversation) shows welcome screen without
   * creating a conversation. Conversation is created lazily on first message.
   */
  async loadActive(): Promise<void> {
    const { plugin, state } = this.deps;

    const conversationId = state.currentConversationId;
    // A (re)loaded transcript has no genuinely retryable turn: any persisted
    // runtime-error card it renders must not retry a stale/previous-session turn.
    this.deps.clearRetryableTurn();
    // Clear any stale failure banner/pending failure before hydrating; a fresh
    // failure re-arms it via the hydrate below and renders in restoreConversation.
    this.deps.setTranscriptHydrationError(null);
    if (conversationId) this.deps.consumePendingHydrationError?.(conversationId);
    const conversation = conversationId ? await plugin.getConversationById(conversationId) : null;

    // No active conversation - start at entry point
    if (!conversation) {
      this.resetToEntryPointState();

      const fileCtx = this.deps.getFileContextManager();
      fileCtx?.resetForNewConversation();
      fileCtx?.autoAttachActiveFile();

      // Initialize external contexts with persistent paths from settings
      this.deps.getExternalContextSelector()?.clearExternalContexts(
        plugin.settings.persistentExternalContextPaths || []
      );

      this.deps.getMcpServerSelector()?.clearEnabled();

      // Entry point: empty transcript + welcome greeting (Vue-owned).
      this.deps.setTranscriptLoading(null);
      this.deps.setTranscriptGreeting(this.getGreeting());

      this.callbacks.onConversationLoaded?.();
      return;
    }

    // Land the transcript before provider bind so a bind failure cannot leave the
    // pane empty after the hydration spinner clears.
    this.restoreConversation(conversation, { autoAttachFile: true });
    try {
      await this.deps.ensureServiceForConversation?.(conversation);
    } catch {
      // Best-effort bind after reload; the transcript is already visible.
    }
    this.updateWelcomeVisibility();

    this.callbacks.onConversationLoaded?.();
  }

  /** Switches to a different conversation. */
  async switchTo(id: string): Promise<void> {
    const { state, subagentManager } = this.deps;

    // Keep one live load per target. Re-selecting an empty conversation while
    // its hydration is already running must not abort and restart that same
    // request — provider history services may still be finishing the first load.
    if (this.hydrationPromise && this.pendingHydrationId === id) {
      return;
    }
    if (id === state.currentConversationId && state.messages.length > 0) {
      return;
    }
    if (state.isStreaming) return;
    if (state.isSwitchingConversation) return;
    if (state.isCreatingConversation) return;

    // Cancel this caller's prior hydration wait so its result cannot land in
    // the tab. The history service may finish a shared provider read for other
    // callers, but this controller drops the superseded result.
    this.cancelPendingHydration();

    state.isSwitchingConversation = true;
    try {
      this.deps.dismissPendingInlinePrompts?.();
      // Drop any prior failure banner (and stale pending failure) before
      // hydrating the target conversation; a fresh failure re-arms it via the
      // hydrate below and is rendered in restoreConversation.
      this.deps.setTranscriptHydrationError(null);
      this.deps.consumePendingHydrationError?.(id);
      // Skip persisting an empty bound transcript — it would clobber metadata and
      // cannot help the outgoing conversation (there is nothing to save).
      if (!(state.currentConversationId && state.messages.length === 0)) {
        await this.save();
      }

      // Preserve the pending draft across rapid re-switches: switch #1 already
      // cleared the textarea, so re-capturing would clobber the saved draft with
      // the now-empty composer. Keep the first snapshot until commit/restore.
      if (!this.pendingSwitchDraft) {
        this.pendingSwitchDraft = captureComposerSwitchDraft(this.deps);
      }

      subagentManager.orphanAllActive();
      subagentManager.clear();

      // Phase A — show loading without committing the target conversation.
      // The current title and transcript remain the last known-good state until
      // Phase B succeeds; a cancelled/failed load therefore cannot strand the
      // tab with a new title and an empty message list.
      this.deps.getInputEl().value = '';
      this.deps.clearQueuedMessage();
      this.deps.clearRetryableTurn();
      this.deps.getHistoryDropdown()?.removeClass('visible');
      // Show the hydration spinner in the Vue transcript while Phase B loads.
      this.deps.setTranscriptLoading(t('chat.history.loading'));
      // Force one projection so the overlay lands even if a prior hydration
      // left the same loading string cached without a live observer.
      this.deps.emitTranscript?.();
    } finally {
      state.isSwitchingConversation = false;
    }

    // Phase B — async hydration + post-load restore. Not awaited; the spinner
    // stays visible until this resolves or another switch cancels it. The
    // `.catch` is mandatory: an unhandled rejection here would crash test
    // runners and trip Electron's unhandledRejection logs in production.
    const abort = new AbortController();
    this.hydrationAbort = abort;
    this.pendingHydrationId = id;
    state.isHydrating = true;
    this.hydrationPromise = this.hydrateAndRender(id, abort).catch(() => {
      // `hydrateAndRender` surfaces user-visible failures inline (hydration
      // banner from `ConversationStore.loadSdkMessagesForConversation`).
      // Swallowing here is intentional — the spinner clears in `finally`.
    });
  }

  /**
   * Resolves when the most recent `switchTo`'s background hydration finishes
   * (or is aborted by an even newer switch). No-op when no hydration is
   * pending. Intended for tests + integration code that need post-hydrate
   * state to be visible.
   */
  async whenHydrated(): Promise<void> {
    while (this.hydrationPromise) {
      const pending = this.hydrationPromise;
      await pending;
      // Loop again if a fresh switch started a new hydration meanwhile.
      if (this.hydrationPromise === pending) break;
    }
  }

  /**
   * Loads the transcript for the target conversation, then completes the
   * deferred half of the tab switch (`ensureServiceForConversation` +
   * `restoreConversation`). A newer `switchTo` aborts this controller so the
   * stale result is dropped without touching the renderer.
   */
  private async hydrateAndRender(
    id: string,
    abort: AbortController,
  ): Promise<void> {
    const { state } = this.deps;
    const lifecycleGeneration = this.lifecycleGeneration;
    let restored = false;
    try {
      // Yield to a macrotask so the browser commits the Phase A spinner
      // DOM before sync work in `restoreConversation` (DOM rebuild for the
      // 80-message window) starts. Microtask awaits alone do NOT trigger
      // paint — the cached-hydration path (active tab pre-warmed via
      // `restoreState`) resolves through microtasks only, so without this
      // yield the spinner stays invisible and the user only sees a freeze.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (abort.signal.aborted || lifecycleGeneration !== this.lifecycleGeneration) return;

      const switchResult = await this.switchConversationForHydration(id, abort.signal);
      if (abort.signal.aborted || this.hydrationAbort !== abort || lifecycleGeneration !== this.lifecycleGeneration) return;
      if (!switchResult) {
        this.deps.setTranscriptLoading(null);
        this.deps.setTranscriptGreeting(this.getGreeting());
        this.restorePendingSwitchDraftForHydration(id);
        return;
      }

      const { conversation, hydration } = switchResult;
      if (!isHydrationCommitReady(hydration)) {
        if (hydration.kind === 'error' && hydration.error.code !== 'cancelled') {
          this.deps.setTranscriptHydrationError({
            code: hydration.error.code,
            message: hydration.error.message,
          });
        } else if (hydration.kind === 'empty' && hydration.reason === 'no-store') {
          this.deps.setTranscriptHydrationError({
            code: 'store-missing',
            message: t('chat.history.storeUnavailable'),
          });
        }
        this.restorePendingSwitchDraftForHydration(id);
        return;
      }

      this.pendingSwitchDraft = null;

      // Restore before provider bind so bind failures cannot discard a loaded
      // transcript (the spinner clears in finally only when `restored` is false).
      this.restoreConversation(conversation);
      restored = true;

      try {
        await this.deps.ensureServiceForConversation?.(conversation);
      } catch {
        // Best-effort bind after history hydration; transcript is already visible.
      }
      if (abort.signal.aborted || state.currentConversationId !== conversation.id || lifecycleGeneration !== this.lifecycleGeneration) return;

      this.updateWelcomeVisibility();
      this.callbacks.onConversationSwitched?.();
    } finally {
      if (this.hydrationAbort === abort) {
        this.hydrationAbort = null;
        this.hydrationPromise = null;
        this.pendingHydrationId = null;
        state.isHydrating = false;
        if (!restored) {
          this.deps.setTranscriptLoading(null);
        }
      }
    }
  }

  private async switchConversationForHydration(
    id: string,
    signal: AbortSignal,
  ): Promise<ConversationSwitchResult | null> {
    const plugin = this.deps.plugin;
    if (typeof plugin.switchConversationWithHydration === 'function') {
      return plugin.switchConversationWithHydration(id, { signal });
    }

    // Compatibility for lightweight hosts and older embedders that only expose
    // switchConversation. Some transitional callers already return the richer
    // result through that method, so accept both shapes.
    const legacy = await plugin.switchConversation(id, { signal }) as
      | Conversation
      | ConversationSwitchResult
      | null;
    if (!legacy) return null;
    if ('conversation' in legacy && 'hydration' in legacy) {
      return legacy;
    }
    return {
      conversation: legacy,
      hydration: {
        kind: 'loaded',
        messages: legacy.messages,
        sourceRef: `legacy-switch:${id}`,
      },
    };
  }

  async rewind(
    userMessageId: string,
    mode: ChatRewindMode = 'code-and-conversation',
  ): Promise<void> {
    const start = this.resolveRewindStart(userMessageId);
    if (!start.ok) {
      new Notice(start.notice);
      return;
    }
    const { userMsg, rewindUserMessageId, prevAssistantUuid } = start;

    const confirmed = await confirm(
      this.deps.plugin.app,
      rewindConfirmMessage(mode),
      t('chat.rewind.confirmButton')
    );
    if (!confirmed) return;

    if (this.deps.state.isStreaming) {
      new Notice(t('chat.rewind.unavailableStreaming'));
      return;
    }

    const outcome = await runRewind(this.getAgentService(), rewindUserMessageId, prevAssistantUuid, mode);
    if (!outcome.ok) {
      new Notice(outcome.notice);
      return;
    }

    await this.finalizeRewind(outcome.result, userMsg, userMessageId, prevAssistantUuid, mode);
  }

  /**
   * Runs the streaming/capability guards and resolves the rewind target. Returns
   * a ready-to-show notice on any rejection rather than emitting it, so `rewind`
   * stays a thin orchestrator.
   */
  private resolveRewindStart(userMessageId: string):
    | { ok: true; userMsg: ChatMessage; rewindUserMessageId: string; prevAssistantUuid: string }
    | { ok: false; notice: string } {
    const agentService = this.getAgentService();
    if (agentService && !agentService.getCapabilities().supportsRewind) {
      return { ok: false, notice: t('chat.rewind.failed', { error: t('chat.rewind.errUnsupported') }) };
    }
    if (this.deps.state.isStreaming) {
      return { ok: false, notice: t('chat.rewind.unavailableStreaming') };
    }

    const target = resolveRewindTarget(this.deps.state.messages, userMessageId);
    if (!target.ok) {
      const notice = target.noticeKey === 'errMessageNotFound'
        ? t('chat.rewind.failed', { error: t('chat.rewind.errMessageNotFound') })
        : t('chat.rewind.unavailableNoUuid');
      return { ok: false, notice };
    }

    return {
      ok: true,
      userMsg: target.userMsg,
      rewindUserMessageId: target.userMessageId,
      prevAssistantUuid: target.prevAssistantUuid,
    };
  }

  /** Truncates the transcript, re-renders, and persists the post-rewind state. */
  private async finalizeRewind(
    result: { filesChanged?: string[] },
    userMsg: ChatMessage,
    userMessageId: string,
    prevAssistantUuid: string,
    mode: ChatRewindMode,
  ): Promise<void> {
    const { state } = this.deps;
    state.truncateAt(userMessageId);
    // Rewind drops later turns; re-derive so the edited-files list isn't stale.
    this.rebuildEditedFiles();

    const inputEl = this.deps.getInputEl();
    inputEl.value = userMsg.content;
    inputEl.focus();

    // `truncateAt` re-projects the trimmed transcript; refresh the greeting seed.
    this.deps.setTranscriptGreeting(this.getGreeting());

    const filesChanged = result.filesChanged?.length ?? 0;
    let saveError: string | null = null;
    try {
      await this.save(false, { resumeAtMessageId: prevAssistantUuid });
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Failed to save';
    }

    new Notice(
      saveError
        ? rewindSaveFailedNotice(mode, filesChanged, saveError)
        : rewindSuccessNotice(mode, filesChanged)
    );
  }

  /**
   * Saves the current conversation.
   *
   * If we're at an entry point (no conversation yet) and have messages,
   * creates a new conversation first (lazy creation).
   *
   * For native sessions (new conversations with sessionId from SDK),
   * only metadata is saved - the SDK handles message persistence.
   */
  async save(updateLastResponse = false, options?: SaveOptions): Promise<void> {
    const { plugin, state } = this.deps;

    // Entry point with no messages - nothing to save
    if (!state.currentConversationId && state.messages.length === 0) {
      return;
    }

    const agentService = this.getAgentService();
    const sessionInvalidated = agentService?.consumeSessionInvalidation?.() ?? false;

    await ensureConversationForSave(plugin, state, agentService);

    const selections = collectSaveSelections(
      this.deps.getFileContextManager(),
      this.deps.getExternalContextSelector(),
      this.deps.getMcpServerSelector(),
    );

    const conversation = plugin.getConversationSync(state.currentConversationId!);
    const sessionUpdates = resolveSessionUpdates(agentService, conversation, sessionInvalidated);

    const updates = buildConversationUpdates({
      sessionUpdates,
      state,
      selections,
      workOrderPath: this.deps.getWorkOrderPath?.() ?? null,
      updateLastResponse,
      options,
    });

    await plugin.updateConversation(state.currentConversationId!, updates);
    state.hasPendingConversationSave = false;
  }

  private restorePendingSwitchDraftForHydration(hydrationId: string): void {
    if (this.pendingHydrationId !== hydrationId) return;
    this.restorePendingSwitchDraft();
  }

  private restorePendingSwitchDraft(): void {
    if (!this.pendingSwitchDraft) return;
    restoreComposerSwitchDraft(this.deps, this.pendingSwitchDraft);
    this.pendingSwitchDraft = null;
  }

  /**
   * Shared logic for restoring a conversation into the current tab.
   * Used by both loadActive() and switchTo() to avoid duplication.
   */
  private restoreConversation(
    conversation: Conversation,
    options?: { autoAttachFile?: boolean }
  ): void {
    const { plugin, state } = this.deps;

    state.currentConversationId = conversation.id;
    state.messages = [...conversation.messages];
    state.usage = conversation.usage ?? null;
    state.autoScrollEnabled = plugin.settings.enableAutoScroll ?? true;
    state.hasPendingConversationSave = false;

    // Clear status panels (auto-hide: panels reappear when agent creates new todos)
    state.currentTodos = null;

    // Rebuild the "files changed by the agent" list from this conversation's
    // transcript so it stays tied to the conversation across switches/reloads.
    this.rebuildEditedFiles();

    const hasMessages = state.messages.length > 0;

    // Determine external context paths for this session
    // Empty session: use persistent paths; session with messages: use saved paths
    const externalContextPaths = hasMessages
      ? conversation.externalContextPaths || []
      : plugin.settings.persistentExternalContextPaths || [];

    this.getAgentService()?.syncConversationState(conversation, externalContextPaths);

    const fileCtx = this.deps.getFileContextManager();
    fileCtx?.resetForLoadedConversation(hasMessages);

    if (conversation.currentNote) {
      fileCtx?.setCurrentNote(conversation.currentNote);
    } else if (!hasMessages && options?.autoAttachFile) {
      fileCtx?.autoAttachActiveFile();
    }

    this.restoreExternalContextPaths(conversation.externalContextPaths, !hasMessages);

    const mcpServerSelector = this.deps.getMcpServerSelector();
    if (conversation.enabledMcpServers && conversation.enabledMcpServers.length > 0) {
      mcpServerSelector?.setEnabledServers(conversation.enabledMcpServers);
    } else {
      mcpServerSelector?.clearEnabled();
    }

    // The `state.messages` assignment above already re-projected the transcript
    // (the Vue MessageList windows to the trailing 80 itself — no imperative
    // cooperative-yield chunking). Clear the Phase-A spinner and seed the
    // greeting for the (possibly empty) transcript.
    this.deps.setTranscriptLoading(null);
    this.deps.setTranscriptGreeting(this.getGreeting());

    // The tab is now bound to this conversation, so a hydration failure recorded
    // while it was opening can finally surface its inline banner (the lookup at
    // emit time missed because the tab wasn't bound yet).
    const hydrationError = this.deps.consumePendingHydrationError?.(conversation.id);
    if (hydrationError) this.deps.setTranscriptHydrationError(hydrationError);

    // Belt-and-suspenders: the assignments above already emit via
    // onMessagesChanged / setTranscriptLoading, but force one final projection
    // so a subscribe registered in the same turn as mount still lands.
    this.deps.emitTranscript?.();
  }

  /**
   * Restores external context paths based on session state.
   * New or empty sessions get current persistent paths from settings.
   * Sessions with messages restore exactly what was saved.
   */
  private restoreExternalContextPaths(
    savedPaths: string[] | undefined,
    isEmptySession: boolean
  ): void {
    const { plugin } = this.deps;
    const externalContextSelector = this.deps.getExternalContextSelector();
    if (!externalContextSelector) {
      return;
    }

    if (isEmptySession) {
      // Empty session: use current persistent paths from settings
      externalContextSelector.clearExternalContexts(
        plugin.settings.persistentExternalContextPaths || []
      );
    } else {
      // Session with messages: restore exactly what was saved
      externalContextSelector.setExternalContexts(savedPaths || []);
    }
  }

  // ============================================
  // History Dropdown
  // ============================================

  toggleHistoryDropdown(): void {
    this.historyView.toggleHistoryDropdown();
  }

  updateHistoryDropdown(): void {
    this.historyView.updateHistoryDropdown();
  }

  // ============================================
  // Welcome & Greeting
  // ============================================

  /** Generates a dynamic greeting based on time/day. */
  getGreeting(): string {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    const name = this.deps.plugin.settings.userName?.trim();

    // Helper to optionally personalize a greeting (with fallback for no-name case)
    const personalize = (base: string, noNameFallback?: string): string =>
      name ? `${base}, ${name}` : (noNameFallback ?? base);

    // Day-specific greetings (some personalized, some universal)
    const dayGreetings: Record<number, string[]> = {
      0: [personalize('Happy Sunday'), 'Sunday session?', 'Welcome to the weekend'],
      1: [personalize('Happy Monday'), personalize('Back at it', 'Back at it!')],
      2: [personalize('Happy Tuesday')],
      3: [personalize('Happy Wednesday')],
      4: [personalize('Happy Thursday')],
      5: [personalize('Happy Friday'), personalize('That Friday feeling')],
      6: [personalize('Happy Saturday', 'Happy Saturday!'), personalize('Welcome to the weekend')],
    };

    // Time-specific greetings
    const getTimeGreetings = (): string[] => {
      if (hour >= 5 && hour < 12) {
        return [personalize('Good morning'), 'Coffee and Specorator time?'];
      } else if (hour >= 12 && hour < 18) {
        return [personalize('Good afternoon'), personalize('Hey there'), personalize("How's it going") + '?'];
      } else if (hour >= 18 && hour < 22) {
        return [personalize('Good evening'), personalize('Evening'), personalize('How was your day') + '?'];
      } else {
        return ['Hello, night owl', personalize('Evening')];
      }
    };

    // General greetings
    const generalGreetings = [
      personalize('Hey there'),
      name ? `Hi ${name}, how are you?` : 'Hi, how are you?',
      personalize("How's it going") + '?',
      personalize('Welcome back') + '!',
      personalize("What's new") + '?',
      ...(name ? [`${name} returns!`] : []),
      'You are absolutely right!',
    ];

    // Combine day + time + general greetings, pick randomly
    const allGreetings = [
      ...(dayGreetings[day] || []),
      ...getTimeGreetings(),
      ...generalGreetings,
    ];

    return allGreetings[Math.floor(Math.random() * allGreetings.length)];
  }

  /**
   * Welcome visibility is now a projection of message count: the
   * `TabTranscriptProjection` suppresses the greeting once messages exist, and
   * the Vue `WelcomeBanner` renders it. Retained as a no-op so existing call
   * sites (post-load / post-hydrate) stay valid without imperative DOM.
   */
  updateWelcomeVisibility(): void {
    // Intentionally empty — see method doc.
  }

  /**
   * Initializes the welcome greeting for a new tab without a conversation.
   * Called when a new tab is activated and has no conversation loaded.
   */
  initializeWelcome(): void {
    // Initialize file context to auto-attach the currently focused note
    const fileCtx = this.deps.getFileContextManager();
    fileCtx?.resetForNewConversation();
    fileCtx?.autoAttachActiveFile();

    // Seed the greeting for the Vue welcome banner (suppressed once messages exist).
    this.deps.setTranscriptGreeting(this.getGreeting());
  }

  // ============================================
  // Utilities
  // ============================================

  /** Generates a fallback title from the first message (used when AI fails). */
  generateFallbackTitle(firstMessage: string): string {
    const firstSentence = firstMessage.split(/[.!?\n]/)[0].trim();
    const autoTitle = firstSentence.substring(0, 50);
    const suffix = firstSentence.length > 50 ? '...' : '';
    return `${autoTitle}${suffix}`;
  }

  /** Regenerates AI title for a conversation. */
  regenerateTitle(conversationId: string): Promise<void> {
    return this.historyView.regenerateTitle(conversationId);
  }

  /** Formats a timestamp for display. */
  formatDate(timestamp: number): string {
    return this.historyView.formatDate(timestamp);
  }

  /**
   * Renders the history dropdown content to a provided container.
   * Used by SpecoratorView to render the dropdown with custom selection callback.
   */
  renderHistoryDropdown(
    container: HTMLElement,
    options: Omit<HistoryRenderOptions, 'onRerender'>,
  ): void {
    this.historyView.renderHistoryDropdown(container, options);
  }
}
