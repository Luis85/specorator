/**
 * Tests for `<ProviderBadge>` after the WS-AUX-6 microcopy refresh
 * (T-AUX-275..277, REQ-AUX-016).
 *
 * - Renders the resolved provider/mode using the `agent.provider.*` copy
 *   table (`Claude · CLI`, `Codex · API`, …) — never the raw `claude/cli`
 *   string.
 * - Unknown ids fall back to a title-cased humanisation (`Unknown · Thing`).
 * - Root carries `data-provider="<provider>"` for token / theme parity.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

import ProviderBadge from '@/ui/components/agent/ProviderBadge.vue';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { ProviderBadgePageObject } from './ProviderBadge.po';
import { PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports';
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry';
import { i18n } from '@/ui/i18n';

const emptyRegistry: ProviderRegistry = {
	listProviders: () => [],
	getProvider: () => undefined,
	getCapabilities: () => undefined,
};

function mountBadge() {
	return mount(ProviderBadge, {
		global: {
			plugins: [i18n],
			provide: {
				[PROVIDER_REGISTRY_KEY as symbol]: emptyRegistry,
			},
		},
		attachTo: document.body,
	});
}

describe('<ProviderBadge>', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('T-AUX-275: explicit claude/cli renders as "Claude · CLI"', async () => {
		const store = useChatProviderStore();
		store.setResolved({ provider: 'claude', mode: 'cli' });

		const wrapper = mountBadge();
		await wrapper.vm.$nextTick();
		const po = new ProviderBadgePageObject(wrapper);
		expect(po.labelText()).toBe('Claude · CLI');
		expect(po.provider()).toBe('claude');
	});

	it('T-AUX-275: codex/api renders as "Codex · API"', async () => {
		const store = useChatProviderStore();
		store.setResolved({ provider: 'codex' as never, mode: 'api' });

		const wrapper = mountBadge();
		await wrapper.vm.$nextTick();
		const po = new ProviderBadgePageObject(wrapper);
		expect(po.labelText()).toBe('Codex · API');
		expect(po.provider()).toBe('codex');
	});

	it('T-AUX-275: unknown provider falls back to title-cased humanisation', async () => {
		const store = useChatProviderStore();
		store.setResolved({ provider: 'unknown-thing' as never, mode: 'api' });

		const wrapper = mountBadge();
		await wrapper.vm.$nextTick();
		const po = new ProviderBadgePageObject(wrapper);
		expect(po.labelText()).toBe('Unknown Thing · API');
	});

	it('degraded resolution shows "degraded" with no data-provider', async () => {
		const store = useChatProviderStore();
		store.setResolved('degraded');

		const wrapper = mountBadge();
		await wrapper.vm.$nextTick();
		const po = new ProviderBadgePageObject(wrapper);
		expect(po.labelText().toLowerCase()).toContain('degraded');
		expect(po.provider()).toBeNull();
	});
});
