import type { ProviderSubagentLifecycleAdapter } from '../../../core/providers/types';
import type { ChatMessage, ToolCallInfo } from '../../../core/types';
import { appendToolCallToMessage, createRunningToolCall } from './toolCallAppend';

/**
 * Provider lifecycle subagents (spawn → wait/close): the CLI-provider tool
 * calls (Codex / Claude lifecycle adapters) that spawn a subagent, then resolve
 * it through a later wait/close tool. Owns the agentId ↔ spawn-callId map the
 * lifecycle needs. Distinct from the `SubagentManager`-mediated Task subagents
 * (see `SubagentStreamCoordinator`). Vue's `blockListViewModel` projects spawn
 * cards from `msg.toolCalls` via `projectProviderLifecycleSubagent`.
 */
export interface ProviderLifecycleSubagentCoordinatorDeps {
  findToolCall: (msg: ChatMessage, id: string) => ToolCallInfo | undefined;
  normalizeToolResultContent: (content: unknown) => string;
  getSubagentLifecycleAdapter: (toolName?: string) => ProviderSubagentLifecycleAdapter | null;
  flushPendingTools: () => void;
}

export class ProviderLifecycleSubagentCoordinator {
  private deps: ProviderLifecycleSubagentCoordinatorDeps;

  private lifecycleAgentIdToSpawnId = new Map<string, string>();

  constructor(deps: ProviderLifecycleSubagentCoordinatorDeps) {
    this.deps = deps;
  }

  /**
   * Routes a `tool_use` chunk to the provider spawn/hidden handlers. Returns
   * true when the tool was a provider lifecycle tool and was consumed.
   */
  dispatchToolUse(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage,
  ): boolean {
    const adapter = this.deps.getSubagentLifecycleAdapter(chunk.name);
    if (adapter?.isSpawnTool(chunk.name)) {
      this.handleProviderSubagentSpawn(chunk, msg);
      return true;
    }
    if (adapter?.isHiddenTool(chunk.name)) {
      this.handleProviderHiddenSubagentTool(chunk, msg);
      return true;
    }
    return false;
  }

  private handleProviderSubagentSpawn(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage,
  ): void {
    const toolCall = createRunningToolCall(chunk);
    appendToolCallToMessage(msg, toolCall);
    this.deps.flushPendingTools();
  }

  private handleProviderHiddenSubagentTool(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage,
  ): void {
    const toolCall = createRunningToolCall(chunk);
    msg.toolCalls = msg.toolCalls || [];
    msg.toolCalls.push(toolCall);
  }

  /**
   * Handles tool_result for provider lifecycle subagent tools.
   * Returns true if the result was consumed (caller should return early).
   */
  handleProviderSubagentResult(
    chunk: { type: 'tool_result'; id: string; content: string; isError?: boolean },
    msg: ChatMessage,
  ): boolean {
    const existingToolCall = this.deps.findToolCall(msg, chunk.id);
    if (!existingToolCall) return false;
    const normalizedContent = this.deps.normalizeToolResultContent(chunk.content);

    const adapter = this.deps.getSubagentLifecycleAdapter(existingToolCall.name);
    if (!adapter) return false;

    if (adapter.isSpawnTool(existingToolCall.name)) {
      existingToolCall.status = chunk.isError ? 'error' : 'completed';
      existingToolCall.result = normalizedContent;
      this.applyProviderSubagentSpawnResult(chunk, adapter, normalizedContent);
      return true;
    }

    if (adapter.isWaitTool(existingToolCall.name)) {
      existingToolCall.status = chunk.isError ? 'error' : 'completed';
      existingToolCall.result = normalizedContent;
      this.applyProviderSubagentWaitResult(msg, adapter, existingToolCall);
      return true;
    }

    if (adapter.isCloseTool(existingToolCall.name)) {
      existingToolCall.status = chunk.isError ? 'error' : 'completed';
      existingToolCall.result = normalizedContent;
      return true;
    }

    return false;
  }

  /** Maps a completed spawn tool's result onto lifecycle agent-id tracking. */
  private applyProviderSubagentSpawnResult(
    chunk: { id: string; isError?: boolean },
    adapter: ProviderSubagentLifecycleAdapter,
    normalizedContent: string,
  ): void {
    const spawnResult = adapter.extractSpawnResult(normalizedContent);
    if (spawnResult.agentId) {
      this.lifecycleAgentIdToSpawnId.set(spawnResult.agentId, chunk.id);
    }
  }

  /** Finalizes spawn tool calls resolved by a completed wait tool (data-only). */
  private applyProviderSubagentWaitResult(
    msg: ChatMessage,
    adapter: ProviderSubagentLifecycleAdapter,
    existingToolCall: ToolCallInfo,
  ): void {
    for (const spawnId of adapter.resolveSpawnToolIds(
      existingToolCall,
      this.lifecycleAgentIdToSpawnId,
    )) {
      const spawnToolCall = this.deps.findToolCall(msg, spawnId);
      if (!spawnToolCall) continue;

      const subagentInfo = adapter.buildSubagentInfo(spawnToolCall, msg.toolCalls ?? []);
      if (subagentInfo.status === 'completed' || subagentInfo.status === 'error') {
        spawnToolCall.status = subagentInfo.status;
        spawnToolCall.result = subagentInfo.result
          ?? (subagentInfo.status === 'error' ? 'Error' : 'DONE');
      }
    }
  }
}
