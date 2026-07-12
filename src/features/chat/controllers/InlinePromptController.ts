import * as fs from 'fs';
import * as nodePath from 'path';

import type { ApprovalCallbackOptions } from '../../../core/runtime/types';
import type { ApprovalDecision, ExitPlanModeDecision, PlanApprovalDecision } from '../../../core/types';
import { buildPlanArtifactFromChatState, readPlanMarkdownFromArtifact } from '../../../utils/planArtifact';
import type { ChatState } from '../state/ChatState';
import type { InlineCardHandle, InlineCardMounter } from './inlineCardMount';

export interface InlinePromptControllerDeps {
  state: ChatState;
  getInputContainerEl: () => HTMLElement;
  /** Mounts the inline-prompt Vue cards (injected for Jest fakeability). */
  mountInlineCard: InlineCardMounter;
  hideThinkingIndicator: () => void;
  getPlanPathPrefix: () => string | undefined;
}

/**
 * Owns the inline prompts that block a turn on user input — tool-approval
 * cards, ask-user-question, exit-plan-mode, and the post-plan approval card —
 * plus the input-container hide/restore and the "needs attention" tab badge
 * that accompany them. Each prompt mounts a Vue card via the injected
 * {@link InlineCardMounter}; the card resolves through its `resolve` prop, and
 * `unmount` (which drives the card's `onBeforeUnmount → resolve(null)`) is the
 * idiomatic replacement for the legacy card's `destroy()`.
 */
export class InlinePromptController {
  private deps: InlinePromptControllerDeps;
  private pendingApprovalInline: InlineCardHandle | null = null;
  private pendingAskInline: InlineCardHandle | null = null;
  private pendingExitPlanModeInline: InlineCardHandle | null = null;
  private pendingPlanApproval: InlineCardHandle | null = null;
  private pendingPlanApprovalInvalidated = false;
  private inputContainerHideDepth = 0;

  constructor(deps: InlinePromptControllerDeps) {
    this.deps = deps;
  }

  async handleApprovalRequest(
    toolName: string,
    _input: Record<string, unknown>,
    description: string,
    approvalOptions?: ApprovalCallbackOptions,
  ): Promise<ApprovalDecision> {
    const parentEl = this.requireParentEl();

    return this.runBlockingPrompt<ApprovalDecision>(
      (resolve) => this.deps.mountInlineCard.mountApproval(parentEl, {
        resolve,
        toolName,
        description,
        approvalOptions,
      }),
      (handle) => { this.pendingApprovalInline = handle; },
      'cancel',
    );
  }

  async handleAskUserQuestion(
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, string | string[]> | null> {
    const parentEl = this.requireParentEl();

    return this.runBlockingPrompt<Record<string, string | string[]> | null>(
      (resolve) => this.deps.mountInlineCard.mountAsk(parentEl, { resolve, input, signal }),
      (handle) => { this.pendingAskInline = handle; },
      null,
    );
  }

  async handleExitPlanMode(
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ExitPlanModeDecision | null> {
    const { state } = this.deps;
    const parentEl = this.requireParentEl();

    const planFilePath = state.planFilePath;
    const { content, error } = this.readPlanContent(planFilePath);
    const allowedPrompts = Array.isArray(input.allowedPrompts)
      ? (input.allowedPrompts as Array<{ tool: string; prompt: string }>)
      : undefined;

    return this.runBlockingPrompt<ExitPlanModeDecision | null>(
      (resolve) => this.deps.mountInlineCard.mountExitPlanMode(parentEl, {
        resolve,
        signal,
        planPreview: content,
        planReadError: error,
        allowedPrompts,
        resolvePlanContent: () => content,
      }),
      (handle) => { this.pendingExitPlanModeInline = handle; },
      null,
    );
  }

  showPlanApproval(): Promise<{ decision: PlanApprovalDecision | null; invalidated: boolean }> {
    const inputContainerEl = this.deps.getInputContainerEl();
    const parentEl = inputContainerEl.parentElement;
    if (!parentEl) {
      return Promise.resolve({ decision: null, invalidated: false });
    }

    this.pendingPlanApprovalInvalidated = false;
    const artifact = buildPlanArtifactFromChatState({ planFilePath: this.deps.state.planFilePath });
    const { content, error } = readPlanMarkdownFromArtifact(artifact, this.deps.getPlanPathPrefix());

    return this.runBlockingPrompt<PlanApprovalDecision | null>(
      (resolve) => this.deps.mountInlineCard.mountPlanApproval(parentEl, {
        resolve,
        planPreview: content,
        planReadError: error,
      }),
      (handle) => { this.pendingPlanApproval = handle; },
      null,
    ).then((decision) => {
      const invalidated = this.pendingPlanApprovalInvalidated;
      this.pendingPlanApprovalInvalidated = false;
      return { decision, invalidated };
    });
  }

  dismissPendingApprovalPrompt(): void {
    this.pendingApprovalInline?.unmount();
    this.pendingApprovalInline = null;
  }

  dismissPendingApproval(): void {
    this.dismissPendingApprovalPrompt();
    this.pendingAskInline?.unmount();
    this.pendingAskInline = null;
    this.pendingExitPlanModeInline?.unmount();
    this.pendingExitPlanModeInline = null;
    this.dismissPendingPlanApproval(true);
    // UX-2: dismissing flushes every pending prompt above; clear the attention
    // flag so the tab badge returns to its idle state.
    this.deps.state.needsAttention = false;
    this.resetInputContainerVisibility();
  }

  /**
   * Shared blocking-prompt lifecycle: hides the thinking indicator + input
   * container, raises the "needs attention" badge, mounts the card, and resolves
   * when the card calls `resolve` (or `fallback` on unmount). Restores the input
   * container + clears attention exactly once on settlement. The card is
   * unmounted after a live resolve; an external dismiss unmounts it directly.
   */
  private runBlockingPrompt<T>(
    mount: (resolve: (value: T) => void) => InlineCardHandle,
    setPending: (handle: InlineCardHandle | null) => void,
    fallback: T,
  ): Promise<T> {
    const inputContainerEl = this.deps.getInputContainerEl();
    this.deps.hideThinkingIndicator();
    this.hideInputContainer(inputContainerEl);
    // UX-2: every inline prompt surfaces a tab-bar "needs attention" badge so
    // background tabs blocked on the user become visible without switching.
    this.deps.state.needsAttention = true;

    return new Promise<T>((resolve) => {
      let settled = false;
      let handle: InlineCardHandle | null = null;
      const finish = (value: T | null): void => {
        if (settled) return;
        settled = true;
        setPending(null);
        this.deps.state.needsAttention = false;
        this.restoreInputContainer(inputContainerEl);
        resolve(value === null ? fallback : value);
        // Defer the unmount out of a possible onBeforeUnmount reentry (when the
        // resolve came FROM an unmount). The handle is idempotent.
        const toUnmount = handle;
        handle = null;
        if (toUnmount) queueMicrotask(() => toUnmount.unmount());
      };
      handle = mount((value) => finish(value));
      if (settled) {
        // Card resolved synchronously during mount (e.g. an ask card with zero
        // questions resolves null in onMounted): finish() ran while `handle` was
        // still null and could not queue the unmount. Drop it here and don't
        // store the already-settled handle as pending.
        const toUnmount = handle;
        handle = null;
        queueMicrotask(() => toUnmount?.unmount());
      } else {
        setPending(handle);
      }
    });
  }

  private requireParentEl(): HTMLElement {
    const parentEl = this.deps.getInputContainerEl().parentElement;
    if (!parentEl) {
      throw new Error('Input container is detached from DOM');
    }
    return parentEl;
  }

  /** Reads the plan file for the exit-plan-mode card, gated to the plan dir. */
  private readPlanContent(planFilePath: string | null): { content: string | null; error: string | null } {
    if (!planFilePath) return { content: null, error: null };

    const planPathPrefix = this.deps.getPlanPathPrefix();
    const resolved = nodePath.resolve(planFilePath).replace(/\\/g, '/');
    if (!planPathPrefix || !resolved.includes(planPathPrefix)) {
      return { content: null, error: 'path outside allowed plan directory' };
    }

    try {
      const content = fs.readFileSync(planFilePath, 'utf-8');
      return { content: content.trim() || null, error: null };
    } catch (err) {
      return { content: null, error: err instanceof Error ? err.message : 'unknown error' };
    }
  }

  private dismissPendingPlanApproval(invalidated: boolean): void {
    if (!this.pendingPlanApproval) {
      return;
    }
    if (invalidated) {
      this.pendingPlanApprovalInvalidated = true;
    }
    this.pendingPlanApproval.unmount();
    this.pendingPlanApproval = null;
  }

  private hideInputContainer(inputContainerEl: HTMLElement): void {
    this.inputContainerHideDepth++;
    inputContainerEl.addClass('specorator-hidden');
  }

  private restoreInputContainer(inputContainerEl: HTMLElement): void {
    if (this.inputContainerHideDepth <= 0) return;
    this.inputContainerHideDepth--;
    if (this.inputContainerHideDepth === 0) {
      inputContainerEl.removeClass('specorator-hidden');
    }
  }

  private resetInputContainerVisibility(): void {
    if (this.inputContainerHideDepth > 0) {
      this.inputContainerHideDepth = 0;
      this.deps.getInputContainerEl().removeClass('specorator-hidden');
    }
  }
}
