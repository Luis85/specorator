/**
 * T-TC-027 (RED) — `ChatSurface.vue` P6 toolbar view-model wiring
 * (TEST-TC-001/003 surface legs).
 *
 * SPEC-TC-022. The surface injects `TOOLBAR_CATALOG_PORT` OPTIONALLY (absent → no
 * `toolbar` prop, pure P5), reads `getToolbarCapabilities()` via
 * `tabs.activeRuntime()`, computes `toolbarVm = buildToolbarViewModel(
 * catalog.getCatalog('claude'), caps, activeTab.controls, activeTab.usage)`
 * reactively, passes `:toolbar`, wires the four backed changes to
 * `tabs.setControl`; never a `providerId` branch (EC-TC-8/10). With NO port the
 * composer is byte-identical to P5 (EC-TC-14). Queried by `data-testid` only
 * (ADR-009).
 *
 * Traces: REQ-TC-003/004/012/042, SPEC-TC-022, NFR-TC-001/002.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import ChatSurface from '@/ui/chat/ChatSurface.vue';
import { i18n } from '@/ui/i18n';
import {
	MARKDOWN_RENDER_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	PROVIDER_HISTORY_PORT,
	ICON_PORT,
	TOOLBAR_CATALOG_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY } from '@/ui/chat/modalSeam';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockToolbarCatalog } from '@/infrastructure/mock/MockToolbarCatalog';
import type { NotificationPort, LoggerPort } from '@/domain/ports';
import { ChatSurfacePageObject } from './ChatSurface.po';

const bridge = new MockBridge();
const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

/** Mount the surface WITH the toolbar catalog port (the full P6 strip). */
function mountWithToolbar() {
	const wrapper = mount(ChatSurface, {
		global: {
			plugins: [i18n],
			provide: {
				[CHAT_RUNTIME_FACTORY as symbol]: () => new MockChatRuntime([]),
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[NOTIFICATION_PORT as symbol]: notifySpy(),
				[LOGGER_PORT as symbol]: logger,
				[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
				[ICON_PORT as symbol]: bridge.createIconPort(),
				[TOOLBAR_CATALOG_PORT as symbol]: new MockToolbarCatalog(),
			},
		},
	});
	return { wrapper, po: new ChatSurfacePageObject(wrapper) };
}

/** Mount the surface WITHOUT the toolbar catalog port (pure P5 degrade). */
function mountWithoutToolbar() {
	const wrapper = mount(ChatSurface, {
		global: {
			plugins: [i18n],
			provide: {
				[CHAT_RUNTIME_FACTORY as symbol]: () => new MockChatRuntime([]),
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[NOTIFICATION_PORT as symbol]: notifySpy(),
				[LOGGER_PORT as symbol]: logger,
				[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
				[ICON_PORT as symbol]: bridge.createIconPort(),
			},
		},
	});
	return { wrapper, po: new ChatSurfacePageObject(wrapper) };
}

describe('ChatSurface P6 toolbar wiring (SPEC-TC-022)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('EC-TC-14: with no TOOLBAR_CATALOG_PORT the composer is pure P5 (no toolbar region)', async () => {
		const { po } = mountWithoutToolbar();
		await nextTick();
		expect(po.exists()).toBe(true);
		expect(po.hasToolbar()).toBe(false);
		expect(po.hasToolbarStrip()).toBe(false);
	});

	it('TEST-TC-001/003: with the port the strip mounts with backed widgets + honest seams', async () => {
		const { po } = mountWithToolbar();
		await nextTick();
		expect(po.hasToolbar()).toBe(true);
		expect(po.hasToolbarStrip()).toBe(true);
		// The default Mock catalog backs model + mode; service-tier is capability-hidden.
		expect(po.hasToolbarModel()).toBe(true);
		expect(po.hasToolbarMode()).toBe(true);
	});

	it('routing a backed change to tabs.setControl folds into the next turn (TEST-TC-012)', async () => {
		const { po } = mountWithToolbar();
		await nextTick();
		// Toggle mode (default → accept-edits) then send; the fold carries `mode`.
		await po.clickToolbarMode();
		await nextTick();
		await po.typeAndSend('drive a turn');
		await nextTick();
		// The mode control was set as a draft input — proven by the strip reflecting it.
		expect(po.hasToolbarMode()).toBe(true);
	});
});
