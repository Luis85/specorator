/**
 * T-MPS-122 — `chatProviderStore.setActiveSelection` validates against
 * `ProviderRegistry`. Invalid (provider, mode) pairs throw synchronously —
 * UI is expected to disable invalid affordances ahead of time.
 *
 * Satisfies REQ-MPS-006, REQ-MPS-007.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import type { ProviderRegistry, ProviderEntry } from '@/domain/chat/ProviderRegistry';
import type { ProviderId } from '@/domain/chat/ProviderSelection';

function makeEntry(id: ProviderId, modes: Array<'api' | 'cli'>): ProviderEntry {
	return {
		id,
		label: id,
		capabilities: {
			modes,
			models: [],
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

function makeRegistry(entries: ProviderEntry[]): ProviderRegistry {
	return {
		listProviders: () => entries,
		getProvider: (id) => entries.find((e) => e.id === id),
		getCapabilities: (id) => entries.find((e) => e.id === id)?.capabilities,
	};
}

describe('useChatProviderStore()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('starts with `{ forced: "auto" }` and `resolved: "degraded"`', () => {
		const store = useChatProviderStore();
		expect(store.activeSelection).toEqual({ forced: 'auto' });
		expect(store.resolved).toBe('degraded');
	});

	it('REQ-MPS-007: accepts a valid explicit selection backed by the registry', () => {
		const store = useChatProviderStore();
		const registry = makeRegistry([makeEntry('claude', ['api', 'cli'])]);
		store.setRegistry(registry);
		store.setActiveSelection({ provider: 'claude', mode: 'cli' });
		expect(store.activeSelection).toEqual({ provider: 'claude', mode: 'cli' });
	});

	it('REQ-MPS-007: rejects an unknown provider', () => {
		const store = useChatProviderStore();
		store.setRegistry(makeRegistry([makeEntry('claude', ['api', 'cli'])]));
		expect(() => {
			store.setActiveSelection({ provider: 'cursor', mode: 'api' });
		}).toThrow();
	});

	it('REQ-MPS-007: rejects a known provider with a mode it does not support', () => {
		const store = useChatProviderStore();
		// Claude exposes only api, not cli, in this fixture
		store.setRegistry(makeRegistry([makeEntry('claude', ['api'])]));
		expect(() => {
			store.setActiveSelection({ provider: 'claude', mode: 'cli' });
		}).toThrow();
	});

	it('REQ-MPS-007: accepts a forced selection even without a registry', () => {
		const store = useChatProviderStore();
		store.setActiveSelection({ forced: 'auto' });
		store.setActiveSelection({ forced: 'degraded' });
		expect(store.activeSelection).toEqual({ forced: 'degraded' });
	});

	it('setResolved updates the resolved flag', () => {
		const store = useChatProviderStore();
		store.setResolved({ provider: 'claude', mode: 'cli' });
		expect(store.resolved).toEqual({ provider: 'claude', mode: 'cli' });
	});
});
