import type { ToolDiffData } from './diff/Diff';
import type { SubagentInfo } from './Subagent';

/**
 * Tool call tracking with status and result (SPEC-RR-005). Mirrors the P2
 * subset of claudian-main `ToolCallInfo` (`tools.ts:32`) — `isExpanded` and
 * `resolvedAnswers` (P7 inline-approval / UI-layer state) are EXCLUDED
 * (ADR-RR-001 §1). Pure data: no `obsidian`, no `node:*`, no class.
 *
 * Per-field rules:
 * - `id`: non-empty unique string within the message (the `tool_use.id`); used
 *   to match `tool_result`/`tool_output` (SPEC-RR-018).
 * - `name`: non-empty tool name (e.g. `'Read'`, `'Bash'`, `'TodoWrite'`).
 * - `input`: object (possibly empty); merged-on-update if a later `tool_use`
 *   for the same id carries more keys (parity `StreamController.ts:262`).
 * - `status`: starts `'running'`, becomes `'completed'`/`'error'`/`'blocked'`
 *   on `tool_result` (SPEC-RR-018).
 * - `result`: optional; the (interim or final) result content.
 * - `diffData`: optional; set by `computeDiff` only for Write/Edit tools with a
 *   usable diff source (SPEC-RR-015/018).
 * - `subagent`: optional; present when the tool spawns a subagent (Claude
 *   `Task`/`Agent` path).
 */
export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	status: 'running' | 'completed' | 'error' | 'blocked';
	result?: string;
	diffData?: ToolDiffData;
	subagent?: SubagentInfo;
}
