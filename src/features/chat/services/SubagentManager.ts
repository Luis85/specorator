import { existsSync, readFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, sep } from 'path';

import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { ProviderTaskResultInterpreter } from '../../../core/providers/types';
import { extractToolResultContent } from '../../../core/tools/toolResultContent';
import type {
  SubagentInfo,
  ToolCallInfo,
} from '../../../core/types';
import { extractFinalResultFromSubagentJsonl } from '../../../utils/subagentJsonl';
import type { PendingToolCall } from '../state/types';
import { buildPendingTaskCall, spawnPendingTask } from './pendingTaskSpawn';
import {
  extractAgentIdFromRecord,
  hasTerminalTaskStatus,
  isRecord,
  isTerminalTaskStatusValue,
  parsedResultIndicatesRunning,
  parseJsonRecord,
  plainPayloadIndicatesRunning,
} from './subagentResultParsing';
import {
  createSyncSubagentInfo,
  finalizeSyncSubagentInfo,
  mergeSubagentToolCall,
  setSubagentToolResult,
} from './subagentTaskState';

export type SubagentStateChangeCallback = (subagent: SubagentInfo) => void;

export type HandleTaskResult =
  | { action: 'buffered' }
  | { action: 'created_sync'; info: SubagentInfo }
  | { action: 'created_async'; info: SubagentInfo }
  | { action: 'label_updated' };

export interface RenderPendingResult {
  mode: 'sync' | 'async';
  info: SubagentInfo;
}


function parseJsonValue(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
}

export class SubagentManager {
  private static readonly TRUSTED_OUTPUT_EXT = '.output';
  private static readonly TRUSTED_TMP_ROOTS = SubagentManager.resolveTrustedTmpRoots();

  private syncSubagents: Map<string, SubagentInfo> = new Map();
  private pendingTasks: Map<string, PendingToolCall> = new Map();
  private _spawnedThisStream = 0;

  private activeAsyncSubagents: Map<string, SubagentInfo> = new Map();
  private pendingAsyncSubagents: Map<string, SubagentInfo> = new Map();
  private taskIdToAgentId: Map<string, string> = new Map();
  private outputToolIdToAgentId: Map<string, string> = new Map();
  /**
   * taskToolId → canonical async info, outliving `activeAsyncSubagents` (which
   * drops entries at terminal) so late label-update tool_use replays still find
   * their target. Cleared only by `clear()`.
   */
  private asyncInfos: Map<string, SubagentInfo> = new Map();

  private onStateChange: SubagentStateChangeCallback;
  private taskResultInterpreter: ProviderTaskResultInterpreter;

  constructor(
    onStateChange: SubagentStateChangeCallback,
    taskResultInterpreter: ProviderTaskResultInterpreter = ProviderRegistry.getTaskResultInterpreter(),
  ) {
    this.onStateChange = onStateChange;
    this.taskResultInterpreter = taskResultInterpreter;
  }

  public setCallback(callback: SubagentStateChangeCallback): void {
    this.onStateChange = callback;
  }

  public setTaskResultInterpreter(interpreter: ProviderTaskResultInterpreter): void {
    this.taskResultInterpreter = interpreter;
  }

  // ============================================
  // Unified Subagent Entry Point
  // ============================================

  /**
   * Handles an Agent tool_use chunk with minimal buffering to determine sync vs async.
   * Returns a typed result so StreamController can update messages accordingly.
   * `hasActiveMessage` gates creation the way the detached `currentContentEl`
   * sentinel used to: a Task arriving outside an active assistant turn buffers
   * until one exists.
   */
  public handleTaskToolUse(
    taskToolId: string,
    taskInput: Record<string, unknown>,
    hasActiveMessage: boolean
  ): HandleTaskResult {
    // Already created as sync → update label only
    const existingSyncInfo = this.syncSubagents.get(taskToolId);
    if (existingSyncInfo) {
      this.updateSubagentLabel(existingSyncInfo, taskInput);
      return { action: 'label_updated' };
    }

    // Already created as async → update label only
    const existingAsyncInfo = this.asyncInfos.get(taskToolId);
    if (existingAsyncInfo) {
      this.updateSubagentLabel(existingAsyncInfo, taskInput);
      return { action: 'label_updated' };
    }

    // Already buffered → merge input and try to create
    if (this.pendingTasks.has(taskToolId)) {
      return this.resumeBufferedTask(taskToolId, taskInput, hasActiveMessage);
    }

    // New Task outside an active assistant message — buffer for later
    if (!hasActiveMessage) {
      this.pendingTasks.set(taskToolId, {
        toolCall: buildPendingTaskCall(taskToolId, taskInput),
        canRender: false,
      });
      return { action: 'buffered' };
    }

    const mode = this.resolveTaskMode(taskInput);
    if (!mode) {
      this.pendingTasks.set(taskToolId, {
        toolCall: buildPendingTaskCall(taskToolId, taskInput),
        canRender: true,
      });
      return { action: 'buffered' };
    }

    this._spawnedThisStream++;
    if (mode === 'async') {
      return this.createAsyncTask(taskToolId, taskInput);
    }
    return this.createSyncTask(taskToolId, taskInput);
  }

  /**
   * Resolves an already-buffered Task: merges the latest input, unlocks creation
   * if an active message just arrived, and creates only once `run_in_background`
   * is explicitly known. Mode is never locked early — sync fallback is handled
   * when child chunks or the tool_result confirm sync.
   */
  private resumeBufferedTask(
    taskToolId: string,
    taskInput: Record<string, unknown>,
    hasActiveMessage: boolean,
  ): HandleTaskResult {
    const pending = this.pendingTasks.get(taskToolId);
    if (!pending) return { action: 'buffered' };

    const newInput = taskInput || {};
    if (Object.keys(newInput).length > 0) {
      pending.toolCall.input = { ...pending.toolCall.input, ...newInput };
    }
    if (hasActiveMessage) {
      pending.canRender = true;
    }

    if (this.resolveTaskMode(pending.toolCall.input)) {
      const result = this.renderPendingTask(taskToolId, hasActiveMessage);
      if (result) {
        return result.mode === 'sync'
          ? { action: 'created_sync', info: result.info }
          : { action: 'created_async', info: result.info };
      }
    }
    return { action: 'buffered' };
  }

  // ============================================
  // Pending Task Resolution
  // ============================================

  public hasPendingTask(toolId: string): boolean {
    return this.pendingTasks.has(toolId);
  }

  /**
   * Creates a buffered pending task's subagent. Called when a child chunk or
   * tool_result confirms the task is sync, or when run_in_background becomes
   * known. Creation proceeds when a message is active NOW or was active when
   * the task was buffered/last merged (the old parentEl-override fallback).
   */
  public renderPendingTask(
    toolId: string,
    hasActiveMessage = false
  ): RenderPendingResult | null {
    const pending = this.pendingTasks.get(toolId);
    if (!pending) return null;

    const input = pending.toolCall.input;
    if (!hasActiveMessage && !pending.canRender) return null;

    this.pendingTasks.delete(toolId);

    return spawnPendingTask(
      input.run_in_background === true,
      (mode) => mode === 'async'
        ? this.createAsyncTask(pending.toolCall.id, input)
        : this.createSyncTask(pending.toolCall.id, input),
      () => { this._spawnedThisStream++; },
    );
  }

  /**
   * Resolves a pending Task when its own tool_result arrives.
   * If mode is still unknown, infer async from task result shape (agent_id/agentId),
   * otherwise fall back to sync so it never remains pending indefinitely.
   */
  public renderPendingTaskFromTaskResult(
    toolId: string,
    taskResult: unknown,
    isError: boolean,
    hasActiveMessage = false,
    taskToolUseResult?: unknown
  ): RenderPendingResult | null {
    const pending = this.pendingTasks.get(toolId);
    if (!pending) return null;

    const input = pending.toolCall.input;
    if (!hasActiveMessage && !pending.canRender) return null;

    const explicitMode = this.resolveTaskMode(input);
    const taskResultText = extractToolResultContent(taskResult, { fallbackIndent: 2 });
    const inferredMode = explicitMode
      ?? this.inferModeFromTaskResult(taskResultText, isError, taskToolUseResult);

    this.pendingTasks.delete(toolId);

    return spawnPendingTask(
      inferredMode === 'async',
      (mode) => mode === 'async'
        ? this.createAsyncTask(pending.toolCall.id, input)
        : this.createSyncTask(pending.toolCall.id, input),
      () => { this._spawnedThisStream++; },
    );
  }

  // ============================================
  // Sync Subagent Operations
  // ============================================

  public getSyncSubagent(toolId: string): SubagentInfo | undefined {
    return this.syncSubagents.get(toolId);
  }

  /**
   * Cursor embeds sync subagent tool activity inside the Task tool_result payload.
   * Hydrate those nested tools before finalizeSyncSubagent removes the live state.
   */
  public hydrateNestedSyncToolsFromTaskResult(
    taskToolId: string,
    toolUseResult?: unknown,
  ): void {
    const nested = this.taskResultInterpreter.extractNestedToolCalls?.(
      toolUseResult,
      taskToolId,
    );
    if (!nested?.length) {
      return;
    }

    const syncInfo = this.syncSubagents.get(taskToolId);
    if (!syncInfo) {
      return;
    }

    for (const toolCall of nested) {
      mergeSubagentToolCall(syncInfo, toolCall);
    }
  }

  public addSyncToolCall(parentToolUseId: string, toolCall: ToolCallInfo): void {
    const syncInfo = this.syncSubagents.get(parentToolUseId);
    if (!syncInfo) return;
    mergeSubagentToolCall(syncInfo, toolCall);
  }

  public updateSyncToolResult(
    parentToolUseId: string,
    toolId: string,
    toolCall: ToolCallInfo
  ): void {
    const syncInfo = this.syncSubagents.get(parentToolUseId);
    if (!syncInfo) return;
    setSubagentToolResult(syncInfo, toolId, toolCall);
  }

  public finalizeSyncSubagent(
    toolId: string,
    result: unknown,
    isError: boolean,
    toolUseResult?: unknown
  ): SubagentInfo | null {
    const syncInfo = this.syncSubagents.get(toolId);
    if (!syncInfo) return null;

    const resultText = extractToolResultContent(result, { fallbackIndent: 2 });
    const extractedResult = this.extractAgentResult(resultText, '', toolUseResult);
    finalizeSyncSubagentInfo(syncInfo, extractedResult, isError);
    this.syncSubagents.delete(toolId);

    return syncInfo;
  }

  // ============================================
  // Async Subagent Lifecycle
  // ============================================

  public handleTaskToolResult(
    taskToolId: string,
    result: unknown,
    isError?: boolean,
    toolUseResult?: unknown
  ): void {
    const subagent = this.pendingAsyncSubagents.get(taskToolId);
    if (!subagent) return;
    const resultText = extractToolResultContent(result, { fallbackIndent: 2 });

    if (isError) {
      this.transitionToError(subagent, taskToolId, resultText || 'Task failed to start');
      return;
    }

    const agentId = this.taskResultInterpreter.extractAgentId(toolUseResult) ?? this.parseAgentId(resultText);

    if (!agentId) {
      const truncatedResult = resultText.length > 100 ? resultText.substring(0, 100) + '...' : resultText;
      this.transitionToError(subagent, taskToolId, `Failed to parse agent_id. Result: ${truncatedResult}`);
      return;
    }

    subagent.asyncStatus = 'running';
    subagent.agentId = agentId;
    subagent.startedAt = Date.now();

    this.pendingAsyncSubagents.delete(taskToolId);
    this.activeAsyncSubagents.set(agentId, subagent);
    this.taskIdToAgentId.set(taskToolId, agentId);

    this.trackAsyncInfo(subagent);
    this.onStateChange(subagent);
  }

  public handleAgentOutputToolUse(toolCall: ToolCallInfo): void {
    const agentId = this.extractAgentIdFromInput(toolCall.input);
    if (!agentId) return;

    const subagent = this.activeAsyncSubagents.get(agentId);
    if (!subagent) return;

    subagent.outputToolId = toolCall.id;
    this.outputToolIdToAgentId.set(toolCall.id, agentId);
  }

  public handleAgentOutputToolResult(
    toolId: string,
    result: unknown,
    isError: boolean,
    toolUseResult?: unknown
  ): SubagentInfo | undefined {
    const resultText = extractToolResultContent(result, { fallbackIndent: 2 });
    let agentId = this.outputToolIdToAgentId.get(toolId);
    let subagent = agentId ? this.activeAsyncSubagents.get(agentId) : undefined;

    if (!subagent) {
      const inferredAgentId = this.inferAgentIdFromResult(resultText);
      if (inferredAgentId) {
        agentId = inferredAgentId;
        subagent = this.activeAsyncSubagents.get(inferredAgentId);
      }
    }

    if (!subagent) return undefined;

    if (agentId) {
      subagent.agentId = subagent.agentId || agentId;
      this.outputToolIdToAgentId.set(toolId, agentId);
    }

    if (subagent.asyncStatus !== 'running') {
      return undefined;
    }

    const stillRunning = this.isStillRunningResult(resultText, isError);
    if (stillRunning) {
      this.outputToolIdToAgentId.delete(toolId);
      return subagent;
    }

    const extractedResult = this.extractAgentResult(resultText, agentId ?? '', toolUseResult);

    // The chunk's is_error flag can be unreliable for async subagent results
    // (SDK may set is_error on the content block even when the agent succeeded).
    // Prefer the structured toolUseResult to determine actual error status.
    const finalStatus = this.taskResultInterpreter.resolveTerminalStatus(
      toolUseResult,
      isError ? 'error' : 'completed',
    );

    subagent.asyncStatus = finalStatus;
    subagent.status = finalStatus;
    subagent.result = extractedResult;
    subagent.completedAt = Date.now();

    if (agentId) this.activeAsyncSubagents.delete(agentId);
    this.outputToolIdToAgentId.delete(toolId);

    this.trackAsyncInfo(subagent);
    this.onStateChange(subagent);
    return subagent;
  }

  public handleAsyncSubagentResult(
    agentId: string,
    status: 'completed' | 'error',
    result?: string
  ): SubagentInfo | undefined {
    const subagent = this.activeAsyncSubagents.get(agentId);
    if (!subagent || subagent.asyncStatus !== 'running') {
      return undefined;
    }

    subagent.agentId = subagent.agentId || agentId;
    subagent.asyncStatus = status;
    subagent.status = status;
    subagent.result = result?.trim() || (status === 'error' ? 'Background task failed.' : 'Background task completed.');
    subagent.completedAt = Date.now();

    this.activeAsyncSubagents.delete(agentId);
    for (const [toolId, mappedAgentId] of this.outputToolIdToAgentId.entries()) {
      if (mappedAgentId === agentId) {
        this.outputToolIdToAgentId.delete(toolId);
      }
    }

    this.trackAsyncInfo(subagent);
    this.onStateChange(subagent);
    return subagent;
  }

  public isPendingAsyncTask(taskToolId: string): boolean {
    return this.pendingAsyncSubagents.has(taskToolId);
  }

  public isLinkedAgentOutputTool(toolId: string): boolean {
    return this.outputToolIdToAgentId.has(toolId);
  }

  public getByTaskId(taskToolId: string): SubagentInfo | undefined {
    const pending = this.pendingAsyncSubagents.get(taskToolId);
    if (pending) return pending;

    const agentId = this.taskIdToAgentId.get(taskToolId);
    if (agentId) {
      return this.activeAsyncSubagents.get(agentId);
    }

    return undefined;
  }

  /**
   * Re-renders an async subagent after data-only updates (for example,
   * hydrating tool calls from SDK sidecar files) without changing lifecycle state.
   */
  public refreshAsyncSubagent(subagent: SubagentInfo): void {
    this.trackAsyncInfo(subagent);
    this.onStateChange(subagent);
  }

  // ============================================
  // Hook State
  // ============================================

  public hasRunningSubagents(): boolean {
    // pendingAsyncSubagents: awaiting agent_id; activeAsyncSubagents: only holds running entries
    return this.pendingAsyncSubagents.size > 0 || this.activeAsyncSubagents.size > 0;
  }

  // ============================================
  // Lifecycle
  // ============================================

  public get subagentsSpawnedThisStream(): number {
    return this._spawnedThisStream;
  }

  public resetSpawnedCount(): void {
    this._spawnedThisStream = 0;
  }

  public resetStreamingState(): void {
    this.syncSubagents.clear();
    this.pendingTasks.clear();
  }

  public orphanAllActive(): SubagentInfo[] {
    const orphaned: SubagentInfo[] = [];

    for (const subagent of this.pendingAsyncSubagents.values()) {
      this.markOrphaned(subagent);
      orphaned.push(subagent);
    }

    for (const subagent of this.activeAsyncSubagents.values()) {
      if (subagent.asyncStatus === 'running') {
        this.markOrphaned(subagent);
        orphaned.push(subagent);
      }
    }

    this.pendingAsyncSubagents.clear();
    this.activeAsyncSubagents.clear();
    this.taskIdToAgentId.clear();
    this.outputToolIdToAgentId.clear();

    return orphaned;
  }

  public clear(): void {
    this.syncSubagents.clear();
    this.pendingTasks.clear();
    this.pendingAsyncSubagents.clear();
    this.activeAsyncSubagents.clear();
    this.taskIdToAgentId.clear();
    this.outputToolIdToAgentId.clear();
    this.asyncInfos.clear();
  }

  // ============================================
  // Private: State Transitions
  // ============================================

  private markOrphaned(subagent: SubagentInfo): void {
    subagent.asyncStatus = 'orphaned';
    subagent.status = 'error';
    subagent.result = 'Conversation ended before task completed';
    subagent.completedAt = Date.now();
    this.trackAsyncInfo(subagent);
    this.onStateChange(subagent);
  }

  private transitionToError(subagent: SubagentInfo, taskToolId: string, errorResult: string): void {
    subagent.asyncStatus = 'error';
    subagent.status = 'error';
    subagent.result = errorResult;
    subagent.completedAt = Date.now();
    this.pendingAsyncSubagents.delete(taskToolId);
    this.trackAsyncInfo(subagent);
    this.onStateChange(subagent);
  }

  // ============================================
  // Private: Task Creation
  // ============================================

  private createSyncTask(
    taskToolId: string,
    taskInput: Record<string, unknown>
  ): HandleTaskResult {
    const info = createSyncSubagentInfo(taskToolId, taskInput);
    this.syncSubagents.set(taskToolId, info);
    return { action: 'created_sync', info };
  }

  private createAsyncTask(
    taskToolId: string,
    taskInput: Record<string, unknown>
  ): HandleTaskResult {
    const description = (taskInput.description as string) || 'Background task';
    const prompt = (taskInput.prompt as string) || '';

    const info: SubagentInfo = {
      id: taskToolId,
      description,
      prompt,
      mode: 'async',
      isExpanded: false,
      status: 'running',
      toolCalls: [],
      asyncStatus: 'pending',
    };

    this.pendingAsyncSubagents.set(taskToolId, info);
    this.asyncInfos.set(taskToolId, info);

    return { action: 'created_async', info };
  }

  // ============================================
  // Private: Label Update
  // ============================================

  private updateSubagentLabel(
    info: SubagentInfo,
    newInput: Record<string, unknown>
  ): void {
    if (!newInput || Object.keys(newInput).length === 0) return;
    const description = (newInput.description as string) || '';
    if (description) {
      info.description = description;
    }
    const prompt = (newInput.prompt as string) || '';
    if (prompt) {
      info.prompt = prompt;
    }
  }

  private resolveTaskMode(taskInput: Record<string, unknown>): 'sync' | 'async' | null {
    if (!Object.prototype.hasOwnProperty.call(taskInput, 'run_in_background')) {
      return null;
    }
    if (taskInput.run_in_background === true) {
      return 'async';
    }
    if (taskInput.run_in_background === false) {
      return 'sync';
    }
    return null;
  }

  private inferModeFromTaskResult(
    taskResult: string,
    isError: boolean,
    taskToolUseResult?: unknown
  ): 'sync' | 'async' {
    if (isError) {
      return 'sync';
    }
    if (this.taskResultInterpreter.hasAsyncLaunchMarker(taskToolUseResult)) {
      return 'async';
    }
    // Only promote to async for launch-shaped payloads. Completed sync results
    // can still contain agent metadata in the payload or final output text.
    return this.parseAgentIdStrict(taskResult) ? 'async' : 'sync';
  }

  private parseAgentIdStrict(result: string): string | null {
    const payload = this.unwrapTextPayload(result).trim();
    if (!payload) {
      return null;
    }

    const parsed = parseJsonRecord(payload);
    if (parsed) {
      if (hasTerminalTaskStatus(parsed)) {
        return null;
      }

      const directAgentId = extractAgentIdFromRecord(parsed);
      if (directAgentId) {
        return directAgentId;
      }

      const taskRecord = parsed.task;
      if (isRecord(taskRecord)) {
        return extractAgentIdFromRecord(taskRecord);
      }
    }

    const xmlStatus = this.taskResultInterpreter.extractTagValue(payload, 'retrieval_status')
      ?? this.taskResultInterpreter.extractTagValue(payload, 'status');
    if (isTerminalTaskStatusValue(xmlStatus)) {
      return null;
    }

    const exactLineMatch = payload.match(/^\s*(?:agent_id|agentId)\s*[=:]\s*"?([a-zA-Z0-9_-]+)"?\s*$/i);
    return exactLineMatch?.[1] ?? null;
  }


  // ============================================
  // Private: Async Info Registry
  // ============================================

  /**
   * Keeps the registry entry pointing at the canonical subagent object across
   * status transitions, so a later label-update tool_use replay mutates the
   * same object the message tool-call references. Matches by task id first,
   * then by agentId (the transitions that look entries up via
   * `activeAsyncSubagents` key on agentId).
   */
  private trackAsyncInfo(subagent: SubagentInfo): void {
    if (this.asyncInfos.has(subagent.id)) {
      this.asyncInfos.set(subagent.id, subagent);
      return;
    }
    for (const [taskToolId, info] of this.asyncInfos) {
      if (info.agentId === subagent.agentId) {
        this.asyncInfos.set(taskToolId, subagent);
        return;
      }
    }
  }

  // ============================================
  // Private: Async Parsing Logic
  // ============================================

  private isStillRunningResult(result: string, isError: boolean): boolean {
    const trimmed = result?.trim() || '';
    if (isError || !trimmed) return false;

    const payload = this.unwrapTextPayload(trimmed);
    const parsed = parseJsonRecord(payload);
    if (parsed) {
      return parsedResultIndicatesRunning(parsed);
    }
    return plainPayloadIndicatesRunning(payload);
  }

  private extractAgentResult(result: string, agentId: string, toolUseResult?: unknown): string {
    const structuredResult = this.taskResultInterpreter.extractStructuredResult(toolUseResult);
    const normalizedStructuredResult = this.extractResultFromCandidateString(structuredResult);
    if (normalizedStructuredResult) {
      return normalizedStructuredResult;
    }
    if (structuredResult) {
      return structuredResult;
    }

    const payload = this.unwrapTextPayload(result);
    const parsed = parseJsonRecord(payload);
    const parsedResult = parsed ? this.extractResultFromParsedRecord(parsed, agentId) : null;
    if (parsedResult) {
      return parsedResult;
    }

    return this.extractResultFromTaggedPayload(payload) || payload;
  }

  private extractResultFromParsedRecord(parsed: Record<string, unknown>, agentId: string): string | null {
    const taskResult = this.extractResultFromTaskObject(parsed.task);
    if (taskResult) {
      return taskResult;
    }

    const agents = isRecord(parsed.agents) ? parsed.agents : null;
    if (agents) {
      const agentsResult = this.extractResultFromAgentsMap(agents, agentId);
      if (agentsResult) {
        return agentsResult;
      }
    }

    return this.extractResultFromCandidateString(parsed.result)
      ?? this.extractResultFromCandidateString(parsed.output);
  }

  private extractResultFromAgentsMap(agents: Record<string, unknown>, agentId: string): string | null {
    const agentData = agentId ? agents[agentId] : null;
    if (isRecord(agentData)) {
      return this.extractResultFromAgentRecord(agentData)
        ?? JSON.stringify(agentData, null, 2);
    }

    const agentIds = Object.keys(agents);
    if (agentIds.length === 0) {
      return null;
    }
    const firstAgent = agents[agentIds[0]];
    if (isRecord(firstAgent)) {
      const firstAgentResult = this.extractResultFromAgentRecord(firstAgent);
      if (firstAgentResult) {
        return firstAgentResult;
      }
    }
    return JSON.stringify(firstAgent, null, 2);
  }

  private extractResultFromAgentRecord(agent: Record<string, unknown>): string | null {
    return this.extractResultFromCandidateString(agent.result)
      ?? this.extractResultFromCandidateString(agent.output);
  }

  private extractResultFromTaskObject(task: unknown): string | null {
    if (!task || typeof task !== 'object') {
      return null;
    }
    const taskRecord = task as Record<string, unknown>;
    return this.extractResultFromCandidateString(taskRecord.result)
      ?? this.extractResultFromCandidateString(taskRecord.output);
  }

  private extractResultFromCandidateString(candidate: unknown): string | null {
    if (typeof candidate !== 'string') {
      return null;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    const taggedResult = this.extractResultFromTaggedPayload(trimmed);
    if (taggedResult) {
      return taggedResult;
    }

    const jsonlResult = this.extractResultFromOutputJsonl(trimmed);
    if (jsonlResult) {
      return jsonlResult;
    }

    return trimmed;
  }

  private parseAgentId(result: string): string | null {
    const regexPatterns = [
      /"agent_id"\s*:\s*"([^"]+)"/,
      /"agentId"\s*:\s*"([^"]+)"/,
      /agent_id[=:]\s*"?([a-zA-Z0-9_-]+)"?/i,
      /agentId[=:]\s*"?([a-zA-Z0-9_-]+)"?/i,
      /\b([a-f0-9]{8})\b/,
    ];

    for (const pattern of regexPatterns) {
      const match = result.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    const parsed = parseJsonRecord(result);
    if (parsed) {
      const agentId = parsed.agent_id || parsed.agentId;

      if (typeof agentId === 'string' && agentId.length > 0) {
        return agentId;
      }

      const data = parsed.data;
      if (isRecord(data) && typeof data.agent_id === 'string') {
        return data.agent_id;
      }

      if (parsed.id && typeof parsed.id === 'string') {
        return parsed.id;
      }
    }

    return null;
  }

  private inferAgentIdFromResult(result: string): string | null {
    const parsed = parseJsonRecord(result);
    if (parsed) {
      const agents = isRecord(parsed.agents) ? parsed.agents : null;
      if (agents) {
        return Object.keys(agents)[0] ?? null;
      }
    }
    return null;
  }

  private unwrapTextPayload(raw: string): string {
    const parsed = parseJsonValue(raw);
    if (parsed !== null) {
      if (Array.isArray(parsed)) {
        const textBlock = (parsed as unknown[]).find((block) => isRecord(block) && typeof block.text === 'string');
        if (isRecord(textBlock) && typeof textBlock.text === 'string') return textBlock.text;
      } else if (isRecord(parsed) && typeof parsed.text === 'string') {
        return parsed.text;
      }
    }
    return raw;
  }

  private extractResultFromTaggedPayload(payload: string): string | null {
    const directResult = this.taskResultInterpreter.extractTagValue(payload, 'result');
    if (directResult) return directResult;

    const outputContent = this.taskResultInterpreter.extractTagValue(payload, 'output');
    if (!outputContent) return null;

    const extractedFromJsonl = this.extractResultFromOutputJsonl(outputContent);
    if (extractedFromJsonl) return extractedFromJsonl;

    const nestedResult = this.taskResultInterpreter.extractTagValue(outputContent, 'result');
    if (nestedResult) return nestedResult;

    const trimmed = outputContent.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private extractResultFromOutputJsonl(outputContent: string): string | null {
    const inlineResult = extractFinalResultFromSubagentJsonl(outputContent);
    if (inlineResult) {
      return inlineResult;
    }

    const fullOutputPath = this.extractFullOutputPath(outputContent);
    if (!fullOutputPath) {
      return null;
    }

    const fullOutput = this.readFullOutputFile(fullOutputPath);
    if (!fullOutput) {
      return null;
    }

    return extractFinalResultFromSubagentJsonl(fullOutput);
  }

  private extractFullOutputPath(content: string): string | null {
    const truncatedPattern = /\[Truncated\.\s*Full output:\s*([^\]\n]+)\]/i;
    const match = content.match(truncatedPattern);
    if (!match || !match[1]) {
      return null;
    }

    const outputPath = match[1].trim();
    return outputPath.length > 0 ? outputPath : null;
  }

  private readFullOutputFile(fullOutputPath: string): string | null {
    try {
      if (!this.isTrustedOutputPath(fullOutputPath)) {
        return null;
      }

      if (!existsSync(fullOutputPath)) {
        return null;
      }

      const fileContent = readFileSync(fullOutputPath, 'utf-8');
      const trimmed = fileContent.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  private extractAgentIdFromInput(input: Record<string, unknown>): string | null {
    const agentId = (input.task_id as string) || (input.agentId as string) || (input.agent_id as string);
    return agentId || null;
  }

  private static resolveTrustedTmpRoots(): string[] {
    const roots = new Set<string>();
    const candidates = [tmpdir(), '/tmp', '/private/tmp'];
    for (const candidate of candidates) {
      try {
        roots.add(realpathSync(candidate));
      } catch {
        // Ignore unavailable temp roots.
      }
    }
    return Array.from(roots);
  }

  private isTrustedOutputPath(fullOutputPath: string): boolean {
    if (!isAbsolute(fullOutputPath)) {
      return false;
    }

    if (!fullOutputPath.toLowerCase().endsWith(SubagentManager.TRUSTED_OUTPUT_EXT)) {
      return false;
    }

    let resolvedPath: string;
    try {
      resolvedPath = realpathSync(fullOutputPath);
    } catch {
      return false;
    }

    return SubagentManager.TRUSTED_TMP_ROOTS.some((root) =>
      resolvedPath === root || resolvedPath.startsWith(`${root}${sep}`)
    );
  }
}
