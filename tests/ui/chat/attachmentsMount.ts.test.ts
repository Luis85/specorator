/**
 * T-CA-043 (RED) — the three P5 ports + the two modal launchers are provided in
 * BOTH entry points, and the context bar mounts (TEST-CA-020 mount leg + the
 * TEST-CA-M1 wiring leg).
 *
 * SPEC-CA-026: `src/plugin/AgentSidebarView.onOpen` and `src/ui/main.ts`
 * (standalone, MockBridge) each `app.provide(AUX_MODEL_PORT, …)` +
 * `app.provide(SELECTION_SOURCE_PORT, …)` + `app.provide(SELECTION_HIGHLIGHT_PORT,
 * …)` + `app.provide(OPEN_INLINE_EDIT, …)` + `app.provide(OPEN_IMAGE_PREVIEW, …)`
 * alongside the existing chat/composer ports, and `ChatSurface` mounts the
 * `ChatComposer` context bar wired to the captured-selection composable.
 *
 * Proven without reaching into Vue internals:
 *  - the Obsidian view path: a scripted Mock editor selection flows through the
 *    provided `SELECTION_SOURCE_PORT` + the `useCapturedSelection` composable into
 *    a rendered `selection-indicator` inside the `composer-context-bar` — proving
 *    the two selection ports reached the surface AND the context bar mounts;
 *  - the standalone path: the mount reads the bridge's `auxModel` /
 *    `selectionSource` / `selectionHighlight` members (the provides) and mounts the
 *    surface without an inject-or-throw.
 *
 * RED today: neither entry point provides the three ports or the two launchers,
 * and `ChatSurface` does not inject the selection ports / call
 * `useCapturedSelection` / pass a `capturedSelection` to the composer, so no
 * `selection-indicator` (and no `composer-context-bar`) ever renders even with a
 * scripted Mock selection, and the standalone mount never reads the new bridge
 * members. Queried by `data-testid` only (ADR-009). Traces:
 * REQ-CA-008/020/021, NFR-CA-002.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { EditorSelectionContext } from '@/domain/chat/attachments/Selection';

/** Microtask + reactive flush so a scripted selection tick is observable. */
async function settle(): Promise<void> {
	await flushPromises();
	await nextTick();
}

function $(selector: string): Element | null {
	return document.querySelector(selector);
}

const EDITOR_SELECTION: EditorSelectionContext = {
	kind: 'editor',
	notePath: 'notes/example.md',
	selectedText: 'the captured passage',
	startLine: 3,
	lineCount: 2,
};

describe('context-attachments standalone wiring (TEST-CA-020 mount leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('src/ui/main: provides the aux + selection ports (reads the bridge members) and mounts the surface', async () => {
		const { MockBridge } = await import('@/infrastructure/mock/MockBridge');
		const auxSpy = vi.spyOn(MockBridge.prototype, 'auxModel', 'get');
		const sourceSpy = vi.spyOn(MockBridge.prototype, 'selectionSource', 'get');
		const highlightSpy = vi.spyOn(MockBridge.prototype, 'selectionHighlight', 'get');

		await import('@/ui/main');
		await settle();

		// The surface mounts (no inject-or-throw from the new optional injects).
		expect($('[data-testid="chat-surface"]')).not.toBeNull();
		expect($('[data-testid="composer-textarea"]')).not.toBeNull();

		// The standalone entry provided the three new ports off the MockBridge — each
		// getter was read during the mount (SPEC-CA-026 standalone leg).
		expect(auxSpy).toHaveBeenCalled();
		expect(sourceSpy).toHaveBeenCalled();
		expect(highlightSpy).toHaveBeenCalled();
	});
});

describe('context-attachments Obsidian-view wiring + context-bar mount (TEST-CA-M1 wiring leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
		// A jsdom-backed obsidian mock so AgentSidebarView's import chain resolves and
		// `contentEl` hosts the Vue app. Mirrors composer/mount.ts.test.ts.
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

	it('AgentSidebarView.onOpen: a scripted Mock selection renders the selection-indicator in the context bar', async () => {
		const { AgentSidebarView } = await import('@/plugin/AgentSidebarView');
		const { MockBridge } = await import('@/infrastructure/mock/MockBridge');
		const bridge = new MockBridge();
		const plugin = { bridge, settings: { locale: 'en', logLevel: 'warn' } };

		const view = new AgentSidebarView({} as never, plugin as never);
		await view.onOpen();
		await settle();
		expect($('[data-testid="chat-surface"]')).not.toBeNull();

		// The two selection ports reached the surface (the provides) → a scripted Mock
		// editor selection flows through `useCapturedSelection` into the context bar.
		bridge.selectionSource.setSelection(EDITOR_SELECTION);
		await settle();

		expect($('[data-testid="composer-context-bar"]')).not.toBeNull();
		expect($('[data-testid="selection-indicator"]')).not.toBeNull();

		await view.onClose();
	});
});
