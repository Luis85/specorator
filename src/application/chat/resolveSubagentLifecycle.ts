import type { AsyncSubagentStatus, SubagentInfo } from '@/domain/chat/Subagent';

/**
 * `resolveSubagentLifecycle` / `consolidateSubagent` — pure lifecycle resolution
 * for a Claude `Task`/`Agent` subagent (SPEC-RR-017).
 *
 * Reproduces the Claude-path branch of claudian-main
 * `MessageRenderer.renderTaskSubagent` / `resolveTaskSubagent` /
 * `inferAsyncStatusFromTaskTool`. **P2 scope: the Claude path only** —
 * provider-lifecycle (Codex/Opencode `spawn_agent`/`wait`) consolidation is
 * deferred to P9 (CLAR-RR-004, NG7); a non-Claude shape degrades to
 * `{mode:'sync'}`.
 *
 * **Pure, total, never throws** (NFR-RR-003/005): no mutation of the input, no
 * side effects, no `obsidian`/Vue import.
 */
export type SubagentLifecycle =
	| { mode: 'sync' }
	| { mode: 'async'; asyncStatus: AsyncSubagentStatus };

/** An `agentId` correlation or an explicit `mode:'async'` marks a background subagent. */
function isAsync(subagent: SubagentInfo): boolean {
	return subagent.mode === 'async' || subagent.agentId !== undefined;
}

/** Any nested tool still running means the async subagent is actively working. */
function hasActiveNestedTools(subagent: SubagentInfo): boolean {
	return subagent.toolCalls.some((tool) => tool.status === 'running');
}

/**
 * Classify the subagent's sync-vs-async mode and (for async) its lifecycle
 * status. An explicit `asyncStatus` on the input is preserved; otherwise the
 * ladder seeds `running` when nested tools are active, else `pending`.
 */
export function resolveSubagentLifecycle(subagent: SubagentInfo): SubagentLifecycle {
	if (!isAsync(subagent)) return { mode: 'sync' };

	const asyncStatus: AsyncSubagentStatus =
		subagent.asyncStatus ?? (hasActiveNestedTools(subagent) ? 'running' : 'pending');

	return { mode: 'async', asyncStatus };
}

/**
 * Merge an async spawn `SubagentInfo` with its later `async_subagent_result`
 * (matched by `agentId` by the caller) into one logical subagent. A spawn with
 * no result by turn end is `orphaned` (EC-RR-11); an `error` result with no
 * `result` text keeps the result unset (EC-RR-10). Returns a new object — the
 * spawn is never mutated.
 */
export function consolidateSubagent(
	spawn: SubagentInfo,
	asyncResult?: { status: 'completed' | 'error'; result?: string },
): SubagentInfo {
	if (asyncResult === undefined) {
		return { ...spawn, mode: 'async', asyncStatus: 'orphaned' };
	}

	const merged: SubagentInfo = {
		...spawn,
		mode: 'async',
		status: asyncResult.status,
		asyncStatus: asyncResult.status,
		completedAt: Date.now(),
	};

	if (asyncResult.result !== undefined) {
		merged.result = asyncResult.result;
	}

	return merged;
}
