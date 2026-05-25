/**
 * T-CP-048 (RED) — the three composer ports + the instruction-confirm seam are
 * provided in BOTH entry points, and the mounted composer exercises the composer
 * modes (TEST-CP-026 mount leg + TEST-CP-027 grep-gate hook).
 *
 * SPEC-CP-028 / SPEC-CP-038: `src/ui/main.ts` (standalone, MockBridge) and
 * `AgentSidebarView.onOpen` each `app.provide(MENTION_DATA_PROVIDER_PORT,
 * bridge.createMentionDataProvider())` + `app.provide(PROVIDER_COMMAND_CATALOG_PORT,
 * bridge.createProviderCommandCatalog())` + `app.provide(SHELL_EXEC_PORT,
 * bridge.shellExec)` + `app.provide(INSTRUCTION_CONFIRM, …)` alongside the existing
 * chat/history ports, and `ChatSurface` mounts `ChatComposer` WITH the live
 * `useComposerMode` arbiter so the composer modes are exercised against the mock
 * fixtures.
 *
 * Proven without reaching into Vue internals:
 *  - the standalone surface mounts the composer and, on typing `/`, the
 *    `composer-dropdown` resolves (slash palette over the Mock catalog) — the
 *    `PROVIDER_COMMAND_CATALOG_PORT` provide reached the live arbiter;
 *  - typing `@` resolves the `composer-dropdown` over the Mock mention fixtures —
 *    the `MENTION_DATA_PROVIDER_PORT` provide reached the live arbiter;
 *  - the depth-counted inline-block queue renders: an emitted ask-user request on
 *    the active runtime renders an `inline-ask` block in place of the composer —
 *    the `SHELL_EXEC_PORT`/`RespondToInlineBlockUseCase` wiring is live;
 *  - the Obsidian view path mounts the same surface (the four provides reached the
 *    sidebar mount).
 *
 * RED today: `ChatSurface` mounts `ChatComposer` WITHOUT the `composer` arbiter
 * prop, and neither entry point provides the three ports or `INSTRUCTION_CONFIRM`,
 * so typing `/`/`@` never opens `composer-dropdown` and no `inline-ask` ever
 * renders. Queried by `data-testid` only (ADR-009). Traces: REQ-CP-004/009/017/030,
 * NFR-CP-002.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

/** Microtask + reactive flush so a debounced query / mode change is observable. */
async function settle(): Promise<void> {
	await flushPromises();
	await nextTick();
}

/** Real-time wait past the mention debounce window (~120ms), then flush. */
async function waitDebounce(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 200));
	await settle();
}

function $(selector: string): Element | null {
	return document.querySelector(selector);
}

/** Type into the live composer textarea and fire `input` so the arbiter re-classifies. */
async function typeInComposer(text: string): Promise<HTMLTextAreaElement> {
	const ta = document.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]');
	if (ta === null) throw new Error('composer-textarea not found');
	ta.value = text;
	ta.setSelectionRange(text.length, text.length);
	ta.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
	return ta;
}

describe('composer-power entry-point wiring + mount (TEST-CP-026 mount leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('standalone (src/ui/main): mounts the composer; `/` then `@` open the dropdown', async () => {
		await import('@/ui/main');
		await settle();
		expect($('[data-testid="chat-surface"]')).not.toBeNull();
		expect($('[data-testid="composer-textarea"]')).not.toBeNull();

		// PROVIDER_COMMAND_CATALOG_PORT reached the live arbiter → the slash palette
		// resolves (built-ins ++ the Mock fixture commands).
		await typeInComposer('/');
		expect($('[data-testid="composer-dropdown"]')).not.toBeNull();

		// MENTION_DATA_PROVIDER_PORT reached the live arbiter → the mention palette
		// resolves the Mock referent fixtures after the debounce window.
		await typeInComposer('@');
		await waitDebounce();
		expect($('[data-testid="composer-dropdown"]')).not.toBeNull();
	}, 15000);
});

describe('composer-power inline-block queue (TEST-CP-026 mount leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
		// A jsdom-backed obsidian mock so AgentSidebarView's import chain resolves and
		// `contentEl` hosts the Vue app. Mirrors mount.rr.test.ts.
		vi.doMock('obsidian', () => {
			function augment(el: HTMLElement): HTMLElement {
				const e = el as unknown as {
					empty: () => void;
					createDiv: (o?: { cls?: string }) => HTMLElement;
				};
				e.empty = function (this: HTMLElement) {
					while (this.firstChild) this.removeChild(this.firstChild);
				};
				e.createDiv = function (this: HTMLElement, o?: { cls?: string }) {
					const child = document.createElement('div');
					if (o?.cls) child.className = o.cls;
					this.appendChild(child);
					return augment(child);
				};
				return el;
			}
			class ItemView {
				contentEl: HTMLElement;
				constructor(public leaf: unknown) {
					const host = document.createElement('div');
					document.body.appendChild(host);
					this.contentEl = augment(host);
				}
			}
			class Modal {
				app: unknown;
				constructor(app: unknown) {
					this.app = app;
				}
			}
			const specials: Record<string, unknown> = { ItemView, Modal, setIcon: () => {} };
			const cache = new Map<string, unknown>();
			const reserved = (p: string | symbol): boolean =>
				typeof p !== 'string' || p === '__esModule' || p === 'default' || p === 'then';
			return new Proxy(specials, {
				has: (_t, p) => !reserved(p),
				get: (target, p) => {
					if (reserved(p)) return undefined;
					const key = p as string;
					if (key in target) return target[key];
					let v = cache.get(key);
					if (v === undefined) {
						v = function NoOp() {};
						cache.set(key, v);
					}
					return v;
				},
			});
		});
	});

	it('AgentSidebarView.onOpen: mounts the composer surface with the composer ports provided', async () => {
		const { AgentSidebarView } = await import('@/plugin/AgentSidebarView');
		const { MockBridge } = await import('@/infrastructure/mock/MockBridge');
		const bridge = new MockBridge();
		const plugin = { bridge, settings: { locale: 'en', logLevel: 'warn' } };

		const view = new AgentSidebarView({} as never, plugin as never);
		await view.onOpen();
		await settle();

		// The sidebar mount provided the four composer provides (no inject-or-throw in
		// the live arbiter) → the surface + the composer textarea render.
		expect($('[data-testid="chat-surface"]')).not.toBeNull();
		expect($('[data-testid="composer-textarea"]')).not.toBeNull();

		await view.onClose();
	});

	it('AgentSidebarView.onOpen: an emitted ask-user request renders the inline-block queue', async () => {
		const { AgentSidebarView } = await import('@/plugin/AgentSidebarView');
		const { MockBridge } = await import('@/infrastructure/mock/MockBridge');
		const { MockChatRuntime } = await import('@/infrastructure/mock/MockChatRuntime');

		// A runtime the test can drive to invoke the registered ask-user callback.
		const runtime = new MockChatRuntime([]);
		const bridge = new MockBridge();
		vi.spyOn(bridge, 'createChatRuntime').mockReturnValue(runtime);
		const plugin = { bridge, settings: { locale: 'en', logLevel: 'warn' } };

		const view = new AgentSidebarView({} as never, plugin as never);
		await view.onOpen();
		await settle();
		expect($('[data-testid="composer-textarea"]')).not.toBeNull();

		// The runtime reaches an ask-user-question mid-turn → the registered callback
		// (wired by the surface) enqueues the inline block; the composer hides and the
		// inline-ask block renders in its place (the depth-counted queue, REQ-CP-027).
		void runtime.emitAskUserQuestion({
			requestId: 'q-req-1',
			questions: [
				{
					id: 'q1',
					question: 'Pick a colour',
					options: [
						{ id: 'a', label: 'Red' },
						{ id: 'b', label: 'Blue' },
					],
				},
			],
		});
		await settle();

		expect($('[data-testid="inline-ask"]')).not.toBeNull();
		expect($('[data-testid="composer-textarea"]')).toBeNull();

		await view.onClose();
	});
});
