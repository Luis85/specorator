/**
 * FIX-3 (was R-CA-003) — the P5 context sets reset on a new / loaded conversation.
 *
 * SPEC-CA-022, REQ-CA-006, EC-CA-6. A captured selection (and, by the same path,
 * attached files / images) is composer-draft state owned by the surface; opening a
 * new conversation (the TabBar `+` / the `/new` built-in, both `tabs.openTab`) or
 * loading a different conversation into a tab MUST clear it so the next turn starts
 * clean. Before FIX-3 the sets only ever shrank via explicit remove — a new/loaded
 * conversation left a stale selection chip on the composer.
 *
 * Queried by `data-testid` only (ADR-009). Traces: R-CA-003, REQ-CA-006, SPEC-CA-022.
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
	SELECTION_SOURCE_PORT,
	SELECTION_HIGHLIGHT_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY } from '@/ui/chat/modalSeam';
import { ok } from '@/domain/shared/Result';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { MockSelectionSource, MockSelectionHighlight } from '@/infrastructure/mock/MockSelectionPorts';
import type { NotificationPort, LoggerPort } from '@/domain/ports';
import type { CapturedSelection } from '@/domain/chat/attachments';
import { ChatSurfacePageObject } from './ChatSurface.po';

const bridge = new MockBridge();
const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

const SELECTION: CapturedSelection = {
	kind: 'editor',
	notePath: 'notes/a.md',
	selectedText: 'a captured passage',
	startLine: 10,
	lineCount: 3,
};

/** Mount the surface with the selection ports so the captured-selection bar renders. */
function mountSurface() {
	const selectionSource = new MockSelectionSource();
	const selectionHighlight = new MockSelectionHighlight();
	const wrapper = mount(ChatSurface, {
		global: {
			plugins: [i18n],
			provide: {
				[CHAT_RUNTIME_FACTORY as symbol]: () => ok(new MockChatRuntime([])),
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[NOTIFICATION_PORT as symbol]: notifySpy(),
				[LOGGER_PORT as symbol]: logger,
				[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
				[ICON_PORT as symbol]: bridge.createIconPort(),
				[SELECTION_SOURCE_PORT as symbol]: selectionSource,
				[SELECTION_HIGHLIGHT_PORT as symbol]: selectionHighlight,
			},
		},
	});
	return { wrapper, po: new ChatSurfacePageObject(wrapper), selectionSource };
}

describe('ChatSurface context reset (FIX-3, REQ-CA-006)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-CA-006: opening a new conversation clears the captured selection (bar hidden)', async () => {
		const { po, selectionSource } = mountSurface();
		// Capture a selection → the context bar shows.
		selectionSource.setSelection(SELECTION);
		await nextTick();
		expect(po.hasContextBar()).toBe(true);

		// Open a new conversation (the TabBar `+`).
		await po.clickNewTab();
		await nextTick();
		expect(po.hasContextBar()).toBe(false);
	});
});
