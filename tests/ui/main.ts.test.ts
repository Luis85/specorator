/**
 * T-TS-039 — standalone multi-tab smoke (TEST-TS-026 dev leg, deterministic).
 *
 * The `npm run dev` / `build:web` entry (`src/ui/main.ts`) mounts the P3
 * multi-tab `ChatSurface` against `MockBridge` (one scripted runtime per tab via
 * the injected `CHAT_RUNTIME_FACTORY`, the `PROVIDER_HISTORY_PORT` seam, and the
 * browser-safe modal stand-ins). This is the deterministic leg of TEST-TS-026:
 * it proves the multi-tab surface mounts headlessly, a second tab opens, switching
 * tabs swaps the active conversation, and the active tab renders the P1/P2 chat
 * surface. The live-browser feel + the real-CLI resume/rewind pair with the
 * human's final review (T-TS-040/041). Queried by `data-testid` only (ADR-009).
 *
 * SPEC-TS-027; NFR-TS-002.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

/** Microtask + reactive flush so a streamed chunk / tab swap is observable. */
async function settle(): Promise<void> {
	await flushPromises();
	await nextTick();
}

function $(selector: string): Element | null {
	return document.querySelector(selector);
}

function $all(selector: string): NodeListOf<Element> {
	return document.querySelectorAll(selector);
}

describe('standalone multi-tab smoke (TEST-TS-026 dev leg)', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('mounts the multi-tab surface, opens + switches tabs, swapping the active conversation', async () => {
		await import('@/ui/main');
		await settle();

		// The P3 multi-tab surface mounts: the chat surface, the TabBar above it with
		// one initial badge, and the P1/P2 affordances (welcome + history opener).
		expect($('[data-testid="chat-surface"]')).not.toBeNull();
		expect($('[data-testid="tab-bar"]')).not.toBeNull();
		expect($all('[data-testid="tab-badge"]').length).toBe(1);
		expect($('[data-testid="chat-welcome"]')).not.toBeNull();
		expect($('[data-testid="history-open"]')).not.toBeNull();
		expect($('[data-testid="message-list"]')).toBeNull();

		// Tab 1: send a message → the active tab renders the P1/P2 chat surface
		// (the message list replaces the welcome state).
		const textarea = $('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
		textarea.value = 'Hello from tab one';
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		($('[data-testid="composer-send"]') as HTMLButtonElement).click();
		await settle();
		expect($('[data-testid="message-list"]')).not.toBeNull();
		expect($('[data-testid="chat-welcome"]')).toBeNull();

		// Open a second tab → two badges; the new (empty, active) tab swaps the
		// surface back to its own welcome state — tab 1's conversation is not shown.
		($('[data-testid="tab-new"]') as HTMLButtonElement).click();
		await settle();
		expect($all('[data-testid="tab-badge"]').length).toBe(2);
		expect($('[data-testid="chat-welcome"]')).not.toBeNull();
		expect($('[data-testid="message-list"]')).toBeNull();

		// Switch back to tab 1 → its conversation returns (message list), proving the
		// active conversation swaps per tab without cross-write (EC-TS-3).
		const firstBadge = $all('[data-testid="tab-badge"]')[0] as HTMLElement;
		firstBadge.click();
		await settle();
		expect($('[data-testid="message-list"]')).not.toBeNull();
		expect($('[data-testid="chat-welcome"]')).toBeNull();
	});
});
