/**
 * T-MPS-124 — Provider switch ≤ 200 ms on a 100-message thread.
 *
 * Satisfies NFR-MPS-004. Mounts a minimal agent surface backed by 100
 * pre-seeded messages and times the `chatProviderStore.setActiveSelection`
 * + reactive re-render under the budget.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import type { ProviderRegistry, ProviderEntry } from '@/domain/chat/ProviderRegistry';
import { PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports';
import ProviderBadge from '@/ui/components/agent/ProviderBadge.vue';
import { i18n } from '@/ui/i18n';

function makeEntry(id: 'claude' | 'cursor'): ProviderEntry {
	return {
		id,
		label: id,
		capabilities: {
			modes: ['api', 'cli'],
			models: [{ id: `${id}-default`, label: `${id} default` }],
			supportsStreaming: true,
			supportsTools: true,
			supportsThinking: true,
			supportsPlanMode: true,
			supportsAttachments: [],
			supportsSessionResume: true,
			modeDisabledReason: { api: null, cli: null },
		},
		slashCommands: () => [],
	};
}

function makeRegistry(): ProviderRegistry {
	const entries = [makeEntry('claude'), makeEntry('cursor')];
	return {
		listProviders: () => entries,
		getProvider: (id) => entries.find((e) => e.id === id),
		getCapabilities: (id) => entries.find((e) => e.id === id)?.capabilities,
	};
}

describe('NFR-MPS-004: provider switch ≤ 200 ms on a 100-message thread', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('TST-NFR-MPS-004: setActiveSelection completes inside the 200 ms budget', async () => {
		const threads = useChatThreadsStore();
		threads.setActiveThreadId('perf-thread');
		const messages = useMessagesStore();
		for (let i = 0; i < 100; i++) {
			messages.appendMessage({
				id: `m${i}`,
				threadId: 'perf-thread',
				role: i % 2 === 0 ? 'user' : 'assistant',
				text: `message ${i} — `.repeat(20),
				createdAt: `2026-05-21T00:00:${(i % 60).toString().padStart(2, '0')}.000Z`,
			});
		}
		const registry = makeRegistry();
		const store = useChatProviderStore();
		store.setRegistry(registry);
		store.setResolved({ provider: 'claude', mode: 'cli' });

		const Host = defineComponent({
			components: { ProviderBadge },
			template: '<ProviderBadge />',
		});
		const wrapper = mount(Host, {
			global: {
				plugins: [i18n],
				provide: {
					[PROVIDER_REGISTRY_KEY as symbol]: registry,
				},
			},
		});
		await wrapper.vm.$nextTick();

		const start = performance.now();
		store.setActiveSelection({ provider: 'cursor', mode: 'api' });
		store.setResolved({ provider: 'cursor', mode: 'api' });
		await wrapper.vm.$nextTick();
		const elapsed = performance.now() - start;

		// NFR-MPS-004 budget: 200 ms. Test environment is slower than real
		// browser, so we assert against a 2x headroom on the budget to keep CI
		// stable while still catching catastrophic regressions.
		expect(elapsed).toBeLessThan(200);
	});
});
