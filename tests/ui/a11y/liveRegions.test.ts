/**
 * T-AY-008 (RED -> verify+fill) — live-region presence + severity (TEST-AY-010).
 * SPEC-AY-004, REQ-AY-010, NFR-AY-001, EC-AY-011/012.
 *
 * Two legs:
 *  - Busy region (verify-only): the `ChatSurface` streaming busy region carries
 *    `aria-live="polite"` + `role="status"` (already present, lines 856-857).
 *  - Notice host (fill, T-AY-011): the standalone notice host announces error
 *    notices ASSERTIVE (`role="alert"`) and info/success POLITE (`role="status"`)
 *    via an `aria-live` region that mirrors the notice text DECLARATIVELY (no
 *    `innerHTML`/`v-html`) and NEVER steals focus.
 *
 * The notice host is `NoticeLiveRegion.vue` (created in T-AY-011), driven by the
 * existing `sp:notice` CustomEvent channel `LocalStorageBridge` already dispatches
 * — no new port, no new channel. Queried by `data-testid` only (ADR-009).
 *
 * Traces: TEST-AY-010, SPEC-AY-004, REQ-AY-010, NFR-AY-001, EC-AY-011, EC-AY-012.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ChatSurface from '@/ui/chat/ChatSurface.vue';
import NoticeLiveRegion from '@/ui/components/NoticeLiveRegion.vue';
import { i18n } from '@/ui/i18n';
import {
	MARKDOWN_RENDER_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	PROVIDER_HISTORY_PORT,
	ICON_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY } from '@/ui/chat/modalSeam';
import { ok } from '@/domain/shared/Result';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { ChatRuntimePort, StreamChunk, NotificationPort, LoggerPort } from '@/domain/ports';
import { ChatSurfacePageObject } from '../chat/ChatSurface.po';
import { NoticeLiveRegionPageObject } from './NoticeLiveRegion.po';

const iconBridge = new MockBridge();
const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

/** A streaming runtime that keeps the busy region open until done. */
class StreamingRuntime extends MockChatRuntime {
	private gate: (() => void) | null = null;
	private readonly queued: StreamChunk[] = [];
	constructor() {
		super([]);
	}
	override ensureReady(): Promise<boolean> {
		return Promise.resolve(true);
	}
	override async *query(): AsyncGenerator<StreamChunk> {
		for (;;) {
			if (this.queued.length === 0) {
				await new Promise<void>((resolve) => (this.gate = resolve));
			}
			const chunk = this.queued.shift();
			if (chunk === undefined) continue;
			yield chunk;
			if (chunk.type === 'done') return;
		}
	}
	emit(chunk: StreamChunk): void {
		this.queued.push(chunk);
		this.gate?.();
		this.gate = null;
	}
}

function mountSurface(runtime: ChatRuntimePort) {
	const wrapper = mount(ChatSurface, {
		global: {
			plugins: [i18n],
			provide: {
				[CHAT_RUNTIME_FACTORY as symbol]: () => ok(runtime),
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[NOTIFICATION_PORT as symbol]: notifySpy(),
				[LOGGER_PORT as symbol]: logger,
				[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
				[ICON_PORT as symbol]: iconBridge.createIconPort(),
			},
		},
	});
	return { wrapper, po: new ChatSurfacePageObject(wrapper) };
}

/** Dispatch the `sp:notice` channel the standalone notice host listens to. */
function emitNotice(severity: string, message: string): void {
	window.dispatchEvent(new CustomEvent('sp:notice', { detail: { severity, message, durationMs: 0 } }));
}

describe('live regions (TEST-AY-010)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('busy region carries aria-live=polite + role=status while streaming (verify-only)', async () => {
		const runtime = new StreamingRuntime();
		const { po } = mountSurface(runtime);
		await po.typeAndSend('Hi');
		await flushPromises();
		expect(po.showsBusy()).toBe(true);
		expect(po.busyAriaLive()).toBe('polite');
		expect(po.busyRole()).toBe('status');
	});
});

describe('NoticeLiveRegion notice host (SPEC-AY-004)', () => {
	it('renders a polite live region by default', () => {
		const wrapper = mount(NoticeLiveRegion, { global: { plugins: [i18n] } });
		const po = new NoticeLiveRegionPageObject(wrapper);
		expect(po.exists()).toBe(true);
		expect(po.ariaLive()).toBe('polite');
		expect(po.role()).toBe('status');
	});

	it('announces an info notice POLITE, mirroring the text (EC-AY-011)', async () => {
		const wrapper = mount(NoticeLiveRegion, { global: { plugins: [i18n] } });
		const po = new NoticeLiveRegionPageObject(wrapper);
		emitNotice('info', 'Saved');
		await flushPromises();
		expect(po.ariaLive()).toBe('polite');
		expect(po.role()).toBe('status');
		expect(po.text()).toContain('Saved');
	});

	it('announces an error notice ASSERTIVE (EC-AY-012)', async () => {
		const wrapper = mount(NoticeLiveRegion, { global: { plugins: [i18n] } });
		const po = new NoticeLiveRegionPageObject(wrapper);
		emitNotice('error', 'Boom');
		await flushPromises();
		expect(po.ariaLive()).toBe('assertive');
		expect(po.role()).toBe('alert');
		expect(po.text()).toContain('Boom');
	});

	it('does not steal focus when a notice fires', async () => {
		const probe = document.createElement('input');
		document.body.appendChild(probe);
		probe.focus();
		const wrapper = mount(NoticeLiveRegion, { attachTo: document.body, global: { plugins: [i18n] } });
		emitNotice('error', 'Boom');
		await flushPromises();
		expect(document.activeElement).toBe(probe);
		wrapper.unmount();
		probe.remove();
	});

	it('mirrors the notice text declaratively (no raw-HTML sink)', async () => {
		const wrapper = mount(NoticeLiveRegion, { global: { plugins: [i18n] } });
		const po = new NoticeLiveRegionPageObject(wrapper);
		emitNotice('info', '<b>x</b>');
		await flushPromises();
		// The angle brackets are escaped as text, never injected as markup.
		expect(po.html()).not.toContain('<b>x</b>');
		expect(po.text()).toContain('<b>x</b>');
	});
});
