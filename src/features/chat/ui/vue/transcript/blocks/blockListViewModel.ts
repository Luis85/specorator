import type { ProviderSubagentLifecycleAdapter } from '../../../../../../core/providers/types';
import {
  isSubagentToolName,
  isWriteEditTool,
  TOOL_AGENT_OUTPUT,
  TOOL_WRITE_STDIN,
} from '../../../../../../core/tools/toolNames';
import type { ChatMessage, ContentBlock, SubagentInfo, ToolCallInfo } from '../../../../../../core/types';
import { resolveSubagentLifecycleAdapter } from '../../../../controllers/subagentLifecycleResolution';
import { projectProviderLifecycleSubagent } from './subagentViewModel';

/**
 * Pure dispatch resolution for `BlockList.vue`, mirroring
 * `rendering/assistantMessageContent.ts`'s `renderAssistantMessageContent`
 * (content-block loop + leftover tool calls + legacy fallback) and
 * `MessageRenderer.ts`'s `renderToolCall`/`shouldRenderToolCall` tool
 * dispatch gate. Kept pure/testable so `BlockList.vue` stays a thin
 * template that just maps items to components.
 *
 * Provider-lifecycle SPAWN tools (e.g. Codex's `spawn_agent`) classify as a
 * `subagent` item carrying a pre-built `subagentInfo` that consolidates the
 * spawn + wait/close lifecycle tool calls (mirroring
 * `MessageSubagentRenderer.renderProviderLifecycleSubagent` in the legacy
 * renderer). The consumed wait/close/hidden lifecycle tool ids are marked so
 * they are not ALSO rendered as separate plain tools.
 */

export type BlockListItem =
  | { key: string; kind: 'thinking'; content: string; durationSeconds?: number }
  | { key: string; kind: 'text'; content: string; deferMath?: boolean }
  | { key: string; kind: 'context_compacted' }
  | { key: string; kind: 'runtime_error'; content: string; suppressRetry?: boolean }
  | {
      key: string;
      kind: 'subagent';
      toolCall?: ToolCallInfo;
      mode?: 'sync' | 'async';
      subagentInfo?: SubagentInfo;
    }
  | { key: string; kind: 'tool_write_edit'; toolCall: ToolCallInfo }
  | { key: string; kind: 'tool_plain'; toolCall: ToolCallInfo };

/** Silent write_stdin transport tools (empty/non-string `chars`) are hidden noise. */
function isSilentWriteStdinTool(toolCall: ToolCallInfo): boolean {
  return typeof toolCall.input.chars !== 'string' || toolCall.input.chars.length === 0;
}

/** Reproduces `MessageRenderer.ts`'s private `shouldRenderToolCall`. */
export function shouldRenderToolCall(toolCall: ToolCallInfo, providerId: string): boolean {
  if (toolCall.name === TOOL_AGENT_OUTPUT) return false;
  if (toolCall.name === TOOL_WRITE_STDIN && isSilentWriteStdinTool(toolCall)) return false;
  if (toolCall.name === 'custom_tool_call_output') return false;
  const adapter = resolveSubagentLifecycleAdapter(providerId, toolCall.name);
  if (adapter?.isHiddenTool(toolCall.name)) return false;
  return true;
}

/**
 * Marks the spawn's wait/close/hidden lifecycle siblings as consumed so the
 * content-block loop and leftover pass skip them — the consolidated spawn card
 * already represents them (mirrors the legacy renderer, which relied on the
 * spawn owning the block plus `shouldRenderToolCall` hiding `isHiddenTool`).
 */
function consumeLifecycleSiblings(
  msg: ChatMessage,
  adapter: ProviderSubagentLifecycleAdapter,
  consumedToolIds: Set<string>,
): void {
  for (const tc of msg.toolCalls ?? []) {
    if (adapter.isSpawnTool(tc.name)) continue;
    if (adapter.isWaitTool(tc.name) || adapter.isCloseTool(tc.name) || adapter.isHiddenTool(tc.name)) {
      consumedToolIds.add(tc.id);
    }
  }
}

/** Reproduces `MessageRenderer.ts`'s private `renderToolCall` dispatch (post-gate). */
function toolItem(
  toolCall: ToolCallInfo,
  providerId: string,
  msg: ChatMessage,
  consumedToolIds: Set<string>,
): BlockListItem | null {
  if (!shouldRenderToolCall(toolCall, providerId)) return null;
  if (isWriteEditTool(toolCall.name)) {
    return { key: toolCall.id, kind: 'tool_write_edit', toolCall };
  }
  if (isSubagentToolName(toolCall.name)) {
    return { key: toolCall.id, kind: 'subagent', toolCall };
  }
  const lifecycleAdapter = resolveSubagentLifecycleAdapter(providerId, toolCall.name);
  if (lifecycleAdapter?.isSpawnTool(toolCall.name)) {
    consumeLifecycleSiblings(msg, lifecycleAdapter, consumedToolIds);
    return {
      key: toolCall.id,
      kind: 'subagent',
      subagentInfo: projectProviderLifecycleSubagent(toolCall, msg, lifecycleAdapter),
    };
  }
  return { key: toolCall.id, kind: 'tool_plain', toolCall };
}

function findToolCall(msg: ChatMessage, id: string): ToolCallInfo | undefined {
  return msg.toolCalls?.find((tc) => tc.id === id);
}

/**
 * Resolves one content block to a render item. `tool_use` and `subagent`
 * blocks always mark their tool id as handled in `renderedToolIds` even when
 * the gate hides the item (matching `renderToolUseBlock`/`renderSubagentBlock`
 * always calling `renderedToolIds.add`), so the leftover pass never re-tries them.
 */
function resolveContentBlockItem(
  msg: ChatMessage,
  block: ContentBlock,
  index: number,
  providerId: string,
  renderedToolIds: Set<string>,
): BlockListItem | null {
  switch (block.type) {
    case 'thinking':
      return {
        key: `thinking:${index}`,
        kind: 'thinking',
        content: block.content,
        durationSeconds: block.durationSeconds,
      };
    case 'text':
      if (!block.content || !block.content.trim()) return null;
      return { key: `text:${index}`, kind: 'text', content: block.content, deferMath: block.deferMath };
    case 'tool_use': {
      const toolCall = findToolCall(msg, block.toolId);
      if (!toolCall) return null;
      // Already consolidated into a preceding spawn card (its wait/close sibling).
      if (renderedToolIds.has(toolCall.id)) return null;
      renderedToolIds.add(toolCall.id);
      return toolItem(toolCall, providerId, msg, renderedToolIds);
    }
    case 'context_compacted':
      return { key: `context_compacted:${index}`, kind: 'context_compacted' };
    case 'runtime_error':
      return {
        key: `runtime_error:${index}`,
        kind: 'runtime_error',
        content: block.content,
        suppressRetry: block.suppressRetry,
      };
    case 'subagent': {
      const toolCall = msg.toolCalls?.find(
        (tc) => tc.id === block.subagentId && isSubagentToolName(tc.name)
      );
      if (!toolCall) return null;
      renderedToolIds.add(toolCall.id);
      return { key: block.subagentId, kind: 'subagent', toolCall, mode: block.mode };
    }
    default:
      return null;
  }
}

/** Shared by both fallback passes: appends a render item for each not-yet-rendered tool call. */
function appendToolItems(
  toolCalls: ToolCallInfo[],
  providerId: string,
  msg: ChatMessage,
  renderedToolIds: Set<string>,
  items: BlockListItem[],
): void {
  for (const toolCall of toolCalls) {
    if (renderedToolIds.has(toolCall.id)) continue;
    renderedToolIds.add(toolCall.id);
    const item = toolItem(toolCall, providerId, msg, renderedToolIds);
    if (item) items.push(item);
  }
}

/** Defensive fallback: preserves tool visibility when contentBlocks/toolCalls drift on reload. */
function appendLeftoverItems(
  msg: ChatMessage,
  providerId: string,
  renderedToolIds: Set<string>,
  items: BlockListItem[],
): void {
  if (!msg.toolCalls) return;
  appendToolItems(msg.toolCalls, providerId, msg, renderedToolIds, items);
}

/** Fallback for old conversations without contentBlocks. */
function resolveLegacyItems(msg: ChatMessage, providerId: string): BlockListItem[] {
  const items: BlockListItem[] = [];
  if (msg.content) {
    items.push({ key: 'text:0', kind: 'text', content: msg.content });
  }
  if (msg.toolCalls) {
    appendToolItems(msg.toolCalls, providerId, msg, new Set<string>(), items);
  }
  return items;
}

/** Resolves the ordered render list for an assistant message's content. */
export function resolveBlockListItems(msg: ChatMessage, providerId: string): BlockListItem[] {
  if (msg.contentBlocks && msg.contentBlocks.length > 0) {
    const items: BlockListItem[] = [];
    const renderedToolIds = new Set<string>();
    msg.contentBlocks.forEach((block, index) => {
      const item = resolveContentBlockItem(msg, block, index, providerId, renderedToolIds);
      if (item) items.push(item);
    });
    appendLeftoverItems(msg, providerId, renderedToolIds, items);
    return items;
  }
  return resolveLegacyItems(msg, providerId);
}

/** Reproduces `renderDurationFooter`'s visibility gate (skipped across a compaction boundary). */
export function hasDurationFooter(msg: ChatMessage): boolean {
  const hasCompactBoundary = !!msg.contentBlocks?.some((b) => b.type === 'context_compacted');
  return !!msg.durationSeconds && msg.durationSeconds > 0 && !hasCompactBoundary;
}
