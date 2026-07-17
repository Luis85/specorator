import { TOOL_TASK } from '../../../core/tools/toolNames';
import type { ToolCallInfo } from '../../../core/types';
import type { HandleTaskResult, RenderPendingResult } from './SubagentManager';

/** Builds the buffered (running, collapsed) Task tool call used while mode is unknown. */
export function buildPendingTaskCall(
  taskToolId: string,
  taskInput: Record<string, unknown>,
): ToolCallInfo {
  return {
    id: taskToolId,
    name: TOOL_TASK,
    input: taskInput || {},
    status: 'running',
    isExpanded: false,
  };
}

/**
 * Resolves a buffered pending Task into its created subagent info.
 *
 * Both pending-resolution paths (`renderPendingTask`, `renderPendingTaskFromTaskResult`)
 * differ only in how they decide async vs sync; the create/count/map-to-result
 * tail is identical, so it lives here. `spawn` performs the mode-specific
 * subagent creation and `onSpawned` bumps the per-stream count once one is
 * actually created. Creation failures are swallowed so a malformed task never
 * crashes the stream — it just appears incomplete.
 */
export function spawnPendingTask(
  wantsAsync: boolean,
  spawn: (mode: 'async' | 'sync') => HandleTaskResult,
  onSpawned: () => void,
): RenderPendingResult | null {
  try {
    if (wantsAsync) {
      const result = spawn('async');
      if (result.action === 'created_async') {
        onSpawned();
        return { mode: 'async', info: result.info };
      }
    } else {
      const result = spawn('sync');
      if (result.action === 'created_sync') {
        onSpawned();
        return { mode: 'sync', info: result.info };
      }
    }
  } catch {
    // Non-fatal: task appears incomplete but doesn't crash the stream
  }

  return null;
}
