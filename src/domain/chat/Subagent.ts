import type { ToolCall } from './ToolCall';

/**
 * Subagent (Agent tool, legacy Task) tracking for sync and async modes
 * (SPEC-RR-006). Mirrors the P2 subset of claudian-main `tools.ts:55/58/66` —
 * `isExpanded` (UI-layer state) is EXCLUDED (ADR-RR-001 §1). Pure data: no
 * `obsidian`, no `node:*`, no class.
 */

/** Subagent execution mode: sync (nested tools inline) or async (background). */
export type SubagentMode = 'sync' | 'async';

/** Async subagent lifecycle states (claudian tools.ts:58). */
export type AsyncSubagentStatus = 'pending' | 'running' | 'completed' | 'error' | 'orphaned';

/**
 * Per-field rules: `id` non-empty unique; `description` a string (may be '');
 * `toolCalls` an array (possibly empty — EC-RR-9); `status` exactly one of the
 * three; `asyncStatus` present only for `mode === 'async'`; `agentId`
 * correlates `async_subagent_result.agentId` (SPEC-RR-018). Nested `toolCalls`
 * reuse `ToolCall` verbatim.
 */
export interface SubagentInfo {
	id: string;
	description: string;
	prompt?: string;
	mode?: SubagentMode;
	result?: string;
	status: 'running' | 'completed' | 'error';
	toolCalls: ToolCall[];
	asyncStatus?: AsyncSubagentStatus;
	/** Backend agent id used to correlate async_subagent_result (chat.ts:150). */
	agentId?: string;
	/** The tool id carrying the spawn output (lifecycle correlation). */
	outputToolId?: string;
	/** Epoch ms; set on spawn for the async timer. */
	startedAt?: number;
	/** Epoch ms; set on async completion. */
	completedAt?: number;
}
