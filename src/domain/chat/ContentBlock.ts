import type { SubagentMode } from './Subagent';

/**
 * Ordered render block preserving streaming arrival order (SPEC-RR-004).
 * Byte-identical to claudian-main `chat.ts:31`. Pure data: no `obsidian`, no
 * `node:*`, no class.
 *
 * Per-member rules:
 * - `text`: `content` is a string; multiple consecutive `text` blocks are
 *   allowed (the store MAY coalesce adjacent text — SPEC-RR-020).
 * - `tool_use`: `toolId` references a `ToolCall.id` in the message's
 *   `toolCalls`. A dangling reference renders nothing (EC-RR-1).
 * - `thinking`: `content` accumulates across `thinking` chunks;
 *   `durationSeconds` is set at finalise (UI-derived, optional on the DTO).
 * - `subagent`: `subagentId` references a `SubagentInfo.id`; `mode` optional.
 * - `context_compacted`: no payload; render-only notice (NG1).
 *
 * Ordering is the contract (REQ-RR-011): `contentBlocks` is an ordered list;
 * entries appear in the exact order the runtime emitted them.
 */
export type ContentBlock =
	| { type: 'text'; content: string }
	| { type: 'tool_use'; toolId: string }
	| { type: 'thinking'; content: string; durationSeconds?: number }
	| { type: 'subagent'; subagentId: string; mode?: SubagentMode }
	| { type: 'context_compacted' };
