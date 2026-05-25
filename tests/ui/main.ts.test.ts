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
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

/**
 * T-CP-050 — standalone composer-power smoke (TEST-CP-026 dev leg, deterministic).
 *
 * The `npm run dev` entry (`src/ui/main.ts`) provides the three composer ports +
 * the instruction-confirm stand-in (T-CP-049) and mounts the live `useComposerMode`
 * arbiter into `ChatComposer`. This deterministic leg drives the trigger modes
 * against `MockBridge`: typing `/` opens the slash dropdown over the Mock catalog,
 * `@` opens the mention dropdown over the Mock referent fixtures, Shift+Tab toggles
 * the PLAN indicator (the capable mock), and `!echo hi`+Enter runs the scripted-echo
 * `ShellExecPort` and surfaces the output block. The live-feel pairs with the human's
 * final review (T-CP-051/052). Queried by `data-testid` only (ADR-009). SPEC-CP-028;
 * NFR-CP-002.
 */
async function typeComposer(text: string): Promise<HTMLTextAreaElement> {
	const ta = $('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
	ta.value = text;
	ta.setSelectionRange(text.length, text.length);
	ta.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
	return ta;
}

/** Real-time wait past the mention debounce window (~120ms), then flush. */
async function waitDebounce(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 200));
	await settle();
}

describe('standalone composer-power smoke (TEST-CP-026 dev leg)', () => {
	beforeEach(() => {
		// Reset the module registry so `@/ui/main` re-executes its mount onto the
		// fresh `#app` (the prior describe already imported + cached it).
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('drives slash / mention / plan-toggle / bang-bash against MockBridge', async () => {
		await import('@/ui/main');
		await settle();
		expect($('[data-testid="composer-textarea"]')).not.toBeNull();

		// `/` opens the slash command dropdown (PROVIDER_COMMAND_CATALOG_PORT wired).
		await typeComposer('/');
		expect($('[data-testid="composer-dropdown"]')).not.toBeNull();

		// `@` opens the mention dropdown (MENTION_DATA_PROVIDER_PORT wired) after the
		// debounce window resolves the Mock referent fixtures.
		await typeComposer('@');
		await waitDebounce();
		expect($('[data-testid="composer-dropdown"]')).not.toBeNull();

		// Shift+Tab toggles the PLAN indicator (the capable Mock runtime reports
		// supportsPlanMode:true) — the orthogonal plan flag, distinct from the mode.
		await typeComposer('');
		const ta = $('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
		ta.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
		);
		await settle();
		expect($('[data-testid="plan-indicator"]')).not.toBeNull();
		// Toggle off again so it does not bleed into the bang-bash leg.
		ta.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
		);
		await settle();

		// `!echo hi` + Enter runs the scripted-echo ShellExecPort → the output block
		// renders the command + stdout (the Mock echoes the command verbatim).
		await typeComposer('!echo hi');
		ta.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
		);
		await settle();
		expect($('[data-testid="bang-bash-output"]')).not.toBeNull();
		expect($('[data-testid="bang-bash-output-stdout"]')?.textContent).toContain('echo hi');
	}, 15000);
});

/**
 * T-CA-045 — standalone attachments smoke (TEST-CA-007/004 dev leg, deterministic).
 *
 * The `npm run dev` entry (`src/ui/main.ts`) provides the P5 aux + selection ports
 * + the browser-safe modal launcher stand-ins (T-CA-044) and mounts the
 * `ChatComposer` context bar into `ChatSurface`. This deterministic leg proves the
 * P5 wiring runs against `MockBridge` without an inject-or-throw and stays
 * behaviour-identical to P4 when no context is present: the surface + composer
 * mount, and the `composer-context-bar` is HIDDEN with empty file/image/selection
 * sets (the P4-byte-identical gate, SPEC-CA-022 G2). The scripted-selection /
 * file-chip / image-thumb / inline-edit-stand-in flows depend on the attach
 * affordance + store-set wiring (T-CA-033/034) + the live dev server, which pair
 * with the human run (recorded in `test-plan.md`). Queried by `data-testid` only
 * (ADR-009). SPEC-CA-026; NFR-CA-002.
 */
describe('standalone attachments smoke (TEST-CA-007/004 dev leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('mounts the context surface (composer present, context bar hidden when empty) against MockBridge', async () => {
		await import('@/ui/main');
		await settle();

		// The P5-wired surface + composer mount (the new optional selection/aux injects
		// + the context-bar slot run without an inject-or-throw).
		expect($('[data-testid="chat-surface"]')).not.toBeNull();
		expect($('[data-testid="composer-textarea"]')).not.toBeNull();

		// No file / image / selection context yet → the context bar is HIDDEN, exactly
		// the P4 byte-identical composer (SPEC-CA-022 G2). The chip / thumb / indicator
		// affordances therefore do not render either.
		expect($('[data-testid="composer-context-bar"]')).toBeNull();
		expect($('[data-testid="file-chips"]')).toBeNull();
		expect($('[data-testid="image-context-bar"]')).toBeNull();
		expect($('[data-testid="selection-indicator"]')).toBeNull();
	}, 15000);
});

/**
 * T-TC-032 — standalone toolbar smoke (TEST-TC-001/004/042 dev leg, deterministic).
 *
 * The `npm run dev` entry (`src/ui/main.ts`) provides `TOOLBAR_CATALOG_PORT`
 * (T-TC-031, the scriptable Mock Claude-shaped catalog) and the Mock runtime reports
 * `getToolbarCapabilities()` (Claude-shaped: `supportsMcpTools:false`,
 * `reasoningControl:'effort'`, `hasServiceTier:false`, `hasModeToggle:true`,
 * `permissionMode:'normal'` — P7 widens the P6 `'default'`, SPEC-AS-006b). This
 * deterministic leg proves the strip mounts against
 * `MockBridge` in Claudian order with the backed widgets (model · mode · thinking) +
 * the honest seams (permission visible-disabled, MCP capability-hidden, service-tier
 * capability-hidden, external visible-disabled), the usage meter is hidden on a fresh
 * tab (`usage===null`, EC-TC-7), and a tab switch re-derives every widget without a
 * `providerId` branch (EC-TC-8). The backed-pick / fold-on-submit / live-arc-rerender
 * flows are automated by `ChatSurface.toolbar.test.ts`; the live-dev-server feel pairs
 * with the human run (recorded in `test-plan.md`, T-TC-032 manual leg). Queried by
 * `data-testid` only (ADR-009). SPEC-TC-025; REQ-TC-042; NFR-TC-002.
 */
describe('standalone toolbar smoke (TEST-TC-001/004/042 dev leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('mounts the strip with the backed widgets + honest seams against MockBridge, re-deriving on tab switch', async () => {
		await import('@/ui/main');
		await settle();

		// The strip mounts (the TOOLBAR_CATALOG_PORT provide reached the surface + the
		// Mock runtime reported its capabilities via tabs.activeRuntime()).
		expect($('[data-testid="toolbar-strip"]')).not.toBeNull();

		// Backed widgets render off the default Mock Claude-shaped catalog + caps:
		// model (always), mode (hasModeToggle + descriptor), thinking (effort, 3 opts).
		expect($('[data-testid="toolbar-model"]')).not.toBeNull();
		expect($('[data-testid="toolbar-mode"]')).not.toBeNull();
		expect($('[data-testid="toolbar-thinking"]')).not.toBeNull();

		// Honest seams: permission visible-disabled; external visible-disabled; MCP +
		// service-tier capability-hidden on the inert Claude flags (slots collapse).
		expect($('[data-testid="toolbar-permission"]')).not.toBeNull();
		expect($('[data-testid="toolbar-external"]')).not.toBeNull();
		expect($('[data-testid="toolbar-mcp"]')).toBeNull();
		expect($('[data-testid="toolbar-service-tier"]')).toBeNull();

		// Fresh tab → no usage stream yet → the meter is HIDDEN (EC-TC-7, no zero-gauge).
		expect($('[data-testid="toolbar-usage"]')).toBeNull();

		// Open a second tab → the strip re-derives from the new active tab's controls +
		// caps (per-tab isolation, EC-TC-8) — the backed widgets still render, no throw.
		($('[data-testid="tab-new"]') as HTMLButtonElement).click();
		await settle();
		expect($('[data-testid="toolbar-strip"]')).not.toBeNull();
		expect($('[data-testid="toolbar-model"]')).not.toBeNull();
		expect($('[data-testid="toolbar-mode"]')).not.toBeNull();
	}, 15000);
});
