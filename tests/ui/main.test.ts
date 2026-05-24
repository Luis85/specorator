/**
 * TEST-PSR-022 (T-PSR-016) — the standalone browser entry mounts the agent surface
 * with MockBridge. SPEC-PSR-017; REQ-PSR-011, NFR-PSR-005, OC-PSR-2.
 *
 * P1 chat-core (T-CC-029, SPEC-CC-022) replaced the empty `AgentPanelRoot`
 * placeholder with `ChatSurface`, so this asserts the chat surface now mounts
 * (the welcome state renders against the scripted MockChatRuntime). The P0
 * placeholder is gone from the live standalone entry. Queried by `data-testid`
 * only (ADR-009).
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('standalone entry (TEST-PSR-022)', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('mounts ChatSurface (data-testid="chat-surface") with MockBridge', async () => {
		await import('@/ui/main');
		// Flush the post-mount microtask (locale narrowing) before asserting.
		await Promise.resolve();
		expect(document.querySelector('[data-testid="chat-surface"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="agent-panel-empty"]')).toBeNull();
	});
});
