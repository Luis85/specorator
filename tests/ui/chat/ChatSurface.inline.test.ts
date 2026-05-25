/**
 * R-CP-002 (RED) — the inline-block render/respond channel must bind to the
 * ACTIVE TAB's runtime (the one `sendMessage` streams on), not a separate orphan.
 *
 * Before this fix `ChatSurface` built `composerRuntime = createRuntime()` — a
 * FRESH instance distinct from the per-tab streaming runtime (`tabsStore`). The
 * arbiter's `EnqueueRuntime` + `RespondToInlineBlockUseCase` registered the three
 * inline callbacks on that orphan, so an `ask_user_question` the streaming runtime
 * pulls never enqueued → never rendered. It was masked only when the factory
 * returned ONE shared instance (orphan ≡ tab runtime). Here the factory returns a
 * DISTINCT instance per call, so an inline request driven on the ACTIVE-TAB runtime
 * must still render — proving the channel is on that runtime, not an orphan.
 *
 * Queried by `data-testid` only (ADR-009). Traces: R-CP-002, ADR-CP-004 §1,
 * SPEC-CP-017, REQ-CP-023/027.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
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
	MENTION_DATA_PROVIDER_PORT,
	PROVIDER_COMMAND_CATALOG_PORT,
	SHELL_EXEC_PORT,
} from '@/infrastructure/bridge/ports';
import { CHAT_RUNTIME_FACTORY, INSTRUCTION_CONFIRM } from '@/ui/chat/modalSeam';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { NotificationPort, LoggerPort } from '@/domain/ports';
import { ChatSurfacePageObject } from './ChatSurface.po';

const bridge = new MockBridge();

function notifySpy(): NotificationPort {
	return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };
}

const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Mount the surface with the composer ports provided + a DISTINCT-instance factory. */
function mountSurface() {
	const created: MockChatRuntime[] = [];
	const wrapper = mount(ChatSurface, {
		global: {
			plugins: [i18n],
			provide: {
				[CHAT_RUNTIME_FACTORY as symbol]: () => {
					const r = new MockChatRuntime([]);
					created.push(r);
					return r;
				},
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[NOTIFICATION_PORT as symbol]: notifySpy(),
				[LOGGER_PORT as symbol]: logger,
				[PROVIDER_HISTORY_PORT as symbol]: new MockHistoryStore(),
				[ICON_PORT as symbol]: bridge.createIconPort(),
				[MENTION_DATA_PROVIDER_PORT as symbol]: bridge.createMentionDataProvider(),
				[PROVIDER_COMMAND_CATALOG_PORT as symbol]: bridge.createProviderCommandCatalog(),
				[SHELL_EXEC_PORT as symbol]: bridge.shellExec,
				[INSTRUCTION_CONFIRM as symbol]: () => Promise.resolve({ kind: 'reject' as const }),
			},
		},
	});
	return { wrapper, po: new ChatSurfacePageObject(wrapper), created };
}

const ASK_REQ = {
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
};

async function settle(): Promise<void> {
	await flushPromises();
	await nextTick();
}

describe('ChatSurface inline-block binding (R-CP-002)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('binds the inline channel to the ACTIVE TAB runtime (first created), not an orphan', async () => {
		const { wrapper, created } = mountSurface();
		await settle();
		// The active tab's runtime is the first one the factory built (the per-tab
		// streaming runtime the store seeded synchronously). The composer must NOT
		// build a second orphan runtime for its inline channel.
		const activeRuntime = created[0];
		expect(activeRuntime).toBeDefined();

		// Drive an ask-user request THROUGH the active-tab runtime — the same instance
		// `sendMessage` streams on. The registered callback (wired by the surface) must
		// enqueue the inline block so it renders in place of the composer.
		void activeRuntime.emitAskUserQuestion(ASK_REQ);
		await settle();

		expect(wrapper.find('[data-testid="inline-ask"]').exists()).toBe(true);
	});

	it('does NOT build a separate orphan runtime for the composer channel', async () => {
		const { created } = mountSurface();
		await settle();
		// One runtime per tab (the seeded first tab) — no extra orphan for the composer.
		expect(created.length).toBe(1);
	});
});
