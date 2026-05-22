/**
 * Codex P2 regression (PR #369): when `resolveActiveThread()` rotates to a
 * fresh `ChatThreadRecord` on feature- or transport-mismatch, the previous
 * thread's in-memory message bucket must be dropped. Without this cleanup
 * those messages become unreachable (Increment 1 ships no thread switcher)
 * and accumulate unboundedly across long sessions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { defineComponent, ref } from 'vue';
import ChatSidebar from '@/ui/components/chat/ChatSidebar.vue';
import type {
	ChatTransportPort,
	ChatTransportStreamOptions,
	StreamDelta,
} from '@/domain/ports/ChatTransportPort';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import {
	CHAT_TRANSPORT_PORT,
	IS_MOBILE_KEY,
	VAULT_PORT,
	WORKSPACE_PORT,
	SETTINGS_PORT,
	LOGGER_PORT,
	TRANSPORT_KIND_KEY,
	ICON_PORT,
	PROVIDER_REGISTRY_KEY,
} from '@/infrastructure/bridge/ports';
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry';
import { i18n } from '@/ui/i18n';

const emptyRegistry: ProviderRegistry = {
	listProviders: () => [],
	getProvider: () => undefined,
	getCapabilities: () => undefined,
};
import type { TransportKind } from '@/domain/chat/TransportKind';
import { getChatStoresFacade } from '../../../__fakes__/chatStoresFacade';
import { ChatSidebarPO } from './ChatSidebar.po';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import type { ChatMessage } from '@/domain/chat/ChatMessage';

const RouterLinkStub = defineComponent({
	props: { to: { type: String, default: '' } },
	template: '<a :href="to"><slot /></a>',
});

class FixedClaudeCliPort implements ChatTransportPort {
	available = true;
	async isAvailable(): Promise<boolean> {
		return this.available;
	}
	async *queryStream(
		_prompt: string,
		_options?: ChatTransportStreamOptions,
	): AsyncIterable<StreamDelta> {
		yield { type: 'text', text: 'assistant reply' };
		yield { type: 'done' };
	}
}

function makeBridge(): MockBridge {
	const bridge = new MockBridge();
	const settings: PluginSettings = {
		...DEFAULT_SETTINGS,
	};
	vi.spyOn(bridge, 'getSettings').mockResolvedValue(settings);
	return bridge;
}

async function mountSidebar(resolvedKind: TransportKind = 'api-key') {
	const pinia = createPinia();
	setActivePinia(pinia);
	const port = new FixedClaudeCliPort();
	const bridge = makeBridge();
	const transportKindRef = ref<TransportKind>(resolvedKind);
	const wrapper = mount(ChatSidebar, {
		global: {
			plugins: [pinia, i18n],
			stubs: { RouterLink: RouterLinkStub },
			provide: {
				[CHAT_TRANSPORT_PORT as symbol]: port,
				[IS_MOBILE_KEY as symbol]: false,
				[VAULT_PORT as symbol]: bridge,
				[WORKSPACE_PORT as symbol]: bridge,
				[SETTINGS_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: bridge,
				[TRANSPORT_KIND_KEY as symbol]: transportKindRef,
				[ICON_PORT as symbol]: bridge,
				[PROVIDER_REGISTRY_KEY as symbol]: emptyRegistry,
			},
		},
	});
	await flushPromises();
	const store = getChatStoresFacade(pinia);
	return { wrapper, store, po: new ChatSidebarPO(wrapper), transportKindRef };
}

function seedThread(
	store: ReturnType<typeof getChatStoresFacade>,
	record: ChatThreadRecord,
	messageTexts: string[],
): void {
	store.upsertThread(record);
	for (const text of messageTexts) {
		store.appendMessage({
			id: `id-${text}`,
			threadId: record.threadId,
			role: 'user',
			text,
			createdAt: new Date().toISOString(),
		} satisfies ChatMessage);
	}
}

describe('ChatSidebar — thread auto-rotation evicts orphaned messages (Codex P2, PR #369)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("drops the previous thread's message bucket on transport mismatch", async () => {
		const { store, po } = await mountSidebar('subscription');

		const previousThreadId = 'prev-thread-id';
		seedThread(
			store,
			{
				threadId: previousThreadId,
				sessionId: null,
				feature: null,
				logPath: '',
				transport: { provider: 'claude', mode: 'api' }, // mismatches resolved 'subscription'
				title: '',
				forkParent: null,
				createdAt: '2026-05-15T00:00:00Z',
				lastUsedAt: '2026-05-15T00:00:00Z',
			},
			['old turn 1', 'old turn 2'],
		);
		store.setActiveThreadId(previousThreadId);
		expect(store.messages.get(previousThreadId)).toHaveLength(2);

		store.setUserText('new turn');
		await flushPromises();
		await po.clickSend();
		await flushPromises();

		// After send the active thread should have rotated.
		expect(store.activeThreadId).not.toBe(previousThreadId);
		// And the old bucket should be evicted.
		expect(store.messages.has(previousThreadId)).toBe(false);
	});

	it("drops the previous thread's message bucket on feature mismatch", async () => {
		const { store, po } = await mountSidebar('api-key');

		const previousThreadId = 'prev-thread-feature';
		seedThread(
			store,
			{
				threadId: previousThreadId,
				sessionId: null,
				feature: 'old-feature', // current active file resolves to null feature
				logPath: '',
				transport: { provider: 'claude', mode: 'api' },
				title: '',
				forkParent: null,
				createdAt: '2026-05-15T00:00:00Z',
				lastUsedAt: '2026-05-15T00:00:00Z',
			},
			['kept turn'],
		);
		store.setActiveThreadId(previousThreadId);
		expect(store.messages.get(previousThreadId)).toHaveLength(1);

		store.setUserText('new turn');
		await flushPromises();
		await po.clickSend();
		await flushPromises();

		expect(store.activeThreadId).not.toBe(previousThreadId);
		expect(store.messages.has(previousThreadId)).toBe(false);
	});

	it('keeps the previous bucket intact when the same thread is reused (no rotation)', async () => {
		const { store, po } = await mountSidebar('api-key');

		const tid = 'same-thread';
		seedThread(
			store,
			{
				threadId: tid,
				sessionId: null,
				feature: null,
				logPath: '',
				transport: { provider: 'claude', mode: 'api' },
				title: '',
				forkParent: null,
				createdAt: '2026-05-15T00:00:00Z',
				lastUsedAt: '2026-05-15T00:00:00Z',
			},
			['turn A', 'turn B'],
		);
		store.setActiveThreadId(tid);

		store.setUserText('continue');
		await flushPromises();
		await po.clickSend();
		await flushPromises();

		expect(store.activeThreadId).toBe(tid);
		const bucket = store.messages.get(tid) ?? [];
		// Existing two turns + new user+assistant pair = 4 entries minimum.
		expect(bucket.length).toBeGreaterThanOrEqual(4);
	});
});
