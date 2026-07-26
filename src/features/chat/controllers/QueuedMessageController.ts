import { Notice, setIcon } from 'obsidian';

import type { ProviderCapabilities } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import {
  cloneChatTurnRequest,
  mergeQueuedChatTurns,
  type QueuedChatTurn,
} from '../../../core/runtime/QueuedTurn';
import type { ChatTurnRequest } from '../../../core/runtime/types';
import type { ChatMessage } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { appendMarkdownSnippet } from '../../../utils/markdown';
import type { ChatState } from '../state/ChatState';
import type { QueuedMessage } from '../state/types';
import type { FileContextManager } from '../ui/FileContext';
import type { ImageContextManager } from '../ui/ImageContext';
import { teamChatDmBoundAgentId } from './teamChatSurface';

/** Snapshot pushed when a steered turn is accepted, so the host can reconcile provider message boundaries. */
export interface SteerCommittedMessage {
  displayContent: string;
  persistedContent?: string;
  currentNote?: string;
  images?: ChatMessage['images'];
}

/**
 * Dependencies the queue/steer state machine needs from its host (InputController).
 * Kept explicit so the controller is testable in isolation; `state` is the same
 * shared `ChatState` instance the host holds — single source of truth for queue state.
 */
export interface QueuedMessageControllerDeps {
  state: ChatState;
  /** For the Team Chat removed-agent steer guard (mirrors InputController.sendMessage). */
  plugin: SpecoratorPlugin;
  getAgentService: () => ChatRuntime | null;
  getActiveCapabilities: () => ProviderCapabilities;
  getInputEl: () => HTMLTextAreaElement;
  getImageContextManager: () => ImageContextManager | null;
  getFileContextManager: () => FileContextManager | null;
  resetInputHeight: () => void;
  /** Re-enter the host's send path with the dequeued snapshot. */
  requestSend: (options: {
    content: string;
    images?: ChatMessage['images'];
    turnRequestOverride: ChatTurnRequest;
  }) => void;
  /** Record a committed steered turn against the host's provider-message-boundary bookkeeping. */
  onSteerCommitted: (message: SteerCommittedMessage) => void;
}

/**
 * Owns the queued-message / steering state machine extracted from InputController.
 *
 * Concurrency semantics are behavior-preserving: the `steerInFlight` guard, the
 * merge-vs-replace logic in `mergeQueuedMessages`/`mergePendingMessages`, the
 * `cancelRequested || !pendingSteerMessage` re-check after the async `steer`, and
 * `restoreQueuedMessageAfterSteerFailure` must not change — a subtle change here
 * loses or duplicates user messages.
 */
export class QueuedMessageController {
  private steerInFlight = false;
  private pendingSteerMessage: QueuedMessage | null = null;

  constructor(private readonly deps: QueuedMessageControllerDeps) {}

  updateQueueIndicator(): void {
    const { state } = this.deps;
    const indicatorEl = state.queueIndicatorEl;
    if (!indicatorEl) return;

    indicatorEl.empty();

    const visibleQueuedMessage = state.queuedMessage ?? this.pendingSteerMessage;
    if (visibleQueuedMessage) {
      const isPendingSteerOnly = !state.queuedMessage && !!this.pendingSteerMessage;
      indicatorEl.createSpan({
        cls: 'specorator-queue-indicator-text',
        text: `${isPendingSteerOnly ? '⌙ Steering: ' : '⌙ Queued: '}${this.getQueuedMessageDisplay(visibleQueuedMessage)}`,
      });

      if (state.queuedMessage) {
        const actionsEl = indicatorEl.createDiv({ cls: 'specorator-queue-indicator-actions' });

        if (this.canSteerQueuedMessage()) {
          const steerButton = actionsEl.createEl('button', {
            cls: 'specorator-queue-indicator-action',
            text: this.steerInFlight ? 'Steering...' : 'Steer Now',
          });
          steerButton.setAttribute('type', 'button');
          if (this.steerInFlight) {
            steerButton.setAttribute('disabled', 'true');
          } else {
            steerButton.addEventListener('click', (event) => {
              event.stopPropagation();
              void this.steerQueuedMessage();
            });
          }
        }

        const editButton = this.createQueueIconButton(
          actionsEl,
          'pencil',
          'Edit queued message',
        );
        editButton.addEventListener('click', (event) => {
          event.stopPropagation();
          this.withdrawQueuedMessageToComposer();
        });

        const discardButton = this.createQueueIconButton(
          actionsEl,
          'trash-2',
          'Discard queued message',
        );
        discardButton.addEventListener('click', (event) => {
          event.stopPropagation();
          this.clearQueuedMessage();
        });
      }

      indicatorEl.addClass('specorator-visible-flex');
      indicatorEl.removeClass('specorator-hidden');
      return;
    }

    indicatorEl.removeClass('specorator-visible-flex');
    indicatorEl.addClass('specorator-hidden');
  }

  clearQueuedMessage(): void {
    const { state } = this.deps;
    state.queuedMessage = null;
    this.updateQueueIndicator();
  }

  withdrawQueuedMessageToComposer(): void {
    const { state } = this.deps;
    if (!state.queuedMessage) return;

    const queuedMessage = this.cloneQueuedMessage(state.queuedMessage);
    state.queuedMessage = null;
    this.restoreMessageToInput(queuedMessage, { mergeWithComposer: true });
    this.updateQueueIndicator();
  }

  private restoreMessageToInput(
    message: QueuedMessage | null,
    options: { mergeWithComposer?: boolean } = {},
  ): void {
    if (!message) return;

    const { content, images } = message;
    const inputEl = this.deps.getInputEl();
    const currentContent = options.mergeWithComposer ? inputEl.value.trim() : '';
    inputEl.value = currentContent
      ? appendMarkdownSnippet(content, currentContent)
      : content;

    const imageContextManager = this.deps.getImageContextManager();
    const currentImages = options.mergeWithComposer
      ? (imageContextManager?.getAttachedImages() ?? [])
      : [];
    const restoredImages = [...(images ?? []), ...currentImages];
    if (restoredImages.length > 0) {
      imageContextManager?.setImages(restoredImages);
    }
    this.deps.resetInputHeight();
    inputEl.focus();
  }

  restorePendingMessagesToInput(): void {
    const { state } = this.deps;
    const combinedMessage = this.mergePendingMessages(
      this.pendingSteerMessage,
      state.queuedMessage,
    );
    this.restoreMessageToInput(combinedMessage, { mergeWithComposer: true });
    state.queuedMessage = null;
    this.clearPendingSteerState();
    this.updateQueueIndicator();
  }

  processQueuedMessage(): void {
    const { state } = this.deps;
    if (!state.queuedMessage) return;

    // A Team Chat DM whose agent was removed from the roster is read-only: re-entering
    // InputController.sendMessage would REJECT the turn (its removed-agent guard) AFTER we
    // dequeued here, silently dropping the user's follow-up. Gate the SAME predicate BEFORE
    // clearing the queue so the draft survives intact (self-healing: re-creating the agent lets
    // it send). The sync surface check short-circuits before any roster lookup, so the sidebar
    // auto-dequeue path stays microtask-free — only a real DM pays the async roster read.
    const dmAgentId = teamChatDmBoundAgentId(this.deps.plugin, state.currentConversationId);
    if (dmAgentId) {
      void this.dispatchQueuedDmMessage(dmAgentId);
      return;
    }
    this.dispatchQueuedMessage();
  }

  /** Auto-dequeue for a Team Chat DM: verify the bound agent still exists BEFORE dequeuing. If
   *  it was removed, leave the queued message intact and notify once (its indicator stays, so
   *  re-creating the agent lets the follow-up send); else dispatch normally. */
  private async dispatchQueuedDmMessage(dmAgentId: string): Promise<void> {
    if ((await this.deps.plugin.agentRosterStore.get(dmAgentId)) === null) {
      new Notice(t('teamChat.agentRemoved'));
      return;
    }
    this.dispatchQueuedMessage();
  }

  /** Dequeues the queued snapshot and re-enters the host send path on a macrotask (unchanged
   *  behavior; the timeout lets the current turn's teardown settle first). Re-checks the queue
   *  since the DM path awaits a roster read before reaching here. */
  private dispatchQueuedMessage(): void {
    const { state } = this.deps;
    if (!state.queuedMessage) return;

    const queuedMessage = this.cloneQueuedMessage(state.queuedMessage);
    state.queuedMessage = null;
    this.updateQueueIndicator();

    window.setTimeout(
      () => {
        this.deps.requestSend({
          content: queuedMessage.content,
          // `?? []` is load-bearing: `resolveComposerSend` treats an UNDEFINED image
          // override as "read the live composer", so a snapshot queued without images
          // would pick up whatever the user staged afterwards — and the merged content
          // may no longer read as `/compact`, so the compact guards can't stop it. The
          // transcript then showed an image the provider never received (the queued
          // turnRequest has none). For a dequeued turn the snapshot IS the turn: an
          // empty array means "no images", not "go look".
          images: queuedMessage.images ?? [],
          turnRequestOverride: this.toQueuedChatTurn(queuedMessage).request,
        });
      },
      0
    );
  }

  private getQueuedMessageDisplay(message: QueuedMessage | null): string {
    if (!message) {
      return '';
    }

    const rawContent = message.content.trim();
    const preview = rawContent.length > 40
      ? rawContent.slice(0, 40) + '...'
      : rawContent;
    const hasImages = (message.images?.length ?? 0) > 0;

    if (hasImages) {
      return preview ? `${preview} [images]` : '[images]';
    }

    return preview;
  }

  private createQueueIconButton(
    parentEl: HTMLElement,
    icon: string,
    label: string,
  ): HTMLElement {
    const button = parentEl.createEl('button', {
      cls: 'specorator-queue-indicator-icon-action',
      attr: {
        'aria-label': label,
        title: label,
        type: 'button',
      },
    });
    setIcon(button, icon);
    return button;
  }

  private canSteerQueuedMessage(): boolean {
    const agentService = this.deps.getAgentService();
    return this.deps.state.isStreaming
      && this.deps.getActiveCapabilities().supportsTurnSteer === true
      && typeof agentService?.steer === 'function';
  }

  private cloneQueuedMessage(message: QueuedMessage): QueuedMessage {
    return {
      ...message,
      images: message.images ? [...message.images] : undefined,
      turnRequest: message.turnRequest
        ? cloneChatTurnRequest(message.turnRequest)
        : undefined,
    };
  }

  createQueuedMessage(displayContent: string, turnRequest: ChatTurnRequest): QueuedMessage {
    const request = cloneChatTurnRequest(turnRequest);
    return {
      content: displayContent,
      images: request.images,
      editorContext: request.editorSelection ?? null,
      browserContext: request.browserSelection ?? null,
      canvasContext: request.canvasSelection ?? null,
      turnRequest: request,
    };
  }

  private toQueuedChatTurn(message: QueuedMessage): QueuedChatTurn {
    if (message.turnRequest) {
      return {
        displayContent: message.content,
        request: cloneChatTurnRequest(message.turnRequest),
      };
    }

    return {
      displayContent: message.content,
      request: {
        text: message.content,
        images: message.images ? [...message.images] : undefined,
        editorSelection: message.editorContext,
        browserSelection: message.browserContext ?? null,
        canvasSelection: message.canvasContext,
      },
    };
  }

  private mergePendingMessages(
    first: QueuedMessage | null,
    second: QueuedMessage | null,
  ): QueuedMessage | null {
    if (first && second) {
      return this.mergeQueuedMessages(first, second);
    }

    if (first) {
      return this.cloneQueuedMessage(first);
    }

    if (second) {
      return this.cloneQueuedMessage(second);
    }

    return null;
  }

  clearPendingSteerState(): void {
    this.pendingSteerMessage = null;
    this.steerInFlight = false;
  }

  restorePendingSteerMessageToQueue(): void {
    if (!this.pendingSteerMessage) {
      return;
    }

    const { state } = this.deps;
    const pendingSteerMessage = this.cloneQueuedMessage(this.pendingSteerMessage);
    this.clearPendingSteerState();
    state.queuedMessage = state.queuedMessage
      ? this.mergeQueuedMessages(pendingSteerMessage, state.queuedMessage)
      : pendingSteerMessage;
    this.updateQueueIndicator();
  }

  mergeQueuedMessages(
    existing: QueuedMessage | null,
    incoming: QueuedMessage,
  ): QueuedMessage {
    if (!existing) {
      return this.cloneQueuedMessage(incoming);
    }

    const mergedTurn = mergeQueuedChatTurns(
      this.toQueuedChatTurn(existing),
      this.toQueuedChatTurn(incoming),
    );
    return this.createQueuedMessage(mergedTurn.displayContent, mergedTurn.request);
  }

  private async steerQueuedMessage(): Promise<void> {
    if (this.steerInFlight) {
      return;
    }

    const { state } = this.deps;
    const agentService = this.deps.getAgentService();
    if (!state.queuedMessage || !this.canSteerQueuedMessage() || !agentService?.steer) {
      return;
    }

    // Reserve BEFORE the async roster read so the queue mutation is atomic: clone the queued
    // message, null the queue, and set steerInFlight synchronously. A concurrent double-steer then
    // bails on the steerInFlight guard above, and a discard/edit racing the read operates on the
    // already-nulled queue instead of tearing cloneQueuedMessage(state.queuedMessage) apart
    // mid-read (null deref) — the bug when the removed-agent guard's await ran BEFORE the
    // reservation (Round-53).
    const queuedMessage = this.cloneQueuedMessage(state.queuedMessage);
    state.queuedMessage = null;
    this.pendingSteerMessage = queuedMessage;
    this.steerInFlight = true;
    this.updateQueueIndicator();

    // A Team Chat DM whose agent was removed from the roster is read-only: steering would commit a
    // turn WITHOUT the agent's persona/model. Gate it with the same guard InputController.sendMessage
    // applies, which `steerQueuedMessage` bypasses. `confirmSteerDmAgentOrRestore` rolls the
    // reservation back (leaving the queued message editable) when the agent is gone OR the roster
    // read fails, so the queue is never stranded mid-"Steering". The sync surface check
    // short-circuits before any roster lookup on the sidebar.
    const dmAgentId = teamChatDmBoundAgentId(this.deps.plugin, state.currentConversationId);
    if (dmAgentId && !(await this.confirmSteerDmAgentOrRestore(dmAgentId, queuedMessage))) {
      return;
    }

    try {
      const { displayContent, request } = this.toQueuedChatTurn(queuedMessage);

      const preparedTurn = agentService.prepareTurn(request);
      const accepted = await agentService.steer(preparedTurn);
      if (state.cancelRequested || !this.pendingSteerMessage) {
        return;
      }
      if (!accepted) {
        this.restoreQueuedMessageAfterSteerFailure(queuedMessage);
        return;
      }

      // A compact turn carries neither the mention suffix nor the current note —
      // the provider drops the whole context envelope for it — so it consumed
      // neither. Marking the note sent would omit it from the next ordinary
      // prompt, and clearing the pills would drop context still staged.
      if (!preparedTurn.isCompact) {
        this.deps.getFileContextManager()?.markCurrentNoteSent();
        this.deps.getFileContextManager()?.clearAttachedPills();
      }

      this.deps.onSteerCommitted({
        displayContent,
        persistedContent: preparedTurn.persistedContent,
        currentNote: preparedTurn.isCompact
          ? undefined
          : preparedTurn.request.currentNotePath,
        images: request.images,
      });
    } catch {
      this.restoreQueuedMessageAfterSteerFailure(queuedMessage);
      new Notice(t('chat.queue.steerFailed'));
    }
  }

  /**
   * Team Chat DM removed-agent steer gate, run AFTER the reservation. Resolves `true` when the bound
   * agent still exists (proceed on the reserved steer). Otherwise rolls the reservation back —
   * restoring the queued message and clearing the pending-steer/in-flight flags so the queue is
   * editable again — and notifies: the agent was removed (a hard state — pick another agent) OR the
   * roster read REJECTS (transient — retry). Catching the rejection is load-bearing:
   * `AgentRosterStore.get` awaits `adapter.exists` OUTSIDE its try/catch, so a vault-I/O error
   * rejects the read; unhandled it would escape `steerQueuedMessage` AND strand the reservation in
   * the non-editable "Steering" state until the turn ends. Blocking on a failed read is fail-safe —
   * an unconfirmed agent must not steer a turn without its persona/model. The steer twin of the send
   * path's `confirmDmAgentOrRestoreComposer` (Round-59).
   */
  private async confirmSteerDmAgentOrRestore(
    dmAgentId: string,
    reservedMessage: QueuedMessage,
  ): Promise<boolean> {
    const { state } = this.deps;
    let removed = false;
    try {
      if ((await this.deps.plugin.agentRosterStore.get(dmAgentId)) !== null) return true;
      removed = true;
    } catch (error) {
      this.deps.plugin.logger.scope('team-chat').error('roster read failed during steer guard', error);
    }
    state.queuedMessage = reservedMessage;
    this.pendingSteerMessage = null;
    this.steerInFlight = false;
    this.updateQueueIndicator();
    // agentRemoved is a hard state (pick another agent); agentVerifyFailed is transient (retry).
    new Notice(t(removed ? 'teamChat.agentRemoved' : 'teamChat.agentVerifyFailed'));
    return false;
  }

  private restoreQueuedMessageAfterSteerFailure(
    message: QueuedMessage,
  ): void {
    const { state } = this.deps;
    this.clearPendingSteerState();
    if (state.cancelRequested) {
      this.updateQueueIndicator();
      return;
    }

    if (state.isStreaming) {
      state.queuedMessage = state.queuedMessage
        ? this.mergeQueuedMessages(message, state.queuedMessage)
        : message;
      this.updateQueueIndicator();
      return;
    }

    this.restoreMessageToInput(message, { mergeWithComposer: true });
    this.updateQueueIndicator();
  }
}
