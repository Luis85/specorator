import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import {
  DEFAULT_CHAT_PROVIDER_ID,
  type ProviderId,
  type ProviderSubagentLifecycleAdapter,
} from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import { parseTodoInput } from '../../../core/tools/todo';
import { extractResolvedAnswers, extractResolvedAnswersFromResultText } from '../../../core/tools/toolInput';
import {
  isWriteEditTool,
  skipsBlockedDetection,
  TOOL_ASK_USER_QUESTION,
  TOOL_TODO_WRITE,
  TOOL_WRITE,
} from '../../../core/tools/toolNames';
import { extractToolResultContent } from '../../../core/tools/toolResultContent';
import type { ChatMessage, StreamChunk, SubagentInfo, ToolCallInfo } from '../../../core/types';
import type { SDKToolUseResult } from '../../../core/types/diff';
import type SpecoratorPlugin from '../../../main';
import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
  type ScheduledAnimationFrame,
} from '../../../utils/animationFrame';
import { extractDiffData } from '../../../utils/diff';
import { toVaultRelativeOpenPath } from '../../../utils/fileLink';
import { hasStreamingMathDelimiters } from '../../../utils/markdownMath';
import { openSpecoratorProviderSettings } from '../../../utils/obsidianPrivateApi';
import { renderInlineRuntimeError } from '../rendering/InlineRuntimeError';
import type { MessageRenderer, RenderContentOptions } from '../rendering/MessageRenderer';
import { scrollMessagesToBottom } from '../rendering/scrollToBottom';
import { resolveSubagentLifecycleAdapter } from '../rendering/subagentLifecycleResolution';
import {
  isBlockedToolResult,
  renderToolCall,
  updateToolCallResult,
} from '../rendering/ToolCallRenderer';
import {
  createWriteEditBlock,
  finalizeWriteEditBlock,
  updateWriteEditWithDiff,
} from '../rendering/WriteEditRenderer';
import type { SubagentManager } from '../services/SubagentManager';
import type { ChatState } from '../state/ChatState';
import type { FileContextManager } from '../ui/FileContext';
import { collectEditedPathsFromToolCall, collectRemovedPathsFromToolCall } from '../utils/editedFiles';
import { ProviderLifecycleSubagentCoordinator } from './ProviderLifecycleSubagentCoordinator';
import { classifyRuntimeError } from './runtimeErrorClassification';
import { StreamingIndicator } from './streamingIndicator';
import {
  type BlockTransitionDecision,
  projectBlockTransition,
  projectCompactBoundary,
  type ProjectionBlockState,
  projectNoticeText,
  projectUsage,
} from './StreamProjection';
import { scheduleStreamContinuation } from './streamRenderBackoff';
import { SubagentStreamCoordinator } from './SubagentStreamCoordinator';
import { TextRenderCoordinator } from './TextRenderCoordinator';
import { ThinkingRenderCoordinator } from './ThinkingRenderCoordinator';
import {
  appendToolCallToMessage,
  createRunningToolCall,
  updateRenderedToolCallHeader,
} from './toolCallAppend';
import { ToolCallIndex } from './toolCallIndex';
import { notifyVaultForToolResult } from './vaultFileNotifier';

export interface StreamControllerDeps {
  plugin: SpecoratorPlugin;
  state: ChatState;
  renderer: MessageRenderer;
  subagentManager: SubagentManager;
  getMessagesEl: () => HTMLElement;
  getFileContextManager: () => FileContextManager | null;
  updateQueueIndicator: () => void;
  /** Get the agent service from the tab. */
  getAgentService?: () => ChatRuntime | null;
  /**
   * Re-dispatches the last turn for the active conversation. Wired to the retry
   * affordance on actionable runtime-error cards (UX-F/UX-J). Omitted when the
   * tab has no turn available to retry.
   */
  onRetryLastTurn?: () => void;
}

export class StreamController {
  private deps: StreamControllerDeps;
  private readonly textRender: TextRenderCoordinator;
  private readonly thinkingRender: ThinkingRenderCoordinator;
  private pendingToolOutputFrames = new Map<string, ScheduledAnimationFrame>();
  private pendingScrollFrame: ScheduledAnimationFrame | null = null;

  // O(1) tool-call lookup accelerator for the streaming hot path (avoids
  // per-chunk linear scans over a turn's accumulated tool calls). Lazily kept
  // in sync per message; always backed by the authoritative `msg.toolCalls`.
  private toolCallIndex = new ToolCallIndex();
  private indexedToolCallsMsg: ChatMessage | null = null;
  private indexedToolCallsCount = 0;

  // External observers of the neutral chunk stream (e.g. the work-order runner),
  // notified before normal processing so a card can mirror the live run.
  private streamObservers = new Set<(chunk: StreamChunk) => void>();
  /** True while replaying an auto-triggered (background) turn — see {@link setRenderingAutoTurn}. */
  private renderingAutoTurn = false;

  private readonly indicator: StreamingIndicator;
  private readonly subagents: SubagentStreamCoordinator;
  private readonly lifecycleSubagents: ProviderLifecycleSubagentCoordinator;

  constructor(deps: StreamControllerDeps) {
    this.deps = deps;
    this.indicator = new StreamingIndicator({
      state: deps.state,
      getMessagesEl: deps.getMessagesEl,
      updateQueueIndicator: deps.updateQueueIndicator,
    });
    this.subagents = new SubagentStreamCoordinator({
      state: deps.state,
      subagentManager: deps.subagentManager,
      getAgentService: deps.getAgentService,
      findToolCall: (msg, id) => this.findToolCall(msg, id),
      normalizeToolResultContent: (content) => this.normalizeToolResultContent(content),
      flushPendingTools: () => this.flushPendingTools(),
      showThinkingIndicator: () => this.showThinkingIndicator(),
      scrollToBottom: () => this.scrollToBottom(),
      recordEditedFiles: (toolCall) => {
        notifyVaultForToolResult(this.deps.plugin.app, toolCall);
        this.recordEditedFiles(toolCall);
      },
    });
    this.lifecycleSubagents = new ProviderLifecycleSubagentCoordinator({
      plugin: deps.plugin,
      state: deps.state,
      findToolCall: (msg, id) => this.findToolCall(msg, id),
      normalizeToolResultContent: (content) => this.normalizeToolResultContent(content),
      getSubagentLifecycleAdapter: (toolName) => this.getSubagentLifecycleAdapter(toolName),
      flushPendingTools: () => this.flushPendingTools(),
    });
    this.thinkingRender = new ThinkingRenderCoordinator({
      state: deps.state,
      renderer: deps.renderer,
      hideThinkingIndicator: () => this.hideThinkingIndicator(),
      getStreamingRenderOptions: (content) => this.getStreamingRenderOptions(content),
      scrollToBottom: () => this.scrollToBottom(),
      getMessagesWindow: () => this.getMessagesWindow(),
    });
    this.textRender = new TextRenderCoordinator({
      state: deps.state,
      renderer: deps.renderer,
      showWriting: () => this.indicator.showWriting(),
      hideThinkingIndicator: () => this.hideThinkingIndicator(),
      scrollToBottom: () => this.scrollToBottom(),
      getStreamingRenderOptions: (content) => this.getStreamingRenderOptions(content),
      shouldDeferMathRendering: () => this.shouldDeferMathRendering(),
      shouldCollapseStreamingResponse: () => this.shouldCollapseStreamingResponse(),
      getMessagesWindow: () => this.getMessagesWindow(),
    });
  }

  /**
   * Marks the controller as rendering an auto-triggered background turn (e.g. a
   * task-notification response replayed through this same controller). Such a
   * turn has no user prompt behind it, so a runtime-error card must suppress its
   * Retry affordance rather than re-dispatch the unrelated last chat turn. Set
   * around the auto-turn chunk loop and cleared in its `finally`.
   */
  setRenderingAutoTurn(active: boolean): void {
    this.renderingAutoTurn = active;
  }

  /**
   * Registers an observer that receives every neutral {@link StreamChunk} this
   * controller handles, for the lifetime of the returned disposer. Observer
   * errors are isolated so a faulty observer never breaks streaming.
   */
  addStreamObserver(observer: (chunk: StreamChunk) => void): () => void {
    this.streamObservers.add(observer);
    return () => {
      this.streamObservers.delete(observer);
    };
  }

  /**
   * Resolves a tool call by id in O(1). Lazily reindexes when the active
   * message changes and tail-indexes newly appended tool calls, so the cost is
   * amortized constant. Falls back to a linear scan via {@link ToolCallIndex},
   * keeping results correct regardless of index state.
   */
  private findToolCall(msg: ChatMessage, id: string): ToolCallInfo | undefined {
    const toolCalls = msg.toolCalls;
    const count = toolCalls?.length ?? 0;
    if (this.indexedToolCallsMsg !== msg) {
      this.toolCallIndex.reindex(toolCalls);
      this.indexedToolCallsMsg = msg;
      this.indexedToolCallsCount = count;
    } else if (count > this.indexedToolCallsCount) {
      for (let i = this.indexedToolCallsCount; i < count; i++) {
        this.toolCallIndex.add(toolCalls![i]);
      }
      this.indexedToolCallsCount = count;
    }
    return this.toolCallIndex.get(id, toolCalls);
  }


  private getActiveProviderId(): ProviderId {
    return this.deps.getAgentService?.()?.providerId ?? DEFAULT_CHAT_PROVIDER_ID;
  }

  private getSubagentLifecycleAdapter(toolName?: string): ProviderSubagentLifecycleAdapter | null {
    return resolveSubagentLifecycleAdapter(this.getActiveProviderId(), toolName);
  }

  private normalizeToolResultContent(content: unknown): string {
    return extractToolResultContent(content, { fallbackIndent: 2 });
  }

  // ============================================
  // Stream Chunk Handling
  // ============================================

  async handleStreamChunk(chunk: StreamChunk, msg: ChatMessage): Promise<void> {
    this.notifyStreamObservers(chunk);
    if (!(await this.routeContentChunk(chunk, msg))) {
      await this.routeLifecycleChunk(chunk, msg);
    }
    this.scrollToBottom();
  }

  /** Handles content/tool stream chunks. Returns false if `chunk` is not a content chunk. */
  private async routeContentChunk(chunk: StreamChunk, msg: ChatMessage): Promise<boolean> {
    switch (chunk.type) {
      case 'thinking':
        await this.applyBlockTransition(projectBlockTransition('thinking', this.blockState()), msg);
        await this.appendThinking(chunk.content);
        return true;

      case 'text':
        await this.applyBlockTransition(projectBlockTransition('text', this.blockState()), msg);
        msg.content += chunk.content;
        await this.appendText(chunk.content);
        return true;

      case 'tool_use':
        await this.applyBlockTransition(projectBlockTransition('tool_use', this.blockState()), msg);
        this.dispatchToolUseChunk(chunk, msg);
        return true;

      case 'tool_result':
        await this.handleToolResult(chunk, msg);
        return true;

      case 'subagent_tool_use':
      case 'subagent_tool_result':
        await this.subagents.handleSubagentChunk(chunk, msg);
        return true;

      case 'async_subagent_result':
        await this.subagents.handleAsyncSubagentResult(chunk);
        return true;

      case 'tool_output':
        this.handleToolOutput(chunk, msg);
        return true;

      default:
        return false;
    }
  }

  /** Handles turn-lifecycle stream chunks (notice/error/done/compaction/usage). */
  private async routeLifecycleChunk(chunk: StreamChunk, msg: ChatMessage): Promise<void> {
    switch (chunk.type) {
      case 'notice':
        this.flushPendingTools();
        await this.appendText(projectNoticeText(chunk));
        break;

      case 'error':
        await this.handleErrorChunk(chunk, msg);
        break;

      case 'done':
        // Flush any remaining pending tools
        this.flushPendingTools();
        await this.finalizeCurrentTextBlock(msg);
        break;

      case 'context_compacted':
        await this.handleContextCompactedChunk(msg);
        break;

      case 'usage':
        this.handleUsageChunk(chunk);
        break;

      default:
        break;
    }
  }

  private async handleContextCompactedChunk(msg: ChatMessage): Promise<void> {
    await this.applyBlockTransition(projectCompactBoundary(this.blockState()), msg);
    msg.contentBlocks = msg.contentBlocks || [];
    msg.contentBlocks.push({ type: 'context_compacted' });
    this.renderCompactBoundary();
  }

  private handleUsageChunk(chunk: Extract<StreamChunk, { type: 'usage' }>): void {
    const { state } = this.deps;
    const decision = projectUsage(chunk, {
      currentSessionId: this.deps.getAgentService?.()?.getSessionId() ?? null,
      subagentsSpawnedThisStream: this.deps.subagentManager.subagentsSpawnedThisStream,
      ignoreUsageUpdates: state.ignoreUsageUpdates,
      activeProviderModel: this.getActiveProviderModel(),
    });
    if (decision.action === 'update') {
      state.usage = decision.usage;
    }
  }

  /** Fans the neutral chunk out to registered observers; an observer error never breaks the stream. */
  private notifyStreamObservers(chunk: StreamChunk): void {
    if (this.streamObservers.size === 0) return;
    for (const observer of this.streamObservers) {
      try {
        observer(chunk);
      } catch {
        // An observer must never break the stream for the chat UI.
      }
    }
  }

  /** Current open-block snapshot the projection's block-transition decisions read. */
  private blockState(): ProjectionBlockState {
    const { state } = this.deps;
    return {
      hasOpenTextBlock: state.currentTextEl !== null,
      hasOpenThinkingBlock: state.currentThinkingState !== null,
    };
  }

  /** Applies a projection block-transition decision through the existing finalize/flush paths. */
  private async applyBlockTransition(
    decision: BlockTransitionDecision,
    msg: ChatMessage,
  ): Promise<void> {
    if (decision.flushPendingTools) {
      this.flushPendingTools();
    }
    if (decision.finalizeThinking) {
      await this.finalizeCurrentThinkingBlock(msg);
    }
    if (decision.finalizeText) {
      await this.finalizeCurrentTextBlock(msg);
    }
  }

  /** Routes a tool_use chunk to its specialized handler (subagent / output / lifecycle / regular). */
  private dispatchToolUseChunk(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage,
  ): void {
    if (this.subagents.dispatchToolUse(chunk, msg)) {
      return;
    }
    if (this.lifecycleSubagents.dispatchToolUse(chunk, msg)) {
      return;
    }

    this.handleRegularToolUse(chunk, msg);
  }

  // Finalizes open thinking + text blocks before the error card so the persisted
  // block order matches the live DOM (thinking → text → error) on reload, then
  // persists a structured block and renders an actionable recovery card.
  private async handleErrorChunk(
    chunk: { type: 'error'; content: string },
    msg: ChatMessage,
  ): Promise<void> {
    this.flushPendingTools();
    await this.finalizeCurrentThinkingBlock(msg);
    await this.finalizeCurrentTextBlock(msg);
    msg.contentBlocks = msg.contentBlocks || [];
    msg.contentBlocks.push({ type: 'runtime_error', content: chunk.content });
    this.renderRuntimeError(chunk.content);
  }

  // ============================================
  // Tool Use Handling
  // ============================================

  /**
   * Handles regular tool_use chunks by buffering them.
   * Tools are rendered when flushPendingTools is called (on next content type or tool_result).
   */
  private handleRegularToolUse(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage
  ): void {
    const { state } = this.deps;

    // Check if this is an update to an existing tool call
    const existingToolCall = this.findToolCall(msg, chunk.id);
    if (existingToolCall) {
      this.mergeExistingToolCallInput(existingToolCall, chunk.input, chunk.id);
      return;
    }

    // Create new tool call
    const toolCall = createRunningToolCall(chunk);
    appendToolCallToMessage(msg, toolCall);

    // Apply panel/plan side effects immediately, but still buffer the render
    this.applyToolInputSideEffects(chunk.name, chunk.input);

    // Buffer the tool call instead of rendering immediately
    if (state.currentContentEl) {
      state.pendingTools.set(chunk.id, {
        toolCall,
        parentEl: state.currentContentEl,
      });
      this.showThinkingIndicator();
    }
  }

  /**
   * Merges a later tool_use chunk's input into an existing tool call, applies the
   * same panel/plan side effects as a fresh tool, and refreshes the rendered
   * header if the block is already on screen. If still pending, the merged input
   * is already on the toolCall object and gets picked up at render time.
   */
  private mergeExistingToolCallInput(
    existingToolCall: ToolCallInfo,
    chunkInput: Record<string, unknown>,
    toolId: string,
  ): void {
    const newInput = chunkInput || {};
    if (Object.keys(newInput).length === 0) return;

    existingToolCall.input = { ...existingToolCall.input, ...newInput };

    // Re-run side effects on input updates (streaming may complete the input)
    this.applyToolInputSideEffects(existingToolCall.name, existingToolCall.input);

    const toolEl = this.deps.state.toolCallElements.get(toolId);
    if (toolEl) {
      updateRenderedToolCallHeader(
        this.deps.plugin.app,
        toolEl,
        existingToolCall.name,
        existingToolCall.input,
      );
    }
  }

  /**
   * Applies the immediate, render-independent side effects of a tool's input:
   * updating the todo panel for TodoWrite and capturing the plan file path for
   * Writes into the provider plan directory.
   */
  private applyToolInputSideEffects(name: string, input: Record<string, unknown>): void {
    if (name === TOOL_TODO_WRITE) {
      const todos = parseTodoInput(input);
      if (todos) {
        this.deps.state.currentTodos = todos;
      }
    }
    if (name === TOOL_WRITE) {
      this.capturePlanFilePath(input);
    }
  }

  private getActiveProviderModel(): string | undefined {
    const providerId = this.deps.getAgentService?.()?.providerId;
    if (!providerId) {
      return undefined;
    }

    const settings = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
      this.deps.plugin.settings,
      providerId,
    );
    return typeof settings.model === 'string' ? settings.model : undefined;
  }

  private shouldDeferMathRendering(): boolean {
    return this.deps.plugin.settings.deferMathRenderingDuringStreaming !== false;
  }

  private shouldCollapseStreamingResponse(): boolean {
    return this.deps.plugin.settings.collapseStreamingResponse !== false;
  }

  private getStreamingRenderOptions(content: string): RenderContentOptions | undefined {
    return this.shouldDeferMathRendering() && hasStreamingMathDelimiters(content)
      ? { deferMath: true }
      : undefined;
  }

  private capturePlanFilePath(input: Record<string, unknown>): void {
    const filePath = input.file_path as string | undefined;
    if (!filePath) return;

    const planPathPrefix = this.deps.getAgentService?.()?.getCapabilities().planPathPrefix;
    if (planPathPrefix && filePath.replace(/\\/g, '/').includes(planPathPrefix)) {
      this.deps.state.planFilePath = filePath;
    }
  }

  /**
   * Flushes all pending tool calls by rendering them.
   * Called when a different content type arrives or stream ends.
   */
  private flushPendingTools(): void {
    const { state } = this.deps;

    if (state.pendingTools.size === 0) {
      return;
    }

    // Render pending tools in order (Map preserves insertion order)
    for (const toolId of state.pendingTools.keys()) {
      this.renderPendingTool(toolId);
    }

    state.pendingTools.clear();
  }

  /**
   * Renders a single pending tool call and moves it from pending to rendered state.
   */
  private renderPendingTool(toolId: string): void {
    const { state } = this.deps;
    const pending = state.pendingTools.get(toolId);
    if (!pending) return;

    const { toolCall, parentEl } = pending;
    if (!parentEl) return;
    if (isWriteEditTool(toolCall.name)) {
      const writeEditState = createWriteEditBlock(this.deps.plugin.app, parentEl, toolCall, { initiallyExpanded: this.deps.plugin.settings.expandFileEditsByDefault === true });
      state.writeEditStates.set(toolId, writeEditState);
      state.toolCallElements.set(toolId, writeEditState.wrapperEl);
    } else {
      renderToolCall(this.deps.plugin.app, parentEl, toolCall, state.toolCallElements);
    }
    state.pendingTools.delete(toolId);
  }

  private handleToolOutput(
    chunk: { type: 'tool_output'; id: string; content: string },
    msg: ChatMessage,
  ): void {
    const { state } = this.deps;

    if (state.pendingTools.has(chunk.id)) {
      this.renderPendingTool(chunk.id);
    }

    const existingToolCall = this.findToolCall(msg, chunk.id);
    if (!existingToolCall) {
      return;
    }

    existingToolCall.result = (existingToolCall.result ?? '') + chunk.content;
    this.scheduleToolOutputRender(chunk.id, existingToolCall);
    this.showThinkingIndicator();
  }

  private async handleToolResult(
    chunk: { type: 'tool_result'; id: string; content: string; isError?: boolean; toolUseResult?: SDKToolUseResult },
    msg: ChatMessage
  ): Promise<void> {
    const { state } = this.deps;
    const normalizedContent = this.normalizeToolResultContent(chunk.content);

    if (await this.subagents.handleToolResult(chunk, msg)) {
      return;
    }

    if (this.lifecycleSubagents.handleProviderSubagentResult(chunk, msg)) {
      this.showThinkingIndicator();
      return;
    }

    // Check if tool is still pending (buffered) - render it now before applying result
    if (state.pendingTools.has(chunk.id)) {
      this.renderPendingTool(chunk.id);
    }

    const existingToolCall = this.findToolCall(msg, chunk.id);
    if (existingToolCall) {
      this.applyRegularToolResult(chunk, existingToolCall, normalizedContent);
    }

    this.showThinkingIndicator();
  }

  // Applies a regular (non-subagent) tool_result: status (error → blocked →
  // completed, with the skipsBlockedDetection exemption), result text,
  // AskUserQuestion answers, the rendered block, then the vault refresh.
  private applyRegularToolResult(
    chunk: { id: string; isError?: boolean; toolUseResult?: SDKToolUseResult },
    existingToolCall: ToolCallInfo,
    normalizedContent: string,
  ): void {
    const isBlocked = isBlockedToolResult(normalizedContent, chunk.isError);

    // Tools that resolve via dedicated callbacks (not content-based) skip
    // blocked detection — their status is determined solely by isError
    if (chunk.isError) {
      existingToolCall.status = 'error';
    } else if (!skipsBlockedDetection(existingToolCall.name) && isBlocked) {
      existingToolCall.status = 'blocked';
    } else {
      existingToolCall.status = 'completed';
    }
    existingToolCall.result = normalizedContent;

    if (existingToolCall.name === TOOL_ASK_USER_QUESTION) {
      const answers =
        extractResolvedAnswers(chunk.toolUseResult) ??
        extractResolvedAnswersFromResultText(normalizedContent);
      if (answers) existingToolCall.resolvedAnswers = answers;
    }

    this.renderToolResultBlock(chunk, existingToolCall, isBlocked);

    if (!chunk.isError && !isBlocked) {
      notifyVaultForToolResult(this.deps.plugin.app, existingToolCall);
      this.recordEditedFiles(existingToolCall);
    }
  }

  /**
   * Adds the file(s) a successful Write/Edit/NotebookEdit/apply_patch touched to
   * the per-tab "files changed by the agent" list. Only in-vault paths are listed.
   * Resolution does NOT require the file to be indexed yet: a just-created file's
   * vault discovery (scheduled by {@link notifyVaultForToolResult}) is still in
   * flight here, so an existence check would drop brand-new files. The chip's
   * click handler re-resolves with an existence check and surfaces a Notice if the
   * file is truly gone. Opt-out via the `showAgentEditedFiles` setting. Runs after
   * {@link renderToolResultBlock} so the Write/Edit diff is already on the tool
   * call for the created-vs-edited heuristic.
   */
  private recordEditedFiles(toolCall: ToolCallInfo): void {
    if (this.deps.plugin.settings.showAgentEditedFiles === false) return;

    const { app } = this.deps.plugin;

    for (const raw of collectEditedPathsFromToolCall(toolCall)) {
      const openable = toVaultRelativeOpenPath(app, raw.path);
      if (openable) this.deps.state.recordEditedFile({ path: openable, changeKind: raw.changeKind });
    }

    // A delete or rename vacates a file the list may already show; drop that chip.
    for (const removed of collectRemovedPathsFromToolCall(toolCall)) {
      const openable = toVaultRelativeOpenPath(app, removed);
      if (openable) this.deps.state.removeEditedFile(openable);
    }
  }

  /** Finalizes the write/edit diff block or refreshes the generic tool block for a result. */
  private renderToolResultBlock(
    chunk: { id: string; isError?: boolean; toolUseResult?: SDKToolUseResult },
    existingToolCall: ToolCallInfo,
    isBlocked: boolean,
  ): void {
    const { state } = this.deps;
    const writeEditState = state.writeEditStates.get(chunk.id);
    if (writeEditState && isWriteEditTool(existingToolCall.name)) {
      if (!chunk.isError && !isBlocked) {
        const diffData = extractDiffData(chunk.toolUseResult, existingToolCall);
        if (diffData) {
          existingToolCall.diffData = diffData;
          updateWriteEditWithDiff(writeEditState, diffData);
        }
      }
      finalizeWriteEditBlock(writeEditState, chunk.isError || isBlocked);
      return;
    }

    this.cancelPendingToolOutputRender(chunk.id);
    updateToolCallResult(
      this.deps.plugin.app,
      chunk.id,
      existingToolCall,
      state.toolCallElements,
    );
  }

  // ============================================
  // Text Block Management
  // ============================================

  appendText(text: string): Promise<void> {
    return this.textRender.append(text);
  }

  finalizeCurrentTextBlock(msg?: ChatMessage): Promise<void> {
    return this.textRender.finalize(msg);
  }

  private scheduleToolOutputRender(toolId: string, toolCall: ToolCallInfo): void {
    if (this.pendingToolOutputFrames.has(toolId)) return;

    // Large tool output (e.g. long Bash logs) re-renders the whole growing result every
    // frame. The structured tool renderers (line clamping, expand/collapse) make a safe
    // delta-append impractical, so we apply the same size-aware backoff used for text to
    // cap the re-render rate; the final result is rendered exactly on tool_result.
    const render = () => {
      this.pendingToolOutputFrames.delete(toolId);
      updateToolCallResult(
        this.deps.plugin.app,
        toolId,
        toolCall,
        this.deps.state.toolCallElements,
      );
      this.scrollToBottom();
    };
    const frame = scheduleStreamContinuation(
      toolCall.result ?? '',
      this.getMessagesWindow(),
      render,
    );
    this.pendingToolOutputFrames.set(toolId, frame);
  }

  private cancelPendingToolOutputRender(toolId: string): void {
    const frame = this.pendingToolOutputFrames.get(toolId);
    if (!frame) return;

    cancelScheduledAnimationFrame(frame);
    this.pendingToolOutputFrames.delete(toolId);
  }

  private cancelPendingToolOutputRenders(): void {
    for (const frame of this.pendingToolOutputFrames.values()) {
      cancelScheduledAnimationFrame(frame);
    }
    this.pendingToolOutputFrames.clear();
  }

  // ============================================
  // Thinking Block Management
  // ============================================

  appendThinking(content: string): Promise<void> {
    return this.thinkingRender.append(content);
  }

  finalizeCurrentThinkingBlock(msg?: ChatMessage): Promise<void> {
    return this.thinkingRender.finalize(msg);
  }

  /** Forwarded from SubagentManager (via tab wiring) when an async subagent's state changes. */
  onAsyncSubagentStateChange(subagent: SubagentInfo): void {
    this.subagents.onAsyncSubagentStateChange(subagent);
  }

  // ============================================
  // Thinking Indicator
  // ============================================

  /**
   * Shows the debounced "thinking" status indicator beneath the active turn.
   * Public because InputController and tabRuntimeHost drive it too; delegates to
   * the shared {@link StreamingIndicator}.
   */
  showThinkingIndicator(overrideText?: string, overrideCls?: string): void {
    this.indicator.show(overrideText, overrideCls);
  }

  /** Hides the thinking indicator and cancels any pending show timeout. */
  hideThinkingIndicator(): void {
    this.indicator.hide();
  }

  // ============================================
  // Compact Boundary
  // ============================================

  // ============================================
  // Runtime Error Card (UX-F/UX-J)
  // ============================================

  /**
   * Classifies a runtime `error` chunk and renders an actionable recovery card.
   * Open-settings and retry callbacks are wired only when the underlying surface
   * is available, so the card never offers an action it can't perform.
   */
  private renderRuntimeError(content: string): void {
    const { state, plugin } = this.deps;
    if (!state.currentContentEl) return;

    this.hideThinkingIndicator();

    const kind = classifyRuntimeError(content);
    const providerId = this.getActiveProviderId();

    const onOpenSettings =
      kind === 'cli-not-found' || kind === 'unauthenticated'
        ? () => {
            openSpecoratorProviderSettings(plugin.app, plugin.manifest.id, providerId);
          }
        : undefined;

    // Retry re-dispatches the *user's* last turn, so it must not appear on errors
    // from an auto-triggered background turn — there is no user prompt behind it,
    // and retrying would resend an unrelated chat turn (duplicating work).
    const onRetry =
      !this.renderingAutoTurn && this.deps.onRetryLastTurn
        ? () => this.deps.onRetryLastTurn?.()
        : undefined;

    renderInlineRuntimeError(state.currentContentEl, {
      kind,
      content,
      providerId,
      onOpenSettings,
      onRetry,
    });
  }

  private renderCompactBoundary(): void {
    const { state } = this.deps;
    if (!state.currentContentEl) return;
    this.hideThinkingIndicator();
    const el = state.currentContentEl.createDiv({ cls: 'specorator-compact-boundary' });
    el.createSpan({ cls: 'specorator-compact-boundary-label', text: 'Conversation compacted' });
  }

  // ============================================
  // Utilities
  // ============================================

  /** Scrolls messages to bottom if auto-scroll is enabled. */
  private scrollToBottom(): void {
    if (this.pendingScrollFrame !== null) return;

    this.pendingScrollFrame = scheduleAnimationFrame(() => {
      this.pendingScrollFrame = null;
      this.applyScrollToBottom();
    }, this.getMessagesWindow());
  }

  private applyScrollToBottom(): void {
    const { state, plugin } = this.deps;
    if (!(plugin.settings.enableAutoScroll ?? true)) return;
    // `autoScrollEnabled` is the pinned-to-bottom flag: the scroll handler flips it off
    // when the user scrolls up and back on when they return to the bottom. Gating on it here
    // (instead of measuring scrollHeight every chunk) keeps streaming off the layout hot path.
    if (!state.autoScrollEnabled) return;

    scrollMessagesToBottom(this.deps.getMessagesEl());
  }

  private cancelPendingScroll(): void {
    if (this.pendingScrollFrame === null) return;

    cancelScheduledAnimationFrame(this.pendingScrollFrame);
    this.pendingScrollFrame = null;
  }

  private getMessagesWindow(): Window | null {
    return this.deps.getMessagesEl().ownerDocument.defaultView ?? null;
  }

  resetStreamingState(): void {
    const { state } = this.deps;
    this.textRender.cancel();
    this.thinkingRender.cancel();
    this.cancelPendingToolOutputRenders();
    this.cancelPendingScroll();
    this.hideThinkingIndicator();
    state.currentContentEl = null;
    state.currentTextEl = null;
    state.currentTextContent = '';
    state.currentThinkingState = null;
    this.deps.subagentManager.resetStreamingState();
    state.pendingTools.clear();
    // Reset response timer (duration already captured at this point)
    state.responseStartTime = null;
    void this.deps.plugin.gitStatusWatcher?.refresh();
  }
}
