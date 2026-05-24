/**
 * T-CC-028 (RED) — sidebar/standalone mount shows the chat surface, not the empty
 * placeholder (TEST-CC-015).
 *
 * SPEC-CC-022, REQ-CC-002/015. The standalone entry (`src/ui/main.ts`, MockBridge)
 * mounts `ChatSurface` (`data-testid="chat-surface"`) in place of the P0
 * `agent-panel-empty`, and provides `CHAT_RUNTIME_PORT` + `MARKDOWN_RENDER_PORT`
 * alongside the six core ports — proven by `ChatSurface` mounting without an
 * inject-or-throw failure (it calls `useChatRuntimePort()`). Queried by
 * `data-testid` only (ADR-009).
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('chat surface mount (TEST-CC-015)', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('mounts ChatSurface with both chat ports provided, not agent-panel-empty', async () => {
		await import('@/ui/main');
		// Flush the post-mount microtask (locale narrowing) before asserting.
		await Promise.resolve();
		const surface = document.querySelector('[data-testid="chat-surface"]');
		expect(surface).not.toBeNull();
		// data-provider="claude" set on the chat root (SPEC-CC-018 / B.3).
		expect(surface?.getAttribute('data-provider')).toBe('claude');
		// CHAT_RUNTIME_PORT provided => ChatSurface mounted at all (welcome renders).
		expect(document.querySelector('[data-testid="chat-welcome"]')).not.toBeNull();
		// The empty P0 placeholder is gone from the live view.
		expect(document.querySelector('[data-testid="agent-panel-empty"]')).toBeNull();
	});
});
