/**
 * T-RR-040 (RED) — `ICON_PORT` is provided in BOTH entry points (TEST-RR-024 wire leg).
 *
 * SPEC-RR-021 / SPEC-CC-022: `AgentSidebarView.onOpen` and `src/ui/main.ts` must
 * `app.provide(ICON_PORT, bridge.createIconPort())` alongside the existing nine
 * ports. This extends the P1 mount/standalone test (TEST-CC-015 / TEST-PSR-022):
 * each entry point mounts the real chat surface against `MockBridge`, streams the
 * default scripted RICH turn (SPEC-RR-013), and the resulting `ToolCallBlock`
 * resolves its header icon through the injected port — proven by an `sp-icon`
 * (with a rendered `<svg>`) appearing in the finalised assistant turn.
 *
 * RED today: neither entry point provides `ICON_PORT`, so `SpIcon`'s
 * `useIconPort()` throws when the dispatcher mounts a `ToolCallBlock`; the
 * `ErrorBoundary` swallows it and no `sp-icon` ever renders. Queried by
 * `data-testid` only (ADR-009). Traces: REQ-RR-019, NFR-RR-001.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Drive the live (real-DOM) chat surface through one full turn: type into the
 * composer textarea, send with Enter, then flush the per-chunk microtask yield
 * boundaries until the scripted rich turn (+ its `done`) is fully accumulated.
 */
async function sendAndDrainRichTurn(): Promise<void> {
	const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]');
	if (textarea === null) throw new Error('composer-textarea not found');
	textarea.value = 'go';
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	await Promise.resolve();
	textarea.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
	);
	// The MockChatRuntime yields each scripted chunk on its own resumed tick, so
	// drain generously past the ~17-chunk default rich script + the terminating
	// `done` to let the store accumulate every block before asserting.
	for (let i = 0; i < 60; i++) {
		await Promise.resolve();
	}
}

function svgUnderIcon(): boolean {
	const icon = document.querySelector('[data-testid="sp-icon"]');
	return icon !== null && icon.querySelector('svg') !== null;
}

describe('ICON_PORT entry-point wiring (TEST-RR-024 wire leg)', () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
		const el = document.createElement('div');
		el.id = 'app';
		document.body.appendChild(el);
	});

	it('standalone (src/ui/main): a streamed rich turn resolves a tool-call icon through ICON_PORT', async () => {
		await import('@/ui/main');
		// Flush the post-mount microtask (locale narrowing) before driving.
		await Promise.resolve();
		expect(document.querySelector('[data-testid="chat-surface"]')).not.toBeNull();

		await sendAndDrainRichTurn();

		// The scripted Read/Write/TodoWrite tool calls render `ToolCallBlock`s, each
		// with an `SpIcon` header — proving ICON_PORT was provided by the entry point.
		expect(document.querySelector('[data-testid="message-blocks"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="tool-call-header"]')).not.toBeNull();
		expect(svgUnderIcon()).toBe(true);
	});
});

describe('ICON_PORT entry-point wiring — AgentSidebarView (TEST-RR-024 wire leg)', () => {
	// A jsdom-backed obsidian mock: `ItemView` exposes a real `contentEl` with the
	// Obsidian `createDiv`/`empty` helpers the view uses to host the Vue app; every
	// other named export is a callable+constructable no-op so the import chain
	// resolves. Mirrors the settings-tab test's PluginSettingTab shim.
	beforeEach(() => {
		vi.resetModules();
		document.body.replaceChildren();
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
			const specials: Record<string, unknown> = { ItemView, setIcon: () => {} };
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

	it('AgentSidebarView.onOpen: a streamed rich turn resolves a tool-call icon through ICON_PORT', async () => {
		const { AgentSidebarView } = await import('@/plugin/AgentSidebarView');
		const { MockBridge } = await import('@/infrastructure/mock/MockBridge');
		const bridge = new MockBridge();
		const plugin = { bridge, settings: { locale: 'en', logLevel: 'warn' } };

		const view = new AgentSidebarView({} as never, plugin as never);
		await view.onOpen();
		await Promise.resolve();
		expect(document.querySelector('[data-testid="chat-surface"]')).not.toBeNull();

		await sendAndDrainRichTurn();

		expect(document.querySelector('[data-testid="message-blocks"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="tool-call-header"]')).not.toBeNull();
		expect(svgUnderIcon()).toBe(true);

		await view.onClose();
	});
});
