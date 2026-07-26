import { Notice } from 'obsidian';

import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { ChatRuntimeQueryOptions, ChatTurnMetadata, ChatTurnRequest } from '../../../core/runtime/types';
import { TOOL_EXIT_PLAN_MODE } from '../../../core/tools/toolNames';
import type { ChatMessage, ImageAttachment, PlanApprovalDecision } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type { BrowserSelectionContext } from '../../../utils/browser';
import type { CanvasSelectionContext } from '../../../utils/canvas';
import { formatDurationMmSs } from '../../../utils/date';
import type { EditorSelectionContext } from '../../../utils/editor';
import { COMPLETION_FLAVOR_WORDS } from '../constants';
import type { ChatState } from '../state/ChatState';
import type { FileContextManager } from '../ui/FileContext';
import type { ImageContextManager } from '../ui/ImageContext';

/** Composer snapshot resolved once per send and threaded through every phase. */
export interface ComposerSendContext {
  content: string;
  shouldUseInput: boolean;
  /**
   * Content-override send that also consumed the composer (quick actions
   * launched from the chat header): the unsent draft rode along as context,
   * so the composer must be cleared like a user send.
   */
  consumesComposerDraft: boolean;
  hasImages: boolean;
  imageOverride?: ChatMessage['images'];
  /**
   * The composer textarea's ORIGINAL value at send time (before it was cleared).
   * Used for rollback restore: a `consumesComposerDraft` send's `content` is the
   * quick-action prompt folded with the draft, so restoring `content` would
   * repopulate the composer with the generated prompt — restore this instead.
   */
  composerDraft: string;
  inputEl: HTMLTextAreaElement;
  imageContextManager: ImageContextManager | null;
  fileContextManager: FileContextManager | null;
}

/** Per-send overrides accepted by `sendMessage` and threaded into turn building. */
export interface ComposerTurnOptions {
  editorContextOverride?: EditorSelectionContext | null;
  browserContextOverride?: BrowserSelectionContext | null;
  canvasContextOverride?: CanvasSelectionContext | null;
  turnRequestOverride?: ChatTurnRequest;
}

export interface OutgoingTurn {
  displayContent: string;
  turnRequest: ChatTurnRequest;
  imagesForMessage?: ChatMessage['images'];
  isCompact: boolean;
}

/** Everything a dispatched turn carries through streaming and finalization. */
export interface DispatchedTurnContext {
  agentService: ChatRuntime;
  send: ComposerSendContext;
  turnRequest: ChatTurnRequest;
  userMsg: ChatMessage;
  assistantMsg: ChatMessage;
  streamGeneration: number;
  tabModelOverride: string | null;
  // Resolved up front in acquireTurnRuntime (before the first chunk) so a strict-roster-read throw
  // blocks the turn WITH the init-failure rollback, never mid-stream where the draft is already gone.
  queryOptions: ChatRuntimeQueryOptions;
  deferredAiTitleGeneration: (() => void) | null;
}

/** Consumed turn metadata plus the resolved final assistant message. */
export interface FinishedTurn {
  finalAssistantMsg: ChatMessage;
  turnMetadata: ChatTurnMetadata;
  didEnqueueToSdk: boolean;
  planCompleted: boolean;
  wasInterrupted: boolean;
}

export interface PlanApprovalOutcome {
  autoSendContent: string | null;
  invalidated: boolean;
  shouldProcessQueuedMessage: boolean;
}

export function resolveComposerSend(args: {
  inputEl: HTMLTextAreaElement;
  imageContextManager: ImageContextManager | null;
  fileContextManager: FileContextManager | null;
  overrides?: { content?: string; images?: ChatMessage['images']; includeComposerDraft?: boolean };
}): ComposerSendContext {
  const contentOverride = args.overrides?.content;
  const imageOverride = args.overrides?.images;
  const shouldUseInput = contentOverride === undefined;
  const consumesComposerDraft = !shouldUseInput && (args.overrides?.includeComposerDraft ?? false);
  const baseContent = (contentOverride ?? args.inputEl.value).trim();
  const draft = consumesComposerDraft ? args.inputEl.value.trim() : '';
  const content = draft ? `${baseContent}\n\n${draft}` : baseContent;
  const hasImages = imageOverride !== undefined
    ? imageOverride.length > 0
    : (args.imageContextManager?.hasImages() ?? false);

  return {
    content,
    shouldUseInput,
    consumesComposerDraft,
    hasImages,
    imageOverride,
    composerDraft: args.inputEl.value,
    inputEl: args.inputEl,
    imageContextManager: args.imageContextManager,
    fileContextManager: args.fileContextManager,
  };
}

/**
 * Clears the composer textarea when this send consumed it: a plain user send,
 * or a content-override send that folded the draft in (quick actions).
 */
export function clearConsumedComposerInput(
  send: ComposerSendContext,
  resetInputHeight: () => void,
): void {
  if (send.shouldUseInput || send.consumesComposerDraft) {
    send.inputEl.value = '';
    resetInputHeight();
  }
}

export function resolveComposerSourceImages(
  send: ComposerSendContext,
): NonNullable<ChatMessage['images']> {
  return send.imageOverride ?? send.imageContextManager?.getAttachedImages() ?? [];
}

export function normalizeTabModelOverride(raw: string | null | undefined): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** Outgoing composer draft captured before a history switch clears the input. */
export interface ComposerSwitchDraftSnapshot {
  inputText: string;
  attachedFiles: string[];
  attachedFolders: string[];
}

export interface ComposerSwitchDraftDeps {
  getInputEl: () => HTMLTextAreaElement;
  getFileContextManager: () => {
    getAttachedFiles?: () => Iterable<string>;
    getAttachedFolders?: () => Iterable<string>;
    setAttachedFiles?: (paths: string[]) => void;
    setAttachedFolders?: (paths: string[]) => void;
  } | null;
}

export function captureComposerSwitchDraft(deps: ComposerSwitchDraftDeps): ComposerSwitchDraftSnapshot {
  const fileCtx = deps.getFileContextManager();
  return {
    inputText: deps.getInputEl().value,
    attachedFiles: [...(fileCtx?.getAttachedFiles?.() ?? [])],
    attachedFolders: [...(fileCtx?.getAttachedFolders?.() ?? [])],
  };
}

export function restoreComposerSwitchDraft(
  deps: ComposerSwitchDraftDeps,
  snapshot: ComposerSwitchDraftSnapshot,
  resetInputHeight?: () => void,
): void {
  deps.getInputEl().value = snapshot.inputText;
  resetInputHeight?.();
  const fileCtx = deps.getFileContextManager();
  fileCtx?.setAttachedFiles?.(snapshot.attachedFiles);
  fileCtx?.setAttachedFolders?.(snapshot.attachedFolders);
}

export interface ComposerRollbackSnapshot {
  inputText: string;
  shouldRestoreInput: boolean;
  attachedFiles: string[];
  attachedFolders: string[];
  // Captured BEFORE buildOutgoingTurn clears them, so a failed init rollback can
  // restore the user's pasted/dropped images too (not just text + file pills).
  attachedImages: ImageAttachment[];
  // FileContext session-started state BEFORE beginStreamingTurnState's
  // startSession() froze the active-note pill. Restored on rollback so a note
  // switch before retry updates the current note (not stale context).
  fileContextSessionStarted: boolean;
}

export function captureComposerRollbackSnapshot(send: ComposerSendContext): ComposerRollbackSnapshot {
  return {
    // A consumesComposerDraft send folded the quick-action prompt INTO `content`,
    // so restore the user's original draft — not the generated prompt. A plain
    // user send's `content` already IS the composer text.
    inputText: send.consumesComposerDraft ? send.composerDraft : send.content,
    shouldRestoreInput: send.shouldUseInput || send.consumesComposerDraft,
    attachedFiles: [...(send.fileContextManager?.getAttachedFiles?.() ?? [])],
    attachedFolders: [...(send.fileContextManager?.getAttachedFolders?.() ?? [])],
    attachedImages: [...(send.imageContextManager?.getAttachedImages() ?? [])],
    // Captured before startSession() runs, so rollback can restore the exact
    // prior state (usually false on the first turn of an empty chat).
    fileContextSessionStarted: send.fileContextManager?.isSessionStarted?.() ?? false,
  };
}

export function rollbackOptimisticOutgoingTurn(
  state: ChatState,
  snapshot: ComposerRollbackSnapshot,
  send: ComposerSendContext,
  userMsgId: string,
  assistantMsgId: string,
  resetInputHeight: () => void,
): void {
  state.messages = state.messages.filter(
    (message) => message.id !== userMsgId && message.id !== assistantMsgId,
  );
  state.isStreaming = false;
  state.hasPendingConversationSave = false;
  state.activeMessageId = null;
  state.activeBlockIndex = -1;
  state.currentContentEl = null;
  state.currentTextEl = null;
  state.currentTextContent = '';
  state.currentThinkingState = null;

  // Restore the submitted text ONLY when the composer is still empty. If runtime init failed AFTER
  // the user began a NEWER draft (common on a new DM whose CLI is unavailable — init fails a beat
  // after the next keystrokes), writing the old text back would clobber it (data loss). The newer
  // draft wins; mirrors restoreReservedComposerInput's Round-55 guard (trimmed-empty == "empty").
  // Placeholder removal above stays unconditional — only this composer-text restore is guarded.
  if (snapshot.shouldRestoreInput && send.inputEl.value.trim() === '') {
    send.inputEl.value = snapshot.inputText;
    resetInputHeight();
  }
  if (send.fileContextManager) {
    send.fileContextManager.setAttachedFiles?.(snapshot.attachedFiles);
    send.fileContextManager.setAttachedFolders?.(snapshot.attachedFolders);
    // beginStreamingTurnState called startSession(), freezing the active-note
    // pill. If no session was started before this send, undo it so a note switch
    // before the retry updates currentNotePath instead of sending stale context.
    if (!snapshot.fileContextSessionStarted) {
      send.fileContextManager.endSession?.();
    }
  }
  // buildOutgoingTurn cleared the images before init failed; put them back so the
  // restored message is fully retryable (mirrors the text/pill restore above).
  send.imageContextManager?.setImages(snapshot.attachedImages);
}

/**
 * Restores a composer draft reserved (consumed) up front by the Team Chat DM send
 * (`confirmDmAgentOrRestoreComposer`, below) when the bound agent turns out removed. Only the
 * textarea text is consumed early — images and pill mentions are read LIVE at turn-build time and
 * can't be cleared before then — so restoring the captured text is the complete undo. Reuses the
 * same `ComposerRollbackSnapshot` the init-failure rollback captures (text-only slice of it).
 */
export function restoreReservedComposerInput(
  send: ComposerSendContext,
  snapshot: ComposerRollbackSnapshot,
  resetInputHeight: () => void,
): void {
  if (!snapshot.shouldRestoreInput) return;
  // The composer was cleared UP FRONT (reserve-before-await), so anything here now is a NEWER
  // draft the user typed during the roster await. Writing the old submitted text back would
  // clobber it (data loss) — the newer draft wins. Restore only when the composer is still empty
  // (trimmed-empty, matching how resolveComposerSend/resolveEmptyComposerSend define "empty").
  if (send.inputEl.value.trim() !== '') return;
  send.inputEl.value = snapshot.inputText;
  resetInputHeight();
}

/** Minimal dependencies the Team Chat DM send guard reads — a structural slice so this
 *  composer-phase module stays decoupled from the concrete plugin/logger types. */
export interface DmComposerGuardDeps {
  agentRosterStore: { get(id: string): Promise<unknown> };
  logger: { scope(name: string): { error(message: string, error: unknown): void } };
  resetInputHeight: () => void;
}

/**
 * Team Chat DM removed-agent gate, run AFTER the composer was reserved (consumed) up front in
 * `sendMessage`. Returns `true` when the bound agent still exists (proceed on the consumed
 * composer). Returns `false` — restoring the reserved composer (newer-draft-safe) and notifying —
 * when the agent was removed OR the roster read REJECTS. Catching the rejection is load-bearing:
 * `AgentRosterStore.get` awaits `adapter.exists` OUTSIDE its try/catch, so a vault-I/O error
 * rejects the read; unhandled, it would escape `sendMessage` with the composer already cleared and
 * silently lose the user's text. Blocking on a failed read is fail-safe — the agent is unconfirmed,
 * so a transient glitch can't send a turn without its persona/model; the user retries and it
 * succeeds. Only the textarea text was consumed early (images/pills are read live at turn-build), so
 * restoring the captured text is the complete undo.
 */
export async function confirmDmAgentOrRestoreComposer(
  send: ComposerSendContext,
  dmAgentId: string,
  deps: DmComposerGuardDeps,
): Promise<boolean> {
  let removed = false;
  try {
    if ((await deps.agentRosterStore.get(dmAgentId)) !== null) return true;
    removed = true;
  } catch (error) {
    deps.logger.scope('team-chat').error('roster read failed during DM send guard', error);
  }
  restoreReservedComposerInput(send, captureComposerRollbackSnapshot(send), deps.resetInputHeight);
  // agentRemoved is a hard state (pick another agent); agentVerifyFailed is transient (retry).
  new Notice(t(removed ? 'teamChat.agentRemoved' : 'teamChat.agentVerifyFailed'));
  return false;
}

export function beginStreamingTurnState(
  state: ChatState,
  send: ComposerSendContext,
  ui: {
    plugin: { settings: { enableAutoScroll?: boolean } };
    getSubagentManager: () => { resetSpawnedCount: () => void };
  },
): number {
  state.isStreaming = true;
  state.cancelRequested = false;
  state.ignoreUsageUpdates = false; // Allow usage updates for new query
  ui.getSubagentManager().resetSpawnedCount();
  state.autoScrollEnabled = ui.plugin.settings.enableAutoScroll ?? true; // Reset auto-scroll based on setting
  const streamGeneration = state.bumpStreamGeneration();

  send.fileContextManager?.startSession();
  return streamGeneration;
}

export function createOutgoingUserMessage(
  id: string,
  displayContent: string,
  imagesForMessage: ChatMessage['images'],
): ChatMessage {
  return {
    id,
    role: 'user',
    content: displayContent,
    displayContent,                // Original user input (for UI display)
    timestamp: Date.now(),
    images: imagesForMessage,
  };
}

export function createAssistantPlaceholderMessage(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    toolCalls: [],
    contentBlocks: [],
  };
}

/** Restore pendingResumeAt from persisted conversation state (survives plugin reload). */
export async function restoreResumeCheckpointIfNeeded(
  agentService: ChatRuntime,
  state: ChatState,
  conversations: {
    getConversationSync: (id: string) => { resumeAtMessageId?: string } | null | undefined;
    updateConversation: (id: string, updates: { resumeAtMessageId?: string }) => Promise<unknown>;
  },
): Promise<void> {
  const conversationIdForSend = state.currentConversationId;
  if (!conversationIdForSend) {
    return;
  }
  const conv = conversations.getConversationSync(conversationIdForSend);
  if (!conv?.resumeAtMessageId) {
    return;
  }
  if (isResumeSessionAtStillNeeded(conv.resumeAtMessageId, state.messages.slice(0, -2))) {
    agentService.setResumeCheckpoint(conv.resumeAtMessageId);
  } else {
    try {
      await conversations.updateConversation(conversationIdForSend, { resumeAtMessageId: undefined });
    } catch {
      // Best-effort — don't block send
    }
  }
}

export function isResumeSessionAtStillNeeded(
  resumeUuid: string,
  previousMessages: ChatMessage[],
): boolean {
  for (let i = previousMessages.length - 1; i >= 0; i--) {
    if (previousMessages[i].role === 'assistant' && previousMessages[i].assistantMessageId === resumeUuid) {
      // Still needed only if no messages follow the resume point
      return i === previousMessages.length - 1;
    }
  }
  return false;
}

/** Bakes the response-duration footer into the message and live DOM (skips interrupted responses and compaction). */
export function bakeResponseDurationFooter(
  state: ChatState,
  finalAssistantMsg: ChatMessage,
  didCancelThisTurn: boolean,
): void {
  const hasCompactBoundary = finalAssistantMsg.contentBlocks?.some(b => b.type === 'context_compacted');
  if (didCancelThisTurn || hasCompactBoundary) {
    return;
  }

  const durationSeconds = state.responseStartTime
    ? Math.floor((performance.now() - state.responseStartTime) / 1000)
    : 0;
  if (durationSeconds <= 0) {
    return;
  }

  const flavorWord =
    COMPLETION_FLAVOR_WORDS[Math.floor(Math.random() * COMPLETION_FLAVOR_WORDS.length)];
  finalAssistantMsg.durationSeconds = durationSeconds;
  finalAssistantMsg.durationFlavorWord = flavorWord;
  // Add footer to live message in DOM
  if (state.currentContentEl) {
    const footerEl = state.currentContentEl.createDiv({ cls: 'specorator-response-footer' });
    footerEl.createSpan({
      text: `* ${flavorWord} for ${formatDurationMmSs(durationSeconds)}`,
      cls: 'specorator-baked-duration',
    });
  }
}

/**
 * approve-new-session: the tool_result chunk is dropped because cancelRequested
 * was set before the stream loop could process it — manually set the result so
 * the saved conversation renders correctly when revisited.
 */
export function completeApprovedNewSessionPlanToolCalls(
  state: ChatState,
  finalAssistantMsg: ChatMessage,
): void {
  if (!state.pendingNewSessionPlan || !finalAssistantMsg.toolCalls) {
    return;
  }

  for (const tc of finalAssistantMsg.toolCalls) {
    if (tc.name === TOOL_EXIT_PLAN_MODE && !tc.result) {
      tc.status = 'completed';
      tc.result = 'User approved the plan and started a new session.';
    }
  }
}

export function applyPlanApprovalDecision(
  decision: PlanApprovalDecision | null,
  turnMetadata: ChatTurnMetadata,
  controls: {
    getInputEl: () => HTMLTextAreaElement;
    restorePrePlanPermissionModeIfNeeded?: () => void;
  },
): PlanApprovalOutcome {
  if (decision?.type === 'implement') {
    controls.restorePrePlanPermissionModeIfNeeded?.();
    return {
      autoSendContent: turnMetadata.autoFollowUpText
        ? `${turnMetadata.autoFollowUpText}\n\nImplement the plan.`
        : 'Implement the plan.',
      invalidated: false,
      shouldProcessQueuedMessage: true,
    };
  }
  if (decision?.type === 'revise') {
    // Keep plan mode active, populate input with feedback text
    controls.getInputEl().value = decision.text;
    return { autoSendContent: null, invalidated: false, shouldProcessQueuedMessage: false };
  }
  // cancel or null (dismissed)
  controls.restorePrePlanPermissionModeIfNeeded?.();
  return { autoSendContent: null, invalidated: false, shouldProcessQueuedMessage: true };
}
