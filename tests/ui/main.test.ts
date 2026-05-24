/**
 * TEST-PSR-022 (T-PSR-016) — the standalone browser entry mounts AgentPanelRoot
 * with MockBridge. SPEC-PSR-017; REQ-PSR-011, NFR-PSR-005, OC-PSR-2.
 *
 * RED against the fat entry (mounts AppRoot + router); GREEN once src/ui/main.ts
 * is the minimal AgentPanelRoot mount.
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('standalone entry (TEST-PSR-022)', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('mounts AgentPanelRoot (data-testid="agent-panel-empty") with MockBridge', async () => {
		await import('@/ui/main');
		// Flush the post-mount microtask (locale narrowing) before asserting.
		await Promise.resolve();
		expect(document.querySelector('[data-testid="agent-panel-empty"]')).not.toBeNull();
	});
});
