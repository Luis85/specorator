/**
 * T-MPS-117, T-MPS-118 — `ModelSelector.vue` renders the active provider's
 * model list and hides itself when the list is empty.
 *
 * Satisfies REQ-MPS-040, REQ-MPS-041, TST-MPS-26.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ModelSelector from '@/ui/components/agent/ModelSelector.vue';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { i18n } from '@/ui/i18n';
import { PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports';
import type { ProviderRegistry, ProviderEntry } from '@/domain/chat/ProviderRegistry';
import { ModelSelectorPO } from './ModelSelector.po';

function makeEntry(models: Array<{ id: string; label: string }>): ProviderEntry {
	return {
		id: 'claude',
		label: 'Claude',
		capabilities: {
			modes: ['api', 'cli'],
			models,
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

function makeRegistry(entry: ProviderEntry): ProviderRegistry {
	return {
		listProviders: () => [entry],
		getProvider: (id) => (id === entry.id ? entry : undefined),
		getCapabilities: (id) => (id === entry.id ? entry.capabilities : undefined),
	};
}

function mountSelector(entry: ProviderEntry) {
	const wrapper = mount(ModelSelector, {
		global: {
			plugins: [i18n],
			provide: {
				[PROVIDER_REGISTRY_KEY as symbol]: makeRegistry(entry),
			},
		},
	});
	return { wrapper, po: new ModelSelectorPO(wrapper) };
}

describe('ModelSelector.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-040: lists the active provider models', async () => {
		const store = useChatProviderStore();
		store.setResolved({ provider: 'claude', mode: 'cli' });
		const entry = makeEntry([
			{ id: 'claude-sonnet-4', label: 'Sonnet 4' },
			{ id: 'claude-opus-4', label: 'Opus 4' },
		]);
		const { po, wrapper } = mountSelector(entry);
		await wrapper.vm.$nextTick();
		expect(po.root.exists()).toBe(true);
		const opts = po.options();
		expect(opts.map((o) => o.value)).toEqual(['claude-sonnet-4', 'claude-opus-4']);
	});

	it('REQ-MPS-041, TST-MPS-26: hides itself when the model list is empty', async () => {
		const store = useChatProviderStore();
		store.setResolved({ provider: 'claude', mode: 'cli' });
		const { po, wrapper } = mountSelector(makeEntry([]));
		await wrapper.vm.$nextTick();
		expect(po.root.exists()).toBe(false);
	});

	it('G4.1: select trigger carries brand-emphasis class for the active model name', async () => {
		const store = useChatProviderStore();
		store.setResolved({ provider: 'claude', mode: 'cli' });
		const entry = makeEntry([{ id: 'claude-opus-4-7', label: 'Opus 4.7' }]);
		const { po, wrapper } = mountSelector(entry);
		await wrapper.vm.$nextTick();
		expect(po.selectClasses()).toContain('sp-model-selector__select--brand');
	});

	it('REQ-MPS-041: hides itself when no explicit provider is resolved', async () => {
		const store = useChatProviderStore();
		store.setResolved('degraded');
		const { po, wrapper } = mountSelector(makeEntry([{ id: 'm1', label: 'M1' }]));
		await wrapper.vm.$nextTick();
		expect(po.root.exists()).toBe(false);
	});
});
