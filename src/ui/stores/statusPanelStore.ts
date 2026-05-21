import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { TodoEntry } from '@/domain/ports/ChatTransportPort';

/**
 * One bash-history row, materialised from `tool-result` deltas where the
 * originating `tool-use-start` block carried `toolName === 'Bash'`. The
 * mapping is owned by `consumeStream` / the orchestrator; the store keeps
 * a flat append-only FIFO buffer (capped at 50 per REQ-MPS-031).
 */
export interface BashEntry {
	readonly id: string;
	readonly command: string;
	readonly output: string;
	readonly exitCode: number | null;
	readonly timestamp: string;
	readonly truncated: boolean;
}

/** FIFO cap for `bashHistory` per REQ-MPS-031. */
const BASH_HISTORY_CAP = 50;

/**
 * Pinia store backing the agent sidepanel's StatusPanel.
 *
 * - `todos` mirrors the latest task-tracker delta (REQ-MPS-030, TST-MPS-19).
 * - `bashHistory` is a capped-at-50 FIFO buffer fed by `tool-result` deltas
 *   from Bash tools (REQ-MPS-031, TST-MPS-20).
 * - `collapsedByThread` records the per-thread collapse state so switching
 *   threads preserves the user's expand/collapse preference (REQ-MPS-033,
 *   TST-MPS-21).
 *
 * Satisfies REQ-MPS-030, REQ-MPS-031, REQ-MPS-033 (WS-8 sub-batch 1).
 */
export const useStatusPanelStore = defineStore('statusPanel', () => {
	/** Latest `TodoWrite` snapshot. REQ-MPS-030. */
	const todos = ref<ReadonlyArray<TodoEntry>>([]);

	/** Cap-50 FIFO of executed bash invocations. REQ-MPS-031. */
	const bashHistory = ref<ReadonlyArray<BashEntry>>([]);

	/** Per-thread collapsed/expanded flag. REQ-MPS-033. */
	const collapsedByThread = ref<Map<string, boolean>>(new Map());

	/** Replace the entire task list verbatim. */
	function setTodos(next: ReadonlyArray<TodoEntry>): void {
		todos.value = next.slice();
	}

	/** Append a new bash entry, enforcing the FIFO cap. */
	function appendBashEntry(entry: BashEntry): void {
		const next = bashHistory.value.concat(entry);
		bashHistory.value =
			next.length > BASH_HISTORY_CAP ? next.slice(next.length - BASH_HISTORY_CAP) : next;
	}

	/** Set the collapse flag for one thread. */
	function setCollapsed(threadId: string, value: boolean): void {
		const next = new Map(collapsedByThread.value);
		next.set(threadId, value);
		collapsedByThread.value = next;
	}

	/**
	 * Clear `todos` and `bashHistory` for the new thread; the `collapsedByThread`
	 * map is preserved so the per-thread expand/collapse state survives a switch.
	 */
	function resetForThread(_threadId: string): void {
		todos.value = [];
		bashHistory.value = [];
	}

	return {
		todos,
		bashHistory,
		collapsedByThread,
		setTodos,
		appendBashEntry,
		setCollapsed,
		resetForThread,
	};
});
