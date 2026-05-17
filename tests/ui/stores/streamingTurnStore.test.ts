/**
 * Tests for `useStreamingTurnStore()` — the per-turn streaming slice extracted
 * from the former monolithic `chatStore` (WP-3, Arch review #4).
 *
 * Cases migrated from `tests/ui/stores/chatStore.test.ts` (T-ASM-051,
 * NFR-ASM-002, REQ-ASM-035, R-ASM-003).
 *
 * Includes the gap test for the Testing review F8 finding:
 * "Transport-change reset invariant untested." `resetStreaming()` must drop
 * EVERY per-turn slot — text, thinking, tool-call map, usage telemetry,
 * sessionResumed — so a transport swap mid-conversation cannot strand stale
 * deltas in the UI.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';

describe('useStreamingTurnStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('initial state', () => {
		it('NFR-ASM-002: streamingText is empty string', () => {
			const store = useStreamingTurnStore();
			expect(store.streamingText).toBe('');
		});

		it('streamingThinking is empty string', () => {
			const store = useStreamingTurnStore();
			expect(store.streamingThinking).toBe('');
		});

		it('streamingToolCalls is an empty Map', () => {
			const store = useStreamingTurnStore();
			expect(store.streamingToolCalls).toBeInstanceOf(Map);
			expect(store.streamingToolCalls.size).toBe(0);
		});

		it('lastUsage is null', () => {
			const store = useStreamingTurnStore();
			expect(store.lastUsage).toBeNull();
		});

		it('R-ASM-003: cliStartingUp is false', () => {
			const store = useStreamingTurnStore();
			expect(store.cliStartingUp).toBe(false);
		});

		it('REQ-ASM-035: sessionResumed is false', () => {
			const store = useStreamingTurnStore();
			expect(store.sessionResumed).toBe(false);
		});
	});

	describe('appendStreamingDelta', () => {
		it('NFR-ASM-002: accumulates streaming deltas', () => {
			const store = useStreamingTurnStore();
			store.appendStreamingDelta('Hello ');
			store.appendStreamingDelta('world');
			expect(store.streamingText).toBe('Hello world');
		});
	});

	describe('appendStreamingThinking', () => {
		it('accumulates thinking deltas', () => {
			const store = useStreamingTurnStore();
			store.appendStreamingThinking('thinking ');
			store.appendStreamingThinking('hard');
			expect(store.streamingThinking).toBe('thinking hard');
		});
	});

	describe('streaming tool-call lifecycle', () => {
		it('startStreamingToolCall seeds a fresh block', () => {
			const store = useStreamingTurnStore();
			store.startStreamingToolCall('b1', 'Bash', '{"cmd":');
			const entry = store.streamingToolCalls.get('b1');
			expect(entry).toEqual({ toolName: 'Bash', inputJson: '{"cmd":', done: false });
		});

		it('appendStreamingToolCallInput accumulates partial JSON on the matching block', () => {
			const store = useStreamingTurnStore();
			store.startStreamingToolCall('b1', 'Bash', '{"cmd":');
			store.appendStreamingToolCallInput('b1', '"ls"');
			store.appendStreamingToolCallInput('b1', '}');
			expect(store.streamingToolCalls.get('b1')?.inputJson).toBe('{"cmd":"ls"}');
		});

		it('appendStreamingToolCallInput is a no-op for an unknown blockId', () => {
			const store = useStreamingTurnStore();
			store.appendStreamingToolCallInput('ghost', 'x');
			expect(store.streamingToolCalls.size).toBe(0);
		});

		it('finishStreamingToolCall flips `done` to true on the matching block', () => {
			const store = useStreamingTurnStore();
			store.startStreamingToolCall('b1', 'Bash', '{}');
			store.finishStreamingToolCall('b1');
			expect(store.streamingToolCalls.get('b1')?.done).toBe(true);
		});

		it('finishStreamingToolCall is a no-op for an unknown blockId', () => {
			const store = useStreamingTurnStore();
			store.finishStreamingToolCall('ghost');
			expect(store.streamingToolCalls.size).toBe(0);
		});
	});

	describe('setLastUsage', () => {
		it('replaces the last-usage snapshot (last-write-wins)', () => {
			const store = useStreamingTurnStore();
			store.setLastUsage({ inputTokens: 100, outputTokens: 200 });
			store.setLastUsage({ inputTokens: 110, outputTokens: 220 });
			expect(store.lastUsage).toEqual({ inputTokens: 110, outputTokens: 220 });
		});
	});

	describe('setCliStartingUp / setSessionResumed', () => {
		it('R-ASM-003: setCliStartingUp toggles cliStartingUp', () => {
			const store = useStreamingTurnStore();
			store.setCliStartingUp(true);
			expect(store.cliStartingUp).toBe(true);
			store.setCliStartingUp(false);
			expect(store.cliStartingUp).toBe(false);
		});

		it('REQ-ASM-035: setSessionResumed toggles sessionResumed', () => {
			const store = useStreamingTurnStore();
			store.setSessionResumed(true);
			expect(store.sessionResumed).toBe(true);
			store.setSessionResumed(false);
			expect(store.sessionResumed).toBe(false);
		});
	});

	describe('resetStreaming', () => {
		it('clears streamingText and sessionResumed', () => {
			const store = useStreamingTurnStore();
			store.appendStreamingDelta('partial');
			store.setSessionResumed(true);
			store.resetStreaming();
			expect(store.streamingText).toBe('');
			expect(store.sessionResumed).toBe(false);
		});

		// ── Testing review F8 gap test ───────────────────────────────────
		it('Testing-F8: drops streamingText, streamingThinking, the tool-call map, AND lastUsage', () => {
			const store = useStreamingTurnStore();
			// Compose a mid-turn state that mimics a streaming swap.
			store.appendStreamingDelta('partial assistant reply');
			store.appendStreamingThinking('thinking-text');
			store.startStreamingToolCall('b1', 'Bash', '{"cmd":');
			store.appendStreamingToolCallInput('b1', '"ls"}');
			store.setLastUsage({ inputTokens: 12, outputTokens: 34 });
			store.setSessionResumed(true);
			expect(store.streamingText).not.toBe('');
			expect(store.streamingThinking).not.toBe('');
			expect(store.streamingToolCalls.size).toBe(1);
			expect(store.lastUsage).not.toBeNull();

			// Simulate a transport swap — the consumer (ChatSidebar /
			// ChatTurnOrchestrator) MUST call resetStreaming() and end up with
			// a fully-empty turn so the next adapter does not append onto stale
			// state.
			store.resetStreaming();

			expect(store.streamingText).toBe('');
			expect(store.streamingThinking).toBe('');
			expect(store.streamingToolCalls.size).toBe(0);
			expect(store.lastUsage).toBeNull();
			expect(store.sessionResumed).toBe(false);
		});

		it('does NOT clear cliStartingUp (owned by adapter lifecycle, not turn lifecycle)', () => {
			const store = useStreamingTurnStore();
			store.setCliStartingUp(true);
			store.appendStreamingDelta('mid-startup partial');
			store.resetStreaming();
			expect(store.cliStartingUp).toBe(true);
		});
	});

	describe('reset', () => {
		it('drops every per-turn slot AND cliStartingUp', () => {
			const store = useStreamingTurnStore();
			store.appendStreamingDelta('text');
			store.setCliStartingUp(true);
			store.setSessionResumed(true);
			store.reset();
			expect(store.streamingText).toBe('');
			expect(store.cliStartingUp).toBe(false);
			expect(store.sessionResumed).toBe(false);
		});
	});
});
