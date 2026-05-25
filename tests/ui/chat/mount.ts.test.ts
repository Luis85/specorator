/**
 * T-TS-037 — `PROVIDER_HISTORY_PORT` + the per-tab runtime factory are provided in
 * BOTH entry points; `TabBar` mounts above `ChatSurface` (TEST-TS-006/013/026 mount
 * legs).
 *
 * SPEC-TS-027: `src/ui/main.ts` (standalone, MockBridge) and `AgentSidebarView.onOpen`
 * each `app.provide(PROVIDER_HISTORY_PORT, …)` + `app.provide(CHAT_RUNTIME_FACTORY,
 * () => bridge.createChatRuntime())` + the modal seams, so the `tabsStore` builds one
 * runtime per tab and the surface renders the history dropdown + tab bar without an
 * inject-or-throw. Proven by the surface mounting with a TabBar badge present and the
 * history opener resolvable. Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('P3 entry-point wiring (SPEC-TS-027)', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('standalone (src/ui/main): mounts ChatSurface with a TabBar + a history opener', async () => {
		await import('@/ui/main');
		await Promise.resolve();
		const surface = document.querySelector('[data-testid="chat-surface"]');
		expect(surface).not.toBeNull();
		expect(surface?.getAttribute('data-provider')).toBe('claude');
		// TabBar mounts above the region with the initial empty tab badge.
		expect(document.querySelector('[data-testid="tab-bar"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="tab-badge"]')).not.toBeNull();
		// The history opener resolved PROVIDER_HISTORY_PORT (no inject-or-throw).
		expect(document.querySelector('[data-testid="history-open"]')).not.toBeNull();
		// A new tab opens through the bar (per-tab runtime factory provided).
		const newTab = document.querySelector<HTMLButtonElement>('[data-testid="tab-new"]');
		newTab?.click();
		await Promise.resolve();
		expect(document.querySelectorAll('[data-testid="tab-badge"]').length).toBe(2);
	});
});
