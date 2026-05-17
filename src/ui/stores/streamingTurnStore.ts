import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Pinia store for the **per-turn** streaming-assistant lifecycle (Arch review
 * #4, WP-3 split of the former monolithic `chatStore`).
 *
 * Owns every slot that exists only for the duration of one assistant turn:
 * text/thinking accumulators, the in-flight tool-use map, the most recent
 * `usage` snapshot, and the two transient UI flags (`cliStartingUp`,
 * `sessionResumed`). Every new turn must call `resetStreaming()` before
 * appending — `ChatSidebar.handleSend()` does so unconditionally, and
 * `useChatReset.resetForNewConversation()` does so as part of the cross-store
 * "new conversation" sequence (closes UX review #15 — `streamingText` not
 * reset on New conversation).
 *
 * NFR-ASM-002, REQ-ASM-035, R-ASM-003, PR-ASV-2-delta-extension.
 */
export const useStreamingTurnStore = defineStore('streamingTurn', () => {
	/**
	 * Accumulated `stream_event` text deltas from the active turn. Cleared
	 * by `resetStreaming()` between turns. NFR-ASM-002.
	 */
	const streamingText = ref<string>('');

	/**
	 * Accumulated `thinking` deltas from the active turn (extended-thinking
	 * models). Drives a collapsed `<details>` block in the streaming bubble.
	 * PR-ASV-2-delta-extension.
	 */
	const streamingThinking = ref<string>('');

	/**
	 * In-flight tool-use blocks keyed by `StreamDelta.blockId`. Each entry
	 * accumulates `inputJson` deltas; the UI renders a "running ToolName"
	 * indicator on `tool-use-start` and finalises on `tool-use-stop`.
	 * PR-ASV-2-delta-extension.
	 */
	const streamingToolCalls = ref<
		Map<string, { toolName: string; inputJson: string; done: boolean }>
	>(new Map());

	/**
	 * Most recent token-usage telemetry from the SDK / subprocess
	 * (`message_start` + `message_delta` carrying `usage`). Drives a future
	 * context-meter UI. Null until the first emission per turn; accumulating
	 * values are replaced (last-write-wins, mirroring Claudian's approach
	 * for endpoints that put zero values on `message_start`).
	 * PR-ASV-2-delta-extension.
	 */
	const lastUsage = ref<{ inputTokens: number; outputTokens: number } | null>(null);

	/**
	 * `true` while the subprocess adapter is performing first-run startup;
	 * drives `SubprocessStartingPill`. R-ASM-003.
	 */
	const cliStartingUp = ref<boolean>(false);

	/**
	 * `true` for the duration of the first turn after the subprocess adapter
	 * resumes a stored session id; drives `SessionResumeIndicator`.
	 * REQ-ASM-035.
	 */
	const sessionResumed = ref<boolean>(false);

	/** Appends a streaming-text delta. NFR-ASM-002. */
	function appendStreamingDelta(delta: string): void {
		streamingText.value = streamingText.value + delta;
	}

	/**
	 * Append a thinking-delta to the in-flight extended-thinking buffer.
	 * PR-ASV-2-delta-extension.
	 */
	function appendStreamingThinking(delta: string): void {
		streamingThinking.value = streamingThinking.value + delta;
	}

	/**
	 * Mark a fresh tool-use block in the in-flight call table.
	 * PR-ASV-2-delta-extension.
	 */
	function startStreamingToolCall(
		blockId: string,
		toolName: string,
		initialJson: string,
	): void {
		const next = new Map(streamingToolCalls.value);
		next.set(blockId, { toolName, inputJson: initialJson, done: false });
		streamingToolCalls.value = next;
	}

	/**
	 * Append partial JSON to an in-flight tool-use block's `input` field.
	 * No-op when `blockId` is unknown (defensive against out-of-order
	 * deltas). PR-ASV-2-delta-extension.
	 */
	function appendStreamingToolCallInput(blockId: string, partialJson: string): void {
		const existing = streamingToolCalls.value.get(blockId);
		if (existing === undefined) return;
		const next = new Map(streamingToolCalls.value);
		next.set(blockId, { ...existing, inputJson: existing.inputJson + partialJson });
		streamingToolCalls.value = next;
	}

	/**
	 * Mark a tool-use block as fully streamed (the SDK's `content_block_stop`
	 * arrived). The accumulated `inputJson` is now safe to `JSON.parse`.
	 * PR-ASV-2-delta-extension.
	 */
	function finishStreamingToolCall(blockId: string): void {
		const existing = streamingToolCalls.value.get(blockId);
		if (existing === undefined) return;
		const next = new Map(streamingToolCalls.value);
		next.set(blockId, { ...existing, done: true });
		streamingToolCalls.value = next;
	}

	/**
	 * Update the latest usage telemetry snapshot.
	 * PR-ASV-2-delta-extension.
	 */
	function setLastUsage(usage: { inputTokens: number; outputTokens: number }): void {
		lastUsage.value = usage;
	}

	/** Sets the subprocess-startup pill flag. R-ASM-003. */
	function setCliStartingUp(value: boolean): void {
		cliStartingUp.value = value;
	}

	/** Sets the session-resumed indicator flag. REQ-ASM-035. */
	function setSessionResumed(value: boolean): void {
		sessionResumed.value = value;
	}

	/**
	 * Clears every per-turn streaming slot — text, thinking, tool calls,
	 * usage telemetry, and the `sessionResumed` flag. Called at turn
	 * boundaries by `ChatSidebar.handleSend()` and by
	 * `useChatReset.resetForNewConversation()`. NFR-ASM-002, REQ-ASM-035.
	 *
	 * Deliberately does NOT clear `cliStartingUp` — the pill is owned by
	 * the adapter-startup lifecycle, not the turn lifecycle. `reset()`
	 * (below) clears it for test-fixture full wipes.
	 */
	function resetStreaming(): void {
		streamingText.value = '';
		streamingThinking.value = '';
		streamingToolCalls.value = new Map();
		lastUsage.value = null;
		sessionResumed.value = false;
	}

	/**
	 * Full wipe (also clears `cliStartingUp`). Used by `useChatReset.resetAll()`
	 * and test fixtures. Pinia's default `$reset` does not restore Maps,
	 * which is why every store in this split exposes an explicit `reset()`.
	 */
	function reset(): void {
		resetStreaming();
		cliStartingUp.value = false;
	}

	return {
		streamingText,
		streamingThinking,
		streamingToolCalls,
		lastUsage,
		cliStartingUp,
		sessionResumed,
		appendStreamingDelta,
		appendStreamingThinking,
		startStreamingToolCall,
		appendStreamingToolCallInput,
		finishStreamingToolCall,
		setLastUsage,
		setCliStartingUp,
		setSessionResumed,
		resetStreaming,
		reset,
	};
});
