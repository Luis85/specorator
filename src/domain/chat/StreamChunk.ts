import type { UsageInfo } from './UsageInfo';
import type { ToolUseResult } from './diff/ToolUseResult';

/**
 * Normalized stream chunk — mirrors claudian-main `chat.ts:137` member NAMES and
 * SHAPES exactly (SPEC-CC-002, ADR-CC-001 §4).
 *
 * P1 EMITS only: `assistant_message_start?`, `text`, `error`, `done`, `usage`.
 * The remaining members are declared now (documentation + future-proofing) and
 * EMITTED in later phases — additive, never renamed. There is no `text-delta` and
 * no `final`: `text` chunks accumulate in place and `done` is the terminator
 * (`ChatRuntime.ts:33`, `StreamController.ts:116/200`).
 *
 * Validation rules:
 * - `text.content` / `error.content` are strings (`text` may be empty; `error.content`
 *   SHOULD be a human-readable failure message).
 * - `usage.sessionId` is `string | null | undefined`; `undefined`/`null` means "no
 *   session filter" (treated as "current session", EC-11).
 */
export type StreamChunk =
	// ---- P1 EMITS this subset ----
	| { type: 'assistant_message_start'; itemId?: string } // P1 (optional)
	| { type: 'text'; content: string } // P1 — accumulate
	| { type: 'error'; content: string } // P1 — inline error
	| { type: 'done' } // P1 — terminator
	| { type: 'usage'; usage: UsageInfo; sessionId?: string | null } // P1 (should)
	// ---- declared now, EMITTED in later phases (additive) ----
	| { type: 'user_message_start'; content: string; itemId?: string }
	| { type: 'thinking'; content: string } // P2
	| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } // P2
	| {
			type: 'tool_result';
			id: string;
			content: string;
			isError?: boolean;
			toolUseResult?: ToolUseResult; // P2 — EDITED (SPEC-RR-001): was `unknown`
	  } // P2
	| { type: 'tool_output'; id: string; content: string } // P2
	| { type: 'notice'; content: string; level?: 'info' | 'warning' }
	| { type: 'context_compacted' } // P3
	| {
			type: 'async_subagent_result';
			agentId: string;
			status: 'completed' | 'error';
			result?: string;
	  }
	| {
			type: 'subagent_tool_use';
			subagentId: string;
			id: string;
			name: string;
			input: Record<string, unknown>;
	  }
	| {
			type: 'subagent_tool_result';
			subagentId: string;
			id: string;
			content: string;
			isError?: boolean;
			toolUseResult?: ToolUseResult; // P2 — EDITED (SPEC-RR-001): was `unknown`
	  };
