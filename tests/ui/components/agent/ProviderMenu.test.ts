/**
 * T-MPS-121 — `ProviderMenu.vue` disabled rows carry `aria-disabled` and a
 * tooltip with the reason from `ProviderCapabilities.modeDisabledReason`.
 *
 * Satisfies Design §A1 Flow 1 step 7, NFR-MPS-009.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ProviderMenu from '@/ui/components/agent/ProviderMenu.vue';
import { i18n } from '@/ui/i18n';
import { PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports';
import type { ProviderRegistry, ProviderEntry } from '@/domain/chat/ProviderRegistry';
import type { ProviderId } from '@/domain/chat/ProviderSelection';
import { ProviderMenuPO } from './ProviderMenu.po';

function entry(
	id: ProviderId,
	label: string,
	modes: Array<'api' | 'cli'>,
	disabledReasons: Record<'api' | 'cli', string | null> = { api: null, cli: null },
): ProviderEntry {
	return {
		id,
		label,
		capabilities: {
			modes,
			models: [],
			supportsStreaming: true,
			supportsTools: true,
			supportsThinking: true,
			supportsPlanMode: true,
			supportsAttachments: [],
			supportsSessionResume: true,
			modeDisabledReason: disabledReasons,
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

function mountMenu(entries: ProviderEntry[]) {
	const wrapper = mount(ProviderMenu, {
		global: {
			plugins: [i18n],
			provide: {
				[PROVIDER_REGISTRY_KEY as symbol]: makeRegistry(entries),
			},
		},
	});
	return { wrapper, po: new ProviderMenuPO(wrapper) };
}

describe('ProviderMenu.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders one row per (provider, mode)', () => {
		const { po } = mountMenu([
			entry('claude', 'Claude', ['api', 'cli']),
			entry('cursor', 'Cursor', ['api']),
		]);
		expect(po.root.exists()).toBe(true);
		expect(po.item('claude', 'api').exists()).toBe(true);
		expect(po.item('claude', 'cli').exists()).toBe(true);
		expect(po.item('cursor', 'api').exists()).toBe(true);
	});

	it('Flow 1 step 7: rows with a `modeDisabledReason` get aria-disabled+title', () => {
		const { po } = mountMenu([
			entry(
				'cursor',
				'Cursor',
				['api', 'cli'],
				{ api: 'Preview disabled', cli: null },
			),
		]);
		expect(po.itemAriaDisabled('cursor', 'api')).toBe('true');
		expect(po.itemTitle('cursor', 'api')).toBe('Preview disabled');
		expect(po.itemAriaDisabled('cursor', 'cli')).toBe('false');
	});
});
