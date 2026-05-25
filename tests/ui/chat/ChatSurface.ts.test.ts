/**
 * T-TS-034 (RED) — `ChatSurface.vue` P3 per-tab binding + compact (TEST-TS-024 +
 * TEST-TS-018 A leg + TEST-TS-007 view leg).
 *
 * SPEC-TS-026. The surface is driven by `tabsStore.activeTab` (renders the active
 * TabState, not a single chatStore root); composes `TabBar` above the message
 * region; a compact action dispatches `CompactConversationUseCase`; `$reset` on
 * unmount. The root keeps `data-provider="claude"`. Queried by `data-testid` only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ChatSurface from '@/ui/chat/ChatSurface.vue';
import { i18n } from '@/ui/i18n';
import {
	MARKDOWN_RENDER_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	PROVIDER_HISTORY_PORT,
	ICON_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY } from '@/ui/chat/modalSeam';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { NotificationPort, LoggerPort, StreamChunk } from '@/domain/ports';
import { ChatSurfacePageObject } from './ChatSurface.po';

const bridge = new MockBridge();

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function mountSurface() {
	const created: MockChatRuntime[] = [];
	const wrapper = mount(ChatSurface, {
		global: {
			plugins: [i18n],
			provide: {
				[CHAT_RUNTIME_FACTORY as symbol]: () => {
					const r = new MockChatRuntime([{ type: 'context_compacted' } as StreamChunk]);
					created.push(r);
					return r;
				},
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[NOTIFICATION_PORT as symbol]: notifySpy(),
				[LOGGER_PORT as symbol]: logger,
				[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
				[ICON_PORT as symbol]: bridge.createIconPort(),
			},
		},
	});
	return { wrapper, po: new ChatSurfacePageObject(wrapper), created };
}

describe('ChatSurface P3 per-tab (SPEC-TS-026)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('TEST-TS-024: mounts with data-provider="claude" and a TabBar above the region', () => {
		const { po } = mountSurface();
		expect(po.exists()).toBe(true);
		expect(po.providerAttr()).toBe('claude');
		expect(po.hasTabBar()).toBe(true);
		expect(po.tabBadgeCount()).toBe(1);
	});

	it('TEST-TS-007 view leg: opening a new tab from the bar adds a badge', async () => {
		const { po } = mountSurface();
		await po.clickNewTab();
		expect(po.tabBadgeCount()).toBe(2);
	});

	it('TEST-TS-024: renders the welcome state for an empty active tab', () => {
		const { po } = mountSurface();
		expect(po.showsWelcome()).toBe(true);
		expect(po.showsMessageList()).toBe(false);
	});

	it('TEST-TS-024: sending shows the active tab message list', async () => {
		const { po } = mountSurface();
		await po.typeAndSend('Hi there');
		await flushPromises();
		expect(po.showsMessageList()).toBe(true);
	});

	it('TEST-TS-018 A leg: the compact action is present and dispatches without throwing', async () => {
		const { po } = mountSurface();
		await po.typeAndSend('Hello');
		await flushPromises();
		expect(po.hasCompact()).toBe(true);
		await po.clickCompact();
		await flushPromises();
		// A context_compacted block routes through the existing P2 sink leg → block.
		expect(po.exists()).toBe(true);
	});

	it('builds one runtime per tab (per-tab isolation by construction)', async () => {
		const { po, created } = mountSurface();
		await po.clickNewTab();
		// One runtime for the initial tab + one for the opened tab.
		expect(created.length).toBe(2);
	});
});
