/**
 * T-TC-030 (RED) — the `TOOLBAR_CATALOG_PORT` is provided in BOTH entry points
 * and the toolbar strip mounts (TEST-TC-001/003 mount legs + the TEST-TC-M1
 * wiring leg).
 *
 * SPEC-TC-025: `src/plugin/AgentSidebarView.onOpen` and `src/ui/main.ts`
 * (standalone, MockBridge) each `app.provide(TOOLBAR_CATALOG_PORT, …)` (the
 * bridge's `toolbarCatalog` catalog) alongside the existing chat/composer ports;
 * the per-tab Claude `ChatRuntimePort` already exposes `getToolbarCapabilities()`
 * (read via `tabs.activeRuntime()`), so the `ChatComposer`/`ChatSurface` toolbar
 * region mounts the backed widgets + the honest seams. Without the port the
 * composer is byte-identical to P5 (EC-TC-14).
 *
 * Proven without reaching into Vue internals:
 *  - the standalone path: the mount reads the bridge's `toolbarCatalog` member
 *    (the provide) AND the surface renders the `toolbar-strip` with the default
 *    Mock-backed `toolbar-model` widget — proving the port reached the surface;
 *  - the Obsidian view path: `AgentSidebarView.onOpen` mounts the surface with the
 *    strip rendered (the `ObsidianBridge.toolbarCatalog` provide wired end-to-end).
 *
 * RED today: neither entry point provides `TOOLBAR_CATALOG_PORT`, so the
 * `ChatSurface` optional inject resolves `undefined` → no `toolbar` prop → no
 * `toolbar-strip` ever renders, and the standalone mount never reads the bridge's
 * `toolbarCatalog` member. Queried by `data-testid` only (ADR-009). Traces:
 * REQ-TC-003/010/021, SPEC-TC-025, NFR-TC-002.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

/** Microtask + reactive flush so the mounted surface + strip are observable. */
async function settle(): Promise<void> {
	await flushPromises();
	await nextTick();
}

function $(selector: string): Element | null {
	return document.querySelector(selector);
}

describe('toolbar-controls standalone wiring (TEST-TC-001/003 mount leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('src/ui/main: provides the toolbar catalog port (reads the bridge member) and mounts the strip', async () => {
		const { MockBridge } = await import('@/infrastructure/mock/MockBridge');
		const catalogSpy = vi.spyOn(MockBridge.prototype, 'toolbarCatalog', 'get');

		await import('@/ui/main');
		await settle();

		// The surface mounts (no inject-or-throw from the new optional inject).
		expect($('[data-testid="chat-surface"]')).not.toBeNull();

		// The standalone entry provided the toolbar catalog port off the MockBridge —
		// the getter was read during the mount (SPEC-TC-025 standalone leg).
		expect(catalogSpy).toHaveBeenCalled();

		// The strip mounts with the default Mock-backed model widget (the port + caps
		// reached the surface → the view-model is non-undefined).
		expect($('[data-testid="toolbar-strip"]')).not.toBeNull();
		expect($('[data-testid="toolbar-model"]')).not.toBeNull();
	});
});

describe('toolbar-controls Obsidian-view wiring + strip mount (TEST-TC-M1 wiring leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
		// A jsdom-backed obsidian mock so AgentSidebarView's import chain resolves and
		// `contentEl` hosts the Vue app. Mirrors attachmentsMount.ts.test.ts.
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

	it('AgentSidebarView.onOpen: the toolbar strip mounts (the ObsidianBridge catalog provide)', async () => {
		const { AgentSidebarView } = await import('@/plugin/AgentSidebarView');
		const { MockBridge } = await import('@/infrastructure/mock/MockBridge');
		const bridge = new MockBridge();
		const plugin = { bridge, settings: { locale: 'en', logLevel: 'warn' } };

		const view = new AgentSidebarView({} as never, plugin as never);
		await view.onOpen();
		await settle();
		expect($('[data-testid="chat-surface"]')).not.toBeNull();

		// The toolbar catalog port reached the surface (the provide) → the strip mounts
		// with the default Mock-backed model widget (SPEC-TC-025 Obsidian leg).
		expect($('[data-testid="toolbar-strip"]')).not.toBeNull();
		expect($('[data-testid="toolbar-model"]')).not.toBeNull();

		await view.onClose();
	});
});
