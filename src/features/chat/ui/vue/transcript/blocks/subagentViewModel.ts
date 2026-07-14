import type { ProviderSubagentLifecycleAdapter } from '../../../../../../core/providers/types';
import { extractToolResultContent } from '../../../../../../core/tools/toolResultContent';
import type { AsyncSubagentStatus, ChatMessage, SubagentInfo, ToolCallInfo } from '../../../../../../core/types';

/**
 * Pure `ToolCallInfo → SubagentInfo` projection plus the small display-only
 * derivations `SubagentBlock.vue` needs, ported from
 * `rendering/MessageSubagentRenderer.ts`'s private `resolveTaskSubagent` /
 * `mapToolStatusToSubagentStatus` / `inferAsyncStatusFromTaskTool`, and
 * `rendering/SubagentRenderer.ts`'s display helpers (`truncateDescription`,
 * `getAsyncDisplayStatus`, `getAsyncStatusText`, `getAsyncStatusAriaLabel`,
 * and the result-section fallback text rules baked into
 * `finalizeSubagentBlock` / `renderAsyncContentLikeSync`). Kept as plain
 * functions (no Vue/DOM deps) so the projection is unit-testable on its own,
 * independent of the SFC that consumes it.
 */

/** Display-only collapse of `SubagentInfo.status` / `.asyncStatus` down to
 *  the four states `renderAsyncContentLikeSync` actually branches on. */
export type SubagentDisplayStatus = 'running' | 'completed' | 'error' | 'orphaned';

export function mapToolStatusToSubagentStatus(
  status: ToolCallInfo['status']
): 'completed' | 'error' | 'running' {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'error':
    case 'blocked':
      return 'error';
    default:
      return 'running';
  }
}

export function inferAsyncStatusFromTaskTool(toolCall: ToolCallInfo): 'running' | 'completed' | 'error' {
  if (toolCall.status === 'error' || toolCall.status === 'blocked') return 'error';
  if (toolCall.status === 'running') return 'running';

  const lowerResult = extractToolResultContent(toolCall.result, { fallbackIndent: 2 }).toLowerCase();
  if (
    lowerResult.includes('not_ready') ||
    lowerResult.includes('not ready') ||
    lowerResult.includes('"status":"running"') ||
    lowerResult.includes('"status":"pending"') ||
    lowerResult.includes('"retrieval_status":"running"') ||
    lowerResult.includes('"retrieval_status":"not_ready"')
  ) {
    return 'running';
  }

  return 'completed';
}

/**
 * Reproduces `MessageSubagentRenderer.resolveTaskSubagent`: prefers an
 * already-projected `toolCall.subagent` (re-tagging its `mode` when a
 * `modeHint` disagrees), otherwise derives a fresh `SubagentInfo` from the
 * Task tool's `input`/`status`. Provider-agnostic by design — the legacy
 * method never consults provider capabilities for this path (only the
 * separate provider-lifecycle spawn/wait consolidation does, which needs
 * the message's full `toolCalls` list and is out of this component's scope).
 */
export function resolveTaskSubagent(toolCall: ToolCallInfo, modeHint?: 'sync' | 'async'): SubagentInfo {
  if (toolCall.subagent) {
    if (!modeHint || toolCall.subagent.mode === modeHint) {
      return toolCall.subagent;
    }
    return {
      ...toolCall.subagent,
      mode: modeHint,
    };
  }

  const description = (toolCall.input?.description as string) || 'Subagent task';
  const prompt = (toolCall.input?.prompt as string) || '';
  const mode = modeHint ?? (toolCall.input?.run_in_background === true ? 'async' : 'sync');

  if (mode !== 'async') {
    return {
      id: toolCall.id,
      description,
      prompt,
      status: mapToolStatusToSubagentStatus(toolCall.status),
      toolCalls: [],
      isExpanded: false,
      result: toolCall.result,
    };
  }

  const asyncStatus = inferAsyncStatusFromTaskTool(toolCall);
  return {
    id: toolCall.id,
    description,
    prompt,
    mode: 'async',
    status: asyncStatus,
    asyncStatus,
    toolCalls: [],
    isExpanded: false,
    result: toolCall.result,
  };
}

/**
 * Reproduces `MessageSubagentRenderer.renderProviderLifecycleSubagent`'s
 * consolidation for CLI providers (Codex/Opencode/Cursor): a "subagent" is a
 * LIFECYCLE of separate tool calls (spawn + wait/close) rather than a single
 * Task tool. Delegates the provider-specific status/result/description/nested
 * derivation to the resolved adapter's `buildSubagentInfo`, handing it the
 * message's full `toolCalls` so it can gather the spawn's wait/close siblings.
 * Pure — re-derives off `msg.toolCalls` each call, so a mutation to a
 * wait/close tool (with a refreshed message identity) re-projects the card.
 */
export function projectProviderLifecycleSubagent(
  spawnToolCall: ToolCallInfo,
  msg: ChatMessage,
  adapter: ProviderSubagentLifecycleAdapter,
): SubagentInfo {
  return adapter.buildSubagentInfo(spawnToolCall, msg.toolCalls ?? []);
}

export function truncateDescription(description: string, maxLength = 40): string {
  if (description.length <= maxLength) return description;
  return description.substring(0, maxLength) + '...';
}

export function getAsyncDisplayStatus(asyncStatus: AsyncSubagentStatus | undefined): SubagentDisplayStatus {
  switch (asyncStatus) {
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'orphaned':
      return 'orphaned';
    default:
      return 'running';
  }
}

export function getAsyncStatusText(asyncStatus: AsyncSubagentStatus | undefined): string {
  switch (asyncStatus) {
    case 'pending':
      return 'Initializing';
    case 'completed':
      return ''; // Just show tick icon, no text
    case 'error':
      return 'Error';
    case 'orphaned':
      return 'Orphaned';
    default:
      return 'Running in background';
  }
}

export function getAsyncStatusAriaLabel(asyncStatus: AsyncSubagentStatus | undefined): string {
  switch (asyncStatus) {
    case 'pending':
      return 'Initializing';
    case 'completed':
      return 'Completed';
    case 'error':
      return 'Error';
    case 'orphaned':
      return 'Orphaned';
    default:
      return 'Running in background';
  }
}

export function buildSyncHeaderAriaLabel(description: string, status: SubagentInfo['status']): string {
  return `Subagent task: ${truncateDescription(description)} - Status: ${status} - click to expand`;
}

export function buildAsyncHeaderAriaLabel(description: string, asyncStatus: AsyncSubagentStatus | undefined): string {
  return `Background task: ${truncateDescription(description)} - ${getAsyncStatusAriaLabel(asyncStatus)} - click to expand`;
}

export function buildSyncRootClasses(status: SubagentInfo['status']): string[] {
  if (status === 'completed') return ['done'];
  if (status === 'error') return ['error'];
  return [];
}

export function buildAsyncRootClasses(displayStatus: SubagentDisplayStatus): string[] {
  const classes = ['async', displayStatus];
  if (displayStatus === 'completed') classes.push('done');
  if (displayStatus === 'error' || displayStatus === 'orphaned') classes.push('error');
  return classes;
}

export interface StatusPillInfo {
  pillClass: string;
  icon: string | null;
  ariaLabel: string;
}

export function buildSyncStatusPill(status: SubagentInfo['status']): StatusPillInfo {
  const ariaLabel = `Status: ${status}`;
  if (status === 'completed') return { pillClass: 'status-completed', icon: 'check', ariaLabel };
  if (status === 'error') return { pillClass: 'status-error', icon: 'x', ariaLabel };
  return { pillClass: 'status-running', icon: null, ariaLabel };
}

export function buildAsyncStatusPill(asyncStatus: AsyncSubagentStatus | undefined): StatusPillInfo {
  const displayStatus = getAsyncDisplayStatus(asyncStatus);
  const ariaLabel = `Status: ${getAsyncStatusAriaLabel(asyncStatus)}`;
  switch (displayStatus) {
    case 'completed':
      return { pillClass: 'status-completed', icon: 'check', ariaLabel };
    case 'error':
      return { pillClass: 'status-error', icon: 'x', ariaLabel };
    case 'orphaned':
      return { pillClass: 'status-error', icon: 'alert-circle', ariaLabel };
    default:
      return { pillClass: 'status-running', icon: null, ariaLabel };
  }
}

export interface SubagentResultDisplay {
  text: string;
}

/**
 * Reproduces the result-section text rules shared by
 * `finalizeSubagentBlock` (sync) and `renderAsyncContentLikeSync` (async,
 * from the retired stored async renderer): no section while running, an
 * orphan-specific fallback, and a DONE/ERROR fallback otherwise.
 */
export function resolveSubagentResultText(
  displayStatus: SubagentDisplayStatus,
  result: string | undefined,
): SubagentResultDisplay | null {
  if (displayStatus === 'running') return null;
  if (displayStatus === 'orphaned') {
    return { text: result || 'Conversation ended before task completed' };
  }
  const fallback = displayStatus === 'error' ? 'ERROR' : 'DONE';
  return { text: result?.trim() ? result : fallback };
}

/** `renderSubagentToolContent`'s extra "Running..." branch that precedes
 *  the shared `renderExpandedContent` (No result / body) fallthrough. */
export function shouldShowRunningPlaceholder(toolCall: ToolCallInfo): boolean {
  return !toolCall.result && toolCall.status === 'running';
}
